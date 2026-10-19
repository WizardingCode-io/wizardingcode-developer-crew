/**
 * The brand's assets for the deliverables the engine renders (SP7 §5 rule 19, §13.2; ADR 0001):
 * the lockup and the mark, found in the first folder that holds both, in a fixed order.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const BRAND_FILES = {
  lockup: "wizardingcode-lockup.svg",
  mark: "wizardingcode-mark.svg",
  reverse: "wizardingcode-lockup-reverse.svg",
} as const;

export interface Brand {
  dir: string;
  lockup: string;
  mark: string;
}

/** Where this module runs from: the plugin's `dist/` in the bundle, the engine's `src/` in development. */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function holdsBrand(dir: string): boolean {
  return existsSync(join(dir, BRAND_FILES.lockup)) && existsSync(join(dir, BRAND_FILES.mark));
}

/**
 * The brand folder: `WIZARDINGCODE_CREW_BRAND_DIR`, then `$CLAUDE_PLUGIN_ROOT/brand`, then the
 * running bundle's sibling `brand` folder, then `<root>/docs/brand`; the first that holds the
 * lockup and the mark, or null.
 */
export function brandDir(
  env: NodeJS.ProcessEnv,
  root: string,
  bundleDir: string = MODULE_DIR,
): string | null {
  const named = env.WIZARDINGCODE_CREW_BRAND_DIR?.trim();
  const pluginRoot = env.CLAUDE_PLUGIN_ROOT?.trim();
  const candidates = [
    named || null,
    pluginRoot ? join(pluginRoot, "brand") : null,
    join(bundleDir, "..", "brand"),
    join(root, "docs", "brand"),
  ];
  for (const candidate of candidates) if (candidate && holdsBrand(candidate)) return candidate;
  return null;
}

/** The lockup and the mark of a brand folder, or null when either is missing. */
export function loadBrand(dir: string): Brand | null {
  if (!holdsBrand(dir)) return null;
  return {
    dir,
    lockup: readFileSync(join(dir, BRAND_FILES.lockup), "utf8"),
    mark: readFileSync(join(dir, BRAND_FILES.mark), "utf8"),
  };
}

/** The brand as the environment and the root find it, or null. */
export function brandOf(env: NodeJS.ProcessEnv, root: string): Brand | null {
  const dir = brandDir(env, root);
  return dir ? loadBrand(dir) : null;
}
