import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillSources, TEAM_SKILLS, type TeamSkill } from "../src/team-skills.ts";
import { tempDir } from "./helpers.ts";

const ITEM = "2026-11-21-008";
const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const SKILLS = "plugins/core/skills";
const DECLARATION = "plugins/core/teams/qa.md";
const DEFINITION = "docs/specs/2026-11-15-qa-team-design.md";
const ADDRESS = /https?:\/\/[^\s|)>`]+/g;

/** The Design's table: the six skills with their titles and their subjects, in its order. */
const DESIGN: [string, string, string[]][] = [
  ["wizardingcode-qa-testing", "Testing", []],
  [
    "wizardingcode-qa-proof",
    "Proof",
    [
      "A test per criterion, red first",
      "Preserve criteria and regression tests",
      "Observed criteria and their reason",
      "Criteria observable and provable",
    ],
  ],
  [
    "wizardingcode-qa-test-design",
    "Test design",
    [
      "Nothing true by construction",
      "Behaviour, not implementation",
      "Fixtures with neutral names",
      "Strategy and levels",
      "Test doubles and boundaries",
      "Test data and state",
    ],
  ],
  ["wizardingcode-qa-e2e-api", "End to end and API", ["End to end"]],
  [
    "wizardingcode-qa-measuring",
    "Measuring the tests",
    [
      "Mutation",
      "Flaky tests and determinism",
      "Property-based testing and fuzzing",
      "The suite in CI",
    ],
  ],
  ["wizardingcode-qa-evals", "Evals", ["Testing systems with AI"]],
];
const HOLDING = DESIGN.filter(([, , subjects]) => subjects.length > 0);
const MINIMUM: Record<string, number> = {
  "wizardingcode-qa-proof": 8,
  "wizardingcode-qa-test-design": 6,
  "wizardingcode-qa-e2e-api": 6,
  "wizardingcode-qa-measuring": 3,
  "wizardingcode-qa-evals": 3,
};
const QUOTABLE = [
  "plugins/core/skills/crew/references/build.md",
  "plugins/core/skills/crew/references/specify.md",
  "plugins/core/skills/crew/references/gate.md",
  "plugins/core/skills/crew/references/deliver.md",
  "plugins/core/skills/crew/references/plan.md",
  "plugins/core/skills/crew/rubrics/test-quality.md",
  "plugins/core/evals/README.md",
];
const PARAGRAPH = `Each section is a subject of the team's definition (\`${DEFINITION}\`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.`;
const UNDER_THE_RULES =
  "The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.";
const NO_RULE =
  "No rule here comes from a page: the research for the definition read each page's title and not the page.";
const NO_RULE_OF_THE_FIVE =
  "No rule of the five comes from a page: the research for the definition read each page's title and not the page.";
const NEVER_OPENED =
  "The addresses in sources.md are provenance: they are never opened by the session.";
const SAYS_SO =
  "A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.";
const NO_RULE_ON =
  "The crew's files hold no rule on properties, fuzzing, flakiness or the suite in CI: the table has none.";

/** The subjects of the declaration's first table with their second cells, read by the test's own cut of each line. */
function declared(text: string): [string, string][] {
  const lines = text.split("\n");
  const from = lines.findIndex((line) => line === "| Subject | Sources |");
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
const SUBJECTS = declared(repoFile(DECLARATION));
const cellOf = (subject: string) => {
  const cell = SUBJECTS.find(([name]) => name === subject)?.[1];
  if (cell === undefined) throw new Error(`no subject ${subject}`);
  return cell;
};

const run = (text: string) => text.replace(/\s+/g, " ").trim();
const skillFile = (skill: string) => repoFile(`${SKILLS}/${skill}/SKILL.md`);
const sourcesFile = (skill: string) => repoFile(`${SKILLS}/${skill}/sources.md`);
const headings = (text: string) => text.split("\n").filter((line) => line.startsWith("## "));
/** The lines under a `## ` heading, to the next one. */
function under(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const at = lines.indexOf(heading);
  if (at < 0) return [];
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end < 0 ? rest : rest.slice(0, end);
}
/** The rows of the table under a heading, after its header and rule, as cells. */
function tableRows(lines: string[]): { header: string; rows: string[][] } {
  const table = lines.filter((line) => line.startsWith("|"));
  return {
    header: table[0] ?? "",
    rows: table.slice(2).map((line) =>
      line
        .slice(1, -1)
        .split(" | ")
        .map((cell) => cell.trim()),
    ),
  };
}
/** The frontmatter's two values, and the rest of the file after it. */
function frontmatter(text: string): { name: string; description: string; body: string } {
  const match = /^---\nname: ([^\n]+)\ndescription: "([^\n]*)"\n---\n\n/.exec(text);
  if (!match) return { name: "", description: "", body: text };
  return {
    name: match[1] ?? "",
    description: match[2] ?? "",
    body: text.slice(match[0].length),
  };
}
function expectOneSentence(description: string, skill: string): void {
  expect({ skill, length: description.length > 0 && description.length <= 300 }).toEqual({
    skill,
    length: true,
  });
  expect({ skill, ends: description.endsWith(".") }).toEqual({ skill, ends: true });
  expect({ skill, stops: description.split(".").length - 1 }).toEqual({ skill, stops: 1 });
}
function expectNothingToOpen(text: string, skill: string): void {
  expect({ skill, addresses: [...(text.match(ADDRESS) ?? [])] }).toEqual({ skill, addresses: [] });
  expect({ skill, plain: /https?:\/\//.test(text) }).toEqual({ skill, plain: false });
  expect({ skill, fenced: text.includes("```") }).toEqual({ skill, fenced: false });
}

test(`${ITEM} AC-8: the engine's table holds the six skills with their subjects, and the five that hold any take the declaration's sixteen, each once`, () => {
  expect(Object.keys(TEAM_SKILLS)).toContain("qa");
  expect((TEAM_SKILLS.qa ?? []).map((s) => [s.skill, s.title, [...s.subjects]])).toEqual(DESIGN);
  expect(SUBJECTS).toHaveLength(16);
  const taken = (TEAM_SKILLS.qa ?? []).flatMap((s) => [...s.subjects]);
  expect(taken).toHaveLength(16);
  expect(new Set(taken).size).toBe(16);
  const order = SUBJECTS.map(([name]) => name);
  expect([...taken].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(order);
  // Inside a skill the subjects stand in the declaration's order.
  for (const [skill, , subjects] of DESIGN)
    expect({
      skill,
      sorted: [...subjects].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    }).toEqual({ skill, sorted: subjects });
});

test(`${ITEM} AC-9: each sources file is its title, the fixed paragraph and a section a subject whose lines joined again are the declaration's cell`, () => {
  const made = skillSources("qa", repoFile(DECLARATION));
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
    // No other line that is not empty.
    expect({
      skill,
      stray: lines.filter((line, i) => line !== "" && !accounted.has(i)),
    }).toEqual({ skill, stray: [] });
    everyAddress.push(...(text.match(ADDRESS) ?? []));
    // An address stands in the file of its subject's skill.
    const own = subjects.flatMap((subject) => cellOf(subject).match(ADDRESS) ?? []);
    expect({ skill, addresses: [...(text.match(ADDRESS) ?? [])] }).toEqual({
      skill,
      addresses: own,
    });
  }
  // Together they are the declaration's: the files stand in the skills' order, so the two are compared sorted.
  const cells = SUBJECTS.flatMap(([, cell]) => cell.match(ADDRESS) ?? []);
  expect([...everyAddress].sort()).toEqual([...cells].sort());
  expect(everyAddress).toHaveLength(201);
  expect(existsSync(join(ROOT, SKILLS, "wizardingcode-qa-testing", "sources.md"))).toBe(false);
});

test(`${ITEM} AC-10: each skill that holds subjects is its frontmatter, its four sections and rules that quote the crew's own files, with the fixed sentences and nothing to open`, () => {
  const quotable = new Map(QUOTABLE.map((path) => [path, run(repoFile(path))]));
  const wordEdge = (char: string | undefined) => char === undefined || !/[\p{L}\p{N}]/u.test(char);
  for (const [skill, title, subjects] of HOLDING) {
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
        "## Where the subjects are read",
        "## What this skill does not hold",
      ],
    });
    expect({ skill, when: under(text, "## When").join("").trim().length > 0 }).toEqual({
      skill,
      when: true,
    });
    // The rules.
    const rules = under(text, "## The crew's rules");
    expect({ skill, said: rules.filter((line) => line === UNDER_THE_RULES).length }).toEqual({
      skill,
      said: 1,
    });
    expect({ skill, once: text.split(UNDER_THE_RULES).length - 1 }).toEqual({ skill, once: 1 });
    const table = tableRows(rules);
    expect({ skill, header: table.header }).toEqual({
      skill,
      header: "| Rule | File | The file's words |",
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
      expect({ where, file: QUOTABLE.includes(file) ? "one of the seven" : file }).toEqual({
        where,
        file: "one of the seven",
      });
      const words = thirds[at] ?? "";
      expect({ where, long: words.length >= 40 }).toEqual({ where, long: true });
      const held = quotable.get(file) ?? "";
      const found = held.indexOf(words);
      expect({ where, found: found >= 0 }).toEqual({ where, found: true });
      expect({
        where,
        edges: wordEdge(held[found - 1]) && wordEdge(held[found + words.length]),
      }).toEqual({ where, edges: true });
      expect({
        where,
        shared: thirds.filter((other, i) => i !== at && other.includes(words)).length,
      }).toEqual({ where, shared: 0 });
    }
    expect({ skill, distinct: new Set(firsts).size }).toEqual({ skill, distinct: firsts.length });
    // Where the subjects are read.
    expect({
      skill,
      read: under(text, "## Where the subjects are read").filter((line) => line !== ""),
    }).toEqual({
      skill,
      read: subjects.map((subject) => `- ${subject}: \`sources.md\`, the section of that name.`),
    });
    // What the skill does not hold.
    const last = under(text, "## What this skill does not hold").filter((line) => line !== "");
    const measuring = skill === "wizardingcode-qa-measuring";
    expect({ skill, last }).toEqual({
      skill,
      last: [NO_RULE, NEVER_OPENED, SAYS_SO, ...(measuring ? [NO_RULE_ON] : [])].map(
        (sentence) => `- ${sentence}`,
      ),
    });
    for (const sentence of [NO_RULE, NEVER_OPENED, SAYS_SO])
      expect({ skill, sentence, times: text.split(sentence).length - 1 }).toEqual({
        skill,
        sentence,
        times: 1,
      });
    expect({ skill, fourth: text.includes(NO_RULE_ON) }).toEqual({ skill, fourth: measuring });
    expectNothingToOpen(text, skill);
  }
});

test(`${ITEM} AC-11: the entry sends each of the sixteen subjects to its skill and to the section of its sources, and holds nothing to open`, () => {
  const skill = "wizardingcode-qa-testing";
  const text = skillFile(skill);
  const front = frontmatter(text);
  expect(front.name).toBe(skill);
  expectOneSentence(front.description, skill);
  expect(front.body.split("\n")[0]).toBe("# Testing");
  expect(headings(text)).toEqual(["## When", "## The sixteen subjects", "## What the skills hold"]);
  const when = under(text, "## When").join(" ");
  for (const moment of [
    "before the first test of an item",
    "before a criterion is written",
    "before a test is judged",
  ])
    expect(when, moment).toContain(moment);
  const table = tableRows(under(text, "## The sixteen subjects"));
  expect(table.header).toBe("| Subject | Skill | Its sources |");
  const holder = (subject: string) =>
    HOLDING.find(([, , subjects]) => subjects.includes(subject))?.[0] ?? "";
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
  expect(under(text, "## What the skills hold").filter((line) => line !== "")).toEqual(
    [NO_RULE_OF_THE_FIVE, NEVER_OPENED, SAYS_SO].map((sentence) => `- ${sentence}`),
  );
  expectNothingToOpen(text, skill);
});

test(`${ITEM} AC-12: the build reference sends a session to the entry before its first test, and CLAUDE.md names the script`, () => {
  const SENTENCE =
    "Before the first test of an item, and before judging one, read `wizardingcode-qa-testing`: it sends each subject to the skill that holds the crew's rule for it.";
  const build = repoFile("plugins/core/skills/crew/references/build.md");
  expect(build.split(SENTENCE).length - 1).toBe(1);
  const paragraphs = build.split("\n\n");
  const at = paragraphs.indexOf(SENTENCE);
  expect(at).toBeGreaterThan(0);
  expect(paragraphs[at - 1]?.split("\n").at(-1)?.startsWith("5. ")).toBe(true);
  expect(paragraphs[at + 1]).toBe(
    "Before a change to a pipeline, a deployment, an environment file or infrastructure code, read `wizardingcode-devops`: it sends each subject to the skill that holds the crew's rule for it.",
  );
  expect(paragraphs[at + 2]?.startsWith("Use `-- <command>`")).toBe(true);
  const claude = repoFile("CLAUDE.md")
    .split("\n")
    .filter((line) => line.includes("bun scripts/build-team-skills.ts"));
  expect(claude).toHaveLength(1);
  expect(claude[0]).toContain("never edited by hand");
  // It stands right after the line of the script that builds the teams' declarations.
  const lines = repoFile("CLAUDE.md").split("\n");
  const before = lines[lines.indexOf(claude[0] ?? "") - 1] ?? "";
  expect(before.startsWith("- `bun scripts/build-team-declarations.ts`")).toBe(true);
});

test(`${ITEM} AC-13: the generator refuses a table and a declaration that do not hold each other, and a cell with a character that is not printed, naming the subject`, () => {
  const table = (...rows: [string, string][]) =>
    [
      "<!-- made -->",
      "## 3. Subjects",
      "",
      "| Subject | Sources |",
      "| :- | :- |",
      ...rows.map(([subject, cell]) => `| ${subject} | ${cell} |`),
      "",
    ].join("\n");
  const skills = (...made: [string, string[]][]): TeamSkill[] =>
    made.map(([skill, subjects]) => ({ skill, title: skill, subjects }));
  const refused = (text: string, declaration: string, made: TeamSkill[]) =>
    expect(skillSources("qa", declaration, made)).toEqual({ ok: false, refused: text });
  const two = table(["A", "one; two"], ["B", "three"]);
  // A made table that fits gives its files, so the refusals below are each one fault away from it.
  const fits = skillSources("qa", two, skills(["entry", []], ["s", ["A", "B"]]));
  expect(fits.ok && fits.files.map((f) => f.skill)).toEqual(["s"]);
  expect(fits.ok && fits.files[0]?.text.split("\n").slice(4)).toEqual([
    "## A",
    "",
    "- one",
    "- two",
    "",
    "## B",
    "",
    "- three",
    "",
  ]);
  refused('the declaration holds no subject "C"', two, skills(["s", ["A", "B", "C"]]));
  refused('no skill takes the subject "B"', two, skills(["s", ["A"]]));
  refused('two skills take the subject "A"', two, skills(["s", ["A", "B"]], ["t", ["A"]]));
  refused(
    "the declaration has no table of subjects",
    "## 3. Subjects\n\nno table\n",
    skills(["s", ["A"]]),
  );
  refused(
    'the declaration holds the subject "A" twice',
    table(["A", "one"], ["B", "three"], ["A", "two"]),
    skills(["s", ["A", "B"]]),
  );
  // A team with no skill in the table is told so, and a team's own table is the default.
  expect(skillSources("backend", two)).toEqual({
    ok: false,
    refused: 'the team "backend" has no skill of its own in the table',
  });
  expect(skillSources("qa", two)).toEqual({
    ok: false,
    refused: 'the declaration holds no subject "A test per criterion, red first"',
  });
  // A line that is no whole row ends the table: what stands after it is not read.
  const cut = table(["A", "one"]).replace("| A | one |", "| A | one |\n| B | three");
  refused('the declaration holds no subject "B"', cut, skills(["s", ["A", "B"]]));
  for (const point of [0x200b, 0x202e, 0x1b, 0x9b]) {
    const cell = `one${String.fromCodePoint(point)}; two`;
    refused(
      'the subject "A" holds a character that is not printed',
      table(["A", cell], ["B", "three"]),
      skills(["s", ["A", "B"]]),
    );
  }
});

test(`${ITEM} AC-14: the script writes the five files and no other, writes a changed one back, and on a refusal exits 1 and writes nothing`, () => {
  const script = join(ROOT, "scripts", "build-team-skills.ts");
  const copy = tempDir("crew-team-skills-");
  cpSync(join(ROOT, "plugins", "core", "teams"), join(copy, "plugins", "core", "teams"), {
    recursive: true,
  });
  for (const [skill] of DESIGN)
    cpSync(join(ROOT, SKILLS, skill), join(copy, SKILLS, skill), { recursive: true });
  const listing = () =>
    readdirSync(copy, { recursive: true, withFileTypes: true })
      .map((e) => join(e.parentPath, e.name).slice(copy.length))
      .sort();
  const held = () =>
    HOLDING.map(([skill]) => readFileSync(join(copy, SKILLS, skill, "sources.md"), "utf8"));
  // The copy holds the QA team's folders alone, so each run asks for that team (item 2026-11-21-009).
  const build = () =>
    spawnSync("bun", [script, "--root", copy, "--team", "qa"], { encoding: "utf8" });
  const WROTE = HOLDING.map(([skill]) => `wrote ${SKILLS}/${skill}/sources.md`);
  const before = [listing(), held()];
  const first = build();
  expect({ status: first.status, err: first.stderr }).toEqual({ status: 0, err: "" });
  expect(first.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listing(), held()]).toEqual(before);
  expect(held()).toEqual(HOLDING.map(([skill]) => sourcesFile(skill)));
  // A changed file is written back.
  const changed = join(copy, SKILLS, "wizardingcode-qa-evals", "sources.md");
  writeFileSync(changed, "changed by hand\n");
  const second = build();
  expect({ status: second.status, err: second.stderr }).toEqual({ status: 0, err: "" });
  expect(second.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listing(), held()]).toEqual(before);
  // A skill's folder that is gone: nothing is written, the file of the first skill included, which
  // a script writing each file as it goes would have written before it met the missing folder.
  const first1 = join(copy, SKILLS, "wizardingcode-qa-proof", "sources.md");
  writeFileSync(first1, "changed by hand\n");
  rmSync(join(copy, SKILLS, "wizardingcode-qa-evals"), { recursive: true });
  const gone = build();
  expect({ status: gone.status, out: gone.stdout, err: gone.stderr.trim() }).toEqual({
    status: 1,
    out: "",
    err: `team skills not built: no folder ${SKILLS}/wizardingcode-qa-evals`,
  });
  expect(readFileSync(first1, "utf8")).toBe("changed by hand\n");
  expect(existsSync(join(copy, SKILLS, "wizardingcode-qa-evals"))).toBe(false);
  cpSync(
    join(ROOT, SKILLS, "wizardingcode-qa-evals"),
    join(copy, SKILLS, "wizardingcode-qa-evals"),
    {
      recursive: true,
    },
  );
  expect(build().status).toBe(0);
  expect([listing(), held()]).toEqual(before);
  // A refusal: exit 1, the refusal on the error output, nothing written.
  writeFileSync(changed, "changed by hand\n");
  const declaration = join(copy, "plugins", "core", "teams", "qa.md");
  writeFileSync(
    declaration,
    readFileSync(declaration, "utf8").replace("| Mutation | ", "| Mutations | "),
  );
  const state = [listing(), held()];
  const refused = build();
  expect({ status: refused.status, out: refused.stdout, err: refused.stderr.trim() }).toEqual({
    status: 1,
    out: "",
    err: 'team skills not built: the declaration holds no subject "Mutation"',
  });
  expect([listing(), held()]).toEqual(state);
  expect(readFileSync(changed, "utf8")).toBe("changed by hand\n");
  // An empty root is refused before anything is read.
  const none = spawnSync("bun", [script, "--root"], { encoding: "utf8" });
  expect(none.status).toBe(1);
  expect(none.stderr.trim()).toBe(
    "usage: bun scripts/build-team-skills.ts [--root <repository>] [--team <team>]",
  );
});
