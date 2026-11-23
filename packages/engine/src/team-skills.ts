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
export const TEAM_SKILLS = {
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
  devops: [
    { skill: "wizardingcode-devops", title: "DevOps", subjects: [] },
    {
      skill: "wizardingcode-devops-pipelines",
      title: "Pipelines",
      subjects: ["Pipelines", "The pipeline's supply chain"],
    },
    {
      skill: "wizardingcode-devops-secrets-identities",
      title: "Secrets and identities",
      subjects: ["Secrets", "Permissions and identities"],
    },
    {
      skill: "wizardingcode-devops-environment-containers",
      title: "Environment and containers",
      subjects: ["Hosts", "Reproducibility", "The project's environment", "Containers and images"],
    },
    {
      skill: "wizardingcode-devops-iac",
      title: "Infrastructure as code",
      subjects: ["Infrastructure as code", "Cost"],
    },
    {
      skill: "wizardingcode-devops-deploy-rollback",
      title: "Deploy and rollback",
      subjects: [
        "Rollback",
        "Deployment strategies and releases",
        "Platforms and hosting",
        "Backups and disaster recovery",
      ],
    },
    {
      skill: "wizardingcode-devops-operation",
      title: "Operation",
      subjects: ["Observability and operation"],
    },
  ],
  "agentic-os": [
    { skill: "wizardingcode-agentic", title: "Agentic", subjects: [] },
    {
      skill: "wizardingcode-agentic-routing-measurement",
      title: "Routing and measurement",
      subjects: ["Orchestration", "Evaluation"],
    },
    {
      skill: "wizardingcode-agentic-agents-tools-prompts",
      title: "Agents, tools and prompts",
      subjects: [
        "Agents and subagents",
        "Tools for agents",
        "Prompts",
        "Prompt injection and excessive agency",
        "Permissions and hooks",
        "Context and cost",
      ],
    },
    {
      skill: "wizardingcode-agentic-skills-plugins",
      title: "Skills and plugins",
      subjects: ["Skills", "Plugins and distribution"],
    },
    { skill: "wizardingcode-agentic-mcp-servers", title: "MCP servers", subjects: ["MCP servers"] },
    { skill: "wizardingcode-agentic-memory", title: "Memory", subjects: ["Memory"] },
    { skill: "wizardingcode-agentic-knowledge", title: "Knowledge", subjects: ["Knowledge"] },
    {
      skill: "wizardingcode-agentic-improvement-loop",
      title: "Improvement loop",
      subjects: ["Learning and improvement"],
    },
    {
      skill: "wizardingcode-agentic-proactivity-unattended",
      title: "Proactivity and unattended work",
      subjects: ["Unattended work", "Proactivity and responsiveness"],
    },
    {
      skill: "wizardingcode-agentic-watch",
      title: "Watch",
      subjects: [
        "Frameworks, SDKs, runtimes and models",
        "Keeping current",
        "The reference assistants' engineering",
      ],
    },
  ],
  architects: [
    { skill: "wizardingcode-architecture", title: "Architecture", subjects: [] },
    {
      skill: "wizardingcode-architecture-decision",
      title: "Decision",
      subjects: [
        "Choosing the architecture style",
        "Decisions and documentation",
        "Evolution and debt",
        "Technology and dependencies",
        "AI and agents",
      ],
    },
    {
      skill: "wizardingcode-architecture-boundaries-contracts",
      title: "Boundaries and contracts",
      subjects: [
        "Layers and boundaries",
        "Data and domain model",
        "Contracts",
        "Integrations",
        "The spec's Design",
        "Consistency with neighbours",
      ],
    },
    {
      skill: "wizardingcode-architecture-quality-risk",
      title: "Quality attributes and risk",
      subjects: ["Risk in production", "Quality attributes"],
    },
    // Views holds no subject of section 3: C4 and the diagram tools are read under Decision's.
    { skill: "wizardingcode-architecture-views", title: "Views", subjects: [] },
  ],
  researchers: [
    // This team's entry holds the declaration's rows, the eight kinds of research.
    {
      skill: "wizardingcode-research",
      title: "Research",
      subjects: [
        "Code and repository",
        "Documentation",
        "News and recent changes",
        "Good practice and proven solutions",
        "Product and market",
        "Flows and frontend",
        "The user's voice",
        "Academic",
      ],
    },
    { skill: "wizardingcode-research-verification", title: "Verification", subjects: [] },
    { skill: "wizardingcode-research-evidence-map", title: "Evidence map", subjects: [] },
    { skill: "wizardingcode-research-selection", title: "Selection", subjects: [] },
  ],
} satisfies Partial<Record<TeamName, readonly TeamSkill[]>>;

/** The teams that have skills of their own: the table's keys, so the two cannot differ. */
export type SkilledTeam = keyof typeof TEAM_SKILLS;
const isSkilled = (team: TeamName): team is SkilledTeam => Object.hasOwn(TEAM_SKILLS, team);

export type SkillSources =
  | { ok: true; files: { skill: string; text: string }[] }
  | { ok: false; refused: string };

const SUBJECTS_HEADER = "| Subject | Sources |";
/**
 * The header of the first table of each team's declaration, and what a row of it is called in the
 * paragraph of a generated file. Keyed by the teams of `TEAM_SKILLS`, with no fallback.
 */
const TEAM_TABLE: Readonly<Record<SkilledTeam, readonly [header: string, row: string]>> = {
  qa: [SUBJECTS_HEADER, "a subject"],
  devops: [SUBJECTS_HEADER, "a subject"],
  "agentic-os": [SUBJECTS_HEADER, "a subject"],
  architects: [SUBJECTS_HEADER, "a subject"],
  researchers: ["| Kind | Sources |", "a kind of research"],
};

/**
 * The subjects of a declaration's first table with their second cells, as the file holds them, or
 * the subject the table holds twice; null with no such table. A line that is no whole row ends the table.
 */
function declaredSubjects(
  declaration: string,
  header: string,
): Map<string, string> | { twice: string } | null {
  const lines = declaration.split("\n");
  const from = lines.indexOf(header);
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

/** The two sentences of the teams whose research read each page's title. */
const TITLES_READ: readonly [string, string] = [
  "The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read.",
  "A line is where a subject is read and no line is a rule.",
];
/** What a line is for the teams whose declaration states rules of their own among its sources. */
const RULE_ONLY_AS_A_ROW =
  "A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file.";
/**
 * What a team's research read, and what a line of its sources is: the second and third sentences
 * of the paragraph. Keyed by the teams of `TEAM_SKILLS`, with no fallback, so a team added to one
 * table and not to the other does not compile.
 */
const TEAM_RESEARCH: Readonly<Record<SkilledTeam, readonly [string, string]>> = {
  qa: TITLES_READ,
  devops: TITLES_READ,
  "agentic-os": [
    "The research read the content of some pages and only the answer of others; a line that says a page was not opened names nothing that was read.",
    RULE_ONLY_AS_A_ROW,
  ],
  architects: [
    "The research read each source that has an address at that address on 2026-11-15; a line that says a page was not opened, or that a source was read in a summary, names nothing more than it says.",
    RULE_ONLY_AS_A_ROW,
  ],
  researchers: [
    "The research opened most of the pages; a line that says a page was not opened, or was read in part, names no more than it says.",
    RULE_ONLY_AS_A_ROW,
  ],
};

/** The paragraph a team's files of sources open with, after their title: what a line of the file is, and is not. */
function paragraphOf(team: SkilledTeam): string {
  return [
    `Each section is ${TEAM_TABLE[team][1]} of the team's definition (\`docs/specs/${TEAM_DEFINITION_FILES[team]}\`, section 3) with its sources as the definition's row holds them, one a line.`,
    ...TEAM_RESEARCH[team],
    "The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.",
  ].join(" ");
}

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
  given?: readonly TeamSkill[],
): SkillSources {
  const refuse = (refused: string): SkillSources => ({ ok: false, refused });
  if (!isSkilled(team)) return refuse(`the team "${team}" has no skill of its own in the table`);
  const skills = given ?? TEAM_SKILLS[team];
  const declared = declaredSubjects(declaration, TEAM_TABLE[team][0]);
  if (declared === null) return refuse("the declaration has no table of subjects");
  if (!(declared instanceof Map))
    return refuse(`the declaration holds the subject "${declared.twice}" twice`);
  const taken = new Set<string>();
  const files: { skill: string; text: string }[] = [];
  const paragraph = paragraphOf(team);
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
