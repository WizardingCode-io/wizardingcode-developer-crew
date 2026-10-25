import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../src/version.ts";

const root = join(import.meta.dir, "..", "..", "..");
function versionOf(rel: string): string {
  return (JSON.parse(readFileSync(join(root, rel), "utf8")) as { version: string }).version;
}

test("the engine reports the plugin version", () => {
  expect(VERSION).toBe("0.15.0");
});

test("#47: the root test script gives bun test a 30-second per-test timeout, so a test slowed by load is slow, not red", () => {
  const scripts = (
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    }
  ).scripts;
  expect(scripts.test).toBe("bun test --timeout 30000 packages");
});

test("the version fields of the root package, the engine package and the plugin manifest agree", () => {
  expect(versionOf("package.json")).toBe(VERSION);
  expect(versionOf("packages/engine/package.json")).toBe(VERSION);
  expect(versionOf("plugins/core/.claude-plugin/plugin.json")).toBe(VERSION);
});

test("SP8-T1 AC-5 (finding 96): the committed bundle carries the engine's version string, so a stale bundle fails the check", () => {
  const bundle = readFileSync(join(root, "plugins", "core", "dist", "crew.mjs"), "utf8");
  expect(bundle).toContain(`var VERSION = "${VERSION}";`);
});

test("2026-10-25-002 AC-4: every file the release names carries the engine's version, and the built bundle reports it", () => {
  for (const rel of [
    "package.json",
    "packages/engine/package.json",
    "plugins/core/.claude-plugin/plugin.json",
    "packs/laravel/pack.json",
    "packs/laravel/.claude-plugin/plugin.json",
    "packs/agentic-os/pack.json",
    "packs/agentic-os/.claude-plugin/plugin.json",
  ])
    expect(versionOf(rel), rel).toBe(VERSION);
  const bundle = spawnSync("node", [join(root, "plugins/core/dist/crew.mjs"), "--version"], {
    encoding: "utf8",
  });
  expect(bundle.stdout.trim()).toBe(VERSION);
});
