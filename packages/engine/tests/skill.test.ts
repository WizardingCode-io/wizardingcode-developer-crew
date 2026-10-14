import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const KINDS = [
  "endpoint",
  "auth",
  "payment",
  "upload",
  "migration-or-restore",
  "sync",
  "link-target",
  "deletion",
  "merge",
  "screen",
];
const CASES: Record<string, string[]> = {
  deletion: ["C-5", "C-11"],
  sync: ["C-9"],
  "link-target": ["C-13", "C-14"],
  "migration-or-restore": ["C-16"],
  merge: ["C-17"],
};

test("SP2b: one checklist per kind of change, each with the four lists and its corpus cases", () => {
  const dir = fileURLToPath(
    new URL("../../../plugins/core/skills/crew/checklists/", import.meta.url),
  );
  expect(readdirSync(dir).sort()).toEqual(KINDS.map((k) => `${k}.md`).sort());
  for (const kind of KINDS) {
    const text = readFileSync(`${dir}${kind}.md`, "utf8");
    for (const heading of [
      "Assumed by good practice",
      "Decisions only the user can make",
      "Proposals",
      "Warnings",
    ])
      expect(text).toContain(`## ${heading}`);
    for (const c of CASES[kind] ?? []) expect(text).toContain(c);
    expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(24);
  }
});

const skill = readFileSync(
  fileURLToPath(new URL("../../../plugins/core/skills/crew/SKILL.md", import.meta.url)),
  "utf8",
);

test("the rules say the agent never asks the user to run a crew command, and name the sessions with no person", () => {
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toMatch(/never ask the user to run a `crew` command/i);
  expect(rules).toMatch(/headless/);
  expect(rules).toMatch(/bypassPermissions or dontAsk/);
  expect(rules).toMatch(/auto mode/);
});

test("the rules say one checkout per session, a worktree for each lane", () => {
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toMatch(/one checkout per session/i);
  expect(rules).toMatch(/git worktree add/);
  expect(rules).toMatch(/every watched file/);
});

function readReference(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../plugins/core/skills/crew/references/${name}`, import.meta.url)),
    "utf8",
  );
}

test("0.3.0: a decision is presented in words and the user's positive word is the signature; approval by rule when nothing is pending", () => {
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toMatch(/positive word is the signature/);
  expect(rules).toMatch(/what is being decided, why, the facts, the evidence/);
  expect(rules).toContain("--validator complete-gap-round");
  const conclave = readReference("conclave.md");
  expect(conclave).toMatch(/positive word/);
  expect(conclave).toMatch(/what is being decided, why, the facts, the evidence/);
  expect(conclave).toContain("crew approve <id> spec --validator complete-gap-round");
  expect(readReference("specify.md")).toContain("--validator complete-gap-round");
  expect(readReference("specify.md")).not.toContain("the permission prompt is their signature");
  // The full-route eval grades the approval by rule, not a stop at a prompt.
  const graders = fileURLToPath(
    new URL("../../../plugins/core/evals/risk-escalation/graders/", import.meta.url),
  );
  expect(existsSync(`${graders}stopped-for-approval.md`)).toBe(false);
  expect(readFileSync(`${graders}approved-by-rule.md`, "utf8")).toContain("complete-gap-round");
});

test("SP2a: the skill drives the conclave phase", () => {
  const method = skill.slice(skill.indexOf("## The method"), skill.indexOf("## The nine typed"));
  expect(method).toMatch(
    /\| Specify \|[^\n]*\n\| Conclave \|[^\n]*conclave\.md[^\n]*\| `crew decision <id> add`, `crew decide <id> D-n`, `crew objection <id> add\|resolve\|waive`, `crew phase <id> next` \|\n\| Plan \|/,
  );
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toContain("`crew decide`");
  expect(rules).toContain("`crew objection <id> waive`");
  expect(skill).toContain("| Conclave | `references/conclave.md` |");
  const conclave = readReference("conclave.md");
  for (const heading of [
    "Assumed by good practice",
    "Decisions only the user can make",
    "Proposals",
    "Warnings",
  ])
    expect(conclave).toContain(`## ${heading}`);
  expect(conclave).toContain("The debate opens");
  expect(conclave).toContain("SP2b");
  expect(conclave).toContain(
    "The validator never waives an objection and never skips a gate or a test-first record",
  );
  expect(readReference("specify.md")).toContain("--kind observed");
  expect(readReference("build.md")).toContain("crew tdd observed");
});
