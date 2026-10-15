import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  readProtectedJson,
  readProtectedJsonAt,
  recordIntegrity,
  writeProtectedJson,
  writeProtectedJsonAt,
} from "../src/store.ts";
import { makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

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

test("C2: an integrity file that does not parse marks every protected file as tampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const profile = join(paths.crewDir, "profile.json");
  const policy = join(paths.crewDir, "policy.json");
  writeProtectedJson(paths, profile, { version: 1 });
  writeFileSync(policy, '{"minimumRoute":"standard"}');
  writeFileSync(paths.integrityFile, "{ not json");
  expect(readProtectedJson(paths, profile).tampered).toBe(true);
  expect(readProtectedJson(paths, policy).tampered).toBe(true);
});

test("C2: a protected file the engine never wrote is tampered once other hashes exist", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const handWritten = join(paths.crewDir, "work", "w9", "evidence.json");
  mkdirSync(join(paths.crewDir, "work", "w9"), { recursive: true });
  writeFileSync(handWritten, JSON.stringify({ verdict: "proven" }));
  // True first use: nothing is recorded yet, so there is nothing to compare with.
  expect(readProtectedJson(paths, handWritten).tampered).toBe(false);
  writeProtectedJson(paths, join(paths.crewDir, "profile.json"), { version: 1 });
  expect(readProtectedJson(paths, handWritten).tampered).toBe(true);
  const policy = join(paths.crewDir, "policy.json");
  writeFileSync(policy, '{"minimumRoute":"standard"}');
  expect(readProtectedJson(paths, policy).tampered).toBe(false);
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

test("SP2c: a protected file outside a repository has its own integrity file, keyed by file name", () => {
  const dir = tempDir("crew-mailbox-");
  const integrity = join(dir, "integrity.json");
  const inbox = join(dir, "inbox.json");
  expect(readProtectedJsonAt(integrity, inbox)).toEqual({ data: null, tampered: false });
  writeProtectedJsonAt(integrity, inbox, { version: 1, messages: [] });
  expect(readProtectedJsonAt(integrity, inbox)).toEqual({
    data: { version: 1, messages: [] },
    tampered: false,
  });
  // (the array form: a dotted string would be read as a path, `inbox` then `json`)
  expect(JSON.parse(readFileSync(integrity, "utf8"))).toHaveProperty(["inbox.json"]);
  writeFileSync(inbox, JSON.stringify({ version: 1, messages: [{ id: "forged" }] }));
  expect(readProtectedJsonAt(integrity, inbox).tampered).toBe(true);
  // A second file in the same folder that the engine never recorded, while it recorded others, is not trusted.
  writeFileSync(join(dir, "outbox.json"), "{}");
  expect(readProtectedJsonAt(integrity, join(dir, "outbox.json")).tampered).toBe(true);
});
