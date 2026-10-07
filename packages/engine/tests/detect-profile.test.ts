import { expect, test } from "bun:test";
import { detectProfile, missingTestCommands } from "../src/detect/index.ts";
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
  expect(profile.watch.exclude).toEqual(["**/*.md", "docs/**", ".crew/**"]);
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

test("a path with no test command anywhere is reported, and an empty folder reports the root", () => {
  const dir = tempDir();
  write(dir, "package.json", JSON.stringify({ scripts: { build: "vite build" } }));
  write(dir, "composer.json", JSON.stringify({ scripts: { test: "pest" } }));
  expect(missingTestCommands(detectProfile(dir))).toEqual([]);
  write(dir, "composer.json", "{}");
  expect(missingTestCommands(detectProfile(dir))).toEqual([{ target: ".", gate: "test" }]);
  expect(missingTestCommands(detectProfile(tempDir()))).toEqual([{ target: ".", gate: "test" }]);
});
