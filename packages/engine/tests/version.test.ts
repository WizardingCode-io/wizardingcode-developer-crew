import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VERSION } from "../src/version.ts";

const root = join(import.meta.dir, "..", "..", "..");
function versionOf(rel: string): string {
  return (JSON.parse(readFileSync(join(root, rel), "utf8")) as { version: string }).version;
}

test("the engine reports the plugin version", () => {
  expect(VERSION).toBe("0.1.7");
});

test("the version fields of the root package, the engine package and the plugin manifest agree", () => {
  expect(versionOf("package.json")).toBe(VERSION);
  expect(versionOf("packages/engine/package.json")).toBe(VERSION);
  expect(versionOf("plugins/core/.claude-plugin/plugin.json")).toBe(VERSION);
});
