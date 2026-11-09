import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { quoted } from "../src/adapters.ts";
import { markPath, noteUpdated } from "../src/adapters-uncommitted.ts";
import { listDecisions } from "../src/decisions.ts";
import { adapterDeadline, onSessionStart } from "../src/hooks/session-start.ts";
import { onStop } from "../src/hooks/stop.ts";
import type { HookResponse } from "../src/hooks/types.ts";
import { canonical } from "../src/paths.ts";
import { ensureProfile } from "../src/profile.ts";
import {
  installRuntime,
  pluginRoot,
  RUNTIME_NAMES,
  RUNTIMES,
  type Runtime,
} from "../src/runtimes.ts";
import { loadState, updateState } from "../src/state.ts";
import { VERSION } from "../src/version.ts";
import { createWork } from "../src/work.ts";
import { git, hookContext, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

// Item 2026-11-08-002, Task 4: SessionStart refreshes the adapters before its baseline (AC-17, AC-4, AC-5, AC-21, AC-27, AC-11's SessionStart cases).

const FIXTURES = fileURLToPath(new URL("./fixtures/", import.meta.url));
/** The engine's own root under the sources: `plugins/core`, as the hook installs from it. */
const engineRoot = canonical(pluginRoot());

const context = (response: HookResponse) =>
  (response.hookSpecificOutput as { additionalContext: string }).additionalContext;

/**
 * A repository with `.crew/` and the given runtimes installed from `plugins/core` and committed;
 * `stale` edits one skill file (and the configuration when `staleConfig`) and commits again.
 */
function fixture(
  runtimes: Runtime[],
  options: { stale?: boolean; staleConfig?: boolean; parent?: string } = {},
) {
  const root = makeRepo({
    "README.md": "# test\n",
    ".crew/.gitignore": "local/\nwork/*/logs/\nwork/*/review/ui/\nworktrees/\n",
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
  });
  const project = options.parent ? join(options.parent, "project") : root;
  if (options.parent) {
    mkdirSync(options.parent, { recursive: true });
    // Move the repository under the parent so every path the hook sees carries its name.
    renameSync(root, project);
  }
  git(project, "config", "user.email", "crew@test.invalid");
  git(project, "config", "user.name", "Crew Test");
  const env = testEnv();
  // The engine's own profile, as a first crew command would write it.
  ensureProfile(repoPaths(project, env));
  const dirs = { project, home: env.HOME ?? "" };
  for (const runtime of runtimes) {
    const done = installRuntime(runtime, "project", dirs, engineRoot);
    if ("refused" in done) throw new Error(done.refused);
  }
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "adapters");
  if (options.stale !== false) {
    write(project, ".agents/skills/crew-method/SKILL.md", "# stale\n");
    if (options.staleConfig)
      for (const runtime of runtimes) {
        const config = join(project, runtime.config.project);
        writeFileSync(
          config,
          readFileSync(config, "utf8").replace(/"timeout(Sec)?": ?\d+/, '"timeout$1": 1'),
        );
      }
    git(project, "add", "-A");
    git(project, "commit", "-q", "-m", "stale");
  }
  return { project, env, paths: repoPaths(project, env) };
}

function hashesBelow(dir: string, base = dir): Record<string, string> {
  if (!existsSync(dir)) return {};
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = lstatSync(path);
    if (stat.isDirectory()) Object.assign(out, hashesBelow(path, base));
    else if (stat.isFile())
      out[path.slice(base.length + 1)] = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
  }
  return out;
}
const adapterFiles = (project: string) => ({
  ...hashesBelow(join(project, ".agents")),
  ...hashesBelow(join(project, ".github")),
});
const start = (
  f: { project: string; env: NodeJS.ProcessEnv },
  sessionId = "s",
  source = "startup",
) => onSessionStart(hookContext({ session_id: sessionId, cwd: f.project }, f.env), { source });

test("2026-11-08-002 AC-17: the recorded version reads nothing; any other version checks", () => {
  const same = fixture([RUNTIMES.copilot]);
  updateState(same.paths, (state) => {
    state.adapters = { [engineRoot]: VERSION };
  });
  const before = adapterFiles(same.project);
  const text = context(start(same));
  expect(text).not.toContain("adapters:");
  expect(adapterFiles(same.project)).toEqual(before);
  for (const recorded of ["99.0.0", "0.0.1"]) {
    const other = fixture([RUNTIMES.copilot]);
    updateState(other.paths, (state) => {
      state.adapters = { [engineRoot]: recorded };
    });
    expect(context(start(other)), recorded).toContain("adapters: copilot updated (");
    expect(loadState(other.paths).adapters?.[engineRoot], recorded).toBe(VERSION);
  }
});

test("2026-11-08-002 AC-4: a new version refreshes before the baseline", () => {
  const f = fixture([RUNTIMES.copilot], { staleConfig: true });
  const text = context(start(f));
  const engineLine = `Engine: crew ${VERSION}.`;
  const after = text.slice(text.indexOf(engineLine) + engineLine.length);
  expect(after.trimStart().startsWith("adapters: copilot updated (")).toBe(true);
  expect(text).toContain("Commit: git add -A -- ");
  expect(text).toContain(`git commit -m 'adapters refreshed by crew ${VERSION}'`);
  expect(loadState(f.paths).adapters?.[engineRoot]).toBe(VERSION);
  const stop = onStop(hookContext({ session_id: "s", cwd: f.project }, f.env)) as {
    decision?: string;
  };
  expect(stop.decision).toBeUndefined();
  expect(listDecisions(f.paths).filter((d) => d.kind === "adapters")).toHaveLength(1);
  // Dedupe: a refusal that stands is written once.
  const broken = fixture([RUNTIMES.copilot], { stale: false });
  const config = join(broken.project, ".github", "hooks", "crew.json");
  writeFileSync(config, readFileSync(config, "utf8").trimEnd().replace(/\}$/, ""));
  write(broken.project, ".agents/skills/crew-method/SKILL.md", "# stale\n");
  git(broken.project, "add", "-A");
  git(broken.project, "commit", "-q", "-m", "broken config");
  expect(context(start(broken))).toContain("copilot refused");
  expect(context(start(broken))).toContain("copilot refused");
  expect(listDecisions(broken.paths).filter((d) => d.kind === "adapters")).toHaveLength(1);
});

test("2026-11-08-002 AC-11 (SessionStart): another live session and a resumed start hold the write", () => {
  const live = fixture([RUNTIMES.copilot], { staleConfig: true });
  updateState(live.paths, (state) => {
    state.sessions.other = { baseline: null, stopBlocks: 0, seenAt: new Date().toISOString() };
  });
  const before = adapterFiles(live.project);
  expect(context(start(live))).toContain("copilot stale (a session is live)");
  expect(adapterFiles(live.project)).toEqual(before);
  expect(loadState(live.paths).adapters).toBeUndefined();
  // A resumed start keeps its earlier baseline, so it writes nothing.
  const resumed = fixture([RUNTIMES.copilot], { stale: false });
  start(resumed);
  expect(loadState(resumed.paths).adapters?.[engineRoot]).toBe(VERSION);
  write(resumed.project, ".agents/skills/crew-method/SKILL.md", "# stale\n");
  const config = join(resumed.project, ".github", "hooks", "crew.json");
  writeFileSync(
    config,
    readFileSync(config, "utf8").replace(/"timeoutSec": ?\d+/, '"timeoutSec": 1'),
  );
  git(resumed.project, "add", "-A");
  git(resumed.project, "commit", "-q", "-m", "stale");
  updateState(resumed.paths, (state) => {
    state.adapters = { [engineRoot]: "0.0.1" };
  });
  const resumedBefore = adapterFiles(resumed.project);
  expect(context(start(resumed, "s", "resume"))).toContain("copilot stale (a resumed session)");
  expect(adapterFiles(resumed.project)).toEqual(resumedBefore);
  expect(loadState(resumed.paths).adapters?.[engineRoot]).toBe("0.0.1");
});

test("2026-11-08-002 AC-5: a throw in the adapter step keeps the start", () => {
  const f = fixture([RUNTIMES.copilot]);
  mkdirSync(f.paths.localDir, { recursive: true });
  writeFileSync(join(f.paths.localDir, "adapters"), "a file where the lock folder goes\n");
  const text = context(start(f));
  expect(text).toContain(`Engine: crew ${VERSION}.`);
  expect(text).toContain("adapters: not checked (");
  expect(loadState(f.paths).sessions.s?.baseline).not.toBeNull();
  // The hostile path (AC-24's SessionStart case): the thrown message carries it, cleaned.
  const parent = join(tempDir("crew-evil-"), "evil\n\x1b[2J");
  const hostile = fixture([RUNTIMES.copilot], { parent });
  mkdirSync(hostile.paths.localDir, { recursive: true });
  writeFileSync(join(hostile.paths.localDir, "adapters"), "a file\n");
  const hostileText = context(start(hostile));
  const line = hostileText.slice(hostileText.indexOf("adapters: not checked ("));
  const message = line.slice("adapters: not checked (".length, line.indexOf(")."));
  expect(line).not.toContain("\n");
  expect(line).not.toContain("\x1b");
  expect(message.length).toBeLessThanOrEqual(200);
});

test("2026-11-08-002 AC-21: the time budget keeps the context", () => {
  const f = fixture([RUNTIMES.copilot]);
  adapterDeadline.ms = -1;
  try {
    const text = context(start(f));
    expect(text).toContain(`Engine: crew ${VERSION}.`);
    expect(text).toContain("copilot stale (time budget)");
    expect(loadState(f.paths).adapters).toBeUndefined();
    expect(loadState(f.paths).sessions.s?.baseline).not.toBeNull();
  } finally {
    adapterDeadline.ms = 8000;
  }
});

test("2026-11-08-002 AC-27: no baseline while a refresh writes", () => {
  const f = fixture([RUNTIMES.copilot], { staleConfig: true });
  updateState(f.paths, (state) => {
    state.sessions.other = { baseline: null, stopBlocks: 0, seenAt: new Date().toISOString() };
  });
  const config = join(f.project, ".github", "hooks", "crew.json");
  const hold = (ms: string, text: string) => {
    const marker = join(tempDir("crew-marker-"), "held");
    const holder = Bun.spawn(
      [
        "bun",
        join(FIXTURES, "hold-adapters-lock.ts"),
        join(f.paths.localDir, "adapters"),
        marker,
        ms,
        config,
        text,
      ],
      { stdout: "ignore", stderr: "inherit" },
    );
    const until = Date.now() + 5000;
    while (!existsSync(marker) && Date.now() < until) Bun.sleepSync(20);
    if (!existsSync(marker)) throw new Error("the holder never took the lock");
    return holder;
  };
  const written = `${readFileSync(config, "utf8")}\n`;
  const holder = hold("1000", written);
  try {
    const began = Date.now();
    const text = context(start(f));
    expect(Date.now() - began).toBeGreaterThanOrEqual(900);
    expect(text).toContain("copilot stale (a session is live)");
    expect(readFileSync(config, "utf8")).toBe(written);
    const stop = onStop(hookContext({ session_id: "s", cwd: f.project }, f.env)) as {
      decision?: string;
    };
    expect(stop.decision).toBeUndefined();
  } finally {
    holder.kill();
  }
  // The wait outruns the deadline: the line says so and the baseline is taken anyway.
  const slow = hold("3000", `${written}\n`);
  adapterDeadline.ms = 1000;
  try {
    const began = Date.now();
    const text = context(start(f, "t"));
    expect(Date.now() - began).toBeLessThan(2500);
    expect(text).toContain("another session is updating");
    expect(loadState(f.paths).sessions.t?.baseline).not.toBeNull();
  } finally {
    adapterDeadline.ms = 8000;
    slow.kill();
  }
});

test("2026-11-08-002 timing: the adapter step with the five runtimes installed", () => {
  const runtimes = RUNTIME_NAMES.filter((n) => n !== "claude").map((n) => RUNTIMES[n]);
  const f = fixture(runtimes);
  const began = Date.now();
  const text = context(start(f));
  const ms = Date.now() - began;
  expect(text).toContain("adapters: ");
  if (process.env.CREW_TIMING === "1") console.log(`adapter step with five runtimes: ${ms} ms`);
});

// Item 2026-11-09-001, Task 2: SessionStart reminds from the not-committed mark (AC-2, AC-3, AC-5, AC-6, AC-10, AC-13, AC-14).

const SKILL_PAGE = ".agents/skills/crew-method/SKILL.md";
/** The context after the engine's line: where the adapters text stands when there is one. */
const afterEngine = (text: string) => {
  const engineLine = `Engine: crew ${VERSION}.`;
  return text.slice(text.indexOf(engineLine) + engineLine.length).trimStart();
};
const reminderOf = (version: string, pathspecs: string) =>
  `adapters: copilot updated by crew ${version} and not committed. Commit: git add -A -- ${pathspecs} && git commit -m 'adapters refreshed by crew ${version}'.`;
/** A mark entry for Copilot alone, at the checkout's `HEAD` of this moment. */
const copilotEntry = (project: string, version: string) => ({
  version,
  at: new Date().toISOString(),
  head: git(project, "rev-parse", "HEAD"),
  runtimes: [{ name: "copilot" as const, config: false }],
  register: false,
});

/** A second engine root that holds a bundle: copies of the plugin's bundle, skill and agents. */
function otherRoot(): string {
  const at = tempDir("crew-other-root-");
  mkdirSync(join(at, "dist"), { recursive: true });
  cpSync(join(engineRoot, "dist", "crew.mjs"), join(at, "dist", "crew.mjs"));
  cpSync(join(engineRoot, "skills", "crew"), join(at, "skills", "crew"), { recursive: true });
  cpSync(join(engineRoot, "agents"), join(at, "agents"), { recursive: true });
  return realpathSync(at);
}

test("2026-11-09-001 AC-2: at the recorded version a start reminds from the mark and reads no adapter", () => {
  const f = fixture([RUNTIMES.copilot]);
  // A configuration that keeps its root and no refresh accepts: read, it would say copilot refused.
  const config = join(f.project, ".github", "hooks", "crew.json");
  writeFileSync(config, readFileSync(config, "utf8").trimEnd().replace(/\}$/, ""));
  git(f.project, "add", "-A");
  git(f.project, "commit", "-q", "-m", "a configuration no refresh accepts");
  updateState(f.paths, (state) => {
    state.adapters = { [engineRoot]: VERSION };
  });
  noteUpdated(f.paths, engineRoot, copilotEntry(f.project, VERSION));
  write(f.project, SKILL_PAGE, "# edited and not committed\n");
  const before = adapterFiles(f.project);
  const text = context(start(f));
  expect(afterEngine(text).startsWith(reminderOf(VERSION, "'.agents/skills/crew-method'"))).toBe(
    true,
  );
  expect(text).not.toContain("refused");
  expect(adapterFiles(f.project)).toEqual(before);
});

test("2026-11-09-001 AC-3: a start on another root reminds from the same mark", () => {
  const other = otherRoot();
  const root = makeRepo({
    "README.md": "# test\n",
    ".crew/.gitignore": "local/\nwork/*/logs/\nwork/*/review/ui/\nworktrees/\n",
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
  });
  git(root, "config", "user.email", "crew@test.invalid");
  git(root, "config", "user.name", "Crew Test");
  const env = testEnv();
  const paths = repoPaths(root, env);
  ensureProfile(paths);
  const done = installRuntime(
    RUNTIMES.copilot,
    "project",
    { project: root, home: env.HOME ?? "" },
    other,
  );
  if ("refused" in done) throw new Error(done.refused);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "an adapter on another root");
  noteUpdated(paths, other, copilotEntry(root, "9.9.9"));
  write(root, SKILL_PAGE, "# edited and not committed\n");
  const text = context(start({ project: root, env }));
  expect(afterEngine(text).startsWith(reminderOf("9.9.9", "'.agents/skills/crew-method'"))).toBe(
    true,
  );
});

test("2026-11-09-001 AC-5: once committed the reminder stops and the mark goes", () => {
  const f = fixture([RUNTIMES.copilot], { stale: false });
  updateState(f.paths, (state) => {
    state.adapters = { [engineRoot]: VERSION };
  });
  // With no mark a start says nothing of the adapters.
  expect(context(start(f))).not.toContain("adapters:");
  noteUpdated(f.paths, engineRoot, copilotEntry(f.project, VERSION));
  write(f.project, SKILL_PAGE, "# edited\n");
  expect(context(start(f))).toContain("and not committed");
  git(f.project, "add", "-A");
  git(f.project, "commit", "-q", "-m", "adapters refreshed");
  expect(context(start(f))).not.toContain("adapters:");
  expect(existsSync(markPath(f.paths))).toBe(false);
  // Two roots that differ in a path: Copilot's agents are dirty, Cursor's paths are clean.
  noteUpdated(f.paths, engineRoot, copilotEntry(f.project, VERSION));
  noteUpdated(f.paths, "/r/other", {
    version: "1.0.0",
    at: new Date().toISOString(),
    head: git(f.project, "rev-parse", "HEAD"),
    runtimes: [{ name: "cursor", config: false }],
    register: false,
  });
  const agent = git(f.project, "ls-files", ".github/agents").split("\n")[0] as string;
  write(f.project, agent, "edited and not committed\n");
  expect(
    afterEngine(context(start(f))).startsWith(reminderOf(VERSION, "'.github/agents/crew-*'")),
  ).toBe(true);
  expect(Object.keys(JSON.parse(readFileSync(markPath(f.paths), "utf8")))).toEqual([engineRoot]);
});

test("2026-11-09-001 AC-6: the start that updates says it once", () => {
  const f = fixture([RUNTIMES.copilot]);
  const text = context(start(f));
  expect(
    afterEngine(text).startsWith(
      `adapters: copilot updated (1 differed, 0 removed); applies from each updated runtime's next session. Commit: git add -A -- '.agents/skills/crew-method' '.crew/decisions.json' && git commit -m 'adapters refreshed by crew ${VERSION}'.`,
    ),
  ).toBe(true);
  expect(text.split("Commit:")).toHaveLength(2);
  expect(text).not.toContain("and not committed");
});

test("2026-11-09-001 AC-9 (SessionStart): a status that fails is said in the adapters text, and the context stays", () => {
  // A folder with an empty `.git`: git answers that it is no repository, to the mark's reader too.
  const root = tempDir("crew-broken-git-");
  write(root, ".crew/.gitignore", "local/\n");
  write(root, "package.json", JSON.stringify({ scripts: { test: "exit 0" } }));
  const env = testEnv();
  const paths = repoPaths(root, env);
  ensureProfile(paths);
  mkdirSync(join(root, ".git"));
  noteUpdated(paths, "/r/a", {
    version: "1.2.3",
    at: new Date().toISOString(),
    head: "0".repeat(40),
    runtimes: [{ name: "copilot", config: false }],
    register: false,
  });
  const text = context(start({ project: root, env }));
  expect(
    afterEngine(text).startsWith(
      "adapters: not-committed check failed (fatal: not a git repository",
    ),
  ).toBe(true);
  expect(text).not.toContain("Commit:");
  expect(existsSync(markPath(paths))).toBe(true);
});

test("2026-11-09-001 AC-10: a mark that cannot be written is said, and the command is still printed", () => {
  const f = fixture([RUNTIMES.copilot]);
  // A folder where the mark goes: the rename of the temporary file over it throws.
  mkdirSync(markPath(f.paths), { recursive: true });
  writeFileSync(join(markPath(f.paths), "in-the-way"), "");
  const text = context(start(f));
  expect(text).toContain("copilot updated (1 differed, 0 removed)");
  expect(text).toContain("the not-committed mark was not written (");
  expect(text).toContain("Commit: git add -A -- '.agents/skills/crew-method'");
  expect(loadState(f.paths).adapters?.[engineRoot]).toBe(VERSION);
});

test("2026-11-09-001 AC-13: a throw in the adapter step changes the adapters text alone", () => {
  const f = fixture([RUNTIMES.copilot], { stale: false });
  mkdirSync(f.paths.localDir, { recursive: true });
  const inTheWay = join(f.paths.localDir, "adapters");
  writeFileSync(inTheWay, "a file where the lock folder goes\n");
  const thrown = context(start(f));
  const thrownBaseline = loadState(f.paths).sessions.s?.baseline;
  rmSync(inTheWay);
  const plain = context(start(f));
  const plainBaseline = loadState(f.paths).sessions.s?.baseline;
  const sentence = /adapters: not checked \(.*?\)\. /g;
  expect(thrown.match(sentence)).toHaveLength(1);
  expect(thrown.replace(sentence, "")).toBe(plain);
  expect(plain).not.toContain("adapters:");
  expect(typeof thrownBaseline).toBe("string");
  expect(thrownBaseline).toBe(plainBaseline);
});

test("2026-11-09-001 AC-14: an active item, a task worktree and no repository each hold the write, through SessionStart", () => {
  // An active item.
  const active = fixture([RUNTIMES.copilot]);
  createWork(active.paths, "an item");
  const activeBefore = adapterFiles(active.project);
  expect(context(start(active))).toContain("copilot stale (an item is active)");
  expect(adapterFiles(active.project)).toEqual(activeBefore);
  expect(loadState(active.paths).adapters).toBeUndefined();
  // A task worktree of the checkout.
  const main = fixture([RUNTIMES.copilot]);
  const lane = join(realpathSync(tempDir("crew-lane-")), "lane");
  git(main.project, "worktree", "add", "-q", lane, "-b", "lane");
  const laneBefore = adapterFiles(lane);
  expect(context(start({ project: lane, env: main.env }))).toContain(
    "copilot stale (a task worktree)",
  );
  expect(adapterFiles(lane)).toEqual(laneBefore);
  expect(loadState(repoPaths(lane, main.env)).adapters).toBeUndefined();
  // A folder that is no git repository, and never was one: removing a repository's `.git` right
  // after its commits races with the maintenance git detaches (seen on 2026-11-09).
  const bareRoot = tempDir("crew-nogit-");
  const bareEnv = testEnv();
  write(bareRoot, ".crew/.gitignore", "local/\n");
  write(bareRoot, "package.json", JSON.stringify({ scripts: { test: "exit 0" } }));
  const barePaths = repoPaths(bareRoot, bareEnv);
  ensureProfile(barePaths);
  const installed = installRuntime(
    RUNTIMES.copilot,
    "project",
    { project: bareRoot, home: bareEnv.HOME ?? "" },
    engineRoot,
  );
  if ("refused" in installed) throw new Error(installed.refused);
  write(bareRoot, SKILL_PAGE, "# stale\n");
  const bare = { project: bareRoot, env: bareEnv, paths: barePaths };
  const bareBefore = adapterFiles(bare.project);
  expect(context(start(bare))).toContain("copilot stale (not a git repository)");
  expect(adapterFiles(bare.project)).toEqual(bareBefore);
  expect(loadState(bare.paths).adapters).toBeUndefined();
});

test("2026-11-09-001 timing: the adapter step with a mark and with none", () => {
  const runtimes = RUNTIME_NAMES.filter((n) => n !== "claude").map((n) => RUNTIMES[n]);
  const f = fixture(runtimes, { stale: false });
  updateState(f.paths, (state) => {
    state.adapters = { [engineRoot]: VERSION };
  });
  const timed = () => {
    const began = Date.now();
    const text = context(start(f));
    return { text, ms: Date.now() - began };
  };
  const none = timed();
  expect(none.text).not.toContain("adapters:");
  noteUpdated(f.paths, engineRoot, copilotEntry(f.project, VERSION));
  write(f.project, SKILL_PAGE, "# edited\n");
  const one = timed();
  expect(one.text).toContain("and not committed");
  noteUpdated(f.paths, engineRoot, {
    ...copilotEntry(f.project, VERSION),
    runtimes: runtimes.map((r) => ({ name: r.name, config: true })),
  });
  const five = timed();
  expect(five.text).toContain("and not committed");
  if (process.env.CREW_TIMING === "1") {
    console.log(`adapter step with no mark: ${none.ms} ms`);
    console.log(`adapter step with one runtime marked: ${one.ms} ms`);
    console.log(`adapter step with five runtimes marked: ${five.ms} ms`);
  }
});

// Item 2026-11-09-003, Task 2: a refresh killed inside an install, a lock that is held, a step that throws (AC-2, AC-3, AC-20, AC-21, AC-40, AC-46).

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
/** A project whose Copilot adapter names another root and is stale, and a refresh of it killed inside the install. */
function killedInside() {
  const other = otherRoot();
  const root = makeRepo({
    "README.md": "# test\n",
    ".crew/.gitignore": "local/\nwork/*/logs/\nwork/*/review/ui/\nworktrees/\n",
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
  });
  git(root, "config", "user.email", "crew@test.invalid");
  git(root, "config", "user.name", "Crew Test");
  const env = testEnv();
  const paths = repoPaths(root, env);
  ensureProfile(paths);
  const done = installRuntime(
    RUNTIMES.copilot,
    "project",
    { project: root, home: env.HOME ?? "" },
    other,
  );
  if ("refused" in done) throw new Error(done.refused);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "an adapter on another root");
  write(root, SKILL_PAGE, "# stale\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "stale");
  const script = join(tempDir("crew-kill-"), "refresh.ts");
  writeFileSync(
    script,
    `import { writeFileSync } from "node:fs";
import { join } from "node:path";
const { refreshAdapters } = await import(${JSON.stringify(join(REPO, "packages/engine/src/adapters.ts"))});
const { resolvePaths } = await import(${JSON.stringify(join(REPO, "packages/engine/src/paths.ts"))});
const paths = resolvePaths(${JSON.stringify(root)});
if (!paths) throw new Error("crew is inactive in the fixture");
refreshAdapters(paths, {
  root: ${JSON.stringify(other)},
  version: "9.9.9",
  home: process.env.HOME ?? "",
  dryRun: false,
  deadline: null,
  resumed: false,
  activeItem: false,
  worktree: false,
  live: false,
  install: () => {
    writeFileSync(join(${JSON.stringify(root)}, ${JSON.stringify(SKILL_PAGE)}), "# half\\n");
    process.kill(process.pid, "SIGKILL");
    throw new Error("not reached");
  },
});
`,
  );
  const child = spawnSync(process.execPath, [script], { env, encoding: "utf8" });
  return { other, root, env, paths, child, lock: join(paths.localDir, "adapters", ".lock") };
}
const unfinishedElsewhere = (version: string) =>
  `copilot left unfinished by crew ${version} (an install cut short or failed): run crew runtime install copilot again with the crew of its root, such as ~/.local/share/wizardingcode-developer-crew/bin/crew, then commit`;

test("2026-11-09-003 AC-2: a refresh killed inside an install leaves the runtime unfinished, and another root says what to run", () => {
  const k = killedInside();
  expect(k.child.signal, k.child.stderr).toBe("SIGKILL");
  const mark = JSON.parse(readFileSync(markPath(k.paths), "utf8"));
  expect(mark[k.other].runtimes).toEqual([{ name: "copilot", config: false, unfinished: true }]);
  expect(mark[k.other].version).toBe("9.9.9");
  expect(existsSync(k.lock)).toBe(true);
  // Ten seconds on: the dead process's lock is stale, and the next taker breaks it.
  const past = new Date(Date.now() - 20_000);
  utimesSync(k.lock, past, past);
  const text = context(start({ project: k.root, env: k.env }));
  expect(afterEngine(text).startsWith(`adapters: ${unfinishedElsewhere("9.9.9")}. `)).toBe(true);
  expect(text).not.toContain("Commit:");
});

test("2026-11-09-003 AC-46: while the lock is held the reader gives no instruction", () => {
  const k = killedInside();
  expect(k.child.signal, k.child.stderr).toBe("SIGKILL");
  const ahead = new Date(Date.now() + 60_000);
  utimesSync(k.lock, ahead, ahead);
  const ms = adapterDeadline.ms;
  adapterDeadline.ms = 200;
  try {
    const text = context(start({ project: k.root, env: k.env }));
    expect(
      afterEngine(text).startsWith(
        "adapters: copilot's install has not ended and the adapters lock is held: look again in ten seconds with crew status; another session is updating. ",
      ),
    ).toBe(true);
    expect(text).not.toContain("run crew runtime install");
  } finally {
    adapterDeadline.ms = ms;
  }
  const past = new Date(Date.now() - 20_000);
  utimesSync(k.lock, past, past);
  const later = context(start({ project: k.root, env: k.env }, "s2"));
  expect(afterEngine(later).startsWith(`adapters: ${unfinishedElsewhere("9.9.9")}. `)).toBe(true);
});

const unfinishedHere = (version: string) =>
  `copilot left unfinished by crew ${version} (an install cut short or failed): run crew runtime install copilot again, then commit`;
/** Runs `run` with a folder read-only, and puts its mode back. */
function readOnly<T>(folder: string, run: () => T): T {
  chmodSync(folder, 0o555);
  try {
    return run();
  } finally {
    chmodSync(folder, 0o755);
  }
}

test("2026-11-09-003 AC-3: on its own root an unfinished runtime's start says what to run, and gives no advice to commit", () => {
  const unfinished = (f: { project: string; paths: ReturnType<typeof repoPaths> }) =>
    noteUpdated(f.paths, engineRoot, {
      ...copilotEntry(f.project, VERSION),
      runtimes: [{ name: "copilot", config: false, unfinished: true }],
    });
  // A tracked file the cut install rewrote.
  const f = fixture([RUNTIMES.copilot]);
  unfinished(f);
  write(f.project, SKILL_PAGE, "# half written\n");
  const text = afterEngine(context(start(f)));
  expect(text).toContain("copilot stale (uncommitted changes in ");
  expect(text).toContain(unfinishedHere(VERSION));
  expect(text).not.toContain("Commit:");
  expect(text).not.toContain("commit or restore them first");
  // A file the cut install created.
  const g = fixture([RUNTIMES.copilot]);
  unfinished(g);
  write(g.project, ".github/agents/crew-x.md", "half\n");
  const created = afterEngine(context(start(g)));
  expect(created).toContain("copilot stale (not committed: ");
  expect(created).toContain(unfinishedHere(VERSION));
  expect(created).not.toContain("commit them to adopt the adapter");
});

test("2026-11-09-003 AC-40 (SessionStart): a register that cannot be written is said beside the update and the command", () => {
  const f = fixture([RUNTIMES.copilot], { stale: false });
  // A first start, so everything a start writes once is written.
  start(f);
  write(f.project, SKILL_PAGE, "# stale\n");
  git(f.project, "add", "-A");
  git(f.project, "commit", "-q", "-m", "stale");
  updateState(f.paths, (state) => {
    state.adapters = { [engineRoot]: "0.0.1" };
  });
  const text = readOnly(join(f.project, ".crew"), () => afterEngine(context(start(f, "s2"))));
  expect(text).toContain("copilot updated (");
  expect(text).toContain("; the register entry was not written (EACCES");
  expect(text).toContain(". Commit: git add -A -- ");
});

test("2026-11-09-003 AC-20: a start whose adapter step throws still reads the mark", () => {
  // At the recorded version the start runs no refresh; its wait for the adapters lock throws.
  const staged = (marked: boolean) => {
    const f = fixture([RUNTIMES.copilot], { stale: false });
    updateState(f.paths, (state) => {
      state.adapters = { [engineRoot]: VERSION };
    });
    mkdirSync(join(f.paths.localDir, "adapters"), { recursive: true });
    if (marked) noteUpdated(f.paths, "/r/other", copilotEntry(f.project, "1.2.3"));
    write(f.project, SKILL_PAGE, "# edited and not committed\n");
    return f;
  };
  const notChecked = (f: { paths: ReturnType<typeof repoPaths> }) =>
    `not checked (${quoted(`EACCES: permission denied, mkdir '${join(f.paths.localDir, "adapters", ".lock")}'`)})`;
  const marked = staged(true);
  const text = readOnly(join(marked.paths.localDir, "adapters"), () => context(start(marked)));
  expect(
    afterEngine(text).startsWith(
      `adapters: copilot updated by crew 1.2.3 and not committed; ${notChecked(marked)}. Commit: git add -A -- '.agents/skills/crew-method' && git commit -m 'adapters refreshed by crew 1.2.3'. `,
    ),
  ).toBe(true);
  // With no mark the text is the one of before, and nothing else of the context changes.
  const bare = staged(false);
  const thrown = readOnly(join(bare.paths.localDir, "adapters"), () => context(start(bare)));
  const sentence = `adapters: ${notChecked(bare)}. `;
  expect(thrown).toContain(sentence);
  const plain = context(start(bare));
  expect(plain).not.toContain("adapters:");
  expect(thrown.replace(sentence, "")).toBe(plain);
});

test("2026-11-09-003 AC-21: a runtime of the root's entry that the same refresh did not update is named, and the command covers it", () => {
  const f = fixture([RUNTIMES.codex, RUNTIMES.copilot], { stale: false });
  // Codex's configuration goes, so its adapter is no longer this root's; the skill is made stale.
  rmSync(join(f.project, RUNTIMES.codex.config.project));
  write(f.project, SKILL_PAGE, "# stale\n");
  git(f.project, "add", "-A");
  git(f.project, "commit", "-q", "-m", "codex's configuration gone, the skill stale");
  updateState(f.paths, (state) => {
    state.adapters = { [engineRoot]: "0.0.1" };
  });
  noteUpdated(f.paths, engineRoot, {
    ...copilotEntry(f.project, VERSION),
    runtimes: [{ name: "codex", config: false }],
  });
  write(f.project, ".codex/agents/crew-x.md", "new\n");
  const text = afterEngine(context(start(f)));
  expect(text).toContain("copilot updated (");
  expect(text).toContain("; codex updated earlier and not committed");
  const command = text.slice(text.indexOf(". Commit: "));
  expect(command).toContain("'.codex/agents/crew-*'");
  expect(command).toContain("'.agents/skills/crew-method'");
});
