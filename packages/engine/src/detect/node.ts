import { join } from "node:path";
import { exists, readJson } from "../fs.ts";
import type { GateName } from "../types.ts";
import { hasTestFiles, testScripts } from "./scripts.ts";
import type { DetectedTarget, Detector } from "./types.ts";

interface PackageJson {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  /** `pnpm@9.1.0`: the manager the project declares, which Corepack honours. */
  packageManager?: string;
}

/** npm, yarn and bun list workspaces as an array; yarn also accepts an object with `packages`. */
function workspaceGlobs(pkg: PackageJson): string[] {
  const raw = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
  return (raw ?? [])
    .filter((glob): glob is string => typeof glob === "string")
    .map((glob) => glob.replace(/^\.\//, "").replace(/\/$/, ""));
}

// `test:*` scripts are read by the convention in scripts.ts, so only the plain names sit here.
const SCRIPT_CANDIDATES: Record<Exclude<GateName, "secrets" | "deps">, string[]> = {
  build: ["build"],
  test: ["test", "unit"],
  lint: ["lint", "lint:check", "eslint", "biome"],
  typecheck: ["typecheck", "type-check", "types", "tsc"],
  e2e: ["test:e2e", "e2e"],
};

/** The end-to-end runners known by their config file, when no script names one (SP7 §8.2): always proposed. */
const E2E_BY_CONFIG: [string, string][] = [
  ["playwright.config", "npx playwright test"],
  ["cypress.config", "npx cypress run"],
];
const CONFIG_EXTENSIONS = ["ts", "js", "mjs", "cjs"];

const TSC_BY_MANAGER: Record<string, string> = {
  npm: "npx tsc --noEmit",
  pnpm: "pnpm exec tsc --noEmit",
  yarn: "yarn tsc --noEmit",
  bun: "bunx tsc --noEmit",
};

const MANAGERS = ["npm", "pnpm", "yarn", "bun"];
const LOCKFILES: [string, string[]][] = [
  ["bun", ["bun.lock", "bun.lockb"]],
  ["pnpm", ["pnpm-lock.yaml"]],
  ["yarn", ["yarn.lock"]],
  ["npm", ["package-lock.json", "npm-shrinkwrap.json"]],
];

/**
 * The declared `packageManager` field wins. Otherwise the lockfile says; with more than one
 * lockfile the first wins but the guess is marked, so the commands are proposed rather than
 * detected (finding 13 of the real-use phase: a pnpm project with a stale bun.lock).
 */
function packageManager(dir: string, pkg: PackageJson): { manager: string; sure: boolean } {
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : "";
  if (declared && MANAGERS.includes(declared)) return { manager: declared, sure: true };
  const present = LOCKFILES.filter(([, files]) => files.some((f) => exists(join(dir, f)))).map(
    ([manager]) => manager,
  );
  return { manager: present[0] ?? "npm", sure: present.length <= 1 };
}

export const nodeDetector: Detector = {
  stack: "node",
  detect(dir: string): DetectedTarget | null {
    const pkg = readJson<PackageJson>(join(dir, "package.json"));
    if (!pkg) return null;
    const { manager, sure } = packageManager(dir, pkg);
    const scripts = pkg.scripts ?? {};
    const gates: Partial<Record<GateName, string>> = {};
    for (const [gate, names] of Object.entries(SCRIPT_CANDIDATES) as [GateName, string[]][]) {
      const name = names.find((candidate) => candidate in scripts);
      if (!name) continue;
      // `npm init` leaves a test script that only prints an error; it is not a test runner.
      if (gate === "test" && /no test specified/.test(scripts[name] ?? "")) continue;
      gates[gate] = `${manager} run ${name}`;
    }
    // The team's `test:*` convention (finding 23): the check forms win for lint and typecheck, and
    // without a `test` script the remaining `test:*` scripts compose the test gate; a bun project
    // with test files and no script at all runs `bun test`.
    const convention = testScripts(scripts);
    if (convention.lint) gates.lint = `${manager} run ${convention.lint}`;
    if (convention.types) gates.typecheck = `${manager} run ${convention.types}`;
    if (!gates.test) {
      if (convention.rest.length)
        gates.test = convention.rest.map((n) => `${manager} run ${n}`).join(" && ");
      else if (manager === "bun" && (exists(join(dir, "bunfig.toml")) || hasTestFiles(dir)))
        gates.test = "bun test";
    }
    if (!gates.typecheck && exists(join(dir, "tsconfig.json"))) {
      gates.typecheck = TSC_BY_MANAGER[manager];
    }
    const proposedGates: GateName[] = [];
    if (!gates.e2e) {
      const runner = E2E_BY_CONFIG.find(([config]) =>
        CONFIG_EXTENSIONS.some((ext) => exists(join(dir, `${config}.${ext}`))),
      );
      if (runner) {
        gates.e2e = runner[1];
        proposedGates.push("e2e");
      }
    }
    const workspaces = workspaceGlobs(pkg);
    // A runner that takes the files to test gives a todo's gate its scoped command (SP7 §8.1).
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const testScoped =
      "vitest" in deps
        ? "vitest related {files} --run"
        : "jest" in deps
          ? "jest --findRelatedTests {files}"
          : undefined;
    return {
      stack: "node",
      packageManager: manager,
      gates,
      ...(testScoped ? { testScoped } : {}),
      ...(workspaces.length ? { workspaces } : {}),
      ...(sure ? {} : { proposed: true }),
      ...(proposedGates.length ? { proposedGates } : {}),
    };
  },
};
