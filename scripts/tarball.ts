import { execFileSync } from "node:child_process";
import { chmodSync, cpSync, mkdirSync, mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** What the archive carries of `plugins/core`: the plugin as it runs (the e2e fixture a project imports from the plugin root among it), never its evals, its tooling or a local file beside the manifest. */
const SHIPPED = [
  ".claude-plugin/plugin.json",
  "agents",
  "bin",
  "dist/crew.mjs",
  "e2e",
  "hooks",
  "skills",
] as const;
const TOP = "wizardingcode-developer-crew";

/**
 * The release asset for the runtimes that are not Claude Code (SP6 Task 4 AC-6; ADR 0011): the
 * plugin folder under one top-level folder, `bin/crew` executable, as
 * `<outDir>/wizardingcode-developer-crew-<version>.tar.gz`. Returns the archive's path.
 */
export function buildTarball(version: string, outDir: string, pluginDir = "plugins/core"): string {
  const staging = mkdtempSync(join(tmpdir(), "crew-tarball-"));
  const top = join(staging, TOP);
  for (const rel of SHIPPED) {
    const target = join(top, rel);
    mkdirSync(join(target, ".."), { recursive: true });
    cpSync(join(pluginDir, rel), target, { recursive: true });
  }
  chmodSync(join(top, "bin", "crew"), 0o755);
  mkdirSync(outDir, { recursive: true });
  const archive = join(outDir, `${TOP}-${version}.tar.gz`);
  execFileSync("tar", ["-czf", archive, "-C", staging, TOP]);
  return archive;
}

/** The archive's size in kilobytes, for the build's line. */
export function archiveKilobytes(archive: string): number {
  return Math.round(statSync(archive).size / 1024);
}
