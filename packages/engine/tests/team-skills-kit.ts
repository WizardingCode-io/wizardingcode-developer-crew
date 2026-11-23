// What the tests of the teams' own skills share (qa-skills, devops-skills, agentic-skills,
// architects-skills, researchers-skills): the reading of a declaration and of a SKILL.md, the checks every skill is
// held to, the sentences of the build reference, and the copy of the plugin the script's rows run
// on. Each team's test keeps its own rows, values and limits.
import { expect } from "bun:test";
import { cpSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./helpers.ts";

export const ROOT = join(import.meta.dir, "..", "..", "..");
export const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
export const SKILLS = "plugins/core/skills";
export const ADDRESS = /https?:\/\/[^\s|)>`]+/g;

export const UNDER_THE_RULES =
  "The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.";
export const NEVER_OPENED =
  "The addresses in sources.md are provenance: they are never opened by the session.";
export const SAYS_SO =
  "A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.";

/**
 * The subjects of a declaration's first table with their second cells, read by the tests' own
 * pattern. The table is found by its header, which is the four teams' unless another is given.
 */
export function declared(text: string, header = "| Subject | Sources |"): [string, string][] {
  const lines = text.split("\n");
  const from = lines.indexOf(header);
  if (from < 0) throw new Error("the declaration has no table of subjects");
  const found: [string, string][] = [];
  // Its own reading of a row, by a pattern: the subject is the shortest first cell, the rest the second.
  for (const line of lines.slice(from + 2)) {
    const row = /^\| (.+?) \| (.*) \|$/.exec(line);
    if (!row) break;
    found.push([row[1] ?? "", row[2] ?? ""]);
  }
  return found;
}

/** A text with every run of white space as one space. */
export const run = (text: string) => text.replace(/\s+/g, " ").trim();
export const skillFile = (skill: string) => repoFile(`${SKILLS}/${skill}/SKILL.md`);
export const sourcesFile = (skill: string) => repoFile(`${SKILLS}/${skill}/sources.md`);
export const headings = (text: string) => text.split("\n").filter((line) => line.startsWith("## "));

/** The lines under a `## ` heading, to the next one. */
export function under(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const at = lines.indexOf(heading);
  if (at < 0) return [];
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end < 0 ? rest : rest.slice(0, end);
}

/** The table among some lines: its header, its rule line, and its rows as cells. */
export function tableRows(lines: string[]): { header: string; rule: string; rows: string[][] } {
  const table = lines.filter((line) => line.startsWith("|"));
  return {
    header: table[0] ?? "",
    rule: table[1] ?? "",
    rows: table.slice(2).map((line) =>
      line
        .slice(1, -1)
        .split(" | ")
        .map((cell) => cell.trim()),
    ),
  };
}

/** The frontmatter's two values, and the rest of the file after it. */
export function frontmatter(text: string): { name: string; description: string; body: string } {
  const match = /^---\nname: ([^\n]+)\ndescription: "([^\n]*)"\n---\n\n/.exec(text);
  if (!match) return { name: "", description: "", body: text };
  return { name: match[1] ?? "", description: match[2] ?? "", body: text.slice(match[0].length) };
}

/** A description is one sentence: not empty, at most 300 characters, one full stop, at its end. */
export function expectOneSentence(description: string, skill: string): void {
  expect({ skill, length: description.length > 0 && description.length <= 300 }).toEqual({
    skill,
    length: true,
  });
  expect({ skill, ends: description.endsWith(".") }).toEqual({ skill, ends: true });
  expect({ skill, stops: description.split(".").length - 1 }).toEqual({ skill, stops: 1 });
}

/** A skill holds no address and no fenced block. */
export function expectNothingToOpen(text: string, skill: string): void {
  expect({ skill, addresses: [...(text.match(ADDRESS) ?? [])] }).toEqual({ skill, addresses: [] });
  expect({ skill, plain: /https?:\/\//.test(text) }).toEqual({ skill, plain: false });
  expect({ skill, fenced: text.includes("```") }).toEqual({ skill, fenced: false });
}

/** A quotation's edge: the end of the text, or a character that is no letter and no digit of any script. */
export const wordEdge = (char: string | undefined) =>
  char === undefined || !/[\p{L}\p{N}]/u.test(char);

/** A copy of the plugin's teams and the folders of the skills given, in a folder of the tests' own. */
export function copyOf(skills: string[]): string {
  const copy = tempDir("crew-team-skills-");
  cpSync(join(ROOT, "plugins", "core", "teams"), join(copy, "plugins", "core", "teams"), {
    recursive: true,
  });
  for (const skill of skills)
    cpSync(join(ROOT, SKILLS, skill), join(copy, SKILLS, skill), { recursive: true });
  return copy;
}

/** Every path under a copy, sorted. */
export const listingOf = (copy: string) =>
  readdirSync(copy, { recursive: true, withFileTypes: true })
    .map((e) => join(e.parentPath, e.name).slice(copy.length))
    .sort();

/** The sentences of the build reference that send a session to a team's entry, in the table's order. */
export const ENTRY_SENTENCES = [
  "Before the first test of an item, and before judging one, read `wizardingcode-qa-testing`: it sends each subject to the skill that holds the crew's rule for it.",
  "Before a change to a pipeline, a deployment, an environment file or infrastructure code, read `wizardingcode-devops`: it sends each subject to the skill that holds the crew's rule for it.",
  "Before a change to an agent, a tool an agent calls, a prompt, a skill, a plugin or an MCP server, read `wizardingcode-agentic`: it sends each subject to the skill that holds the crew's rule for it.",
  "Before a change to a boundary, a model, a contract or an integration, and before a decision on the architecture or on a technology, read `wizardingcode-architecture`: it sends each subject to the skill that holds the crew's rule for it.",
  "Before research for an item is planned or run, and before its result is judged, read `wizardingcode-research`: it gives the method and sends a verification, an evidence map and a choice between candidates to the skill that holds the crew's rule for it.",
] as const;

/**
 * The build reference holds the teams' sentences as consecutive paragraphs in the table's order,
 * each once in the whole text, after the paragraph whose last line is the fifth step and before
 * the paragraph on a single test file.
 */
export function expectEntrySentences(build: string): void {
  for (const sentence of ENTRY_SENTENCES)
    expect({ sentence, times: build.split(sentence).length - 1 }).toEqual({ sentence, times: 1 });
  const paragraphs = build.split("\n\n");
  const at = paragraphs.indexOf(ENTRY_SENTENCES[0]);
  expect(paragraphs.slice(at, at + ENTRY_SENTENCES.length)).toEqual([...ENTRY_SENTENCES]);
  expect({ before: paragraphs[at - 1]?.split("\n").at(-1)?.startsWith("5. ") }).toEqual({
    before: true,
  });
  expect({
    after: paragraphs[at + ENTRY_SENTENCES.length]?.startsWith("Use `-- <command>`"),
  }).toEqual({ after: true });
}
