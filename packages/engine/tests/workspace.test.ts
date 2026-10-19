import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { envRecordPath } from "../src/environment.ts";
import { writeJson } from "../src/fs.ts";
import {
  acceptMail,
  loadRegistry,
  mailContext,
  markRead,
  registerProject,
  send,
  syncMail,
} from "../src/mail.ts";
import { pathsFor, registryPath } from "../src/paths.ts";
import { loadPolicy } from "../src/policy.ts";
import { addQuestion, answerQuestion } from "../src/questions.ts";
import { createWork, saveWork } from "../src/work.ts";
import { projectThreads, workspaceStatus } from "../src/workspace.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

/** A project of the workspace, registered as a session would; `hook` makes it live. */
function project(
  env: NodeJS.ProcessEnv,
  name: string,
  workspace: string | null,
  hook: boolean,
  extra: Record<string, unknown> = {},
  root = makeRepo({ "README.md": `# ${name}\n` }),
) {
  // The folder itself, never a parent found by walking up: a registered root is what the registry holds.
  const paths = pathsFor(root, repoPaths(root, env).userDir);
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({ mail: { ...(workspace ? { workspace } : {}), name, ...extra } }),
  );
  const policy = loadPolicy(paths).policy;
  const ctx = mailContext(paths, policy, env);
  registerProject(ctx, `session-${name}`, { hook });
  return { root, paths, policy, ctx };
}

test("SP7b-T6 AC-1, SP3-T4 AC-3: the workspace status lists every project of the workspace from the records alone: live, open items, unread, open threads, unconfirmed priorities, the environment; a gone root and a worktree are told apart; no workspace says so", () => {
  const env = testEnv();
  const storefront = project(env, "storefront", "shop", true);
  const crm = project(env, "crm", "shop", false, {
    accept: ["question", "notice", "change-request"],
  });
  // A removed root inside a git-initialised parent that holds its own open item: resolved upward,
  // the parent's records would read as the project's; the status must say gone instead.
  const parent = makeRepo({ "README.md": "# parent\n" });
  const parentPaths = repoPaths(parent, env);
  saveWork(parentPaths, createWork(parentPaths, "the parent's item"));
  const sub = join(parent, "warehouse");
  mkdirSync(sub);
  project(env, "warehouse", "shop", false, {}, sub);
  rmSync(sub, { recursive: true, force: true });
  // A worktree of storefront is a task's checkout, not a project of the workspace.
  const registry = loadRegistry(storefront.paths.userDir);
  writeJson(registryPath(storefront.paths.userDir), {
    version: 1,
    projects: [
      ...registry.projects,
      {
        root: join(storefront.root, "..", "storefront-wt"),
        name: "storefront",
        workspace: "shop",
        lastSeen: "2026-10-18T10:00:00.000Z",
        sessionId: "wt",
        worktreeOf: storefront.root,
      },
    ],
  });
  // The open item's two open questions and one answered count 2; a done item's open question is not
  // counted; a record with no questions field (before 0.8.0) counts 0.
  const openItem = createWork(storefront.paths, "an open item");
  addQuestion(openItem, "one?", []);
  addQuestion(openItem, "two?", []);
  addQuestion(openItem, "three?", []);
  answerQuestion(openItem, "Q-3", "yes", "the user");
  saveWork(storefront.paths, openItem);
  const doneItem = createWork(storefront.paths, "a done item");
  addQuestion(doneItem, "late?", []);
  doneItem.phase = "deliver";
  saveWork(storefront.paths, doneItem);
  const sent = send(
    storefront.ctx,
    {
      to: "crm",
      type: "change-request",
      priority: "high",
      subject: "loyalty_tier",
      text: "Add the tier",
    },
    null,
  );
  if ("refused" in sent) throw new Error(sent.refused);
  writeJson(envRecordPath(storefront.paths), {
    pid: null,
    processStart: null,
    startedAt: "2026-10-18T10:00:00.000Z",
    managed: false,
    log: null,
    command: "x",
  });
  const gone = spawnSync("sh", ["-c", "exit 0"]);
  writeJson(envRecordPath(crm.paths), {
    pid: gone.pid,
    processStart: "gone",
    startedAt: "2026-10-18T10:00:00.000Z",
    managed: true,
    log: null,
    command: "x",
  });
  const status = workspaceStatus(storefront.paths, storefront.policy, env);
  if ("none" in status) throw new Error(status.none);
  expect(status.workspace).toBe("shop");
  expect(status.projects.map((p) => p.name)).toEqual(["crm", "storefront", "warehouse"]);
  expect(status.projects[0]).toMatchObject({
    name: "crm",
    root: crm.paths.root,
    live: false,
    gone: false,
    items: 0,
    unread: 1,
    threads: 1,
    priorities: 1,
    questions: 0,
    environment: "down",
  });
  expect(status.projects[1]).toMatchObject({
    name: "storefront",
    live: true,
    gone: false,
    items: 1,
    unread: 0,
    threads: 1,
    priorities: 1,
    questions: 2,
    environment: "up",
  });
  expect(status.projects[2]).toMatchObject({
    name: "warehouse",
    live: false,
    gone: true,
    items: 0,
    unread: 0,
    threads: 0,
    priorities: 0,
    questions: 0,
    environment: "none",
  });
  // The receiver confirms the priority: nothing unconfirmed on its side, and the sender sees it at its next sync.
  const accepted = acceptMail(crm.ctx, sent.message.id, { by: "session" }, []);
  if ("refused" in accepted) throw new Error(accepted.refused);
  syncMail(storefront.ctx, storefront.paths);
  const after = workspaceStatus(crm.paths, crm.policy, env);
  if ("none" in after) throw new Error(after.none);
  expect(after.projects.map((p) => [p.name, p.priorities, p.threads])).toEqual([
    ["crm", 0, 1],
    ["storefront", 0, 1],
    ["warehouse", 0, 0],
  ]);
  // A notice read at the receiver is done: its thread is closed on both sides and counts for nothing.
  const notice = send(
    storefront.ctx,
    { to: "crm", type: "notice", subject: "deploy", text: "Deployed 1.2" },
    null,
  );
  if ("refused" in notice) throw new Error(notice.refused);
  const read = markRead(crm.ctx, notice.message.id, []);
  if ("refused" in read) throw new Error(read.refused);
  syncMail(storefront.ctx, storefront.paths);
  for (const ctx of [crm.ctx, storefront.ctx]) {
    const threads = projectThreads(ctx);
    expect(threads.find((t) => t.root === notice.message.id)).toMatchObject({
      open: false,
      unread: 0,
      messages: 1,
    });
    expect(threads.filter((t) => t.open).map((t) => t.root)).toEqual([sent.message.id]);
  }
  const closed = workspaceStatus(crm.paths, crm.policy, env);
  if ("none" in closed) throw new Error(closed.none);
  expect(closed.projects.map((p) => p.threads)).toEqual([1, 1, 0]);
  // A notice has no priority decision to wait for (it is done when read): it counts as unconfirmed nowhere.
  expect(closed.projects.map((p) => p.priorities)).toEqual([0, 0, 0]);
  const alone = project(env, "alone", null, false);
  expect(workspaceStatus(alone.paths, alone.policy, env)).toEqual({
    none: "no workspace in policy.json (mail.workspace): crew workspace status lists the projects of one workspace",
  });
});
