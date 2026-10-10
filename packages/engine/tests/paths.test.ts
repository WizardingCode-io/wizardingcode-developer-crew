import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { findRoot, isProtectedPath, resolvePaths, workDir } from "../src/paths.ts";
import { makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

test("findRoot walks up to the folder that holds .git", () => {
  const root = makeRepo();
  mkdirSync(join(root, "src", "deep"), { recursive: true });
  expect(findRoot(join(root, "src", "deep"))).toBe(root);
});

test("C3: outside a repository only a folder that already holds .crew/ is a root", () => {
  const dir = tempDir();
  expect(findRoot(dir)).toBeNull();
  expect(resolvePaths(dir, testEnv())).toBeNull();
  mkdirSync(join(dir, ".crew"));
  expect(findRoot(dir)).toBe(dir);
  mkdirSync(join(dir, "sub"));
  expect(findRoot(join(dir, "sub"))).toBeNull();
});

test("resolvePaths honours WIZARDINGCODE_HOME and derives a stable repo id", () => {
  const root = makeRepo();
  const env = testEnv();
  const paths = repoPaths(root, env);
  expect(paths.crewDir).toBe(join(root, ".crew"));
  expect(paths.userDir).toBe(join(env.WIZARDINGCODE_HOME as string, "crew"));
  expect(paths.integrityFile.endsWith(`${paths.repoId}.json`)).toBe(true);
  expect(repoPaths(root, env).repoId).toBe(paths.repoId);
  expect(workDir(paths, "w1")).toBe(join(root, ".crew", "work", "w1"));
});

test("isProtectedPath covers engine-owned files and nothing else", () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  const p = (rel: string) => isProtectedPath(paths, join(root, rel));
  expect(p(".crew/profile.json")).toBe(true);
  expect(p(".crew/policy.json")).toBe(true);
  expect(p(".crew/local/state.json")).toBe(true);
  expect(p(".crew/work/w1/work.json")).toBe(true);
  expect(p(".crew/work/w1/evidence.json")).toBe(true);
  expect(p(".crew/work/w1/report.md")).toBe(true);
  expect(p(".crew/work/w1/logs/test-1.txt")).toBe(true);
  expect(p(".crew/work/w1/spec.md")).toBe(false);
  expect(p(".crew/work/w1/brief.md")).toBe(false);
  expect(p("src/app.ts")).toBe(false);
  expect(isProtectedPath(paths, join(paths.userDir, "config.json"))).toBe(true);
  expect(isProtectedPath(paths, "/tmp/elsewhere/.crew/profile.json")).toBe(false);
});
