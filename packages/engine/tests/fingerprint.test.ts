import { expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { detectProfile } from "../src/detect/index.ts";
import { computeVerdict, emptyEvidence } from "../src/evidence.ts";
import {
  changedWatchedPaths,
  computeFingerprint,
  gitChangedPaths,
  MAX_WATCHED_FILES,
} from "../src/fingerprint.ts";
import type { WorkItem } from "../src/types.ts";
import { git, makeRepo, tempDir, write } from "./helpers.ts";

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
  const base = git(root, "rev-parse", "HEAD");
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
  expect(computeFingerprint(root, profile)).toMatch(/^sha256:/);
});

test("C3: above the file cap the fingerprint is unavailable and never proven", () => {
  const root = tempDir();
  write(root, "src/a.py", "a = 1\n");
  write(root, "src/b.py", "b = 1\n");
  write(root, "src/c.py", "c = 1\n");
  const profile = detectProfile(root);
  expect(MAX_WATCHED_FILES).toBe(20_000);
  expect(computeFingerprint(root, profile, null, 3)).toMatch(/^sha256:/);
  expect(computeFingerprint(root, profile, null, 2)).toBe("unavailable");
  expect(changedWatchedPaths(root, profile, null, 2)).toEqual([]);
  const work = { criteria: [], skips: [] } as unknown as WorkItem;
  const evidence = { ...emptyEvidence(), fingerprint: "unavailable" };
  expect(
    computeVerdict({
      work,
      evidence,
      expected: [],
      currentFingerprint: "unavailable",
      tampered: false,
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
