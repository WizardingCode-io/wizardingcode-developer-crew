import { statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";

/**
 * The files a lint or typecheck run names in its output (ADR 0006). ESLint prints a file's path on
 * its own line, biome and ruff `path:line:col`, tsc and vue-tsc `path(line,col)`, Pint and PHPStan
 * the path in a listing: a token is a file when it ends in a source extension and exists on disk,
 * resolved against the target folder and then the repository root. Everything else (URLs, rule
 * names, versions) is text. Paths come back relative to the root, once each, in order.
 */
const SOURCE_FILE =
  /^(?:\.{0,2}\/)?[\w@./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro|php|py|rb|go|rs|kt|java|cs|json|css|scss|html)$/;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function namedFiles(text: string, dirs: string[], root: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const token = (raw.replace(/^[("'`[]+/, "").split(/[:(]/)[0] ?? "").replace(/[,;)\]"'`]+$/, "");
    if (!SOURCE_FILE.test(token)) continue;
    const candidates = isAbsolute(token) ? [token] : dirs.map((dir) => join(dir, token));
    for (const abs of candidates) {
      if (!isFile(abs)) continue;
      const rel = relative(root, abs).replace(/\\/g, "/");
      if (!rel.startsWith("..") && !seen.has(rel)) {
        seen.add(rel);
        found.push(rel);
      }
      break;
    }
  }
  return found;
}
