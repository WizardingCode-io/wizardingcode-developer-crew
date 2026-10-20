import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PackManifest } from "../src/packs.ts";
import { VERSION } from "../src/version.ts";
import { tempDir } from "./helpers.ts";

/** A user directory of its own, as `WIZARDINGCODE_HOME/crew` is. */
export function userDir(): string {
  const dir = join(tempDir("crew-home-"), "crew");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A sound manifest of a stack pack, every field present. */
export function manifest(over: Partial<PackManifest> = {}): PackManifest {
  return {
    name: "wizardingcode-pack-laravel",
    version: "0.1.0",
    kind: "stack",
    core: `>=${VERSION}`,
    verifiedAgainst: { laravel: "12.x" },
    detectors: [
      {
        stack: "laravel",
        extends: "php",
        markers: ["artisan", "composer.json"],
        packageManager: "composer",
        gates: { test: "php artisan test", lint: "vendor/bin/pint --test" },
        testScoped: "php artisan test {files}",
      },
    ],
    checklists: ["checklists/eloquent-model.md"],
    knowledge: { laravel: "knowledge/laravel.md" },
    team: null,
    evals: ["pack-laravel-refines-the-gates"],
    provenance: [],
    ...over,
  };
}

/** A pack folder under a temp directory: the manifest, one checklist, one knowledge file. */
export function writePack(
  over: Partial<PackManifest> = {},
  files: Record<string, string> = {},
  raw?: string,
): string {
  const root = tempDir("pack-");
  const m = manifest(over);
  const all: Record<string, string> = {
    "checklists/eloquent-model.md": "# Eloquent model\n\n- a cast per column\n",
    "knowledge/laravel.md": "# Laravel\n\nWhat the model gets wrong: facades in jobs.\n",
    ...files,
  };
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  writeFileSync(join(root, "pack.json"), raw ?? JSON.stringify(m, null, 2));
  return root;
}
