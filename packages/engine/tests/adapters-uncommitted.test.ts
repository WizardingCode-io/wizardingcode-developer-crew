import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  markPath,
  noteUpdated,
  readMarks,
  type UncommittedEntry,
  uncommittedAdapters,
} from "../src/adapters-uncommitted.ts";
import { type CrewPaths, canonical } from "../src/paths.ts";
import { installRuntime, pluginRoot, RUNTIMES } from "../src/runtimes.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

// Item 2026-11-09-001, Task 1: the not-committed mark (AC-4, AC-9, AC-11, AC-25, AC-26, AC-27, AC-31).

const engineRoot = canonical(pluginRoot());
const SKILL = ".agents/skills/crew-method/SKILL.md";
const REGISTER = ".crew/decisions.json";
const AT = "2026-11-09T00:00:00.000Z";

/** A repository with `.crew/` and Copilot's adapter installed from the engine's own root and committed. */
function project(ignore = "local/\n"): { root: string; paths: CrewPaths } {
  const root = makeRepo({ "README.md": "# test\n", ".crew/.gitignore": ignore });
  git(root, "config", "user.email", "crew@test.invalid");
  git(root, "config", "user.name", "Crew Test");
  const env = testEnv();
  const done = installRuntime(
    RUNTIMES.copilot,
    "project",
    { project: root, home: env.HOME ?? "" },
    engineRoot,
  );
  if ("refused" in done) throw new Error(done.refused);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "adapters");
  return { root, paths: repoPaths(root, env) };
}

const head = (root: string) => git(root, "rev-parse", "HEAD");
/** An entry whose commit is the checkout's `HEAD` of this moment. */
const entry = (root: string, over: Partial<UncommittedEntry> = {}): UncommittedEntry => ({
  version: "1.2.3",
  at: AT,
  head: head(root),
  runtimes: [{ name: "copilot", config: false }],
  register: true,
  ...over,
});
const run = (root: string, command: string) =>
  execFileSync("sh", ["-c", command], { cwd: root, stdio: "ignore" });
const commit = (root: string, message: string) => {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", message);
};
/** One tracked agent file of Copilot, by its path from the project root. */
const anAgent = (root: string) => git(root, "ls-files", ".github/agents").split("\n")[0] as string;

test("2026-11-09-001 AC-4: the command names only the pathspecs that hold a change, and runs as printed", () => {
  const p = project();
  noteUpdated(p.paths, "/r/a", entry(p.root));
  write(p.root, SKILL, "# edited\n");
  write(p.root, REGISTER, "[]\n");
  const reminder = uncommittedAdapters(p.paths, { clear: false });
  expect(reminder?.parts).toEqual(["copilot updated by crew 1.2.3 and not committed"]);
  expect(reminder?.roots).toEqual(["/r/a"]);
  expect(reminder?.command).toBe(
    "git add -A -- '.agents/skills/crew-method' '.crew/decisions.json' && git commit -m 'adapters refreshed by crew 1.2.3'",
  );
  run(p.root, reminder?.command ?? "false");
  expect(git(p.root, "status", "--porcelain")).toBe("");
  expect(uncommittedAdapters(p.paths, { clear: false })).toBeNull();

  // A register the project ignores is never named, so the command runs as printed.
  const ignoring = project();
  write(ignoring.root, ".gitignore", ".crew/\n");
  git(ignoring.root, "add", "-f", ".gitignore");
  git(ignoring.root, "commit", "-q", "-m", "ignore the crew folder");
  noteUpdated(ignoring.paths, "/r/a", entry(ignoring.root));
  write(ignoring.root, SKILL, "# edited\n");
  write(ignoring.root, REGISTER, "[]\n");
  const ignored = uncommittedAdapters(ignoring.paths, { clear: false });
  expect(ignored?.command).toBe(
    "git add -A -- '.agents/skills/crew-method' && git commit -m 'adapters refreshed by crew 1.2.3'",
  );
  run(ignoring.root, ignored?.command ?? "false");
  expect(git(ignoring.root, "status", "--porcelain")).toBe("");

  // The configuration when the install wrote it, and the agents when one of them changed.
  const config = project();
  noteUpdated(
    config.paths,
    "/r/a",
    entry(config.root, { runtimes: [{ name: "copilot", config: true }], register: false }),
  );
  const hooks = join(config.root, ".github", "hooks", "crew.json");
  writeFileSync(hooks, `${readFileSync(hooks, "utf8")}\n`);
  rmSync(join(config.root, anAgent(config.root)));
  expect(uncommittedAdapters(config.paths, { clear: false })?.command).toBe(
    "git add -A -- '.github/hooks/crew.json' '.github/agents/crew-*' && git commit -m 'adapters refreshed by crew 1.2.3'",
  );

  // Two roots: each pathspec once, the newest version in the message.
  const two = project();
  noteUpdated(two.paths, "/r/a", entry(two.root, { register: false }));
  noteUpdated(two.paths, "/r/b", entry(two.root, { version: "1.10.0", register: false }));
  write(two.root, SKILL, "# edited\n");
  const both = uncommittedAdapters(two.paths, { clear: false });
  expect(both?.parts).toEqual([
    "copilot updated by crew 1.2.3 and not committed",
    "copilot updated by crew 1.10.0 and not committed",
  ]);
  expect(both?.roots).toEqual(["/r/a", "/r/b"]);
  expect(both?.command).toBe(
    "git add -A -- '.agents/skills/crew-method' && git commit -m 'adapters refreshed by crew 1.10.0'",
  );
});

test("2026-11-09-001 AC-9: a mark that cannot be trusted says nothing, a status that fails is said, a busy lock clears nothing", () => {
  const p = project();
  write(p.root, SKILL, "# edited\n");
  const file = markPath(p.paths);
  mkdirSync(join(p.paths.localDir, "adapters"), { recursive: true });
  const good = entry(p.root);
  const shaped = (value: unknown) => JSON.stringify({ "/r/a": value });
  for (const text of [
    "not json",
    "[]",
    '"x"',
    shaped({ ...good, runtimes: [{ name: "claude", config: false }] }),
    shaped({ ...good, runtimes: [{ name: "nope", config: false }] }),
    shaped({ ...good, runtimes: [] }),
    shaped({ ...good, version: "1.2" }),
    shaped({ ...good, head: "zz" }),
    shaped({ ...good, register: "yes" }),
  ]) {
    writeFileSync(file, text);
    expect(readMarks(p.paths), text).toEqual({});
    expect(uncommittedAdapters(p.paths, { clear: false }), text).toBeNull();
  }
  // A folder where the file goes.
  rmSync(file);
  mkdirSync(file);
  expect(uncommittedAdapters(p.paths, { clear: true })).toBeNull();
  rmdirSync(file);

  // A status that fails: said through quotedText, the entry kept. The folder never was a
  // repository (an empty `.git` in it), so no git process of an earlier commit is still at work.
  const broken = tempDir("crew-broken-git-");
  write(broken, ".crew/.gitignore", "local/\n");
  mkdirSync(join(broken, ".git"));
  const brokenPaths = repoPaths(broken, testEnv());
  noteUpdated(brokenPaths, "/r/a", good);
  const failing = uncommittedAdapters(brokenPaths, { clear: true });
  expect(failing?.parts).toEqual([]);
  expect(failing?.command).toBeNull();
  expect(failing?.failed).toContain("not a git repository");
  expect(failing?.failed).not.toContain("\n");
  expect((failing?.failed ?? "").length).toBeLessThanOrEqual(200);
  expect(readMarks(brokenPaths)["/r/a"]).toEqual(good);

  // A clean entry under a busy adapters lock stays; with the lock free it goes, and the file with it.
  noteUpdated(p.paths, "/r/a", good);
  git(p.root, "checkout", "-q", "--", SKILL);
  const lock = join(p.paths.localDir, "adapters", ".lock");
  mkdirSync(lock);
  expect(uncommittedAdapters(p.paths, { clear: true })).toBeNull();
  expect(readMarks(p.paths)["/r/a"]).toEqual(good);
  rmdirSync(lock);
  expect(uncommittedAdapters(p.paths, { clear: true })).toBeNull();
  expect(existsSync(file)).toBe(false);
});

test("2026-11-09-001 AC-11: a second update on a root unites its entry", () => {
  const p = project();
  const first = head(p.root);
  noteUpdated(p.paths, "/r/a", entry(p.root, { version: "1.0.0", register: false }));
  write(p.root, "README.md", "# moved on\n");
  commit(p.root, "another commit");
  const second = head(p.root);
  expect(second).not.toBe(first);
  noteUpdated(
    p.paths,
    "/r/a",
    entry(p.root, {
      version: "1.1.0",
      at: "2026-11-10T00:00:00.000Z",
      runtimes: [
        { name: "codex", config: true },
        { name: "copilot", config: true },
      ],
      register: true,
    }),
  );
  expect(readMarks(p.paths)).toEqual({
    "/r/a": {
      version: "1.1.0",
      at: "2026-11-10T00:00:00.000Z",
      head: second,
      runtimes: [
        { name: "copilot", config: true },
        { name: "codex", config: true },
      ],
      register: true,
    },
  });
  noteUpdated(p.paths, "/r/a", entry(p.root, { version: "1.2.0", register: false }));
  const united = readMarks(p.paths)["/r/a"];
  expect(united?.register).toBe(true);
  expect(united?.version).toBe("1.2.0");
  expect(united?.runtimes).toEqual([
    { name: "copilot", config: true },
    { name: "codex", config: true },
  ]);
});

test("2026-11-09-001 AC-25: with no .git every entry is clean", () => {
  const root = tempDir("crew-nogit-");
  write(root, ".crew/.gitignore", "local/\n");
  write(root, SKILL, "# a skill nobody can commit\n");
  const paths = repoPaths(root, testEnv());
  noteUpdated(paths, "/r/a", {
    version: "1.2.3",
    at: AT,
    head: "0".repeat(40),
    runtimes: [{ name: "copilot", config: false }],
    register: true,
  });
  expect(uncommittedAdapters(paths, { clear: false })).toBeNull();
  expect(existsSync(markPath(paths))).toBe(true);
  expect(uncommittedAdapters(paths, { clear: true })).toBeNull();
  expect(existsSync(markPath(paths))).toBe(false);
});

test("2026-11-09-001 AC-26: the mark is written by rename, never through a link", () => {
  const p = project();
  const outside = join(tempDir("crew-outside-"), "target.json");
  writeFileSync(outside, "outside");
  mkdirSync(join(p.paths.localDir, "adapters"), { recursive: true });
  symlinkSync(outside, markPath(p.paths));
  const written = entry(p.root);
  noteUpdated(p.paths, "/r/a", written);
  const stat = lstatSync(markPath(p.paths));
  expect(stat.isSymbolicLink()).toBe(false);
  expect(stat.isFile()).toBe(true);
  expect(readFileSync(outside, "utf8")).toBe("outside");
  expect(readMarks(p.paths)["/r/a"]).toEqual(written);
});

test("2026-11-09-001 AC-27: a change is the refresh's only until a commit touches its path, and the register never decides", () => {
  // Committed, then edited again: the second edit is the person's.
  const p = project();
  noteUpdated(p.paths, "/r/a", entry(p.root, { register: false }));
  write(p.root, SKILL, "# what the refresh wrote\n");
  expect(uncommittedAdapters(p.paths, { clear: false })?.parts).toHaveLength(1);
  commit(p.root, "adapters refreshed");
  write(p.root, SKILL, "# the person's own edit, later\n");
  expect(uncommittedAdapters(p.paths, { clear: true })).toBeNull();
  expect(existsSync(markPath(p.paths))).toBe(false);

  // One path committed, another still the refresh's: only the second is named.
  const part = project();
  noteUpdated(
    part.paths,
    "/r/a",
    entry(part.root, { runtimes: [{ name: "copilot", config: true }], register: false }),
  );
  const agent = anAgent(part.root);
  write(part.root, SKILL, "# refreshed\n");
  write(part.root, agent, "refreshed\n");
  git(part.root, "add", "--", SKILL);
  git(part.root, "commit", "-q", "-m", "the skill alone");
  write(part.root, SKILL, "# edited after its commit\n");
  expect(uncommittedAdapters(part.paths, { clear: false })?.command).toBe(
    "git add -A -- '.github/agents/crew-*' && git commit -m 'adapters refreshed by crew 1.2.3'",
  );

  // The register alone never makes an entry uncommitted.
  const reg = project();
  noteUpdated(reg.paths, "/r/a", entry(reg.root));
  write(reg.root, REGISTER, "[]\n");
  expect(uncommittedAdapters(reg.paths, { clear: true })).toBeNull();
  expect(existsSync(markPath(reg.paths))).toBe(false);

  // A register committed after the refresh and changed again is not named beside the adapters.
  const later = project();
  noteUpdated(later.paths, "/r/a", entry(later.root));
  write(later.root, REGISTER, "[]\n");
  git(later.root, "add", "--", REGISTER);
  git(later.root, "commit", "-q", "-m", "the register");
  write(later.root, REGISTER, '[{"an":"item entry"}]\n');
  write(later.root, SKILL, "# refreshed\n");
  expect(uncommittedAdapters(later.paths, { clear: false })?.command).toBe(
    "git add -A -- '.agents/skills/crew-method' && git commit -m 'adapters refreshed by crew 1.2.3'",
  );

  // A commit this clone does not hold: every change counts.
  const unknown = project();
  noteUpdated(
    unknown.paths,
    "/r/a",
    entry(unknown.root, { head: "0".repeat(40), register: false }),
  );
  write(unknown.root, SKILL, "# refreshed\n");
  expect(uncommittedAdapters(unknown.paths, { clear: false })?.parts).toEqual([
    "copilot updated by crew 1.2.3 and not committed",
  ]);
});

test("2026-11-09-001 AC-31: an entry this engine does not recognise survives its writes", () => {
  const p = project();
  const future = {
    version: "9.0.0",
    at: AT,
    head: head(p.root),
    runtimes: [{ name: "a-runtime-of-the-future", config: false }],
    register: false,
    extra: 1,
  };
  mkdirSync(join(p.paths.localDir, "adapters"), { recursive: true });
  writeFileSync(
    markPath(p.paths),
    JSON.stringify({ "/r/new": future, "/r/a": entry(p.root, { register: false }) }),
  );
  const raw = () => JSON.parse(readFileSync(markPath(p.paths), "utf8")) as Record<string, unknown>;
  expect(readMarks(p.paths)["/r/new"]).toBeUndefined();
  expect(uncommittedAdapters(p.paths, { clear: false })).toBeNull();
  noteUpdated(p.paths, "/r/b", entry(p.root, { register: false }));
  expect(raw()["/r/new"]).toEqual(future);
  expect(Object.keys(raw()).sort()).toEqual(["/r/a", "/r/b", "/r/new"]);
  expect(uncommittedAdapters(p.paths, { clear: true })).toBeNull();
  expect(raw()).toEqual({ "/r/new": future });
});
