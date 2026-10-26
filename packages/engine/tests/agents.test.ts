import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AGENTS = fileURLToPath(new URL("../../../plugins/core/agents/", import.meta.url));
const RUBRICS = fileURLToPath(
  new URL("../../../plugins/core/skills/crew/rubrics/", import.meta.url),
);

const REVIEWERS = [
  "code-quality",
  "test-quality",
  "security",
  "ui-ux",
  "risk",
  "architecture",
  "data",
  "infra",
];
const DEBATE_ROLES = ["researcher", "expert", "devils-advocate", "fault-finder"];
const NEVER = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Agent", "Task"];
const LISTS = [
  "## What the reviewer receives",
  "## Questions",
  "## Defect or advisory",
  "## Only the change",
];

function agent(name: string): { meta: Record<string, string>; body: string } {
  const text = readFileSync(`${AGENTS}${name}.md`, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${name}.md has no frontmatter`);
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: match[2] ?? "" };
}

function tools(meta: Record<string, string>): string[] {
  return (meta.tools ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

test("SP2b: every agent is a read-only role that says what it receives and returns", () => {
  const files = readdirSync(AGENTS)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const expected = [
    "judge",
    "tech-lead",
    "cto",
    ...REVIEWERS.map((g) => `review-${g}`),
    ...DEBATE_ROLES,
  ]
    .map((n) => `${n}.md`)
    .sort();
  expect(files).toEqual(expected);
  for (const file of files) {
    const name = file.replace(/\.md$/, "");
    const { meta, body } = agent(name);
    expect(meta.name).toBe(name);
    expect((meta.description ?? "").length).toBeGreaterThan(40);
    const allowed = tools(meta);
    expect(allowed).toContain("Read");
    for (const t of NEVER) expect(allowed).not.toContain(t);
    expect(body).toContain("## You receive");
    expect(body).toContain("## You return");
    expect(body).toMatch(/never write files/);
    expect(body).toMatch(/nothing of the conversation/);
  }
});

test("SP2b: each reviewer reads its rubric by path, returns the findings shape and runs on sonnet", () => {
  for (const gate of REVIEWERS) {
    const { meta, body } = agent(`review-${gate}`);
    expect(tools(meta)).toEqual(["Read", "Grep", "Glob"]);
    expect(meta.model).toBe("sonnet");
    expect(body).toContain(`\${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/${gate}.md`);
    expect(body).toContain(`# ${gate} findings for <id>`);
    for (const heading of ["## Findings", "## Outside the change", "## Not answerable"])
      expect(body).toContain(heading);
    expect(body).toMatch(/the judge decides/i);
  }
});

test("SP2b: the judge rules the gates, rules the debate and acts as validator, on fable, and never waives", () => {
  const { meta, body } = agent("judge");
  expect(tools(meta)).toEqual(["Read", "Grep", "Glob"]);
  expect(meta.model).toBe("fable");
  for (const heading of [
    "## As judge of the gates",
    "## As judge of the debate",
    "## As validator",
  ])
    expect(body).toContain(heading);
  expect(body).toContain('{"rulings":[');
  expect(body).toContain("verdict: holds | does not hold");
  expect(body).toContain("complete-gap-round");
  expect(body).toContain("stated-default");
  expect(body).toMatch(/never waive/);
  expect(body).toContain('never "by the user"');
  // For the risk gate, the item's own spec and plan are inside the change (review of SP2b, finding 4).
  expect(body).toMatch(/spec\.md[^\n]*inside the change/);
  // The session fills tokens and nothing else of a ruling; SKILL.md rule 2 says the rest is the judge's (review of SP2b, finding 13).
  expect(body).toContain("the only field of a ruling the session fills");
});

test("SP2b: the debate roles run on opus; the devil's advocate and the fault-finder read the proposals file only", () => {
  for (const role of DEBATE_ROLES) expect(agent(role).meta.model).toBe("opus");
  expect(tools(agent("researcher").meta)).toEqual([
    "Read",
    "Grep",
    "Glob",
    "WebFetch",
    "WebSearch",
  ]);
  expect(tools(agent("expert").meta)).toEqual(["Read", "Grep", "Glob"]);
  for (const role of ["devils-advocate", "fault-finder"]) {
    const { meta, body } = agent(role);
    expect(tools(meta)).toEqual(["Read"]);
    expect(body).toContain("conclave/proposals.md");
    expect(body).toMatch(/nothing else/);
    expect(body).toMatch(/reasoning/);
  }
  const expert = agent("expert").body;
  expect(expert).toContain("## Proposal");
  expect(expert).toContain("## Reasoning");
  expect(expert).toMatch(/Nothing in "Proposal" refers to "Reasoning"/);
  const finder = agent("fault-finder").body;
  expect(finder).toContain("- blocking · P-n ·");
  expect(finder).toContain("- advisory · P-n ·");
  expect(finder).toContain("--by fault-finder");
  expect(agent("researcher").body).toContain("## What the facts do not settle");
});

test("SP7a AC-1, AC-2: the architecture, data and infra reviewers judge the change against the project's own base, never the repository, with a rubric each", () => {
  const architecture = agent("review-architecture");
  expect(architecture.meta.model).toBe("sonnet");
  expect(architecture.body).toMatch(/drift[^\n]*defect/i);
  expect(architecture.body).toMatch(/data model/);
  expect(architecture.body).toMatch(/contracts/);
  expect(architecture.body).toMatch(/integrations/);
  const data = agent("review-data");
  expect(data.body).toMatch(/ORM/);
  expect(data.body).toMatch(/migration/);
  const infra = agent("review-infra");
  expect(infra.body).toMatch(/pipeline/);
  expect(infra.body).toMatch(/rollback/);
  for (const reviewer of [architecture, data, infra])
    expect(reviewer.body).toContain("You review the diff, not the repository:");
  for (const gate of ["architecture", "data", "infra"]) {
    const rubric = readFileSync(`${RUBRICS}${gate}.md`, "utf8");
    for (const heading of LISTS) expect(rubric).toContain(heading);
    expect(rubric).toMatch(/A \*\*defect\*\*/);
  }
});

test("SP7a AC-2 (Task 3): the expert takes a personality, the fault-finder is sceptical and the judge professional by their files", () => {
  const expert = agent("expert").body;
  expect(expert).toContain("personality: <name>");
  expect(expert).toMatch(/personalities\/<name>\.md/);
  // The header is the second line of the proposal, right after its title.
  expect(expert).toMatch(/# Proposal for <id>, D-n\npersonality: <name>\n/);
  expect(agent("fault-finder").body).toMatch(/# Defects, <id>\npersonality: sceptical\n/);
  const judge = agent("judge").body;
  expect(judge).toMatch(/# Ruling, <id>\npersonality: professional\n/);
  expect(judge).toMatch(/# Validator, <rule>, <id>\npersonality: professional\n/);
  // The gates' answer stays the JSON object alone: no header there.
  expect(judge).toMatch(/JSON object alone/);
});

test("SP7a AC-5 (Task 4): the tech lead validates with a verdict and numbered returns on sonnet; the CTO plans from the figures on opus; neither writes", () => {
  const lead = agent("tech-lead");
  expect(lead.meta.model).toBe("sonnet");
  expect(tools(lead.meta)).toEqual(["Read", "Grep", "Glob"]);
  expect(lead.body).toContain("verdict: validated | returned");
  expect(lead.body).toContain("## Returns");
  expect(lead.body).toMatch(/R-n · <repo-relative file>:<line>/);
  expect(lead.body).toMatch(/not a yes-man/i);
  expect(lead.body).toMatch(/qa|security|architects|etl|devops/);
  const cto = agent("cto");
  expect(cto.meta.model).toBe("opus");
  expect(tools(cto.meta)).toEqual(["Read", "Grep", "Glob"]);
  for (const heading of ["## What the figures say", "## Keep", "## Change", "## Measure"])
    expect(cto.body).toContain(heading);
  expect(cto.body).toMatch(/crew metrics --json/);
  expect(cto.body).toMatch(/never transcripts/);
});

test("SP9-T5 AC-7: the tech lead lists frontend among its teams, in the description and in the body's team line, with its model and tools unchanged", () => {
  const lead = agent("tech-lead");
  expect(lead.meta.description).toMatch(/QA, security, architects, ETL, DevOps, frontend/);
  expect(lead.body).toMatch(/`etl`, `devops` or `frontend`/);
  expect(lead.meta.model).toBe("sonnet");
  expect(tools(lead.meta)).toEqual(["Read", "Grep", "Glob"]);
});

test("SP2b: one rubric per judgement gate, each judging the change and never the repository", () => {
  // The strategy's rubric (SP8) is the CTO's and the judge's: no reviewer agent carries its name.
  expect(readdirSync(RUBRICS).sort()).toEqual(
    [...REVIEWERS.map((g) => `${g}.md`), "strategy.md"].sort(),
  );
  for (const gate of REVIEWERS) {
    const rubric = readFileSync(`${RUBRICS}${gate}.md`, "utf8");
    for (const heading of LISTS) expect(rubric).toContain(heading);
    expect(rubric).toContain("a finding outside the changed files is advisory and marked debt");
    expect(rubric).toMatch(/\n1\. /);
  }
});

test("SP2c: the expert answers the objections once, the judge asks one question through the lead, and no role gains a tool", () => {
  const expert = agent("expert").body;
  expect(expert).toMatch(/asked once to answer the objections to your proposal/);
  expect(expert).toMatch(/answer the objections, do not restate the proposal/);
  const judge = agent("judge").body;
  expect(judge).toMatch(/ask the lead to have one reviewer point to a line, once/);
  expect(judge).toMatch(/never receive the conversation/);
  // The gates' answer is the JSON alone; the hook files prose around it as the debate's ruling (finding #44).
  expect(judge).toContain("the JSON object alone: no sentence before it, none after it");
  // The debate judge's inputs match conclave.md's step 4: the replies, when the round ran.
  expect(judge).toContain("`conclave/replies.md`");
  for (const file of readdirSync(AGENTS).filter((f) => f.endsWith(".md"))) {
    const { meta, body } = agent(file.replace(/\.md$/, ""));
    expect(tools(meta)).not.toContain("SendMessage");
    expect(body).not.toMatch(/\bcrew mail\b/);
  }
});

test("SP8-T3: the CTO reviews the strategy and the judge rules it, each with its own section and shape", () => {
  const cto = agent("cto").body;
  expect(cto).toContain("## As reviewer of the strategy");
  expect(cto).toContain("# strategy findings for <id>");
  expect(cto).toContain("${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/strategy.md");
  expect(cto).toContain("strategy.md:<line>");
  const judge = agent("judge").body;
  expect(judge).toContain("## As judge of the strategy");
  expect(judge).toContain('"gate":"strategy"');
  expect(judge).toMatch(/reviewer[^\n]*"cto"[^\n]*"judge"/);
});

test("SP8-T4 AC-3: the six reviewers of an audit carry the audit paragraph and the researcher the dependencies table; the ui-ux and risk reviewers do not sit on an audit", () => {
  for (const gate of [
    "security",
    "architecture",
    "code-quality",
    "test-quality",
    "data",
    "infra",
  ]) {
    const { body } = agent(`review-${gate}`);
    expect(body).toContain("## On an audit");
    expect(body).toContain(".crew/work/<id>/audit/files.txt");
    expect(body).toMatch(/no diff/);
    expect(body).toMatch(/`## Outside the change` is `none`/);
    expect(body).toContain("log:<path under logs/>");
    expect(body).toContain(`audit/${gate}.findings.md`);
  }
  for (const gate of ["ui-ux", "risk"])
    expect(agent(`review-${gate}`).body).not.toContain("## On an audit");
  const researcher = agent("researcher").body;
  expect(researcher).toContain("## On an audit");
  expect(researcher).toContain("| Package | Current | Latest | Pros | Cons | Risk | Proof |");
  expect(researcher).toContain("audit/dependencies.findings.md");
});

/** The first paragraph after a page's H1: its lines up to the next blank line. */
const firstParagraph = (text: string): string => {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("# ")) + 1;
  const from = lines.findIndex((l, i) => i >= start && l.trim() !== "");
  const end = lines.findIndex((l, i) => i > from && l.trim() === "");
  return lines.slice(from, end === -1 ? undefined : end).join("\n");
};

test("CON1-AC-2 (finding 51): the data and infra reviewers and their rubrics sit on the full route, and whenever the team policy seats ETL or DevOps", () => {
  const triggers = {
    data: ["touches a data migration", "ETL"],
    infra: ["touches infrastructure", "DevOps"],
  };
  for (const [gate, [touches, team]] of Object.entries(triggers)) {
    const seat = `when the change ${touches} on the full route, or whenever the team policy seats ${team}`;
    expect(agent(`review-${gate}`).meta.description).toMatch(/on the full route/);
    expect(agent(`review-${gate}`).meta.description).toContain(`${seat};`);
    const first = firstParagraph(readFileSync(`${RUBRICS}${gate}.md`, "utf8"));
    expect(first).toMatch(/^The \w+ gate asks /);
    expect(first).toMatch(/on the full route/);
    expect(first).toContain(`It runs ${seat}.`);
  }
});

test("CON1-AC-3 (finding 52): the fault-finder names its personality file on its own page", () => {
  expect(agent("fault-finder").body).toContain("personalities/sceptical.md");
});

test("AC-5 (finding 152): the mod's table of each crew role's declared model equals every agent file's model line, both ways", () => {
  const mod = readFileSync(
    fileURLToPath(new URL("../../../plugins/core/hooks/register.js", import.meta.url)),
    "utf8",
  );
  const block = /const ROLE_MODELS = \{([\s\S]*?)\n\}/.exec(mod)?.[1] ?? "";
  const table = Object.fromEntries(
    [...block.matchAll(/^\s*['"]?([a-z-]+)['"]?\s*:\s*['"]([a-z]+)['"],?\s*$/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  const files = Object.fromEntries(
    readdirSync(AGENTS)
      .filter((f) => f.endsWith(".md"))
      .map((f) => [f.replace(/\.md$/, ""), agent(f.replace(/\.md$/, "")).meta.model]),
  );
  expect(Object.keys(files).length).toBeGreaterThan(0);
  expect(table).toEqual(files);
});

test("AC-10 (finding 62): the expert names the strongest alternative it rejected, its own other design, as the last line of its Proposal section", () => {
  const { body } = agent("expert");
  const proposal = /## Proposal\n([\s\S]*?)\n## Reasoning/.exec(body)?.[1] ?? "";
  const lines = proposal.trim().split("\n");
  expect(lines.at(-1)).toBe(
    "Alternative rejected: <the strongest other design for D-n> because <why, with a fact>",
  );
  expect(body).toMatch(
    /Alternative rejected[^\n]*your own other design[^\n]*never another expert's[^\n]*seen none/,
  );
});
