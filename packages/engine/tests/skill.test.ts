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
  expect(gate).toMatch(
    /resume the role with SendMessage so the hook files its answer[^\n]*never write it yourself/,
  );
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

test("SP7a AC-4 (Task 6): the plan and build references describe the todo loop: note or merge, gate, brief, two failing rounds wait for a person", () => {
  const plan = readReference("plan.md");
  expect(plan).toContain("## The todo loop");
  expect(plan).toContain("crew task <id> gate T-n");
  expect(plan).toContain("crew task <id> brief T-n");
  expect(plan).toContain("crew task <id> note T-n --criteria AC-k --scope");
  expect(plan).toMatch(/team\.maxGateRounds|Two failing rounds wait for a person/);
  expect(plan).toContain("crew profile set testScoped");
  expect(plan).toMatch(/the leads read the briefs at delivery/);
  const build = readReference("build.md");
  expect(build).toContain("crew task <id> gate T-n");
  expect(build).toContain("crew task <id> brief T-n");
});

test("SP7a AC-3 (Task 5): the understand reference reads the project's decision register before assuming, and the receive reference says start counts it", () => {
  const understand = readReference("understand.md");
  expect(understand).toContain("**Earlier decisions**");
  expect(understand).toContain("`crew decisions`");
  expect(understand).toMatch(/a decision changed is a new decision/);
  expect(understand).toMatch(/never a silent deviation/);
  const receive = readReference("receive.md");
  expect(receive).toMatch(/decision register/);
  expect(receive).toContain("crew decisions");
});

test("SP7a AC-5 (Task 4): the conclave reference launches the leads to validate the spec before the plan, and the deliver reference the delivery", () => {
  const conclave = readReference("conclave.md");
  expect(conclave).toContain("## The leads' validation");
  expect(conclave).toContain("wizardingcode-developer-crew:tech-lead");
  expect(conclave).toContain("crew validation <id> record --what spec");
  expect(conclave).toMatch(/team\.maxValidationRounds/);
  expect(conclave).toMatch(/The plan waits for every lead's `validated`/);
  const deliver = readReference("deliver.md");
  expect(deliver).toContain("--what delivery");
  expect(deliver).toContain("crew validation <id> record");
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

test("SP7a AC-8 (Task 8): the skill page has the Rules row and the twenty rules reference with their enforcement today, within the 0.4.0 size", () => {
  expect(skill).toContain("| Rules | `references/rules.md` |");
  const rules = readReference("rules.md");
  expect(rules).toContain("# The twenty rules");
  for (let n = 1; n <= 20; n++) expect(rules).toMatch(new RegExp(`^${n}\\. \\*\\*`, "m"));
  expect(rules).toContain(
    "Nothing goes to production without tests validated and concrete proof on localhost",
  );
  expect(rules).toContain("A doubt stops the work and asks");
  expect(rules).toContain("High risk waits for a person, even in 24h mode");
  expect(rules).toContain("Deploy is a person's decision");
  // The six rules whose enforcement is partly a later subproject say exactly what the code does today.
  expect(rules).toContain(
    "the secrets scan is a gate; a workaround, dead code or a hardcoded value is a defect of the code-quality rubric, which the skill follows in words",
  );
  expect(rules).toContain(
    "a new high advisory against the base commit blocks through the deps gate when a manifest changed; an older or a moderate one is recorded debt; an unmaintained dependency has no gate, only the researcher's flag",
  );
  expect(rules).toContain(
    "mail never leaves the workspace (the engine's refusal); the knowledge base's confidentiality mark is SP4 and not yet enforced",
  );
  expect(rules).toContain(
    "a ruling is never edited: the engine refuses a contradiction and protects the records it writes, the reviewers' findings files, the rulings and the round copies under `review/` among them (finding 59); `review/ui/` and `review/e2e/` are the session's",
  );
  expect(rules).toContain(
    "in a session nobody watches, a full-route approval runs only with `--mode` and is recorded as the agent's decision, never as a person's; a validator condition Jev disputes refuses the approval and marks the item waiting for the user, and Jev down at a full-route judgement record makes the item wait too (`references/jev.md`)",
  );
  expect(rules).toContain(
    "the deploy denial holds in sessions opened by mail; elsewhere the skill instructs and a person's yes is the gate; the policy key that may allow a deploy is SP7b",
  );
  expect((rules.match(/Enforced by:/g) ?? []).length).toBe(20);
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(9254);
});

test("SP7b-T4 AC-4: the UI/UX rubric needs a console file beside each capture, rule 5 names the e2e gate, and the gate reference says how the run is wired", () => {
  const rubric = readFileSync(
    fileURLToPath(new URL("../../../plugins/core/skills/crew/rubrics/ui-ux.md", import.meta.url)),
    "utf8",
  );
  expect(rubric).toContain(
    "A capture without its console file (console-<page>-<state>.json beside it, saved from the browser's console tool) cannot answer the questions for that page: Not answerable, never passed.",
  );
  const rules = readReference("rules.md");
  expect(rules).toContain(
    "Enforced by: the UI/UX rubric; the e2e gate, which reads console.json (or console.jsonl) and the environment's logs and fails on an error or a warning naming the first; a capture without its console file is not answerable.",
  );
  expect((rules.match(/Enforced by:/g) ?? []).length).toBe(20);
  const gate = readReference("gate.md");
  expect(gate).toContain("WIZARDINGCODE_CREW_E2E_DIR");
  expect(gate).toContain("WIZARDINGCODE_CREW_CONSOLE_FILE");
  expect(gate).toContain("e2e/playwright.mjs");
  expect(gate).toContain("crew skip <id> gate:e2e");
});

test("SP7b-T5 AC-2: rule 10 names the standing grant as the second loosening a policy may carry", () => {
  const rules = readReference("rules.md");
  expect(rules).toContain(
    "Enforced by: the route and the seats; the gate per todo (`crew task <id> gate T-n`) with the judgement gates its files ask for; `team.maxJudgementRounds`, `team.maxValidationRounds` and `team.maxGateRounds` as refusals; `team.continuations: granted` is the second loosening a policy may carry, after `riskPathExclusions`: rounds past a cap up to the cap plus two, each recorded as the user's standing grant.",
  );
  expect((rules.match(/Enforced by:/g) ?? []).length).toBe(20);
});

test("SP7b-T5 AC-3: the gate reference says the engine owns review/ and keeps the round's files, the plan reference says how a todo's judgement runs, rule 14 names the protection, and the README says it in one sentence", () => {
  const gate = readReference("gate.md");
  expect(gate).toContain(
    "The engine owns the files under review/ except ui/ and e2e/: when a file is missing after a role returned (the hook could not read its transcript), resume the role with SendMessage so the hook files its answer, or record the gate --not-run; never write it yourself.",
  );
  expect(gate).toContain(
    "The engine keeps the round's files at the record (<gate>.round<n>.md, ruling.round<n>.json), so a later gate run's reset loses nothing.",
  );
  expect(readReference("plan.md")).toContain(
    "When the todo's files ask for a judgement gate (an interface file: ui-ux; a risk path: security), the gate prints it and cuts the todo's inputs under review/T-n/; launch exactly those reviewers and the judge as for the item and record with crew judgement <id> record --task T-n --ruling <file>; the todo is gated only when every planned judgement is proven.",
  );
  expect(readReference("rules.md")).toContain(
    "Enforced by: the records' order; a ruling is never edited: the engine refuses a contradiction and protects the records it writes, the reviewers' findings files, the rulings and the round copies under `review/` among them (finding 59); `review/ui/` and `review/e2e/` are the session's.",
  );
  const readme = readFileSync(
    fileURLToPath(new URL("../../../README.md", import.meta.url)),
    "utf8",
  );
  expect(readme).toContain(
    "A todo whose files touch a page or a risk path is judged by the reviewers its files ask for before it counts as gated, and a policy may carry a standing grant of two rounds past each cap (team.continuations: granted) so the user is not woken at every cap.",
  );
});

test("SP7b-T5 AC-4: the test-quality rubric asks about fixture names", () => {
  const rubric = readFileSync(
    fileURLToPath(
      new URL("../../../plugins/core/skills/crew/rubrics/test-quality.md", import.meta.url),
    ),
    "utf8",
  );
  expect(rubric).toContain(
    "8. Fixtures: does any fixture name a client, a customer or a real workspace? Fixtures use neutral names (a, b, storefront, crm, shop); a real name is a defect.",
  );
});

test("SP3-T2 AC-3: the skill page has the Analyse row and reference, its fast-route paragraph names the issue's two steps for a fix, and it stays within the 0.4.0 size", () => {
  const method = skill.slice(skill.indexOf("## The method"), skill.indexOf("## The nine typed"));
  expect(method).toMatch(
    /\| Recognize \|[^\n]*\n\| Analyse \|[^\n]*analysis\.md[^\n]*Origin, Cause, Blast radius[^\n]*references\/analyse\.md[^\n]*\n\| Understand \|/,
  );
  expect(skill).toContain("| Analyse | `references/analyse.md` |");
  const fast = skill.slice(
    skill.indexOf("## The fast route"),
    skill.indexOf("## The other routes"),
  );
  expect(fast).toContain(
    "or a fix (an issue: `analysis.md` and a preserve criterion come before build, `references/analyse.md`)",
  );
  const analyse = readReference("analyse.md");
  for (const heading of ["Origin", "Cause", "Blast radius"]) expect(analyse).toContain(heading);
  expect(analyse).toContain("crew analyse <id> --paths");
  expect(analyse).toContain("--kind preserve");
  expect(readReference("receive.md")).toContain("`kind`");
  expect(readReference("receive.md")).toContain("`priority`");
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(9254);
});

test("SP3-T7 AC-1 (finding 92): the page names the request's source on every route, so a ticket or a document reaches crew start --source from the fast route too", () => {
  expect(skill).toMatch(
    /\| Receive \|[^\n]*a ticket or a document[^\n]*`references\/receive\.md`[^\n]*every route/,
  );
  expect(skill).toContain("[--source '<json>']");
  // The fast-route section alone (finding 96): the match stops at the next heading.
  const fast = skill.slice(
    skill.indexOf("## The fast route"),
    skill.indexOf("## The other routes"),
  );
  expect(fast).toMatch(/a sourced request[^\n]*`references\/receive\.md`/);
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(9254);
});

test("SP8-T1 AC-5 (finding 92): rule 5 tells a missing fact of the request (a question) from a design choice (a decision), within the ceiling", () => {
  expect(skill).toMatch(
    /a missing fact of the request is a question[^\n]*`crew question <id> add[^\n]*a design choice is a decision[^\n]*`crew decision <id> add`/,
  );
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(9254);
});
