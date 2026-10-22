import { expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { listDecisions } from "../src/decisions.ts";
import { DEFAULT_WATCH_EXCLUDE } from "../src/detect/index.ts";
import { refreshMail } from "../src/hooks/context.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { isLive, loadRegistry, mailContext, send } from "../src/mail.ts";
import { listPacks, registerPack } from "../src/packs.ts";
import { loadPolicy } from "../src/policy.ts";
import { loadProfile, saveProfile } from "../src/profile.ts";
import { loadState } from "../src/state.ts";
import { VERSION } from "../src/version.ts";
import { activeWork, addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";
import { writePack } from "./pack-fixtures.ts";

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
  expect(text).not.toContain("knowledge:");
  // What the base listed rides on the line every session reads (SP4 Task 3).
  const active = activeWork(ctx.paths)?.work;
  if (!active) throw new Error("no active work");
  active.knowledge = { readAt: "2026-10-20T00:00:00.000Z", listed: ["K-1", "K-2"] };
  saveWork(ctx.paths, active);
  const listed = (onPrompt(ctx).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(listed).toContain(", knowledge: 2 listed");
  active.knowledge = { readAt: "2026-10-20T00:00:00.000Z", listed: [] };
  saveWork(ctx.paths, active);
  expect(
    (onPrompt(ctx).hookSpecificOutput as { additionalContext: string }).additionalContext,
  ).toContain(", knowledge: none");
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
}, 30_000);

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

test("SP6-T2 AC-6: SessionStart discovers packs from the plugin registry when CLAUDE_PLUGIN_ROOT is set, their rules reach the profile at the same start, and the status says the packs", () => {
  const home = tempDir("home-");
  const registry = join(home, ".claude", "plugins", "installed_plugins.json");
  mkdirSync(dirname(registry), { recursive: true });
  const laravel = writePack();
  writeFileSync(
    registry,
    JSON.stringify({
      version: 1,
      plugins: {
        "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: laravel, version: "0.1.0" }],
      },
    }),
  );
  const root = makeRepo({
    "composer.json": JSON.stringify({ scripts: { test: "phpunit" } }),
    artisan: "x",
    "src/a.php": "x",
  });
  const base = testEnv();
  const userDir = join(base.WIZARDINGCODE_HOME ?? "", "crew");
  const text = (ctx: ReturnType<typeof hookContext>) =>
    (onSessionStart(ctx, { source: "startup" }).hookSpecificOutput as { additionalContext: string })
      .additionalContext;
  // The fixture's environment never inherits the plugin's variables from the process (round 3).
  expect(base.CLAUDE_PLUGIN_ROOT).toBeUndefined();
  expect(base.CLAUDE_CONFIG_DIR).toBeUndefined();
  // No CLAUDE_PLUGIN_ROOT: no discovery, no packs sentence.
  const plain = text(hookContext({ session_id: "s1", cwd: root }, { ...base, HOME: home }));
  expect(listPacks(userDir)).toEqual([]);
  expect(plain).not.toContain("Packs:");
  // With it: the pack registered by discovery before the profile refresh, so its rule is in this start's profile.
  const env = { ...base, HOME: home, CLAUDE_PLUGIN_ROOT: "/x" };
  const started = text(hookContext({ session_id: "s2", cwd: root }, env));
  expect(listPacks(userDir).map((p) => [p.name, p.registration?.by])).toEqual([
    ["wizardingcode-pack-laravel", "discovery"],
  ]);
  expect(started).toContain("profile refreshed: test (.): php artisan test");
  expect(started).toContain("Packs: 1 registered.");
  expect(loadProfile(repoPaths(root, env)).profile?.targets[0]?.gates.test).toEqual({
    command: "php artisan test",
    source: "proposed",
    pack: "wizardingcode-pack-laravel",
  });
  // With an active item: the part on the status line, at SessionStart and at every prompt; a missing pack counted.
  const gone = registerPack(userDir, writePack({ name: "wizardingcode-pack-gone" }), "command");
  if ("refused" in gone) throw new Error(gone.refused);
  rmSync(gone.root, { recursive: true });
  const ctx = hookContext({ session_id: "s3", cwd: root }, env);
  const work = createWork(ctx.paths, "Change the model");
  addCriterion(work, "x");
  saveWork(ctx.paths, work);
  expect(text(ctx)).toContain(", packs: 2 (1 missing).");
  expect(JSON.stringify(onPrompt(ctx))).toContain(", packs: 2 (1 missing).");
  // A garbage registry: nothing changes and the session goes on.
  writeFileSync(registry, "{not json");
  expect(text(hookContext({ session_id: "s4", cwd: root }, env))).toContain(
    ", packs: 2 (1 missing).",
  );
  expect(listPacks(userDir).map((p) => p.name)).toEqual([
    "wizardingcode-pack-laravel",
    "wizardingcode-pack-gone",
  ]);
});

test("SP6-T2 AC-6 (round 2): a pack the hooks cannot read costs the session nothing, discovery's lines reach the register and never the context, and a prompt with no item says nothing of packs", () => {
  const home = tempDir("home-");
  const registry = join(home, ".claude", "plugins", "installed_plugins.json");
  mkdirSync(dirname(registry), { recursive: true });
  const laravel = writePack();
  writeFileSync(
    registry,
    JSON.stringify({
      version: 1,
      plugins: {
        "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: laravel, version: "0.1.0" }],
      },
    }),
  );
  const root = makeRepo({
    "composer.json": JSON.stringify({ scripts: { test: "phpunit" } }),
    artisan: "x",
    "src/a.php": "x",
  });
  const base = testEnv();
  const env = { ...base, HOME: home, CLAUDE_PLUGIN_ROOT: "/x" };
  const text = (ctx: ReturnType<typeof hookContext>) =>
    (onSessionStart(ctx, { source: "startup" }).hookSpecificOutput as { additionalContext: string })
      .additionalContext;
  const decision = (r: Record<string, unknown>) =>
    (r.hookSpecificOutput as { permissionDecision?: string } | undefined)?.permissionDecision;
  const first = hookContext({ session_id: "s1", cwd: root }, env);
  const started = text(first);
  // The discovery's line is in the register, not in the context.
  expect(started).not.toContain("registered (wizardingcode-pack-laravel@m)");
  expect(
    listDecisions(first.paths)
      .filter((d) => d.kind === "pack")
      .map((d) => d.text),
  ).toEqual([
    "pack discovery: wizardingcode-pack-laravel 0.1.0 registered (wizardingcode-pack-laravel@m)",
  ]);
  // A prompt with no active item says nothing of packs.
  expect(JSON.stringify(onPrompt(first))).not.toContain("packs");
  // The pack's knowledge file becomes a directory: the full listing says unreadable and serves
  // nothing; the hooks count with the quick listing (the root and the manifest alone) and every
  // hook still answers.
  rmSync(join(laravel, "knowledge", "laravel.md"));
  mkdirSync(join(laravel, "knowledge", "laravel.md"));
  const userDir = join(base.WIZARDINGCODE_HOME ?? "", "crew");
  expect(listPacks(userDir).map((p) => p.state.kind)).toEqual(["unreadable"]);
  expect(listPacks(userDir, { quick: true }).map((p) => p.state.kind)).toEqual(["ok"]);
  const ctx = hookContext({ session_id: "s2", cwd: root }, env);
  const work = createWork(ctx.paths, "Change the model");
  addCriterion(work, "x");
  saveWork(ctx.paths, work);
  expect(text(ctx)).toContain(", packs: 1.");
  expect(JSON.stringify(onPrompt(ctx))).toContain(", packs: 1.");
  const owned = `echo x > .crew/work/${work.id}/evidence.json`;
  expect(decision(onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command: owned } }))).toBe(
    "deny",
  );
  // A refusal that stands at every start enters the register once, not once per start (round 3).
  const stale = writePack({ name: "wizardingcode-pack-stale", core: ">=99.0.0" });
  writeFileSync(
    registry,
    JSON.stringify({
      version: 1,
      plugins: {
        "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: laravel, version: "0.1.0" }],
        "wizardingcode-pack-stale@m": [{ scope: "user", installPath: stale, version: "0.1.0" }],
      },
    }),
  );
  text(hookContext({ session_id: "s3", cwd: root }, env));
  text(hookContext({ session_id: "s4", cwd: root }, env));
  const refusals = listDecisions(ctx.paths)
    .filter((d) => d.kind === "pack")
    .map((d) => d.text)
    .filter((t) => t.includes("wizardingcode-pack-stale@m"));
  expect(refusals).toEqual([
    expect.stringContaining(
      "pack discovery: wizardingcode-pack-stale@m: core >=99.0.0 needs an engine at or above 99.0.0",
    ),
  ]);
});

test("CON3-AC-4: the SessionStart context names the running engine's version (finding 66)", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const start = handleHook(
    "session-start",
    { session_id: "s", cwd: root, source: "startup" },
    testEnv(),
  ) as {
    hookSpecificOutput?: { additionalContext: string };
  };
  const text = start.hookSpecificOutput?.additionalContext ?? "";
  expect(text).toContain("WizardingCode Developer Crew is active in this repository.");
  expect(text).toContain(`Engine: crew ${VERSION}.`);
});
