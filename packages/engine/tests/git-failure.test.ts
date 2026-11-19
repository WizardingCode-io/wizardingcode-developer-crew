// Which git command failed (item 2026-11-19-003, finding 249): where git cannot answer, the engine
// counts every watched file as changed, and the refusal of a `before` says which command failed and
// what git wrote. The engine's answer is the first one; the command is asked again only for its words.
import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectProfile } from "../src/detect/index.ts";
import { emptyEvidence } from "../src/evidence.ts";
import { changedWatchedPaths, takeGitFailure } from "../src/fingerprint.ts";
import { GIT_OUTPUT_BYTES } from "../src/fs.ts";
import { recordTdd } from "../src/tdd.ts";
import { addCriterion, createWork } from "../src/work.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const CLAUSE = "; git could not answer, so every watched file was counted (";
const DIFF = "git diff --name-only --no-renames -z ";

/** A checkout with one watched source, an item and its preserve criterion. */
function checkout() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh run-tests.sh" } }),
    "run-tests.sh": "exit 0\n",
    "src/x.mjs": "a\n",
  });
  const paths = repoPaths(root, testEnv());
  const profile = detectProfile(root);
  const work = createWork(paths, "refactor");
  const preserve = addCriterion(work, "keep", "preserve");
  const before = () => recordTdd(paths, work, emptyEvidence(), profile, preserve.id, "before");
  const usual = (named: string) =>
    `the watched sources already differ from the item's base (${named}): a before recorded now is not a baseline; record it before the change, or make ${preserve.id} observed with the reason`;
  return { root, paths, profile, work, before, usual };
}

/** The row's own `git`, first on a PATH the row sets, calling the real one by its absolute path. */
function withShim<T>(script: (real: string) => string, run: () => Promise<T>): Promise<T> {
  const real = execFileSync("sh", ["-c", "command -v git"], { encoding: "utf8" }).trim();
  const bin = tempDir("crew-git-shim-");
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, "git"), `#!/bin/sh\n${script(real)}\n`);
  chmodSync(join(bin, "git"), 0o755);
  const kept = process.env.PATH;
  process.env.PATH = `${bin}:${kept ?? ""}`;
  return run().finally(() => {
    if (kept === undefined) delete process.env.PATH;
    else process.env.PATH = kept;
  });
}

test("git-failure AC-1 (a), (b), (c): an unreadable index is named in the refusal with git's own line, a sound checkout's refusal is as it was, and a note nobody took is not carried into it", async () => {
  const broken = checkout();
  writeFileSync(join(broken.root, ".git", "index"), "garbage");
  const refused = await broken.before();
  expect(refused.ok).toBe(false);
  const message = refused.message ?? "";
  // Every watched file is counted, as before this item, and the usual words come first.
  expect(message.startsWith(broken.usual("package.json, src/x.mjs"))).toBe(true);
  const clause = message.slice(broken.usual("package.json, src/x.mjs").length);
  expect(clause.startsWith(`${CLAUSE}${DIFF}`)).toBe(true);
  expect(clause).toMatch(/: (?:fatal|error): .*index/);
  expect(clause.endsWith(")")).toBe(true);
  expect(clause).not.toContain("asked again");
  // The refusal took the note.
  expect(takeGitFailure()).toBeNull();

  // (b) git answering, a source differing: the fixed sentence and nothing after it.
  const sound = checkout();
  write(sound.root, "src/x.mjs", "b\n");
  expect((await sound.before()).message).toBe(sound.usual("src/x.mjs"));

  // (c) a note left by a caller that takes none, then a refusal elsewhere: no word of it.
  expect(changedWatchedPaths(broken.root, broken.profile, broken.work).length).toBeGreaterThan(0);
  expect((await sound.before()).message).toBe(sound.usual("src/x.mjs"));
  // And left again, it is there for the one that takes it.
  changedWatchedPaths(broken.root, broken.profile, broken.work);
  expect(takeGitFailure()).toContain(DIFF);
  expect(takeGitFailure()).toBeNull();
});

test("git-failure AC-1 (d): with no git to be found the refusal holds the command and the error's own line", async () => {
  const c = checkout();
  const kept = process.env.PATH;
  process.env.PATH = tempDir("crew-no-git-");
  try {
    const refused = await c.before();
    expect(refused.ok).toBe(false);
    const message = refused.message ?? "";
    expect(message).toContain(`${CLAUSE}${DIFF}`);
    expect(message).toMatch(/: (?:ENOENT|Executable not found in \$PATH: "git")\)$/);
    expect(message).not.toContain("fatal:");
    expect(message).not.toContain("asked again");
  } finally {
    if (kept === undefined) delete process.env.PATH;
    else process.env.PATH = kept;
  }
});

test("git-failure AC-1 (e): a git that fails once in silence and answers after is still a failure, and the note says it answered when asked again", async () => {
  const c = checkout();
  const mark = join(tempDir("crew-git-once-"), "failed");
  mkdirSync(join(mark, ".."), { recursive: true });
  const refused = await withShim(
    (real) =>
      `if [ "$1" = diff ] && [ ! -e "${mark}" ]; then : > "${mark}"; exit 1; fi\nexec "${real}" "$@"`,
    c.before,
  );
  // Nothing differs in this checkout: the refusal is given because the first answer was a failure.
  expect(refused.ok).toBe(false);
  const message = refused.message ?? "";
  expect(message.startsWith(c.usual("package.json, src/x.mjs"))).toBe(true);
  expect(message).toContain(`${CLAUSE}${DIFF}`);
  expect(message.endsWith("; it answered when asked again)")).toBe(true);
  // With the shim gone the same checkout has nothing to refuse.
  expect((await c.before()).ok).toBe(true);
});

test("git-failure AC-1 (f): git's line is cut at 200 characters and loses its control characters", async () => {
  const c = checkout();
  const refused = await withShim(
    () =>
      `if [ "$1" = diff ]; then printf 'fatal: a\\033[31m bell\\007 %s\\n' "$(printf 'x%.0s' $(seq 1 400))" >&2; exit 128; fi\nexit 0`,
    c.before,
  );
  const message = refused.message ?? "";
  const note = message.slice(message.indexOf(CLAUSE) + CLAUSE.length, -1);
  const said = note.slice(note.indexOf(": ") + 2);
  expect(said.startsWith("fatal: a[31m bell x")).toBe(true);
  expect(said.endsWith("…")).toBe(true);
  expect([...said].length).toBe(201);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the row asks that none is left
  expect(/[\u0000-\u001f\u007f]/.test(message)).toBe(false);
});

test("git-failure AC-1 (g), (h): the second ask is made in the C locale, and git's fatal line is kept where a warning stands before it", async () => {
  const c = checkout();
  // The row's own locale for the call, so the C the clause shows can only be the engine's doing,
  // whatever the machine sets; put back after, as PATH is.
  const kept = process.env.LC_ALL;
  process.env.LC_ALL = "en_US.UTF-8";
  let message = "";
  try {
    const refused = await withShim(
      () =>
        `if [ "$1" = diff ]; then printf 'warning: something else\\nhint: try this\\nfatal:\\tlc=%s\\n' "$LC_ALL" >&2; exit 128; fi\nexit 0`,
      c.before,
    );
    message = refused.message ?? "";
  } finally {
    if (kept === undefined) delete process.env.LC_ALL;
    else process.env.LC_ALL = kept;
  }
  // The fatal line and not the warning; its tab a space; and the locale the second ask was made in.
  expect(message).toMatch(/: fatal: lc=C\)$/);
  expect(message).not.toContain("warning:");
});

test("git-failure AC-1 (i): a listing larger than the engine reads fails the second ask as it failed the first, and is not taken for a fault that passed", async () => {
  const c = checkout();
  const refused = await withShim(
    () =>
      `if [ "$1" = diff ]; then head -c ${GIT_OUTPUT_BYTES + 1024 * 1024} /dev/zero; exit 0; fi\nexit 0`,
    c.before,
  );
  expect(refused.ok).toBe(false);
  const message = refused.message ?? "";
  expect(message.endsWith(`${CLAUSE}${DIFF}${c.work.baseCommit} --: ENOBUFS)`)).toBe(true);
  expect(message).not.toContain("asked again");
}, 60_000);

test("git-failure AC-2: finding 249 stands open with its six lines and its cause said as not found", () => {
  const findings = readFileSync(
    join(import.meta.dir, "..", "..", "..", "docs", "real-use", "findings.md"),
    "utf8",
  );
  const section = findings.split(/\n(?=### \d+\. )/).find((s) => s.startsWith("### 249. ")) ?? "";
  for (const line of ["Date", "What happened", "Cause", "Expected", "Evidence", "Outcome"])
    expect(section, line).toContain(`\n- ${line}: `);
  expect(/\n- Cause: (.*)/.exec(section)?.[1] ?? "").toStartWith("not found");
  expect(/\n- Outcome: (.*)/.exec(section)?.[1] ?? "").toStartWith("open");
  expect(section).toContain("2026-11-19");
  expect(section).toContain("finding 248");
});
