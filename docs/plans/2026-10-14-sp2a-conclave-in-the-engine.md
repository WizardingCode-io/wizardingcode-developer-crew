# SP2a: The conclave in the engine. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The engine knows the conclave: a `conclave` phase whose record is checked, typed decisions the user answers, an objection ledger the engine owns and guards on, an `observed` criterion kind, and a validator whose decisions are recorded as the validator's. No model runs inside the engine; the agent and, later, the roles (SP2b) write through `crew` commands.

**Architecture:** Phases are data per route, so `conclave` is one more entry between `specify` and `plan` on standard and full. Everything the conclave produces is either an agent-written document the engine checks for structure (`conclave.md`, like `spec.md`) or an engine-owned record written only by `crew` and protected by the PreToolUse hook (`objections.json`, `decisions` in `work.json`). Guards refuse to enter Plan without the four sections, answered decisions and no unbound blocking objection; the verdict refuses to prove with a blocking objection open; the report shows every decision, objection and waiver with who took it. The validator is a `DecidedBy` value with a rule name; the engine checks the rule's mechanical preconditions before recording.

**Tech Stack:** TypeScript (dependency-free engine in `packages/engine`), Bun for tests, Biome for lint and format, Node 20 or later at run time. The bundle `plugins/core/dist/crew.mjs` is rebuilt by the build gate.

**Spec:** `docs/specs/2026-10-14-sp2-conclave-and-judgement-gates-design.md`, sections 6 (gap round), 8 (ledger), 9 (validator), 11 (criterion kinds), 13 (engine changes), 16 (acceptance 1 to 5, 7).

**Split of SP2:** this plan is the first of three. SP2b (`2026-10-15-sp2b-roles-and-judgement-gates.md`, to be written when this one is done) brings the role agents, the checklists by kind, the judgement gates and the release 0.2.0. SP2c brings the eval cases and the engine hardening of ADR 0004. Each produces working software on its own; this one ships an engine that enforces the conclave's records while the gap round is still run by the session's own agent from the skill's reference.

## Global Constraints

- Every task is a crew work item in this repository: `crew start "<request>" --answers '<json>' --criterion "…" --preserve "…"`, the failing test and `crew tdd red` before the code, `crew tdd green`, then `crew gate run <id>` twice (the build gate rewrites the committed bundle, so the first run says "code changed since the last gate run"), then the commit. Documents (`*.md`) are not watched; source and tests are.
- `bun run check` (typecheck, lint, engine tests) green before every commit; `bun run format` fixes lint.
- The engine has no runtime dependency; imports carry an explicit `.ts` extension; files written by the engine go through `writeProtectedJson` or `writeProtectedText` so the integrity record covers them.
- The hook fails open: any new hook branch answers `{}` when it cannot decide.
- Names: products `wizardingcode-<thing>`; the command is `crew`; the state folder `.crew/`. Repository documents in English.
- Record wording never says "approved by the user" for a decision a person did not take: `decidedBy()` in `packages/engine/src/evidence.ts` is the single place that renders who decided.
- No version bump in this plan: SP2 releases as 0.2.0 at the end of SP2b.

## Review Focus

1. **An item that was in `specify` before this ships** has `conclave` as its next phase after the upgrade; `crew phase <id> next` must then ask for `conclave.md` by name, not fail obscurely. Test in Task 2.
2. **A section written as "none"** (the request had no warnings) is content, not a missing section; a heading with only whitespace under it is missing. Test in Task 2.
3. **A criterion a blocking objection is bound to** must not be removable with `crew criteria remove`; the removal would silently unresolve the objection. Test in Task 4.
4. **A hand edit of `objections.json`** must make every saving command refuse ("state changed outside the engine") until `crew accept <id>`, as `work.json` does. Test in Task 4.
5. **A waiver recorded by the agent in an unattended mode under policy `wait`** does not count: the objection stays open and the item stays unproven; the report shows the waiver as not counted. Test in Task 4.

---

### Task 1: Policy and types for the conclave

**Files:**
- Modify: `packages/engine/src/types.ts` (CriterionKind, Phase and PHASE_ORDER, DecidedBy, Decision, Approval, new GapDecision, Objection, ObjectionLedger, ValidatorRule; WorkItem.decisions; Policy.unattendedDecisions; TddRecord.observed and reason)
- Modify: `packages/engine/src/policy.ts` (loadPolicy, decisionCounts)
- Test: `packages/engine/tests/policy-config-state.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `type CriterionKind = "behavior" | "preserve" | "observed"`
  - `type Phase` with `"conclave"` between `"specify"` and `"plan"`; `PHASE_ORDER` in the same order
  - `type DecidedBy = "user" | "agent" | "validator"`
  - `type ValidatorRule = "complete-gap-round" | "stated-default"`; `const VALIDATOR_RULES: readonly ValidatorRule[]`; `function isValidatorRule(v: unknown): v is ValidatorRule`
  - `interface Decision { by: DecidedBy; mode?: PermissionMode; rule?: ValidatorRule }`
  - `interface Approval { what: "spec"; at: string; by?: DecidedBy; mode?: PermissionMode; rule?: ValidatorRule }`
  - `interface GapDecision { id: string; question: string; default?: string; answer?: string; at?: string; by?: DecidedBy; mode?: PermissionMode; rule?: ValidatorRule }`
  - `type ObjectionSeverity = "blocking" | "advisory"`
  - `interface Waiver { reason: string; at: string; by: DecidedBy; mode?: PermissionMode }`
  - `interface Objection { id: string; raisedBy: string; severity: ObjectionSeverity; text: string; raisedAt: string; criterion?: string; waived?: Waiver }`
  - `interface ObjectionLedger { objections: Objection[] }`
  - `WorkItem.decisions?: GapDecision[]`
  - `TddRecord.observed?: RunRecord; TddRecord.reason?: string`
  - `Policy.unattendedDecisions: "wait" | "count" | "validator"`
- Produces, in `policy.ts`: `decisionCounts(policy, decision)` returns true for `by: "validator"` only when `unattendedDecisions === "validator"`; `by: "agent"` only when `"count"`; a person always.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2a task 1: the policy accepts unattendedDecisions validator and the validator's decisions count only under it" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "loadPolicy reads unattendedDecisions validator, keeps count and wait, and falls back to wait for anything else" --criterion "decisionCounts counts a validator's decision only under policy validator, an agent's only under count, and a person's always" --preserve "The existing policy, work and evidence tests keep passing"
```

The route is standard: write `.crew/work/<id>/spec.md` with a Problem paragraph, the two criteria under `## Acceptance criteria`, and an Out of scope line ("the roles that act as validator: SP2b"); add the `## Assumptions` section to `brief.md` (the user's decision of 2026-10-14: ADR 0004 accepted). Then `crew phase <id> next` four times to reach build and `crew tdd before <id> AC-3 -- bun test packages/engine/tests/policy-config-state.test.ts packages/engine/tests/work.test.ts packages/engine/tests/evidence.test.ts`.

- [ ] **Step 2: Write the failing tests**

Append to `packages/engine/tests/policy-config-state.test.ts`:

```ts
test("policy: unattendedDecisions accepts validator, and decisionCounts follows the policy per decider", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  mkdirSync(paths.crewDir, { recursive: true });
  const file = join(paths.crewDir, "policy.json");
  writeFileSync(file, JSON.stringify({ unattendedDecisions: "validator" }));
  expect(loadPolicy(paths).policy.unattendedDecisions).toBe("validator");
  writeFileSync(file, JSON.stringify({ unattendedDecisions: "judge" }));
  expect(loadPolicy(paths).policy.unattendedDecisions).toBe("wait");

  const wait = { ...DEFAULT_POLICY, unattendedDecisions: "wait" as const };
  const count = { ...DEFAULT_POLICY, unattendedDecisions: "count" as const };
  const validator = { ...DEFAULT_POLICY, unattendedDecisions: "validator" as const };
  const person = { by: "user" as const };
  const agent = { by: "agent" as const, mode: "dontAsk" as const };
  const judge = { by: "validator" as const, mode: "dontAsk" as const, rule: "complete-gap-round" as const };
  expect([wait, count, validator].map((p) => decisionCounts(p, person))).toEqual([true, true, true]);
  expect([wait, count, validator].map((p) => decisionCounts(p, agent))).toEqual([false, true, false]);
  expect([wait, count, validator].map((p) => decisionCounts(p, judge))).toEqual([false, false, true]);
});
```

Add `decisionCounts` to the import from `../src/policy.ts`.

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/policy-config-state.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/policy-config-state.test.ts
```

Expected: both say `red recorded` (the test fails: `"validator"` reads as `"wait"`, and the `by: "validator"` type is rejected by the typecheck inside bun's run or counts as a person).

- [ ] **Step 4: Change the types**

In `packages/engine/src/types.ts`:

```ts
export type Phase =
  | "receive"
  | "recognize"
  | "understand"
  | "specify"
  | "conclave"
  | "plan"
  | "build"
  | "gate"
  | "deliver";
export const PHASE_ORDER: readonly Phase[] = [
  "receive",
  "recognize",
  "understand",
  "specify",
  "conclave",
  "plan",
  "build",
  "gate",
  "deliver",
];

/** `observed`: proven by a passing run after the change plus the reason no red run can exist (SP2 §11). */
export type CriterionKind = "behavior" | "preserve" | "observed";

export type DecidedBy = "user" | "agent" | "validator";

/** The rules under which the validator may take a user-only decision in an unattended session (SP2 §9). */
export type ValidatorRule = "complete-gap-round" | "stated-default";
export const VALIDATOR_RULES: readonly ValidatorRule[] = ["complete-gap-round", "stated-default"];
export function isValidatorRule(value: unknown): value is ValidatorRule {
  return VALIDATOR_RULES.includes(value as ValidatorRule);
}

/** Who took a user-only decision; `mode` when no person was watching; `rule` when the validator took it. */
export interface Decision {
  by: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
}

export interface Approval {
  what: "spec";
  at: string;
  /** Absent in records written before 0.1.2, which read as the user's. */
  by?: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
}

/** A decision only the user can make, found by the gap round; answered by a person or, under a rule, by the validator. */
export interface GapDecision {
  id: string;
  question: string;
  default?: string;
  answer?: string;
  at?: string;
  by?: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
}

export type ObjectionSeverity = "blocking" | "advisory";
export interface Waiver {
  reason: string;
  at: string;
  by: DecidedBy;
  mode?: PermissionMode;
}
/** A dated statement that the work must not proceed as proposed; bound to a criterion, or waived by the user. */
export interface Objection {
  id: string;
  raisedBy: string;
  severity: ObjectionSeverity;
  text: string;
  raisedAt: string;
  criterion?: string;
  waived?: Waiver;
}
export interface ObjectionLedger {
  objections: Objection[];
}
```

In `WorkItem`, after `sharedCheckout`:

```ts
  /** The gap round's decisions only the user can make, and their answers. Absent before 0.2.0. */
  decisions?: GapDecision[];
```

In `TddRecord`:

```ts
  observed?: RunRecord;
  /** For an observed criterion: why no red run can exist. */
  reason?: string;
```

In `Policy`:

```ts
  /**
   * What a user-only decision taken with no person watching is worth: `wait` records it and the
   * guard and the verdict still wait for a person; `count` lets the agent's own word count;
   * `validator` lets a decision the validator took under a rule count, and the agent's not.
   */
  unattendedDecisions: "wait" | "count" | "validator";
```

- [ ] **Step 5: Change the policy**

In `packages/engine/src/policy.ts`:

```ts
/** Whether a recorded decision counts: a person's always, the agent's or the validator's as the policy says. */
export function decisionCounts(policy: Policy, decision: { by?: DecidedBy }): boolean {
  if (decision.by === "validator") return policy.unattendedDecisions === "validator";
  return decision.by !== "agent" || policy.unattendedDecisions === "count";
}
```

and in `loadPolicy`:

```ts
      unattendedDecisions:
        raw.unattendedDecisions === "count" || raw.unattendedDecisions === "validator"
          ? raw.unattendedDecisions
          : "wait",
```

- [ ] **Step 6: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/policy-config-state.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/policy-config-state.test.ts
crew tdd after <id> AC-3 -- bun test packages/engine/tests/policy-config-state.test.ts packages/engine/tests/work.test.ts packages/engine/tests/evidence.test.ts
crew gate run <id>; crew gate run <id>
```

Expected: `Proven`. Then:

```bash
git add -A packages/engine plugins/core && git commit -m "SP2a: the policy knows the validator, and types for the conclave

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The conclave phase and its document

**Files:**
- Modify: `packages/engine/src/work.ts` (PHASES_BY_ROUTE, CONCLAVE_SECTIONS, missingConclaveSections, GuardContext.conclaveText, guardFor for `plan`)
- Modify: `packages/engine/src/cli.ts` (guardContext reads `conclave.md`)
- Test: `packages/engine/tests/work.test.ts`, `packages/engine/tests/cli.test.ts`

**Interfaces:**
- Consumes: `Phase` with `conclave` (Task 1).
- Produces: `PHASES_BY_ROUTE.standard` and `.full` = `[…, "specify", "conclave", "plan", …]`; `CONCLAVE_SECTIONS: readonly ["Assumed by good practice", "Decisions only the user can make", "Proposals", "Warnings"]`; `missingConclaveSections(text: string): string[]` (section names absent or empty); `GuardContext.conclaveText: string | null`; `guardFor(work, "plan", ctx)` lists the missing document or sections on standard and full, nothing on fast.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2a task 2: the conclave is a phase between specify and plan on the standard and full routes, and plan needs conclave.md with its four sections" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "On the standard and full routes the phase after specify is conclave and the one after it is plan; the fast route is unchanged" --criterion "Entering plan on a standard or full item needs conclave.md with content under each of the four headings Assumed by good practice, Decisions only the user can make, Proposals and Warnings; the word none is content; the refusal names the file or each missing section" --criterion "An item that was in specify before the upgrade has conclave as its next phase, and crew phase next asks for conclave.md by name" --preserve "The existing work, CLI and hook tests keep passing"
```

Spec, brief assumptions, four `phase next`, `tdd before <id> AC-4 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/hooks-stop.test.ts`.

- [ ] **Step 2: Write the failing tests**

In `packages/engine/tests/work.test.ts`, add `missingConclaveSections`, `PHASES_BY_ROUTE` to the import from `../src/work.ts`, add `conclaveText: null` to the `empty` fixture, and append:

```ts
test("SP2a: the conclave sits between specify and plan on standard and full, not on fast", () => {
  expect(PHASES_BY_ROUTE.fast).toEqual(["receive", "recognize", "build", "gate", "deliver"]);
  expect(PHASES_BY_ROUTE.standard).toEqual([
    "receive", "recognize", "understand", "specify", "conclave", "plan", "build", "gate", "deliver",
  ]);
  expect(PHASES_BY_ROUTE.full).toEqual(PHASES_BY_ROUTE.standard);
});

test("SP2a: plan needs conclave.md with content under the four headings; 'none' is content", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  expect(guardFor(work, "plan", empty)).toEqual([
    "conclave.md in the work folder (the gap round: four sections)",
  ]);
  const partial = "# Gap round\n\n## Assumed by good practice\n- auth\n\n## Decisions only the user can make\n\n## Proposals\nnone\n";
  expect(missingConclaveSections(partial)).toEqual(["Decisions only the user can make", "Warnings"]);
  expect(guardFor(work, "plan", { ...empty, conclaveText: partial })).toEqual([
    'a "Decisions only the user can make" section with content in conclave.md (write "none" when there is nothing)',
    'a "Warnings" section with content in conclave.md (write "none" when there is nothing)',
  ]);
  const full = `${partial}\n## Decisions only the user can make\n- D-1 which roles\n\n## Warnings\nnone\n`;
  expect(missingConclaveSections(full)).toEqual([]);
  expect(guardFor(work, "plan", { ...empty, conclaveText: full })).toEqual([]);
  work.route = "fast";
  expect(guardFor(work, "plan", empty)).toEqual([]);
});
```

In `packages/engine/tests/cli.test.ts`, append:

```ts
test("SP2a: an item in specify moves to conclave, and plan asks for conclave.md by name", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Templates open empty", "--answers", standard)).data.id as string;
  expect((await c.json("phase", id, "next")).data.phase).toBe("understand");
  expect((await c.json("phase", id, "next")).data.phase).toBe("specify");
  expect((await c.json("phase", id, "next")).data.phase).toBe("conclave");
  const refused = await c.run("phase", id, "next");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("conclave.md in the work folder (the gap round: four sections)");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\nnone\n\n## Decisions only the user can make\nnone\n\n## Proposals\nnone\n\n## Warnings\nnone\n",
  );
  expect((await c.json("phase", id, "next")).data.phase).toBe("plan");
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/work.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/work.test.ts
crew tdd red <id> AC-3 -- bun test packages/engine/tests/cli.test.ts
```

- [ ] **Step 4: Implement**

In `packages/engine/src/work.ts`:

```ts
export const PHASES_BY_ROUTE: Record<Route, Phase[]> = {
  fast: ["receive", "recognize", "build", "gate", "deliver"],
  standard: ["receive", "recognize", "understand", "specify", "conclave", "plan", "build", "gate", "deliver"],
  full: ["receive", "recognize", "understand", "specify", "conclave", "plan", "build", "gate", "deliver"],
};

/** The four lists of the gap round, as headings of `conclave.md` (SP2 §6). */
export const CONCLAVE_SECTIONS = [
  "Assumed by good practice",
  "Decisions only the user can make",
  "Proposals",
  "Warnings",
] as const;

function sectionBody(text: string, heading: string): string | null {
  const re = new RegExp(`^#{1,6}\\s*${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "im");
  const match = re.exec(text);
  if (!match) return null;
  const rest = text.slice(match.index + match[0].length);
  return rest.split(/^#{1,6}\s/m)[0] ?? "";
}

/** The sections of the gap round that are absent or empty; "none" under a heading is content. */
export function missingConclaveSections(text: string): string[] {
  return CONCLAVE_SECTIONS.filter((name) => !(sectionBody(text, name) ?? "").trim());
}
```

Rewrite `hasAcceptanceSection` on top of `sectionBody` so both agree:

```ts
export function hasAcceptanceSection(text: string): boolean {
  return (sectionBody(text, "acceptance criteria") ?? "").trim().length > 0;
}
```

Add to `GuardContext`:

```ts
  conclaveText: string | null;
```

Add to `guardFor`, before the `build` branch:

```ts
  if (next === "plan") {
    missing.push(...conclaveDocument(work, ctx));
  } else if (next === "build") {
```

and the helper beside `routeDocuments`:

```ts
/** The gap round's record, asked for once, on the way into Plan (SP2 §6). */
function conclaveDocument(work: WorkItem, ctx: GuardContext): string[] {
  if (work.route === "fast") return [];
  if (ctx.conclaveText === null) return ["conclave.md in the work folder (the gap round: four sections)"];
  return missingConclaveSections(ctx.conclaveText).map(
    (name) => `a "${name}" section with content in conclave.md (write "none" when there is nothing)`,
  );
}
```

In `packages/engine/src/cli.ts`, `guardContext`:

```ts
    conclaveText: readText(join(dir, "conclave.md")),
```

Every other place that builds a `GuardContext` (search `specText:` in `cli.ts` and the tests) gets `conclaveText`.

- [ ] **Step 5: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/work.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/work.test.ts
crew tdd green <id> AC-3 -- bun test packages/engine/tests/cli.test.ts
crew tdd after <id> AC-4 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/hooks-stop.test.ts
crew gate run <id>; crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2a: the conclave phase, guarded by conclave.md's four sections

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Decisions only the user can make

**Files:**
- Modify: `packages/engine/src/work.ts` (addDecision, answerDecision, guard on plan: answered decisions)
- Modify: `packages/engine/src/cli.ts` (commands `decision` and `decide`, KNOWN_FLAGS, HELP)
- Modify: `packages/engine/src/hooks/pre-tool-use.ts` (USER_ONLY gains `decide`)
- Modify: `packages/engine/src/evidence.ts` (decidedBy for the validator; "Gap round" section in the report)
- Test: `packages/engine/tests/work.test.ts`, `packages/engine/tests/cli.test.ts`, `packages/engine/tests/hooks-pre-tool-use.test.ts`, `packages/engine/tests/evidence.test.ts`

**Interfaces:**
- Consumes: `GapDecision`, `Decision`, `isValidatorRule` (Task 1); `GuardContext` (Task 2).
- Produces: `addDecision(work: WorkItem, question: string, dflt?: string): GapDecision` (ids `D-1`, `D-2`, never reused); `answerDecision(work: WorkItem, id: string, answer: string | undefined, decision: Decision): GapDecision | { refused: string }` (the validator may only take the stated default, under rule `stated-default`); `guardFor(work, "plan", ctx)` adds `an answer to D-n (crew decide <id> D-n "<answer>")` for each decision without a counted answer; CLI `crew decision <id> add "<question>" [--default "<answer>"]`, `crew decide <id> D-n "<answer>" [--mode <mode> --validator stated-default]`; `decidedBy()` renders `by the validator (rule: <rule>)`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2a task 3: the gap round's decisions only the user can make are recorded, answered by the user or by the validator under a stated default, and guard the way into plan" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "crew decision <id> add records a numbered question, with an optional default, in the work record; numbers are never reused" --criterion "crew decide <id> D-n answers it as the user's decision, and the hook asks the user for it like approve; with --mode and --validator stated-default it records the validator taking the default, and refuses without a default or with another answer" --criterion "Entering plan needs a counted answer to every decision; the refusal names each one" --criterion "The report lists the decisions under a Gap round heading with the question, the answer and who decided, the validator with its rule" --preserve "The existing work, CLI, hook and evidence tests keep passing"
```

Spec, brief, four `phase next`, `tdd before <id> AC-5 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/evidence.test.ts`.

- [ ] **Step 2: Write the failing tests**

`packages/engine/tests/work.test.ts` (import `addDecision`, `answerDecision`):

```ts
test("SP2a: decisions are numbered once, answered by the user or by the validator's default, and guard plan", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  const conclave = "## Assumed by good practice\nnone\n## Decisions only the user can make\nD-1\n## Proposals\nnone\n## Warnings\nnone\n";
  const ctx = { ...empty, conclaveText: conclave };
  const d1 = addDecision(work, "Which roles get the create permission?", "admins only");
  const d2 = addDecision(work, "Remove the legacy route now?");
  expect([d1.id, d2.id]).toEqual(["D-1", "D-2"]);
  expect(guardFor(work, "plan", ctx)).toEqual([
    'an answer to D-1 (crew decide <id> D-1 "<answer>")',
    'an answer to D-2 (crew decide <id> D-2 "<answer>")',
  ]);
  // The validator takes only a stated default, under its rule; another answer, or no default, is refused.
  const validator = { by: "validator" as const, mode: "dontAsk" as const, rule: "stated-default" as const };
  expect(answerDecision(work, "D-1", "everyone", validator)).toEqual({
    refused: "the validator may only take the stated default of D-1 (admins only)",
  });
  expect(answerDecision(work, "D-2", undefined, validator)).toEqual({
    refused: "D-2 has no stated default; a person answers it",
  });
  expect(answerDecision(work, "D-1", undefined, validator)).toMatchObject({ answer: "admins only", by: "validator" });
  // Under policy wait the validator's answer does not count; under validator it does.
  expect(guardFor(work, "plan", ctx)).toEqual([
    'an answer to D-1 (crew decide <id> D-1 "<answer>")',
    'an answer to D-2 (crew decide <id> D-2 "<answer>")',
  ]);
  const counting = { ...ctx, policy: { ...DEFAULT_POLICY, unattendedDecisions: "validator" as const } };
  expect(guardFor(work, "plan", counting)).toEqual(['an answer to D-2 (crew decide <id> D-2 "<answer>")']);
  expect(answerDecision(work, "D-2", "yes, 410", { by: "user" })).toMatchObject({ answer: "yes, 410", by: "user" });
  expect(guardFor(work, "plan", counting)).toEqual([]);
  expect(answerDecision(work, "D-9", "x", { by: "user" })).toEqual({ refused: "unknown decision: D-9" });
});
```

`packages/engine/tests/cli.test.ts`:

```ts
test("SP2a: decision add and decide, as the user and as the validator", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Keys in the profile", "--answers", standard)).data.id as string;
  const added = await c.json("decision", id, "add", "Who gets the create permission by default?", "--default", "admins only");
  expect(added.code).toBe(0);
  expect(added.data.decision).toMatchObject({ id: "D-1", default: "admins only" });
  expect((await c.run("decide", id, "D-1", "--validator", "stated-default")).err).toContain(
    "the validator acts only where no person is watching: add --mode <mode>",
  );
  const byValidator = await c.json("decide", id, "D-1", "--mode", "dontAsk", "--validator", "stated-default");
  expect(byValidator.data.decision).toMatchObject({ answer: "admins only", by: "validator", rule: "stated-default" });
  const byUser = await c.json("decide", id, "D-1", "everyone with a team");
  expect(byUser.data.decision).toMatchObject({ answer: "everyone with a team", by: "user" });
  expect((await c.run("decide", id, "D-1", "--mode", "auto", "--validator", "judge")).code).toBe(1);
});
```

`packages/engine/tests/hooks-pre-tool-use.test.ts`, inside the existing "bash: user-only decisions ask" test or as a new one:

```ts
test("SP2a: decide is a user-only command", () => {
  const { ctx } = setup();
  const bash = (command: string) => onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command } });
  expect(decision(bash('crew decide w1 D-1 "admins only"'))).toBe("ask");
  expect(decision(bash("crew decision w1 add \"Which roles?\""))).toBeUndefined();
});
```

`packages/engine/tests/evidence.test.ts`:

```ts
test("SP2a: the report lists the gap round's decisions and who took each", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  addDecision(work, "Erasure or deactivation?", "deactivation");
  addDecision(work, "Delete the provider profile too?");
  answerDecision(work, "D-1", undefined, { by: "validator", mode: "dontAsk", rule: "stated-default" });
  answerDecision(work, "D-2", "yes", { by: "user" });
  const report = renderReport(work, evidence, { ...DEFAULT_POLICY, unattendedDecisions: "validator" });
  expect(report).toContain("## Gap round");
  expect(report).toContain("- D-1: Erasure or deactivation? → deactivation, by the validator (rule: stated-default)");
  expect(report).toContain("- D-2: Delete the provider profile too? → yes, by the user");
});
```

(import `addDecision`, `answerDecision` from `../src/work.ts`.)

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/work.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts
crew tdd red <id> AC-3 -- bun test packages/engine/tests/work.test.ts
crew tdd red <id> AC-4 -- bun test packages/engine/tests/evidence.test.ts
```

- [ ] **Step 4: Implement**

`packages/engine/src/work.ts`:

```ts
export function addDecision(work: WorkItem, question: string, dflt?: string): GapDecision {
  const taken = (work.decisions ?? []).map((d) => Number(d.id.slice("D-".length))).filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const decision: GapDecision = { id: `D-${next}`, question: question.trim(), ...(dflt ? { default: dflt.trim() } : {}) };
  work.decisions = [...(work.decisions ?? []), decision];
  return decision;
}

/**
 * Records an answer. A person answers anything; the validator takes only the stated default, under
 * the rule that says so, and the record names it (SP2 §9).
 */
export function answerDecision(
  work: WorkItem,
  id: string,
  answer: string | undefined,
  decision: Decision,
): GapDecision | { refused: string } {
  const found = (work.decisions ?? []).find((d) => d.id === id);
  if (!found) return { refused: `unknown decision: ${id}` };
  if (decision.by === "validator") {
    if (found.default === undefined) return { refused: `${id} has no stated default; a person answers it` };
    if (answer !== undefined && answer.trim() !== found.default)
      return { refused: `the validator may only take the stated default of ${id} (${found.default})` };
  } else if (answer === undefined || !answer.trim()) {
    return { refused: `an answer is required: crew decide <id> ${id} "<answer>"` };
  }
  found.answer = (answer ?? found.default ?? "").trim();
  found.at = nowIso();
  found.by = decision.by;
  if (decision.mode) found.mode = decision.mode;
  else delete found.mode;
  if (decision.rule) found.rule = decision.rule;
  else delete found.rule;
  return found;
}

/** A decision is answered when its answer counts: a person's always, the validator's or the agent's per the policy. */
function unanswered(work: WorkItem, policy: Policy): GapDecision[] {
  return (work.decisions ?? []).filter((d) => d.answer === undefined || !decisionCounts(policy, d));
}
```

and in `guardFor`'s `plan` branch, after `conclaveDocument`:

```ts
    for (const d of unanswered(work, ctx.policy))
      missing.push(`an answer to ${d.id} (crew decide <id> ${d.id} "<answer>")`);
```

`packages/engine/src/cli.ts`: `KNOWN_FLAGS` gains `decision: ["default"]` and `decide: ["mode", "validator"]`; a shared helper beside `decisionFlag`:

```ts
/**
 * A decision the validator takes: only with `--mode` (no person watching) and a known rule. Without
 * `--validator` the flag logic of `decisionFlag` applies unchanged.
 */
function validatorFlag(parsed: Parsed): Decision | Outcome {
  const rule = parsed.flags.validator;
  if (rule === undefined) return decisionFlag(parsed);
  if (parsed.flags.mode === undefined)
    return refuse("the validator acts only where no person is watching: add --mode <mode>");
  if (!isValidatorRule(rule))
    return refuse(`unknown validator rule: ${String(rule)} (${VALIDATOR_RULES.join(", ")})`);
  const base = decisionFlag(parsed);
  if (isOutcome(base)) return base;
  return { by: "validator", mode: base.mode, rule };
}
```

and the two commands in `dispatch`:

```ts
    case "decision": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const question = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !question)
        return refuse('usage: crew decision <id> add "<question>" [--default "<answer>"]');
      const dflt = typeof parsed.flags.default === "string" ? parsed.flags.default : undefined;
      const decision = addDecision(opened.work, question, dflt);
      saveWork(env.paths, opened.work);
      return ok(`${decision.id}: ${decision.question}${dflt ? ` (default: ${dflt})` : ""}`, { decision });
    }
    case "decide": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const id = args[1];
      if (!id) return refuse('usage: crew decide <id> D-n "<answer>" [--mode <mode> --validator stated-default]');
      const who = validatorFlag(parsed);
      if (isOutcome(who)) return who;
      const answer = args.slice(2).join(" ").trim() || undefined;
      const result = answerDecision(opened.work, id, answer, who);
      if ("refused" in result) return refuse(result.refused);
      saveWork(env.paths, opened.work);
      return ok(`${result.id} answered ${decidedBy(result)}: ${result.answer}`, { decision: result });
    }
```

`HELP` gains:

```
  decision <id> add "<question>" [--default "<answer>"]   a decision only the user can make (gap round)
  decide <id> D-n "<answer>"            record the user's answer (asks the user)
      --mode <mode> --validator stated-default   no person watching: the validator takes the default
```

`packages/engine/src/hooks/pre-tool-use.ts`, `USER_ONLY`: add `decide` to the verb group: `(?:skip|approve|accept|decide|profile\s+confirm|policy\s+accept|profile\s+set\b[^;&|]*--force)`.

`packages/engine/src/evidence.ts`:

```ts
type Decided = { by?: DecidedBy; mode?: PermissionMode; rule?: ValidatorRule };

export function decidedBy(decision: Decided): string {
  if (decision.by === "validator") return `by the validator (rule: ${decision.rule ?? "unnamed"})`;
  return decision.by === "agent" ? `by the agent in ${decision.mode} mode` : "by the user";
}
```

and in `renderReport`, before the Decisions block:

```ts
  const decisions = work.decisions ?? [];
  if (decisions.length) {
    lines.push("", "## Gap round", "");
    for (const d of decisions) {
      const answer = d.answer === undefined ? "no answer yet" : `${d.answer}, ${decidedBy(d)}${countedNote(policy, d)}`;
      lines.push(`- ${d.id}: ${d.question} → ${answer}`);
    }
  }
```

`countedNote` for the validator: `decisionCounts` false → `: not counted, the policy waits for a person`; true → `: counted by policy`. Extend `countedNote` so `by: "validator"` is treated like `"agent"` (a note is written), and a person's decision stays without a note.

- [ ] **Step 5: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/work.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts
crew tdd green <id> AC-3 -- bun test packages/engine/tests/work.test.ts
crew tdd green <id> AC-4 -- bun test packages/engine/tests/evidence.test.ts
crew tdd after <id> AC-5 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/evidence.test.ts
crew gate run <id>; crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2a: decisions only the user can make, answered by the user or by the validator's default

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The objection ledger

**Files:**
- Create: `packages/engine/src/objections.ts`
- Modify: `packages/engine/src/paths.ts` (PROTECTED_IN_WORK), `packages/engine/src/hooks/pre-tool-use.ts` (ENGINE_FILES, USER_ONLY `objection … waive`), `packages/engine/src/cli.ts` (command `objection`, `accept` files, `tamperRefusal`, `guardContext.ledger`, `status --json`), `packages/engine/src/work.ts` (GuardContext.ledger, guard on plan and deliver, removeCriterion refuses a bound criterion), `packages/engine/src/evidence.ts` (VerdictInput.ledger, computeVerdict, report's Objections section and verdict line), `packages/engine/src/gates.ts` (assess and runGates load the ledger)
- Test: `packages/engine/tests/objections.test.ts` (new), `packages/engine/tests/work.test.ts`, `packages/engine/tests/cli.test.ts`, `packages/engine/tests/evidence.test.ts`, `packages/engine/tests/hooks-pre-tool-use.test.ts`

**Interfaces:**
- Consumes: `Objection`, `ObjectionLedger`, `Waiver`, `Decision` (Task 1); `tddDone`, `GuardContext` (Task 2).
- Produces, in `objections.ts`:
  - `ledgerPath(paths: CrewPaths, id: string): string` = `.crew/work/<id>/objections.json`
  - `loadLedger(paths, id): { ledger: ObjectionLedger; tampered: boolean }` (empty ledger when absent)
  - `saveLedger(paths, id, ledger): void` (through `writeProtectedJson`)
  - `addObjection(ledger, text, raisedBy, severity): Objection` (ids `O-1`, `O-2`, never reused)
  - `bindObjection(ledger, work, id, criterion): Objection | { refused: string }` (the criterion must exist; a waived objection cannot be bound)
  - `waiveObjection(ledger, id, reason, decision): Objection | { refused: string }` (the validator is refused)
  - `type ObjectionStatus = "open" | "bound" | "resolved" | "waived"`; `objectionStatus(o, work, evidence, policy): ObjectionStatus` (`waived` only when the waiver counts; `resolved` when the bound criterion's test-first record is complete)
  - `blockingObjections(ledger, work, evidence, policy, statuses: ObjectionStatus[]): Objection[]`
- Produces elsewhere: `GuardContext.ledger: ObjectionLedger | null`; `guardFor(work, "plan")` adds `a criterion bound to blocking objection O-n, or the user's waiver (crew objection <id> resolve O-n --criterion AC-k | waive O-n --reason "<why>")` for each blocking objection with status `open`; `computeVerdict` adds `blocking objection O-n <open|bound>: <text>` to `unproven`; `VerdictInput.ledger?: ObjectionLedger`; the report's verdict line reads `**Proven**, with N objection(s) waived by the user` when any counted waiver exists; `removeCriterion(work, evidence, id, ledger?)` refuses `AC-k is bound to objection O-n; it stays`; CLI `crew objection <id> add "<text>" --by <role> --severity blocking|advisory`, `crew objection <id> resolve O-n --criterion AC-k`, `crew objection <id> waive O-n --reason "<why>" [--mode <mode>]`; `crew status --json` carries `objections: [{ id, severity, status }]`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2a task 4: the engine keeps an objection ledger per work item, protected like the work record, that guards plan and the verdict and shows in the report" --answers '{"work_type":"feature","is_vague":0.05,"scope":2,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "crew objection add, resolve and waive write objections.json through the engine: numbered once, bound to an existing criterion, waived with a reason by a person; the validator cannot waive" --criterion "objections.json is engine-owned: a direct edit is denied by the hook, a hand edit makes saving commands refuse until crew accept <id>, and waive is a user-only command" --criterion "Entering plan needs every blocking objection bound or waived; the verdict is unproven while a blocking objection is open or bound to a criterion not yet proven; a waiver by the agent under policy wait does not count" --criterion "A criterion bound to an objection cannot be removed" --criterion "The report lists the objections with their status and who waived, and its verdict line says how many were waived by the user" --preserve "The existing work, CLI, evidence, gates and hook tests keep passing"
```

Spec, brief, four `phase next`, `tdd before <id> AC-6 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts packages/engine/tests/gates.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts`.

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/tests/objections.test.ts`:

```ts
import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { emptyEvidence } from "../src/evidence.ts";
import {
  addObjection,
  bindObjection,
  blockingObjections,
  ledgerPath,
  loadLedger,
  objectionStatus,
  saveLedger,
  waiveObjection,
} from "../src/objections.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Evidence, RunRecord } from "../src/types.ts";
import { addCriterion, createWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const run: RunRecord = { command: "x", exit: 0, at: "t", durationMs: 1, log: "l", tail: "", timedOut: false };

test("SP2a: objections are numbered once, bound to a criterion, waived by a person, never by the validator", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ac = addCriterion(work, "the sync is gated");
  const { ledger } = loadLedger(paths, work.id);
  expect(ledger).toEqual({ objections: [] });
  const o1 = addObjection(ledger, "the full sync would re-subscribe everyone", "fault-finder", "blocking");
  const o2 = addObjection(ledger, "a support ticket's delete may mean erasure", "gap-round", "advisory");
  expect([o1.id, o2.id]).toEqual(["O-1", "O-2"]);
  expect(bindObjection(ledger, work, "O-1", "AC-9")).toEqual({ refused: "unknown criterion: AC-9" });
  expect(bindObjection(ledger, work, "O-1", ac.id)).toMatchObject({ id: "O-1", criterion: ac.id });
  expect(waiveObjection(ledger, "O-2", "soft delete chosen knowingly", { by: "validator", mode: "dontAsk", rule: "complete-gap-round" })).toEqual({
    refused: "the validator never waives an objection; a person does, or it is bound to a criterion",
  });
  expect(waiveObjection(ledger, "O-2", "soft delete chosen knowingly", { by: "user" })).toMatchObject({
    waived: { reason: "soft delete chosen knowingly", by: "user" },
  });
  expect(bindObjection(ledger, work, "O-2", ac.id)).toEqual({ refused: "O-2 is waived; it stays waived" });
  saveLedger(paths, work.id, ledger);
  expect(existsSync(ledgerPath(paths, work.id))).toBe(true);
  expect(loadLedger(paths, work.id).ledger.objections.map((o) => o.id)).toEqual(["O-1", "O-2"]);
});

test("SP2a: status follows the bound criterion's proof and whether a waiver counts", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ac = addCriterion(work, "x");
  const ledger = { objections: [] };
  const open = addObjection(ledger, "open", "fault-finder", "blocking");
  const bound = addObjection(ledger, "bound", "fault-finder", "blocking");
  bindObjection(ledger, work, bound.id, ac.id);
  const waivedByAgent = addObjection(ledger, "waived by the agent", "gap-round", "blocking");
  waiveObjection(ledger, waivedByAgent.id, "no time", { by: "agent", mode: "dontAsk" });
  const none: Evidence = emptyEvidence();
  expect(objectionStatus(open, work, none, DEFAULT_POLICY)).toBe("open");
  expect(objectionStatus(bound, work, none, DEFAULT_POLICY)).toBe("bound");
  const proven: Evidence = { ...none, tdd: [{ criterion: ac.id, red: run, green: run }] };
  expect(objectionStatus(bound, work, proven, DEFAULT_POLICY)).toBe("resolved");
  expect(objectionStatus(waivedByAgent, work, none, DEFAULT_POLICY)).toBe("open");
  expect(objectionStatus(waivedByAgent, work, none, { ...DEFAULT_POLICY, unattendedDecisions: "count" })).toBe("waived");
  expect(blockingObjections(ledger, work, none, DEFAULT_POLICY, ["open"]).map((o) => o.id)).toEqual([open.id, waivedByAgent.id]);
  expect(blockingObjections(ledger, work, proven, DEFAULT_POLICY, ["open", "bound"]).map((o) => o.id)).toEqual([open.id, waivedByAgent.id]);
});
```

`packages/engine/tests/work.test.ts` (add `ledger: null` to `empty`; import `removeCriterion` is already there):

```ts
test("SP2a: plan needs every blocking objection bound or waived; a bound criterion cannot be removed", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  const ac = addCriterion(work, "the sync is gated");
  const conclave = "## Assumed by good practice\nnone\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n";
  const ledger = { objections: [] };
  const o1 = addObjection(ledger, "the sync would re-subscribe everyone", "fault-finder", "blocking");
  addObjection(ledger, "consider a webhook", "expert", "advisory");
  const ctx = { ...empty, conclaveText: conclave, ledger };
  expect(guardFor(work, "plan", ctx)).toEqual([
    `a criterion bound to blocking objection O-1, or the user's waiver (crew objection <id> resolve O-1 --criterion AC-k | waive O-1 --reason "<why>")`,
  ]);
  bindObjection(ledger, work, o1.id, ac.id);
  expect(guardFor(work, "plan", ctx)).toEqual([]);
  const evidence: Evidence = { fingerprint: "f", tdd: [], runs: [], verdict: "unproven", unproven: [] };
  expect(removeCriterion(work, evidence, ac.id, ledger)).toEqual({ refused: `${ac.id} is bound to objection O-1; it stays` });
});
```

(import `addObjection`, `bindObjection` from `../src/objections.ts`.)

`packages/engine/tests/evidence.test.ts`:

```ts
test("SP2a: a blocking objection keeps the item unproven until resolved or waived, and the report says so", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const ledger = { objections: [] };
  const o1 = addObjection(ledger, "the sync would re-subscribe everyone", "fault-finder", "blocking");
  const o2 = addObjection(ledger, "erasure, not deactivation?", "gap-round", "blocking");
  const evidence: Evidence = {
    ...emptyEvidence(),
    fingerprint: "f",
    tdd: [{ criterion: "AC-1", red: run, green: run }],
    runs: [gate("secrets", "pass"), gate("test", "pass")],
  };
  const input = { work, evidence, expected: [{ gate: "secrets" as const, target: "." }, { gate: "test" as const, target: "." }], currentFingerprint: "f", tampered: false, policy: DEFAULT_POLICY };
  expect(computeVerdict({ ...input, ledger }).unproven).toEqual([
    "blocking objection O-1 open: the sync would re-subscribe everyone",
    "blocking objection O-2 open: erasure, not deactivation?",
  ]);
  bindObjection(ledger, work, o1.id, "AC-1");
  waiveObjection(ledger, o2.id, "soft delete chosen knowingly", { by: "user" });
  expect(computeVerdict({ ...input, ledger }).verdict).toBe("proven");
  const report = renderReport(work, evidence, DEFAULT_POLICY, ledger);
  expect(report).toContain("- Verdict: **Proven**, with 1 objection waived by the user");
  expect(report).toContain("## Objections");
  expect(report).toContain("- O-1 (blocking, raised by fault-finder) resolved by AC-1: the sync would re-subscribe everyone");
  expect(report).toContain("- O-2 (blocking, raised by gap-round) waived by the user: soft delete chosen knowingly (");
});
```

`renderReport` gains an optional fourth parameter `ledger?: ObjectionLedger`; every caller passes it.

`packages/engine/tests/cli.test.ts`:

```ts
test("SP2a: objection add, resolve and waive through the command; a hand edit is caught", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Gated sync", "--answers", answers, "--criterion", "the sync is gated")).data.id as string;
  const added = await c.json("objection", id, "add", "the full sync would re-subscribe everyone", "--by", "fault-finder", "--severity", "blocking");
  expect(added.data.objection).toMatchObject({ id: "O-1", severity: "blocking", raisedBy: "fault-finder" });
  expect((await c.run("objection", id, "add", "x", "--by", "expert", "--severity", "huge")).err).toContain("severity is blocking or advisory");
  const status = await c.json("status");
  expect(status.data.objections).toEqual([{ id: "O-1", severity: "blocking", status: "open" }]);
  expect((await c.json("gate", "run", id)).data.unproven).toContain("blocking objection O-1 open: the full sync would re-subscribe everyone");
  expect((await c.json("objection", id, "resolve", "O-1", "--criterion", "AC-1")).code).toBe(0);
  expect((await c.run("criteria", id, "remove", "AC-1")).err.trim()).toBe("AC-1 is bound to objection O-1; it stays");
  // A hand edit of the ledger stops every saving command until the user accepts it.
  const file = join(root, ".crew", "work", id, "objections.json");
  writeFileSync(file, readFileSync(file, "utf8").replace("blocking", "advisory"));
  const refused = await c.run("objection", id, "add", "another", "--by", "expert", "--severity", "advisory");
  expect(refused.err).toContain(`state changed outside the engine: .crew/work/${id}/objections.json`);
  expect((await c.run("accept", id)).out).toContain("objections.json");
  expect((await c.run("objection", id, "waive", "O-1", "--reason", "done by hand")).code).toBe(0);
});
```

`packages/engine/tests/hooks-pre-tool-use.test.ts`:

```ts
test("SP2a: objections.json is engine-owned and waive is user-only", () => {
  const { root, ctx } = setup();
  expect(decision(onPreToolUse(ctx, { tool_name: "Edit", tool_input: { file_path: join(root, ".crew", "work", "w1", "objections.json") } }))).toBe("deny");
  const bash = (command: string) => onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command } });
  expect(decision(bash('crew objection w1 waive O-1 --reason "known"'))).toBe("ask");
  expect(decision(bash('crew objection w1 add "x" --by expert --severity advisory'))).toBeUndefined();
  expect(decision(bash("echo x > .crew/work/w1/objections.json"))).toBe("deny");
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/objections.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/cli.test.ts
crew tdd red <id> AC-3 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/evidence.test.ts
crew tdd red <id> AC-4 -- bun test packages/engine/tests/work.test.ts
crew tdd red <id> AC-5 -- bun test packages/engine/tests/evidence.test.ts
```

- [ ] **Step 4: Implement the module**

Create `packages/engine/src/objections.ts`:

```ts
import { join } from "node:path";
import { nowIso } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { decisionCounts } from "./policy.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type {
  Decision,
  Evidence,
  Objection,
  ObjectionLedger,
  ObjectionSeverity,
  Policy,
  WorkItem,
} from "./types.ts";
import { tddDone } from "./work.ts";

export function ledgerPath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "objections.json");
}

export function emptyLedger(): ObjectionLedger {
  return { objections: [] };
}

export function loadLedger(paths: CrewPaths, id: string): { ledger: ObjectionLedger; tampered: boolean } {
  const read = readProtectedJson<ObjectionLedger>(paths, ledgerPath(paths, id));
  return { ledger: read.data ?? emptyLedger(), tampered: read.tampered };
}

export function saveLedger(paths: CrewPaths, id: string, ledger: ObjectionLedger): void {
  writeProtectedJson(paths, ledgerPath(paths, id), ledger);
}

/** A number is taken for good, so an id names one objection for the life of the item. */
export function addObjection(
  ledger: ObjectionLedger,
  text: string,
  raisedBy: string,
  severity: ObjectionSeverity,
): Objection {
  const taken = ledger.objections.map((o) => Number(o.id.slice("O-".length))).filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const objection: Objection = { id: `O-${next}`, raisedBy, severity, text: text.trim(), raisedAt: nowIso() };
  ledger.objections.push(objection);
  return objection;
}

/** Binds the objection to the criterion whose proof resolves it; the binding is the plan's answer. */
export function bindObjection(
  ledger: ObjectionLedger,
  work: WorkItem,
  id: string,
  criterion: string,
): Objection | { refused: string } {
  const objection = ledger.objections.find((o) => o.id === id);
  if (!objection) return { refused: `unknown objection: ${id}` };
  if (objection.waived) return { refused: `${id} is waived; it stays waived` };
  if (!work.criteria.some((c) => c.id === criterion)) return { refused: `unknown criterion: ${criterion}` };
  objection.criterion = criterion;
  return objection;
}

/** A person decides against an objection; the record keeps the reason. The validator never does (SP2 §9). */
export function waiveObjection(
  ledger: ObjectionLedger,
  id: string,
  reason: string,
  decision: Decision,
): Objection | { refused: string } {
  const objection = ledger.objections.find((o) => o.id === id);
  if (!objection) return { refused: `unknown objection: ${id}` };
  if (decision.by === "validator")
    return { refused: "the validator never waives an objection; a person does, or it is bound to a criterion" };
  objection.waived = { reason: reason.trim(), at: nowIso(), by: decision.by, ...(decision.mode ? { mode: decision.mode } : {}) };
  return objection;
}

export type ObjectionStatus = "open" | "bound" | "resolved" | "waived";

/** Derived, never stored: a waiver counts per the policy; a binding resolves when the criterion's record is complete. */
export function objectionStatus(
  objection: Objection,
  work: WorkItem,
  evidence: Evidence | null,
  policy: Policy,
): ObjectionStatus {
  if (objection.waived && decisionCounts(policy, objection.waived)) return "waived";
  if (objection.criterion) {
    const criterion = work.criteria.find((c) => c.id === objection.criterion);
    const record = evidence?.tdd.find((t) => t.criterion === objection.criterion);
    return criterion && tddDone(record, criterion.kind) ? "resolved" : "bound";
  }
  return "open";
}

export function blockingObjections(
  ledger: ObjectionLedger,
  work: WorkItem,
  evidence: Evidence | null,
  policy: Policy,
  statuses: ObjectionStatus[],
): Objection[] {
  return ledger.objections.filter(
    (o) => o.severity === "blocking" && statuses.includes(objectionStatus(o, work, evidence, policy)),
  );
}
```

`work.ts` imports `blockingObjections` from `./objections.ts`? That is a cycle (`objections.ts` imports `tddDone` from `work.ts`). Avoid it: move `tddDone` into a new tiny module `packages/engine/src/criteria.ts` exporting `tddDone(record, kind)`, re-exported from `work.ts` for the existing callers (`export { tddDone } from "./criteria.ts"`); `objections.ts` imports it from `./criteria.ts`.

- [ ] **Step 5: Protect the file and name the user-only verb**

`packages/engine/src/paths.ts`:

```ts
const PROTECTED_IN_WORK = new Set(["work.json", "evidence.json", "report.md", "objections.json"]);
```

`packages/engine/src/hooks/pre-tool-use.ts`: in `ENGINE_FILES` add `objections\.json` to the alternation inside `work\/[^\s/]+\/(?:…)`; in `USER_ONLY` add `objection\s+\S+\s+waive` to the verb group.

`packages/engine/src/cli.ts`: `accept(env, target)` files list becomes `["work.json", "evidence.json", "report.md", "objections.json"]`; `tamperRefusal` also checks `loadLedger(env.paths, opened.work.id).tampered` and names `objections.json`.

- [ ] **Step 6: Guards, verdict, report, status**

`work.ts`: `GuardContext.ledger: ObjectionLedger | null`; in the `plan` branch:

```ts
    if (ctx.ledger) {
      for (const o of blockingObjections(ctx.ledger, work, ctx.evidence, ctx.policy, ["open"]))
        missing.push(
          `a criterion bound to blocking objection ${o.id}, or the user's waiver (crew objection <id> resolve ${o.id} --criterion AC-k | waive ${o.id} --reason "<why>")`,
        );
    }
```

The `deliver` guard needs nothing new: the verdict carries the objection reasons. `removeCriterion(work, evidence, id, ledger?: ObjectionLedger)`:

```ts
  const bound = ledger?.objections.find((o) => o.criterion === id && !o.waived);
  if (bound) return { refused: `${id} is bound to objection ${bound.id}; it stays` };
```

`evidence.ts`: `VerdictInput.ledger?: ObjectionLedger`; in `computeVerdict`, after the gates and before the criteria:

```ts
  if (input.ledger) {
    for (const o of blockingObjections(input.ledger, work, evidence, policy, ["open", "bound"]))
      unproven.push(`blocking objection ${o.id} ${objectionStatus(o, work, evidence, policy)}: ${o.text}`);
  }
```

`renderReport(work, evidence, policy, ledger?)`: the verdict line

```ts
  const waived = (ledger?.objections ?? []).filter((o) => o.waived && decisionCounts(policy, o.waived));
  const waivedNote = waived.length ? `, with ${waived.length} objection${waived.length === 1 ? "" : "s"} waived by the user` : "";
  lines.push(`- Verdict: **${evidence.verdict === "proven" ? "Proven" : "Not proven"}**${waivedNote}`);
```

(replace the existing verdict line; keep the "Not proven" reasons list as it is) and the section, after Decisions:

```ts
  if (ledger?.objections.length) {
    lines.push("", "## Objections", "");
    for (const o of ledger.objections) {
      const status = objectionStatus(o, work, evidence, policy);
      const how =
        status === "waived" && o.waived
          ? `waived ${decidedBy(o.waived)}: ${o.waived.reason} (${o.waived.at})`
          : status === "resolved"
            ? `resolved by ${o.criterion}`
            : status === "bound"
              ? `bound to ${o.criterion}, not yet proven`
              : o.waived
                ? `open (waiver ${decidedBy(o.waived)} not counted)`
                : "open";
      lines.push(`- ${o.id} (${o.severity}, raised by ${o.raisedBy}) ${how}: ${o.text}`);
    }
  }
```

`gates.ts`: `assess` and `runGates` call `loadLedger(paths, work.id)` and pass `ledger` to `computeVerdict`; `runGates` passes it to `renderReport` through the CLI (the CLI already calls `renderReport` after the run; it loads the ledger there). `cli.ts` `guardContext` sets `ledger: loadLedger(env.paths, work.id).ledger`.

`status --json` gains:

```ts
        objections: loadLedger(env.paths, work.id).ledger.objections.map((o) => ({
          id: o.id,
          severity: o.severity,
          status: objectionStatus(o, work, result.evidence, env.policy),
        })),
```

- [ ] **Step 7: The command**

`KNOWN_FLAGS.objection = ["by", "severity", "criterion", "reason", "mode"]`. In `dispatch`:

```ts
    case "objection": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const { ledger } = loadLedger(env.paths, opened.work.id);
      const usage =
        'usage: crew objection <id> add "<text>" --by <role> --severity blocking|advisory | resolve O-n --criterion AC-k | waive O-n --reason "<why>" [--mode <mode>]';
      if (args[1] === "add") {
        const text = args.slice(2).join(" ").trim();
        const by = typeof parsed.flags.by === "string" ? parsed.flags.by : "";
        const severity = parsed.flags.severity;
        if (!text || !by) return refuse(usage);
        if (severity !== "blocking" && severity !== "advisory") return refuse("severity is blocking or advisory");
        const objection = addObjection(ledger, text, by, severity);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${objection.id} (${severity}, raised by ${by}): ${objection.text}`, { objection });
      }
      if (args[1] === "resolve" && args[2]) {
        if (typeof parsed.flags.criterion !== "string") return refuse(usage);
        const result = bindObjection(ledger, opened.work, args[2], parsed.flags.criterion);
        if ("refused" in result) return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${result.id} is resolved when ${result.criterion} is proven`, { objection: result });
      }
      if (args[1] === "waive" && args[2]) {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!reason) return refuse(usage);
        const decision = decisionFlag(parsed);
        if (isOutcome(decision)) return decision;
        const result = waiveObjection(ledger, args[2], reason, decision);
        if ("refused" in result) return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${result.id} waived ${decidedBy(result.waived ?? { by: "user" })}${countedNote(env.policy, result.waived ?? {})}: ${reason}`, { objection: result });
      }
      return refuse(usage);
    }
```

`HELP` gains the three forms. `criteria remove` passes the ledger to `removeCriterion`.

- [ ] **Step 8: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/objections.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/cli.test.ts
crew tdd green <id> AC-3 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/evidence.test.ts
crew tdd green <id> AC-4 -- bun test packages/engine/tests/work.test.ts
crew tdd green <id> AC-5 -- bun test packages/engine/tests/evidence.test.ts
crew tdd after <id> AC-6 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts packages/engine/tests/gates.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts
crew gate run <id>; crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2a: the objection ledger, engine-owned, guarding plan and the verdict

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The observed criterion kind

**Files:**
- Modify: `packages/engine/src/tdd.ts` (TddStep `observed`, recordTdd with a reason), `packages/engine/src/criteria.ts` (tddDone for observed), `packages/engine/src/cli.ts` (`tdd observed … --reason`, `criteria add --kind observed`, KNOWN_FLAGS, HELP), `packages/engine/src/evidence.ts` (tddSummary), `packages/engine/src/work.ts` (guard text per kind)
- Test: `packages/engine/tests/tdd.test.ts`, `packages/engine/tests/cli.test.ts`, `packages/engine/tests/evidence.test.ts`, `packages/engine/tests/work.test.ts`

**Interfaces:**
- Consumes: `CriterionKind` with `observed`, `TddRecord.observed`, `TddRecord.reason` (Task 1).
- Produces: `recordTdd(paths, work, evidence, profile, criterionId, step, override?, reason?)` where step `"observed"` needs kind `observed`, a passing run and a non-empty reason, and writes `entry.observed` and `entry.reason`; `tddDone(record, "observed")` = `!!record.observed`; `tddSummary` = `observed: passes after (<reason>)`; guard text `test-first record for AC-n (crew tdd observed --reason)`; CLI `crew tdd observed <id> AC-n --reason "<why no red run can exist>" [-- <cmd>]`; `crew criteria <id> add "<text>" --kind observed`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2a task 5: an observed criterion is proven by a passing run after the change plus the reason no red run can exist, recorded as such and not as a skip" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "crew criteria add --kind observed creates an observed criterion, and crew tdd observed records a passing run with a required reason; red, green, before and after are refused for it, and observed is refused for the other kinds" --criterion "An observed criterion with its record counts as complete for the gate guard and the verdict, and the report's test-first column reads observed: passes after, with the reason" --preserve "The existing tdd, CLI, evidence and work tests keep passing"
```

Spec, brief, four `phase next`, `tdd before <id> AC-3 -- bun test packages/engine/tests/tdd.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts packages/engine/tests/work.test.ts`.

- [ ] **Step 2: Write the failing tests**

`packages/engine/tests/tdd.test.ts` (follow the file's existing fixture for a repo with a passing test command; read its first test for the helper names):

```ts
test("SP2a: observed records a passing run with a reason, and refuses the other steps for that kind", async () => {
  const paths = repoPaths(makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) }), testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "e2e");
  const observed = addCriterion(work, "the stubbed e2e passes", "observed");
  const behaviour = addCriterion(work, "x");
  const evidence = emptyEvidence();
  expect((await recordTdd(paths, work, evidence, profile, observed.id, "red")).message).toBe(
    `${observed.id} is an observed criterion: record observed, with --reason`,
  );
  expect((await recordTdd(paths, work, evidence, profile, observed.id, "observed")).message).toBe(
    "an observed run needs --reason: why no red run can exist",
  );
  const ok = await recordTdd(paths, work, evidence, profile, observed.id, "observed", undefined, "the dev server stubs the backend");
  expect(ok.ok).toBe(true);
  expect(evidence.tdd.find((t) => t.criterion === observed.id)).toMatchObject({ reason: "the dev server stubs the backend" });
  expect(tddDone(evidence.tdd.find((t) => t.criterion === observed.id), "observed")).toBe(true);
  expect((await recordTdd(paths, work, evidence, profile, behaviour.id, "observed", undefined, "x")).message).toBe(
    `${behaviour.id} is a behavior criterion: record red, then green`,
  );
});
```

`packages/engine/tests/cli.test.ts`:

```ts
test("SP2a: an observed criterion through the command, and in the report", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Stubbed e2e", "--answers", answers, "--criterion", "a")).data.id as string;
  expect((await c.run("criteria", id, "add", "the stubbed e2e passes", "--kind", "observed")).out).toContain("AC-2 (observed)");
  expect((await c.run("tdd", "observed", id, "AC-2")).err).toContain("needs --reason");
  expect((await c.run("tdd", "observed", id, "AC-2", "--reason", "the dev server stubs the backend", "--", "exit 0")).code).toBe(0);
  write(root, "src/a.ts", "y");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", id)).data.verdict).toBe("proven");
  const report = readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8");
  expect(report).toContain("| AC-2 | observed | the stubbed e2e passes | observed: passes after (the dev server stubs the backend) |");
});
```

`packages/engine/tests/work.test.ts`, in the gate-guard test or a new one:

```ts
test("SP2a: the gate guard names the observed step for an observed criterion", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "e2e");
  work.route = "fast";
  const observed = addCriterion(work, "stubbed e2e", "observed");
  expect(guardFor(work, "gate", empty)).toEqual([`test-first record for ${observed.id} (crew tdd observed --reason)`]);
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/tdd.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/work.test.ts
```

- [ ] **Step 4: Implement**

`packages/engine/src/criteria.ts` (created in Task 4):

```ts
export function tddDone(record: TddRecord | undefined, kind: CriterionKind): boolean {
  if (!record) return false;
  if (kind === "behavior") return !!record.red && !!record.green;
  if (kind === "preserve") return !!record.before && !!record.after;
  return !!record.observed;
}
```

`packages/engine/src/tdd.ts`:

```ts
export type TddStep = "red" | "green" | "before" | "after" | "observed";

const STEPS_BY_KIND: Record<CriterionKind, { steps: TddStep[]; how: string }> = {
  behavior: { steps: ["red", "green"], how: "record red, then green" },
  preserve: { steps: ["before", "after"], how: "record before, then after" },
  observed: { steps: ["observed"], how: "record observed, with --reason" },
};
```

In `recordTdd`, replace the behaviour/preserve check with:

```ts
  const expected = STEPS_BY_KIND[criterion.kind];
  if (!expected.steps.includes(step))
    return { ok: false, message: `${criterionId} is ${article(criterion.kind)} ${criterion.kind} criterion: ${expected.how}` };
  if (step === "observed" && !reason?.trim())
    return { ok: false, message: "an observed run needs --reason: why no red run can exist" };
```

with `function article(kind: string): string { return /^[aeiou]/.test(kind) ? "an" : "a"; }` and the signature `recordTdd(paths, work, evidence, profile, criterionId, step, override?, reason?)`. After a passing run for `observed`: `entry.observed = record; entry.reason = reason.trim();`.

`packages/engine/src/work.ts`, gate guard text:

```ts
        const how = criterion.kind === "behavior" ? "red/green" : criterion.kind === "preserve" ? "before/after" : "observed --reason";
```

`packages/engine/src/evidence.ts`, `tddSummary`:

```ts
  if (tddDone(record, kind)) {
    if (kind === "behavior") return "red then green";
    if (kind === "preserve") return "passing before and after";
    return `observed: passes after (${record?.reason ?? "no reason given"})`;
  }
```

`packages/engine/src/cli.ts`: `KNOWN_FLAGS.tdd = ["reason"]`; the `tdd` case reads `const step = args[0] as TddStep` (accept `observed`), `const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : undefined` and passes it; `criteria add` accepts `--kind observed`:

```ts
      const kind = parsed.flags.kind === "preserve" || parsed.flags.kind === "observed" ? parsed.flags.kind : "behavior";
```

and `HELP`: `tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]`, `criteria <id> add "<text>" [--kind preserve|observed]`.

- [ ] **Step 5: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/tdd.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/work.test.ts
crew tdd after <id> AC-3 -- bun test packages/engine/tests/tdd.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts packages/engine/tests/work.test.ts
crew gate run <id>; crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2a: the observed criterion kind, proven by a passing run and a reason

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The validator approves a spec under its rule

**Files:**
- Modify: `packages/engine/src/work.ts` (validatorPreconditions), `packages/engine/src/cli.ts` (`approve … --validator complete-gap-round`), `packages/engine/src/evidence.ts` (countedNote for the validator; the Decisions line)
- Test: `packages/engine/tests/work.test.ts`, `packages/engine/tests/cli.test.ts`, `packages/engine/tests/evidence.test.ts`

**Interfaces:**
- Consumes: `validatorFlag` (Task 3), `missingConclaveSections`, `GuardContext` with `conclaveText` and `ledger` (Tasks 2, 4), `blockingObjections` (Task 4), `unanswered` (Task 3, exported for this).
- Produces: `validatorPreconditions(rule: ValidatorRule, work: WorkItem, ctx: GuardContext): string[]` (for `complete-gap-round`: the conclave document's missing sections, each decision with neither a counted answer nor a default, each blocking objection with status open; for `stated-default`: nothing, the decision itself is checked in `answerDecision`); `crew approve <id> spec --mode <mode> --validator complete-gap-round` records `{ what: "spec", by: "validator", mode, rule }` or refuses with the preconditions; the full route's guard counts it only under policy `validator`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2a task 6: in an unattended session the validator approves a full-route spec under the complete-gap-round rule, which the engine checks before recording, and the approval counts only under policy validator" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "crew approve spec with --mode and --validator complete-gap-round is refused, naming each precondition, while a conclave section is missing, a decision has neither an answer nor a default, or a blocking objection is open; otherwise it records the validator's approval with the rule" --criterion "Under policy validator that approval satisfies the full route's guard and the report reads approved by the validator with the rule, counted by policy; under wait it does not count and the guard still asks for a person" --preserve "The existing work, CLI and evidence tests keep passing"
```

Spec, brief, four `phase next`, `tdd before <id> AC-3 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts`.

- [ ] **Step 2: Write the failing tests**

`packages/engine/tests/work.test.ts` (import `validatorPreconditions`, `addDecision`, `answerDecision`, and from objections `addObjection`, `bindObjection`):

```ts
test("SP2a: the complete-gap-round rule holds only with the four sections, defaults or answers, and no open blocking objection", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "full", reasons: [], riskAreas: ["auth"] });
  const ac = addCriterion(work, "x");
  const ledger = { objections: [] };
  const o1 = addObjection(ledger, "re-subscribes everyone", "fault-finder", "blocking");
  addDecision(work, "Which roles?");
  const partial = "## Assumed by good practice\nnone\n## Decisions only the user can make\nD-1\n## Proposals\nnone\n";
  expect(validatorPreconditions("complete-gap-round", work, { ...empty, conclaveText: partial, ledger })).toEqual([
    'a "Warnings" section with content in conclave.md (write "none" when there is nothing)',
    "a stated default or an answer for D-1",
    "blocking objection O-1 bound to a criterion or waived by a person",
  ]);
  const full = `${partial}## Warnings\nnone\n`;
  answerDecision(work, "D-1", "admins", { by: "user" });
  bindObjection(ledger, work, o1.id, ac.id);
  expect(validatorPreconditions("complete-gap-round", work, { ...empty, conclaveText: full, ledger })).toEqual([]);
  expect(validatorPreconditions("stated-default", work, empty)).toEqual([]);
});
```

`packages/engine/tests/cli.test.ts`:

```ts
test("SP2a: the validator's approval is refused until the rule holds, then counts only under policy validator", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "app/Auth/Guard.ts": "x",
  });
  const c = io(root);
  const full = JSON.stringify({ ...JSON.parse(answers), touches_auth: 0.9 });
  const id = (await c.json("start", "Keys in the profile", "--answers", full)).data.id as string;
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 x\n");
  write(root, `.crew/work/${id}/plan.md`, "# Plan\n1. AC-1\n");
  expect((await c.run("criteria", id, "add", "x")).code).toBe(0);
  const refused = await c.run("approve", id, "spec", "--mode", "dontAsk", "--validator", "complete-gap-round");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("conclave.md in the work folder (the gap round: four sections)");
  write(root, `.crew/work/${id}/conclave.md`, "## Assumed by good practice\nnone\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n");
  const approved = await c.json("approve", id, "spec", "--mode", "dontAsk", "--validator", "complete-gap-round");
  expect(approved.code).toBe(0);
  expect((approved.data.approvals as unknown[])[0]).toMatchObject({ by: "validator", mode: "dontAsk", rule: "complete-gap-round" });
  // Under the default policy the guard still waits for a person.
  for (let i = 0; i < 4; i++) await c.run("phase", id, "next");
  const waiting = await c.run("phase", id, "next");
  expect(waiting.err).toContain("the user's approval of the spec: recorded by the validator in dontAsk mode and not counted");
  write(root, ".crew/policy.json", JSON.stringify({ unattendedDecisions: "validator" }));
  expect((await c.run("policy", "accept")).code).toBe(0);
  expect((await c.json("phase", id, "next")).data.phase).toBe("build");
});
```

`packages/engine/tests/evidence.test.ts`:

```ts
test("SP2a: the report names the validator's approval and whether the policy counted it", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  approve(work, "spec", { by: "validator", mode: "dontAsk", rule: "complete-gap-round" });
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  expect(renderReport(work, evidence, DEFAULT_POLICY)).toContain(
    "- spec approved by the validator (rule: complete-gap-round) (",
  );
  expect(renderReport(work, evidence, DEFAULT_POLICY)).toContain("): not counted, the policy waits for a person");
  expect(renderReport(work, evidence, { ...DEFAULT_POLICY, unattendedDecisions: "validator" })).toContain("): counted by policy");
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts
```

- [ ] **Step 4: Implement**

`packages/engine/src/work.ts`:

```ts
/**
 * What must hold before the validator may take a decision under a rule (SP2 §9). The engine checks
 * the mechanical part; the role that reads the documents is SP2b's.
 */
export function validatorPreconditions(rule: ValidatorRule, work: WorkItem, ctx: GuardContext): string[] {
  if (rule !== "complete-gap-round") return [];
  const missing = conclaveDocument(work, ctx);
  for (const d of work.decisions ?? []) {
    const answered = d.answer !== undefined && decisionCounts(ctx.policy, d);
    if (!answered && d.default === undefined) missing.push(`a stated default or an answer for ${d.id}`);
  }
  if (ctx.ledger) {
    for (const o of blockingObjections(ctx.ledger, work, ctx.evidence, ctx.policy, ["open"]))
      missing.push(`blocking objection ${o.id} bound to a criterion or waived by a person`);
  }
  return missing;
}
```

`routeDocuments`, the uncounted approval text, now names the decider from the record:

```ts
      const uncounted = approvals.find((a) => a.by && a.by !== "user");
      missing.push(
        uncounted
          ? `the user's approval of the spec: recorded by the ${uncounted.by} in ${uncounted.mode} mode and not counted (a person runs crew approve <id> spec, or policy.json sets unattendedDecisions to "${uncounted.by === "validator" ? "validator" : "count"}")`
          : "the user's approval of the spec (crew approve <id> spec)",
      );
```

`packages/engine/src/cli.ts`, `KNOWN_FLAGS.approve = ["mode", "validator"]`; the `approve` case:

```ts
      const decision = validatorFlag(parsed);
      if (isOutcome(decision)) return decision;
      if (decision.by === "validator") {
        const missing = validatorPreconditions(decision.rule ?? "complete-gap-round", opened.work, guardContext(env, opened.work, opened.tampered));
        if (decision.rule !== "complete-gap-round") return refuse("a spec is approved by the validator under the complete-gap-round rule");
        if (missing.length) return refuse(`the complete-gap-round rule does not hold; missing:\n  ${missing.join("\n  ")}`, { missing });
      }
      approve(opened.work, "spec", decision);
```

`packages/engine/src/evidence.ts`, `countedNote`:

```ts
export function countedNote(policy: Policy, decision: Decided): string {
  if (!decision.by || decision.by === "user") return "";
  return decisionCounts(policy, decision) ? ": counted by policy" : ": not counted, the policy waits for a person";
}
```

- [ ] **Step 5: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts
crew tdd after <id> AC-3 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts
crew gate run <id>; crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2a: the validator approves a spec under the complete-gap-round rule, checked by the engine

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The skill knows the conclave

**Files:**
- Modify: `plugins/core/skills/crew/SKILL.md` (method table: Conclave row; rule 4: `crew decide`, `crew objection … waive`; the "other routes" table: `references/conclave.md`)
- Create: `plugins/core/skills/crew/references/conclave.md`
- Modify: `plugins/core/skills/crew/references/specify.md` (observed kind), `references/build.md` (observed step), `references/gate.md` (objections in the verdict), `references/deliver.md` (objections and the gap round in the report), `README.md` (`objections.json`, `conclave.md`, policy `validator`), `docs/specs/2026-10-06-sp1-engine-and-base-method-design.md` (section 9: the conclave phase is in, as the SP1 design said it would be)
- Test: `packages/engine/tests/skill.test.ts`

**Interfaces:**
- Consumes: every command of Tasks 2 to 6.
- Produces: the wording the test asserts, below.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2a task 7: the skill drives the conclave phase: the four lists in conclave.md, decisions asked through crew decide, objections filed and bound, the observed kind, and the validator named as what it is" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "The skill's method table has a Conclave row between Specify and Plan naming conclave.md, crew decision, crew decide and crew objection; rule 4 lists crew decide and crew objection waive among the commands that ask the user; the references table points to references/conclave.md" --criterion "references/conclave.md says what each of the four lists holds and what the engine does with each, when the debate opens, that the roles come with SP2b, and that the validator never waives and never skips" --preserve "The existing skill and CLI tests keep passing"
```

Fast route is not available (the skill files are watched source for the skill test, scope 1): standard. Spec, brief, four `phase next`, `tdd before <id> AC-3 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/cli.test.ts`.

- [ ] **Step 2: Write the failing tests**

In `packages/engine/tests/skill.test.ts` (read its first test for how it loads `SKILL.md`; the helper that reads a reference file follows the same path):

```ts
test("SP2a: the skill drives the conclave phase", () => {
  const skill = readSkill();
  expect(skill).toMatch(/\| Conclave \|.*conclave\.md.*\| `crew decision <id> add`, `crew decide <id> D-n`, `crew objection <id> add\|resolve\|waive`, `crew phase <id> next` \|/);
  expect(skill).toContain("`crew decide`");
  expect(skill).toContain("`crew objection <id> waive`");
  expect(skill).toContain("| Conclave | `references/conclave.md` |");
  const conclave = readReference("conclave.md");
  for (const heading of ["Assumed by good practice", "Decisions only the user can make", "Proposals", "Warnings"])
    expect(conclave).toContain(`## ${heading}`);
  expect(conclave).toContain("The debate opens");
  expect(conclave).toContain("SP2b");
  expect(conclave).toContain("The validator never waives an objection and never skips a gate or a test-first record");
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/skill.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/skill.test.ts
```

- [ ] **Step 4: Write the skill**

`SKILL.md`, method table, a row after Specify:

```markdown
| Conclave | The gap round: write the four lists in `conclave.md`, ask each decision only the user can make, file what goes against good practice as an objection; debate when a decision has consequences (standard and full routes) | `crew decision <id> add`, `crew decide <id> D-n`, `crew objection <id> add|resolve|waive`, `crew phase <id> next` |
```

Rule 4's list of commands that ask the user gains `` `crew decide` `` and `` `crew objection <id> waive` ``. The references table gains `| Conclave | `references/conclave.md` |` after Specify.

`references/conclave.md`:

```markdown
# Conclave

Standard and full routes, after the spec. Goal: say what the request leaves out before a line is written, and let the user decide what only they can.

## The gap round, always

Write `.crew/work/<id>/conclave.md` with these four headings, each with content or the word "none". The engine refuses `crew phase <id> next` into Plan until all four have content.

## Assumed by good practice

What you will do without asking, stated so the user can refuse: "The endpoint is authenticated and paginated." Each line becomes a criterion (`crew criteria <id> add`), `preserve` when it keeps something as it is.

## Decisions only the user can make

What two competent engineers would build differently. Record each one as you find it: `crew decision <id> add "<question>" --default "<the conservative answer>"`. Ask the user on one screen; record each answer with `crew decide <id> D-n "<answer>"`; the permission prompt is the user's signature. A decision without a counted answer blocks Plan. In an unattended session (headless, bypassPermissions or dontAsk) and only when `policy.json` sets `unattendedDecisions` to `validator`, the validator takes the stated default: `crew decide <id> D-n --mode <mode> --validator stated-default`. No default, no validator: the item waits.

## Proposals

Optional improvements, each with its reason. The user takes or leaves each; a taken one becomes a criterion.

## Warnings

What the request asks for that goes against good practice, and why. Each one is an objection: `crew objection <id> add "<text>" --by gap-round --severity advisory`, or `blocking` when building it as asked would be wrong. A blocking objection is answered by binding it to the criterion whose proof resolves it (`crew objection <id> resolve O-n --criterion AC-k`) or by the user's waiver (`crew objection <id> waive O-n --reason "<why>"`, which asks the user and shows in the report as "decided by the user"). Plan is refused while a blocking objection is neither; the item is not proven while one is open or bound to an unproven criterion.

## When the debate opens

The debate opens on consequences, never on the route alone: a blocking objection from the round, a warning the user wants to build anyway on a risk area, a decision whose answer changes a risk area, or the user asking for it. Until SP2b ships the roles (researcher, experts, devil's advocate, fault-finder, judge), you run the round yourself in this context and record its outcome through the commands above; say so in the brief.

## The validator

The validator decides only what a rule covers: a spec approval under `complete-gap-round` (`crew approve <id> spec --mode <mode> --validator complete-gap-round`, refused by the engine while a section, a default or a binding is missing) and a decision's stated default. The validator never waives an objection and never skips a gate or a test-first record. Its decisions count only under policy `validator`, and the record always says "by the validator (rule: …)", never "by the user".
```

`references/specify.md`: after the preserve paragraph, "A criterion that passes after the change but can have no red run (an end-to-end test against a stubbed server) is `observed`: `crew criteria <id> add \"<text>\" --kind observed`; it is proven with `crew tdd observed <id> AC-n --reason \"<why no red run can exist>\"` and shown apart from skips." `references/build.md`: the matching step. `references/gate.md` and `references/deliver.md`: the verdict may read "not proven: blocking objection O-n open"; the report has "Gap round" and "Objections" sections and names waivers in the verdict line. `README.md`, "Where state lives": `conclave.md` (agent-written, structure-checked) and `objections.json` (engine-owned) in the work folder; `unattendedDecisions` gains `validator`. The SP1 design, section 9: "*Amended 2026-10 (SP2a):* the conclave phase sits between Specify and Plan on the standard and full routes, as foreseen."

- [ ] **Step 5: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/skill.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/skill.test.ts
crew tdd after <id> AC-3 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/cli.test.ts
crew gate run <id>; crew gate run <id>
git add -A packages/engine plugins/core README.md docs/specs && git commit -m "SP2a: the skill drives the conclave phase

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## After the last task

- `bun run check && bun run plugin:check` green; `git push origin main`.
- Use it once in this repository: the next item here runs the gap round through the new phase, and what gets in the way is a finding in `docs/real-use/findings.md` against SP2a (no release until SP2b: the one-release rule).
- Write `docs/plans/2026-10-15-sp2b-roles-and-judgement-gates.md`: the agent definitions under `plugins/core/agents/`, the checklists by kind under `skills/crew/checklists/`, judgement gates recorded through `crew` (the engine plans them from the route and the diff, the session's roles run them, their rulings are written with a command and judged by the verdict), the mod's panel, the version 0.2.0 and its release.

## Self-review

- **Spec coverage.** §6 gap round: Tasks 2, 3, 7. §8 ledger: Task 4. §9 validator: Tasks 1, 3, 6 (the role prompt itself is SP2b). §11 observed: Task 5. §13 engine changes: phases (2), guards (2, 3, 4), files (2, 4), commands (3, 4, 5, 6), policy (1), evidence and report (3, 4, 5, 6), hooks (3, 4). §16 acceptance 1 to 5 and 7: Tasks 2, 4, 4, 6, 6 and 4, 5. Not in this plan, by the split: §7 debate roles, §10 judgement gates, §14 agents and checklists and the mod, §15 evals, §16 acceptance 6, 8, 9, 10.
- **Placeholders.** None: every step has its code or its exact wording.
- **Type consistency.** `GuardContext` gains `conclaveText` (Task 2) and `ledger` (Task 4); both tests' `empty` fixtures gain the field in the task that adds it. `tddDone` moves to `criteria.ts` in Task 4 and is extended in Task 5. `decidedBy` and `countedNote` change in Tasks 3 and 6 and are used by Task 4's report lines. `validatorFlag` is defined in Task 3 and used by Task 6. `renderReport` gains the optional `ledger` in Task 4; Tasks 5 and 6 call it with three arguments where the ledger does not matter.
- **Review Focus.** 1 and 2 are tested in Task 2; 3, 4 and 5 in Task 4.
