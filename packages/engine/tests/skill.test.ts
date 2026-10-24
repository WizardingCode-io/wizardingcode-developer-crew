import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { guaranteeLines, RUNTIME_NAMES, RUNTIMES } from "../src/runtimes.ts";
import { SKILL_PAGE_MAX_BYTES } from "./helpers.ts";

/** A repository path, absolute, by its path from the repository's root. */
const repoPath = (path: string): string =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));

/** A repository file's text by its path from the repository's root. */
const repoFile = (path: string): string => readFileSync(repoPath(path), "utf8");

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
  const dir = repoPath("plugins/core/skills/crew/checklists/");
  expect(readdirSync(dir).sort()).toEqual(KINDS.map((k) => `${k}.md`).sort());
  for (const kind of KINDS) {
    const text = repoFile(`plugins/core/skills/crew/checklists/${kind}.md`);
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

const skill = repoFile("plugins/core/skills/crew/SKILL.md");

test("the rules say the agent never asks the user to run a crew command, and name the sessions with no person", () => {
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toMatch(/never ask the user to run a `crew` command/i);
  expect(rules).toMatch(/headless/);
  expect(rules).toMatch(/bypassPermissions or dontAsk/);
  expect(rules).toMatch(/auto mode/);
});

test("the rules say one session per checkout, a worktree for each lane", () => {
  // Session lanes (2026-10-23-001): the guard refuses beside a live neighbour, so rule 8 names the
  // way out and the merge, the wording of the item's Design.
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toContain(
    "One session per checkout:** the guard refuses crew start and edits beside a live neighbour; move into a worktree of your own (EnterWorktree), work there, and merge the lane's branch from the main checkout when the engine's notice says it is proven.",
  );
});

function readReference(name: string): string {
  return repoFile(`plugins/core/skills/crew/references/${name}`);
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
  const graders = repoPath("plugins/core/evals/risk-escalation/graders/");
  expect(existsSync(`${graders}stopped-for-approval.md`)).toBe(false);
  expect(repoFile("plugins/core/evals/risk-escalation/graders/approved-by-rule.md")).toContain(
    "complete-gap-round",
  );
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
    /\| Plan \|[^\n]*to an implementer if disjoint[^\n]*`crew task <id> open T-n --criteria AC-k`/,
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
  const exists = "a target nobody serves is a decision for the user, never an assumption";
  for (const kind of ["endpoint", "link-target"]) {
    const text = repoFile(`plugins/core/skills/crew/checklists/${kind}.md`);
    expect(text).toContain(exists);
    expect(text).toMatch(/read where the routes or pages are listed/);
  }
  expect(readReference("understand.md")).toContain("**What the request points at**");
  expect(readReference("understand.md")).toContain(
    "what does not exist is a decision for the user, never an assumption",
  );
  // Every fast-route turn re-reads this page: 0.4.0's size (9254 bytes) is the ceiling, and a page
  // that grows past it is trimmed where the fast route does not read (finding #33).
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
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
  const dir = repoPath("plugins/core/skills/crew/personalities/");
  expect(readdirSync(dir).sort()).toEqual([
    "adventurous.md",
    "conservative.md",
    "creative.md",
    "professional.md",
    "sceptical.md",
  ]);
  for (const file of readdirSync(dir)) {
    const text = repoFile(`plugins/core/skills/crew/personalities/${file}`);
    expect(text).toMatch(/^## Looks for$/m);
    expect(text).toMatch(/^## Refuses to accept$/m);
    expect(text).toMatch(/^## Demands as proof$/m);
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
    "mail never leaves the workspace (the engine's refusal); every knowledge entry enters marked with its origin workspace, and one rule (`visibleTo`) decides what a project reads",
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
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
});

test("SP7b-T4 AC-4: the UI/UX rubric needs a console file beside each capture, rule 5 names the e2e gate, and the gate reference says how the run is wired", () => {
  const rubric = repoFile("plugins/core/skills/crew/rubrics/ui-ux.md");
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
  const readme = repoFile("README.md");
  expect(readme).toContain(
    "A todo whose files touch a page or a risk path is judged by the reviewers its files ask for before it counts as gated, and a policy may carry a standing grant of two rounds past each cap (team.continuations: granted) so the user is not woken at every cap.",
  );
});

test("SP7b-T5 AC-4: the test-quality rubric asks about fixture names", () => {
  const rubric = repoFile("plugins/core/skills/crew/rubrics/test-quality.md");
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
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
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
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
});

test("SP8-T1 AC-5 (finding 92): rule 5 tells a missing fact of the request (a question) from a design choice (a decision), within the ceiling", () => {
  expect(skill).toMatch(
    /a missing fact of the request is a question[^\n]*`crew question <id> add[^\n]*a design choice is a decision[^\n]*`crew decision <id> add`/,
  );
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
});

test("SP8-T3: the skill page has the Strategy row between Understand and Specify and the strategy reference, the reference carries the two rules of discernment and rule 3's line, the rubric asks the five questions, and the page stays within the ceiling", () => {
  const method = skill.slice(skill.indexOf("## The method"), skill.indexOf("## The nine typed"));
  expect(method).toMatch(
    /\| Understand \|[^\n]*\n\| Strategy \|[^\n]*new project[^\n]*`references\/strategy\.md`[^\n]*\| `crew strategy <id> check`[^\n]*\n\| Specify \|/,
  );
  expect(skill).toContain("| Strategy | `references/strategy.md` |");
  const strategy = readReference("strategy.md");
  for (const text of [
    "Viability",
    "Scaling phases",
    "[R<n>]",
    "crew strategy <id> check",
    "crew research <id> verify",
    "over-engineering",
    "point by point",
    "from the research and the base",
    "remote test environment",
    "crew judgement <id> record",
  ])
    expect(strategy).toContain(text);
  const rubric = repoFile("plugins/core/skills/crew/rubrics/strategy.md");
  for (const word of ["proportion", "proof", "measured", "trigger", "point by point"])
    expect(rubric.toLowerCase()).toContain(word);
  expect(readReference("conclave.md")).toMatch(/new project[^\n]*resumed/);
  expect(readReference("understand.md")).toContain("references/strategy.md");
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
});

test("SP4-T4 AC-6: the skill page has the Learn row and the two verbs within the ceiling, the learn reference says what is written and refused, and deliver hands off to learn", () => {
  expect(skill).toContain("| Learn |");
  expect(skill).toContain("`crew learn <id>`");
  expect(skill).toContain("`crew knowledge <id> lookup`");
  expect(skill).toContain("| Learn | `references/learn.md` |");
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
  const learn = readReference("learn.md");
  for (const phrase of [
    "validated-solution",
    "root-cause",
    "--confirm K-n",
    "crew knowledge contradict",
    "notice",
    "secrets scanner",
    "an audit learns nothing",
  ])
    expect(learn).toContain(phrase);
  expect(readReference("deliver.md")).toContain("crew learn <id>");
});

test("SP4-T5 AC-8: the CTO's page names the inputs file and the cycles it reads, analyse.md says a known root cause is cited or contradicted before the next phase, and rules.md says how rule 17 is enforced", () => {
  const cto = repoFile("plugins/core/agents/cto.md");
  expect(cto).toContain("`~/.wizardingcode/crew/cto/<ws>/<date>-inputs.json`");
  expect(cto).toContain("## The learning cycles");
  for (const phrase of [
    "entries never confirmed",
    "entries contradicted",
    "what the workspace reuses most",
  ])
    expect(cto).toContain(phrase);
  const analyse = readReference("analyse.md");
  expect(analyse).toContain('known root causes: K-4 "<title>" (src/accounts.mjs)');
  expect(analyse).toContain(
    'A known root cause is cited in `analysis.md` as `[K:K-4]` with what this fix does differently, or contradicted on record with `crew knowledge contradict K-4 --reason "<why>" --item <id>`',
  );
  expect(analyse).toContain(
    "the guard out of this phase refuses `crew phase <id> next` while it is neither",
  );
  const rules = readReference("rules.md");
  expect(rules).toContain(
    "17. **Learn once.** The root cause of each issue goes to the knowledge base; the same mistake twice is the system's failure. Enforced by: the Learn phase writes the cause once (`crew learn`, a cause the base already holds refused unless confirmed); `crew analyse` names a known root cause of the origin's paths and records it in `origin.json`; the guard out of Analyse refuses the next phase until it is cited in `analysis.md` as `[K:<id>]` with what the fix does differently, or contradicted on record by this item",
  );
});

test("SP6-T1 AC-4 (finding 109): the fast route's first step names --observed beside --preserve, within the ceiling", () => {
  expect(skill).toContain(
    '`--preserve "<text>"` for what stays green, proven with `tdd before` and `tdd after`; `--observed "<text>"` for what a person checks, proven with `tdd observed`)',
  );
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
});

test("SP6-T1 AC-7 (finding 109): the evals README states the needs-rerun rule", () => {
  const readme = repoFile("plugins/core/evals/README.md");
  expect(readme).toContain(
    "A run the runner flags `needs-rerun` is run once more; a second flag is recorded in the results note and the run stands.",
  );
});

test("SP6-T2 AC-10 (carrying AC-7's pins with a red): the packs reference, the conclave's reads from the engine, the expert's Knowledge paragraph, rule 10's line and ADR 0010, and round 3's statements", () => {
  expect(skill).toContain("| Packs | `references/packs.md` |");
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
  const packs = repoFile("plugins/core/skills/crew/references/packs.md");
  for (const phrase of [
    "crew pack add <path>",
    "crew pack files checklists <kind>",
    "crew pack files knowledge --item <id>",
    "changed since registration",
    "crew profile confirm",
    "scanned for secrets, not for instructions",
    "folded in only with proof",
    // Round 3: the hold on every runner and on crew tdd, the profile's line, the complete rollback.
    "`crew tdd red|green` without `--` refuses to run it with the same text",
    "`crew profile` prints `testScoped=<cmd>`",
    "the complete way is `crew pack remove <name>` and `crew detect --refresh`",
    "a removed pack's proposed commands and scoped template leave the profile at the next detection",
    '`crew profile set testScoped "<cmd>"` the template',
  ])
    expect(packs, phrase).toContain(phrase);
  const conclave = repoFile("plugins/core/skills/crew/references/conclave.md");
  expect(conclave).toContain("crew pack files checklists <kind>");
  expect(conclave).toContain("crew pack files knowledge --item <id>");
  const expert = repoFile("plugins/core/agents/expert.md");
  expect(expert).toContain("## Knowledge");
  const rules = repoFile("plugins/core/skills/crew/references/rules.md");
  expect(rules).toContain(
    "A pack's template tightens the registry and never loosens it, and a pack's gate command runs only once a person confirmed it (SP6)",
  );
  expect(repoFile("docs/adr/0010-packs-as-data-served-by-the-engine.md")).toContain(
    "# ADR 0010: packs are data the engine serves",
  );
});

test("SP6-T2 AC-9: the packs reference states the rollback before a downgrade and the configuration directory discovery reads; ADR 0010 says the same of the downgrade", () => {
  const packs = repoFile("plugins/core/skills/crew/references/packs.md");
  expect(packs).toContain("before a downgrade to 0.10.0");
  expect(packs).toContain(
    "the config dir being `CLAUDE_CONFIG_DIR` when set and `<HOME>/.claude` otherwise",
  );
  expect(repoFile("docs/adr/0010-packs-as-data-served-by-the-engine.md")).toContain(
    "`references/packs.md` says what to unset or remove before a downgrade; a removed pack's proposed commands and scoped template leave the profile at the next detection.",
  );
});

test("SP6-T3 AC-5: the README's Packs section and the vision's §11 say what shipped", () => {
  const readme = repoFile("README.md");
  expect(readme).toContain("\n## Packs\n");
  const packs = readme.slice(
    readme.indexOf("\n## Packs\n"),
    readme.indexOf("\n## Where state lives\n"),
  );
  for (const phrase of [
    "`wizardingcode-pack-laravel`",
    "`wizardingcode-pack-agentic-os`",
    "claude plugin install wizardingcode-pack-laravel@wizardingcode-plugins",
    "`crew pack add <path>`",
    "runs only once a person confirmed it",
    "ships with the cases that show its difference",
  ])
    expect(packs, phrase).toContain(phrase);
  const vision = repoFile("docs/vision.md");
  expect(vision).toContain("The engine serves packs since 0.11.0");
  expect(vision).toContain(
    "The first two packs are in this repository under `packs/`: `wizardingcode-pack-laravel` (a stack pack) and `wizardingcode-pack-agentic-os` (a team pack)",
  );
});

/** The guarantee lines a document lists under a runtime's heading (`### <label>`), as `- <line>` bullets. */
function documentedGuarantees(text: string, label: string): string[] {
  const at = text.indexOf(`### ${label}\n`);
  if (at === -1) return [];
  const rest = text.slice(at + `### ${label}\n`.length);
  const end = rest.search(/^#{1,3} /m);
  return (end === -1 ? rest : rest.slice(0, end))
    .split("\n")
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2));
}

test("SP6-T4 AC-7: the runtimes reference, the launch sentence in gate.md and conclave.md, the Runtimes row within the ceiling, the README's and the reference's guarantee tables equal to the engine's, the vision's seven-row table and single reference, ADR 0011", () => {
  expect(skill).toContain("| Runtimes | `references/runtimes.md` |");
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
  const launch =
    "Launch the role: in Claude Code one Agent call by its scoped name; in another runtime as `references/runtimes.md` says, and file its answer with `crew answer file` where the table says the filing is requested.";
  expect(repoFile("plugins/core/skills/crew/references/gate.md")).toContain(launch);
  expect(repoFile("plugins/core/skills/crew/references/conclave.md")).toContain(launch);
  const reference = repoFile("plugins/core/skills/crew/references/runtimes.md");
  const readme = repoFile("README.md");
  for (const phrase of [
    "crew runtime install <name>",
    "crew runtime check <name>",
    "crew answer file <id> --role <role> --file <path>",
    "an `ask` the engine answers becomes a `deny`",
    "the person runs it",
    "`*** Begin Patch`",
    "`loop_limit: null`",
    "Antigravity CLI",
    "fails closed",
    "eight consecutive",
    "the engine's own cap of three",
    "`crew-method`",
    "`crew-<role>`",
    "`crew pack add <path>`",
    "exit 1",
    "never from a command",
    "denied where nobody watches, in a session opened by mail and on Copilot, which answers every ask of the engine as a deny",
    "denied on Copilot, where an ask is a deny",
  ])
    expect(reference, phrase).toContain(phrase);
  for (const name of RUNTIME_NAMES) {
    const runtime = RUNTIMES[name];
    expect(documentedGuarantees(reference, runtime.label), `${name} in the reference`).toEqual(
      guaranteeLines(runtime),
    );
    expect(documentedGuarantees(readme, runtime.label), `${name} in the README`).toEqual(
      guaranteeLines(runtime),
    );
  }
  expect(readme).toContain("\n## Runtimes\n");
  const vision = repoFile("docs/vision.md");
  expect(vision).toContain(
    "| Guarantee | Claude Code | Codex CLI | Cursor | GitHub Copilot CLI | Gemini CLI | OpenCode |",
  );
  for (const what of [
    "context at start",
    "the status line per prompt",
    "the denial of engine files",
    "the denial of forbidden commands",
    "the hold at Stop",
    "the roles' answers filed",
    "the roles read-only",
  ])
    expect(vision, what).toContain(`| ${what} |`);
  expect(vision).not.toContain("each runtime gets a small mapping file");
  expect(vision).toContain("one reference, `references/runtimes.md`, serves every runtime");
  const adr = repoFile("docs/adr/0011-runtime-adapters.md");
  expect(adr).toContain(
    "# ADR 0011: runtime adapters, one table and the plugin folder as the distribution",
  );
  expect(adr).toContain(
    "one reference for every runtime in place of the mapping file per runtime the vision's §13 named",
  );
  // The ADR holds the decisions and points to the module for the reading's grammar; the shared-rule
  // changes that reach Claude Code are a consequence; the findings carry the delivered reading of a
  // patch and the debt.
  expect(adr).toContain(
    "the reading's grammar, form by form, is the module comment of `packages/engine/src/hooks/powershell.ts`",
  );
  expect(adr).toContain(
    "The rules every runtime shares changed with the item, Claude Code included",
  );
  const findings = repoFile("docs/real-use/findings.md");
  expect(findings).toContain("reads it as a `Write` whose paths are every path a hunk names");
  expect(findings).toContain(
    "### 114. SP6 Task 4 (`2026-10-20-008`): the Copilot tier moved to requested, the PowerShell layer, and the debt that stands",
  );
});

test("SP6-T5 AC-5, AC-10: docs/benchmark/README.md has its four parts, the README's Benchmark section names the command and the records folder, the evals README names the tag and the set, and none of them types a figure", () => {
  const bench = repoFile("docs/benchmark/README.md");
  for (const heading of [
    "## What it measures",
    "## How to run it",
    "## How to read a record",
    "## What it does not measure",
  ])
    expect(bench, heading).toContain(heading);
  expect(bench).toContain("bun scripts/benchmark.ts");
  // AC-20: the cost is read in the newest record, never typed here.
  expect(bench).toContain("The cost of a run is what the newest record here says.");
  const readme = repoFile("README.md");
  const start = readme.indexOf("\n## Benchmark\n");
  expect(start).toBeGreaterThan(0);
  const section = readme.slice(start, readme.indexOf("\n## ", start + 5));
  expect(section).toContain("bun scripts/benchmark.ts");
  expect(section).toContain("docs/benchmark/");
  const evals = repoFile("plugins/core/evals/README.md");
  expect(evals).toContain("`benchmark`");
  expect(evals).toContain("benchmark.json");
  const benchLines = evals
    .split("\n")
    .filter((line) => /benchmark/i.test(line))
    .join("\n");
  // No figure typed by hand: no USD, no dollar amount, no percentage, no rate as a fraction or a
  // decimal between 0 and 1; the figures are the newest record's.
  for (const [name, text] of [
    ["docs/benchmark/README.md", bench],
    ["the README's Benchmark section", section],
    ["the evals README's benchmark lines", benchLines],
  ] as const) {
    expect(text, name).not.toMatch(/USD/);
    expect(text, name).not.toMatch(/\$\s?\d/);
    expect(text, name).not.toMatch(/\d\s?%/);
    expect(text, name).not.toMatch(/\b0\.\d+\b/);
    expect(text, name).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
  }
});

test("SP6-T6 AC-8, AC-23: the records of 0.11.0 hold their exact strings: the vision's status line, the README's release paragraph and its links to the benchmark and evals records, the real-use README's phase after 0.11.0 with its exit, the pack READMEs naming the evals record", () => {
  expect(repoFile("docs/vision.md")).toContain("0.11.0 (2026-10-21) is SP6, released");
  const readme = repoFile("README.md");
  expect(readme).toContain("Release 0.11.0 (2026-10-21) is SP6");
  const link = readme.match(/docs\/benchmark\/\d{4}-\d{2}-\d{2}-0\.11\.0\.md/)?.[0];
  expect(link).toBeDefined();
  expect(existsSync(repoPath(`${link}`)), link).toBe(true);
  expect(readme).toContain("docs/evals/2026-10-21-sp6-results.md");
  const realUse = repoFile("docs/real-use/README.md");
  expect(realUse).toContain("\n## The phase after 0.11.0\n");
  expect(realUse).toContain(
    "Exit: no `blocks` or `false-proof` finding open, and 1.0 cut from it (ADR 0004, ADR 0008).",
  );
  for (const pack of ["laravel", "agentic-os"])
    expect(repoFile(`packs/${pack}/README.md`), pack).toContain(
      "docs/evals/2026-10-21-sp6-results.md",
    );
  expect(existsSync(repoPath("docs/evals/2026-10-21-sp6-results.md"))).toBe(true);
});

test("finding 121: the skill page's front matter is strict YAML (Bun.YAML), with the name crew-method and the description's text unchanged", () => {
  // Copilot CLI 1.0.101 refused the copied page: an unquoted description holding ": " is read as a
  // nested mapping by a strict parser, so the method never reached the Copilot agent.
  const match = /^---\n([\s\S]*?)\n---\n/.exec(skill);
  if (!match?.[1]) throw new Error("the skill page has no front matter");
  const parsed = Bun.YAML.parse(match[1]) as Record<string, unknown>;
  expect(Object.keys(parsed)).toEqual(["name", "description"]);
  expect(parsed.name).toBe("crew-method");
  expect(parsed.description).toBe(
    "Use when the user asks for a code change in this repository: a fix, a feature, a refactor, a chore, a new product or an audit of the codebase. Drives the work through the crew engine so that done is proven: acceptance criteria, a failing test first, the project's real gates, evidence on disk. Not for questions that need no change.",
  );
});

test("AC-1 (finding 121's debt): every shipped front matter is strict YAML, the skill page and the fifteen agent pages, with the descriptions of cto.md and review-risk.md quoted", () => {
  const agents = repoPath("plugins/core/agents/");
  const pages = readdirSync(agents)
    .filter((f) => f.endsWith(".md"))
    .sort();
  expect(pages).toHaveLength(15);
  const frontMatter = (text: string): Record<string, unknown> => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
    if (!match?.[1]) throw new Error("no front matter");
    return Bun.YAML.parse(match[1]) as Record<string, unknown>;
  };
  for (const page of pages) {
    const text = repoFile(`plugins/core/agents/${page}`);
    const parsed = frontMatter(text);
    expect(parsed.name, page).toBe(page.replace(/\.md$/, ""));
    expect(typeof parsed.description, page).toBe("string");
    expect(String(parsed.description).length, page).toBeGreaterThan(40);
    expect(typeof parsed.tools, page).toBe("string");
    if ("model" in parsed) expect(typeof parsed.model, page).toBe("string");
  }
  // The two pages whose descriptions hold ": " are quoted the way the generators quote them, so
  // a strict loader reads one string, not a nested mapping (finding 121).
  for (const page of ["cto.md", "review-risk.md"]) {
    const line = repoFile(`plugins/core/agents/${page}`).split("\n")[2] ?? "";
    expect(line.startsWith('description: "'), page).toBe(true);
    expect(line.endsWith('"'), page).toBe(true);
  }
  expect(Object.keys(frontMatter(skill))).toEqual(["name", "description"]);
});

test("AC-5 (finding 119): the conclave and deliver references say where a resumed lead's answer lands and that the record is taken from that file", () => {
  const conclave = repoFile("plugins/core/skills/crew/references/conclave.md");
  const deliver = repoFile("plugins/core/skills/crew/references/deliver.md");
  // The sentences' subjects and verbs, not the sentences verbatim (items C2a and C2b): a
  // rewording that keeps the instruction keeps these; one that drops or inverts it fails.
  for (const fragment of [
    "A lead resumed for another round answers into `conclave/lead-<team>-reply.md`",
    "the earlier reply archived beside it as `.round<n>.md`",
    "record that file, never the round-1 file",
    "the engine refuses a file whose content it already recorded for that lead",
  ])
    expect(conclave, fragment).toContain(fragment);
  for (const fragment of [
    "a resumed lead's answer lands in `conclave/lead-<team>.delivery-reply.md`",
    "the earlier reply archived beside it as `.round<n>.md`",
    "record that file, since the engine refuses one it already recorded",
  ])
    expect(deliver, fragment).toContain(fragment);
});

// The outside testers of the other runtimes (the user's decision of 2026-10-21, item 2026-10-21-006):
// the runtime report template and the README's paragraph for them.

test("testers AC-1: the runtime report template is strict YAML, its dropdown lists the engine's runtimes in the table's order, and it asks for what a report needs", () => {
  const form = Bun.YAML.parse(repoFile(".github/ISSUE_TEMPLATE/runtime-report.yml")) as {
    name: string;
    description: string;
    labels?: string[];
    body: Array<{
      type: string;
      id?: string;
      attributes: Record<string, unknown>;
      validations?: { required?: boolean };
    }>;
  };
  expect(form.name).toBe("Runtime report");
  expect(form.labels).toEqual(["runtime"]);
  const byId = Object.fromEntries(form.body.filter((f) => f.id).map((f) => [f.id, f]));
  expect(byId.runtime?.type).toBe("dropdown");
  expect(byId.runtime?.attributes.options).toEqual(RUNTIME_NAMES.map((n) => RUNTIMES[n].label));
  for (const id of [
    "runtime",
    "runtime-version",
    "crew-version",
    "check",
    "command",
    "happened",
    "expected",
  ]) {
    expect(byId[id]?.validations?.required, id).toBe(true);
  }
  expect(byId.log?.type).toBe("textarea");
  expect(byId.log?.validations?.required ?? false).toBe(false);
  expect(String(byId["crew-version"]?.attributes.label)).toContain("crew --version");
  expect(String(byId.check?.attributes.label)).toContain("crew runtime check <name>");
  const config = Bun.YAML.parse(repoFile(".github/ISSUE_TEMPLATE/config.yml")) as {
    blank_issues_enabled: boolean;
    contact_links: Array<{ name: string; url: string; about: string }>;
  };
  expect(config.blank_issues_enabled).toBe(true);
  expect(config.contact_links.map((l) => l.url)).toContain(
    "https://github.com/WizardingCode-io/wizardingcode-developer-crew/blob/main/README.md#runtimes",
  );
});

test("testers AC-2: the README tells a tester how to install, check, run a first session and report, and the real-use README records the decision", () => {
  const readme = repoFile("README.md");
  const section = readme.slice(readme.indexOf("## Runtimes"), readme.indexOf("## Benchmark"));
  expect(section).toContain("**Testing on another runtime.**");
  for (const sentence of [
    "`crew runtime install <name>`",
    "`crew runtime check <name>`",
    "`crew --version`",
    "an ask becomes a deny",
    "`.github/ISSUE_TEMPLATE/runtime-report.yml`",
    "https://github.com/WizardingCode-io/wizardingcode-developer-crew/issues/new?template=runtime-report.yml",
    "Each report is a finding of the real-use phase",
  ]) {
    expect(section, sentence).toContain(sentence);
  }
  expect(repoFile("docs/real-use/README.md")).toContain(
    "By the user's decision of 2026-10-21, the sessions on Codex CLI, Cursor, Gemini CLI and OpenCode are run by outside testers from the release asset",
  );
});

test("CON1-AC-1 (finding 51): gate.md names what the architecture, data and infra reviewers receive, and seats data and infra on the full route with infra's trigger", () => {
  const gate = readReference("gate.md");
  expect(gate).toContain(
    "architecture, the path of `spec.md` and where the project keeps its base (its architecture document, its data model, its contracts)",
  );
  expect(gate).toContain(
    "data and infra, their risk areas (`data-migration`, with `personal-data` when present; `infra`) and the paths that raised each",
  );
  expect(gate).toContain(
    "data when the change touches a data migration, on the full route (ETL's seat)",
  );
  expect(gate).toContain(
    "infra when it touches infrastructure (a CI pipeline, a container, Terraform, Kubernetes or Helm, a deploy script), on the full route (DevOps's seat)",
  );
});

test("CON1-AC-4 (finding 61): plan.md makes a request in parts done in this checkout one item with a todo per part", () => {
  const plan = readReference("plan.md");
  expect(plan).toContain(
    "A request in several parts done in this checkout, one after the other, is one item with a todo per part, never an item per part:",
  );
  expect(plan).toContain(
    "a separate item is for a part the user wants proven and delivered on its own.",
  );
});

test("CON1-AC-5 (finding 62): conclave.md debates a choice the user left to the team, and the risk-area triggers stand", () => {
  const conclave = readReference("conclave.md");
  expect(conclave).toContain(
    'A choice the user\'s words leave to the team ("the team decides", "your call", "debate it") is debated, not asked: those words are the decision to debate, and the reason names them.',
  );
  expect(conclave).toContain(
    "It never stands for a decision whose answer changes a risk area: that one is still the user's.",
  );
  expect(conclave).toContain(
    "a decision whose answer changes a risk area (who holds a permission, what is hard-deleted, which side of a conflict wins), or the user asking for it.",
  );
  // The risk areas' examples are given once, where the triggers are listed.
  expect(
    conclave.split("(who holds a permission, what is hard-deleted, which side of a conflict wins)"),
  ).toHaveLength(2);
});

test("CON1-AC-6 (finding 31): mail.md names mail.worktrees, and gate.md and mail.md point to rule 5 for when a wait clears", () => {
  const mail = readReference("mail.md");
  const gate = readReference("gate.md");
  expect(mail).toMatch(
    /`maxConcurrent` 2, `maxHops` 2, `maxTurns` 40, `maxMinutes` 30, `worktrees`/,
  );
  expect(mail).not.toContain("The reply clears the wait");
  expect(gate).not.toContain("the engine clears the wait when the judge has answered");
  for (const text of [mail, gate])
    expect(text).toContain("rule 5 of the skill page says when the wait clears");
});

test("CON5-AC-8-plan (finding 30): plan.md's todo loop names crew task <id> drop T-n where it names the hand commands", () => {
  const plan = readReference("plan.md");
  expect(plan).toContain("crew task <id> drop T-n");
});

test("AC-7 (finding 61): the skill page's Plan row names crew task note for a todo in this checkout before crew task open for an implementer's task, within the ceiling", () => {
  const row = skill.split("\n").find((line) => line.startsWith("| Plan |")) ?? "";
  const note = row.indexOf("`crew task <id> note T-n");
  const open = row.indexOf("`crew task <id> open T-n");
  expect(note).toBeGreaterThan(-1);
  expect(open).toBeGreaterThan(note);
  expect(row).toMatch(/this checkout[^|]*implementer/);
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(SKILL_PAGE_MAX_BYTES);
});
