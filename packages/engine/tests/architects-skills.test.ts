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

// The architects team's skills. Beside the rules the crew's own files state, these hold rules the
// crew wrote from three of the user's links, each with a row in the sources ledger; and the head of
// this team's declaration lets servers and outside sets in, which no skill of the five is about, so
// those rules are not quoted at all.
const ITEM = "2026-11-22-001";
const DECLARATION = "plugins/core/teams/architects.md";
const DEFINITION = "docs/specs/2026-11-15-architects-team-design.md";
const ARCHITECTURE = "plugins/core/skills/crew/rubrics/architecture.md";
const RISK = "plugins/core/skills/crew/rubrics/risk.md";
const QUOTABLE = [ARCHITECTURE, RISK, DECLARATION];
const LEDGER = "docs/sources/ledger.json";
const ADR = "docs/adr/0017-outside-sources-enter-the-core-distilled.md";

const ENTRY = "wizardingcode-architecture";
const DECISION = "wizardingcode-architecture-decision";
const BOUNDARIES = "wizardingcode-architecture-boundaries-contracts";
const QUALITY = "wizardingcode-architecture-quality-risk";
const VIEWS = "wizardingcode-architecture-views";

/** The Design's table: the five skills with their titles and their subjects, in its order. */
const DESIGN: [string, string, string[]][] = [
  [ENTRY, "Architecture", []],
  [
    DECISION,
    "Decision",
    [
      "Choosing the architecture style",
      "Decisions and documentation",
      "Evolution and debt",
      "Technology and dependencies",
      "AI and agents",
    ],
  ],
  [
    BOUNDARIES,
    "Boundaries and contracts",
    [
      "Layers and boundaries",
      "Data and domain model",
      "Contracts",
      "Integrations",
      "The spec's Design",
      "Consistency with neighbours",
    ],
  ],
  [QUALITY, "Quality attributes and risk", ["Risk in production", "Quality attributes"]],
  [VIEWS, "Views", []],
];
const HOLDING = DESIGN.filter(([, , subjects]) => subjects.length > 0);
const OTHER_THAN_THE_ENTRY = DESIGN.filter(([skill]) => skill !== ENTRY);
/** The least rows of each table: the crew's rules, and the rules written from the links. */
const MINIMUM: Record<string, number> = {
  [DECISION]: 5,
  [BOUNDARIES]: 6,
  [QUALITY]: 4,
  [VIEWS]: 2,
};
const LINK_MINIMUM: Record<string, number> = {
  [ENTRY]: 2,
  [DECISION]: 5,
  [BOUNDARIES]: 5,
  [QUALITY]: 4,
  [VIEWS]: 3,
};

/** The three links, in the Design's order: the name in a skill, the name in the ledger, the commit read. */
const LINKS: [string, string, string][] = [
  ["45ck", "45ck-architecture", "14966b2"],
  ["davila7", "davila7-architecture", "1deb97c"],
  ["dandgabr", "dandgabr-architect", "b23ec7f"],
];
/** The links each skill's second table names: every one of them, and no other. */
const LINKS_OF: Record<string, string[]> = {
  [ENTRY]: ["davila7"],
  [DECISION]: ["45ck", "dandgabr"],
  [BOUNDARIES]: ["45ck", "davila7", "dandgabr"],
  [QUALITY]: ["45ck", "dandgabr"],
  [VIEWS]: ["45ck", "dandgabr"],
};
const PROVENANCE: Record<string, string> = {
  "45ck":
    "- `45ck`: 45ck/software-architecture-skills, MIT, read at commit 14966b2. Fourteen skills of one template; what the definition names of them entered.",
  davila7:
    "- `davila7`: the file software-architecture of davila7/claude-code-templates, a repository under MIT, read at commit 1deb97c. Its text first appeared in a repository under GPL-3.0, so nothing of it is copied.",
  dandgabr:
    "- `dandgabr`: dandgabr/skills, GPL-3.0, read at commit b23ec7f, in Brazilian Portuguese. Nothing of it is copied or translated; what the definition names of it entered in the crew's words.",
};
/** The files of a link a ledger row's note may name: for 45ck the fourteen skills, each `skills/<name>/SKILL.md`. */
const FOURTEEN = [
  "adr-writer",
  "architecture-option-generator",
  "tradeoff-analysis-writer",
  "monolith-vs-modular-monolith-reviewer",
  "service-decomposition-advisor",
  "component-boundary-reviewer",
  "integration-boundary-mapper",
  "layered-architecture-designer",
  "quality-attribute-scenario-writer",
  "architecture-risk-assessor",
  "availability-strategy-reviewer",
  "scalability-hotspot-detector",
  "runtime-view-writer",
  "deployment-view-writer",
];
const READ_FILES: Record<string, string[]> = {
  "45ck-architecture": FOURTEEN.map((name) => `skills/${name}/SKILL.md`),
  "davila7-architecture": ["cli-tool/components/skills/development/software-architecture/SKILL.md"],
  "dandgabr-architect": [
    "skills/roles/software-architect/SKILL.md",
    "skills/engineering-practices/c4-model-architecture/SKILL.md",
    "skills/engineering-practices/system-design-scalability/SKILL.md",
    "skills/framework/framework-rest-api/SKILL.md",
  ],
};

/** The three passages of the declaration's section 3 a row may hold, each whole and alone. */
const BY_THE_CASE =
  "the solution is chosen by the case measured or estimated in writing, and not the largest by default";
const OWN_ADRS = "The project's own ADRs, as the form to follow";
const FRAMEWORK_FIRST = "The rule: first what the project's framework already brings.";
const OF_SECTION_THREE = [BY_THE_CASE, OWN_ADRS, FRAMEWORK_FIRST];
/** The first sentence of the head's row on measuring: where the tools of that row run. */
const LOCAL_OR_TEST =
  "These tools run against the project's own local or test environment and nothing else.";

/** The limits each skill carries, each whole inside a third cell of its skill. */
const LIMITS: [string, string][] = [
  [DECISION, BY_THE_CASE],
  [DECISION, OWN_ADRS],
  [DECISION, FRAMEWORK_FIRST],
  [BOUNDARIES, "A piece that crosses a boundary the base draws is drift."],
  [BOUNDARIES, "A changed contract without its file is drift."],
  [BOUNDARIES, "A new direct call where an adapter exists is drift."],
  [BOUNDARIES, "the gate never asks whether another architecture would be better"],
  [QUALITY, LOCAL_OR_TEST],
  [QUALITY, "A failure nobody would see is the worst answer."],
  [VIEWS, "None of the four is installed, and text under the GPL is not copied."],
];

const PARAGRAPH = `Each section is a subject of the team's definition (\`${DEFINITION}\`, section 3) with its sources as the definition's row holds them, one a line. The research read each source that has an address at that address on 2026-11-15; a line that says a page was not opened, or that a source was read in a summary, names nothing more than it says. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.`;
const OF_THE_LINKS =
  "Each row is a rule the crew wrote in its own words from one of the links the user gave on 2026-11-15, named in the second cell. Each link is one person's conventions. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with the project's own base or with a row of the crew's rules, the base and the crew's rule hold. No sentence of a link is copied, no link is installed, and a session opens none.";
const NO_RULE =
  "No rule here comes from a page of section 3: a row quotes a file of the crew or restates one of the user's links.";
const NO_RULE_OF_THE_FOUR =
  "No rule of the four comes from a page of section 3: a row quotes a file of the crew or restates one of the user's links.";
const THE_ENTRY = `The entry is \`${ENTRY}\`.`;
const VIEWS_ARE_READ = `- C4, arc42 and the diagram tools are read under the subject "Decisions and documentation": \`${DECISION}/sources.md\`, the section of that name.`;

const SUBJECTS = declared(repoFile(DECLARATION));
const cellOf = (subject: string) => {
  const cell = SUBJECTS.find(([name]) => name === subject)?.[1];
  if (cell === undefined) throw new Error(`no subject ${subject}`);
  return cell;
};
/** The engine's rows for this team, or none where the table does not hold it yet. */
const tabled = () =>
  (
    TEAM_SKILLS as Record<
      string,
      readonly { skill: string; title: string; subjects: readonly string[] }[]
    >
  ).architects ?? [];

/** A file's lines from one line to the line before another, with white space run together. */
function between(path: string, from: string, to: string): string {
  const lines = repoFile(path).split("\n");
  const start = lines.indexOf(from);
  const end = lines.indexOf(to);
  if (start < 0 || end < start) throw new Error(`${path} has no part from ${from} to ${to}`);
  return run(lines.slice(start, end).join("\n"));
}
/** The declaration's head: section 4 and the rules of section 5. */
const head = () =>
  between(DECLARATION, "## 4. Tools the team runs", "### Installed with a tool of section 4");
const sectionThree = () =>
  between(
    DECLARATION,
    "## 3. Subjects and where their information comes from",
    "## 4. Tools the team runs",
  );
/** A part of the head, from one text to the start of another: where it starts and where it ends. */
function partOfTheHead(from: string, to: string): [number, number] {
  const text = head();
  const start = text.indexOf(from);
  const end = text.indexOf(to, start);
  if (start < 0 || end < start) throw new Error(`the head has no part from ${from} to ${to}`);
  return [start, end];
}
/** Rules 2 to 5 of the head: the servers and the outside sets it lets in. */
const openings = () =>
  partOfTheHead("2. The server of a tool of section 4", "6. The user's four links");
/** The row of the head's table on measuring, to the row after it. */
const measuringRow = () =>
  partOfTheHead("| Measuring quality attributes |", "| Evolution and debt |");

/** A first cell that leans on where another row stands. */
const POSITION =
  /\b(row|rule) (above|below|before|after|\d)|\b(previous|preceding|next|following|first|second|third|last) (row|rule)\b/;

/** Why a third cell is not held to its file as the Design says, or nothing. */
function notHeld(file: string, words: string): string | null {
  if (words.length < 40) return "under 40 characters";
  // Of section 3 a row holds one of the three rules of the team's own, whole and alone; that each
  // stands there, and not in the head, is the row of AC-38's to say.
  if (file === DECLARATION && OF_SECTION_THREE.includes(words)) return null;
  const held = file === DECLARATION ? head() : run(repoFile(file));
  const found = held.indexOf(words);
  if (found < 0) return "not found";
  if (!wordEdge(held[found - 1]) || !wordEdge(held[found + words.length]))
    return "not at a word's edge";
  if (file !== DECLARATION) return null;
  if (words.includes("`")) return "a backtick in a quotation of the declaration";
  // By the place of the quotation and not by a word.
  const end = found + words.length;
  const overlaps = ([from, to]: [number, number]) => found < to && end > from;
  if (overlaps(openings())) return "an opening of the head";
  if (overlaps(measuringRow()) && !words.includes(LOCAL_OR_TEST))
    return "the measuring row without its first sentence";
  return null;
}

/** The rows of a skill's second table: the first cell and the link named, as the file holds them. */
function linkRows(skill: string): string[][] {
  return tableRows(under(skillFile(skill), "## Rules written from the user's links")).rows;
}

test(`${ITEM} AC-35: the engine's table holds the architects team's five skills after the other three teams', and the three that hold subjects take the declaration's thirteen, each once`, () => {
  // The first four: the whole of the keys is held by the test of the team that came last.
  expect(Object.keys(TEAM_SKILLS).slice(0, 4)).toEqual([
    "qa",
    "devops",
    "agentic-os",
    "architects",
  ]);
  expect(tabled().map((s) => [s.skill, s.title, [...s.subjects]])).toEqual(DESIGN);
  expect(SUBJECTS).toHaveLength(13);
  const taken = tabled().flatMap((s) => [...s.subjects]);
  expect(taken).toHaveLength(13);
  expect(new Set(taken).size).toBe(13);
  const order = SUBJECTS.map(([name]) => name);
  expect([...taken].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(order);
  for (const [skill, , subjects] of DESIGN)
    expect({
      skill,
      sorted: [...subjects].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    }).toEqual({ skill, sorted: subjects });
});

test(`${ITEM} AC-36: each sources file is its title, this team's paragraph and a section a subject whose lines joined again are the declaration's cell; the entry and Views have none`, () => {
  const made = skillSources("architects", repoFile(DECLARATION));
  expect(made.ok).toBe(true);
  const files = made.ok ? made.files : [];
  expect(files.map((f) => f.skill)).toEqual(HOLDING.map(([skill]) => skill));
  const everyAddress: string[] = [];
  for (const [skill, title, subjects] of HOLDING) {
    const text = sourcesFile(skill);
    expect({ skill, same: files.find((f) => f.skill === skill)?.text === text }).toEqual({
      skill,
      same: true,
    });
    const lines = text.split("\n");
    expect(lines.slice(0, 4)).toEqual([`# Sources of ${title}`, "", PARAGRAPH, ""]);
    expect(text.endsWith("\n")).toBe(true);
    expect(headings(text)).toEqual(subjects.map((subject) => `## ${subject}`));
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
        cell: cellOf(subject),
      });
      for (let i = at + 1; i < lines.length && !lines[i]?.startsWith("## "); i++) accounted.add(i);
    }
    expect({ skill, stray: lines.filter((line, i) => line !== "" && !accounted.has(i)) }).toEqual({
      skill,
      stray: [],
    });
    everyAddress.push(...(text.match(ADDRESS) ?? []));
  }
  const cells = SUBJECTS.flatMap(([, cell]) => cell.match(ADDRESS) ?? []);
  expect([...everyAddress].sort()).toEqual([...cells].sort());
  expect(everyAddress).toHaveLength(226);
  for (const skill of [ENTRY, VIEWS])
    expect({ skill, sources: existsSync(join(ROOT, SKILLS, skill, "sources.md")) }).toEqual({
      skill,
      sources: false,
    });
});

test(`${ITEM} AC-37: each skill other than the entry has the Design's form, quotes the crew's files as the Design holds a quotation, carries its limits whole, and holds the fixed sentences and nothing to open`, () => {
  for (const [skill, title, subjects] of OTHER_THAN_THE_ENTRY) {
    const text = skillFile(skill);
    const front = frontmatter(text);
    expect({ skill, name: front.name }).toEqual({ skill, name: skill });
    expectOneSentence(front.description, skill);
    expect({ skill, title: front.body.split("\n")[0] }).toEqual({ skill, title: `# ${title}` });
    expect({ skill, sections: headings(text) }).toEqual({
      skill,
      sections: [
        "## When",
        "## The crew's rules",
        "## Rules written from the user's links",
        "## Where the subjects are read",
        "## Where the links' rules come from",
        "## What this skill does not hold",
      ],
    });
    const when = run(under(text, "## When").join(" "));
    expect({ skill, ends: when.endsWith(THE_ENTRY) }).toEqual({ skill, ends: true });
    expect({ skill, more: when.length > THE_ENTRY.length + 20 }).toEqual({ skill, more: true });
    // The rules.
    const rules = under(text, "## The crew's rules");
    expect({ skill, said: rules.filter((line) => line === UNDER_THE_RULES).length }).toEqual({
      skill,
      said: 1,
    });
    expect({ skill, once: text.split(UNDER_THE_RULES).length - 1 }).toEqual({ skill, once: 1 });
    // The sentence first, then the table: the section's lines that are not empty open with both.
    expect({ skill, opens: rules.filter((line) => line !== "").slice(0, 2) }).toEqual({
      skill,
      opens: [UNDER_THE_RULES, "| Rule | File | The file's words |"],
    });
    const table = tableRows(rules);
    expect({ skill, header: table.header, rule: table.rule }).toEqual({
      skill,
      header: "| Rule | File | The file's words |",
      rule: "| :- | :- | :- |",
    });
    expect({ skill, enough: table.rows.length >= (MINIMUM[skill] ?? 99) }).toEqual({
      skill,
      enough: true,
    });
    const thirds = table.rows.map((row) => run(row[2] ?? ""));
    const firsts = table.rows.map((row) => row[0] ?? "");
    for (const [at, row] of table.rows.entries()) {
      const where = `${skill} row ${at + 1}`;
      expect({ where, cells: row.length }).toEqual({ where, cells: 3 });
      expect({ where, rule: (row[0] ?? "").length > 0 }).toEqual({ where, rule: true });
      const file = /^`([^`]+)`$/.exec(row[1] ?? "")?.[1] ?? "";
      expect({ where, file: QUOTABLE.includes(file) ? "one of the three" : file }).toEqual({
        where,
        file: "one of the three",
      });
      expect({ where, exists: existsSync(join(ROOT, file)) }).toEqual({ where, exists: true });
      const words = thirds[at] ?? "";
      expect({ where, words, held: notHeld(file, words) }).toEqual({ where, words, held: null });
      expect({
        where,
        shared: thirds.filter((other, i) => i !== at && other.includes(words)).length,
      }).toEqual({ where, shared: 0 });
      // No first cell leans on a row's position.
      expect({
        where,
        position: POSITION.test(row[0] ?? ""),
      }).toEqual({ where, position: false });
    }
    expect({ skill, distinct: new Set(firsts).size }).toEqual({ skill, distinct: firsts.length });
    for (const [owner, passage] of LIMITS.filter(([name]) => name === skill))
      expect({ owner, passage, held: thirds.some((words) => words.includes(passage)) }).toEqual({
        owner,
        passage,
        held: true,
      });
    expect({
      skill,
      read: under(text, "## Where the subjects are read").filter((line) => line !== ""),
    }).toEqual({
      skill,
      read:
        skill === VIEWS
          ? [VIEWS_ARE_READ]
          : subjects.map((subject) => `- ${subject}: \`sources.md\`, the section of that name.`),
    });
    expect({
      skill,
      last: under(text, "## What this skill does not hold").filter((line) => line !== ""),
    }).toEqual({ skill, last: [NO_RULE, NEVER_OPENED, SAYS_SO].map((s) => `- ${s}`) });
    for (const sentence of [NO_RULE, NEVER_OPENED, SAYS_SO])
      expect({ skill, sentence, times: text.split(sentence).length - 1 }).toEqual({
        skill,
        sentence,
        times: 1,
      });
    expectNothingToOpen(text, skill);
  }
  // The pattern of a first cell that leans on a position, on wordings of the test's own.
  for (const cell of [
    "As the row above says.",
    "See the preceding rule.",
    "As in row 3.",
    "The second row holds it.",
  ])
    expect({ cell, leans: POSITION.test(cell) }).toEqual({ cell, leans: true });
  for (const cell of ["The first run is limited.", "A rule of the domain.", "Each row of a table."])
    expect({ cell, leans: POSITION.test(cell) }).toEqual({ cell, leans: false });
  // The section the line of Views names stands in the file it names.
  expect(sourcesFile(DECISION).split("\n")).toContain("## Decisions and documentation");
  // Every limit names a skill of the table other than the entry, and they are ten.
  expect(LIMITS.every(([skill]) => OTHER_THAN_THE_ENTRY.some(([name]) => name === skill))).toBe(
    true,
  );
  expect(LIMITS).toHaveLength(10);
});

test(`${ITEM} AC-38: the hold of a quotation holds the ten passages and refuses what the Design refuses, each case standing in its file`, () => {
  const whole = run(repoFile(DECLARATION));
  const refused = (file: string, words: string, why: string) => {
    expect({ words, stands: run(repoFile(file)).includes(words) }).toEqual({ words, stands: true });
    expect({ words, why: notHeld(file, words) }).toEqual({ words, why });
  };
  // The ten passages, each held in a file a row may name.
  for (const [, passage] of LIMITS)
    expect({
      passage,
      held: QUOTABLE.filter((file) => notHeld(file, passage) === null).length > 0,
    }).toEqual({ passage, held: true });
  expect(notHeld(ARCHITECTURE, "A changed contract without its file is drift.")).toBeNull();
  expect(notHeld(RISK, "A failure nobody would see is the worst answer.")).toBeNull();
  expect(notHeld(DECLARATION, LOCAL_OR_TEST)).toBeNull();
  // The three passages of section 3, each held, found there and not in the head.
  for (const passage of OF_SECTION_THREE) {
    expect({ passage, held: notHeld(DECLARATION, passage) }).toEqual({ passage, held: null });
    expect({ passage, there: sectionThree().includes(passage) }).toEqual({ passage, there: true });
    expect({ passage, head: head().includes(passage) }).toEqual({ passage, head: false });
    // Held as the declaration's alone: a row that names a rubric for it names the wrong file.
    for (const rubric of [ARCHITECTURE, RISK])
      expect({ passage, rubric, why: notHeld(rubric, passage) }).toEqual({
        passage,
        rubric,
        why: "not found",
      });
  }
  // A passage of section 3 that is none of the three.
  refused(
    DECLARATION,
    "The project's own declared architecture: its architecture document and its ADRs",
    "not found",
  );
  // One of the three with a word more before it, and one with a word more after it.
  refused(DECLARATION, `definition): ${BY_THE_CASE}`, "not found");
  refused(DECLARATION, `${FRAMEWORK_FIRST} Thoughtworks' Technology Radar`, "not found");
  // A line of the declaration's tables after the head that holds no backtick.
  const after = whole.slice(whole.indexOf("### Installed with a tool of section 4"));
  const line = "Fourteen skills that are one template of 68 lines";
  expect(after.includes(line) && !line.includes("`")).toBe(true);
  refused(DECLARATION, line, "not found");
  // A quotation of the head that holds a backtick.
  refused(
    DECLARATION,
    "each rule with a row in the sources ledger (`docs/sources/ledger.json`, ADR 0017)",
    "a backtick in a quotation of the declaration",
  );
  // A quotation cut inside a word at its start and at its end, and one under 40 characters.
  const limit = "None of the four is installed, and text under the GPL is not copied.";
  expect(notHeld(DECLARATION, limit)).toBeNull();
  refused(DECLARATION, limit.slice(2), "not at a word's edge");
  refused(DECLARATION, limit.slice(0, -3), "not at a word's edge");
  refused(DECLARATION, limit.slice(0, 30), "under 40 characters");
  // The head's openings: a quotation inside each of rules 2, 3, 4 and 5, and one that starts in
  // rule 1 and runs into rule 2.
  for (const words of [
    "The server drives a browser and has no read-only mode, and that does not hold it back there.",
    "A server that writes and has no such mode is left out, with three exceptions the user chose on 2026-11-15",
    "A cloud's own knowledge server is installed only where the project is on that cloud.",
    'The outside skills are installed as they are. The user chose "everything installed as it is", which was not the option recommended.',
    "A tool with no server of its own runs from the command line. 2. The server of a tool of section 4 is installed with the tool.",
  ])
    refused(DECLARATION, words, "an opening of the head");
  // Rule 1 alone, before the openings, and rule 6, after them, are held.
  for (const words of [
    "A tool with no server of its own runs from the command line.",
    "The user's four links are distilled into the team's own skills, written by us",
  ])
    expect({ words, held: notHeld(DECLARATION, words) }).toEqual({ words, held: null });
  // The row on measuring: never without the sentence that says where its tools run.
  refused(
    DECLARATION,
    'which its README says "is not being actively maintained" and "may not work or the results you get may not be accurate"',
    "the measuring row without its first sentence",
  );
  expect(notHeld(DECLARATION, `${LOCAL_OR_TEST} Load: Grafana k6`)).toBeNull();
  // The sentence is held anywhere in the quotation, not at its start alone: after the row's own
  // first cell, and in a quotation that starts in the row before.
  for (const words of [
    `Measuring quality attributes | ${LOCAL_OR_TEST}`,
    `with Graphviz (https://graphviz.org/) | | Measuring quality attributes | ${LOCAL_OR_TEST}`,
  ]) {
    expect({ words, stands: head().includes(words) }).toEqual({ words, stands: true });
    expect({ words, held: notHeld(DECLARATION, words) }).toEqual({ words, held: null });
  }
});

test(`${ITEM} AC-39: the second table of the five skills holds the fixed paragraph and rows of two cells, each a sentence of the crew's and one of the three links, and the lines of provenance of the links it names`, () => {
  const names = LINKS.map(([name]) => name);
  for (const [skill] of DESIGN) {
    const text = skillFile(skill);
    const section = under(text, "## Rules written from the user's links").filter(
      (line) => line !== "",
    );
    expect({ skill, opens: section.slice(0, 3) }).toEqual({
      skill,
      opens: [OF_THE_LINKS, "| Rule | Link |", "| :- | :- |"],
    });
    expect({ skill, once: text.split(OF_THE_LINKS).length - 1 }).toEqual({ skill, once: 1 });
    expect({ skill, rows: section.slice(3).every((line) => line.startsWith("| ")) }).toEqual({
      skill,
      rows: true,
    });
    const rows = linkRows(skill);
    expect({ skill, enough: rows.length >= (LINK_MINIMUM[skill] ?? 99) }).toEqual({
      skill,
      enough: true,
    });
    for (const [at, row] of rows.entries()) {
      const where = `${skill} link row ${at + 1}`;
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
      const link = /^`([^`]+)`$/.exec(row[1] ?? "")?.[1] ?? "";
      expect({ where, link: names.includes(link) ? "one of the three" : link }).toEqual({
        where,
        link: "one of the three",
      });
    }
    const firsts = rows.map((row) => row[0] ?? "");
    expect({ skill, distinct: new Set(firsts).size }).toEqual({ skill, distinct: firsts.length });
    const named = names.filter((name) => rows.some((row) => row[1] === `\`${name}\``));
    expect({ skill, named }).toEqual({ skill, named: LINKS_OF[skill] ?? [] });
    expect({
      skill,
      provenance: under(text, "## Where the links' rules come from").filter((line) => line !== ""),
    }).toEqual({ skill, provenance: named.map((name) => PROVENANCE[name] ?? "") });
  }
  // dandgabr's decision protocol has six numbered steps: fewer rows than that, and none numbered.
  const protocol = linkRows(DECISION).filter((row) => row[1] === "`dandgabr`");
  expect(protocol.length > 0 && protocol.length < 6).toBe(true);
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

test(`${ITEM} AC-40: the ledger holds the three sources and one row for each row of a second table, each with its note, and ADR 0017 holds the note of this item`, () => {
  const ledger = JSON.parse(repoFile(LEDGER)) as {
    sources: { name: string; licence: string; commit: string }[];
    rows: LedgerRow[];
  };
  for (const source of [
    { name: "45ck-architecture", licence: "MIT", commit: "14966b2" },
    { name: "davila7-architecture", licence: "MIT", commit: "1deb97c" },
    { name: "dandgabr-architect", licence: "GPL-3.0", commit: "b23ec7f" },
  ])
    expect(ledger.sources).toContainEqual(source);
  const ledgerName = (link: string) => LINKS.find(([name]) => `\`${name}\`` === link)?.[1] ?? link;
  const written = DESIGN.flatMap(([skill]) =>
    linkRows(skill).map((row) =>
      [`${SKILLS}/${skill}/SKILL.md`, row[0] ?? "", ledgerName(row[1] ?? "")].join("\n"),
    ),
  );
  const rows = ledger.rows.filter((row) => LINKS.some(([, name]) => name === row.source));
  expect(rows.map((row) => [row.file, row.text, row.source].join("\n")).sort()).toEqual(
    [...written].sort(),
  );
  expect(rows.length).toBeGreaterThanOrEqual(19);
  for (const row of rows) {
    const where = `${row.source}: ${row.text}`;
    const commit = LINKS.find(([, name]) => name === row.source)?.[2] ?? "";
    const opening = `read at ${commit}, `;
    const note = row.note ?? "";
    expect({ where, status: row.status, proof: row.proof }).toEqual({
      where,
      status: "in",
      proof: "architects-skills.test.ts",
    });
    expect({ where, rule: row.rule.length > 0 }).toEqual({ where, rule: true });
    expect({ where, opens: note.startsWith(opening) }).toEqual({ where, opens: true });
    // The file named right after the commit is one the session read, of this row's source, and so
    // is every other path to a SKILL.md the note holds.
    const file = /^[^\s;,]+/.exec(note.slice(opening.length))?.[0] ?? "";
    const paths = [file, ...(note.match(/[\w./-]+\/SKILL\.md/g) ?? [])];
    expect({
      where,
      strangers: paths.filter((path) => !(READ_FILES[row.source] ?? []).includes(path)),
    }).toEqual({ where, strangers: [] });
    if (row.source !== "45ck-architecture")
      expect({
        where,
        said: note.includes("GPL-3.0") && note.includes("ADR 0017's note of 2026-11-22"),
      }).toEqual({ where, said: true });
  }
  const adr = repoFile(ADR);
  const from = adr.indexOf(
    "## Note of 2026-11-22 (item 2026-11-22-001, rule 6 of the architects team's definition)\n",
  );
  expect(from).toBeGreaterThan(0);
  const next = adr.indexOf("\n## Note of", from + 1);
  const note = adr.slice(from, next < 0 ? undefined : next);
  for (const words of [
    "dandgabr",
    "davila7",
    "GPL-3.0",
    "NeoLabHQ/context-engineering-kit",
    "2025-11-14",
    "2026-01-25",
    "rule 6",
    "decision 5",
    "a translation counts as a copy",
    "no ruling that another source under the GPL may enter",
    "decision 3",
    "D-1",
  ])
    expect(note, words).toContain(words);
});

test(`${ITEM} AC-41: the entry sends each of the thirteen subjects to its skill and to the section of its sources, and holds nothing to open`, () => {
  const text = skillFile(ENTRY);
  const front = frontmatter(text);
  expect(front.name).toBe(ENTRY);
  expectOneSentence(front.description, ENTRY);
  expect(front.body.split("\n")[0]).toBe("# Architecture");
  expect(headings(text)).toEqual([
    "## When",
    "## The thirteen subjects",
    "## Rules written from the user's links",
    "## Where the links' rules come from",
    "## What the skills hold",
  ]);
  const when = under(text, "## When").join(" ");
  for (const what of [
    "a boundary",
    "a contract",
    "a decision on the architecture",
    "before such a change is judged",
  ])
    expect(when, what).toContain(what);
  const table = tableRows(under(text, "## The thirteen subjects"));
  expect(table.header).toBe("| Subject | Skill | Its sources |");
  const holder = (subject: string) =>
    HOLDING.find(([, , subjects]) => subjects.includes(subject))?.[0] ?? "";
  expect(table.rows).toHaveLength(13);
  expect(table.rows).toEqual(
    SUBJECTS.map(([subject]) => [
      subject,
      `\`${holder(subject)}\``,
      `\`${holder(subject)}/sources.md\`, the section of that name`,
    ]),
  );
  for (const [subject] of SUBJECTS)
    expect({
      subject,
      section: sourcesFile(holder(subject)).split("\n").includes(`## ${subject}`),
    }).toEqual({ subject, section: true });
  const last = [NO_RULE_OF_THE_FOUR, NEVER_OPENED, SAYS_SO];
  expect(under(text, "## What the skills hold").filter((line) => line !== "")).toEqual(
    last.map((sentence) => `- ${sentence}`),
  );
  for (const sentence of last)
    expect({ sentence, times: text.split(sentence).length - 1 }).toEqual({ sentence, times: 1 });
  expectNothingToOpen(text, ENTRY);
});

test(`${ITEM} AC-42: the build reference sends a session to the entry right after the agentic-os team's sentence, and CLAUDE.md's one line names the four teams' folders and tests`, () => {
  const SENTENCE =
    "Before a change to a boundary, a model, a contract or an integration, and before a decision on the architecture or on a technology, read `wizardingcode-architecture`: it sends each subject to the skill that holds the crew's rule for it.";
  expect(ENTRY_SENTENCES.indexOf(SENTENCE as (typeof ENTRY_SENTENCES)[number])).toBe(3);
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
    "qa-skills.test.ts",
    "devops-skills.test.ts",
    "agentic-skills.test.ts",
    "architects-skills.test.ts",
    "--team",
  ])
    expect(claude[0], part).toContain(part);
});

const SCRIPT = join(ROOT, "scripts", "build-team-skills.ts");
const build = (copy: string, ...more: string[]) =>
  spawnSync("bun", [SCRIPT, "--root", copy, ...more], { encoding: "utf8" });
const wroteLines = (skills: string[]) =>
  skills.map((skill) => `wrote ${SKILLS}/${skill}/sources.md`);

test(`${ITEM} AC-43: with --team the script writes this team's three files alone, and with none every team's in the table's order`, () => {
  const copy = copyOf(DESIGN.map(([skill]) => skill));
  const held = () =>
    HOLDING.map(([skill]) => readFileSync(join(copy, SKILLS, skill, "sources.md"), "utf8"));
  const WROTE = wroteLines(HOLDING.map(([skill]) => skill));
  const before = [listingOf(copy), held()];
  const first = build(copy, "--team", "architects");
  expect({ status: first.status, err: first.stderr }).toEqual({ status: 0, err: "" });
  expect(first.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listingOf(copy), held()]).toEqual(before);
  expect(held()).toEqual(HOLDING.map(([skill]) => sourcesFile(skill)));
  // A changed file is written back.
  writeFileSync(join(copy, SKILLS, BOUNDARIES, "sources.md"), "changed by hand\n");
  const second = build(copy, "--team", "architects");
  expect({ status: second.status, err: second.stderr }).toEqual({ status: 0, err: "" });
  expect(second.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listingOf(copy), held()]).toEqual(before);
  // A folder that is gone: the refusal alone, and a file changed by hand stays as the hand left it.
  const byHand = join(copy, SKILLS, DECISION, "sources.md");
  writeFileSync(byHand, "changed by hand\n");
  rmSync(join(copy, SKILLS, QUALITY), { recursive: true });
  const gone = build(copy, "--team", "architects");
  expect({ status: gone.status, out: gone.stdout, err: gone.stderr.trim() }).toEqual({
    status: 1,
    out: "",
    err: `team skills not built: no folder ${SKILLS}/${QUALITY}`,
  });
  expect(readFileSync(byHand, "utf8")).toBe("changed by hand\n");
  // Every team's, in the table's order: five, six, nine, three.
  const every = Object.values(TEAM_SKILLS).flatMap((skills) => skills.map((s) => s.skill));
  const all = build(copyOf(every));
  expect({ status: all.status, err: all.stderr }).toEqual({ status: 0, err: "" });
  const lines = all.stdout.trimEnd().split("\n");
  expect(lines).toHaveLength(24);
  expect(lines.slice(20, 23)).toEqual(WROTE);
});
