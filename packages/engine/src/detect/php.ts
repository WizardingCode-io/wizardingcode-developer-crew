import { join } from "node:path";
import { exists, readJson } from "../fs.ts";
import type { GateName } from "../types.ts";
import { testScripts } from "./scripts.ts";
import type { DetectedTarget, Detector } from "./types.ts";

interface ComposerJson {
  scripts?: Record<string, unknown>;
}

export const phpDetector: Detector = {
  stack: "php",
  detect(dir: string): DetectedTarget | null {
    const composer = readJson<ComposerJson>(join(dir, "composer.json"));
    if (!composer) return null;
    const scripts = composer.scripts ?? {};
    const installed = (tool: string) => exists(join(dir, "vendor", "bin", tool));
    const run = (name: string) => `composer run ${name}`;
    const convention = testScripts(scripts);
    const gates: Partial<Record<GateName, string>> = {};
    // The project's `test` script owns the test gate; without one, its `test:*` scripts in order
    // and then the runner compose it (the team's own flow, finding 23).
    const runner = installed("pest")
      ? "vendor/bin/pest"
      : installed("phpunit")
        ? "vendor/bin/phpunit"
        : undefined;
    if ("test" in scripts) gates.test = run("test");
    else {
      const parts = [...convention.rest.map(run), ...(runner ? [runner] : [])];
      if (parts.length) gates.test = parts.join(" && ");
    }
    // The check form wins over a script that fixes: a gate must not rewrite watched files.
    if (convention.lint) gates.lint = run(convention.lint);
    else if ("lint" in scripts) gates.lint = run("lint");
    else if (installed("pint")) gates.lint = "vendor/bin/pint --test";
    if (convention.types) gates.typecheck = run(convention.types);
    else if ("analyse" in scripts) gates.typecheck = run("analyse");
    else if ("analyze" in scripts) gates.typecheck = run("analyze");
    else if (installed("phpstan")) gates.typecheck = "vendor/bin/phpstan analyse --no-progress";
    return { stack: "php", packageManager: "composer", gates };
  },
};
