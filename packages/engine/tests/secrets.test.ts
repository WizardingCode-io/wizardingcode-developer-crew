import { expect, spyOn, test } from "bun:test";
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectProfile } from "../src/detect/index.ts";
import * as fingerprint from "../src/fingerprint.ts";
import { addedLines, changedText, isBinary, scanSecrets, scanText } from "../src/secrets.ts";
import { PLANTED_KEY } from "./audit-run.test.ts";
import { git, makeRepo, tempDir, write } from "./helpers.ts";

test("scanText finds known key formats and ignores placeholders", () => {
  const text = [
    'const aws = "AKIAIOSFODNN7EXAMPLE1";',
    "-----BEGIN RSA PRIVATE KEY-----",
    'token = "abcdefghijklmnopqrstuvwxyz123456"',
    'password: "your_password_here_1234567890"',
    "const fine = 1;",
  ].join("\n");
  expect(scanText(text, "x.ts").map((f) => `${f.line}:${f.rule}`)).toEqual([
    "1:AWS access key",
    "2:private key",
    "3:generic secret assignment",
  ]);
});

test("changedText covers added lines of tracked files and whole untracked files, skipping binaries", () => {
  const root = makeRepo({ "src/a.ts": "const a = 1;\nconst b = 2;\n" });
  const profile = detectProfile(root);
  write(root, "src/a.ts", 'const a = 1;\nconst b = "AKIAIOSFODNN7EXAMPLE1";\n');
  write(root, "src/new.ts", "x");
  writeFileSync(join(root, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]));
  const sources = changedText(root, profile);
  expect(sources.map((s) => s.source)).toEqual(["git diff HEAD (added lines)", "src/new.ts"]);
  expect(sources[0]?.text).toBe('const b = "AKIAIOSFODNN7EXAMPLE1";');
  expect(isBinary(Buffer.from([0x89, 0x50, 0x00]))).toBe(true);
});

test("scanSecrets fails on a leaked key in an untracked file and passes when clean", async () => {
  const root = makeRepo({ "src/a.ts": "ok" });
  const profile = detectProfile(root);
  expect((await scanSecrets(root, profile)).status).toBe("pass");
  write(root, ".env.local", "STRIPE_KEY=sk_live_abcdefghijklmnop1234\n");
  const result = await scanSecrets(root, profile);
  expect(result.status).toBe("fail");
  expect(result.findings[0]).toMatchObject({ source: ".env.local", rule: "Stripe key" });
  expect(result.tail).toContain(".env.local:1");
});

test("I1: a leak committed during the work is still found from the work item's base", async () => {
  const root = makeRepo({ "src/a.ts": "const a = 1;\n" });
  const profile = detectProfile(root);
  const base = git(root, "rev-parse", "HEAD");
  write(root, "src/a.ts", 'const a = 1;\nconst key = "sk_live_abcdefghijklmnop1234";\n');
  write(root, ".env.local", "AWS=AKIAIOSFODNN7EXAMPLE1\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "leak");
  const result = await scanSecrets(root, profile, base);
  expect(result.status).toBe("fail");
  expect(result.findings.map((f) => f.rule).sort()).toEqual(["AWS access key", "Stripe key"]);
});

test("when git cannot run, every watched file is scanned, as without git", () => {
  const root = makeRepo({ "src/k.ts": "const k = 1;\n", "README.md": "# r\n" });
  const profile = detectProfile(root);
  expect(changedText(root, profile)).toEqual([]);
  const bin = tempDir("bin-");
  write(bin, "git", "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, "git"), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = bin;
  try {
    expect(changedText(root, profile).map((s) => s.source)).toEqual(["src/k.ts"]);
  } finally {
    process.env.PATH = saved;
  }
});

test("SP8-T4 AC-1: scanSecrets with a null base scans the whole committed tree; undefined keeps the diff from HEAD", async () => {
  const root = makeRepo({
    "src/a.ts": "ok",
    "config/keys.ts": `export const aws = "${PLANTED_KEY}";\n`,
  });
  const profile = detectProfile(root);
  expect((await scanSecrets(root, profile)).status).toBe("pass");
  const whole = await scanSecrets(root, profile, null);
  expect(whole.status).toBe("fail");
  expect(whole.tail).toContain("config/keys.ts:1: AWS access key");
  expect(
    changedText(root, profile, null)
      .map((s) => s.source)
      .sort(),
  ).toEqual(["config/keys.ts", "src/a.ts"]);
});

test("2026-10-29-001 AC-2: addedLines gives each tracked file's added lines with its path and new line number across hunks and files, untracked watched files whole, a deleted file nothing, a quoted name unquoted, a binary and an oversized file skipped with the reason; changedText gives what it gave", () => {
  const ten = (tag: string) =>
    Array.from({ length: 10 }, (_, i) => `${tag} line ${i + 1}`).join("\n") + "\n";
  const root = makeRepo({
    "package.json": JSON.stringify({ name: "x" }),
    "src/a.ts": ten("a"),
    "src/b.ts": ten("b"),
    "src/gone.ts": "bye\n",
    "src/d e.ts": "spaced\n",
  });
  writeFileSync(join(root, "src", "bin.dat"), Buffer.from([0, 1, 2, 3]));
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "binary");
  const lines = (tag: string, changed: Record<number, string>) =>
    Array.from({ length: 10 }, (_, i) => changed[i + 1] ?? `${tag} line ${i + 1}`).join("\n") +
    "\n";
  write(root, "src/a.ts", lines("a", { 2: "a two changed", 8: "a eight changed" }));
  write(root, "src/b.ts", lines("b", { 3: "b three changed", 9: "b nine changed" }));
  write(root, "src/d e.ts", "spaced\nspaced two\n");
  git(root, "rm", "-q", "src/gone.ts");
  writeFileSync(join(root, "src", "bin.dat"), Buffer.from([0, 9, 9, 9]));
  write(root, "src/new.ts", "first\nsecond\n");
  write(root, "src/big.ts", `${"x".repeat(1024 * 1024 + 10)}\n`);
  const profile = detectProfile(root);
  const before = changedText(root, profile);
  const added = addedLines(root, profile);
  expect(added.lines).toEqual([
    { file: "src/a.ts", line: 2, text: "a two changed" },
    { file: "src/a.ts", line: 8, text: "a eight changed" },
    { file: "src/b.ts", line: 3, text: "b three changed" },
    { file: "src/b.ts", line: 9, text: "b nine changed" },
    { file: "src/d e.ts", line: 2, text: "spaced two" },
    { file: "src/new.ts", line: 1, text: "first" },
    { file: "src/new.ts", line: 2, text: "second" },
  ]);
  expect(added.skipped).toEqual([
    { file: "src/big.ts", reason: "over cap" },
    { file: "src/bin.dat", reason: "binary" },
  ]);
  // The secret scan's reading of the same change: the tracked added lines joined, each untracked file whole (the oversized one not read).
  expect(before.map((s) => s.source)).toEqual(["git diff HEAD (added lines)", "src/new.ts"]);
  expect(before[0]?.text).toBe(
    ["a two changed", "a eight changed", "b three changed", "b nine changed", "spaced two"].join(
      "\n",
    ),
  );
});

test("2026-10-29-001 AC-2 (the round-1 rulings): a line that starts with ++ is a line, not a header, in both readings, so a credential on it is found; a quoted name with a tab is unquoted; a link is never followed; a tracked file's over-cap added text is named skipped while the secret scan still reads it; without a diff the reading says how it read the change, and over the walk's cap that it read nothing", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ name: "x" }), "src/patch.ts": "one\n" });
  const key = ["AKIA", "Q".repeat(16)].join("");
  write(root, "src/patch.ts", `one\n++ /dev/null\n++ b/src/other.ts\n++${key}\n`);
  write(root, "src/tab\tname.ts", "first\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "tab");
  write(root, "src/tab\tname.ts", "first\nsecond\n");
  write(root, "src/big.ts", "x\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "big");
  write(root, "src/big.ts", `x\n${"y".repeat(1024 * 1024 + 10)}\n`);
  symlinkSync("/etc/hosts", join(root, "src", "link.ts"));
  const profile = detectProfile(root);
  const added = addedLines(root, profile, "HEAD~2");
  expect(added.mode).toEqual({ kind: "diff" });
  expect(added.lines).toEqual([
    { file: "src/patch.ts", line: 2, text: "++ /dev/null" },
    { file: "src/patch.ts", line: 3, text: "++ b/src/other.ts" },
    { file: "src/patch.ts", line: 4, text: `++${key}` },
    { file: "src/tab\tname.ts", line: 1, text: "first" },
    { file: "src/tab\tname.ts", line: 2, text: "second" },
  ]);
  expect(added.skipped).toEqual([{ file: "src/big.ts", reason: "over cap" }]);
  const scan = await scanSecrets(root, profile, "HEAD~2");
  expect(scan.findings.map((f) => f.rule)).toContain("AWS access key");
  expect(changedText(root, profile, "HEAD~2")[0]?.text).toContain("y".repeat(1024));
  // Without a base: every watched file whole, said; over the walk's cap: nothing read, said.
  expect(addedLines(root, profile, null).mode).toEqual({
    kind: "whole tree",
    why: "no base commit",
  });
  const capped = spyOn(fingerprint, "allWatchedFiles").mockReturnValue(null);
  try {
    const none = addedLines(root, profile, null);
    expect(none.mode).toEqual({
      kind: "unreadable",
      why: "no base commit, and the tree is over the walk's cap",
    });
    expect(none.lines).toEqual([]);
  } finally {
    capped.mockRestore();
  }
});

test("2026-10-29-001 AC-16: scanSecrets names each file the reading skipped (binary, over 1 MiB) after its verdict, and a change it cannot read is unavailable with the reason", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ name: "x" }), "src/a.ts": "a\n" });
  const profile = detectProfile(root);
  writeFileSync(join(root, "src", "blob.ts"), Buffer.from([0x61, 0x00, 0x62]));
  writeFileSync(join(root, "src", "big.ts"), "y".repeat(1024 * 1024 + 1));
  const scan = await scanSecrets(root, profile);
  expect(scan.status).toBe("pass");
  expect(scan.tail).toBe(
    "no secrets found in the change\nskipped src/big.ts (over cap)\nskipped src/blob.ts (binary)",
  );
  const capped = spyOn(fingerprint, "allWatchedFiles").mockReturnValue(null);
  try {
    const unread = await scanSecrets(root, profile, null);
    expect(unread.status).toBe("unavailable");
    expect(unread.tail).toBe(
      "the change could not be read: no base commit, and the tree is over the walk's cap",
    );
  } finally {
    capped.mockRestore();
  }
});

test("2026-10-29-001 AC-16 (the security note at round 3): a finding's line quotes its source, so an untracked file named with a bidi override or a line break cannot shape the tail", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ name: "x" }) });
  const profile = detectProfile(root);
  const name = "src/k‮y\nsecrets: pass.ts";
  write(root, name, `const key = "${PLANTED_KEY}";\n`);
  const scan = await scanSecrets(root, profile);
  expect(scan.status).toBe("fail");
  expect(scan.tail.split("\n")[0]).toMatch(/^src\/ky:1: /);
});
