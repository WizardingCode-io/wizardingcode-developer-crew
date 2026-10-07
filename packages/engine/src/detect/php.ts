import { join } from "node:path";
import { exists, readJson } from "../fs.ts";
import type { GateName } from "../types.ts";
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
    const gates: Partial<Record<GateName, string>> = {};
    if ("test" in scripts) gates.test = "composer run test";
    else if (installed("pest")) gates.test = "vendor/bin/pest";
    else if (installed("phpunit")) gates.test = "vendor/bin/phpunit";
    if ("lint" in scripts) gates.lint = "composer run lint";
    else if (installed("pint")) gates.lint = "vendor/bin/pint --test";
    if ("analyse" in scripts) gates.typecheck = "composer run analyse";
    else if ("analyze" in scripts) gates.typecheck = "composer run analyze";
    else if (installed("phpstan")) gates.typecheck = "vendor/bin/phpstan analyse --no-progress";
    return { stack: "php", packageManager: "composer", gates };
  },
};
