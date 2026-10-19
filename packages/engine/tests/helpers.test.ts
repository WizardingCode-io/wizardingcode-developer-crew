import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { removeTempDirs, TEMP_DIRS, tempDir } from "./helpers.ts";

const ROOT = resolve(import.meta.dir, "../../..");

test("SP3-T1 AC-1 (finding 74): tempDir registers each folder; removeTempDirs removes the registered ones, none with WIZARDINGCODE_CREW_KEEP_FIXTURES=1, and never a path outside the temp folder", () => {
  const a = tempDir();
  const b = tempDir("crew-home-");
  expect(TEMP_DIRS.has(a) && TEMP_DIRS.has(b)).toBe(true);
  const previous = process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES;
  try {
    process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES = "1";
    expect(removeTempDirs()).toBe(0);
    expect(existsSync(a) && existsSync(b)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES;
    else process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES = previous;
  }
  // A registered path outside the temp folder is skipped: it stays registered and untouched (defence in depth).
  const outside = join(ROOT, "packages", "engine", "tests", "fixtures");
  TEMP_DIRS.add(outside);
  expect(removeTempDirs()).toBeGreaterThanOrEqual(2);
  expect(existsSync(a) || existsSync(b)).toBe(false);
  expect(TEMP_DIRS.has(a) || TEMP_DIRS.has(b)).toBe(false);
  expect(existsSync(outside)).toBe(true);
  expect(TEMP_DIRS.has(outside)).toBe(true);
  TEMP_DIRS.delete(outside);
});

test("SP3-T1 AC-1 (finding 74): both bun test forms name the preload that removes the fixtures when the run ends, and the root script carries the 30 s timeout", () => {
  const root = readFileSync(join(ROOT, "bunfig.toml"), "utf8");
  const engine = readFileSync(join(ROOT, "packages", "engine", "bunfig.toml"), "utf8");
  expect(root).toContain('preload = ["./packages/engine/tests/preload.ts"]');
  expect(engine).toContain('preload = ["./tests/preload.ts"]');
  const preload = readFileSync(join(ROOT, "packages", "engine", "tests", "preload.ts"), "utf8");
  expect(preload).toContain("afterAll(");
  expect(preload).toContain("removeTempDirs()");
  // bun 1.3.9 reads no timeout key from bunfig.toml: the root script's flag is the limit of that form.
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  expect(scripts.scripts.test).toContain("--timeout 30000");
});
