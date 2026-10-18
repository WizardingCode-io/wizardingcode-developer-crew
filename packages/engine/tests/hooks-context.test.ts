import { expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_WATCH_EXCLUDE } from "../src/detect/index.ts";
import { refreshMail } from "../src/hooks/context.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { isLive, loadRegistry, mailContext, send } from "../src/mail.ts";
import { loadPolicy } from "../src/policy.ts";
import { loadProfile, saveProfile } from "../src/profile.ts";
import { loadState } from "../src/state.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

function context(root: string, env = testEnv()) {
  return hookContext({ session_id: "s1", cwd: join(root, "src") }, env);
}

test("finding 22: the session context says who runs crew commands and how the user signs", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  // Under the policy that prompts; the default relays (ADR 0005, 0.3.0) and is tested below.
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(
    join(root, ".crew", "policy.json"),
    JSON.stringify({ attendedDecisions: "prompt" }),
  );
  const text = (onSessionStart(context(root)).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain("You run every crew command; the user never types one");
  expect(text).toContain("signed by the permission prompt");
});

test("0.3.0: a session start follows the manifests and says what the profile picked up", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { build: "true" } }),
    "src/a.ts": "x",
  });
  const first = context(root);
  onSessionStart(first);
  expect(loadProfile(first.paths).profile?.targets[0]?.gates.test).toBeUndefined();
  // The project gained a test script between sessions.
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { build: "true", test: "exit 0" } }),
  );
  const next = hookContext({ session_id: "s2", cwd: root }, testEnv());
  const text = (
    onSessionStart(next, { source: "startup" }).hookSpecificOutput as {
      additionalContext: string;
    }
  ).additionalContext;
  expect(text).toContain("profile refreshed: test (.): npm run test");
  expect(loadProfile(next.paths).profile?.targets[0]?.gates.test).toEqual({
    command: "npm run test",
    source: "detected",
  });
  expect(next.profile.targets[0]?.gates.test?.command).toBe("npm run test");
  // Nothing new: nothing said.
  const quiet = (
    onSessionStart(hookContext({ session_id: "s3", cwd: root }, testEnv()), {
      source: "startup",
    }).hookSpecificOutput as { additionalContext: string }
  ).additionalContext;
  expect(quiet).not.toContain("profile refreshed");
});

test("ADR 0005: under relay the session context says the user's yes in the conversation is the signature", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(join(root, ".crew", "policy.json"), JSON.stringify({ attendedDecisions: "relay" }));
  const text = (onSessionStart(context(root)).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain("You run every crew command; the user never types one");
  expect(text).toContain("relayed by you from the conversation");
  expect(text).toContain("no prompt");
  expect(text).not.toContain("signed by the permission prompt");
});

test("session start detects the profile, records the baseline and describes the state", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const ctx = context(root);
  const response = onSessionStart(ctx);
  expect(existsSync(join(root, ".crew", "profile.json"))).toBe(true);
  expect(existsSync(join(root, ".crew", ".gitignore"))).toBe(true);
  const session = loadState(ctx.paths).sessions.s1;
  expect(session?.baseline).toMatch(/^sha256:/);
  expect(session?.stopBlocks).toBe(0);
  const text = (response.hookSpecificOutput as { additionalContext: string }).additionalContext;
  expect(text).toContain(
    "No work item is active. A code change starts by answering the crew skill's nine typed questions, then crew start \"<request>\" --answers '<json>'.",
  );
  expect(text.length).toBeLessThan(900);
});

test("session start reports a missing test command and the work in progress", () => {
  const root = makeRepo({ Makefile: "test:\n\ttrue\n", "src/a.c": "x" });
  const ctx = context(root);
  const work = createWork(ctx.paths, "Fix the build");
  addCriterion(work, "x");
  saveWork(ctx.paths, work);
  const text = (onSessionStart(ctx).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain("No test command is known");
  expect(text).toContain(`Work in progress: ${work.id}`);
  expect(text).toContain("not proven");
});

test("the prompt hook adds one status line only while work is active", () => {
  const root = makeRepo({ "src/a.ts": "x" });
  const ctx = context(root);
  expect(onPrompt(ctx)).toEqual({});
  createWork(ctx.paths, "Thing");
  const text = (onPrompt(ctx).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toMatch(/^Crew: work \S+ "Thing", phase receive, route standard, not proven/);
  expect(text.split("\n")).toHaveLength(1);
});

test("finding 12: a watch list left by an earlier release follows the current default at session start", () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const env = testEnv();
  const former = ["**/*.md", "docs/**", ".crew/**"];
  const first = context(root, env);
  saveProfile(first.paths, { ...first.profile, watch: { exclude: [...former] } });
  const ctx = context(root, env);
  expect(ctx.profile.watch.exclude).toEqual(former);
  const text = (onSessionStart(ctx).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain(
    "The profile's watch list predated this release and now follows the current default",
  );
  expect(text).not.toContain("crew detect --refresh");
  expect(loadProfile(ctx.paths).profile?.watch.exclude).toEqual(DEFAULT_WATCH_EXCLUDE);
  expect(ctx.profile.watch.exclude).toEqual(DEFAULT_WATCH_EXCLUDE);
  // A list the user chose is theirs.
  saveProfile(ctx.paths, { ...ctx.profile, watch: { exclude: ["**/*.md", "generated/**"] } });
  const custom = context(root, env);
  const kept = (onSessionStart(custom).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(kept).not.toContain("watch list");
  expect(loadProfile(custom.paths).profile?.watch.exclude).toEqual(["**/*.md", "generated/**"]);
  // A profile changed outside the engine is left as it is, with the hint to refresh it.
  writeFileSync(
    join(root, ".crew", "profile.json"),
    JSON.stringify({ ...ctx.profile, watch: { exclude: former } }),
  );
  const tampered = context(root, env);
  expect(tampered.tampered).toBe(true);
  const hint = (onSessionStart(tampered).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(hint).toContain("run `crew detect --refresh` once");
  expect(loadProfile(tampered.paths).profile?.watch.exclude).toEqual(former);
});

test("SP2c AC-1: SessionStart registers the project and prints the inbox line, blockers first; the prompt names what arrived", () => {
  const env = testEnv();
  const a = makeRepo({ "README.md": "# storefront\n" });
  const b = makeRepo({ "README.md": "# crm\n" });
  write(a, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "storefront" } }));
  write(
    b,
    ".crew/policy.json",
    JSON.stringify({
      mail: { workspace: "w", name: "crm", accept: ["question", "notice", "blocker"] },
    }),
  );
  const ctxA = hookContext({ session_id: "sa", cwd: a }, env);
  const startA = onSessionStart(ctxA, { source: "startup" }) as {
    hookSpecificOutput: { additionalContext: string };
  };
  expect(startA.hookSpecificOutput.additionalContext).not.toContain("Mail (");
  expect(loadRegistry(ctxA.paths.userDir).projects.map((p) => [p.name, p.sessionId])).toEqual([
    ["storefront", "sa"],
  ]);
  const ctxB = hookContext({ session_id: "sb", cwd: b }, env);
  onSessionStart(ctxB, { source: "startup" });
  const pa = repoPaths(a, env);
  const mailA = mailContext(pa, loadPolicy(pa).policy, env);
  send(
    mailA,
    { to: "crm", type: "question", text: "Does POST /customers accept loyalty_tier?" },
    null,
  );
  send(mailA, { to: "crm", type: "blocker", text: "Checkout is down since the CRM deploy" }, null);
  const startB = onSessionStart(hookContext({ session_id: "sb2", cwd: b }, env), {
    source: "startup",
  }) as { hookSpecificOutput: { additionalContext: string } };
  const text = startB.hookSpecificOutput.additionalContext;
  expect(text).toContain("Mail (w): 2 unread blocker and question from storefront.");
  expect(text).toMatch(
    /Blocker M-\S+ from storefront: "Checkout is down since the CRM deploy" \(crew mail read M-\S+\)\./,
  );
  expect(text.indexOf("Blocker")).toBeLessThan(text.indexOf("Mail (w)"));
  expect(text).toContain("crew mail inbox lists it");
  // The prompt hook: the first prompt after the arrival names it, the next one does not.
  const prompt = onPrompt(hookContext({ session_id: "sb2", cwd: b }, env)) as {
    hookSpecificOutput?: { additionalContext: string };
  };
  expect(prompt.hookSpecificOutput?.additionalContext ?? "").not.toContain("Mail:"); // SessionStart already told this agent
  send(mailA, { to: "crm", type: "notice", text: "Release tonight" }, null);
  const next = onPrompt(hookContext({ session_id: "sb2", cwd: b }, env)) as {
    hookSpecificOutput: { additionalContext: string };
  };
  expect(next.hookSpecificOutput.additionalContext).toMatch(
    /Mail: 1 new: M-\S+ notice from storefront "Release tonight" \(crew mail inbox\)\./,
  );
  // Named once: the prompt after that is quiet again.
  const third = onPrompt(hookContext({ session_id: "sb2", cwd: b }, env)) as {
    hookSpecificOutput?: { additionalContext: string };
  };
  expect(third.hookSpecificOutput?.additionalContext ?? "").not.toContain("Mail:");
});

test("SP2c AC-1: a mailbox the hook cannot use costs the session its mail line, never its context", () => {
  const env = testEnv();
  const root = makeRepo({ "README.md": "# storefront\n" });
  write(
    root,
    ".crew/policy.json",
    JSON.stringify({ mail: { workspace: "w", name: "storefront" } }),
  );
  mkdirSync(join(env.WIZARDINGCODE_HOME as string, "crew", "mail", "w", "storefront", ".lock"), {
    recursive: true,
  });
  const start = handleHook(
    "session-start",
    { session_id: "s", cwd: root, source: "startup" },
    env,
  ) as {
    hookSpecificOutput?: { additionalContext: string };
  };
  const text = start.hookSpecificOutput?.additionalContext ?? "";
  expect(text).toContain("WizardingCode Developer Crew is active in this repository.");
  expect(text).toContain("Mail is off for this session start: mailbox busy");
});

test("SP2c AC-1: a session opened by mail is told which message opened it and what it may do", () => {
  const env = testEnv();
  const a = makeRepo({ "README.md": "# storefront\n" });
  const b = makeRepo({ "README.md": "# crm\n" });
  write(a, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "storefront" } }));
  write(
    b,
    ".crew/policy.json",
    JSON.stringify({
      mail: { workspace: "w", name: "crm", open: "branch", accept: ["question", "change-request"] },
    }),
  );
  onSessionStart(hookContext({ session_id: "sa", cwd: a }, env), { source: "startup" });
  onSessionStart(hookContext({ session_id: "sb", cwd: b }, env), { source: "startup" });
  const pa = repoPaths(a, env);
  const sent = send(
    mailContext(pa, loadPolicy(pa).policy, env),
    { to: "crm", type: "change-request", text: "Add loyalty_tier to POST /customers" },
    null,
  );
  if ("refused" in sent) throw new Error(sent.refused);
  const opened = hookContext(
    { session_id: "so", cwd: b },
    {
      ...env,
      WIZARDINGCODE_CREW_MAIL_ID: sent.message.id,
      WIZARDINGCODE_CREW_MAIL_HOPS: "1",
      CLAUDE_CODE_SESSION_ATTENDED: "0",
    },
  );
  expect(opened.openedBy).toBe(sent.message.id);
  const start = onSessionStart(opened, { source: "startup" }) as {
    hookSpecificOutput: { additionalContext: string };
  };
  const text = start.hookSpecificOutput.additionalContext;
  expect(text).toContain(
    `This session was opened by mail ${sent.message.id} from storefront (change-request): read it with crew mail read ${sent.message.id}.`,
  );
  expect(text).toContain(
    `A change request: run the method on this branch as a work item started with --origin ${sent.message.id} (the opener pinned no branch: every push is denied), commit on it,`,
  );
  expect(text).toContain(
    `end with crew mail reply ${sent.message.id} --branch <branch> --item <child id>`,
  );
  expect(text).toContain(
    "Never merge, push to another branch or deploy; a full-route spec waits for a person (crew await <id> user).",
  );
  expect(
    loadRegistry(opened.paths.userDir).projects.find((p) => p.sessionId === "so"),
  ).toMatchObject({ name: "crm", mail: sent.message.id });
  // The branch the opener pinned is the one named, whatever HEAD says.
  const pinned = hookContext(
    { session_id: "sp", cwd: b },
    {
      ...env,
      WIZARDINGCODE_CREW_MAIL_ID: sent.message.id,
      WIZARDINGCODE_CREW_MAIL_BRANCH: "crew/2026-10-15-001/T-1",
      WIZARDINGCODE_CREW_MAIL_HOPS: "1",
      CLAUDE_CODE_SESSION_ATTENDED: "0",
    },
  );
  const pinnedText = (
    onSessionStart(pinned, { source: "startup" }) as {
      hookSpecificOutput: { additionalContext: string };
    }
  ).hookSpecificOutput.additionalContext;
  expect(pinnedText).toContain(
    `started with --origin ${sent.message.id} (branch crew/2026-10-15-001/T-1), commit on it,`,
  );
  expect(pinnedText).not.toContain("every push is denied");
});

test("SP2c 8a AC-3: a hook's registration marks the project live; the context's build leaves no mark", () => {
  const root = makeRepo({ "src/a.ts": "x" });
  write(root, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "lead" } }));
  const ctx = context(root);
  const entryOf = () =>
    loadRegistry(ctx.paths.userDir).projects.find((p) => p.root === ctx.paths.root);
  // Building the context registers nothing; a command would register without the mark.
  expect(entryOf()?.lastHook).toBeUndefined();
  expect(refreshMail(ctx).failed).toBeNull();
  const entry = entryOf();
  expect(typeof entry?.lastHook).toBe("string");
  expect(entry !== undefined && isLive(entry)).toBe(true);
});
