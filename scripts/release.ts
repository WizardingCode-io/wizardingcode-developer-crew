import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The version files CLAUDE.md's `## Releasing` section names, sorted: its backticked `.json` paths and
 * `version.ts`. The section is the release's list, so the check reads it rather than a copy of it
 * (finding 162).
 */
export function releaseFiles(root: string): string[] {
  const text = readFileSync(join(root, "CLAUDE.md"), "utf8");
  const section = text.slice(text.indexOf("## Releasing"), text.indexOf("## Conventions"));
  const paths = [...section.matchAll(/`([^`\s]+(?:\.json|\/version\.ts))`/g)].map(
    (m) => m[1] as string,
  );
  return [...new Set(paths)].sort();
}

/** The release files under `root` that do not carry `version`: a `.json` by its `version` field, `version.ts` by its `VERSION` constant. */
export function staleReleaseFiles(root: string, version: string): string[] {
  return releaseFiles(root).filter((rel) => {
    const text = readFileSync(join(root, rel), "utf8");
    return rel.endsWith(".json")
      ? (JSON.parse(text) as { version?: unknown }).version !== version
      : !text.includes(`export const VERSION = "${version}";`);
  });
}
