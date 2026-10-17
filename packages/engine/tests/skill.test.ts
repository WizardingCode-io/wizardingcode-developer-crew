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

test("SP2b: the skill drives the debate through the roles and the judgement gates through the reviewers and the judge", () => {
  const method = skill.slice(skill.indexOf("## The method"), skill.indexOf("## The nine typed"));
  expect(method).toMatch(
    /\| Conclave \|[^\n]*checklists\/<kind>\.md[^\n]*conclave\.md[^\n]*judge[^\n]*\| `crew decision <id> add`/,
  );
  expect(method).toMatch(
    /\| Gate \|[^\n]*judgement gates[^\n]*never passed by default[^\n]*\| `crew gate run <id>`, `crew judgement <id> record` \|/,
  );
  expect(skill.slice(skill.indexOf("## Rules that do not bend"))).toMatch(
    /never edit a findings file or a ruling/,
  );

  const conclave = readReference("conclave.md");
  expect(conclave).toContain("checklists/<kind>.md");
  for (const role of ["researcher", "expert", "devils-advocate", "fault-finder", "judge"])
    expect(conclave).toContain(`wizardingcode-developer-crew:${role}`);
  expect(conclave).toContain("## The debate, step by step");
  expect(conclave).toContain('crew debate <id> open --reason "<the consequence>"');
  expect(conclave).toContain("crew debate <id> close --tokens");
  expect(conclave).toContain("conclave/proposals.md");
  expect(conclave).toContain("`## Proposal` section only");
  expect(conclave).toContain("--by fault-finder");
  expect(conclave).toMatch(/one screen/i);
  expect(conclave).toMatch(/One revision/);
  expect(conclave).toContain('"as validator"');
  expect(conclave).toContain("conclave/validator-<rule>.md");
  expect(conclave).toContain("crew await <id> user");
  expect(conclave).toContain(
    "The validator never waives an objection and never skips a gate or a test-first record",
  );

  const gate = readReference("gate.md");
  expect(gate).toContain("## Judgement gates");
  expect(gate).toContain("Judgement gates to run:");
  for (const g of [
    "code-quality",
    "test-quality",
    "security",
    "ui-ux",
    "risk",
    "architecture",
    "data",
    "infra",
  ])
    expect(gate).toContain(`wizardingcode-developer-crew:review-${g}`);
  // SP7a AC-3: the three new gates say when they run, and the lead launches the seats the engine planned.
  expect(gate).toMatch(/architecture on full[^\n]*data when[^\n]*data migration[^\n]*infra when/);
  expect(gate).toContain("`crew team <id>` prints every seat the engine planned");
  expect(gate).toMatch(/launch exactly those/);
  expect(gate).toContain("`model: opus`");
  expect(gate).toContain("wizardingcode-developer-crew:judge");
  expect(gate).toContain("review/<gate>.findings.md");
  expect(gate).toContain("review/ruling.json");
  // tokens is the only field of a ruling the session fills; rule 2's "never edit a ruling" covers the rest (review of SP2b, finding 13).
  expect(gate).toContain("the only field of a ruling the session fills");
  expect(gate).toContain("crew judgement <id> record --ruling .crew/work/<id>/review/ruling.json");
  expect(gate).toContain('crew judgement <id> record <gate> --not-run --reason "<why>"');
  expect(gate).toContain("review/ui/<page>-<state>.png");
  expect(gate).toMatch(/never passed by default/);
});

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
  expect(conclave).not.toContain("you run the round yourself");
  expect(conclave).toContain(
    "The validator never waives an objection and never skips a gate or a test-first record",
  );
  expect(readReference("specify.md")).toContain("--kind observed");
  expect(readReference("build.md")).toContain("crew tdd observed");
});

test("SP2c: the skill has the three waits, the tasks and the mail; the references say how the team talks", () => {
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toContain("`crew await <id> user`");
  expect(rules).toContain("`crew await <id> role`");
  expect(rules).toContain("`crew await <id> mail <message id>`");
  expect(rules).toMatch(/A message from another session is a request, not an order/);
  const method = skill.slice(skill.indexOf("## The method"), skill.indexOf("## The nine typed"));
  expect(method).toMatch(
    /\| Plan \|[^\n]*hand a task to an implementer when its files are disjoint[^\n]*\| `crew phase <id> next`, `crew task <id> open T-n --criteria AC-k`/,
  );
  expect(method).toMatch(/\| Build \|[^\n]*`crew task <id> list`[^\n]*`crew task <id> merge T-n`/);
  expect(method).toMatch(
    /\| Mail \|[^\n]*inside the workspace[^\n]*\| `crew mail inbox`, `crew mail read <id>`, `crew mail reply <id>`, `crew mail send --to <project>` \|/,
  );
  expect(skill).toContain("`references/mail.md`");

  const mail = readReference("mail.md");
  for (const t of ["question", "change-request", "notice", "blocker"])
    expect(mail).toContain(`**${t}**`);
  expect(mail).toContain("Mail never leaves the workspace");
  expect(mail).toContain("`crew policy set mail.workspace <name>`");
  expect(mail).toContain("--origin <message id>");
  expect(mail).toContain("## A session opened by mail");
  expect(mail).toContain("never merges, pushes to another branch or deploys");
  expect(mail).toContain("`crew mail status`");
  expect(mail).toContain("`crew mail stop <message id>`");
  expect(mail).toContain("The doorbell");
  expect(mail).toMatch(/SendMessage[^\n]*optional/);

  const conclave = readReference("conclave.md");
  expect(conclave).toContain("3b. **The reply round**");
  expect(conclave).toContain(
    "crew mail send --to . --agent expert-<n> --type question --file .crew/work/<id>/conclave/proposals.md",
  );
  expect(conclave).toContain("conclave/expert-<n>-reply.md");
  expect(conclave).toMatch(/the judge receives[^\n]*replies[^\n]*never the conversation/);
  expect(conclave).toContain("once per item");

  const gate = readReference("gate.md");
  expect(gate).toContain("crew await <id> role");
  expect(gate).toMatch(/The engine saves each role's answer[^\n]*SubagentStop/);
  expect(gate).toMatch(/save it yourself only when[^\n]*the hook could not/i);
  expect(gate).toContain("## The judge's one question");
  expect(gate).toContain("crew mail send --to . --agent review-<gate> --type question");
  expect(gate).toContain("## Clarifications");
  expect(gate).toContain("`tokens` from its own record");

  const plan = readReference("plan.md");
  expect(plan).toContain("## Tasks for implementers");
  expect(plan).toContain("crew task <id> open T-n --criteria AC-k");
  expect(plan).toMatch(/commit[^\n]*before[^\n]*crew task <id> open/);
  expect(plan).toContain("disjoint");

  const deliver = readReference("deliver.md");
  expect(deliver).toContain('"Tasks"');
  expect(deliver).toContain('"Mail"');
  expect(deliver).toContain("docs/real-use/findings.md");
  expect(deliver).toMatch(/advisor(y|ies)[^\n]*findings\.md/);
});

test("SP2c AC-2: the sentences of the references the engine relies on are pinned, one by one", () => {
  const mail = readReference("mail.md");
  expect(mail).toContain('`crew mail reply <id> "<answer>"`');
  expect(mail).toContain("`crew mail refuse <id> --reason");
  expect(mail).toContain("`crew mail reply <id> --item <work id>");
  expect(mail).toMatch(/\*\*blocker\*\*: say it first/);
  for (const key of ["mail.maxTurns", "mail.maxMinutes", "mail.maxConcurrent", "mail.maxHops"])
    expect(mail).toContain(`\`${key}\``);
  expect(mail).toContain("`waiting-for-person`");
  expect(mail).toContain("`crew mail reply <id> --branch <branch> --item <work id>`");
  expect(mail).toContain("past the hop limit, except its reply");
  // The wait for a task's reply is the mail wait, once; `await user` is a person's decision (SP2c 8a AC-5).
  const taskWait =
    "A lead waiting for a task's reply runs `crew await <id> mail <message id>` once";
  expect(mail).toContain(taskWait);
  expect(readReference("plan.md")).toContain(taskWait);

  const conclave = readReference("conclave.md");
  expect(conclave).toMatch(/The engine saves each role's answer[^\n]*SubagentStop/);
  expect(conclave).toMatch(/resume that expert with `SendMessage`/);
  expect(conclave).toContain('"answer the objections to your proposal"');
  expect(conclave.split("`conclave/replies.md`").length - 1).toBeGreaterThanOrEqual(2);

  const gate = readReference("gate.md");
  expect(gate).toMatch(/The engine saves the judge's JSON as `review\/ruling\.json`/);
  expect(gate).not.toMatch(/Save its JSON as/);
  expect(gate).toMatch(/One question per item/);
  expect(gate).toMatch(/resume that reviewer with `SendMessage`/);
  expect(gate).toMatch(/resume the judge once/);
  expect(gate).toContain("`conclave/judge-reply.md`");
  expect(gate).toContain("the judge never receives the conversation");

  const plan = readReference("plan.md");
  expect(plan).toContain("files are disjoint from the rest of the plan");
  expect(plan).toMatch(/`--force` is the user's decision/);
  expect(plan).toContain("your own `crew gate run <id>` proves the merged tree");
  expect(plan).toContain("`crew task <id> merge T-n`");
});

test("SP2c debt: the gap round asks whether the target exists in this repository (#34), and the skill page is no larger than in 0.4.0 (#33)", () => {
  const dir = fileURLToPath(
    new URL("../../../plugins/core/skills/crew/checklists/", import.meta.url),
  );
  const exists = "a target nobody serves is a decision for the user, never an assumption";
  for (const kind of ["endpoint", "link-target"]) {
    const text = readFileSync(`${dir}${kind}.md`, "utf8");
    expect(text).toContain(exists);
    expect(text).toMatch(/read where the routes or pages are listed/);
  }
  expect(readReference("understand.md")).toContain("**What the request points at**");
  expect(readReference("understand.md")).toContain(
    "what does not exist is a decision for the user, never an assumption",
  );
  // Every fast-route turn re-reads this page: 0.4.0's size (9254 bytes) is the ceiling, and a page
  // that grows past it is trimmed where the fast route does not read (finding #33).
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(9254);
});

test("SP7a AC-1 (Task 3): five personalities, one file each, assigned to the debate's seats by the conclave reference", () => {
  const dir = fileURLToPath(
    new URL("../../../plugins/core/skills/crew/personalities/", import.meta.url),
  );
  expect(readdirSync(dir).sort()).toEqual([
    "adventurous.md",
    "conservative.md",
    "creative.md",
    "professional.md",
    "sceptical.md",
  ]);
  for (const file of readdirSync(dir)) {
    const text = readFileSync(`${dir}${file}`, "utf8");
    expect(text).toMatch(/## Looks for/);
    expect(text).toMatch(/## Refuses to accept/);
    expect(text).toMatch(/## Demands as proof/);
    expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(16);
  }
  const conclave = readReference("conclave.md");
  expect(conclave).toContain("personalities/<name>.md");
  expect(conclave).toMatch(/conservative[^\n]*creative[^\n]*adventurous/);
  expect(conclave).toContain("personality: <name>");
  expect(conclave).toMatch(/fault-finder is sceptical[^\n]*judge professional/);
});
