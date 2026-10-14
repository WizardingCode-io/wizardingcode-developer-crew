import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AGENTS = fileURLToPath(new URL("../../../plugins/core/agents/", import.meta.url));
const RUBRICS = fileURLToPath(
  new URL("../../../plugins/core/skills/crew/rubrics/", import.meta.url),
);

const REVIEWERS = ["code-quality", "test-quality", "security", "ui-ux", "risk"];
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
  const expected = ["judge", ...REVIEWERS.map((g) => `review-${g}`), ...DEBATE_ROLES]
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

test("SP2b: one rubric per judgement gate, each judging the change and never the repository", () => {
  expect(readdirSync(RUBRICS).sort()).toEqual(REVIEWERS.map((g) => `${g}.md`).sort());
  for (const gate of REVIEWERS) {
    const rubric = readFileSync(`${RUBRICS}${gate}.md`, "utf8");
    for (const heading of LISTS) expect(rubric).toContain(heading);
    expect(rubric).toContain("a finding outside the changed files is advisory and marked debt");
    expect(rubric).toMatch(/\n1\. /);
  }
});
