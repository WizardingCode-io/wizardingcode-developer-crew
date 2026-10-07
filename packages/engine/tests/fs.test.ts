import { expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exists, readJson, readText, sha256, writeJson, writeText } from "../src/fs.ts";

test("sha256 is stable and hex encoded", () => {
  expect(sha256("crew")).toMatch(/^[0-9a-f]{64}$/);
  expect(sha256("crew")).toBe(sha256("crew"));
  expect(sha256("crew")).not.toBe(sha256("crew2"));
});

test("writeText creates parent folders and readText returns null when missing", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-fs-"));
  const file = join(dir, "a", "b", "c.txt");
  expect(readText(file)).toBeNull();
  writeText(file, "hello");
  expect(exists(file)).toBe(true);
  expect(readText(file)).toBe("hello");
});

test("writeJson round-trips and readJson returns null on invalid JSON", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-fs-"));
  const file = join(dir, "x.json");
  writeJson(file, { a: 1, b: ["x"] });
  expect(readJson<{ a: number }>(file)?.a).toBe(1);
  writeText(file, "{not json");
  expect(readJson(file)).toBeNull();
});
