import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectProfile } from "../src/detect/index.ts";
import { changedText, isBinary, scanSecrets, scanText } from "../src/secrets.ts";
import { git, makeRepo, write } from "./helpers.ts";

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
