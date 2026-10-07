import { expect, test } from "bun:test";
import { detectProfile } from "../src/detect/index.ts";
import { changedWatchedPaths, computeFingerprint, gitChangedPaths } from "../src/fingerprint.ts";
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
