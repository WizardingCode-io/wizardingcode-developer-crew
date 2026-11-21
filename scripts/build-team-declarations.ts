#!/usr/bin/env bun
// Writes `plugins/core/teams/<team>.md` from the nine team definitions under `docs/specs/` (item
// 2026-11-21-001): each definition's text from `## 3. ` to the line before its last section, under
// one comment line. Run by hand after a definition changes; nothing here runs at install or at
// runtime. Every definition is cut before any file is written, so a refusal writes nothing.
//   bun scripts/build-team-declarations.ts [--root <repository>]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cutDeclaration, TEAM_DEFINITION_FILES } from "../packages/engine/src/team-sources.ts";

const at = process.argv.indexOf("--root");
const ROOT = at < 0 ? join(import.meta.dir, "..") : (process.argv[at + 1] ?? "");
// An empty root would read and write under the current folder.
if (!ROOT) {
  console.error("usage: bun scripts/build-team-declarations.ts [--root <repository>]");
  process.exit(1);
}
const OUT = join(ROOT, "plugins", "core", "teams");

const cut: [string, string][] = [];
for (const [team, file] of Object.entries(TEAM_DEFINITION_FILES)) {
  let definition: string;
  try {
    definition = readFileSync(join(ROOT, "docs", "specs", file), "utf8");
  } catch {
    console.error(`docs/specs/${file} cannot be read: nothing written`);
    process.exit(1);
  }
  const text = cutDeclaration(definition, file);
  if (text === null) {
    console.error(
      `docs/specs/${file} lacks "## 3. " or "What the code needs, not decided here": nothing written`,
    );
    process.exit(1);
  }
  cut.push([team, text]);
}
mkdirSync(OUT, { recursive: true });
for (const [team, text] of cut) writeFileSync(join(OUT, `${team}.md`), text);
console.log(`wrote ${cut.length} declarations to ${OUT}`);
