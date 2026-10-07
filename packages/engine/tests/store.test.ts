import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readProtectedJson, recordIntegrity, writeProtectedJson } from "../src/store.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

test("a protected file written by the engine reads back untampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "profile.json");
  writeProtectedJson(paths, file, { version: 1 });
  expect(readProtectedJson<{ version: number }>(paths, file)).toEqual({
    data: { version: 1 },
    tampered: false,
  });
});

test("a protected file changed outside the engine is reported as tampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "work", "w1", "evidence.json");
  writeProtectedJson(paths, file, { verdict: "unproven" });
  writeFileSync(file, JSON.stringify({ verdict: "proven" }));
  const read = readProtectedJson<{ verdict: string }>(paths, file);
  expect(read.tampered).toBe(true);
  expect(read.data?.verdict).toBe("proven");
});

test("recordIntegrity accepts a hand-written file, and a missing file is not tampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "policy.json");
  expect(readProtectedJson(paths, file)).toEqual({ data: null, tampered: false });
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(file, '{"minimumRoute":"standard"}');
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  recordIntegrity(paths, file);
  writeFileSync(file, '{"minimumRoute":"fast"}');
  expect(readProtectedJson(paths, file).tampered).toBe(true);
});
