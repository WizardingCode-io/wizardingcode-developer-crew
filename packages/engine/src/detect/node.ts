import { join } from "node:path";
import { exists, readJson } from "../fs.ts";
import type { GateName } from "../types.ts";
import type { DetectedTarget, Detector } from "./types.ts";

interface PackageJson {
  scripts?: Record<string, string>;
}

const SCRIPT_CANDIDATES: Record<Exclude<GateName, "secrets" | "deps">, string[]> = {
  build: ["build"],
  test: ["test", "test:unit", "unit"],
  lint: ["lint", "lint:check", "eslint", "biome"],
  typecheck: ["typecheck", "type-check", "types", "tsc"],
};

const TSC_BY_MANAGER: Record<string, string> = {
  npm: "npx tsc --noEmit",
  pnpm: "pnpm exec tsc --noEmit",
  yarn: "yarn tsc --noEmit",
  bun: "bunx tsc --noEmit",
};

function packageManager(dir: string): string {
  if (exists(join(dir, "bun.lock")) || exists(join(dir, "bun.lockb"))) return "bun";
  if (exists(join(dir, "pnpm-lock.yaml"))) return "pnpm";
  if (exists(join(dir, "yarn.lock"))) return "yarn";
  return "npm";
}

export const nodeDetector: Detector = {
  stack: "node",
  detect(dir: string): DetectedTarget | null {
    const pkg = readJson<PackageJson>(join(dir, "package.json"));
    if (!pkg) return null;
    const manager = packageManager(dir);
    const scripts = pkg.scripts ?? {};
    const gates: Partial<Record<GateName, string>> = {};
    for (const [gate, names] of Object.entries(SCRIPT_CANDIDATES) as [GateName, string[]][]) {
      const name = names.find((candidate) => candidate in scripts);
      if (!name) continue;
      // `npm init` leaves a test script that only prints an error; it is not a test runner.
      if (gate === "test" && /no test specified/.test(scripts[name] ?? "")) continue;
      gates[gate] = `${manager} run ${name}`;
    }
    if (!gates.typecheck && exists(join(dir, "tsconfig.json"))) {
      gates.typecheck = TSC_BY_MANAGER[manager];
    }
    return { stack: "node", packageManager: manager, gates };
  },
};
