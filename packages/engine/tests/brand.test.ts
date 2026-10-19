import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_FILES, brandDir, loadBrand } from "../src/brand.ts";
import { tempDir, testEnv } from "./helpers.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const SVGS = [
  "wizardingcode-lockup.svg",
  "wizardingcode-lockup-reverse.svg",
  "wizardingcode-mark.svg",
];

function brandFolder(prefix: string): string {
  const dir = tempDir(prefix);
  writeFileSync(join(dir, BRAND_FILES.lockup), `<svg id="lockup-${prefix}"></svg>\n`);
  writeFileSync(join(dir, BRAND_FILES.mark), `<svg id="mark-${prefix}"></svg>\n`);
  return dir;
}

test("SP8-T5 AC-4: the plugin ships byte-identical copies of the three SVGs of docs/brand with the licence note", () => {
  for (const name of SVGS) {
    const source = readFileSync(join(REPO, "docs", "brand", name));
    const copy = readFileSync(join(REPO, "plugins", "core", "brand", name));
    expect(copy.equals(source), name).toBe(true);
  }
  const readme = readFileSync(join(REPO, "plugins", "core", "brand", "README.md"), "utf8");
  expect(readme).toContain("identify WizardingCode");
  expect(readme).toContain("not covered by the repository's MIT licence");
  expect(readme).toMatch(/ADR 0001/);
  expect(BRAND_FILES).toEqual({
    lockup: "wizardingcode-lockup.svg",
    mark: "wizardingcode-mark.svg",
    reverse: "wizardingcode-lockup-reverse.svg",
  });
});

test("SP8-T5 AC-4: brandDir resolves the variable, then the plugin root's brand folder, then the bundle's sibling, then the root's docs/brand; loadBrand reads the lockup and the mark", () => {
  const byVariable = brandFolder("crew-brand-var-");
  const pluginRoot = tempDir("crew-brand-plugin-");
  mkdirSync(join(pluginRoot, "brand"));
  writeFileSync(join(pluginRoot, "brand", BRAND_FILES.lockup), '<svg id="lockup-plugin"></svg>\n');
  writeFileSync(join(pluginRoot, "brand", BRAND_FILES.mark), '<svg id="mark-plugin"></svg>\n');
  const bundleHome = tempDir("crew-brand-bundle-");
  mkdirSync(join(bundleHome, "dist"));
  mkdirSync(join(bundleHome, "brand"));
  writeFileSync(join(bundleHome, "brand", BRAND_FILES.lockup), '<svg id="lockup-bundle"></svg>\n');
  writeFileSync(join(bundleHome, "brand", BRAND_FILES.mark), '<svg id="mark-bundle"></svg>\n');
  const root = tempDir("crew-brand-root-");
  mkdirSync(join(root, "docs", "brand"), { recursive: true });
  writeFileSync(join(root, "docs", "brand", BRAND_FILES.lockup), '<svg id="lockup-root"></svg>\n');
  writeFileSync(join(root, "docs", "brand", BRAND_FILES.mark), '<svg id="mark-root"></svg>\n');
  const base = { ...testEnv() };
  delete base.CLAUDE_PLUGIN_ROOT;
  delete base.WIZARDINGCODE_CREW_BRAND_DIR;
  expect(
    brandDir(
      { ...base, WIZARDINGCODE_CREW_BRAND_DIR: byVariable, CLAUDE_PLUGIN_ROOT: pluginRoot },
      root,
      join(bundleHome, "dist"),
    ),
  ).toBe(byVariable);
  expect(
    brandDir({ ...base, CLAUDE_PLUGIN_ROOT: pluginRoot }, root, join(bundleHome, "dist")),
  ).toBe(join(pluginRoot, "brand"));
  expect(brandDir(base, root, join(bundleHome, "dist"))).toBe(join(bundleHome, "brand"));
  expect(brandDir(base, root, join(tempDir("crew-brand-nodist-"), "dist"))).toBe(
    join(root, "docs", "brand"),
  );
  // A folder with one of the two files is not the brand; nothing found is null.
  const half = tempDir("crew-brand-half-");
  writeFileSync(join(half, BRAND_FILES.lockup), "<svg></svg>\n");
  expect(
    brandDir(
      { ...base, WIZARDINGCODE_CREW_BRAND_DIR: half },
      tempDir("crew-brand-empty-"),
      join(tempDir("crew-brand-nodist2-"), "dist"),
    ),
  ).toBeNull();
  const brand = loadBrand(byVariable);
  expect(brand).toEqual({
    dir: byVariable,
    lockup: '<svg id="lockup-crew-brand-var-"></svg>\n',
    mark: '<svg id="mark-crew-brand-var-"></svg>\n',
  });
  expect(loadBrand(half)).toBeNull();
  expect(loadBrand(join(REPO, "plugins", "core", "brand"))?.lockup).toContain("<svg");
});
