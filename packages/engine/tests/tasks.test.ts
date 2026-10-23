import { beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type CliIo, main } from "../src/cli.ts";
import { detectProfile } from "../src/detect/index.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { scopeHash } from "../src/judgement.ts";
import {
  loadItemMail,
  loadRegistry,
  mailbox,
  mailContext,
  ownInbox,
  readBox,
  recordInItem,
  tamperedBox,
} from "../src/mail.ts";
import { isAlive, readOutcome } from "../src/open.ts";
import { openedMarkerFile, writeOpenedMarker } from "../src/opened.ts";
import { loadPolicy } from "../src/policy.ts";
import { scopeRefusal, shortId, taskNames, taskScope, taskText, writeBrief } from "../src/tasks.ts";
import type { Message, TaskRecord } from "../src/types.ts";
import { createWork, loadWork, saveWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const FAKE = fileURLToPath(new URL("./fixtures/fake-claude.sh", import.meta.url));

function io(cwd: string, env: NodeJS.ProcessEnv) {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    stdin: async () => "",
    env,
    cwd,
  };
  const run = async (...argv: string[]) => {
    out.length = 0;
    err.length = 0;
    const code = await main(argv, cli);
    return { code, out: out.join(""), err: err.join("") };
  };
  const json = async (...argv: string[]) => {
    const r = await run(...argv, "--json");
    return { code: r.code, data: JSON.parse(r.out) as Record<string, unknown> };
  };
  return { run, json };
}

const answers = JSON.stringify({
  work_type: "feature",
  is_vague: 0.1,
  scope: 1,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

/** Polls a condition with a deadline, yielding to the event loop so a detached child is reaped between looks. */
async function waitFor(what: string, cond: () => boolean, ms = 8000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  if (!cond()) throw new Error(`timed out waiting for ${what}`);
}

/** The fake opener's record of what it saw, once it is in place. */
async function recorded(file: string): Promise<string> {
  await waitFor(`the record ${file}`, () => existsSync(file));
  return readFileSync(file, "utf8");
}

/** The arguments the fake was called with: between `argv=` and the record separator, split on the unit separator (a prompt may hold newlines). */
function argvOf(record: string): string[] {
  const start = record.indexOf("argv=") + 5;
  const end = record.indexOf("\x1e", start);
  return record.slice(start, end).split("\x1f").slice(0, -1);
}

interface LeadOptions {
  mail?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  env?: Record<string, string>;
}

/** A lead item in the plan phase with a plan.md naming three tasks. */
async function lead(options: LeadOptions = {}) {
  const env: NodeJS.ProcessEnv = { ...testEnv(), WIZARDINGCODE_CREW_CLAUDE: FAKE, ...options.env };
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "a",
    "src/b.ts": "b",
    ".crew/policy.json": JSON.stringify({
      mail: { workspace: "w", name: "lead", ...options.mail },
      ...options.policy,
    }),
  });
  const c = io(root, env);
  await c.run("detect");
  const id = (
    await c.json(
      "start",
      "Two files",
      "--answers",
      answers,
      "--criterion",
      "a.ts says A",
      "--criterion",
      "b.ts says B",
    )
  ).data.id as string;
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 a\n- AC-2 b\n");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\nnone\n\n## Decisions only the user can make\nnone\n\n## Proposals\nnone\n\n## Warnings\nnone\n",
  );
  await c.run("phase", id, "next");
  await c.run("phase", id, "next");
  await c.run("approve", id, "spec", "--validator", "complete-gap-round");
  await c.run("phase", id, "next");
  // SP7a: the mandatory leads validate the spec before the plan opens.
  for (const lead of ["lead-qa", "lead-security"]) {
    write(
      root,
      `.crew/work/${id}/conclave/${lead}.md`,
      `# ${lead.slice(5)} lead's validation of ${id}: spec\nverdict: validated\n## Returns\n- none\n## Notes\n- holds\n`,
    );
    const recorded = await c.run(
      "validation",
      id,
      "record",
      "--what",
      "spec",
      "--by",
      lead,
      "--file",
      `.crew/work/${id}/conclave/${lead}.md`,
    );
    if (recorded.code !== 0) throw new Error(recorded.err);
  }
  const planned = await c.run("phase", id, "next");
  if (planned.code !== 0) throw new Error(planned.err);
  write(
    root,
    `.crew/work/${id}/plan.md`,
    "# Plan: Two files\n\n1. AC-1: make src/a.ts export A; red then green.\n2. AC-2: make src/b.ts export B;\n   red then green.\n3. Gates: crew gate run.\n",
  );
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "lead: spec, conclave, plan");
  const short = shortId(id);
  const worktreeOf = (task: string) => join(root, "..", `${basename(root)}-${short}-${task}`);
  /** Opens a task through the CLI and returns its message id, worktree and the implementer's pid. */
  const open = async (task: string, criteria: string, text?: string) => {
    const r = await c.json(
      "task",
      id,
      "open",
      task,
      "--criteria",
      criteria,
      ...(text ? ["--text", text] : []),
    );
    if (r.code !== 0) throw new Error(`task open ${task}: ${String(r.data.message)}`);
    const message = (r.data.message as { id: string }).id;
    const opened = r.data.opened as { pid?: number; log?: string };
    return { message, worktree: worktreeOf(task), pid: opened.pid ?? 0, log: opened.log ?? "" };
  };
  /** Waits for a task's implementer (the fake) to have printed its result and gone. */
  const ended = async (task: { pid: number; log: string }) => {
    await waitFor(
      `the implementer ${task.pid} to end`,
      () => readOutcome(task.log).ended && !isAlive(task.pid),
    );
  };
  /**
   * The implementer's part, as the opened session would do it: a child item started with --origin,
   * a change committed on the branch, and the reply naming the branch and the child.
   */
  const childReplies = async (
    task: string,
    message: string,
    worktree: string,
    change: { file: string; text: string } = { file: "src/b.ts", text: "export const B = 1;\n" },
    replyItem?: string,
  ) => {
    const childEnv: NodeJS.ProcessEnv = {
      ...env,
      WIZARDINGCODE_CREW_MAIL_ID: message,
      WIZARDINGCODE_CREW_MAIL_AGENT: task,
      WIZARDINGCODE_CREW_MAIL_HOPS: "1",
      WIZARDINGCODE_CREW_MAIL_BRANCH: `crew/${short}/${task}`,
      WIZARDINGCODE_CREW_MAIL_MODE: "branch",
      CLAUDE_CODE_SESSION_ATTENDED: "0",
    };
    const w = io(worktree, childEnv);
    const started = await w.json(
      "start",
      `${task} of the lead: ${change.file}`,
      "--answers",
      JSON.stringify({ ...JSON.parse(answers), scope: 0 }),
      "--origin",
      message,
      "--criterion",
      `${change.file} says it`,
    );
    const childId = started.data.id as string;
    write(worktree, change.file, change.text);
    git(worktree, "add", "-A");
    git(worktree, "commit", "-q", "-m", `${task}: change`);
    const replied = await w.run(
      "mail",
      "reply",
      message,
      "Built",
      "--branch",
      `crew/${short}/${task}`,
      "--item",
      replyItem ?? childId,
    );
    if (replied.code !== 0) throw new Error(`reply of ${task}: ${replied.err}`);
    return { childId, childEnv, w };
  };
  /** The child's evidence in its worktree set proven, through the engine's own writer, and committed. */
  const proveChild = (worktree: string, childEnv: NodeJS.ProcessEnv, childId: string) => {
    const wp = repoPaths(worktree, childEnv);
    const ev = loadEvidence(wp, childId).evidence;
    ev.verdict = "proven";
    ev.unproven = [];
    saveEvidence(wp, childId, ev);
    git(worktree, "add", "-A");
    git(worktree, "commit", "-q", "--allow-empty", "-m", `${childId}: evidence`);
  };
  return { env, root, c, id, short, worktreeOf, open, ended, childReplies, proveChild };
}

// One lead for the four parts, which run in order on it: each part starts from the state the part
// before it left, so a part run alone under a -t filter is not supported.
describe("SP7a AC-3 (Task 6): a todo's gate runs the gates its diff touches, bounded by the cap; the brief is written from the records; an inline todo takes a scope; a gone merge commit refuses", () => {
  let ctx: Awaited<ReturnType<typeof lead>>;
  beforeAll(async () => {
    ctx = await lead({ mail: { maxConcurrent: 10 } });
  }, 30_000);
  /** `crew task note` on the lead's item. */
  const note = (task: string, ...flags: string[]) =>
    ctx.c.run("task", ctx.id, "note", task, ...flags);

  test("part 1: the gate and the brief, from the lead set up with no task open", async () => {
    const { env, root, c, id, open, childReplies, proveChild, ended } = ctx;
    const t2 = await open("T-2", "AC-2");
    expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.state).toBe("handed");
    const c2 = await childReplies("T-2", t2.message, t2.worktree);
    proveChild(t2.worktree, c2.childEnv, c2.childId);
    await ended(t2);
    // Before the merge, no gate: the todo's files are not in this checkout yet.
    expect((await c.run("task", id, "gate", "T-2")).err.trim()).toBe(
      "T-2 is not merged yet (crew task <id> merge T-2)",
    );
    const merged = await c.json("task", id, "merge", "T-2");
    if (merged.code !== 0) throw new Error(String(merged.data.message));
    expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.state).toBe("merged");
    // The profile's scoped template narrows the todo's test command to its files.
    const template = `node -e "process.exit(process.argv[1].includes('fail') ? 1 : 0)" {files}`;
    expect((await c.run("profile", "set", "testScoped", template)).code).toBe(0);
    // Before the gate, no brief.
    expect((await c.run("task", id, "brief", "T-2")).err.trim()).toBe(
      "T-2 has no passing gate yet (crew task <id> gate T-2)",
    );
    const gated = await c.json("task", id, "gate", "T-2");
    expect(gated.code).toBe(0);
    expect(gated.data.gate).toMatchObject({ round: 1, status: "pass", scope: ["src/b.ts"] });
    const runs = (
      gated.data.gate as { runs: { gate: string; command: string | null; status: string }[] }
    ).runs;
    expect(runs.map((r) => r.gate)).toEqual(["test"]);
    // The command that ran is the template over the todo's file, not the target's whole test command.
    expect(runs[0]).toMatchObject({
      command: template.replace("{files}", "src/b.ts"),
      status: "pass",
    });
    expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.state).toBe("gated");
    // The todo's runs are the todo's: the item's evidence keeps none of them.
    expect(loadEvidence(repoPaths(root, env), id).evidence.runs).toEqual([]);
    const brief = await c.run("task", id, "brief", "T-2");
    expect(brief.code).toBe(0);
    expect(brief.out).toContain(`# Brief: T-2 of ${id}`);
    expect(brief.out).toContain("## Changed\n- src/b.ts");
    expect(brief.out).toContain("## Proven\n- test (.): pass");
    const mergeCommit = loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.mergeCommit ?? "";
    expect(brief.out).toContain(
      `\n- AC-2: proven by T-2 (child ${c2.childId}, merged ${mergeCommit.slice(0, 7)})\n`,
    );
    expect(brief.out).toContain("## Left\n- none");
    expect(existsSync(join(root, ".crew", "work", id, "tasks", "T-2.brief.md"))).toBe(true);
    expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]).toMatchObject({
      state: "briefed",
      brief: "tasks/T-2.brief.md",
    });
    // A delivery validation a lead returned is what the brief leaves open; the spec's validated ones are not listed.
    write(
      root,
      `.crew/work/${id}/conclave/lead-qa.delivery.md`,
      `# qa lead's validation of ${id}: delivery\nverdict: returned\n## Returns\n- R-1 · src/b.ts:1 · B is a number, the plan says a string\n## Notes\n- none\n`,
    );
    const returned = await c.run(
      "validation",
      id,
      "record",
      "--what",
      "delivery",
      "--by",
      "lead-qa",
      "--file",
      `.crew/work/${id}/conclave/lead-qa.delivery.md`,
    );
    if (returned.code !== 0) throw new Error(returned.err);
    const rebriefed = (await c.run("task", id, "brief", "T-2")).out;
    expect(rebriefed.split("## Left\n")[1]?.trim()).toBe(
      "- lead-qa returned 1 return (conclave/lead-qa.delivery.md)",
    );
    // A second gate run is round 2, here with --scope standing in for the merge commit's diff; a third
    // is refused until the user continues.
    expect(
      (await c.json("task", id, "gate", "T-2", "--scope", "src/a.ts")).data.gate,
    ).toMatchObject({
      round: 2,
      scope: ["src/a.ts"],
    });
    expect((await c.run("task", id, "gate", "T-2")).err.trim()).toBe(
      `gate round 3 of T-2: the policy allows 2 (team.maxGateRounds); the user continues it once with crew continue ${id} gate T-2, or decides`,
    );
    expect((await c.run("continue", id, "gate", "T-2")).code).toBe(0);
    expect((await c.json("task", id, "gate", "T-2")).data.gate).toMatchObject({ round: 3 });
  }, 30_000);

  test("part 2: inline todos and scope refusals, from T-2 merged and gated at round 3 after the crew continue, with the brief and lead-qa's returned validation recorded", async () => {
    const { env, root, c, id } = ctx;
    // An inline todo: no worktree, a declared scope.
    expect((await note("T-5", "--criteria", "AC-1", "--scope", "src/a.ts")).err.trim()).toBe(
      'plan.md names no task T-5; give its text with --text "<todo>"',
    );
    expect((await note("T-7", "--criteria", "AC-1", "--text", "no scope")).err.trim()).toBe(
      "a scope names at least one file (--scope <path>[,<path>])",
    );
    // A scope path stays inside the repository: no absolute path, no `..`, no newline (the security
    // lead's return R-2 of SP7a Task 6).
    for (const bad of ["../x.ts", "/tmp/x.ts", "src/../../x.ts", "src/a\nb.ts"]) {
      const escaped = await note("T-8", "--criteria", "AC-1", "--scope", bad, "--text", "escapes");
      expect(escaped.err.trim()).toBe(
        `a scope path stays inside the repository: ${JSON.stringify(bad)}`,
      );
    }
    const noted = await note(
      "T-5",
      "--criteria",
      "AC-1",
      "--scope",
      "src/a.ts",
      "--text",
      "AC-1 inline",
    );
    expect(noted.out.trim()).toBe("T-5 noted: inline, AC-1, scope src/a.ts");
    expect(
      (
        await note("T-5", "--criteria", "AC-1", "--scope", "src/a.ts", "--text", "again")
      ).err.trim(),
    ).toBe("T-5 is already a task of this item");
    expect(
      (await note("T-6", "--criteria", "AC-9", "--scope", "src/a.ts", "--text", "x")).err.trim(),
    ).toBe("unknown criterion: AC-9");
    write(root, "src/a.ts", "export const A = 2;\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "T-5");
    expect((await c.json("task", id, "gate", "T-5")).data.gate).toMatchObject({
      status: "pass",
      scope: ["src/a.ts"],
    });
    // The flag's scope stands in for the recorded one.
    expect(
      (await c.json("task", id, "gate", "T-5", "--scope", "src/b.ts")).data.gate,
    ).toMatchObject({
      round: 2,
      status: "pass",
      scope: ["src/b.ts"],
    });
    // A flag's path outside the repository is refused before any round is spent.
    expect((await c.run("task", id, "gate", "T-5", "--scope", "../x.ts")).err.trim()).toBe(
      'a scope path stays inside the repository: "../x.ts"',
    );
    expect(
      loadWork(repoPaths(root, env), id).work?.tasks?.find((t) => t.task === "T-5")?.gate,
    ).toMatchObject({ round: 2 });
  }, 30_000);

  test("part 3: a failing gate, from the inline todos opened and refused", async () => {
    const { env, root, c, id } = ctx;
    // A todo whose scoped test fails: the gate says so, the state stays merged, no brief is written.
    write(root, "src/fail.ts", "export const F = 1;\n");
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "T-6");
    const sixth = await note(
      "T-6",
      "--criteria",
      "AC-1",
      "--scope",
      "src/fail.ts",
      "--text",
      "fails",
    );
    expect(sixth.code).toBe(0);
    const failed = await c.run("task", id, "gate", "T-6");
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("  test (.): fail in ");
    expect(failed.out).toContain("T-6 gate round 1: fail");
    expect(
      loadWork(repoPaths(root, env), id).work?.tasks?.find((t) => t.task === "T-6"),
    ).toMatchObject({
      state: "merged",
      gate: { round: 1, status: "fail", scope: ["src/fail.ts"] },
    });
    expect((await c.run("task", id, "brief", "T-6")).err.trim()).toBe(
      "T-6 has no passing gate yet (crew task <id> gate T-6)",
    );
    const listed = (await c.run("task", id, "list")).out;
    expect(listed).toContain("T-5 · AC-1 · inline · gated");
    expect(listed).toContain("T-6 · AC-1 · inline · merged");
    expect(listed).toMatch(/T-2 · AC-2 · [^\n]* · briefed/);
  }, 30_000);

  test("part 4: a gone merge commit and the Gate column, from T-6's failing gate", async () => {
    const { env, root, c, id } = ctx;
    const mergeCommit = loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.mergeCommit ?? "";
    // The merge commit of T-2 rewritten away (the history squashed over it, the tree untouched): the
    // gate refuses and records nothing.
    const before = git(root, "rev-parse", "HEAD").trim();
    git(root, "reset", "-q", "--soft", `${mergeCommit}^1`);
    git(root, "commit", "-q", "-m", "squashed over the merge of T-2");
    const gone = await c.run("task", id, "gate", "T-2");
    expect(gone.code).toBe(1);
    expect(gone.err.trim()).toMatch(
      /^merge commit [0-9a-f]{7} of T-2 is not in this checkout's history; restore it or note the todo again$/,
    );
    git(root, "reset", "-q", "--soft", before);
    expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.gate).toMatchObject({ round: 3 });
    const report = (await c.run("evidence", id)).out;
    expect(report).toContain(
      "| Task | Criteria | Branch | Child | Verdict | Merged | Report | State | Gate |",
    );
    expect(report).toMatch(/\| T-2 \| AC-2 \|[^\n]*\| briefed \| pass \(round 3\) \|/);
    expect(report).toMatch(/\| T-5 \| AC-1 \|[^\n]*\| gated \| pass \(round 2\) \|/);
    expect(report).toMatch(/\| T-6 \| AC-1 \|[^\n]*\| merged \| fail \(round 1\) \|/);
  }, 30_000);
});

test("SP2c: the short id, the names and the task text", () => {
  expect(shortId("2026-10-15-042-loyalty-tier-on-checkout")).toBe("2026-10-15-042");
  expect(taskNames("2026-10-15-042-x", "/w/storefront", "T-2", "..")).toEqual({
    branch: "crew/2026-10-15-042/T-2",
    worktree: "/w/storefront-2026-10-15-042-T-2",
  });
  expect(taskNames("2026-10-15-042-x", "/w/storefront", "T-2", ".crew/worktrees")).toEqual({
    branch: "crew/2026-10-15-042/T-2",
    worktree: "/w/storefront/.crew/worktrees/storefront-2026-10-15-042-T-2",
  });
  const plan =
    "# Plan\n\n1. AC-1: a.\n2. AC-2: b;\n   continued.\n3. Gates.\n\n### T-4\nA headed task.\n";
  expect(taskText(plan, "T-2")).toBe("AC-2: b;\ncontinued.");
  expect(taskText(plan, "T-4")).toBe("A headed task.");
  expect(taskText(plan, "T-9")).toBeNull();
  expect(taskText(null, "T-1")).toBeNull();
});

test("SP2c AC-3: crew task open refuses what it must, then makes the worktree, the branch, the message, the record and the implementer", async () => {
  const record = join(tempDir("crew-rec-"), "rec.txt");
  const { env, root, c, id, short, worktreeOf, ended } = await lead({
    env: { FAKE_CLAUDE_RECORD: record },
  });
  write(root, "src/a.ts", "dirty");
  expect((await c.run("task", id, "open", "T-2", "--criteria", "AC-2")).err.trim()).toBe(
    "uncommitted changes in src/a.ts; commit what the implementer must see, then open the task",
  );
  git(root, "checkout", "-q", "--", "src/a.ts");
  expect((await c.run("task", id, "open", "T-9", "--criteria", "AC-2")).err.trim()).toBe(
    'plan.md names no task T-9; give its text with --text "<task>"',
  );
  expect((await c.run("task", id, "open", "T-2", "--criteria", "AC-7")).err.trim()).toBe(
    "unknown criterion: AC-7",
  );
  expect((await c.run("task", id, "open", "T-2")).err.trim()).toBe(
    'usage: crew task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"] | note T-n --criteria AC-k --scope <path>[,<path>] [--text "<todo>"] | list | merge T-n [--force] | drop T-n | gate T-n [--scope <path>[,<path>]] | brief T-n',
  );
  expect((await c.run("task", id, "open", "t2", "--criteria", "AC-2")).err.trim()).toBe(
    "a task is named T-n, not t2",
  );
  // The worktree's folder or the branch already there: refused before anything is written.
  mkdirSync(worktreeOf("T-1"));
  expect((await c.run("task", id, "open", "T-1", "--criteria", "AC-1")).err.trim()).toBe(
    `${worktreeOf("T-1")} exists; remove it or pick another task number`,
  );
  rmdirSync(worktreeOf("T-1"));
  git(root, "branch", `crew/${short}/T-3`);
  expect(
    (await c.run("task", id, "open", "T-3", "--criteria", "AC-1", "--text", "gates")).err.trim(),
  ).toBe(`branch crew/${short}/T-3 exists; delete it or pick another task number`);
  // Outside a commit there is nothing to branch from: a repository with no commit, and a folder that is no repository.
  const fresh = tempDir();
  git(fresh, "init", "-q", "-b", "main");
  write(fresh, "package.json", JSON.stringify({ scripts: { test: "exit 0" } }));
  write(fresh, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "fresh" } }));
  const f = io(fresh, env);
  await f.run("detect");
  const freshId = (await f.json("start", "x", "--answers", answers, "--criterion", "x")).data
    .id as string;
  expect((await f.run("task", freshId, "open", "T-1", "--criteria", "AC-1")).err.trim()).toBe(
    "a task needs a git repository with a commit to branch from",
  );
  const plain = tempDir();
  write(plain, "package.json", JSON.stringify({ scripts: { test: "exit 0" } }));
  write(plain, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "plain" } }));
  const p = io(plain, env);
  await p.run("detect");
  const plainId = (await p.json("start", "x", "--answers", answers, "--criterion", "x")).data
    .id as string;
  expect((await p.run("task", plainId, "open", "T-1", "--criteria", "AC-1")).err.trim()).toBe(
    "a task needs a git repository with a commit to branch from",
  );
  // The task opened: the worktree on the branch from HEAD, the message to T-2, the record, the implementer.
  const opened = await c.json("task", id, "open", "T-2", "--criteria", "AC-2");
  expect(opened.code).toBe(0);
  const worktree = worktreeOf("T-2");
  expect(opened.data).toMatchObject({
    task: {
      task: "T-2",
      criteria: ["AC-2"],
      branch: `crew/${short}/T-2`,
      worktree,
      text: "AC-2: make src/b.ts export B;\nred then green.",
    },
  });
  expect(existsSync(join(worktree, "src", "b.ts"))).toBe(true);
  expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(`crew/${short}/T-2`);
  // The branch starts at the lead's HEAD.
  expect(git(worktree, "rev-parse", "HEAD")).toBe(git(root, "rev-parse", "HEAD"));
  const message = opened.data.message as { id: string; to: { agent: string }; type: string };
  expect(message).toMatchObject({ type: "change-request", to: { agent: "T-2" } });
  const work = loadWork(repoPaths(root, env), id).work;
  expect(work?.tasks).toMatchObject([
    { task: "T-2", message: message.id, openedAt: expect.any(String) },
  ]);
  // The implementer, as the fake saw it: in the worktree, as T-2, on the pinned branch, with the
  // prompt built from the brief, the task, the criteria, the parent and the message.
  const seen = await recorded(record);
  expect(seen).toContain(`cwd=${worktree}\n`);
  expect(seen).toContain(`WIZARDINGCODE_CREW_MAIL_ID=${message.id}\n`);
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_AGENT=T-2\n");
  expect(seen).toContain(`WIZARDINGCODE_CREW_MAIL_BRANCH=crew/${short}/T-2\n`);
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_MODE=branch\n");
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_HOPS=1\n");
  const argv = argvOf(seen);
  const prompt = argv[argv.indexOf("-p") + 1] ?? "";
  expect(prompt).toContain(`You are the implementer of task T-2 of work item ${id} ("Two files")`);
  expect(prompt).toContain("The task: AC-2: make src/b.ts export B;\nred then green.");
  expect(prompt).toContain("Its criteria, from the lead's item: AC-2");
  expect(prompt).toContain("## Request\n\nTwo files");
  expect(prompt).toContain(`--origin ${message.id}`);
  expect(prompt).toContain(
    `crew mail reply ${message.id} --branch crew/${short}/T-2 --item <your work item id>`,
  );
  expect((await c.run("task", id, "open", "T-2", "--criteria", "AC-2")).err.trim()).toBe(
    `T-2 is already open (message ${message.id}, branch crew/${short}/T-2)`,
  );
  // The listing sweeps first: once the fake implementer has ended, it settles the message (expired,
  // no reply) and says so on the task's line.
  const pid = Number(/^pid=(\d+)$/m.exec(seen)?.[1]);
  await ended({
    pid,
    log: join(
      mailbox(repoPaths(root, env).userDir, "w", "lead").dir,
      "opened",
      `${message.id}.log`,
    ),
  });
  const list = await c.run("task", id, "list");
  expect(list.out).toBe(
    `swept: 1 ended, 0 expired (${message.id} ended without a reply (expired))\nTasks of ${id}:\n  T-2 · AC-2 · crew/${short}/T-2 · ${message.id} expired · no child yet · no reply yet · implementer ended: the session ended without a reply · handed\n`,
  );
}, 20_000);

test("SP2c AC-3: a worktree git cannot make leaves no task and no message waiting; the task can be opened again", async () => {
  // The policy sends the worktrees under a path that is a file, which git cannot make a folder of.
  const { env, root, c, id } = await lead({ mail: { worktrees: "package.json" } });
  const first = await c.run("task", id, "open", "T-1", "--criteria", "AC-1");
  expect(first.code).not.toBe(0);
  expect(first.err).toContain(`git worktree add failed in ${root}: `);
  // No record of the task, and its message refused with git's reason, wherever it is recorded.
  expect(loadWork(repoPaths(root, env), id).work?.tasks ?? []).toEqual([]);
  const inbox = readBox(mailbox(repoPaths(root, env).userDir, "w", "lead").dir, "inbox").box
    .messages;
  const message = inbox.find((m) => m.subject === `T-1 of ${id}`);
  expect(message?.status).toBe("refused");
  expect(message?.reason).toContain("git worktree add failed");
  expect(
    loadItemMail(repoPaths(root, env), id).box.messages.find((m) => m.id === message?.id),
  ).toMatchObject({ status: "refused" });
  // The same task again is not "already open": it fails on the worktree again, not on the record.
  const second = await c.run("task", id, "open", "T-1", "--criteria", "AC-1");
  expect(second.err).toContain("git worktree add failed");
  expect(second.err).not.toContain("already open");
}, 20_000);

test("SP2c AC-3: an implementer that cannot start leaves the task, its worktree and its branch, and no record of an opener", async () => {
  const { env, root, c, id, short, worktreeOf } = await lead({
    env: { WIZARDINGCODE_CREW_CLAUDE: join(tempDir("crew-none-"), "claude") },
  });
  const opened = await c.run("task", id, "open", "T-1", "--criteria", "AC-1");
  expect(opened.code).toBe(0);
  expect(opened.out).toContain("the implementer did not start");
  expect(existsSync(worktreeOf("T-1"))).toBe(true);
  expect(existsSync(openedMarkerFile(repoPaths(root, env).userDir, worktreeOf("T-1")))).toBe(false);
  // The task's record and its branch stay, for the person to pick up or drop by hand, and the
  // listing says the implementer is not there.
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.map((t) => t.task)).toEqual(["T-1"]);
  expect(git(root, "branch", "--list", `crew/${short}/T-1`)).toContain(`crew/${short}/T-1`);
  expect((await c.run("task", id, "list")).out).toContain(
    "· no reply yet · no implementer · handed\n",
  );
}, 20_000);

test("SP2c AC-3: a task is not opened past the project's mail.maxConcurrent until a sweep sees a session end", async () => {
  const { c, id, open, ended } = await lead({ mail: { maxConcurrent: 1 } });
  const first = await open("T-1", "AC-1");
  expect((await c.run("task", id, "open", "T-2", "--criteria", "AC-2")).err.trim()).toBe(
    "1 session open in lead (mail.maxConcurrent 1); wait for it to end, or stop it with crew mail stop",
  );
  // The fake implementer ends at once; the listing sweeps first, so it sees the end and says what
  // became of the implementer, and the next open passes.
  await ended(first);
  const list = await c.run("task", id, "list");
  expect(list.out).toContain("swept: 1 ended, 0 expired");
  expect(list.out).toContain(
    "· no reply yet · implementer ended: the session ended without a reply · handed\n",
  );
  expect((await c.run("mail", "status")).out).not.toContain("swept:");
  expect((await c.run("task", id, "open", "T-2", "--criteria", "AC-2")).code).toBe(0);
}, 20_000);

const root = process.getuid?.() === 0;

test.skipIf(root)(
  "SP2c AC-2: crew task list and crew mail status survive a sweep that fails, and say so",
  async () => {
    const { env, root: repo, c, id, open, ended, childReplies, proveChild } = await lead();
    const task = await open("T-2", "AC-2");
    const { childId, childEnv } = await childReplies("T-2", task.message, task.worktree);
    proveChild(task.worktree, childEnv, childId);
    await ended(task);
    const dir = mailbox(repoPaths(repo, env).userDir, "w", "lead").dir;
    // The mailbox cannot be written: the sweep's record of the end fails there, on the session's
    // own line, and the commands still list.
    chmodSync(dir, 0o555);
    try {
      const list = await c.run("task", id, "list");
      expect(list.code).toBe(0);
      expect(list.out).toContain(`the sweep of ${task.message} failed: `);
      expect(list.out).toContain(`\nTasks of ${id}:\n  T-2 · AC-2 · `);
      const status = await c.run("mail", "status");
      expect(status.code).toBe(0);
      expect(status.out).toContain(`the sweep of ${task.message} failed: `);
      expect(status.out).toContain("\nopen sessions: \n");
      // The merge refuses a session whose end it could not record as one still running, and says
      // what its sweep could not settle, so a dead session is not taken for a live one.
      const merge = await c.run("task", id, "merge", "T-2");
      expect(merge.code).not.toBe(0);
      expect(merge.err).toContain("T-2's implementer is still running");
      expect(merge.err).toContain(`(the sweep of ${task.message} failed: `);
    } finally {
      chmodSync(dir, 0o755);
    }
    // The inbox cannot be read: `crew status` stands, with the two reads named as not done; `task
    // list` says its tasks were not listed, never that there are none; `mail status` still lists
    // the sessions, the inbox named as not read in the place of its summary.
    const inbox = join(dir, "inbox.json");
    chmodSync(inbox, 0o000);
    try {
      const status = await c.run("status");
      expect(status.code).toBe(0);
      expect(status.out).toContain("the inbox was not read: ");
      expect(status.out).toContain("the tasks were not listed: ");
      const list = await c.run("task", id, "list");
      expect(list.code).toBe(0);
      expect(list.out).toContain("the tasks were not listed: ");
      expect(list.out).toContain(`\nTasks of ${id}: not listed`);
      expect(list.out).not.toContain(`Tasks of ${id}: none`);
      const mail = await c.run("mail", "status");
      expect(mail.code).toBe(0);
      expect(mail.out).toContain("the inbox was not read: ");
      expect(mail.out).toContain("\nopen sessions:");
    } finally {
      chmodSync(inbox, 0o644);
    }
    // The outbox cannot be read: the sweep fails before any session is reached, in its one line,
    // and the commands still list.
    const outbox = join(dir, "outbox.json");
    chmodSync(outbox, 0o000);
    try {
      const list = await c.run("task", id, "list");
      expect(list.code).toBe(0);
      expect(list.out).toContain("the sweep failed: EACCES: permission denied");
      expect(list.out).toContain(`\nTasks of ${id}:\n  T-2 · AC-2 · `);
      // `mail status` lists the sessions from that same outbox, so it cannot stand: it fails
      // naming the file, rather than listing an unreadable box as empty.
      const status = await c.run("mail", "status");
      expect(status.code).not.toBe(0);
      expect(status.err).toContain("outbox.json");
    } finally {
      chmodSync(outbox, 0o644);
    }
  },
  20_000,
);

test.skipIf(root)(
  "SP2c AC-3: crew task list and crew status still list when the replies that landed cannot be taken into the record",
  async () => {
    const { env, root: repo, c, id, open, ended, childReplies } = await lead();
    const task = await open("T-2", "AC-2");
    await childReplies("T-2", task.message, task.worktree);
    await ended(task);
    // The item's folder cannot be written: the reply is read but the record cannot take it, and
    // the commands say so in one line and go on.
    const itemDir = join(repo, ".crew", "work", id);
    chmodSync(itemDir, 0o555);
    try {
      const list = await c.run("task", id, "list");
      expect(list.code).toBe(0);
      expect(list.out).toContain("the replies were not taken: ");
      expect(list.out).toContain(`\nTasks of ${id}:\n  T-2 · AC-2 · `);
      // The sync writes the item's copy of the mail there too, so it is the other guarded line.
      const status = await c.run("status");
      expect(status.code).toBe(0);
      expect(status.out).toContain("the mail was not synced: ");
      expect(status.out).toContain("the replies were not taken: ");
    } finally {
      chmodSync(itemDir, 0o755);
    }
  },
  20_000,
);

test("SP2c AC-2: crew mail status lists an open session with its minutes used, and crew mail stop kills it", async () => {
  const { env, root, c, id, open } = await lead({ env: { FAKE_CLAUDE_SLEEP: "30" } });
  const task = await open("T-1", "AC-1");
  expect(isAlive(task.pid)).toBe(true);
  const userDir = repoPaths(root, env).userDir;
  expect(existsSync(openedMarkerFile(userDir, task.worktree))).toBe(true);
  const status = await c.run("mail", "status");
  expect(status.out).toMatch(
    new RegExp(
      `open sessions: \\n  ${task.message} → lead: branch session crew-${task.message} \\(pid ${task.pid}\\), since \\S+, 0 of 30 minutes used, 40 turns allowed`,
    ),
  );
  expect(status.out).not.toContain("swept:");
  const stopped = await c.run("mail", "stop", task.message);
  expect(stopped.out.trim()).toBe(
    `${task.message} stopped (session crew-${task.message}, pid ${task.pid})`,
  );
  await waitFor("the implementer to die", () => !isAlive(task.pid));
  // The stop takes the record of what opened the implementer with it.
  expect(existsSync(openedMarkerFile(userDir, task.worktree))).toBe(false);
  expect((await c.run("mail", "stop", task.message)).err.trim()).toBe(
    `${task.message} has no session running`,
  );
  expect((await c.run("task", id, "list")).out).toContain(
    `${task.message} refused · no child yet · no reply yet · implementer stopped: stopped by crew mail stop · handed\n`,
  );
}, 20_000);

test("SP2c AC-4: the child records origin and parent, its reply fills the task, merge refuses an unproven child and merges a proven one", async () => {
  const { env, root, c, id, short, open, ended, childReplies, proveChild } = await lead();
  const task = await open("T-2", "AC-2");
  const message = task.message;
  const worktree = task.worktree;
  // The implementer, as the opened session would run it: its environment names the message and the agent.
  const stray = io(worktree, {
    ...env,
    WIZARDINGCODE_CREW_MAIL_ID: message,
    WIZARDINGCODE_CREW_MAIL_AGENT: "T-2",
  });
  expect(
    (await stray.run("start", "T-2", "--answers", answers, "--origin", "M-nope")).err.trim(),
  ).toBe("no message M-nope addressed to this session (crew mail inbox)");
  // The command refuses a task of the implementer's own, as the hook denies it.
  expect((await stray.run("task", id, "open", "T-3", "--criteria", "AC-2")).err.trim()).toBe(
    `a session opened by mail (${message}) opens no tasks of its own`,
  );
  const { childId, childEnv } = await childReplies("T-2", message, worktree);
  await ended(task);
  const child = loadWork(repoPaths(worktree, childEnv), childId).work;
  expect(child?.origin).toEqual({ mail: message });
  expect(child?.parent).toEqual({ project: "lead", item: id, task: "T-2", root });
  expect(
    loadItemMail(repoPaths(worktree, childEnv), childId).box.messages.map((m) => m.id),
  ).toEqual([message]);
  // The lead's record lives at the project's root, never in the worktree: the child's commits
  // carry nothing of it to the merge.
  expect(existsSync(join(worktree, ".crew", "work", id, "mail.json"))).toBe(false);
  expect(existsSync(join(root, ".crew", "work", id, "mail.json"))).toBe(true);
  expect(existsSync(join(worktree, ".crew", "work", childId, "mail.json"))).toBe(true);
  // The reply carries the branch, the child and the verdict; the lead's record takes them.
  const lp = repoPaths(root, env);
  const landed = ownInbox(mailContext(lp, loadPolicy(lp).policy, env)).messages.find(
    (m) => m.replyTo === message,
  );
  expect(landed).toMatchObject({ branch: `crew/${short}/T-2`, item: childId, verdict: "unproven" });
  expect((await c.run("task", id, "list")).out).toContain(
    `${message} blocked · ${childId} · unproven`,
  );
  expect((await c.run("task", id, "merge", "T-2")).err.trim()).toBe(
    `T-2's child ${childId} is not proven; the user may merge it anyway with crew task ${id} merge T-2 --force`,
  );
  // Proven child: merge, record, trust, worktree gone.
  proveChild(worktree, childEnv, childId);
  write(root, "src/a.ts", "dirty");
  expect((await c.run("task", id, "merge", "T-2")).err.trim()).toBe(
    "uncommitted changes in src/a.ts; commit or stash them, then merge",
  );
  git(root, "checkout", "-q", "--", "src/a.ts");
  // An outbox changed outside the engine stops the merge: whether the implementer still runs
  // cannot be read from it. The hand edit here makes the session look open again (its end, which
  // the listing's sweep recorded, removed), compacted as no engine write is.
  const outbox = join(mailbox(lp.userDir, "w", "lead").dir, "outbox.json");
  const outboxBytes = readFileSync(outbox, "utf8");
  const written = JSON.parse(outboxBytes) as {
    messages: {
      id: string;
      opened: { pid: number; processStart: string; endedAt?: string; outcome?: string };
    }[];
  };
  const copy = written.messages.find((m) => m.id === message);
  if (copy) {
    delete copy.opened.endedAt;
    delete copy.opened.outcome;
  }
  writeFileSync(outbox, JSON.stringify(written));
  expect((await c.run("task", id, "merge", "T-2")).err.trim()).toBe(tamperedBox("lead", "outbox"));
  // Meanwhile mail status names the outbox once and still lists what it records, marked as not
  // trusted, with the command that stops a session's whole group (TERM, then KILL), its log and
  // whether its pid is still the session: here the implementer has ended (gone); a pid another
  // process has taken since is named as such.
  const log = join(mailbox(lp.userDir, "w", "lead").dir, "opened", `${message}.log`);
  const status = (await c.run("mail", "status")).out;
  expect(status.split(tamperedBox("lead", "outbox")).length - 1).toBe(1);
  expect(status).toContain(
    "open sessions as the outbox records them (not trusted; stop one with kill -TERM -- -<pid>, then kill -KILL -- -<pid> after a second; read its log):",
  );
  expect(status).toContain(
    `  ${message} → lead: branch session crew-${message} (pid ${task.pid}), since `,
  );
  expect(status).toContain(`, log ${log} (gone)\n`);
  if (copy)
    copy.opened = { ...copy.opened, pid: process.pid, processStart: "Thu Jan  1 00:00:00 1970" };
  writeFileSync(outbox, JSON.stringify(written));
  const taken = (await c.run("mail", "status")).out;
  expect(taken).toContain(`(pid ${process.pid}), since `);
  expect(taken).toContain(`, log ${log} (pid now another process)\n`);
  // From a session opened by mail the sweep says nothing, so the listing names the outbox itself, once.
  const fromChild = (await stray.run("mail", "status")).out;
  expect(fromChild.split(tamperedBox("lead", "outbox")).length - 1).toBe(1);
  expect(fromChild).toContain("open sessions as the outbox records them (not trusted;");
  writeFileSync(outbox, outboxBytes);
  const merged = await c.json("task", id, "merge", "T-2");
  if (merged.code !== 0) throw new Error(`merge refused: ${String(merged.data.message)}`);
  // Read before the matcher below: bun's toMatchObject leaves its asymmetric matchers in the received object.
  const commit = (merged.data.task as { mergeCommit: string }).mergeCommit.slice(0, 7);
  expect(merged.data).toMatchObject({
    task: {
      task: "T-2",
      child: childId,
      verdict: "proven",
      mergedAt: expect.any(String),
      mergeCommit: expect.any(String),
    },
  });
  expect(git(root, "log", "-1", "--pretty=%s")).toBe(
    `Merge T-2 of ${id} (crew/${short}/T-2): ${childId}, proven`,
  );
  expect(readFileSync(join(root, "src", "b.ts"), "utf8")).toBe("export const B = 1;\n");
  // The child's proof of AC-2 is credited to the lead's criterion: the record names the task, the
  // child and the commit; the report, the status and the merge line follow (SP2c 8a AC-2).
  expect(merged.data.credited).toEqual(["AC-2"]);
  expect(String(merged.data.message)).toContain(
    `test-first of AC-2 credited to T-2 (child ${childId})`,
  );
  expect(loadEvidence(lp, id).evidence.tdd.find((t) => t.criterion === "AC-2")).toMatchObject({
    merged: {
      task: "T-2",
      child: childId,
      commit: (merged.data.task as { mergeCommit: string }).mergeCommit,
    },
  });
  expect((await c.run("evidence", id)).out).toContain(
    `| proven by T-2 (child ${childId}, merged ${commit}) |`,
  );
  expect((await c.json("status")).data.unproven).not.toContain(
    "test-first record missing for AC-2",
  );
  expect(existsSync(worktree)).toBe(false);
  // The sweep (the listing's above, or the merge's own) settled the implementer's session and took
  // the engine's record of what opened it.
  expect(existsSync(openedMarkerFile(lp.userDir, worktree))).toBe(false);
  expect(git(root, "branch", "--list", `crew/${short}/T-2`)).toContain(`crew/${short}/T-2`);
  // The child's merged record is trusted in the lead's checkout.
  expect(loadEvidence(lp, childId).tampered).toBe(false);
  expect((await c.run("evidence", id)).out).toContain(
    `| T-2 | AC-2 | crew/${short}/T-2 | ${childId} | proven | ${commit} | .crew/work/${childId}/report.md |`,
  );
  expect((await c.run("task", id, "merge", "T-2")).err.trim()).toBe("T-2 is already merged");
}, 30_000);

test("SP2c AC-4: --force merges an unproven child and records who forced it; a forged record, a stranger item or a branch that touches another record is never merged", async () => {
  const { env, root, c, id, short, open, ended, childReplies, proveChild } = await lead({
    mail: { maxConcurrent: 10 },
  });
  // T-1: unproven, forced by the user (relayed, as the policy says).
  const t1 = await open("T-1", "AC-1");
  const c1 = await childReplies("T-1", t1.message, t1.worktree, {
    file: "src/a.ts",
    text: "export const A = 1;\n",
  });
  await ended(t1);
  const forced = await c.json("task", id, "merge", "T-1", "--force");
  if (forced.code !== 0) throw new Error(`force refused: ${String(forced.data.message)}`);
  expect(String(forced.data.message)).toContain("forced by the user, relayed by the agent");
  expect(git(root, "log", "-1", "--pretty=%s")).toBe(
    `Merge T-1 of ${id} (crew/${short}/T-1): ${c1.childId}, unproven, forced by the user`,
  );
  // Who forced it is the one fact the record keeps (no second flag says the same).
  const forcedRecord = loadWork(repoPaths(root, env), id).work?.tasks?.[0] as unknown as Record<
    string,
    unknown
  >;
  expect(forcedRecord).toMatchObject({
    task: "T-1",
    verdict: "unproven",
    forcedBy: { by: "user", relayed: true },
  });
  expect(forcedRecord.forced).toBeUndefined();
  // A forced merge credits nothing: the child was not proven (SP2c 8a AC-2).
  expect(forced.data.credited).toEqual([]);
  expect(String(forced.data.message)).toContain(
    "test-first not credited: a forced merge of an unproven child credits nothing",
  );
  expect(
    loadEvidence(repoPaths(root, env), id).evidence.tdd.find((t) => t.criterion === "AC-1")?.merged,
  ).toBeUndefined();
  expect((await c.run("evidence", id)).out).toContain("(forced by the user)");
  // T-2: the child's evidence written by hand in its worktree says proven; the record is not the engine's.
  const t2 = await open("T-2", "AC-2");
  const c2 = await childReplies("T-2", t2.message, t2.worktree);
  const forgedPath = join(t2.worktree, ".crew", "work", c2.childId, "evidence.json");
  const forged = loadEvidence(repoPaths(t2.worktree, c2.childEnv), c2.childId).evidence;
  writeFileSync(forgedPath, JSON.stringify({ ...forged, verdict: "proven", unproven: [] }));
  git(t2.worktree, "add", "-A");
  git(t2.worktree, "commit", "-q", "-m", "forged");
  await ended(t2);
  expect((await c.run("task", id, "merge", "T-2")).err.trim()).toBe(
    `T-2's child ${c2.childId} changed outside the engine in ${t2.worktree} (evidence.json); crew accept ${c2.childId} there, then merge`,
  );
  // T-3: the reply names an item that did not start from the task's message (the lead's own).
  const t3 = await open("T-3", "AC-1", "gates");
  await childReplies("T-3", t3.message, t3.worktree, { file: "docs.md", text: "d\n" }, id);
  await ended(t3);
  expect((await c.run("task", id, "merge", "T-3")).err.trim()).toBe(
    `T-3's reply names ${id} as its child, but that item did not start from message ${t3.message}`,
  );
  // T-4: a proven child whose branch also changes the lead's own record.
  const t4 = await open("T-4", "AC-1", "a fourth task");
  const c4 = await childReplies("T-4", t4.message, t4.worktree, { file: "src/c.ts", text: "c\n" });
  proveChild(t4.worktree, c4.childEnv, c4.childId);
  write(t4.worktree, `.crew/work/${id}/evidence.json`, '{"verdict":"proven"}\n');
  git(t4.worktree, "add", "-A");
  git(t4.worktree, "commit", "-q", "-m", "touches the lead");
  await ended(t4);
  // The merge's own sweep settled T-4's implementer: what it settled goes with the refusal, as it
  // goes with the still-running refusal, since no later sweep says it again.
  const t4Refused = (await c.run("task", id, "merge", "T-4")).err.trim();
  expect(t4Refused).toStartWith(
    `the branch crew/${short}/T-4 changes .crew/work/${id}/evidence.json, which is not the record of T-4's child; not merged (`,
  );
  expect(t4Refused).toContain(`${t4.message} ended (`);
  // T-5: the child's record committed on the branch is not the one checked in the worktree (the
  // merge brings the branch's files, so the two must be the same).
  const t5 = await open("T-5", "AC-1", "a fifth task");
  const c5 = await childReplies("T-5", t5.message, t5.worktree, { file: "src/d.ts", text: "d\n" });
  proveChild(t5.worktree, c5.childEnv, c5.childId);
  const c5Paths = repoPaths(t5.worktree, c5.childEnv);
  const c5Evidence = loadEvidence(c5Paths, c5.childId).evidence;
  write(
    t5.worktree,
    `.crew/work/${c5.childId}/evidence.json`,
    JSON.stringify({ ...c5Evidence, unproven: ["x"] }),
  );
  git(t5.worktree, "add", "-A");
  git(t5.worktree, "commit", "-q", "-m", "another record");
  saveEvidence(c5Paths, c5.childId, c5Evidence);
  await ended(t5);
  const t5Refused = (await c.run("task", id, "merge", "T-5")).err.trim();
  expect(t5Refused).toStartWith(
    `T-5's child ${c5.childId} differs between the branch crew/${short}/T-5 and its worktree ${t5.worktree} (evidence.json); commit the record in the worktree, then merge (`,
  );
  expect(t5Refused).toContain(`${t5.message} ended (`);
  // T-6: a tracked file under .crew moved on the branch is a change to that file, wherever it went.
  const t6 = await open("T-6", "AC-1", "a sixth task");
  const c6 = await childReplies("T-6", t6.message, t6.worktree, { file: "src/e.ts", text: "e\n" });
  proveChild(t6.worktree, c6.childEnv, c6.childId);
  git(t6.worktree, "mv", ".crew/policy.json", `.crew/work/${c6.childId}/x.json`);
  git(t6.worktree, "commit", "-q", "-m", "moves a file");
  await ended(t6);
  const t6Refused = (await c.run("task", id, "merge", "T-6")).err.trim();
  expect(t6Refused).toStartWith(
    `the branch crew/${short}/T-6 changes .crew/policy.json, which is not the record of T-6's child; not merged (`,
  );
  expect(t6Refused).toContain(`${t6.message} ended (`);
  // T-7: the merge needs the worktree, where the child's record is checked.
  const t7 = await open("T-7", "AC-1", "a seventh task");
  const c7 = await childReplies("T-7", t7.message, t7.worktree, { file: "src/f.ts", text: "f\n" });
  proveChild(t7.worktree, c7.childEnv, c7.childId);
  await ended(t7);
  git(root, "worktree", "remove", "--force", t7.worktree);
  expect((await c.run("task", id, "merge", "T-7")).err.trim()).toStartWith(
    `T-7's worktree ${t7.worktree} is gone; restore it with git worktree add ${t7.worktree} crew/${short}/T-7, then merge`,
  );
  // T-8: a branch git cannot read (deleted by hand) is a refusal that names it, not a crash.
  const t8 = await open("T-8", "AC-1", "an eighth task");
  const c8 = await childReplies("T-8", t8.message, t8.worktree, { file: "src/g.ts", text: "g\n" });
  proveChild(t8.worktree, c8.childEnv, c8.childId);
  await ended(t8);
  git(root, "update-ref", "-d", `refs/heads/crew/${short}/T-8`);
  const unreadable = (await c.run("task", id, "merge", "T-8")).err.trim();
  expect(unreadable).toStartWith(`the branch crew/${short}/T-8 cannot be compared with HEAD: `);
  expect(unreadable).toContain("; restore the branch, then merge");
  expect(git(root, "log", "-1", "--pretty=%s")).toBe(
    `Merge T-1 of ${id} (crew/${short}/T-1): ${c1.childId}, unproven, forced by the user`,
  );
}, 90_000);

test("SP2c AC-4: the merge waits for the implementer's session, keeps the child's record when the item is local, and keeps a worktree with uncommitted files", async () => {
  const { env, root, c, id, short, open, childReplies, proveChild } = await lead({
    policy: { artifacts: "local" },
    mail: { maxConcurrent: 10 },
    env: { FAKE_CLAUDE_SLEEP: "30" },
  });
  const t1 = await open("T-1", "AC-1");
  const c1 = await childReplies("T-1", t1.message, t1.worktree, {
    file: "src/a.ts",
    text: "export const A = 1;\n",
  });
  proveChild(t1.worktree, c1.childEnv, c1.childId);
  expect((await c.run("task", id, "merge", "T-1")).err.trim()).toBe(
    `T-1's implementer is still running (pid ${t1.pid}); wait for it to end, or stop it with crew mail stop ${t1.message}`,
  );
  // While the implementer still runs, a changed outbox lists it as not trusted with no state after
  // its log: its pid is still the session.
  const leadMailbox = mailbox(repoPaths(root, env).userDir, "w", "lead").dir;
  const leadOutbox = join(leadMailbox, "outbox.json");
  const leadOutboxBytes = readFileSync(leadOutbox, "utf8");
  writeFileSync(leadOutbox, JSON.stringify(JSON.parse(leadOutboxBytes)));
  const running = (await c.run("mail", "status")).out;
  expect(running).toContain(`(pid ${t1.pid}), since `);
  expect(running).toContain(`, log ${join(leadMailbox, "opened", `${t1.message}.log`)}\n`);
  writeFileSync(leadOutbox, leadOutboxBytes);
  expect((await c.run("mail", "stop", t1.message)).code).toBe(0);
  await waitFor("the implementer to die", () => !isAlive(t1.pid));
  // The stop settled the session and took the engine's record of what opened it; one planted now
  // (a record a crash left between its writing and the session's recording) is the merge's own to take.
  writeOpenedMarker(repoPaths(t1.worktree, c1.childEnv), {
    mail: t1.message,
    agent: "T-1",
    hops: 1,
  });
  // The engine refreshed the worktree's profile after the implementer's last commit: its own file,
  // not the implementer's work, so the worktree still goes (finding #43).
  write(
    t1.worktree,
    ".crew/profile.json",
    `${readFileSync(join(t1.worktree, ".crew", "profile.json"), "utf8")}\n`,
  );
  const merged = await c.json("task", id, "merge", "T-1");
  if (merged.code !== 0) throw new Error(`merge refused: ${String(merged.data.message)}`);
  // The child's record was never committed (artifacts local): copied into the lead's checkout before the worktree went.
  expect(existsSync(t1.worktree)).toBe(false);
  expect(String(merged.data.message)).not.toContain("kept:");
  expect(existsSync(openedMarkerFile(repoPaths(root, env).userDir, t1.worktree))).toBe(false);
  expect(existsSync(join(root, ".crew", "work", c1.childId, "evidence.json"))).toBe(true);
  expect(loadEvidence(repoPaths(root, env), c1.childId)).toMatchObject({
    tampered: false,
    evidence: { verdict: "proven" },
  });
  // A worktree with uncommitted files is kept, and the command says so.
  const t2 = await open("T-2", "AC-2");
  const c2 = await childReplies("T-2", t2.message, t2.worktree);
  expect((await c.run("mail", "stop", t2.message)).code).toBe(0);
  await waitFor("the implementer to die", () => !isAlive(t2.pid));
  write(t2.worktree, "src/b.ts", "half-written");
  const kept = await c.json("task", id, "merge", "T-2", "--force");
  if (kept.code !== 0) throw new Error(`force refused: ${String(kept.data.message)}`);
  expect(String(kept.data.message)).toContain(`worktree ${t2.worktree} kept:`);
  expect(existsSync(join(t2.worktree, "src", "b.ts"))).toBe(true);
  // The record went with the stop, before the merge; a kept worktree is nobody's child either.
  expect(existsSync(openedMarkerFile(repoPaths(root, env).userDir, t2.worktree))).toBe(false);
  expect(readFileSync(join(root, "src", "b.ts"), "utf8")).toBe("export const B = 1;\n");
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.[1]).toMatchObject({
    task: "T-2",
    child: c2.childId,
    forcedBy: { by: "user", relayed: true },
  });
  // T-3: the merge is recorded as soon as it is committed, so a failure after it (here the child's
  // record cannot be copied: a file stands where its folder goes) leaves no merge the record forgot.
  const t3 = await open("T-3", "AC-1", "gates");
  const c3 = await childReplies("T-3", t3.message, t3.worktree, { file: "src/c.ts", text: "c\n" });
  proveChild(t3.worktree, c3.childEnv, c3.childId);
  expect((await c.run("mail", "stop", t3.message)).code).toBe(0);
  await waitFor("the implementer to die", () => !isAlive(t3.pid));
  write(root, `.crew/work/${c3.childId}`, "not a folder\n");
  const failed = await c.run("task", id, "merge", "T-3");
  expect(failed.code).not.toBe(0);
  expect(git(root, "log", "-1", "--pretty=%s")).toBe(
    `Merge T-3 of ${id} (crew/${short}/T-3): ${c3.childId}, proven`,
  );
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.[2]).toMatchObject({
    task: "T-3",
    mergedAt: expect.any(String),
    mergeCommit: git(root, "rev-parse", "HEAD"),
  });
  expect((await c.run("task", id, "merge", "T-3")).err.trim()).toBe("T-3 is already merged");
}, 60_000);

test("SP2c AC-5: a full-route child opened by mail waits for a person at the spec, and never merges", async () => {
  const env: NodeJS.ProcessEnv = { ...testEnv(), WIZARDINGCODE_CREW_CLAUDE: FAKE };
  const a = makeRepo({
    "README.md": "# storefront\n",
    ".crew/policy.json": JSON.stringify({ mail: { workspace: "w", name: "storefront" } }),
  });
  const b = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/auth/session.mjs": "x",
    ".crew/policy.json": JSON.stringify({
      mail: {
        workspace: "w",
        name: "crm",
        open: "branch",
        accept: ["question", "change-request"],
      },
      unattendedDecisions: "validator",
    }),
  });
  const ca = io(a, env);
  const cb = io(b, env);
  await ca.run("detect");
  await cb.run("detect");
  // crm registered long ago: not live, so the change request opens a session in a worktree of b.
  const userDir = repoPaths(a, env).userDir;
  const registry = loadRegistry(userDir);
  for (const p of registry.projects) if (p.name === "crm") p.lastSeen = "2020-01-01T00:00:00.000Z";
  write(userDir, "projects.json", JSON.stringify(registry));
  const sent = await ca.json(
    "mail",
    "send",
    "--to",
    "crm",
    "--type",
    "change-request",
    "Raise the session timeout to 60 minutes",
  );
  const mid = (sent.data.message as { id: string }).id;
  const pb = repoPaths(b, env);
  // The session runs in the worktree the opener made, where the engine left its record of what
  // opened it: the command reads that record, and the environment stays plain here.
  const worktree = join(b, "..", `${basename(b)}-mail-${mid}`);
  const pw = repoPaths(worktree, env);
  const childEnv: NodeJS.ProcessEnv = { ...env, CLAUDE_CODE_SESSION_ATTENDED: "0" };
  const w = io(worktree, childEnv);
  const full = JSON.stringify({ ...JSON.parse(answers), touches_auth: 0.9 });
  const started = await w.json(
    "start",
    "Raise the session timeout",
    "--answers",
    full,
    "--origin",
    mid,
  );
  const childId = started.data.id as string;
  expect(started.data.route).toBe("full");
  const refused = await w.run(
    "approve",
    childId,
    "spec",
    "--mode",
    "dontAsk",
    "--validator",
    "complete-gap-round",
  );
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    `a full-route item opened by mail (${mid}) waits for a person at its spec; the item is marked waiting for the user and the message blocked`,
  );
  expect(loadWork(pw, childId).work?.awaiting).toBe("user");
  const inbox = ownInbox(mailContext(pb, loadPolicy(pb).policy, childEnv)).messages.find(
    (m) => m.id === mid,
  );
  expect(inbox?.status).toBe("blocked");
  expect((await w.run("task", childId, "merge", "T-1")).err.trim()).toBe(
    `a session opened by mail (${mid}) never merges`,
  );
  // The person the item waits for approves it from the same worktree, in a session of their own
  // (attended, with no variable of the opener's): the record names no opener for them.
  const person = io(worktree, env);
  const approved = await person.run("approve", childId, "spec");
  expect(approved.err).toBe("");
  expect(approved.code).toBe(0);
  expect(approved.out).toContain("approved");
  // A headless session that names an opener this inbox does not hold (a message of another box:
  // one crm sent) is refused the same way, and that message is left as it was. The item lives in
  // b's root, where no record stands, so the variable alone names the opener.
  const other = (
    (await cb.json("mail", "send", "--to", "storefront", "--type", "question", "Is it read?")).data
      .message as { id: string }
  ).id;
  const crmOutbox = () =>
    readBox(mailbox(pb.userDir, "w", "crm").dir, "outbox").box.messages.find((m) => m.id === other);
  expect(crmOutbox()?.status).toBe("sent");
  const inRoot = (await cb.json("start", "Another timeout", "--answers", full)).data.id as string;
  const bogus = io(b, { ...childEnv, WIZARDINGCODE_CREW_MAIL_ID: other });
  const refusedBogus = await bogus.run("approve", inRoot, "spec", "--mode", "dontAsk");
  expect(refusedBogus.code).toBe(1);
  expect(refusedBogus.err.trim()).toBe(
    `a full-route item opened by mail (${other}) waits for a person at its spec; the item is marked waiting for the user and the message blocked`,
  );
  expect(loadWork(pb, inRoot).work?.awaiting).toBe("user");
  expect(crmOutbox()?.status).toBe("sent");
});

test("SP7b-T2 AC-4: a todo's brief lists the contracts its reply carried, each one-lined, and drops what is malformed", () => {
  const env = testEnv();
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/b.ts": "b",
  });
  write(root, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "lead" } }));
  const paths = repoPaths(root, env);
  const policy = loadPolicy(paths).policy;
  const work = createWork(paths, "Two files");
  const record = (task: string, message: string): TaskRecord => ({
    task,
    message,
    criteria: [],
    text: "x",
    branch: `crew/x/${task}`,
    worktree: "",
    openedAt: "2026-10-18T10:00:00.000Z",
    gate: {
      round: 1,
      at: "2026-10-18T10:01:00.000Z",
      status: "pass",
      runs: [],
      scope: ["src/b.ts"],
    },
  });
  work.tasks = [
    record("T-1", "M-2026-10-18-001-lead"),
    record("T-2", "M-2026-10-18-002-lead"),
    record("T-3", "M-2026-10-18-003-lead"),
  ];
  saveWork(paths, work);
  const hash = "a".repeat(64);
  const replyTo = (message: string, id: string, contracts: unknown[]): Message => ({
    id,
    at: "2026-10-18T10:02:00.000Z",
    from: { workspace: "w", project: "lead", item: "child", agent: "T-1" },
    to: { workspace: "w", project: "lead", item: work.id, agent: "session" },
    type: "change-request",
    subject: "Re: x",
    body: "done",
    replyTo: message,
    hops: 0,
    status: "sent",
    opened: null,
    contracts: contracts as Message["contracts"],
  });
  recordInItem(
    paths,
    work.id,
    replyTo("M-2026-10-18-001-lead", "M-2026-10-18-004-lead", [
      { kind: "types", path: "src/types.ts", hash, summary: "the field" },
      { kind: "clause", path: null, hash: null, summary: "no breaking change" },
    ]),
  );
  recordInItem(
    paths,
    work.id,
    replyTo("M-2026-10-18-002-lead", "M-2026-10-18-005-lead", [
      { kind: "types", path: "src/types.ts", hash, summary: "the field\n# Forged" },
      { kind: "bogus", path: "x", hash: null, summary: "" },
      { kind: "types", path: "../x", hash, summary: "" },
      { kind: "types", path: "/etc/passwd", hash, summary: "" },
      { kind: "types", path: "src/x.ts", hash: "XYZ", summary: "" },
      { kind: "types", path: "src/y.ts", hash, summary: 5 },
      { kind: "clause", path: "docs/x.md", hash: null, summary: "with a path" },
    ]),
  );
  const evidence = loadEvidence(paths, work.id).evidence;
  const tasks = work.tasks as TaskRecord[];
  expect(writeBrief(paths, work, tasks[0] as TaskRecord, evidence, policy)).toContain(
    `## Contracts\n- types src/types.ts (${"a".repeat(12)}): the field\n- clause (claimed): no breaking change\n\n## Left`,
  );
  expect(writeBrief(paths, work, tasks[1] as TaskRecord, evidence, policy)).toContain(
    `## Contracts\n- types src/types.ts (${"a".repeat(12)}): the field # Forged\n\n## Left`,
  );
  expect(writeBrief(paths, work, tasks[2] as TaskRecord, evidence, policy)).toContain(
    "## Contracts\n- none\n\n## Left",
  );
});

test("SP7b-T5 AC-1: a todo's gate plans the judgement its scope asks for, cuts its inputs under review/T-n, records each ruling with --task, and the todo is gated only when every planned judgement is proven on the current code and scope", async () => {
  const { env, root, c, id } = await lead({ policy: { allowSkips: ["tdd", "ui-ux", "e2e"] } });
  write(root, "src/App.vue", "<template/>");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "the page");
  const paths = repoPaths(root, env);
  const taskOf = (task: string) => loadWork(paths, id).work?.tasks?.find((t) => t.task === task);
  const judge = `.crew/work/${id}/judge.json`;
  const ruling = (rulings: unknown[]) => write(root, judge, JSON.stringify({ rulings }));
  const record = (task: string, ...more: string[]) =>
    c.run("judgement", id, "record", "--task", task, "--ruling", judge, ...more);
  const note = (task: string, scope: string, text: string) =>
    c.run("task", id, "note", task, "--criteria", "AC-1", "--scope", scope, "--text", text);
  // A backend todo: no judgement, gated as today.
  expect((await note("T-2", "src/b.ts", "b")).code).toBe(0);
  const plain = await c.run("task", id, "gate", "T-2");
  expect(plain.code).toBe(0);
  expect(plain.out).not.toContain("Judgement gates to run");
  expect(plain.out.trim().endsWith("T-2 gate round 1: pass")).toBe(true);
  expect(taskOf("T-2")).toMatchObject({ state: "gated", gate: { status: "pass", planned: [] } });
  ruling([{ gate: "ui-ux", verdict: "proven", findings: [] }]);
  expect((await record("T-2")).err.trim()).toBe(
    `T-2 plans no judgement gate (crew task <id> gate T-2)`,
  );
  expect((await record("T-9")).err.trim()).toBe(`T-9 is not a task of ${id}`);
  // A page todo: ui-ux planned, the inputs cut, the state waits for the ruling.
  expect((await note("T-5", "src/App.vue", "the page")).code).toBe(0);
  const first = await c.run("task", id, "gate", "T-5");
  expect(first.code).toBe(0);
  expect(first.out).toContain(
    `Judgement gates to run for T-5: ui-ux (interface files: src/App.vue); inputs in .crew/work/${id}/review/T-5/ (diff.patch, files.txt); record each with crew judgement ${id} record --task T-5 --ruling <file>`,
  );
  expect(first.out.trim().endsWith("T-5 gate round 1: pass, judgement pending (ui-ux)")).toBe(true);
  expect(taskOf("T-5")).toMatchObject({
    state: "merged",
    gate: { planned: [{ gate: "ui-ux", reason: "interface files: src/App.vue" }] },
  });
  expect(readFileSync(join(root, ".crew", "work", id, "review", "T-5", "files.txt"), "utf8")).toBe(
    "src/App.vue\n",
  );
  expect((await c.run("task", id, "brief", "T-5")).err.trim()).toBe(
    `T-5 has a judgement gate not proven yet (crew judgement <id> record --task T-5 --ruling <file>)`,
  );
  // The inputs refusals, on a second page todo.
  expect((await note("T-6", "src/App.vue", "six")).code).toBe(0);
  expect((await record("T-6")).err.trim()).toBe(
    `T-6 plans no judgement gate (crew task <id> gate T-6)`,
  );
  expect((await c.run("task", id, "gate", "T-6")).code).toBe(0);
  write(
    root,
    `.crew/work/${id}/review/T-6/inputs.json`,
    JSON.stringify({ fingerprint: "other", at: new Date().toISOString(), captures: [] }),
  );
  expect((await record("T-6")).err.trim()).toBe(
    `the review inputs of T-6 describe other code than the current one: run crew task <id> gate T-6, then the reviewers and the judge again`,
  );
  rmSync(join(root, ".crew", "work", id, "review", "T-6"), { recursive: true, force: true });
  expect((await record("T-6")).err.trim()).toBe(
    `no review inputs for T-6: run crew task <id> gate T-6 first, then the reviewers and the judge`,
  );
  // Back on T-5: a gate the todo did not plan, a contradiction, a not-proven ruling with a finding outside the scope.
  ruling([{ gate: "code-quality", verdict: "proven", findings: [] }]);
  expect((await record("T-5")).err).toContain("code-quality is not planned for T-5");
  ruling([
    {
      gate: "ui-ux",
      verdict: "proven",
      findings: [{ file: "src/App.vue", line: 1, text: "no empty state", severity: "defect" }],
    },
  ]);
  const contradiction = await record("T-5");
  expect(contradiction.code).toBe(1);
  expect(contradiction.err).toContain("proven");
  ruling([
    {
      gate: "ui-ux",
      verdict: "not-proven",
      findings: [
        { file: "src/App.vue", line: 1, text: "no empty state", severity: "defect" },
        { file: "src/other.ts", line: 1, text: "unrelated", severity: "advisory" },
      ],
    },
  ]);
  const notProven = await record("T-5");
  expect(notProven.code).toBe(1);
  expect(notProven.out).toContain("T-5: ui-ux not proven (2 findings)");
  expect(notProven.out).toContain("T-5: not gated: ui-ux not proven (2 findings)");
  const recorded = taskOf("T-5")?.gate?.judgement?.[0];
  expect(recorded).toMatchObject({ gate: "ui-ux", verdict: "not-proven" });
  expect(recorded?.findings[1]?.outside).toBe(true);
  expect(recorded?.scope).toBe(scopeHash(["src/App.vue"]));
  expect((await c.run("task", id, "brief", "T-5")).code).toBe(1);
  const notRun = await c.run(
    "judgement",
    id,
    "record",
    "ui-ux",
    "--not-run",
    "--reason",
    "no browser",
    "--task",
    "T-5",
  );
  expect(notRun.code).toBe(1);
  expect(notRun.out).toContain("T-5: ui-ux not run: no browser");
  expect(notRun.out).toContain("T-5: not gated: ui-ux not run");
  // Proven: gated, the round's files kept by the engine, the brief says so.
  ruling([{ gate: "ui-ux", verdict: "proven", findings: [] }]);
  const proven = await record("T-5");
  expect(proven.code).toBe(0);
  expect(proven.out).toContain("T-5: ui-ux proven (0 findings)");
  expect(proven.out).toContain("T-5: gated");
  expect(taskOf("T-5")?.state).toBe("gated");
  const reviewT5 = join(root, ".crew", "work", id, "review", "T-5");
  expect(existsSync(join(reviewT5, "ui-ux.round1.md"))).toBe(false);
  expect(readFileSync(join(reviewT5, "ruling.round1.json"), "utf8")).toBe(
    readFileSync(join(root, judge), "utf8"),
  );
  expect((await c.run("task", id, "brief", "T-5")).out).toContain("- ui-ux: proven (0 findings)");
  // The code changes: the ruling was on other code, the todo waits again.
  write(root, "src/App.vue", "<template>changed</template>");
  const second = await c.run("task", id, "gate", "T-5");
  expect(second.out.trim().endsWith("T-5 gate round 2: pass, judgement pending (ui-ux)")).toBe(
    true,
  );
  // The ladder never lowers briefed; the todo's judgement is open again, which the brief refuses to rewrite.
  expect(taskOf("T-5")).toMatchObject({ state: "briefed", gate: { round: 2, judgement: [] } });
  expect((await c.run("task", id, "brief", "T-5")).code).toBe(1);
  // A ruling recorded while the briefed todo's judgement is pending says so, never "gated" (finding 75).
  const pendingBriefed = await c.run(
    "judgement",
    id,
    "record",
    "ui-ux",
    "--not-run",
    "--reason",
    "no browser",
    "--task",
    "T-5",
  );
  expect(pendingBriefed.code).toBe(1);
  expect(pendingBriefed.out).toContain("T-5: briefed, judgement pending (ui-ux not run)");
  expect(pendingBriefed.out).not.toContain("T-5: gated");
  expect((await record("T-5")).code).toBe(0);
  expect((await c.run("task", id, "brief", "T-5")).code).toBe(0);
  // A narrower --scope cannot un-plan the gate, and a ruling cut for other files counts for nothing.
  expect((await c.run("continue", id, "gate", "T-5")).code).toBe(0);
  const narrowed = await c.json("task", id, "gate", "T-5", "--scope", "src/a.ts");
  expect(narrowed.data.gate).toMatchObject({
    round: 3,
    planned: [{ gate: "ui-ux", reason: "interface files: src/App.vue" }],
    judgement: [],
  });
  expect((await c.run("task", id, "brief", "T-5")).code).toBe(1);
  // A gate skipped on the item holds no todo.
  expect((await c.run("skip", id, "gate:ui-ux", "--reason", "no browser")).code).toBe(0);
  expect((await c.run("continue", id, "gate", "T-5")).code).toBe(0);
  const skipped = await c.run("task", id, "gate", "T-5");
  expect(skipped.out.trim().endsWith("T-5 gate round 4: pass")).toBe(true);
  expect(taskOf("T-5")).toMatchObject({ state: "briefed", gate: { round: 4, judgement: [] } });
  expect((await c.run("task", id, "brief", "T-5")).code).toBe(0);
  expect(loadWork(paths, id).work?.rounds?.judgement ?? 0).toBe(0);
}, 30_000);

test("CON6-AC-3 (finding 56): a task's scope that starts with a backslash, a UNC path among them, is refused naming the path", () => {
  for (const path of ["\\\\server\\share\\a.ts", "\\a.ts", "\\src/a.ts"]) {
    const refusal = scopeRefusal([path]);
    expect(refusal).not.toBeNull();
    expect(
      refusal !== null && (refusal.includes(path) || refusal.includes(JSON.stringify(path))),
    ).toBe(true);
  }
  // A relative path stays a name of the checkout.
  expect(scopeRefusal(["src/a.ts"])).toBeNull();
});

test("CON6-AC-6 (finding 30): a task whose merge HEAD has undone with git revert -m 1 is refused as reverted by the task's scope; a merge git cannot read refuses too", () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  git(root, "checkout", "-q", "-b", "crew/t-1");
  write(root, "src/a.ts", "export const a = 1;\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "T-1");
  git(root, "checkout", "-q", "main");
  git(root, "merge", "-q", "--no-ff", "-m", "Merge T-1", "crew/t-1");
  const merge = git(root, "rev-parse", "HEAD");
  git(root, "revert", "--no-edit", "-m", "1", merge);
  const revert = git(root, "rev-parse", "HEAD");
  const profile = detectProfile(root);
  const record: TaskRecord = {
    task: "T-1",
    message: "",
    criteria: ["AC-1"],
    text: "T-1",
    branch: "crew/t-1",
    worktree: "",
    openedAt: "2026-10-22T10:00:00.000Z",
    state: "merged",
    mergedAt: "2026-10-22T10:05:00.000Z",
    mergeCommit: merge,
  };
  expect(taskScope(root, profile, record)).toEqual({
    refused: `T-1's merge ${merge.slice(0, 7)} was reverted at ${revert.slice(0, 7)}: open the task again or gate the item`,
  });
  // A merge commit git cannot read (one that does not exist) makes the scope refuse, never pass.
  let unreadable: unknown;
  try {
    unreadable = taskScope(root, profile, { ...record, mergeCommit: "0".repeat(40) });
  } catch (error) {
    unreadable = { threw: String(error) };
  }
  expect(unreadable).toMatchObject({ refused: expect.any(String) });
});

test("DEBT-AC-10-open-text: crew task open's line for an implementer that did not start names crew task <id> drop T-n, not the hand git commands (triage 5j)", async () => {
  const { c, id } = await lead({
    env: { WIZARDINGCODE_CREW_CLAUDE: join(tempDir("crew-none-"), "claude") },
  });
  const opened = await c.run("task", id, "open", "T-1", "--criteria", "AC-1");
  expect(opened.code).toBe(0);
  expect(opened.out).toContain("the implementer did not start");
  expect(opened.out).toContain(`crew task ${id} drop T-1`);
  expect(opened.out).not.toContain("git worktree remove");
  expect(opened.out).not.toContain("git branch -D");
}, 20_000);

test("AC-8 (finding 61): on an item with no plan.md, crew task note and crew task open without --text say the item has no plan.md and name --text", async () => {
  const { env, root, c, id } = await lead();
  rmSync(join(root, ".crew", "work", id, "plan.md"));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "no plan");
  const route = loadWork(repoPaths(root, env), id).work?.route;
  expect(
    (
      await c.run("task", id, "note", "T-1", "--criteria", "AC-1", "--scope", "src/a.ts")
    ).err.trim(),
  ).toBe(`this item has no plan.md (route ${route}): give the todo's text with --text "<todo>"`);
  expect((await c.run("task", id, "open", "T-1", "--criteria", "AC-1")).err.trim()).toBe(
    `this item has no plan.md (route ${route}): give the task's text with --text "<task>"`,
  );
  // With --text, the todo is noted as before.
  expect(
    (
      await c.run(
        "task",
        id,
        "note",
        "T-1",
        "--criteria",
        "AC-1",
        "--scope",
        "src/a.ts",
        "--text",
        "a",
      )
    ).code,
  ).toBe(0);
}, 30_000);
