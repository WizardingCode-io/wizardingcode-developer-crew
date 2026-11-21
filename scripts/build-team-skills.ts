#!/usr/bin/env bun
// Writes `plugins/core/skills/<skill>/sources.md` for each of the teams' own skills that holds
// subjects (items 2026-11-21-008 and 009), from the team's declaration under `plugins/core/teams/`:
// the subjects' rows, cut and never rewritten. Run by hand after a definition changes and its
// declaration is built again; nothing here runs at install or at runtime. Every text is computed,
// and every skill's folder seen, for every team asked for, before any file is written, so a refusal
// writes nothing; no other file is written. `--team` builds one team's files alone.
//   bun scripts/build-team-skills.ts [--root <repository>] [--team <team>]
import { statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillSources, TEAM_SKILLS } from "../packages/engine/src/team-skills.ts";
import { readTeamDeclaration } from "../packages/engine/src/team-sources.ts";
import type { TeamName } from "../packages/engine/src/types.ts";

/** A flag's value: nothing where the flag is not given, empty where no value follows it. */
function flagValue(flag: string): string | undefined {
  const at = process.argv.indexOf(flag);
  return at < 0 ? undefined : (process.argv[at + 1] ?? "");
}
const root = flagValue("--root");
const team = flagValue("--team");
// An empty root would read and write under the current folder. A flag with no value after it is no
// request the script can read, for either flag: the usage, and nothing written.
if (root === "" || team === "") {
  console.error("usage: bun scripts/build-team-skills.ts [--root <repository>] [--team <team>]");
  process.exit(1);
}
const ROOT = root ?? join(import.meta.dir, "..");
const PLUGIN = join("plugins", "core");

function refuse(why: string): never {
  console.error(`team skills not built: ${why}`);
  process.exit(1);
}
const isFolder = (path: string) =>
  statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;

// The name is matched as an own key of the table before any path is built from it.
if (team !== undefined && !Object.hasOwn(TEAM_SKILLS, team))
  refuse(`no team "${team}" in the table`);
const teams = (team === undefined ? Object.keys(TEAM_SKILLS) : [team]) as TeamName[];

const texts: [string, string][] = [];
for (const name of teams) {
  const read = readTeamDeclaration(join(ROOT, PLUGIN), name);
  if ("refused" in read) refuse(read.refused);
  const made = skillSources(name, read.text);
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
