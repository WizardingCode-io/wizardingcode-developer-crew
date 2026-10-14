import { expect, test } from "bun:test";
import {
  DEFAULT_WATCH_EXCLUDE,
  detectProfile,
  detectTargets,
  mergeProfile,
  missingTestCommands,
} from "../src/detect/index.ts";
import { depsAuditCommand } from "../src/gates.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "../src/profile.ts";
import type { Profile, Target } from "../src/types.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

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

test("0.3.0: refreshProfile follows the manifests; a person's commands and targets survive; a tampered profile is left alone", () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { build: "vp build" } }) });
  const paths = repoPaths(root, testEnv());
  const first = ensureProfile(paths).profile;
  const node = first.targets[0];
  if (!node) throw new Error("no target");
  expect(node.packageManager).toBe("npm");
  expect(node.gates.test).toBeUndefined();
  // A person sets lint by hand and adds a target no detector knows.
  node.gates.lint = { command: "make lint", source: "confirmed" };
  const tools: Target = {
    path: "tools",
    stack: "other",
    packageManager: "unknown",
    gates: { test: { command: "make test", source: "confirmed" } },
    timeoutMs: 1000,
  };
  first.targets.push(tools);
  saveProfile(paths, first);
  // The work writes the scripts and the bun lockfile the first detection never saw.
  write(
    root,
    "package.json",
    JSON.stringify({ scripts: { build: "vp build", test: "vitest run" } }),
  );
  write(root, "bun.lock", "");
  const current = loadProfile(paths).profile;
  if (!current) throw new Error("no profile");
  const refreshed = refreshProfile(paths, current);
  expect(refreshed.changed).toEqual(
    expect.arrayContaining([
      "packageManager (.): bun",
      "build (.): bun run build",
      "test (.): bun run test",
    ]),
  );
  const saved = loadProfile(paths).profile;
  const dot = saved?.targets.find((t) => t.path === ".");
  expect(dot?.packageManager).toBe("bun");
  expect(dot?.gates.test).toEqual({ command: "bun run test", source: "detected" });
  expect(dot?.gates.lint).toEqual({ command: "make lint", source: "confirmed" });
  expect(saved?.targets.find((t) => t.path === "tools")?.gates.test).toEqual({
    command: "make test",
    source: "confirmed",
  });
  if (!dot) throw new Error("no root target");
  expect(depsAuditCommand(dot, root, process.env)).toEqual({ command: "bun audit" });
  // Nothing changed since: nothing reported, detectedAt untouched.
  const again = refreshProfile(paths, saved as Profile);
  expect(again.changed).toEqual([]);
  expect(loadProfile(paths).profile?.detectedAt).toBe(saved?.detectedAt);
  // A profile changed outside the engine is left as it is.
  write(
    root,
    ".crew/profile.json",
    JSON.stringify({ ...saved, detectedAt: "2020-01-01T00:00:00Z" }),
  );
  const tampered = loadProfile(paths);
  expect(tampered.tampered).toBe(true);
  expect(refreshProfile(paths, tampered.profile as Profile, tampered.tampered).changed).toEqual([]);
  expect(loadProfile(paths).profile?.detectedAt).toBe("2020-01-01T00:00:00Z");
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
