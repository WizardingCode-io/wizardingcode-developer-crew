import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { skillSources, TEAM_SKILLS } from "../src/team-skills.ts";
import { tempDir } from "./helpers.ts";

// The DevOps team's skills, held as the QA team's are in qa-skills.test.ts: this file repeats that
// one's reading with its own values, and gathering the two in one helper is the next team's item.
const ITEM = "2026-11-21-009";
const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const SKILLS = "plugins/core/skills";
const DECLARATION = "plugins/core/teams/devops.md";
const DEFINITION = "docs/specs/2026-11-15-devops-team-design.md";
const ADDRESS = /https?:\/\/[^\s|)>`]+/g;
const ENTRY = "wizardingcode-devops";

/** The Design's table: the seven skills with their titles and their subjects, in its order. */
const DESIGN: [string, string, string[]][] = [
  [ENTRY, "DevOps", []],
  ["wizardingcode-devops-pipelines", "Pipelines", ["Pipelines", "The pipeline's supply chain"]],
  [
    "wizardingcode-devops-secrets-identities",
    "Secrets and identities",
    ["Secrets", "Permissions and identities"],
  ],
  [
    "wizardingcode-devops-environment-containers",
    "Environment and containers",
    ["Hosts", "Reproducibility", "The project's environment", "Containers and images"],
  ],
  ["wizardingcode-devops-iac", "Infrastructure as code", ["Infrastructure as code", "Cost"]],
  [
    "wizardingcode-devops-deploy-rollback",
    "Deploy and rollback",
    [
      "Rollback",
      "Deployment strategies and releases",
      "Platforms and hosting",
      "Backups and disaster recovery",
    ],
  ],
  ["wizardingcode-devops-operation", "Operation", ["Observability and operation"]],
];
const HOLDING = DESIGN.filter(([, , subjects]) => subjects.length > 0);
const MINIMUM: Record<string, number> = {
  "wizardingcode-devops-pipelines": 4,
  "wizardingcode-devops-secrets-identities": 4,
  "wizardingcode-devops-environment-containers": 4,
  "wizardingcode-devops-iac": 3,
  "wizardingcode-devops-deploy-rollback": 5,
  "wizardingcode-devops-operation": 2,
};
const QUOTABLE = [
  "plugins/core/skills/crew/rubrics/infra.md",
  "plugins/core/skills/crew/rubrics/risk.md",
  "plugins/core/skills/crew/references/gate.md",
  DECLARATION,
];
/** The two passages of the declaration's section 3 a row may hold, whole and alone. */
const PLATFORM_RULE =
  "The rule: the platform is chosen by the case measured or estimated in writing, not the largest by default";
const COST_RULE = "the rule of the case measured or estimated in writing";
/** The limits each skill carries, each whole inside a third cell of its skill. */
const LIMITS: [string, string][] = [
  [
    "wizardingcode-devops-pipelines",
    "the team reads and validates, and never triggers a deploy pipeline",
  ],
  [
    "wizardingcode-devops-secrets-identities",
    "the secret manager's CLI to list names only, never values",
  ],
  // Beyond the Design's eight: the condition on a server that acts by default (item's delivery).
  [
    "wizardingcode-devops-secrets-identities",
    "the other six act by default, and none is installed until the building item shows the command with the switch",
  ],
  [
    "wizardingcode-devops-environment-containers",
    "On images built locally; no push to a registry.",
  ],
  [
    "wizardingcode-devops-iac",
    "Always the project's tool, and only up to the plan: never apply or destroy.",
  ],
  [
    "wizardingcode-devops-deploy-rollback",
    "A deploy to production and any command that deletes or changes a real resource are a person's decision, never the team's own",
  ],
  [
    "wizardingcode-devops-deploy-rollback",
    "with a restore rehearsal into a test database and never over production",
  ],
  ["wizardingcode-devops-deploy-rollback", PLATFORM_RULE],
  [
    "wizardingcode-devops-operation",
    "the service's CLI, only to read and to send sourcemaps or mark a release in a rehearsal",
  ],
];
/** What a skill's "When" says the crew's files hold no rule on: these three skills, and no other. */
const NO_RULE_OF_THEIR_OWN: Record<string, string> = {
  "wizardingcode-devops-iac": "The crew's files hold no rule of their own on policy as code.",
  "wizardingcode-devops-deploy-rollback":
    "The crew's files hold no rule of their own on a deployment's strategy.",
  "wizardingcode-devops-operation":
    "The crew's files hold no rule of their own on incidents or runbooks.",
};
const PARAGRAPH = `Each section is a subject of the team's definition (\`${DEFINITION}\`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.`;
const UNDER_THE_RULES =
  "The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.";
const NO_RULE =
  "No rule here comes from a page: the research for the definition read each page's title and not the page.";
const NO_RULE_OF_THE_SIX =
  "No rule of the six comes from a page: the research for the definition read each page's title and not the page.";
const NEVER_OPENED =
  "The addresses in sources.md are provenance: they are never opened by the session.";
const SAYS_SO =
  "A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.";
const THE_ENTRY = `The entry is \`${ENTRY}\`.`;
const USAGE = "usage: bun scripts/build-team-skills.ts [--root <repository>] [--team <team>]";

/** The subjects of the declaration's first table with their second cells, read by the test's own pattern. */
function declared(text: string): [string, string][] {
  const lines = text.split("\n");
  const from = lines.indexOf("| Subject | Sources |");
  if (from < 0) throw new Error("the declaration has no table of subjects");
  const found: [string, string][] = [];
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
function under(text: string, heading: string): string[] {
  const lines = text.split("\n");
  const at = lines.indexOf(heading);
  if (at < 0) return [];
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((line) => line.startsWith("## "));
  return end < 0 ? rest : rest.slice(0, end);
}
function tableRows(lines: string[]): { header: string; rule: string; rows: string[][] } {
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
function frontmatter(text: string): { name: string; description: string; body: string } {
  const match = /^---\nname: ([^\n]+)\ndescription: "([^\n]*)"\n---\n\n/.exec(text);
  if (!match) return { name: "", description: "", body: text };
  return { name: match[1] ?? "", description: match[2] ?? "", body: text.slice(match[0].length) };
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

/**
 * Where a quotation of a file is held: the file's whole text, and for the declaration its head
 * alone (section 4 and the rules of section 5), with white space run together.
 */
function heldText(path: string): string {
  const text = repoFile(path);
  if (path !== DECLARATION) return run(text);
  const lines = text.split("\n");
  const from = lines.indexOf("## 4. Tools the team runs");
  const to = lines.indexOf("### Installed where the project uses the tool");
  if (from < 0 || to < from) throw new Error("the declaration's head has no bounds");
  return run(lines.slice(from, to).join("\n"));
}
/** The declaration's section 3, with white space run together. */
function sectionThree(): string {
  const lines = repoFile(DECLARATION).split("\n");
  const from = lines.indexOf("## 3. Subjects and where their information comes from");
  const to = lines.indexOf("## 4. Tools the team runs");
  if (from < 0 || to < from) throw new Error("the declaration's section 3 has no bounds");
  return run(lines.slice(from, to).join("\n"));
}
const wordEdge = (char: string | undefined) => char === undefined || !/[\p{L}\p{N}]/u.test(char);
/** Why a third cell is not held to its file as the Design says, or nothing. */
function notHeld(file: string, words: string): string | null {
  if (words.length < 40) return "under 40 characters";
  // Of section 3 a row holds one of the two rules of the team's own, whole and alone.
  // Each is still looked for in section 3, so a rule reworded there and not in its skill is red.
  if (file === DECLARATION && (words === PLATFORM_RULE || words === COST_RULE))
    return sectionThree().includes(words) ? null : "not found";
  const held = heldText(file);
  const found = held.indexOf(words);
  if (found < 0) return "not found";
  return wordEdge(held[found - 1]) && wordEdge(held[found + words.length])
    ? null
    : "not at a word's edge";
}

test(`${ITEM} AC-8: the engine's table holds the DevOps team's seven skills after the QA team's, and the six that hold subjects take the declaration's fifteen, each once`, () => {
  expect(Object.keys(TEAM_SKILLS).slice(0, 2)).toEqual(["qa", "devops"]);
  expect((TEAM_SKILLS.devops ?? []).map((s) => [s.skill, s.title, [...s.subjects]])).toEqual(
    DESIGN,
  );
  expect((TEAM_SKILLS.qa ?? []).map((s) => [s.skill, s.title, s.subjects.length])).toEqual([
    ["wizardingcode-qa-testing", "Testing", 0],
    ["wizardingcode-qa-proof", "Proof", 4],
    ["wizardingcode-qa-test-design", "Test design", 6],
    ["wizardingcode-qa-e2e-api", "End to end and API", 1],
    ["wizardingcode-qa-measuring", "Measuring the tests", 4],
    ["wizardingcode-qa-evals", "Evals", 1],
  ]);
  expect(SUBJECTS).toHaveLength(15);
  const taken = (TEAM_SKILLS.devops ?? []).flatMap((s) => [...s.subjects]);
  expect(taken).toHaveLength(15);
  expect(new Set(taken).size).toBe(15);
  const order = SUBJECTS.map(([name]) => name);
  expect([...taken].sort((a, b) => order.indexOf(a) - order.indexOf(b))).toEqual(order);
  for (const [skill, , subjects] of DESIGN)
    expect({
      skill,
      sorted: [...subjects].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    }).toEqual({ skill, sorted: subjects });
});

test(`${ITEM} AC-9: each sources file is its title, the fixed paragraph and a section a subject whose lines joined again are the declaration's cell`, () => {
  const made = skillSources("devops", repoFile(DECLARATION));
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
    const own = subjects.flatMap((subject) => cellOf(subject).match(ADDRESS) ?? []);
    expect({ skill, addresses: [...(text.match(ADDRESS) ?? [])] }).toEqual({
      skill,
      addresses: own,
    });
  }
  const cells = SUBJECTS.flatMap(([, cell]) => cell.match(ADDRESS) ?? []);
  expect([...everyAddress].sort()).toEqual([...cells].sort());
  expect(everyAddress).toHaveLength(288);
  expect(existsSync(join(ROOT, SKILLS, ENTRY, "sources.md"))).toBe(false);
});

test(`${ITEM} AC-10: each skill that holds subjects quotes the crew's files, the declaration by its head alone, carries its limits whole, and holds the fixed sentences and nothing to open`, () => {
  // The hold itself, on quotations the Design refuses and the two it names.
  expect(notHeld(DECLARATION, PLATFORM_RULE)).toBeNull();
  expect(notHeld(DECLARATION, COST_RULE)).toBeNull();
  // A page's title of section 3 that is a command, with no limit beside it.
  const title = `the platform's rollback documentation: Kubernetes' "kubectl rollout undo"`;
  expect(run(repoFile(DECLARATION))).toContain(title);
  expect(notHeld(DECLARATION, title)).toBe("not found");
  // The platform's rule with a word more of its cell is no longer the passage.
  expect(notHeld(DECLARATION, `). ${PLATFORM_RULE}`)).toBe("not found");
  // An install line of the tables after the head.
  const install = "brew install controlplaneio-fluxcd/tap/flux-operator-mcp";
  expect(run(repoFile(DECLARATION))).toContain(install);
  expect(notHeld(DECLARATION, install)).toBe("not found");
  // A passage of the head, and the same cut inside a word.
  const limit = "Always the project's tool, and only up to the plan: never apply or destroy.";
  expect(notHeld(DECLARATION, limit)).toBeNull();
  expect(notHeld(DECLARATION, limit.slice(2))).toBe("not at a word's edge");
  expect(notHeld(DECLARATION, limit.slice(0, -2))).toBe("not at a word's edge");
  // Words after a named passage, and words before the other one.
  expect(run(repoFile(DECLARATION))).toContain(`${PLATFORM_RULE} |`);
  expect(notHeld(DECLARATION, `${PLATFORM_RULE} |`)).toBe("not found");
  expect(run(repoFile(DECLARATION))).toContain(`none opened; ${COST_RULE}`);
  expect(notHeld(DECLARATION, `none opened; ${COST_RULE}`)).toBe("not found");
  expect(sectionThree()).toContain(PLATFORM_RULE);
  expect(sectionThree()).toContain(COST_RULE);
  expect(heldText(DECLARATION)).not.toContain(COST_RULE);
  expect(heldText(DECLARATION)).not.toContain(PLATFORM_RULE);
  expect(notHeld(DECLARATION, limit.slice(0, 30))).toBe("under 40 characters");
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
    // When: not empty, ends on the entry, and says what the crew's files hold no rule on.
    const when = run(under(text, "## When").join(" "));
    expect({ skill, ends: when.endsWith(THE_ENTRY) }).toEqual({ skill, ends: true });
    expect({ skill, more: when.length > THE_ENTRY.length + 20 }).toEqual({ skill, more: true });
    for (const [other, sentence] of Object.entries(NO_RULE_OF_THEIR_OWN))
      expect({
        skill,
        sentence,
        held: text.split(sentence).length - 1,
        inWhen: when.includes(sentence),
      }).toEqual({ skill, sentence, held: other === skill ? 1 : 0, inWhen: other === skill });
    expect({
      skill,
      absent: text.split("hold no rule of their own on").length - 1,
    }).toEqual({ skill, absent: Object.hasOwn(NO_RULE_OF_THEIR_OWN, skill) ? 1 : 0 });
    // The rules.
    const rules = under(text, "## The crew's rules");
    expect({ skill, said: rules.filter((line) => line === UNDER_THE_RULES).length }).toEqual({
      skill,
      said: 1,
    });
    expect({ skill, once: text.split(UNDER_THE_RULES).length - 1 }).toEqual({ skill, once: 1 });
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
      expect({ where, file: QUOTABLE.includes(file) ? "one of the four" : file }).toEqual({
        where,
        file: "one of the four",
      });
      const words = thirds[at] ?? "";
      expect({ where, words, held: notHeld(file, words) }).toEqual({ where, words, held: null });
      expect({
        where,
        shared: thirds.filter((other, i) => i !== at && other.includes(words)).length,
      }).toEqual({ where, shared: 0 });
    }
    expect({ skill, distinct: new Set(firsts).size }).toEqual({ skill, distinct: firsts.length });
    // The limits the declaration sets, each whole inside a third cell.
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
      read: subjects.map((subject) => `- ${subject}: \`sources.md\`, the section of that name.`),
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
  // Every limit names a skill of the table, so none is checked against nothing.
  expect(LIMITS.every(([skill]) => HOLDING.some(([name]) => name === skill))).toBe(true);
  expect(LIMITS).toHaveLength(9);
});

test(`${ITEM} AC-11: the entry sends each of the fifteen subjects to its skill and to the section of its sources, and holds nothing to open`, () => {
  const text = skillFile(ENTRY);
  const front = frontmatter(text);
  expect(front.name).toBe(ENTRY);
  expectOneSentence(front.description, ENTRY);
  expect(front.body.split("\n")[0]).toBe("# DevOps");
  expect(headings(text)).toEqual(["## When", "## The fifteen subjects", "## What the skills hold"]);
  const when = under(text, "## When").join(" ");
  for (const what of ["a pipeline", "a deployment", "an environment file", "infrastructure code"])
    expect(when, what).toContain(what);
  const table = tableRows(under(text, "## The fifteen subjects"));
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
    [NO_RULE_OF_THE_SIX, NEVER_OPENED, SAYS_SO].map((sentence) => `- ${sentence}`),
  );
  expectNothingToOpen(text, ENTRY);
});

test(`${ITEM} AC-12: the build reference sends a session to the entry right after the QA team's sentence, and CLAUDE.md's one line names both teams' folders, both tests and the flag`, () => {
  const QA =
    "Before the first test of an item, and before judging one, read `wizardingcode-qa-testing`: it sends each subject to the skill that holds the crew's rule for it.";
  const SENTENCE =
    "Before a change to a pipeline, a deployment, an environment file or infrastructure code, read `wizardingcode-devops`: it sends each subject to the skill that holds the crew's rule for it.";
  const build = repoFile("plugins/core/skills/crew/references/build.md");
  expect(build.split(SENTENCE).length - 1).toBe(1);
  const paragraphs = build.split("\n\n");
  const at = paragraphs.indexOf(SENTENCE);
  expect(paragraphs[at - 1]).toBe(QA);
  expect(paragraphs[at + 1]?.startsWith("Use `-- <command>`")).toBe(true);
  const claude = repoFile("CLAUDE.md")
    .split("\n")
    .filter((line) => line.includes("bun scripts/build-team-skills.ts"));
  expect(claude).toHaveLength(1);
  for (const part of [
    "wizardingcode-qa-*",
    "wizardingcode-devops",
    "qa-skills.test.ts",
    "devops-skills.test.ts",
    "--team",
  ])
    expect(claude[0], part).toContain(part);
});

const SCRIPT = join(ROOT, "scripts", "build-team-skills.ts");
/** A copy of the plugin's teams and the folders of the skills given. */
function copyOf(skills: string[]): string {
  const copy = tempDir("crew-team-skills-");
  cpSync(join(ROOT, "plugins", "core", "teams"), join(copy, "plugins", "core", "teams"), {
    recursive: true,
  });
  for (const skill of skills)
    cpSync(join(ROOT, SKILLS, skill), join(copy, SKILLS, skill), { recursive: true });
  return copy;
}
const listingOf = (copy: string) =>
  readdirSync(copy, { recursive: true, withFileTypes: true })
    .map((e) => join(e.parentPath, e.name).slice(copy.length))
    .sort();
const build = (copy: string, ...more: string[]) =>
  spawnSync("bun", [SCRIPT, "--root", copy, ...more], { encoding: "utf8" });
const wroteLines = (skills: string[]) =>
  skills.map((skill) => `wrote ${SKILLS}/${skill}/sources.md`);

test(`${ITEM} AC-13: with --team the script writes that team's files alone, refuses a name that is no own key of the table before any path, and takes no --team without a name`, () => {
  const copy = copyOf(DESIGN.map(([skill]) => skill));
  const held = () =>
    HOLDING.map(([skill]) => readFileSync(join(copy, SKILLS, skill, "sources.md"), "utf8"));
  const WROTE = wroteLines(HOLDING.map(([skill]) => skill));
  const before = [listingOf(copy), held()];
  const first = build(copy, "--team", "devops");
  expect({ status: first.status, err: first.stderr }).toEqual({ status: 0, err: "" });
  expect(first.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listingOf(copy), held()]).toEqual(before);
  expect(held()).toEqual(HOLDING.map(([skill]) => sourcesFile(skill)));
  // A changed file is written back.
  const changed = join(copy, SKILLS, "wizardingcode-devops-operation", "sources.md");
  writeFileSync(changed, "changed by hand\n");
  const second = build(copy, "--team", "devops");
  expect({ status: second.status, err: second.stderr }).toEqual({ status: 0, err: "" });
  expect(second.stdout.trimEnd().split("\n")).toEqual(WROTE);
  expect([listingOf(copy), held()]).toEqual(before);
  // A name that is no own key of the table: an unknown one, an inherited one, a path.
  const state = [listingOf(copy), held()];
  for (const name of ["nothing", "constructor", "toString", "../qa", "QA", "qa "]) {
    const refused = build(copy, "--team", name);
    expect({
      name,
      status: refused.status,
      out: refused.stdout,
      err: refused.stderr.trim(),
    }).toEqual({
      name,
      status: 1,
      out: "",
      err: `team skills not built: no team "${name}" in the table`,
    });
    expect({ name, state: [listingOf(copy), held()] }).toEqual({
      name,
      state,
    });
  }
  // No name after --team, and an empty one: the usage, nothing printed, nothing written.
  for (const tail of [["--team"], ["--team", ""]]) {
    const none = build(copy, ...tail);
    expect({ tail, status: none.status, out: none.stdout, err: none.stderr.trim() }).toEqual({
      tail,
      status: 1,
      out: "",
      err: USAGE,
    });
    expect({ tail, state: [listingOf(copy), held()] }).toEqual({
      tail,
      state,
    });
  }
  // A folder that is gone: the refusal alone, and a file changed by hand stays as the hand left it.
  const first1 = join(copy, SKILLS, "wizardingcode-devops-pipelines", "sources.md");
  writeFileSync(first1, "changed by hand\n");
  rmSync(join(copy, SKILLS, "wizardingcode-devops-operation"), { recursive: true });
  const gone = build(copy, "--team", "devops");
  expect({ status: gone.status, out: gone.stdout, err: gone.stderr.trim() }).toEqual({
    status: 1,
    out: "",
    err: `team skills not built: no folder ${SKILLS}/wizardingcode-devops-operation`,
  });
  expect(readFileSync(first1, "utf8")).toBe("changed by hand\n");
  // The QA team's files are not written by a run for the DevOps team.
  const devopsOnly = copyOf(DESIGN.map(([skill]) => skill));
  const noQa = build(devopsOnly, "--team", "qa");
  expect({ status: noQa.status, out: noQa.stdout, err: noQa.stderr.trim() }).toEqual({
    status: 1,
    out: "",
    err: `team skills not built: no folder ${SKILLS}/wizardingcode-qa-proof`,
  });
  expect(build(devopsOnly, "--team", "devops").stdout.trimEnd().split("\n")).toEqual(WROTE);
});

test(`${ITEM} AC-14: with no --team the script writes every team's files in the table's order, and writes none where one team's folder is gone`, () => {
  const every = Object.values(TEAM_SKILLS).flatMap((skills) => (skills ?? []).map((s) => s.skill));
  const holding = Object.values(TEAM_SKILLS).flatMap((skills) =>
    (skills ?? []).filter((s) => s.subjects.length > 0).map((s) => s.skill),
  );
  const copy = copyOf(every);
  const all = build(copy);
  expect({ status: all.status, err: all.stderr }).toEqual({ status: 0, err: "" });
  const lines = all.stdout.trimEnd().split("\n");
  expect(lines).toEqual(wroteLines(holding));
  // The QA team's five, then the DevOps team's six.
  expect(lines.slice(0, 5).every((line) => line.includes("wizardingcode-qa-"))).toBe(true);
  expect(lines.slice(5, 11)).toEqual(wroteLines(HOLDING.map(([skill]) => skill)));
  // A QA file changed by hand and a DevOps folder gone: nothing is written, the QA file included.
  const qa = join(copy, SKILLS, "wizardingcode-qa-proof", "sources.md");
  writeFileSync(qa, "changed by hand\n");
  rmSync(join(copy, SKILLS, "wizardingcode-devops-iac"), { recursive: true });
  const gone = build(copy);
  expect({ status: gone.status, out: gone.stdout, err: gone.stderr.trim() }).toEqual({
    status: 1,
    out: "",
    err: `team skills not built: no folder ${SKILLS}/wizardingcode-devops-iac`,
  });
  expect(readFileSync(qa, "utf8")).toBe("changed by hand\n");
});
