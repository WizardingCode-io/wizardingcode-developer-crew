#!/usr/bin/env bun
// Writes `plugins/core/skills/<skill>/sources.md` for each of the teams' own skills that holds
// subjects (item 2026-11-21-008), from the team's declaration under `plugins/core/teams/`: the
// subjects' rows, cut and never rewritten. Run by hand after a definition changes and its
// declaration is built again; nothing here runs at install or at runtime. Every text is computed,
// and every skill's folder seen, before any file is written, so a refusal writes nothing; no other
// file is written.
//   bun scripts/build-team-skills.ts [--root <repository>]
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillSources, TEAM_SKILLS } from "../packages/engine/src/team-skills.ts";
import { readTeamDeclaration } from "../packages/engine/src/team-sources.ts";
import type { TeamName } from "../packages/engine/src/types.ts";

const at = process.argv.indexOf("--root");
const ROOT = at < 0 ? join(import.meta.dir, "..") : (process.argv[at + 1] ?? "");
// An empty root would read and write under the current folder.
if (!ROOT) {
  console.error("usage: bun scripts/build-team-skills.ts [--root <repository>]");
  process.exit(1);
}
const PLUGIN = join("plugins", "core");

function refuse(why: string): never {
  console.error(`team skills not built: ${why}`);
  process.exit(1);
}
const isFolder = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;

const texts: [string, string][] = [];
for (const team of Object.keys(TEAM_SKILLS) as TeamName[]) {
  const read = readTeamDeclaration(join(ROOT, PLUGIN), team);
  if ("refused" in read) refuse(read.refused);
  const made = skillSources(team, read.text);
  if (!made.ok) refuse(made.refused);
  for (const file of made.files) {
    const folder = join(PLUGIN, "skills", file.skill);
    if (!isFolder(join(ROOT, folder))) refuse(`no folder ${folder}`);
    texts.push([join(folder, "sources.md"), file.text]);
  }
}
for (const [path, text] of texts) {
  writeFileSync(join(ROOT, path), text);
  console.log(`wrote ${path}`);
}
