import { expect, test } from "bun:test";
import {
  DEFAULT_WATCH_EXCLUDE,
  detectProfile,
  detectTargets,
  mergeProfile,
  missingTestCommands,
} from "../src/detect/index.ts";
import { depsAuditCommand } from "../src/gates.ts";
import { registerPack } from "../src/packs.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "../src/profile.ts";
import type { GateCommand, Profile, Target } from "../src/types.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";
import { writePack } from "./pack-fixtures.ts";

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
  expect(depsAuditCommand(dot, root, process.env)).toEqual({
    command: "bun audit --json",
    tool: "bun",
    files: ["package.json", "bun.lock"],
  });
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

test("SP7b-T3 AC-1: refreshProfile picks up a compose file as the environment and names the change", () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  expect(profile.environment).toBeUndefined();
  write(root, "compose.yaml", 'services:\n  web:\n    image: x\n    ports:\n      - "8080:80"\n');
  const refreshed = refreshProfile(paths, profile);
  expect(refreshed.changed).toContain("environment.start (.): docker compose up -d");
  expect(loadProfile(paths).profile?.environment?.url).toBe("http://localhost:8080");
});

test("SP6-T2 AC-3: a detector rule refines the core target of its folder as proposed commands of its pack, or adds a new stack; every marker must exist; the core runs first", () => {
  const root = makeRepo({
    "composer.json": JSON.stringify({ scripts: { test: "phpunit", lint: "pint" } }),
    artisan: "#!/usr/bin/env php\n",
    "svc/Cargo.toml": "[package]\n",
    "api/composer.json": JSON.stringify({ scripts: {} }),
  });
  const laravel = {
    pack: "wizardingcode-pack-laravel",
    rule: {
      stack: "laravel",
      extends: "php" as const,
      markers: ["artisan", "composer.json"],
      packageManager: "composer",
      gates: { test: "php artisan test", typecheck: "vendor/bin/phpstan analyse" },
      testScoped: "php artisan test {files}",
    },
  };
  const rust = {
    pack: "wizardingcode-pack-rust",
    rule: {
      stack: "rust",
      markers: ["Cargo.toml"],
      packageManager: "cargo",
      gates: { test: "cargo test" },
    },
  };
  const targets = detectTargets(root, [laravel, rust]);
  const refined = targets.find((t) => t.path === "." && t.stack === "php") as Target;
  // The gates the rule names replace the core's, as proposed commands of the pack; the others stay.
  expect(refined.gates.test).toEqual({
    command: "php artisan test",
    source: "proposed",
    pack: "wizardingcode-pack-laravel",
  });
  expect(refined.gates.typecheck).toEqual({
    command: "vendor/bin/phpstan analyse",
    source: "proposed",
    pack: "wizardingcode-pack-laravel",
  });
  expect(refined.gates.lint).toEqual({ command: "composer run lint", source: "detected" });
  expect(refined.packageManager).toBe("composer");
  expect(refined.testScoped).toEqual({
    command: "php artisan test {files}",
    source: "proposed",
    pack: "wizardingcode-pack-laravel",
  });
  expect(refined.tags).toEqual(["laravel"]);
  // The php folder without the artisan marker: untouched, no tag.
  const api = targets.find((t) => t.path === "api") as Target;
  expect(api.tags).toBeUndefined();
  expect(api.gates.test).toBeUndefined();
  // A rule without extends is a new stack of its own.
  const svc = targets.find((t) => t.path === "svc") as Target;
  expect(svc).toMatchObject({
    stack: "rust",
    packageManager: "cargo",
    gates: { test: { command: "cargo test", source: "proposed", pack: "wizardingcode-pack-rust" } },
  });
  expect(svc.tags).toBeUndefined();
  // The core first: with no rule the targets are the core's three, the php one unrefined.
  const plain = detectTargets(root);
  expect(plain.map((t) => [t.path, t.stack])).toEqual([
    [".", "php"],
    ["api", "php"],
  ]);
  expect(plain[0]?.gates.test).toEqual({ command: "composer run test", source: "detected" });
  // A rule with extends and no core target at its folder is skipped.
  const alone = makeRepo({ artisan: "x", "composer.json": "{}", "src/a.ts": "x" });
  const noPhpThere = detectTargets(alone, [
    { ...laravel, rule: { ...laravel.rule, extends: "node" as const } },
  ]);
  expect(noPhpThere.map((t) => [t.stack, t.tags ?? []])).toEqual([["php", []]]);
});

test("SP6-T2 AC-3: mergeProfile carries tags and keeps a confirmed command over a pack's; ensureProfile and refreshProfile read the registered rules from the user directory", () => {
  const detected: Target = {
    path: ".",
    stack: "php",
    tags: ["laravel"],
    packageManager: "composer",
    gates: {
      test: { command: "php artisan test", source: "proposed", pack: "wizardingcode-pack-laravel" },
    },
    timeoutMs: 1,
  };
  const previous: Profile = {
    version: 1,
    detectedAt: "2026-10-20T00:00:00.000Z",
    targets: [
      {
        path: ".",
        stack: "php",
        packageManager: "composer",
        gates: { test: { command: "vendor/bin/pest", source: "confirmed" } },
        timeoutMs: 1,
      },
    ],
    watch: { exclude: [] },
  };
  const merged = mergeProfile(previous, [detected]);
  expect(merged.targets[0]?.tags).toEqual(["laravel"]);
  expect(merged.targets[0]?.gates.test).toEqual({
    command: "vendor/bin/pest",
    source: "confirmed",
  });
  // The rules come from the registered packs of the user directory, at the first detection and at a refresh.
  const env = testEnv();
  const root = makeRepo({
    "composer.json": JSON.stringify({ scripts: { test: "phpunit" } }),
    artisan: "x",
  });
  const paths = repoPaths(root, env);
  const before = ensureProfile(paths).profile;
  expect(before.targets[0]?.gates.test).toEqual({
    command: "composer run test",
    source: "detected",
  });
  const registered = registerPack(paths.userDir, writePack(), "command");
  if ("refused" in registered) throw new Error(registered.refused);
  const refreshed = refreshProfile(paths, before);
  expect(refreshed.changed.join("; ")).toContain("test (.): php artisan test");
  expect(refreshed.profile.targets[0]?.gates.test).toEqual({
    command: "php artisan test",
    source: "proposed",
    pack: "wizardingcode-pack-laravel",
  });
  expect(refreshed.profile.targets[0]?.tags).toEqual(["laravel"]);
  expect(loadProfile(paths).profile?.targets[0]?.tags).toEqual(["laravel"]);
  // A fresh project under the same user directory detects with the rule from the start.
  const other = repoPaths(makeRepo({ "composer.json": "{}", artisan: "x" }), env);
  expect(ensureProfile(other).profile.targets[0]?.tags).toEqual(["laravel"]);
});

test("SP6-T2 AC-3 (round 2): mergeProfile drops a pack's proposed command the detection no longer gives and takes a changed one, where a person's proposal or confirmation stays", () => {
  const packGate = (command: string): GateCommand => ({
    command,
    source: "proposed",
    pack: "wizardingcode-pack-laravel",
  });
  const previous: Profile = {
    version: 1,
    detectedAt: "2026-10-20T00:00:00.000Z",
    targets: [
      {
        path: ".",
        stack: "php",
        tags: ["laravel"],
        packageManager: "composer",
        gates: {
          test: packGate("php artisan test"),
          lint: { command: "vendor/bin/pint --test", source: "proposed" },
          typecheck: {
            command: "vendor/bin/phpstan",
            source: "confirmed",
            pack: "wizardingcode-pack-laravel",
          },
        },
        testScoped: packGate("php artisan test {files}"),
        timeoutMs: 1,
      },
      // A target a removed pack's rule alone had added: nothing of a person's in it.
      {
        path: "svc",
        stack: "rust",
        packageManager: "cargo",
        gates: {
          test: { command: "cargo test", source: "proposed", pack: "wizardingcode-pack-rust" },
        },
        timeoutMs: 1,
      },
    ],
    watch: { exclude: [] },
  };
  // The pack removed: the detection gives the core's php target alone.
  const removed = mergeProfile(previous, [
    {
      path: ".",
      stack: "php",
      packageManager: "composer",
      gates: { test: { command: "composer run test", source: "detected" } },
      timeoutMs: 1,
    },
  ]);
  expect(removed.targets.map((t) => t.path)).toEqual(["."]);
  const php = removed.targets[0] as Target;
  expect(php.gates.test).toEqual({ command: "composer run test", source: "detected" });
  expect(php.gates.lint).toEqual({ command: "vendor/bin/pint --test", source: "proposed" });
  expect(php.gates.typecheck).toEqual({
    command: "vendor/bin/phpstan",
    source: "confirmed",
    pack: "wizardingcode-pack-laravel",
  });
  expect(php.testScoped).toBeUndefined();
  expect(php.tags).toBeUndefined();
  // The pack's rule changed: the new proposed command replaces the old one.
  const changed = mergeProfile(previous, [
    {
      path: ".",
      stack: "php",
      tags: ["laravel"],
      packageManager: "composer",
      gates: { test: packGate("php artisan test --parallel") },
      testScoped: packGate("php artisan test --parallel {files}"),
      timeoutMs: 1,
    },
  ]);
  expect(changed.targets[0]?.gates.test).toEqual(packGate("php artisan test --parallel"));
  expect(changed.targets[0]?.testScoped).toEqual(packGate("php artisan test --parallel {files}"));
});
