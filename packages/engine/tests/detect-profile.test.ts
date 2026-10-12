import { expect, test } from "bun:test";
import {
  DEFAULT_WATCH_EXCLUDE,
  detectProfile,
  detectTargets,
  mergeProfile,
  missingTestCommands,
} from "../src/detect/index.ts";
import type { Profile } from "../src/types.ts";
import { tempDir, write } from "./helpers.ts";

function monorepo(): string {
  const dir = tempDir();
  write(dir, "package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  write(dir, "apps/api/composer.json", JSON.stringify({ scripts: { test: "pest" } }));
  write(dir, "node_modules/dep/package.json", JSON.stringify({ scripts: { test: "x" } }));
  write(dir, "a/b/c/d/package.json", JSON.stringify({ scripts: { test: "too deep" } }));
  return dir;
}

test("finds targets up to three levels deep and skips dependency folders", () => {
  const profile = detectProfile(monorepo());
  expect(profile.targets.map((t) => `${t.path}:${t.stack}`)).toEqual([".:node", "apps/api:php"]);
  expect(profile.targets[0]?.gates.test).toEqual({ command: "npm run test", source: "detected" });
  expect(profile.watch.exclude).toEqual(["**/*.md", "docs/**", ".crew/**", ".claude/**"]);
});

test("re-detection keeps proposed and confirmed commands and timeouts", () => {
  const dir = monorepo();
  const previous: Profile = detectProfile(dir);
  const target = previous.targets[0];
  if (!target) throw new Error("no target");
  target.gates.lint = { command: "make lint", source: "confirmed" };
  target.gates.test = { command: "make test", source: "proposed" };
  target.timeoutMs = 1234;
  const fresh = detectProfile(dir, previous);
  expect(fresh.targets[0]?.gates.lint).toEqual({ command: "make lint", source: "confirmed" });
  expect(fresh.targets[0]?.gates.test).toEqual({ command: "make test", source: "proposed" });
  expect(fresh.targets[0]?.timeoutMs).toBe(1234);
});

test("mergeProfile leaves the targets it is given untouched", () => {
  const dir = monorepo();
  const previous = detectProfile(dir);
  const root = previous.targets[0];
  if (!root) throw new Error("no target");
  root.gates.test = { command: "make test", source: "proposed" };
  root.timeoutMs = 1234;
  const targets = detectTargets(dir);
  const snapshot = JSON.stringify(targets);
  const merged = mergeProfile(previous, targets);
  expect(merged.targets[0]?.gates.test?.command).toBe("make test");
  expect(JSON.stringify(targets)).toBe(snapshot);
});

test("a path with no test command anywhere is reported, and an empty folder reports the root", () => {
  const dir = tempDir();
  write(dir, "package.json", JSON.stringify({ scripts: { build: "vite build" } }));
  write(dir, "composer.json", JSON.stringify({ scripts: { test: "pest" } }));
  expect(missingTestCommands(detectProfile(dir))).toEqual([]);
  write(dir, "composer.json", "{}");
  expect(missingTestCommands(detectProfile(dir))).toEqual([{ target: ".", gate: "test" }]);
  expect(missingTestCommands(detectProfile(tempDir()))).toEqual([{ target: ".", gate: "test" }]);
});

test("a workspace member without scripts is covered by the package that lists it", () => {
  const dir = tempDir();
  write(
    dir,
    "package.json",
    JSON.stringify({ workspaces: ["packages/*"], scripts: { test: "bun test packages" } }),
  );
  write(dir, "bun.lock", "");
  write(dir, "packages/engine/package.json", JSON.stringify({ name: "engine" }));
  write(dir, "packages/web/package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  const profile = detectProfile(dir);
  const byPath = Object.fromEntries(profile.targets.map((t) => [t.path, t]));
  expect(byPath["packages/engine"]?.workspaceOf).toBe(".");
  expect(byPath["packages/web"]?.workspaceOf).toBe(".");
  expect(byPath["."]?.workspaceOf).toBeUndefined();
  expect(missingTestCommands(profile)).toEqual([]);
});

test("a workspace root without a test script is still missing one; its members do not cover it", () => {
  const dir = tempDir();
  write(dir, "package.json", JSON.stringify({ workspaces: { packages: ["packages/*"] } }));
  write(dir, "packages/web/package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  expect(missingTestCommands(detectProfile(dir))).toEqual([{ target: ".", gate: "test" }]);
});

test("re-detection upgrades a watch list that is still an earlier default and keeps one the user changed", () => {
  const dir = monorepo();
  const stale: Profile = {
    ...detectProfile(dir),
    watch: { exclude: ["**/*.md", "docs/**", ".crew/**"] },
  };
  expect(detectProfile(dir, stale).watch.exclude).toEqual(DEFAULT_WATCH_EXCLUDE);
  const custom: Profile = {
    ...detectProfile(dir),
    watch: { exclude: ["**/*.md", "generated/**"] },
  };
  expect(detectProfile(dir, custom).watch.exclude).toEqual(["**/*.md", "generated/**"]);
});
