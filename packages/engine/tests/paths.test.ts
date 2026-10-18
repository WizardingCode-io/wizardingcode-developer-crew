import { expect, test } from "bun:test";
import { mkdirSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
  findRoot,
  isProtectedPath,
  mailboxDir,
  registryPath,
  resolvePaths,
  workDir,
} from "../src/paths.ts";
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

test("a symlinked alias of the root gives the same root, repo id and protection", () => {
  const root = makeRepo();
  const alias = join(tempDir(), "alias");
  symlinkSync(root, alias);
  expect(findRoot(alias)).toBe(root);
  expect(findRoot(join(alias, "src", "deep"))).toBe(root);
  const env = testEnv();
  const paths = repoPaths(root, env);
  expect(repoPaths(alias, env).repoId).toBe(paths.repoId);
  expect(repoPaths(alias, env).root).toBe(root);
  expect(isProtectedPath(paths, join(alias, ".crew", "profile.json"))).toBe(true);
  expect(isProtectedPath(paths, join(alias, ".crew", "work", "w1", "work.json"))).toBe(true);
  expect(isProtectedPath(paths, join(alias, "src", "app.ts"))).toBe(false);
});

test("SP2c: the registry and the mailboxes live under the user's crew directory; mail.json is engine-owned in a work folder", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(registryPath(paths.userDir)).toBe(join(paths.userDir, "projects.json"));
  expect(mailboxDir(paths.userDir, "shop", "crm")).toBe(join(paths.userDir, "mail", "shop", "crm"));
  expect(mailboxDir(paths.userDir, null, "solo")).toBe(
    join(paths.userDir, "mail", "_alone", "solo"),
  );
  expect(isProtectedPath(paths, join(paths.root, ".crew", "work", "w1", "mail.json"))).toBe(true);
  expect(isProtectedPath(paths, join(paths.userDir, "mail", "shop", "crm", "inbox.json"))).toBe(
    true,
  );
});

test("SP7b-T5 AC-3: the review folder is the engine's except the captures and the e2e folders, under the item and under a todo", () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  const p = (rel: string) => isProtectedPath(paths, join(root, ".crew", "work", "w1", rel));
  for (const protectedPath of [
    "review",
    "review/code-quality.findings.md",
    "review/ruling.json",
    "review/ruling.round1.json",
    "review/inputs.json",
    "review/diff.patch",
    "review/ui-ux.findings.md",
    "review/ui/../ruling.json",
    "review/T-3",
    "review/T-3/test-quality.round2.md",
    "review/T-3/inputs.json",
  ])
    expect([protectedPath, p(protectedPath)]).toEqual([protectedPath, true]);
  for (const open of [
    "review/ui",
    "review/ui/home-empty.png",
    "review/ui/console-home-empty.json",
    "review/e2e/console.json",
    "review/T-3/ui/cart-error.png",
    "review/T-3/e2e/logs.txt",
  ])
    expect([open, p(open)]).toEqual([open, false]);
});
