// The teams' own skills and the subjects each holds, and the file of sources that stands beside a
// skill: the subjects' rows of the team's declaration, cut and never rewritten. The rows hold titles
// and addresses as the definition's research left them, so a file here is provenance and no rule.

import { declarationLine, TEAM_DEFINITION_FILES } from "./team-sources.ts";
import type { TeamName } from "./types.ts";

export interface TeamSkill {
  /** The skill's folder under the plugin's skills, and its name. */
  skill: string;
  title: string;
  /** The subjects of the definition's section 3 it holds, in the definition's order; none for an entry. */
  subjects: readonly string[];
}

/** Each team's own skills, in its definition's order. A subject stands in one skill. */
export const TEAM_SKILLS: Readonly<Partial<Record<TeamName, readonly TeamSkill[]>>> = {
  qa: [
    { skill: "wizardingcode-qa-testing", title: "Testing", subjects: [] },
    {
      skill: "wizardingcode-qa-proof",
      title: "Proof",
      subjects: [
        "A test per criterion, red first",
        "Preserve criteria and regression tests",
        "Observed criteria and their reason",
        "Criteria observable and provable",
      ],
    },
    {
      skill: "wizardingcode-qa-test-design",
      title: "Test design",
      subjects: [
        "Nothing true by construction",
        "Behaviour, not implementation",
        "Fixtures with neutral names",
        "Strategy and levels",
        "Test doubles and boundaries",
        "Test data and state",
      ],
    },
    { skill: "wizardingcode-qa-e2e-api", title: "End to end and API", subjects: ["End to end"] },
    {
      skill: "wizardingcode-qa-measuring",
      title: "Measuring the tests",
      subjects: [
        "Mutation",
        "Flaky tests and determinism",
        "Property-based testing and fuzzing",
        "The suite in CI",
      ],
    },
    { skill: "wizardingcode-qa-evals", title: "Evals", subjects: ["Testing systems with AI"] },
  ],
};

export type SkillSources =
  | { ok: true; files: { skill: string; text: string }[] }
  | { ok: false; refused: string };

const SUBJECTS_HEADER = "| Subject | Sources |";

/**
 * The subjects of a declaration's first table with their second cells, as the file holds them, or
 * the subject the table holds twice; null with no such table. A line that is no whole row ends the table.
 */
function declaredSubjects(declaration: string): Map<string, string> | { twice: string } | null {
  const lines = declaration.split("\n");
  const from = lines.indexOf(SUBJECTS_HEADER);
  if (from < 0) return null;
  const found = new Map<string, string>();
  // The line after the header is the table's rule.
  for (const line of lines.slice(from + 2)) {
    const cut = line.indexOf(" | ", 2);
    if (!line.startsWith("| ") || !line.endsWith(" |") || cut < 0) break;
    const subject = line.slice(2, cut);
    if (found.has(subject)) return { twice: subject };
    found.set(subject, line.slice(cut + 3, -2));
  }
  return found;
}

/** The paragraph every file of sources opens with, after its title: what a line of the file is, and is not. */
const PARAGRAPH = [
  "Each section is a subject of the team's definition (`<definition>`, section 3) with its sources as the definition's row holds them, one a line.",
  "The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read.",
  "A line is where a subject is read and no line is a rule.",
  "The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.",
].join(" ");

/**
 * The file of sources of each skill of a team that holds subjects, from the team's declaration:
 * a title, the fixed paragraph and a section a subject, the row's second cell cut at each `; ` so
 * that its lines joined again are the cell. It writes nothing. It refuses, naming the subject,
 * where the table of skills and the declaration do not hold each other and where a cell holds a
 * character the engine would remove from a printed line, since the cell is copied as it stands.
 */
export function skillSources(
  team: TeamName,
  declaration: string,
  skills: readonly TeamSkill[] | undefined = TEAM_SKILLS[team],
): SkillSources {
  const refuse = (refused: string): SkillSources => ({ ok: false, refused });
  if (skills === undefined)
    return refuse(`the team "${team}" has no skill of its own in the table`);
  const declared = declaredSubjects(declaration);
  if (declared === null) return refuse("the declaration has no table of subjects");
  if (!(declared instanceof Map))
    return refuse(`the declaration holds the subject "${declared.twice}" twice`);
  const taken = new Set<string>();
  const files: { skill: string; text: string }[] = [];
  const paragraph = PARAGRAPH.replace("<definition>", `docs/specs/${TEAM_DEFINITION_FILES[team]}`);
  for (const skill of skills) {
    const sections: string[] = [];
    for (const subject of skill.subjects) {
      const cell = declared.get(subject);
      if (cell === undefined) return refuse(`the declaration holds no subject "${subject}"`);
      if (taken.has(subject)) return refuse(`two skills take the subject "${subject}"`);
      taken.add(subject);
      sections.push(`## ${subject}`, "", ...cell.split("; ").map((source) => `- ${source}`), "");
    }
    if (sections.length > 0)
      files.push({
        skill: skill.skill,
        text: [`# Sources of ${skill.title}`, "", paragraph, "", ...sections].join("\n"),
      });
  }
  for (const [subject, cell] of declared) {
    if (!taken.has(subject)) return refuse(`no skill takes the subject "${subject}"`);
    if (declarationLine(cell) !== cell)
      return refuse(`the subject "${subject}" holds a character that is not printed`);
  }
  return { ok: true, files };
}
