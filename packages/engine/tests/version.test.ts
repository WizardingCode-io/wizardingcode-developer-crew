import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { releaseFiles, staleReleaseFiles } from "../../../scripts/release.ts";
import { VERSION } from "../src/version.ts";
import { tempDir } from "./helpers.ts";

const root = join(import.meta.dir, "..", "..", "..");
function versionOf(rel: string): string {
  return (JSON.parse(readFileSync(join(root, rel), "utf8")) as { version: string }).version;
}

test("the engine reports the plugin version", () => {
  expect(VERSION).toBe("0.15.2");
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
    // SP9 Task 10 (2026-10-27-005) edits this list: the frontend pack's two files.
    "packs/frontend/pack.json",
    "packs/frontend/.claude-plugin/plugin.json",
    // SP9 Task 11 (2026-10-28-003) edits this list: the nuxt pack's two files.
    "packs/nuxt/pack.json",
    "packs/nuxt/.claude-plugin/plugin.json",
    // SP9 Task 12 (2026-10-28-005) edits this list: the next pack's two files.
    "packs/next/pack.json",
    "packs/next/.claude-plugin/plugin.json",
  ])
    expect(versionOf(rel), rel).toBe(VERSION);
  const bundle = spawnSync("node", [join(root, "plugins/core/dist/crew.mjs"), "--version"], {
    encoding: "utf8",
  });
  expect(bundle.stdout.trim(), "the bundle is stale: run bun run build").toBe(VERSION);
});

test("2026-10-25-003 AC-6: every version file CLAUDE.md's release section names carries the engine's version, and a copy with one left behind is caught", () => {
  const files = releaseFiles(root);
  expect(files).toEqual([
    "package.json",
    "packages/engine/package.json",
    "packages/engine/src/version.ts",
    "packs/agentic-os/.claude-plugin/plugin.json",
    "packs/agentic-os/pack.json",
    // SP9 Task 10 (2026-10-27-005) edits this list: the frontend pack's two files.
    "packs/frontend/.claude-plugin/plugin.json",
    "packs/frontend/pack.json",
    "packs/laravel/.claude-plugin/plugin.json",
    "packs/laravel/pack.json",
    // SP9 Task 12 (2026-10-28-005) edits this list: the next pack's two files, before nuxt's in order.
    "packs/next/.claude-plugin/plugin.json",
    "packs/next/pack.json",
    // SP9 Task 11 (2026-10-28-003) edits this list: the nuxt pack's two files.
    "packs/nuxt/.claude-plugin/plugin.json",
    "packs/nuxt/pack.json",
    "plugins/core/.claude-plugin/plugin.json",
  ]);
  expect(staleReleaseFiles(root, VERSION)).toEqual([]);
  const copy = tempDir();
  for (const rel of ["CLAUDE.md", ...files]) {
    mkdirSync(dirname(join(copy, rel)), { recursive: true });
    cpSync(join(root, rel), join(copy, rel));
  }
  const left = "packs/laravel/pack.json";
  const pack = JSON.parse(readFileSync(join(copy, left), "utf8")) as Record<string, unknown>;
  writeFileSync(join(copy, left), JSON.stringify({ ...pack, version: "0.0.1" }));
  expect(staleReleaseFiles(copy, VERSION)).toEqual([left]);
  // version.ts is read by its VERSION constant: the version named anywhere else in it does not count.
  const engine = "packages/engine/src/version.ts";
  writeFileSync(
    join(copy, engine),
    `// The release before was "${VERSION}".\nexport const VERSION = "0.0.1";\n`,
  );
  expect(staleReleaseFiles(copy, VERSION)).toEqual([engine, left]);
});
