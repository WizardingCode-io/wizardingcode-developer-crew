import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillSources, TEAM_SKILLS } from "../src/team-skills.ts";
import {
  ADDRESS,
  copyOf,
  declared,
  ENTRY_SENTENCES,
  expectEntrySentences,
  expectNothingToOpen,
  expectOneSentence,
  frontmatter,
  headings,
  listingOf,
  NEVER_OPENED,
  ROOT,
  repoFile,
  run,
  SAYS_SO,
  SKILLS,
  skillFile,
  sourcesFile,
  tableRows,
  UNDER_THE_RULES,
  under,
  wordEdge,
} from "./team-skills-kit.ts";

// The ETL team's eleven skills. The entry is one of them, Sizing to the volume. The declaration's
// sections 3, 4 and 5 hold addresses, install lines and servers that write or send data outside
// the machine, so a quotation of it is held to two places and two passages. The one outside
// source is under MPL-2.0 and enters by the user's D-1 of this item; no skill ships a script (D-2).
const ITEM = "2026-11-26-003";
const DECLARATION = "plugins/core/teams/etl.md";
const DEFINITION = "docs/specs/2026-11-15-etl-team-design.md";
const RUBRIC = "plugins/core/skills/crew/rubrics/data.md";
const REVIEWER = "plugins/core/agents/review-data.md";
const QUOTABLE = [DECLARATION, RUBRIC, REVIEWER];
const LEDGER = "docs/sources/ledger.json";
const ADR = "docs/adr/0017-outside-sources-enter-the-core-distilled.md";

const ENTRY = "wizardingcode-etl";
const QUALITY = "wizardingcode-etl-quality-monitor";
const PIPELINE = "wizardingcode-etl-pipeline";
const DOCUMENTATION = "wizardingcode-etl-documentation";
const QUERY = "wizardingcode-etl-query-optimiser";
const LINEAGE = "wizardingcode-etl-lineage";
const TESTS = "wizardingcode-etl-data-tests";
const SCHEMA = "wizardingcode-etl-schema-evolution";
const PERFORMANCE = "wizardingcode-etl-performance";
const CATALOGUE = "wizardingcode-etl-catalogue";
const FRAMES = "wizardingcode-etl-pandas-polars";

/** The Design's table: the eleven skills with their titles and their subjects, in its order. */
const DESIGN: [string, string, string[]][] = [
  [
    ENTRY,
    "Sizing to the volume",
    ["Data warehouse and analytics", "Sizing the solution to the volume"],
  ],
  [QUALITY, "Data quality monitor", ["Data quality and validation"]],
  [
    PIPELINE,
    "Pipeline generator",
    [
      "Pipelines",
      "Imports, exports and file formats",
      "Integrations and synchronisation between systems",
    ],
  ],
  [
    DOCUMENTATION,
    "Documentation and data dictionary",
    ["Documentation, catalogue and lineage of the data"],
  ],
  [QUERY, "Query optimiser", ["Queries and ORM use", "Transactions", "Indexes"]],
  [LINEAGE, "Lineage tracer", []],
  [TESTS, "Data test generator", []],
  [
    SCHEMA,
    "Source schema evolution",
    [
      "Schema and migrations",
      "Availability of the data while the change runs",
      "Backups, restore and retention",
    ],
  ],
  [PERFORMANCE, "Performance measuring", []],
  [CATALOGUE, "Data catalogue", []],
  [FRAMES, "pandas and Polars", []],
];
const SKILL_NAMES = DESIGN.map(([skill]) => skill);
const WITH_SUBJECTS = DESIGN.filter(([, , subjects]) => subjects.length > 0);
/** The least rows of the crew's rules of each skill; two where none is named. */
const MINIMUM: Record<string, number> = {
  [ENTRY]: 5,
  [QUALITY]: 3,
  [PIPELINE]: 3,
  [QUERY]: 3,
  [SCHEMA]: 3,
};
const minimumOf = (skill: string) => MINIMUM[skill] ?? 2;
/** The skills that have a second table and the least rows of each, as the Design pins them. */
const SOURCE_MINIMUM: Record<string, number> = {
  [ENTRY]: 5,
  [QUALITY]: 5,
  [PIPELINE]: 4,
  [DOCUMENTATION]: 5,
  [QUERY]: 2,
  [LINEAGE]: 2,
  [TESTS]: 5,
  [SCHEMA]: 3,
  [CATALOGUE]: 4,
};

/** The one outside source, as the Design's table gives it. */
const SOURCE = {
  name: "mozilla",
  repository: "mozilla/bigquery-etl-skills",
  ledger: "mozilla-bigquery-etl-skills",
  licence: "MPL-2.0",
  commit: "a89cf8f",
};
/** The files of the source the session read: a ledger row's note names one or more of them. */
const FILES_READ = [
  "skills/model-requirements/SKILL.md",
  "skills/model-requirements/references/common_aggregated_tables.md",
  "skills/model-requirements/assets/requirements_template.md",
  "skills/sql-test-generator/SKILL.md",
  "skills/sql-test-generator/references/test_strategy_patterns.md",
  "skills/sql-test-generator/references/preventing_production_queries.md",
  "skills/sql-test-generator/references/common_test_failures.md",
  "skills/bigconfig-generator/SKILL.md",
  "skills/bigconfig-generator/references/monitoring_patterns.md",
  "skills/schema-enricher/SKILL.md",
  "skills/schema-readme-generator/SKILL.md",
  "skills/metadata-manager/references/schema_description_improvements.md",
  "skills/bigquery-etl-core/references/datahub_best_practices.md",
  "skills/column-description-finder/SKILL.md",
  "skills/metadata-manager/SKILL.md",
  "skills/base-schema-audit/SKILL.md",
  "skills/metadata-manager/references/schema_discovery_guide.md",
  "skills/query-writer/SKILL.md",
  "agents/etl-orchestrator.md",
];
const PROVENANCE = `- \`${SOURCE.name}\`: ${SOURCE.repository}, ${SOURCE.licence}, read at commit ${SOURCE.commit}.`;

/** The two passages a row may hold from outside the two places, each whole and alone. */
const OF_SECTION_FOUR =
  "In an existing project the team runs what the project uses; for a new one it chooses by the measured volume";
const RULE_EIGHT =
  "A command that takes a token, a key, a password or a connection string is written with the variable's name or the page's placeholder and no value; a connection string is written with the page's placeholder or a local address with no credential.";
const OUTSIDE = [OF_SECTION_FOUR, RULE_EIGHT];
/** Each skill's own row of the table of the team's own skills: its second cell. */
const OWN_ROW: Record<string, string> = {
  [ENTRY]:
    "The interview and the choice of the solution, from a small load to billions of rows, by a volume measured or estimated in writing",
  [QUALITY]:
    "Reads incoming data against its expected schema, checks completeness, duplicates and outliers, and reports what failed",
  [PIPELINE]:
    "From the source data: infers the schema and the keys, writes the transformation and its tests, sized to the volume",
  [DOCUMENTATION]:
    "Writes a table's documentation from its schema and its data, and keeps it current when the schema changes",
  [QUERY]:
    "Reads a slow query's plan and proposes the index or the rewrite, with the plan before and after",
  [LINEAGE]:
    "Follows a number from the report back to its origin through the queries and the transformations",
  [TESTS]:
    "Writes the tests a table's schema and data call for: uniqueness, ranges, consistency between fields",
  [SCHEMA]:
    "Compares the schema that arrived with the one expected, and says what was added, removed or renamed before a pipeline runs",
  [PERFORMANCE]:
    "Times a query or a pipeline at a stated volume and keeps the measure to compare against",
  [CATALOGUE]:
    "Lists the datasets, what each holds and who owns it; where the project has DataHub or OpenMetadata it reads them",
  [FRAMES]:
    "From the two projects' own documentation, with when pandas stops being enough and Polars or DuckDB take over",
};
const COPIED_FIRST = "is data copied before a destructive step (a drop, a rename, a type narrowed)";
/** The limits each skill carries, each whole inside a third cell of its skill. */
const LIMITS: [string, string][] = [
  ...SKILL_NAMES.map((skill): [string, string] => [skill, OWN_ROW[skill] ?? ""]),
  [ENTRY, OF_SECTION_FOUR],
  [PIPELINE, RULE_EIGHT],
  [QUERY, RULE_EIGHT],
  [PERFORMANCE, RULE_EIGHT],
  [CATALOGUE, RULE_EIGHT],
  [SCHEMA, COPIED_FIRST],
];

/** The three sentences every `## When` holds, and the entry's own. */
const FIGURES =
  "Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it.";
const LOCAL =
  "Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment.";
const NOTHING_INSTALLED =
  "This skill installs nothing, starts no server and is no leave to connect one.";
const WHEN_SENTENCES = [FIGURES, LOCAL, NOTHING_INSTALLED];
const NOT_RECORDED =
  "The engine records no measured volume on an item yet: this skill gives the interview and the choice, and the measure or the written estimate is said in the item's report.";

const PARAGRAPH = `Each section is a subject of the team's definition (\`${DEFINITION}\`, section 3) with its sources as the definition's row holds them, one a line. The research read the pages on 2026-11-15; a line that says a page was not opened, or that it answered with a redirect alone, names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.`;
const OF_THE_SOURCES =
  "Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.";
const NO_RULE =
  "No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.";
const NO_RULE_OF_THE_ELEVEN =
  "No rule of the eleven comes from a page of section 3: a row quotes a file of the crew or restates the user's source.";
const THE_ENTRY = `The entry is \`${ENTRY}\`.`;
const RULES = "## The crew's rules";
const FROM_THE_SOURCES = "## Rules written from the sources";
const COME_FROM = "## Where the sources' rules come from";
const READ_HERE = "## Where the subjects are read";

const SUBJECTS = () => declared(repoFile(DECLARATION));
/** The engine's rows for this team, or none where the table does not hold it yet. */
const tabled = () =>
  (
    TEAM_SKILLS as Record<
      string,
      readonly { skill: string; title: string; subjects: readonly string[] }[]
    >
  ).etl ?? [];

/** The lines of a file, white space run together, from one line to the line before another. */
function between(path: string, from: string, to: string): string {
  const lines = repoFile(path).split("\n");
  const start = lines.indexOf(from);
  const end = lines.indexOf(to, start);
  if (start < 0 || end < start) throw new Error(`${path} has no part from ${from} to ${to}`);
  return run(lines.slice(start, end).join("\n"));
}
const PARAGRAPH_OF_FOUR =
  "In an existing project the team runs what the project uses. Each tool runs only where the project's database and stack take it.";
/** The two places of the declaration a row may quote: section 4's paragraph and the table of the team's own skills. */
function places(): string[] {
  const lines = repoFile(DECLARATION).split("\n");
  if (!lines.includes(PARAGRAPH_OF_FOUR)) throw new Error("section 4 has no such paragraph");
  return [
    run(PARAGRAPH_OF_FOUR),
    between(DECLARATION, "| Skill | What it does |", "### Nothing of their own"),
  ];
}

/** Why a third cell is not held to its file as the Design says, or nothing. */
function notHeld(file: string, words: string): string | null {
  if (words.length < 40) return "under 40 characters";
  // From outside the two places a row holds one of two passages, whole and alone.
  if (file === DECLARATION && OUTSIDE.includes(words)) return null;
  const texts = file === DECLARATION ? places() : [run(repoFile(file))];
  let found = false;
  for (const text of texts) {
    for (let at = text.indexOf(words); at >= 0; at = text.indexOf(words, at + 1)) {
      found = true;
      if (wordEdge(text[at - 1]) && wordEdge(text[at + words.length])) return null;
    }
  }
  return found ? "not at a word's edge" : "not found";
}

/** The six names of the source, case folded, that stand in a skill only in their two places. */
const NAMES = ["mozilla", "bigquery-etl", "bqetl", "glean", "bigeye", "bigconfig"];
/** The names of the source a skill's text holds outside a second cell of its second table and its line of provenance. */
function strayNames(text: string): string[] {
  const lines = text.split("\n");
  const sectionOf = (heading: string): [number, number] => {
    const at = lines.indexOf(heading);
    if (at < 0) return [-1, -1];
    const next = lines.findIndex((line, i) => i > at && line.startsWith("## "));
    return [at, next < 0 ? lines.length : next];
  };
  const inside = (i: number, [from, to]: [number, number]) => i > from && i < to;
  const provenance = sectionOf(COME_FROM);
  const table = sectionOf(FROM_THE_SOURCES);
  const rest = lines
    // A row of the second table without its second cell.
    .map((line, i) =>
      inside(i, table) && line.startsWith("| ") ? line.replace(/ \| `[^`|]+` \|$/, " |") : line,
    )
    .filter((_, i) => !inside(i, provenance))
    .join("\n")
    .toLowerCase();
  // The eleven skills' own names are no source's name.
  const bare = [...SKILL_NAMES]
    .sort((a, b) => b.length - a.length)
    .reduce((left, skill) => left.split(skill).join(""), rest);
  return NAMES.filter((name) => bare.includes(name));
}
/** The words of a step a first cell holds. */
function stepWords(cell: string): string[] {
  const folded = cell.toLowerCase();
  const found = ["install", "npx", "plugin", "web_search", "web_fetch"].filter((word) =>
    folded.includes(word),
  );
  // `pip` wherever no letter follows it: `pip3` is a step, a pipeline is not.
  return /pip(?![a-z])/.test(folded) ? [...found, "pip"] : found;
}

/** The rows of a skill's second table, or none where it has no such table. */
function sourceRows(skill: string): string[][] {
  const text = skillFile(skill);
  return text.split("\n").includes(FROM_THE_SOURCES)
    ? tableRows(under(text, FROM_THE_SOURCES)).rows
    : [];
}
const named = (cell: string | undefined) => /^`([^`]+)`$/.exec(cell ?? "")?.[1] ?? "";
/** A first cell that leans on where another row stands. */
const POSITION =
  /\b(row|rule) (above|below|before|after|\d)|\b(previous|preceding|next|following|first|second|third|last) (row|rule)\b/;

test(`${ITEM} AC-12: the engine's table holds the ETL team's eleven skills after the researchers', with the declaration's thirteen subjects each once`, () => {
  expect(Object.keys(TEAM_SKILLS)).toEqual([
    "qa",
    "devops",
    "agentic-os",
    "architects",
    "researchers",
    "etl",
  ]);
  expect(tabled().map((s) => [s.skill, s.title, [...s.subjects]])).toEqual(DESIGN);
  const subjects = SUBJECTS().map(([subject]) => subject);
  expect(subjects).toHaveLength(13);
  const taken = DESIGN.flatMap(([, , held]) => held);
  expect([...taken].sort()).toEqual([...subjects].sort());
  for (const [skill, , held] of DESIGN)
    expect({ skill, order: held }).toEqual({
      skill,
      order: subjects.filter((subject) => held.includes(subject)),
    });
});

/** The count of addresses in the six files of sources, pinned. */
const ADDRESSES = 230;

test(`${ITEM} AC-13: the six skills that hold a subject have the sources file the engine writes, and the other five none`, () => {
  const made = skillSources("etl", repoFile(DECLARATION));
  expect(made.ok).toBe(true);
  const files = made.ok ? made.files : [];
  expect(files.map((f) => f.skill)).toEqual(WITH_SUBJECTS.map(([skill]) => skill));
  const cells = new Map(SUBJECTS());
  let addresses = 0;
  for (const [skill, title, subjects] of WITH_SUBJECTS) {
    const text = sourcesFile(skill);
    expect({ skill, same: files.find((f) => f.skill === skill)?.text === text }).toEqual({
      skill,
      same: true,
    });
    const lines = text.split("\n");
    expect({ skill, head: lines.slice(0, 4) }).toEqual({
      skill,
      head: [`# Sources of ${title}`, "", PARAGRAPH, ""],
    });
    expect({ skill, sections: headings(text) }).toEqual({
      skill,
      sections: subjects.map((subject) => `## ${subject}`),
    });
    const accounted = new Set<number>([0, 2]);
    for (const subject of subjects) {
      const at = lines.indexOf(`## ${subject}`);
      accounted.add(at);
      const section = under(text, `## ${subject}`).filter((line) => line !== "");
      expect({ subject, dashed: section.every((line) => line.startsWith("- ")) }).toEqual({
        subject,
        dashed: true,
      });
      expect({ subject, cell: section.map((line) => line.slice(2)).join("; ") }).toEqual({
        subject,
        cell: cells.get(subject) ?? "",
      });
      for (let i = at + 1; i < lines.length && !lines[i]?.startsWith("## "); i++) accounted.add(i);
    }
    expect({ skill, stray: lines.filter((line, i) => line !== "" && !accounted.has(i)) }).toEqual({
      skill,
      stray: [],
    });
    addresses += (text.match(ADDRESS) ?? []).length;
  }
  const inCells = [...cells.values()].flatMap((cell) => cell.match(ADDRESS) ?? []).length;
  expect(addresses).toBe(inCells);
  expect(addresses).toBe(ADDRESSES);
  for (const [skill] of DESIGN.filter(([, , subjects]) => subjects.length === 0))
    expect({ skill, sources: existsSync(join(ROOT, SKILLS, skill, "sources.md")) }).toEqual({
      skill,
      sources: false,
    });
});

test(`${ITEM} AC-14: each of the eleven has the Design's form, its When holds the fixed sentences, and nothing to open`, () => {
  const subjects = SUBJECTS().map(([subject]) => subject);
  for (const [skill, title, held] of DESIGN) {
    const text = skillFile(skill);
    const front = frontmatter(text);
    expect({ skill, name: front.name }).toEqual({ skill, name: skill });
    expectOneSentence(front.description, skill);
    expect({ skill, title: front.body.split("\n")[0] }).toEqual({ skill, title: `# ${title}` });
    const entry = skill === ENTRY;
    // The skills with a second table are the Design's, by the literal and not by the file.
    const sourced = SOURCE_MINIMUM[skill] !== undefined;
    const last = entry ? "## What the skills hold" : "## What this skill does not hold";
    expect({ skill, sections: headings(text) }).toEqual({
      skill,
      sections: [
        "## When",
        ...(entry ? ["## The thirteen subjects"] : []),
        RULES,
        ...(sourced ? [FROM_THE_SOURCES] : []),
        ...(held.length > 0 ? [READ_HERE] : []),
        ...(sourced ? [COME_FROM] : []),
        last,
      ],
    });
    const when = run(under(text, "## When").join(" "));
    for (const sentence of [...WHEN_SENTENCES, ...(entry ? [NOT_RECORDED] : [])])
      expect({
        skill,
        sentence,
        times: text.split(sentence).length - 1,
        inWhen: when.includes(sentence),
      }).toEqual({ skill, sentence, times: 1, inWhen: true });
    if (!entry) {
      expect({ skill, ends: when.endsWith(THE_ENTRY) }).toEqual({ skill, ends: true });
      expect({ skill, recorded: text.includes(NOT_RECORDED) }).toEqual({ skill, recorded: false });
    }
    if (held.length > 0)
      expect({ skill, read: under(text, READ_HERE).filter((line) => line !== "") }).toEqual({
        skill,
        read: held.map((subject) => `- ${subject}: \`sources.md\`, the section of that name.`),
      });
    const sentences = [
      entry ? NO_RULE_OF_THE_ELEVEN : NO_RULE,
      ...(held.length > 0 ? [NEVER_OPENED] : []),
      SAYS_SO,
    ];
    expect({ skill, last: under(text, last).filter((line) => line !== "") }).toEqual({
      skill,
      last: sentences.map((sentence) => `- ${sentence}`),
    });
    for (const sentence of sentences)
      expect({ skill, sentence, times: text.split(sentence).length - 1 }).toEqual({
        skill,
        sentence,
        times: 1,
      });
    expectNothingToOpen(text, skill);
    expect({ skill, scheme: text.includes("://") }).toEqual({ skill, scheme: false });
  }
  const text = skillFile(ENTRY);
  const when = run(under(text, "## When").join(" "));
  for (const phrase of [
    "before a change to a schema, a query, a pipeline or a load of data",
    "before a choice of how to store or move data",
  ])
    expect(when, phrase).toContain(phrase);
  const table = tableRows(under(text, "## The thirteen subjects"));
  expect({ header: table.header, rule: table.rule }).toEqual({
    header: "| Subject | Skill | Its sources |",
    rule: "| :- | :- | :- |",
  });
  const skillOf = (subject: string) => DESIGN.find(([, , held]) => held.includes(subject))?.[0];
  expect(table.rows).toEqual(
    subjects.map((subject) => [
      subject,
      `\`${skillOf(subject)}\``,
      `\`${skillOf(subject)}/sources.md\`, the section of that name`,
    ]),
  );
});

test(`${ITEM} AC-15: the crew's rules of each skill quote the crew's three files as the hold asks, and carry the seventeen limits whole`, () => {
  for (const [skill] of DESIGN) {
    const text = skillFile(skill);
    const rules = under(text, RULES);
    expect({ skill, once: text.split(UNDER_THE_RULES).length - 1 }).toEqual({ skill, once: 1 });
    expect({ skill, opens: rules.filter((line) => line !== "").slice(0, 3) }).toEqual({
      skill,
      opens: [UNDER_THE_RULES, "| Rule | File | The file's words |", "| :- | :- | :- |"],
    });
    const table = tableRows(rules);
    expect({ skill, enough: table.rows.length >= minimumOf(skill) }).toEqual({
      skill,
      enough: true,
    });
    const thirds = table.rows.map((row) => run(row[2] ?? ""));
    const firsts = table.rows.map((row) => row[0] ?? "");
    for (const [at, row] of table.rows.entries()) {
      const where = `${skill} row ${at + 1}`;
      expect({ where, cells: row.length }).toEqual({ where, cells: 3 });
      expect({ where, rule: (row[0] ?? "").length > 0 }).toEqual({ where, rule: true });
      expect({ where, step: stepWords(row[0] ?? "") }).toEqual({ where, step: [] });
      const file = named(row[1]);
      expect({ where, file: QUOTABLE.includes(file) ? "one of the three" : file }).toEqual({
        where,
        file: "one of the three",
      });
      const words = thirds[at] ?? "";
      expect({ where, words, held: notHeld(file, words) }).toEqual({ where, words, held: null });
      expect({
        where,
        shared: thirds.filter((other, i) => i !== at && other.includes(words)).length,
      }).toEqual({ where, shared: 0 });
      expect({ where, position: POSITION.test(row[0] ?? "") }).toEqual({ where, position: false });
    }
    expect({ skill, distinct: new Set(firsts).size }).toEqual({ skill, distinct: firsts.length });
    for (const [owner, passage] of LIMITS.filter(([name]) => name === skill))
      expect({ owner, passage, held: thirds.some((words) => words.includes(passage)) }).toEqual({
        owner,
        passage,
        held: true,
      });
  }
  expect(LIMITS).toHaveLength(17);
  expect(new Set(LIMITS.map(([, passage]) => passage)).size).toBe(14);
});

test(`${ITEM} AC-16: the hold of a quotation holds the fourteen passages and refuses what the Design refuses, each case standing in its file`, () => {
  // Every case is tried and the ones that fail are named together, each by its label.
  const failed: string[] = [];
  const tried = (label: string, file: string, words: string, why: string | null) => {
    if (!run(repoFile(file)).includes(words)) failed.push(`${label}: does not stand in its file`);
    const got = notHeld(file, words);
    if (got !== why) failed.push(`${label}: ${got ?? "held"}, where ${why ?? "held"} is expected`);
  };
  const refused = (label: string, file: string, words: string, why: string) =>
    tried(label, file, words, why);
  const held = (label: string, file: string, words: string) => tried(label, file, words, null);
  const passages = [...new Set(LIMITS.map(([, passage]) => passage))];
  expect(passages).toHaveLength(14);
  for (const passage of passages)
    held(`the passage: ${passage}`, passage === COPIED_FIRST ? RUBRIC : DECLARATION, passage);
  // The two places carry no command and no address.
  for (const place of places()) {
    expect(place.includes("`")).toBe(false);
    expect(place.match(ADDRESS)).toBeNull();
  }
  // Each outside passage stands once in the declaration, at a word's edge, and in neither place.
  const whole = run(repoFile(DECLARATION));
  for (const passage of OUTSIDE) {
    expect({ passage, times: whole.split(passage).length - 1 }).toEqual({ passage, times: 1 });
    const at = whole.indexOf(passage);
    expect({
      passage,
      edges: wordEdge(whole[at - 1]) && wordEdge(whole[at + passage.length]),
    }).toEqual({ passage, edges: true });
    for (const place of places())
      expect({ passage, inPlace: place.includes(passage) }).toEqual({ passage, inPlace: false });
  }
  const ofThree = "The database's own documentation: PostgreSQL's Data Definition chapter";
  refused("a sentence of section 3's cells", DECLARATION, ofThree, "not found");
  refused(
    "a cell of section 4's table",
    DECLARATION,
    "GX Core, a Python library with no command line of its own",
    "not found",
  );
  refused(
    "a line of what the research found of the tools",
    DECLARATION,
    "Datafold archived data-diff on 2024-05-17, and its README names no replacement.",
    "not found",
  );
  refused(
    "rule 1 of section 5",
    DECLARATION,
    "The backend team's rule holds: an MCP server or a set of skills enters only when the tool's or the service's own team makes it.",
    "not found",
  );
  refused(
    "rule 2 of section 5",
    DECLARATION,
    "A database's or a provider's server is installed only where the project uses that database or provider, in read-only mode where the server has one",
    "not found",
  );
  refused(
    "an install line of section 5",
    DECLARATION,
    "claude mcp add --transport http MotherDuck https://api.motherduck.com/mcp",
    "not found",
  );
  refused(
    "the paragraph above the table that names the article",
    DECLARATION,
    "That form comes from the article the user pasted",
    "not found",
  );
  refused(
    "the paragraph running into the table",
    DECLARATION,
    "enter nowhere as facts. | Skill | What it does |",
    "not found",
  );
  refused(
    "the table's last row running into the next heading",
    DECLARATION,
    "by a volume measured or estimated in writing | ### Nothing of their own",
    "not found",
  );
  refused(
    "the passage of section 4 with a word more before it",
    DECLARATION,
    `gives. ${OF_SECTION_FOUR}`,
    "not found",
  );
  refused("rule 8 with a word more before it", DECLARATION, `8. ${RULE_EIGHT}`, "not found");
  refused(
    "the passage of section 4 with what follows it",
    DECLARATION,
    `${OF_SECTION_FOUR} |`,
    "not found",
  );
  refused(
    "cut inside a word at its start",
    DECLARATION,
    (OWN_ROW[QUALITY] ?? "").slice(2),
    "not at a word's edge",
  );
  refused(
    "cut inside a word at its end",
    DECLARATION,
    (OWN_ROW[QUALITY] ?? "").slice(0, -3),
    "not at a word's edge",
  );
  refused(
    "under 40 characters, standing in a place",
    DECLARATION,
    "Times a query or a pipeline",
    "under 40 characters",
  );
  for (const words of OUTSIDE) {
    const got = notHeld(RUBRIC, words);
    if (got !== "not found") failed.push(`under the rubric, ${words}: ${got ?? "held"}`);
  }
  if (!whole.includes(ofThree)) failed.push("the sentence of section 3 is not in the declaration");
  const underReviewer = notHeld(REVIEWER, ofThree);
  if (underReviewer !== "not found")
    failed.push(`a sentence of section 3 under the reviewer's file: ${underReviewer ?? "held"}`);
  held("a sentence of the rubric", RUBRIC, "does a transaction span a network call or a long step");
  held(
    "two lines of the reviewer's file run together",
    REVIEWER,
    "You never design a schema: you say what the change does to the one the project has. - You never write files, run commands or edit code.",
  );
  expect(failed).toEqual([]);
});

test(`${ITEM} AC-17: the nine skills of the Design have a second table of the crew's sentences from the one source, the other two none; the source is named in its two places alone`, () => {
  expect(Object.keys(SOURCE_MINIMUM)).toHaveLength(9);
  for (const [skill] of DESIGN) {
    const text = skillFile(skill);
    const lines = text.split("\n");
    const least = SOURCE_MINIMUM[skill];
    if (least === undefined) {
      expect({ skill, table: lines.includes(FROM_THE_SOURCES) }).toEqual({ skill, table: false });
      expect({ skill, provenance: lines.includes(COME_FROM) }).toEqual({
        skill,
        provenance: false,
      });
      expect({ skill, stray: strayNames(text) }).toEqual({ skill, stray: [] });
      continue;
    }
    const section = under(text, FROM_THE_SOURCES).filter((line) => line !== "");
    expect({ skill, opens: section.slice(0, 3) }).toEqual({
      skill,
      opens: [OF_THE_SOURCES, "| Rule | Source |", "| :- | :- |"],
    });
    expect({ skill, once: text.split(OF_THE_SOURCES).length - 1 }).toEqual({ skill, once: 1 });
    expect({ skill, rows: section.slice(3).every((line) => line.startsWith("| ")) }).toEqual({
      skill,
      rows: true,
    });
    const rows = sourceRows(skill);
    expect({ skill, enough: rows.length >= least }).toEqual({ skill, enough: true });
    for (const [at, row] of rows.entries()) {
      const where = `${skill} source row ${at + 1}`;
      const rule = row[0] ?? "";
      expect({ where, cells: row.length }).toEqual({ where, cells: 2 });
      expect({ where, length: rule.length > 0 && rule.length <= 300 }).toEqual({
        where,
        length: true,
      });
      expect({ where, ends: rule.endsWith(".") }).toEqual({ where, ends: true });
      expect({ where, sentences: rule.includes(". ") }).toEqual({ where, sentences: false });
      expect({ where, backtick: rule.includes("`") }).toEqual({ where, backtick: false });
      expect({ where, digit: /^\d/.test(rule) }).toEqual({ where, digit: false });
      expect({ where, step: stepWords(rule) }).toEqual({ where, step: [] });
      expect({ where, source: row[1] }).toEqual({ where, source: `\`${SOURCE.name}\`` });
    }
    const firsts = rows.map((row) => row[0] ?? "");
    expect({ skill, distinct: new Set(firsts).size }).toEqual({ skill, distinct: firsts.length });
    expect({ skill, provenance: under(text, COME_FROM).filter((line) => line !== "") }).toEqual({
      skill,
      provenance: [PROVENANCE],
    });
    expect({ skill, stray: strayNames(text) }).toEqual({ skill, stray: [] });
  }
});

test(`${ITEM} AC-17: the check of names and of the words of a step, on texts of the test's own`, () => {
  expect(NAMES).toHaveLength(6);
  const skillOf = (when: string, crewCell: string, sourceCell: string) =>
    `# T\n\n## When\n\n${when}\n\n${RULES}\n\n| Rule | File | The file's words |\n| :- | :- | :- |\n| ${crewCell} | \`${RUBRIC}\` | words |\n\n${FROM_THE_SOURCES}\n\n| Rule | Source |\n| :- | :- |\n| ${sourceCell} | \`mozilla\` |\n\n${COME_FROM}\n\n${PROVENANCE}\n`;
  expect(strayNames(skillOf(`Read ${QUALITY} first.`, "A rule.", "A rule."))).toEqual([]);
  expect(strayNames(skillOf("Before a load.", "A rule.", "As Mozilla has it."))).toEqual([
    "mozilla",
  ]);
  expect(strayNames(skillOf("Where bqetl runs.", "A rule.", "A rule."))).toEqual(["bqetl"]);
  expect(strayNames(skillOf("Before a load.", "As Glean asks.", "A rule."))).toEqual(["glean"]);
  expect(
    strayNames(skillOf("Before a load.", "A rule.", "A rule.").replace("# T", "# Bigeye")),
  ).toEqual(["bigeye"]);
  // A line of provenance is allowed where it stands, not for what it says.
  expect(strayNames(skillOf(PROVENANCE, "A rule.", "A rule."))).toEqual([
    "mozilla",
    "bigquery-etl",
  ]);
  for (const name of NAMES)
    expect({
      name,
      found: strayNames(skillOf(`A text with ${name} in it.`, "A rule.", "A rule.")),
    }).toEqual({ name, found: [name] });
  for (const [cell, words] of [
    ["It is installed first.", ["install"]],
    ["Two plugins are named.", ["plugin"]],
    ["Fetched with npx.", ["npx"]],
    ["A call of web_search and of web_fetch.", ["web_search", "web_fetch"]],
    ["Got with pip3 on a machine.", ["pip"]],
    ["A pipeline has stages.", []],
    ["A rule of the crew's.", []],
  ] as const)
    expect({ cell, words: stepWords(cell) }).toEqual({ cell, words: [...words] });
});

interface LedgerRow {
  source: string;
  rule: string;
  status: string;
  file?: string;
  text?: string;
  proof?: string;
  note?: string;
}

test(`${ITEM} AC-18: the ledger holds the source and one row for each row of a second table, and ADR 0017 holds the note of this item`, () => {
  const ledger = JSON.parse(repoFile(LEDGER)) as {
    sources: { name: string; licence: string; commit: string }[];
    rows: LedgerRow[];
  };
  expect(ledger.sources).toContainEqual({
    name: SOURCE.ledger,
    licence: SOURCE.licence,
    commit: SOURCE.commit,
  });
  const written = DESIGN.flatMap(([skill]) =>
    sourceRows(skill).map((row) =>
      [`${SKILLS}/${skill}/SKILL.md`, row[0] ?? "", SOURCE.ledger].join("\n"),
    ),
  );
  const rows = ledger.rows.filter((row) => row.source === SOURCE.ledger);
  expect(rows.map((row) => [row.file, row.text, row.source].join("\n")).sort()).toEqual(
    written.sort(),
  );
  const least = Object.values(SOURCE_MINIMUM).reduce((sum, n) => sum + n, 0);
  expect(rows.length).toBeGreaterThanOrEqual(least);
  for (const row of rows) {
    const where = `${row.source}: ${row.text}`;
    const note = row.note ?? "";
    expect({ where, status: row.status, proof: row.proof }).toEqual({
      where,
      status: "in",
      proof: "etl-skills.test.ts",
    });
    expect({ where, rule: row.rule.length > 0 }).toEqual({ where, rule: true });
    expect({ where, opens: note.startsWith(`read at ${SOURCE.commit}, `) }).toEqual({
      where,
      opens: true,
    });
    const paths = note.match(/[\w./-]+\.md\b/g) ?? [];
    expect({ where, some: paths.length > 0 }).toEqual({ where, some: true });
    expect({ where, strangers: paths.filter((path) => !FILES_READ.includes(path)) }).toEqual({
      where,
      strangers: [],
    });
  }
  const adr = repoFile(ADR);
  const from = adr.indexOf(
    "## Note of 2026-11-26 (item 2026-11-26-003, the ETL team's eleven skills)\n",
  );
  expect(from).toBeGreaterThan(0);
  const next = adr.indexOf("\n## Note of", from + 1);
  const note = adr.slice(from, next < 0 ? undefined : next);
  for (const words of [
    "MPL-2.0",
    "D-1 of item 2026-11-26-003",
    "D-2 of item 2026-11-26-003",
    "no script",
    "neither a proof",
    "no ruling that another source under MPL-2.0 may enter",
    "decision 3",
  ])
    expect(note, words).toContain(words);
});

test(`${ITEM} AC-19: the build reference sends a session to the entry right after the researchers team's sentence, and CLAUDE.md's one line names the six teams' folders and tests`, () => {
  const SENTENCE =
    "Before a change to a schema, a query, a pipeline or a load of data, and before a choice of how to store or move data, read `wizardingcode-etl`: it gives the interview and the choice by volume and sends each subject to the skill that holds the crew's rule for it.";
  expect((ENTRY_SENTENCES as readonly string[]).indexOf(SENTENCE)).toBe(5);
  expect(ENTRY_SENTENCES).toHaveLength(Object.keys(TEAM_SKILLS).length);
  expectEntrySentences(repoFile("plugins/core/skills/crew/references/build.md"));
  const claude = repoFile("CLAUDE.md")
    .split("\n")
    .filter((line) => line.includes("bun scripts/build-team-skills.ts"));
  expect(claude).toHaveLength(1);
  for (const part of [
    "wizardingcode-qa-*",
    "wizardingcode-devops*",
    "wizardingcode-agentic*",
    "wizardingcode-architecture*",
    "wizardingcode-research*",
    "wizardingcode-etl*",
    "qa-skills.test.ts",
    "devops-skills.test.ts",
    "agentic-skills.test.ts",
    "architects-skills.test.ts",
    "researchers-skills.test.ts",
    "etl-skills.test.ts",
    "--team",
  ])
    expect(claude[0], part).toContain(part);
});

const SCRIPT = join(ROOT, "scripts", "build-team-skills.ts");
const build = (copy: string, ...more: string[]) =>
  spawnSync("bun", [SCRIPT, "--root", copy, ...more], { encoding: "utf8" });

test(`${ITEM} AC-20: with --team the script writes this team's six files alone, and with none every team's in the table's order`, () => {
  const copy = copyOf(SKILL_NAMES);
  const WROTE = WITH_SUBJECTS.map(([skill]) => `wrote ${SKILLS}/${skill}/sources.md`);
  const file = join(copy, SKILLS, QUALITY, "sources.md");
  const before = [listingOf(copy), readFileSync(file, "utf8")];
  const first = build(copy, "--team", "etl");
  expect({ status: first.status, err: first.stderr }).toEqual({ status: 0, err: "" });
  expect(first.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listingOf(copy), readFileSync(file, "utf8")]).toEqual(before);
  // A changed file is written back.
  writeFileSync(file, "changed by hand\n");
  const second = build(copy, "--team", "etl");
  expect({ status: second.status, err: second.stderr }).toEqual({ status: 0, err: "" });
  expect(second.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listingOf(copy), readFileSync(file, "utf8")]).toEqual(before);
  // The entry's folder gone: the refusal alone.
  rmSync(join(copy, SKILLS, ENTRY), { recursive: true });
  const gone = build(copy, "--team", "etl");
  expect({ status: gone.status, out: gone.stdout, err: gone.stderr.trim() }).toEqual({
    status: 1,
    out: "",
    err: `team skills not built: no folder ${SKILLS}/${ENTRY}`,
  });
  // Every team's, in the table's order: the five teams' twenty-four, then this team's six.
  const every = Object.values(TEAM_SKILLS).flatMap((skills) => skills.map((s) => s.skill));
  const all = build(copyOf(every));
  expect({ status: all.status, err: all.stderr }).toEqual({ status: 0, err: "" });
  const lines = all.stdout.trimEnd().split("\n");
  expect(lines).toHaveLength(30);
  expect(lines.slice(24)).toEqual(WROTE);
});
