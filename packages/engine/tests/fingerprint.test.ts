import { expect, test } from "bun:test";
import { chmodSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { detectProfile } from "../src/detect/index.ts";
import { computeVerdict, emptyEvidence } from "../src/evidence.ts";
import {
  changedWatchedPaths,
  computeFingerprint,
  fingerprintMethod,
  gitChangedPaths,
  hashPaths,
  isWatched,
  MAX_WATCHED_FILES,
  reviewPatch,
} from "../src/fingerprint.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { WorkItem } from "../src/types.ts";
import { addCriterion, addSkip } from "../src/work.ts";
import { git, makeRepo, tempDir, write } from "./helpers.ts";

test("SP2b: reviewPatch is the change of the named paths since the base: tracked as a diff, untracked as additions, nothing else", () => {
  const root = makeRepo({ "src/a.ts": "const a = 1;\n", "src/keep.ts": "keep\n" });
  const base = git(root, "rev-parse", "HEAD");
  write(root, "src/a.ts", "const a = 2;\n");
  write(root, "src/new.ts", "fresh\n");
  write(root, "src/keep.ts", "changed but not asked for\n");
  const { patch, note } = reviewPatch(root, base, ["src/a.ts", "src/new.ts"]);
  expect(note).toBeNull();
  expect(patch).toContain("diff --git a/src/a.ts b/src/a.ts");
  expect(patch).toContain("-const a = 1;");
  expect(patch).toContain("+const a = 2;");
  expect(patch).toContain(
    "diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,1 @@\n+fresh\n",
  );
  expect(patch).not.toContain("src/keep.ts");
  // Committing mid-work hides nothing: the base is the same commit.
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "work");
  expect(reviewPatch(root, base, ["src/a.ts", "src/new.ts"]).patch).toContain("+fresh");
  expect(reviewPatch(root, base, [])).toEqual({
    patch: "# no changed files\n",
    note: "no changed files",
  });
});

test("SP2b minors: git receives file names, never patterns: a[1].ts is diffed and a1.ts is not pulled in", () => {
  const root = makeRepo({ "src/a1.ts": "one\n", "src/a[1].ts": "bracket\n" });
  const base = git(root, "rev-parse", "HEAD");
  write(root, "src/a1.ts", "one, changed\n");
  write(root, "src/a[1].ts", "bracket, changed\n");
  const { patch } = reviewPatch(root, base, ["src/a[1].ts"]);
  expect(patch).toContain("diff --git a/src/a[1].ts b/src/a[1].ts");
  expect(patch).toContain("+bracket, changed");
  expect(patch).not.toContain("src/a1.ts");
});

test("SP2b minors: a diff git could not produce says so in the patch, never an empty file beside a full files.txt", () => {
  const root = makeRepo({ "src/a.ts": "const a = 1;\n" });
  write(root, "src/a.ts", "const a = 2;\n");
  write(root, "src/new.ts", "fresh\n");
  // A base git does not know: the tracked diff fails; the untracked addition still follows the note.
  const { patch, note } = reviewPatch(root, "nope", ["src/a.ts", "src/new.ts"]);
  expect(note).toBe("git could not produce the diff of 1 tracked file since nope");
  expect(patch).toBe(
    "# git could not produce the diff of 1 tracked file since nope\ndiff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,1 @@\n+fresh\n",
  );
});

test("SP2b minors: with no base commit the untracked files are shown as additions, and the patch says what it cannot show", () => {
  const root = tempDir();
  git(root, "init", "-q", "-b", "main");
  write(root, "src/new.ts", "fresh\n");
  expect(reviewPatch(root, null, ["src/new.ts"])).toEqual({
    patch:
      "diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,1 @@\n+fresh\n",
    note: null,
  });
  // A file staged before any commit is tracked: with no base there is no diff of it, and the patch says so.
  git(root, "add", "src/new.ts");
  write(root, "src/b.ts", "b\n");
  const staged = reviewPatch(root, null, ["src/new.ts", "src/b.ts"]);
  expect(staged.note).toBe("no base commit: 1 tracked file not shown, untracked ones as additions");
  expect(staged.patch).toBe(
    "# no base commit: 1 tracked file not shown, untracked ones as additions\ndiff --git a/src/b.ts b/src/b.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/b.ts\n@@ -0,0 +1,1 @@\n+b\n",
  );
  // Outside git nothing can be cut, and the patch says that too.
  const plain = tempDir();
  write(plain, "src/a.ts", "x\n");
  expect(reviewPatch(plain, null, ["src/a.ts"])).toEqual({
    patch: "# outside git, no diff can be cut\n",
    note: "outside git, no diff can be cut",
  });
});

test("SP2b minors: a tracked file named as changed but equal to the base has no diff content, and the patch says so", () => {
  const root = makeRepo({ "src/a.ts": "x\n" });
  const base = git(root, "rev-parse", "HEAD");
  expect(reviewPatch(root, base, ["src/a.ts"])).toEqual({
    patch: "# the change has no diff content\n",
    note: "the change has no diff content",
  });
});

test("the fingerprint is stable and changes when a watched file changes", () => {
  const root = makeRepo({ "src/a.ts": "export const a = 1;\n", "README.md": "# r\n" });
  const profile = detectProfile(root);
  const before = computeFingerprint(root, profile);
  expect(before).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(computeFingerprint(root, profile)).toBe(before);
  write(root, "src/a.ts", "export const a = 2;\n");
  expect(computeFingerprint(root, profile)).not.toBe(before);
});

test("markdown and docs are not watched; untracked source files are", () => {
  const root = makeRepo({ "src/a.ts": "x", "README.md": "# r\n" });
  const profile = detectProfile(root);
  const before = computeFingerprint(root, profile);
  write(root, "README.md", "# changed\n");
  write(root, "docs/guide.txt", "notes");
  write(root, ".claude/settings.json", "{}");
  expect(changedWatchedPaths(root, profile)).toEqual([]);
  expect(computeFingerprint(root, profile)).toBe(before);
  write(root, "src/new.ts", "y");
  expect(changedWatchedPaths(root, profile)).toEqual(["src/new.ts"]);
  expect(computeFingerprint(root, profile)).not.toBe(before);
});

test("gitChangedPaths lists both sides of a rename", () => {
  const root = makeRepo({ "src/old.ts": "x" });
  git(root, "mv", "src/old.ts", "src/new.ts");
  expect(gitChangedPaths(root)).toEqual(["src/new.ts", "src/old.ts"]);
});

test("I1: from a base commit, committing the change neither hides it nor moves the fingerprint", () => {
  const root = makeRepo({ "src/a.ts": "x" });
  const profile = detectProfile(root);
  const base = { baseCommit: git(root, "rev-parse", "HEAD") };
  write(root, "src/a.ts", "y");
  write(root, "src/b.ts", "new");
  const before = computeFingerprint(root, profile, base);
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts", "src/b.ts"]);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "work");
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts", "src/b.ts"]);
  expect(computeFingerprint(root, profile, base)).toBe(before);
  expect(changedWatchedPaths(root, profile)).toEqual([]);
});

test("C3: the walk without git never follows symlinks, so a cycle is harmless", () => {
  const root = tempDir();
  write(root, "src/a.py", "a = 1\n");
  symlinkSync(root, join(root, "src", "loop"));
  write(root, "node_modules/x/index.js", "skipped");
  const profile = detectProfile(root);
  expect(changedWatchedPaths(root, profile)).toEqual(["src/a.py"]);
  expect(computeFingerprint(root, profile)).toMatch(/^walk:/);
});

test("C3: above the file cap the fingerprint is unavailable and never proven", () => {
  const root = tempDir();
  write(root, "src/a.py", "a = 1\n");
  write(root, "src/b.py", "b = 1\n");
  write(root, "src/c.py", "c = 1\n");
  const profile = detectProfile(root);
  expect(MAX_WATCHED_FILES).toBe(20_000);
  expect(computeFingerprint(root, profile, null, 3)).toMatch(/^walk:/);
  expect(computeFingerprint(root, profile, null, 2)).toBe("unavailable");
  expect(changedWatchedPaths(root, profile, null, 2)).toEqual([]);
  const work = { criteria: [], skips: [] } as unknown as WorkItem;
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  const evidence = { ...emptyEvidence(), fingerprint: "unavailable" };
  expect(
    computeVerdict({
      work,
      evidence,
      expected: [],
      currentFingerprint: "unavailable",
      tampered: false,
      policy: DEFAULT_POLICY,
    }).unproven,
  ).toEqual(["fingerprint unavailable: too many files to watch without git"]);
});

test("a folder without git falls back to hashing every watched file", () => {
  const root = tempDir();
  write(root, "src/a.py", "a = 1\n");
  write(root, "notes.md", "ignored");
  const profile = detectProfile(root);
  expect(changedWatchedPaths(root, profile)).toEqual(["src/a.py"]);
  const before = computeFingerprint(root, profile);
  write(root, "notes.md", "still ignored");
  expect(computeFingerprint(root, profile)).toBe(before);
  write(root, "src/a.py", "a = 2\n");
  expect(computeFingerprint(root, profile)).not.toBe(before);
});

test("when git cannot run in a repository, the walk takes over and names itself", () => {
  const root = makeRepo({ "src/a.ts": "x", "README.md": "# r\n" });
  const profile = detectProfile(root);
  const withGit = computeFingerprint(root, profile);
  expect(withGit).toMatch(/^sha256:/);
  const walk = computeFingerprint(root, profile, null, MAX_WATCHED_FILES, "walk");
  expect(walk).toMatch(/^walk:[0-9a-f]{64}$/);
  expect(fingerprintMethod(walk)).toBe("walk");
  expect(fingerprintMethod(withGit)).toBeUndefined();
  expect(fingerprintMethod(null)).toBeUndefined();
  // A git that cannot run (a broken shim, a sandbox) is not "no changes".
  const bin = tempDir("bin-");
  write(bin, "git", "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, "git"), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = bin;
  try {
    expect(gitChangedPaths(root)).toBeNull();
    expect(changedWatchedPaths(root, profile)).toEqual(["src/a.ts"]);
    expect(computeFingerprint(root, profile)).toBe(walk);
  } finally {
    process.env.PATH = saved;
  }
});

test("the proven files of an earlier item are not the next item's change until they change again", () => {
  const root = makeRepo({ "src/a.ts": "x", "src/b.ts": "y" });
  const profile = detectProfile(root);
  const baseCommit = git(root, "rev-parse", "HEAD");
  write(root, "src/a.ts", "proven by the first item");
  const base = { baseCommit, baseFiles: hashPaths(root, ["src/a.ts"]) };
  expect(changedWatchedPaths(root, profile, base)).toEqual([]);
  const clean = computeFingerprint(root, profile, base);
  write(root, "src/b.ts", "the second item's work");
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/b.ts"]);
  expect(computeFingerprint(root, profile, base)).not.toBe(clean);
  write(root, "src/a.ts", "touched again by the second item");
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts", "src/b.ts"]);
  rmSync(join(root, "src/a.ts"));
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts", "src/b.ts"]);
});

test("a base file reverted to its committed content, or an untracked base file deleted, is the item's change", () => {
  const root = makeRepo({ "src/a.ts": "x" });
  const profile = detectProfile(root);
  const baseCommit = git(root, "rev-parse", "HEAD");
  write(root, "src/a.ts", "proven by the first item");
  write(root, "src/new.ts", "also proven, still untracked");
  const base = { baseCommit, baseFiles: hashPaths(root, ["src/a.ts", "src/new.ts"]) };
  expect(changedWatchedPaths(root, profile, base)).toEqual([]);
  const clean = computeFingerprint(root, profile, base);
  // Back to the committed content: git no longer lists it, but the proven state is gone.
  write(root, "src/a.ts", "x");
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts"]);
  expect(computeFingerprint(root, profile, base)).not.toBe(clean);
  rmSync(join(root, "src/new.ts"));
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts", "src/new.ts"]);
});

test("SP9-T6 AC-5: a design contract is watched under the default exclusions (DESIGN.md, docs/DESIGN.md, a tokens file), while other Markdown and docs stay out", () => {
  const profile = detectProfile(makeRepo());
  expect(profile.watch.exclude).toContain("**/*.md");
  for (const path of ["DESIGN.md", "docs/DESIGN.md", "design/brand.tokens.json", "src/a.ts"])
    expect(isWatched(path, profile), path).toBe(true);
  for (const path of ["README.md", "docs/notes.md", "docs/plans/x.md", ".crew/work/a.json"])
    expect(isWatched(path, profile), path).toBe(false);
});
