// What the tests of the frontend team's skills share (item 2026-11-17-003): reading a skill's page
// by its sections and its rule tables, and its sources file by the address each line holds. Not a
// test file: it holds no row of its own.

import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dir, "..", "..", "..");
export const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
export const ADDRESS = /https?:\/\/[^\s|)>`]+/g;
/** The header every rule table of a skill's page has. */
export const HEADER = "| Rule | Label | Source | What the source is |";

/** The page's sections by their `## ` title, each as its lines. */
export function sections(text: string): Map<string, string[]> {
  const found = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) {
      current = [];
      found.set(line.slice(3).trim(), current);
    } else current?.push(line);
  }
  return found;
}

const cells = (line: string): string[] =>
  line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

/** A section's rule rows: the lines of its tables after the header and the rule. */
export function rows(lines: string[]): string[][] {
  return lines
    .filter((l) => l.startsWith("|") && l !== HEADER)
    .map(cells)
    .filter((c) => !c.every((cell) => /^:?-+:?$/.test(cell)));
}

/** The header line of each table in a run of lines: the first line of a block that starts with a pipe. */
export function tableHeaders(lines: string[]): string[] {
  return lines.filter(
    (line, i, all) => line.startsWith("|") && !(all[i - 1] ?? "").startsWith("|"),
  );
}

/** A sources file's lines by the address each holds. */
export function listed(path: string): Map<string, string> {
  const lines = new Map<string, string>();
  for (const line of repoFile(path).split(/\r?\n/)) {
    const address = line.match(ADDRESS)?.[0];
    if (address) lines.set(address, line);
  }
  return lines;
}
