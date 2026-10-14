# SP2b: Roles and judgement gates. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session, through the crew method (the user's choice, 2026-10-14). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Written on 2026-10-14** (the SP2a plan named this file `2026-10-15-…`; it is written on the 14th). Approved by the user the same evening.

**Goal:** The method's judgement exists as software: the five debate roles and the five reviewers ship as plugin agents with clean contexts; the judge is also the validator; the engine plans the judgement gates from the route, the risk areas and the diff, hands the roles the item's change and nothing else, records each ruling through `crew judgement`, and refuses to prove while a planned gate is not run, stale, not proven, or not run for a reason; the gap round is guided by checklists per kind of change; the debate is recorded; the panel shows it all. Released as 0.4.0 at the close.

**Architecture:** No model runs inside the engine. `packages/engine/src/judgement.ts` (new) holds the planning rule, the review inputs writer (`review/diff.patch`, `review/files.txt`), the ruling parser and the status rows; `runGates` and `assess` compute the planned judgement list beside `expected` and pass it to `computeVerdict`, so the Stop and prompt hooks pick up the new reasons with no change. Rulings live in `evidence.judgement` (protected through `evidence.json`); the `review/` folder is deliberately not engine-owned, since the session saves the roles' answers there. In the plugin, `plugins/core/agents/*.md` are the roles (auto-discovered by Claude Code, scoped `wizardingcode-developer-crew:<name>`), `skills/crew/rubrics/<gate>.md` the fixed questions each reviewer and the judge read, `skills/crew/checklists/<kind>.md` the gap round's questions per kind; `references/conclave.md` and `references/gate.md` are the protocols; the mod reads four new `crew status --json` fields.

**Tech Stack:** TypeScript (dependency-free engine, Bun for tests, Biome), Node 20+ at run time, Claude Code plugin agents (frontmatter `name`, `description`, `tools`, `model`; body = system prompt; `${CLAUDE_PLUGIN_ROOT}` substituted in the body), the mod runtime (`plugins/core/hooks/register.js`, tested with `claude plugin test`).

**Spec:** `docs/specs/2026-10-14-sp2-conclave-and-judgement-gates-design.md` §6 (checklists), §7 (debate, roles), §9 (validator), §10 (judgement gates), §13 (engine), §14 (skill and plugin), §16 (acceptance 6, 9, 10); `docs/adr/0006-gates-judge-the-item.md` (debt is reported, never failed on); `docs/adr/0005-attended-decisions-by-relay.md` (relay; `--mode` only unattended).

**Split of SP2:** SP2a (0.2.0) gave the engine the conclave phase, decisions, the ledger, the `observed` kind and the validator flags. This plan is SP2b: engine Tasks 1 to 4, plugin Tasks 5 to 8, release Task 9. SP2c brings the eight eval cases (spec §15) and the hardening of ADR 0004. The SP2a plan's lines "SP2 releases as 0.2.0 at the end of SP2b" are stale: 0.2.0 and 0.3.0 shipped on 2026-10-14; SP2b ships as 0.4.0.

**Decisions taken with the user (2026-10-14, this plan):**
1. Roles are read-only subagents (`Read, Grep, Glob`, plus `WebFetch, WebSearch` for the researcher; the devil's advocate and the fault-finder `Read` only). No role has Write, Edit, Bash or Agent. Each returns its answer as text in a fixed shape; the session saves it verbatim under the work folder and runs the crew commands itself.
2. Models: the judge always `model: fable`; reviewers `model: sonnet` in their frontmatter, and the session passes `model: opus` on the Agent call on the full route or when the diff touches a risk area; the debate roles `model: opus`, since the debate opens only on consequences.
3. Execution: this session, task by task, each task a crew work item (criteria, red, green, one gate run, commit). One release, 0.4.0, at the close.

## Global Constraints

- Every task is a crew work item in this repository: `crew start "<request>" --answers '<json>' --criterion "…" --preserve "…"`, the failing test and `crew tdd red` before the code, `crew tdd green`, `crew tdd after` for the preserve criterion, then one `crew gate run <id>` (one run proves since 0.3.0), then the commit. Source and tests are watched; `*.md` under `docs/` is not. A standard-route item writes `spec.md` and `conclave.md` (four sections, "none" where there is nothing) and walks `crew phase <id> next` through understand, specify, conclave, plan and build.
- The `crew` on PATH is the installed plugin, 0.3.0, for the whole of SP2b: the new commands (`judgement`, `debate`) and the new gates are exercised by the tests, not by this repository's own items, until 0.4.0 is installed and the session restarted (the same as SP2a under 0.1.7). The first real use is recorded as findings against SP2b in `docs/real-use/findings.md`.
- `bun run check` green before every commit; `bun run format` fixes lint. Tasks that touch `plugins/core` (5 to 8) also run `bun run plugin:check` (`claude plugin validate --strict` and the mod's tests) before the commit.
- The engine has no runtime dependency; imports carry an explicit `.ts`; engine-owned files go through `writeProtectedJson`/`writeProtectedText`. The `review/` folder is written with `writeText` on purpose: it is the session's, not the engine's.
- The engine never changes a judge's verdict: a finding outside the change is marked `outside: true` and reported (ADR 0006), never used to flip the ruling. A judgement gate is never passed by default: no record is "not run".
- Gates are mandatory (ADR 0006): `allowSkips` keeps its default `["tdd"]`; a judgement gate is skipped only when the policy lists it by name.
- The always-on context does not grow (spec acceptance 9): the SessionStart and prompt texts are unchanged; agents, rubrics and checklists load only when a role runs or the gap round reads them. `SKILL.md` gains words only in two existing rows.
- Naming: `wizardingcode-developer-crew:<agent>`; files in English; no new names outside `judgement`, `debate`, `review/`, `rubrics/`, `checklists/`, `agents/`.
- No version bump before Task 9.

## Review Focus

1. **A ruling recorded, then the code changes.** The verdict says "code changed since the last gate run" until the next gate run, then "judgement gate X not run on the current code"; the status row says `stale`. Tests in Task 3.
2. **A finding on a file outside the diff** is recorded with `outside: true`, counted, shown as "outside the change"; the judge's verdict stands. Tests in Task 3.
3. **Fast route with and without interface files**: no judgement gate and no `review/` folder without one (the fast-route cost target holds); `ui-ux` and the inputs with one. Tests in Tasks 1 and 2.
4. **A malformed ruling file** (not JSON, no `rulings`, unknown gate, gate not planned, verdict outside the set, finding without file or text, not-proven with no defect, two rulings for one gate) is refused with a precise reason and nothing is recorded. Tests in Task 3.
5. **A skip of a judgement gate** is refused by default, allowed when `allowSkips` lists it, and then taken out of the verdict and of the "to run" line. Tests in Task 3.
6. **An agent with write or shell power** would break the clean-context design: every agent file is checked for `tools` without Write, Edit, Bash, Agent, and for its model. Tests in Tasks 5 and 6.
7. **The mod under an older engine**: `crew status --json` from 0.3.0 has no `judgement`, `decisions`, `debate` and no `objections[].text`; the pane and the strip must render with those fields absent. Tests in Task 8.
8. **The debate opens once**, holds the plan while open, closes with its cost; a second open is refused. Tests in Task 4.

---

### Task 1: Judgement types, the planning rule, the policy key

**Files:**
- Modify: `packages/engine/src/types.ts` (JudgementGateName, JUDGEMENT_GATES, isJudgementGateName, PlannedJudgement, JudgementVerdict, FindingSeverity, JudgementFinding, JudgementRecord; `Evidence.judgement`; `Policy.judgementGates`)
- Create: `packages/engine/src/judgement.ts` (isInterfacePath, plannedJudgementGates)
- Modify: `packages/engine/src/policy.ts` (`DEFAULT_POLICY.judgementGates`, `loadPolicy`)
- Modify: `packages/engine/src/index.ts` (export judgement.ts)
- Test: `packages/engine/tests/judgement.test.ts` (new), `packages/engine/tests/policy-config-state.test.ts`

**Interfaces:**
- Produces, in `types.ts`:
  - `type JudgementGateName = "code-quality" | "test-quality" | "security" | "ui-ux" | "risk"`; `const JUDGEMENT_GATES: readonly JudgementGateName[]`; `function isJudgementGateName(value: unknown): value is JudgementGateName`
  - `interface PlannedJudgement { gate: JudgementGateName; reason: string }`
  - `type JudgementVerdict = "proven" | "not-proven" | "not-run"`; `type FindingSeverity = "defect" | "advisory"`
  - `interface JudgementFinding { file: string; line?: number; text: string; severity: FindingSeverity; outside?: boolean }`
  - `interface JudgementRecord { gate: JudgementGateName; verdict: JudgementVerdict; reviewer?: string; judge?: string; findings: JudgementFinding[]; tokens?: number; reason?: string; at: string; fingerprint: string }`
  - `Evidence.judgement?: JudgementRecord[]`; `Policy.judgementGates: JudgementGateName[]`
- Produces, in `judgement.ts`: `isInterfacePath(rel: string): boolean`; `plannedJudgementGates(route: Route, riskAreas: readonly RiskArea[], changed: readonly string[], policy: Policy): PlannedJudgement[]`
- Produces, in `policy.ts`: `DEFAULT_POLICY.judgementGates = []`; `loadPolicy` reads `judgementGates` as a list of known names (`strings(raw.judgementGates).filter(isJudgementGateName)`, with the existing `strings` helper at policy.ts:80).

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 1: the engine knows the five judgement gates, plans them from the route, the risk areas, the diff and the policy, and the policy lists the ones a team requires" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "plannedJudgementGates plans code-quality and test-quality on standard and full, security on full or on standard with a risk area, ui-ux on any route when the change has an interface file, risk on full, plus the policy's judgementGates, without duplicates; a fast item with no interface file plans none" --criterion "loadPolicy reads judgementGates as a list of known judgement gate names, empty by default, unknown names dropped" --preserve "The existing policy, gates and evidence tests keep passing"
```

Standard route: spec, conclave, five `phase next`, then `crew tdd before <id> AC-3 -- bun test packages/engine/tests/policy-config-state.test.ts packages/engine/tests/gates.test.ts packages/engine/tests/evidence.test.ts`.

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/tests/judgement.test.ts`:

```ts
import { expect, test } from "bun:test";
import { isInterfacePath, plannedJudgementGates } from "../src/judgement.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Policy } from "../src/types.ts";

const names = (planned: { gate: string }[]) => planned.map((p) => p.gate);

test("SP2b: judgement gates are planned from the route, the risk areas, the diff and the policy", () => {
  expect(plannedJudgementGates("fast", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([]);
  expect(plannedJudgementGates("fast", [], ["src/App.vue"], DEFAULT_POLICY)).toEqual([
    { gate: "ui-ux", reason: "interface files: src/App.vue" },
  ]);
  expect(plannedJudgementGates("standard", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([
    { gate: "code-quality", reason: "standard route" },
    { gate: "test-quality", reason: "standard route" },
  ]);
  expect(names(plannedJudgementGates("standard", ["auth"], ["src/a.ts"], DEFAULT_POLICY))).toEqual([
    "code-quality",
    "test-quality",
    "security",
  ]);
  expect(plannedJudgementGates("standard", ["auth", "payments"], [], DEFAULT_POLICY)[2]).toEqual({
    gate: "security",
    reason: "risk areas auth, payments",
  });
  expect(
    plannedJudgementGates("full", [], ["src/a.ts", "resources/views/home.blade.php"], DEFAULT_POLICY),
  ).toEqual([
    { gate: "code-quality", reason: "full route" },
    { gate: "test-quality", reason: "full route" },
    { gate: "security", reason: "full route" },
    { gate: "ui-ux", reason: "interface files: resources/views/home.blade.php" },
    { gate: "risk", reason: "full route" },
  ]);
  // The policy adds what the route does not; a gate already planned keeps its first reason.
  const policy: Policy = { ...DEFAULT_POLICY, judgementGates: ["security", "code-quality"] };
  expect(plannedJudgementGates("fast", [], ["src/a.ts"], policy)).toEqual([
    { gate: "security", reason: "policy" },
    { gate: "code-quality", reason: "policy" },
  ]);
  expect(plannedJudgementGates("standard", [], ["src/a.ts"], policy)).toEqual([
    { gate: "code-quality", reason: "standard route" },
    { gate: "test-quality", reason: "standard route" },
    { gate: "security", reason: "policy" },
  ]);
  // Many interface files: the first three are named.
  expect(plannedJudgementGates("fast", [], ["a.css", "b.scss", "c.less", "d.html"], DEFAULT_POLICY)).toEqual([
    { gate: "ui-ux", reason: "interface files: a.css, b.scss, c.less, +1 more" },
  ]);
});

test("SP2b: an interface file is known by its extension or by living under resources/views/", () => {
  for (const path of [
    "src/App.vue", "src/x.svelte", "src/B.tsx", "src/c.jsx", "src/d.astro",
    "resources/views/a.blade.php", "public/index.html", "s.css", "s.scss", "s.less",
    "resources/views/mail/x.php", "apps/web/resources/views/y.txt",
  ])
    expect(isInterfacePath(path)).toBe(true);
  for (const path of ["src/a.ts", "src/a.php", "app/Http/Controllers/A.php", "views/a.txt", "docs/a.md", "src/Views.ts"])
    expect(isInterfacePath(path)).toBe(false);
});
```

Append to `packages/engine/tests/policy-config-state.test.ts` (it already imports `DEFAULT_POLICY`, `loadPolicy`, `repoPaths`, `makeRepo`, `testEnv`, `mkdirSync`, `writeFileSync`, `join`; add what is missing):

```ts
test("SP2b: judgementGates lists the judgement gates a team requires, empty by default, unknown names dropped", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.judgementGates).toEqual([]);
  expect(loadPolicy(paths).policy.judgementGates).toEqual([]);
  mkdirSync(paths.crewDir, { recursive: true });
  const file = join(paths.crewDir, "policy.json");
  writeFileSync(file, JSON.stringify({ judgementGates: ["security", "lint", "ui-ux", 3] }));
  expect(loadPolicy(paths).policy.judgementGates).toEqual(["security", "ui-ux"]);
  writeFileSync(file, JSON.stringify({ judgementGates: "security" }));
  expect(loadPolicy(paths).policy.judgementGates).toEqual([]);
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/judgement.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/policy-config-state.test.ts
```

Expected: AC-1 fails on the missing module; AC-2 on `judgementGates` being `undefined`.

- [ ] **Step 4: Types**

In `packages/engine/src/types.ts`, after `GATE_NAMES`:

```ts
/**
 * A gate whose verdict is a reviewer's ruling against a rubric and a judge's decision, not an exit
 * code (SP2 §10). Kept apart from `GateName`: the engine runs those, the session's roles run these.
 */
export type JudgementGateName = "code-quality" | "test-quality" | "security" | "ui-ux" | "risk";
export const JUDGEMENT_GATES: readonly JudgementGateName[] = ["code-quality", "test-quality", "security", "ui-ux", "risk"];
export function isJudgementGateName(value: unknown): value is JudgementGateName {
  return JUDGEMENT_GATES.includes(value as JudgementGateName);
}

/** A judgement gate the item needs, and why: "standard route", "risk area auth", "interface files: a.vue", "policy". */
export interface PlannedJudgement {
  gate: JudgementGateName;
  reason: string;
}
```

After `GateRun`, before `Evidence`:

```ts
export type JudgementVerdict = "proven" | "not-proven" | "not-run";
export type FindingSeverity = "defect" | "advisory";
/** One finding of a reviewer, tied to a file; `outside` when the file is not part of the item's change (ADR 0006: reported, never failed on). */
export interface JudgementFinding {
  file: string;
  line?: number;
  text: string;
  severity: FindingSeverity;
  outside?: boolean;
}
/** A judgement gate's ruling as recorded: the judge's verdict, the reviewer's findings, stamped with when and on which code. */
export interface JudgementRecord {
  gate: JudgementGateName;
  verdict: JudgementVerdict;
  reviewer?: string;
  judge?: string;
  findings: JudgementFinding[];
  tokens?: number;
  /** For `not-run`: why the gate could not run. */
  reason?: string;
  at: string;
  /** The fingerprint of the code the ruling vouches for; a ruling on other code counts as not run. */
  fingerprint: string;
}
```

In `Evidence`, after `unproven`: `/** One ruling per judgement gate, the latest for each. Absent before 0.4.0. */ judgement?: JudgementRecord[];`. In `Policy`, after `requiredGates`: `/** Judgement gates the team requires on every item beyond the route's own (SP2 §10). */ judgementGates: JudgementGateName[];`.

- [ ] **Step 5: The module and the policy**

Create `packages/engine/src/judgement.ts`:

```ts
import type { JudgementGateName, PlannedJudgement, Policy, RiskArea, Route } from "./types.ts";

const INTERFACE_EXTENSIONS = [".vue", ".svelte", ".tsx", ".jsx", ".astro", ".blade.php", ".html", ".css", ".scss", ".less"];

/** A file the user sees: a component, a template, a stylesheet, or anything under resources/views/. */
export function isInterfacePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (/(?:^|\/)resources\/views\//.test(lower)) return true;
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * The judgement gates an item needs, from the route, the risk areas and the diff (SP2 §10): code and
 * test quality on standard and full; security on full, or on standard when a risk area is touched;
 * UI/UX on any route when the change touches an interface file; risk on full; and whatever the team
 * policy requires. A fast item with no interface file plans none, so the fast route costs nothing more.
 */
export function plannedJudgementGates(
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
): PlannedJudgement[] {
  const planned: PlannedJudgement[] = [];
  const plan = (gate: JudgementGateName, reason: string): void => {
    if (!planned.some((p) => p.gate === gate)) planned.push({ gate, reason });
  };
  if (route !== "fast") {
    plan("code-quality", `${route} route`);
    plan("test-quality", `${route} route`);
  }
  if (route === "full") plan("security", "full route");
  else if (route === "standard" && riskAreas.length)
    plan("security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) {
    const shown = interfaces.slice(0, 3).join(", ");
    const more = interfaces.length > 3 ? `, +${interfaces.length - 3} more` : "";
    plan("ui-ux", `interface files: ${shown}${more}`);
  }
  if (route === "full") plan("risk", "full route");
  for (const gate of policy.judgementGates) plan(gate, "policy");
  return planned;
}
```

`packages/engine/src/policy.ts`: import `isJudgementGateName` from `./types.ts`; `DEFAULT_POLICY` gains `judgementGates: [],` after `requiredGates`; `loadPolicy`'s returned policy gains `judgementGates: strings(raw.judgementGates).filter(isJudgementGateName),`. `packages/engine/src/index.ts`: `export * from "./judgement.ts";` in alphabetical place.

- [ ] **Step 6: Green, after, gate, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/judgement.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/policy-config-state.test.ts
crew tdd after <id> AC-3 -- bun test packages/engine/tests/policy-config-state.test.ts packages/engine/tests/gates.test.ts packages/engine/tests/evidence.test.ts
crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2b: the judgement gates, planned from the route, the risk areas, the diff and the policy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Review inputs, the gate run's plan, the status fields

**Files:**
- Modify: `packages/engine/src/fingerprint.ts` (gitDiffSince, additionPatch)
- Modify: `packages/engine/src/judgement.ts` (reviewDir, writeReviewInputs, JudgementState, JudgementRow, judgementRows)
- Modify: `packages/engine/src/gates.ts` (`runGates` `only` with judgement names, plans judgement, writes inputs; `GateOutcome.judgement`, `.review`; `Assessment.judgement`, `.currentFingerprint`)
- Modify: `packages/engine/src/cli.ts` (`gate run` validation and output; status JSON `judgement`, `decisions`, `objections[].text`)
- Test: `packages/engine/tests/fingerprint.test.ts`, `gates.test.ts`, `cli.test.ts`, `hooks-pre-tool-use.test.ts`

**Interfaces:**
- Consumes: `plannedJudgementGates`, `PlannedJudgement`, `JudgementRecord` (Task 1); `untrackedPaths`, `gitTry` (fingerprint.ts:83, :36); `writeText` (fs.ts:36); `workDir` (paths.ts:72); `isSkipped` (work.ts).
- Produces:
  - `gitDiffSince(root: string, base: string, paths: readonly string[]): string` in fingerprint.ts: unified diff of the named paths since `base`, untracked files rendered as additions, nothing else.
  - `reviewDir(paths: CrewPaths, id: string): string` = `.crew/work/<id>/review`; `writeReviewInputs(paths: CrewPaths, work: WorkItem, changed: readonly string[]): string` (returns the folder; writes `diff.patch`, `files.txt`).
  - `type JudgementState = "planned" | "proven" | "not-proven" | "not-run" | "stale" | "skipped"`; `interface JudgementRow { gate: JudgementGateName; status: JudgementState; planned: string; findings: number; reason?: string }`; `judgementRows(work, evidence, planned, currentFingerprint, policy): JudgementRow[]`. (`skipped` is added to the brief's set so a skipped `ui-ux` does not sit as `planned` in the panel for the life of the item.)
  - `runGates(paths, work, profile, policy, { only?: readonly (GateName | JudgementGateName)[]; tampered? })`; `GateOutcome.judgement: PlannedJudgement[]`, `GateOutcome.review: string | null`; `Assessment.judgement: PlannedJudgement[]`, `Assessment.currentFingerprint: string`.
  - CLI: `--only` accepts judgement names (`unknown gate: <x>` otherwise); the summary ends with `Judgement gates to run: <gate> (<reason>), …; inputs in .crew/work/<id>/review/ (diff.patch, files.txt); record each with crew judgement <id> record --ruling <file>`; `--json` data gains `judgement`, `review`; `status --json` gains `judgement: JudgementRow[]`, `decisions: [{id, question, answer?, by?}]`, `objections[].text`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 2: a gate run writes the reviewers' inputs (the item's diff and its files) when a judgement gate is planned, prints the plan with reasons, takes judgement names in --only, and the status carries the judgement rows, the decisions and the objections' text" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "gitDiffSince returns the unified diff of the named paths since the base commit with untracked files as additions, and crew gate run writes review/diff.patch and review/files.txt whenever a judgement gate is planned and never on a fast item without an interface file; the review folder changes neither the fingerprint nor the verdict" --criterion "crew gate run prints the judgement gates to run with why each is planned and where the inputs are, accepts judgement gate names in --only, and with judgement names alone runs no deterministic gate" --criterion "crew status --json carries judgement rows with their state and why each is planned, the decisions with question and answer, and the text of each objection" --preserve "The existing gates, CLI, fingerprint and hook tests keep passing"
```

Spec, conclave, five `phase next`, `crew tdd before <id> AC-4 -- bun test packages/engine/tests/gates.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/fingerprint.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts`.

- [ ] **Step 2: Write the failing tests**

`packages/engine/tests/fingerprint.test.ts` (add `gitDiffSince` to the import):

```ts
test("SP2b: gitDiffSince is the change of the named paths since the base: tracked as a diff, untracked as additions, nothing else", () => {
  const root = makeRepo({ "src/a.ts": "const a = 1;\n", "src/keep.ts": "keep\n" });
  const base = git(root, "rev-parse", "HEAD");
  write(root, "src/a.ts", "const a = 2;\n");
  write(root, "src/new.ts", "fresh\n");
  write(root, "src/keep.ts", "changed but not asked for\n");
  const patch = gitDiffSince(root, base, ["src/a.ts", "src/new.ts"]);
  expect(patch).toContain("diff --git a/src/a.ts b/src/a.ts");
  expect(patch).toContain("-const a = 1;");
  expect(patch).toContain("+const a = 2;");
  expect(patch).toContain(
    "diff --git a/src/new.ts b/src/new.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/new.ts\n@@ -0,0 +1,1 @@\n+fresh\n",
  );
  expect(patch).not.toContain("src/keep.ts");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "work");
  expect(gitDiffSince(root, base, ["src/a.ts", "src/new.ts"])).toContain("+fresh");
  expect(gitDiffSince(root, base, [])).toBe("");
});
```

`packages/engine/tests/gates.test.ts` (import `existsSync`, `readFileSync` from `node:fs`, `join`, and `addSkip` from `../src/work.ts` if not already):

```ts
test("SP2b: a gate run writes the review inputs when a judgement gate is planned, and nothing on a fast item without an interface file", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "src/App.vue": "<template/>",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  write(root, "src/a.ts", "y");
  const plain = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(plain.judgement).toEqual([]);
  expect(plain.review).toBeNull();
  expect(existsSync(join(paths.crewDir, "work", work.id, "review"))).toBe(false);
  write(root, "src/App.vue", "<template>hi</template>");
  write(root, "src/new.ts", "new");
  const withUi = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(withUi.judgement).toEqual([{ gate: "ui-ux", reason: "interface files: src/App.vue" }]);
  expect(withUi.review).toBe(join(paths.crewDir, "work", work.id, "review"));
  const review = withUi.review ?? "";
  expect(readFileSync(join(review, "files.txt"), "utf8")).toBe("src/App.vue\nsrc/a.ts\nsrc/new.ts\n");
  const patch = readFileSync(join(review, "diff.patch"), "utf8");
  expect(patch).toContain("+++ b/src/App.vue");
  expect(patch).toContain("+<template>hi</template>");
  expect(patch).toContain("new file mode 100644\n--- /dev/null\n+++ b/src/new.ts");
  // The review folder is the session's, not the engine's: it moves neither the fingerprint nor the plan.
  const after = assess(paths, work, profile, DEFAULT_POLICY);
  expect(after.unproven).not.toContain("code changed since the last gate run");
  expect(after.judgement).toEqual(withUi.judgement);
});

test("SP2b: --only with judgement names alone runs no deterministic gate and rewrites the review inputs", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/App.vue", "<template>a</template>");
  const only = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["ui-ux"] });
  expect(only.evidence.runs).toEqual([]);
  expect(only.judgement.map((j) => j.gate)).toEqual(["ui-ux"]);
  expect(readFileSync(join(only.review ?? "", "files.txt"), "utf8")).toBe("src/App.vue\n");
  expect(only.unproven.slice(0, 2)).toEqual(["gate secrets not run", "gate test not run"]);
  const mixed = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["secrets", "ui-ux"] });
  expect(mixed.evidence.runs.map((r) => r.gate)).toEqual(["secrets"]);
});
```

`packages/engine/tests/cli.test.ts`: the SP2a objection test at line 1091 gains the text: `expect(status.data.objections).toEqual([{ id: "O-1", severity: "blocking", status: "open", text: "<the text that test adds>" }]);` (copy the objection text that test uses). Then append:

```ts
test("SP2b: gate run names the judgement gates to run, accepts their names in --only, and status shows the plan, the decisions and the objections' text", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data.id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  const run = await c.run("gate", "run", id);
  expect(run.out).toContain(
    `Judgement gates to run: ui-ux (interface files: src/App.vue); inputs in .crew/work/${id}/review/ (diff.patch, files.txt); record each with crew judgement ${id} record --ruling <file>`,
  );
  expect(existsSync(join(root, ".crew", "work", id, "review", "diff.patch"))).toBe(true);
  const json = await c.json("gate", "run", id, "--only", "ui-ux");
  expect(json.data.judgement).toEqual([{ gate: "ui-ux", reason: "interface files: src/App.vue" }]);
  expect(json.data.review).toBe(`.crew/work/${id}/review`);
  expect((json.data.runs as unknown[]).length).toBe(2);
  expect((await c.run("gate", "run", id, "--only", "ui-ux,bogus")).err.trim()).toBe("unknown gate: bogus");
  const status = await c.json("status");
  expect(status.data.judgement).toEqual([
    { gate: "ui-ux", status: "planned", planned: "interface files: src/App.vue", findings: 0 },
  ]);
  expect(status.data.decisions).toEqual([]);
  await c.run("decision", id, "add", "Which empty-state copy?", "--default", "the product's voice");
  await c.run("decide", id, "D-1", "the product's voice");
  await c.run("objection", id, "add", "the empty state hides the primary action", "--by", "fault-finder", "--severity", "advisory");
  const after = await c.json("status");
  expect(after.data.decisions).toEqual([
    { id: "D-1", question: "Which empty-state copy?", answer: "the product's voice", by: "user" },
  ]);
  expect(after.data.objections).toEqual([
    { id: "O-1", severity: "advisory", status: "open", text: "the empty state hides the primary action" },
  ]);
});
```

`packages/engine/tests/hooks-pre-tool-use.test.ts` (uses its local `setup`, `decision` helpers and `createWork`, `saveWork`):

```ts
test("SP2b: the review folder is the session's to write, and judgement and debate are not user-only", () => {
  const { root, ctx } = setup();
  const work = createWork(ctx.paths, "feature");
  work.route = "standard";
  work.phase = "gate";
  saveWork(ctx.paths, work);
  const review = join(root, ".crew", "work", work.id, "review", "ruling.json");
  expect(onPreToolUse(ctx, { tool_name: "Write", tool_input: { file_path: review } })).toEqual({});
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode: "default" });
  expect(bash(`crew judgement ${work.id} record --ruling .crew/work/${work.id}/review/ruling.json`)).toEqual({});
  expect(bash(`crew debate ${work.id} open --reason "who holds the permission"`)).toEqual({});
  expect(decision(bash(`echo x > .crew/work/${work.id}/evidence.json`))).toBe("deny");
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/fingerprint.test.ts packages/engine/tests/gates.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/cli.test.ts
crew tdd red <id> AC-3 -- bun test packages/engine/tests/cli.test.ts
```

- [ ] **Step 4: The diff**

Append to `packages/engine/src/fingerprint.ts` after `gitChangedSince`:

```ts
/** A new file as a patch, the way `git diff` shows an addition, so untracked files join the diff of the tracked ones. */
function additionPatch(root: string, path: string): string {
  let buffer: Buffer;
  try {
    buffer = readFileSync(join(root, path));
  } catch {
    return "";
  }
  const header = `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n`;
  if (buffer.subarray(0, 8000).includes(0)) return `${header}Binary files /dev/null and b/${path} differ\n`;
  const text = buffer.toString("utf8");
  if (text === "") return header;
  const lines = text.split("\n");
  const newlineAtEnd = lines.at(-1) === "";
  if (newlineAtEnd) lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  return `${header}@@ -0,0 +1,${lines.length} @@\n${body}\n${newlineAtEnd ? "" : "\\ No newline at end of file\n"}`;
}

/**
 * The unified diff of these paths since a base commit, the untracked ones as additions: what a
 * reviewer receives, the item's change and nothing else (SP2 §10). Empty where git cannot run.
 */
export function gitDiffSince(root: string, base: string, paths: readonly string[]): string {
  if (paths.length === 0) return "";
  const untracked = new Set(untrackedPaths(root) ?? []);
  const tracked = paths.filter((p) => !untracked.has(p));
  const parts: string[] = [];
  if (tracked.length) {
    const diff = gitTry(root, ["diff", "--no-renames", "--no-color", base, "--", ...tracked]);
    if (diff) parts.push(diff);
  }
  for (const path of paths) if (untracked.has(path)) parts.push(additionPatch(root, path));
  return parts.join("");
}
```

- [ ] **Step 5: The review inputs and the status rows**

`packages/engine/src/judgement.ts` gains imports (`join` from node:path; `gitDiffSince` from ./fingerprint.ts; `writeText` from ./fs.ts; `type CrewPaths, workDir` from ./paths.ts; `Evidence`, `WorkItem` types; `isSkipped` from ./work.ts) and, after `plannedJudgementGates`:

```ts
/** Where the review of an item lives: the engine's inputs, and the roles' answers the session saves beside them. Not engine-owned. */
export function reviewDir(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "review");
}

/**
 * What a reviewer receives, and nothing else (SP2 §10, finding 20): the diff of the item's change
 * since its base commit, untracked files as additions, and the list of changed watched paths.
 * Plain files, rewritten at every gate run; the session writes its rulings beside them.
 */
export function writeReviewInputs(paths: CrewPaths, work: WorkItem, changed: readonly string[]): string {
  const dir = reviewDir(paths, work.id);
  const patch = work.baseCommit ? gitDiffSince(paths.root, work.baseCommit, changed) : "";
  writeText(join(dir, "diff.patch"), patch);
  writeText(join(dir, "files.txt"), changed.length ? `${changed.join("\n")}\n` : "");
  return dir;
}

export type JudgementState = "planned" | "proven" | "not-proven" | "not-run" | "stale" | "skipped";
export interface JudgementRow {
  gate: JudgementGateName;
  status: JudgementState;
  /** Why the gate is planned for this item. */
  planned: string;
  findings: number;
  /** For not-run, the reviewer's reason; for skipped, the skip's. */
  reason?: string;
}

/** One row per planned judgement gate, as the status and the panel show them; derived, never stored. */
export function judgementRows(
  work: WorkItem,
  evidence: Evidence,
  planned: readonly PlannedJudgement[],
  currentFingerprint: string,
  policy: Policy,
): JudgementRow[] {
  return planned.map((p) => {
    const record = (evidence.judgement ?? []).find((j) => j.gate === p.gate);
    const findings = record?.findings.length ?? 0;
    if (isSkipped(work, `gate:${p.gate}`, policy)) {
      const skip = work.skips.find((s) => s.step === `gate:${p.gate}`);
      return { gate: p.gate, status: "skipped", planned: p.reason, findings, ...(skip?.reason ? { reason: skip.reason } : {}) };
    }
    if (!record) return { gate: p.gate, status: "planned", planned: p.reason, findings: 0 };
    if (record.fingerprint !== currentFingerprint) return { gate: p.gate, status: "stale", planned: p.reason, findings };
    return { gate: p.gate, status: record.verdict, planned: p.reason, findings, ...(record.reason ? { reason: record.reason } : {}) };
  });
}
```

- [ ] **Step 6: The gate run plans and writes**

`packages/engine/src/gates.ts`: import `plannedJudgementGates, writeReviewInputs` from `./judgement.ts`, `GATE_NAMES` and the types `JudgementGateName`, `PlannedJudgement`. `GateOutcome` gains `judgement: PlannedJudgement[]` and `review: string | null`. `runGates` takes `options: { only?: readonly (GateName | JudgementGateName)[]; tampered?: boolean }`; before the loop `const onlyGates = options.only?.filter((g): g is GateName => GATE_NAMES.includes(g as GateName));` and in the loop `if (onlyGates !== undefined && !onlyGates.includes(gate)) continue;` (replacing the `options.only` check). After `evidence.fingerprint = stamp;`:

```ts
  // Planned after the route may have been raised, so a risk area the diff touched plans the security gate.
  const judgement = plannedJudgementGates(work.route, work.riskAreas, changed, policy);
  const review = judgement.length ? writeReviewInputs(paths, work, changed) : null;
```

and return `{ evidence, ...verdict, planned, changed, raised, tampered, judgement, review }`. `Assessment` gains `judgement: PlannedJudgement[]` and `currentFingerprint: string`; `assess` computes `judgement` after `expected`, hoists `computeFingerprint(...)` into `currentFingerprint`, and returns both.

- [ ] **Step 7: The command and the status**

`packages/engine/src/cli.ts`: import `relative` from node:path, `judgementRows` from ./judgement.ts, `isSkipped` from ./work.ts, `isJudgementGateName` and the type `JudgementGateName`. In the `gate` case, the `--only` validation becomes:

```ts
      const unknown = only?.find((g) => !GATE_NAMES.includes(g as GateName) && !isJudgementGateName(g));
      if (unknown !== undefined) return refuse(`unknown gate: ${unknown}`);
```

and after the run, before the return:

```ts
      const review = outcome.review ? relative(env.paths.root, outcome.review).replace(/\\/g, "/") : null;
      // The judgement gates still to run, each with why it is planned: the cost is printed before
      // the roles run (SP2 §10). A current ruling or a counted skip takes a gate off the list.
      const pending = outcome.judgement.filter((j) => {
        const record = (outcome.evidence.judgement ?? []).find((r) => r.gate === j.gate);
        return !isSkipped(opened.work, `gate:${j.gate}`, env.policy) && (!record || record.fingerprint !== outcome.evidence.fingerprint);
      });
      const judgementNote = pending.length
        ? `\nJudgement gates to run: ${pending.map((j) => `${j.gate} (${j.reason})`).join(", ")}; inputs in ${review}/ (diff.patch, files.txt); record each with crew judgement ${opened.work.id} record --ruling <file>`
        : "";
```

`text` becomes `picked + raised + gateSummary(...) + judgementNote`; `data` gains `judgement: outcome.judgement, review`. In the `status` case, hoist `const ledger = loadLedger(env.paths, work.id).ledger;` and add after `skips`:

```ts
        judgement: judgementRows(work, result.evidence, result.judgement, result.currentFingerprint, env.policy),
        decisions: (work.decisions ?? []).map((d) => ({
          id: d.id,
          question: d.question,
          ...(d.answer !== undefined ? { answer: d.answer } : {}),
          ...(d.by ? { by: d.by } : {}),
        })),
        objections: ledger.objections.map((o) => ({
          id: o.id,
          severity: o.severity,
          status: objectionStatus(o, work, result.evidence, env.policy),
          text: o.text,
        })),
```

HELP's `gate run` line: `gate run <id> [--only a,b]            run the gates the route requires; plans the judgement gates and writes their inputs to .crew/work/<id>/review/`.

- [ ] **Step 8: Green, after, gate, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/fingerprint.test.ts packages/engine/tests/gates.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/cli.test.ts
crew tdd green <id> AC-3 -- bun test packages/engine/tests/cli.test.ts
crew tdd after <id> AC-4 -- bun test packages/engine/tests/gates.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/fingerprint.test.ts packages/engine/tests/hooks-pre-tool-use.test.ts
crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2b: a gate run hands the reviewers the item's change and prints the judgement gates to run

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Recording rulings, the verdict, the report, the skip

**Files:**
- Modify: `packages/engine/src/judgement.ts` (Ruling, parseRulings, plannedNote, stampRuling, notRunRecord, recordJudgement)
- Modify: `packages/engine/src/evidence.ts` (`VerdictInput.expectedJudgement`, `computeVerdict`, `renderReport` "Judgement gates" section)
- Modify: `packages/engine/src/gates.ts` (`runGates` and `assess` pass `expectedJudgement`)
- Modify: `packages/engine/src/cli.ts` (command `judgement`, `deliver` helper shared with `gate run`, `skipStep`, KNOWN_FLAGS, BOOLEAN_FLAGS, HELP)
- Test: `packages/engine/tests/judgement.test.ts`, `evidence.test.ts`, `cli.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `Assessment.judgement`, `.currentFingerprint`, `.changed` (Task 2); `isSkipped`; `readText` (fs.ts:17), `nowIso` (fs.ts:47), `emptyEvidence` (evidence.ts:51); `Env`, `Opened`, `openForChange` (cli.ts:169, :184, :280); `nextPhaseOf`, `advancePhase` (work.ts).
- Produces, in `judgement.ts`: `interface Ruling { gate: JudgementGateName; verdict: "proven" | "not-proven"; reviewer?: string; judge?: string; findings: Omit<JudgementFinding, "outside">[]; tokens?: number }`; `parseRulings(raw: unknown, planned: readonly JudgementGateName[]): { rulings: Ruling[] } | { refused: string }`; `plannedNote(planned): string`; `stampRuling(ruling, fingerprint, changed): JudgementRecord`; `notRunRecord(gate, reason, fingerprint): JudgementRecord`; `recordJudgement(evidence, record): void` (replaces the record of the same gate).
- Produces elsewhere: `VerdictInput.expectedJudgement?: PlannedJudgement[]`; verdict reasons `judgement gate <g> not run`, `… not run on the current code`, `… not proven (<n> finding(s))`, `… not run: <reason>`; the report's `## Judgement gates` after `## Gates`; CLI `crew judgement <id> record --ruling <file>` and `crew judgement <id> record <gate> --not-run --reason "<why>"`, exit 0 once the work is proven (like `gate run`); `skipStep` accepts judgement names.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 3: the rulings of the judgement gates are recorded through the engine, validated, stamped with the code they judged, judged by the verdict, shown in the report, and skippable only when the policy lists the gate" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "crew judgement record --ruling records each ruling of the file into evidence.json, stamped with the time and the current fingerprint, findings outside the change marked, replacing an earlier ruling for the same gate; it refuses an unknown gate, a gate not planned for the item, a verdict outside proven and not-proven, a finding without file or text, and a not-proven ruling with no defect; record <gate> --not-run --reason records a not-run ruling" --criterion "The verdict names every planned judgement gate not skipped: not run, not run on the current code, not proven with its number of findings, or not run with its reason; a current proven ruling on each leaves the item proven" --criterion "The report has a Judgement gates section after Gates with one row per ruling and one line per finding with its file, line, severity and whether it is outside the change" --criterion "crew skip accepts a judgement gate name, refuses it unless the policy lists it, and a counted skip takes the gate out of the verdict and of the gates to run" --preserve "The existing CLI, evidence, gates, judgement and work tests keep passing"
```

Spec, conclave, five `phase next`, `crew tdd before <id> AC-5 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts packages/engine/tests/gates.test.ts packages/engine/tests/judgement.test.ts packages/engine/tests/work.test.ts`.

- [ ] **Step 2: Write the failing tests**

`packages/engine/tests/judgement.test.ts` (imports gain `emptyEvidence` from ../src/evidence.ts; `notRunRecord, parseRulings, recordJudgement, stampRuling` from ../src/judgement.ts; types `Evidence`, `JudgementGateName`):

```ts
test("SP2b: a ruling file is checked before anything is recorded", () => {
  const planned: readonly JudgementGateName[] = ["code-quality", "test-quality"];
  const parse = (rulings: unknown) => parseRulings({ rulings }, planned);
  expect(parseRulings("x", planned)).toEqual({ refused: 'the ruling file is a JSON object with a "rulings" list' });
  expect(parse([])).toEqual({ refused: "the ruling file has no rulings" });
  expect(parse([{ gate: "style", verdict: "proven" }])).toEqual({
    refused: "ruling 1: unknown judgement gate: style (code-quality, test-quality, security, ui-ux, risk)",
  });
  expect(parse([{ gate: "ui-ux", verdict: "proven" }])).toEqual({
    refused: "ruling 1: ui-ux is not planned for this item (planned: code-quality, test-quality)",
  });
  expect(parse([{ gate: "code-quality", verdict: "maybe" }])).toEqual({
    refused: 'ruling 1 (code-quality): verdict is proven or not-proven, not maybe; a gate that could not run is recorded with crew judgement <id> record code-quality --not-run --reason "<why>"',
  });
  const finding = (f: Record<string, unknown>) => parse([{ gate: "code-quality", verdict: "proven", findings: [f] }]);
  expect(finding({ text: "x", severity: "advisory" })).toEqual({ refused: "finding 1 of code-quality: needs a file" });
  expect(finding({ file: "src/a.ts", severity: "advisory" })).toEqual({ refused: "finding 1 of code-quality: needs a text" });
  expect(finding({ file: "src/a.ts", text: "x", severity: "nit" })).toEqual({ refused: "finding 1 of code-quality: severity is defect or advisory" });
  expect(finding({ file: "src/a.ts", text: "x", severity: "defect", line: 0 })).toEqual({ refused: "finding 1 of code-quality: line is a positive integer" });
  expect(parse([{ gate: "code-quality", verdict: "not-proven", findings: [{ file: "src/a.ts", text: "x", severity: "advisory" }] }])).toEqual({
    refused: "ruling 1 (code-quality): not proven with no defect finding; the judge rules not proven on defects, or rules proven",
  });
  expect(parse([{ gate: "code-quality", verdict: "proven", tokens: "many" }])).toEqual({ refused: "ruling 1 (code-quality): tokens is a number" });
  expect(parse([{ gate: "code-quality", verdict: "proven" }, { gate: "code-quality", verdict: "proven" }])).toEqual({
    refused: "two rulings for code-quality in one file",
  });
  expect(
    parse([
      { gate: "code-quality", verdict: "proven", reviewer: "code-quality", judge: "judge", findings: [], tokens: 900 },
      { gate: "test-quality", verdict: "not-proven", findings: [{ file: "./tests/a.test.ts", line: 3, text: "passes by construction", severity: "defect" }] },
    ]),
  ).toEqual({
    rulings: [
      { gate: "code-quality", verdict: "proven", reviewer: "code-quality", judge: "judge", findings: [], tokens: 900 },
      { gate: "test-quality", verdict: "not-proven", findings: [{ file: "tests/a.test.ts", line: 3, text: "passes by construction", severity: "defect" }] },
    ],
  });
});

test("SP2b: a ruling is stamped with the code it judged, its findings outside the change marked, and it replaces the earlier ruling for the gate", () => {
  const ruling = {
    gate: "code-quality" as const,
    verdict: "not-proven" as const,
    findings: [
      { file: "src/a.ts", line: 1, text: "dead path", severity: "defect" as const },
      { file: "src/legacy.ts", text: "duplicated", severity: "defect" as const },
    ],
  };
  const record = stampRuling(ruling, "f1", ["src/a.ts"]);
  expect(record).toMatchObject({ gate: "code-quality", verdict: "not-proven", fingerprint: "f1" });
  expect(typeof record.at).toBe("string");
  expect(record.findings).toEqual([
    { file: "src/a.ts", line: 1, text: "dead path", severity: "defect" },
    { file: "src/legacy.ts", text: "duplicated", severity: "defect", outside: true },
  ]);
  const evidence: Evidence = emptyEvidence();
  recordJudgement(evidence, record);
  recordJudgement(evidence, notRunRecord("ui-ux", "no browser", "f1"));
  recordJudgement(evidence, stampRuling({ ...ruling, verdict: "proven", findings: [] }, "f2", ["src/a.ts"]));
  expect(evidence.judgement?.map((j) => `${j.gate}:${j.verdict}:${j.fingerprint}`)).toEqual(["ui-ux:not-run:f1", "code-quality:proven:f2"]);
  expect(evidence.judgement?.[0]).toMatchObject({ reason: "no browser", findings: [] });
});
```

`packages/engine/tests/evidence.test.ts` (add the `JudgementRecord` type and `addSkip`; it has `gate()`, `workWith()`, `run`, `emptyEvidence`):

```ts
const ruling = (gate: JudgementRecord["gate"], verdict: JudgementRecord["verdict"], extra: Partial<JudgementRecord> = {}): JudgementRecord =>
  ({ gate, verdict, findings: [], at: "t", fingerprint: "f", ...extra });

test("SP2b: a planned judgement gate is named until a current ruling proves it, and the report shows the rulings and their findings", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const expectedJudgement = [
    { gate: "code-quality" as const, reason: "standard route" },
    { gate: "test-quality" as const, reason: "standard route" },
    { gate: "security" as const, reason: "risk area auth" },
    { gate: "ui-ux" as const, reason: "interface files: a.vue" },
  ];
  const base: Evidence = { ...emptyEvidence(), fingerprint: "f", tdd: [{ criterion: "AC-1", red: run, green: run }], runs: [gate("test", "pass")] };
  const input = { work, evidence: base, expected: [{ gate: "test" as const, target: "." }], expectedJudgement, currentFingerprint: "f", tampered: false, policy: DEFAULT_POLICY };
  expect(computeVerdict(input).unproven).toEqual([
    "judgement gate code-quality not run",
    "judgement gate test-quality not run",
    "judgement gate security not run",
    "judgement gate ui-ux not run",
  ]);
  const defect = { file: "src/a.ts", line: 12, text: "two reasons to change", severity: "defect" as const };
  const judged: Evidence = {
    ...base,
    judgement: [
      ruling("code-quality", "proven", { reviewer: "code-quality", judge: "judge", tokens: 1200 }),
      ruling("test-quality", "not-proven", { findings: [defect, { ...defect, file: "src/b.ts", severity: "advisory", outside: true }] }),
      ruling("security", "proven", { fingerprint: "old" }),
      ruling("ui-ux", "not-run", { reason: "no browser" }),
    ],
  };
  expect(computeVerdict({ ...input, evidence: judged }).unproven).toEqual([
    "judgement gate test-quality not proven (2 findings)",
    "judgement gate security not run on the current code",
    "judgement gate ui-ux not run: no browser",
  ]);
  // Code changed since the last gate run: that one reason stands for every ruling on older code.
  expect(computeVerdict({ ...input, evidence: judged, currentFingerprint: "g" }).unproven).toEqual([
    "code changed since the last gate run",
    "judgement gate test-quality not proven (2 findings)",
    "judgement gate ui-ux not run: no browser",
  ]);
  // A person's skip takes a gate out; a current proven ruling on the rest proves the item.
  addSkip(work, "gate:ui-ux", "no browser in this session");
  const fixed: Evidence = {
    ...judged,
    judgement: [
      ruling("code-quality", "proven"),
      ruling("test-quality", "proven", { findings: [{ ...defect, severity: "advisory" }] }),
      ruling("security", "proven"),
      ruling("ui-ux", "not-run", { reason: "no browser" }),
    ],
  };
  expect(computeVerdict({ ...input, evidence: fixed })).toEqual({ verdict: "proven", unproven: [] });

  const report = renderReport(work, { ...judged, verdict: "unproven", unproven: [] }, DEFAULT_POLICY);
  expect(report).toContain("## Judgement gates");
  expect(report).toContain("| Gate | Verdict | Reviewer | Findings | Tokens |");
  expect(report).toContain("| code-quality | proven | code-quality | 0 | 1200 |");
  expect(report).toContain("| test-quality | not proven |  | 2 |  |");
  expect(report).toContain("| ui-ux | not run: no browser |  | 0 |  |");
  expect(report).toContain("- test-quality: src/a.ts:12 two reasons to change (defect)");
  expect(report).toContain("- test-quality: src/b.ts:12 two reasons to change (advisory, outside the change)");
  expect(report.indexOf("## Gates")).toBeLessThan(report.indexOf("## Judgement gates"));
  expect(renderReport(work, base, DEFAULT_POLICY)).not.toContain("## Judgement gates");
});
```

`packages/engine/tests/cli.test.ts`:

```ts
test("SP2b: judgement rulings are recorded from a file, judged by the verdict, shown in the report, and go stale with the code", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/App.vue": "<template/>" });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data.id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  const first = await c.json("gate", "run", id);
  expect(first.code).toBe(1);
  expect(first.data.unproven).toEqual(["judgement gate ui-ux not run"]);
  expect((await c.json("status")).data.phase).toBe("gate");
  const file = join(root, ".crew", "work", id, "review", "ruling.json");
  const ruling = (rulings: unknown[]) => writeFileSync(file, JSON.stringify({ rulings }));
  ruling([{ gate: "code-quality", verdict: "proven" }]);
  expect((await c.run("judgement", id, "record", "--ruling", file)).err.trim()).toBe("ruling 1: code-quality is not planned for this item (planned: ui-ux)");
  writeFileSync(file, "{not json");
  expect((await c.run("judgement", id, "record", "--ruling", file)).err.trim()).toBe(`the ruling file is not valid JSON: ${file}`);
  const missing = join(root, "nope.json");
  expect((await c.run("judgement", id, "record", "--ruling", missing)).err.trim()).toBe(`no ruling file at ${missing}`);
  ruling([{ gate: "ui-ux", verdict: "not-proven", findings: [{ file: "src/App.vue", text: "no loading state", severity: "advisory" }] }]);
  expect((await c.run("judgement", id, "record", "--ruling", file)).err).toContain("not proven with no defect finding");
  // Not proven, with a finding outside the change: recorded as the judge ruled, the finding marked.
  ruling([{
    gate: "ui-ux", verdict: "not-proven", reviewer: "ui-ux", judge: "judge", tokens: 800,
    findings: [
      { file: "src/App.vue", line: 1, text: "no empty-state copy", severity: "defect" },
      { file: "src/legacy.vue", text: "unlabelled button", severity: "advisory" },
    ],
  }]);
  const notProven = await c.json("judgement", id, "record", "--ruling", file);
  expect(notProven.code).toBe(1);
  expect(notProven.data.unproven).toEqual(["judgement gate ui-ux not proven (2 findings)"]);
  const records = notProven.data.records as { findings: { outside?: boolean }[] }[];
  expect(records[0]?.findings.map((f) => f.outside ?? false)).toEqual([false, true]);
  const report = () => readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8");
  expect(report()).toContain("| ui-ux | not proven | ui-ux | 2 | 800 |");
  expect(report()).toContain("- ui-ux: src/legacy.vue unlabelled button (advisory, outside the change)");
  expect((await c.json("status")).data.judgement).toEqual([{ gate: "ui-ux", status: "not-proven", planned: "interface files: src/App.vue", findings: 2 }]);
  // The judge rules proven on a second look: the record that proves the work delivers it.
  ruling([{ gate: "ui-ux", verdict: "proven", reviewer: "ui-ux", judge: "judge", tokens: 400, findings: [] }]);
  const proven = await c.json("judgement", id, "record", "--ruling", file);
  expect(proven.code).toBe(0);
  expect(proven.data.verdict).toBe("proven");
  expect((await c.json("status")).data.phase).toBe("deliver");
  expect(report()).toContain("**Proven**");
  // The code changes: the ruling is on other code until the roles look again.
  write(root, "src/App.vue", "<template>empty, again</template>");
  expect((await c.json("status")).data.unproven).toEqual(["code changed since the last gate run"]);
  expect((await c.json("status")).data.judgement).toEqual([{ gate: "ui-ux", status: "stale", planned: "interface files: src/App.vue", findings: 0 }]);
  const again = await c.json("gate", "run", id);
  expect(again.data.unproven).toEqual(["judgement gate ui-ux not run on the current code"]);
  expect((await c.run("gate", "run", id)).out).toContain("Judgement gates to run: ui-ux (interface files: src/App.vue)");
  // A gate that could not run is not run, with the reason, never passed.
  const notRun = await c.json("judgement", id, "record", "ui-ux", "--not-run", "--reason", "no browser in this session");
  expect(notRun.code).toBe(1);
  expect(notRun.data.unproven).toEqual(["judgement gate ui-ux not run: no browser in this session"]);
  expect(report()).toContain("| ui-ux | not run: no browser in this session |  | 0 |  |");
  expect((await c.run("judgement", id, "record", "risk", "--not-run", "--reason", "x")).err.trim()).toBe("risk is not planned for this item (planned: ui-ux)");
  // A hand edit of the evidence is caught, as for any engine-owned file.
  const evidenceFile = join(root, ".crew", "work", id, "evidence.json");
  writeFileSync(evidenceFile, readFileSync(evidenceFile, "utf8").replace('"not-run"', '"proven"'));
  expect((await c.json("status")).data.unproven).toContain("state changed outside the engine");
});

test("SP2b: a judgement gate is skipped only when the policy lists it, and the verdict then passes over it", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/App.vue": "<template/>" });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data.id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  const refused = await c.run("skip", id, "gate:ui-ux", "--reason", "no browser");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("the team policy does not allow skipping gate:ui-ux: gates are mandatory");
  expect((await c.run("skip", id, "ui-ux", "--reason", "no browser")).code).toBe(1);
  expect((await c.run("skip", id, "gate:nope", "--reason", "x")).err.trim()).toBe("unknown step: gate:nope");
  write(root, ".crew/policy.json", JSON.stringify({ allowSkips: ["tdd", "ui-ux"] }));
  expect((await c.run("policy", "accept")).code).toBe(0);
  const skipped = await c.json("skip", id, "ui-ux", "--reason", "no browser");
  expect((skipped.data.skips as { step: string }[]).at(-1)?.step).toBe("gate:ui-ux");
  expect((await c.json("gate", "run", id)).data.verdict).toBe("proven");
  expect((await c.run("gate", "run", id)).out).not.toContain("Judgement gates to run");
  expect((await c.json("status")).data.judgement).toEqual([
    { gate: "ui-ux", status: "skipped", planned: "interface files: src/App.vue", findings: 0, reason: "no browser" },
  ]);
});
```

(The skip refusal wording is the existing one at cli.ts:914; the `unknown step` wording is the existing `skipStep` refusal: copy both exactly from the code when writing the test.)

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/judgement.test.ts packages/engine/tests/cli.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/evidence.test.ts
crew tdd red <id> AC-3 -- bun test packages/engine/tests/evidence.test.ts
crew tdd red <id> AC-4 -- bun test packages/engine/tests/cli.test.ts
```

- [ ] **Step 4: The rulings**

`packages/engine/src/judgement.ts` (imports gain `nowIso` from ./fs.ts, `JUDGEMENT_GATES, isJudgementGateName` and the types `JudgementFinding, JudgementRecord`):

```ts
type Raw = Record<string, unknown>;
function isRecord(value: unknown): value is Raw {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A ruling as a review file states it: the judge's verdict on a planned gate, with the reviewer's findings. */
export interface Ruling {
  gate: JudgementGateName;
  verdict: "proven" | "not-proven";
  reviewer?: string;
  judge?: string;
  findings: Omit<JudgementFinding, "outside">[];
  tokens?: number;
}

/**
 * The rulings of a review file, checked before anything is recorded: every gate known and planned
 * for this item, every verdict one the judge may give, every finding tied to a file with a text,
 * and no "not proven" without a defect to show for it (SP2 §10: the judge rules on findings, so a
 * reviewer's volume never becomes a verdict and a bare "no" never does either).
 */
export function parseRulings(raw: unknown, planned: readonly JudgementGateName[]): { rulings: Ruling[] } | { refused: string } {
  if (!isRecord(raw) || !Array.isArray(raw.rulings)) return { refused: 'the ruling file is a JSON object with a "rulings" list' };
  if (raw.rulings.length === 0) return { refused: "the ruling file has no rulings" };
  const rulings: Ruling[] = [];
  for (const [index, entry] of raw.rulings.entries()) {
    const where = `ruling ${index + 1}`;
    if (!isRecord(entry)) return { refused: `${where}: not an object` };
    const gate = entry.gate;
    if (!isJudgementGateName(gate)) return { refused: `${where}: unknown judgement gate: ${String(gate)} (${JUDGEMENT_GATES.join(", ")})` };
    if (!planned.includes(gate)) return { refused: `${where}: ${gate} is not planned for this item${plannedNote(planned)}` };
    const verdict = entry.verdict;
    if (verdict !== "proven" && verdict !== "not-proven")
      return { refused: `${where} (${gate}): verdict is proven or not-proven, not ${String(verdict)}; a gate that could not run is recorded with crew judgement <id> record ${gate} --not-run --reason "<why>"` };
    const rawFindings = entry.findings ?? [];
    if (!Array.isArray(rawFindings)) return { refused: `${where} (${gate}): findings is a list` };
    const findings: Ruling["findings"] = [];
    for (const [n, f] of rawFindings.entries()) {
      const at = `finding ${n + 1} of ${gate}`;
      if (!isRecord(f)) return { refused: `${at}: not an object` };
      if (typeof f.file !== "string" || !f.file.trim()) return { refused: `${at}: needs a file` };
      if (typeof f.text !== "string" || !f.text.trim()) return { refused: `${at}: needs a text` };
      if (f.severity !== "defect" && f.severity !== "advisory") return { refused: `${at}: severity is defect or advisory` };
      const line = f.line;
      if (line !== undefined && !(typeof line === "number" && Number.isInteger(line) && line > 0)) return { refused: `${at}: line is a positive integer` };
      findings.push({ file: f.file.trim().replace(/^\.\//, ""), ...(typeof line === "number" ? { line } : {}), text: f.text.trim(), severity: f.severity });
    }
    if (verdict === "not-proven" && !findings.some((f) => f.severity === "defect"))
      return { refused: `${where} (${gate}): not proven with no defect finding; the judge rules not proven on defects, or rules proven` };
    const tokens = entry.tokens;
    if (tokens !== undefined && !(typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0)) return { refused: `${where} (${gate}): tokens is a number` };
    if (rulings.some((r) => r.gate === gate)) return { refused: `two rulings for ${gate} in one file` };
    rulings.push({
      gate, verdict,
      ...(typeof entry.reviewer === "string" ? { reviewer: entry.reviewer } : {}),
      ...(typeof entry.judge === "string" ? { judge: entry.judge } : {}),
      findings,
      ...(typeof tokens === "number" ? { tokens } : {}),
    });
  }
  return { rulings };
}

/** " (planned: a, b)" or " (none is planned)", for a refusal that names a gate the item does not need. */
export function plannedNote(planned: readonly JudgementGateName[]): string {
  return planned.length ? ` (planned: ${planned.join(", ")})` : " (none is planned)";
}

/**
 * The record the engine keeps: the ruling as given, stamped with when and on which code, each
 * finding on a file outside the change marked (ADR 0006: debt is reported, not failed on; the
 * verdict stays the judge's).
 */
export function stampRuling(ruling: Ruling, fingerprint: string, changed: readonly string[]): JudgementRecord {
  return {
    gate: ruling.gate,
    verdict: ruling.verdict,
    ...(ruling.reviewer ? { reviewer: ruling.reviewer } : {}),
    ...(ruling.judge ? { judge: ruling.judge } : {}),
    findings: ruling.findings.map((f) => (changed.includes(f.file) ? { ...f } : { ...f, outside: true })),
    ...(ruling.tokens !== undefined ? { tokens: ruling.tokens } : {}),
    at: nowIso(),
    fingerprint,
  };
}

/** A gate that could not run: not run, with the reason, never passed by default (SP2 §10). */
export function notRunRecord(gate: JudgementGateName, reason: string, fingerprint: string): JudgementRecord {
  return { gate, verdict: "not-run", reason: reason.trim(), findings: [], at: nowIso(), fingerprint };
}

/** A later ruling on a gate supersedes the earlier one, as a later gate run does. */
export function recordJudgement(evidence: Evidence, record: JudgementRecord): void {
  evidence.judgement = [...(evidence.judgement ?? []).filter((j) => j.gate !== record.gate), record];
}
```

- [ ] **Step 5: The verdict and the report**

`packages/engine/src/evidence.ts`: `VerdictInput` gains `/** The judgement gates planned for the item; each is a reason until a current ruling says proven (SP2 §10). */ expectedJudgement?: PlannedJudgement[];`. In `computeVerdict`, after the deterministic gates loop and before the objections (the local `stale` at evidence.ts:127 already exists):

```ts
  // A judgement gate is proven by a ruling on this code, never by default (SP2 §10): each planned
  // one not skipped is named until a current ruling says proven.
  for (const { gate } of input.expectedJudgement ?? []) {
    if (isSkipped(work, `gate:${gate}`, policy)) continue;
    const record = (evidence.judgement ?? []).find((j) => j.gate === gate);
    if (!record) unproven.push(`judgement gate ${gate} not run`);
    else if (record.fingerprint !== currentFingerprint && !stale) unproven.push(`judgement gate ${gate} not run on the current code`);
    else if (record.verdict === "not-proven") {
      const n = record.findings.length;
      unproven.push(`judgement gate ${gate} not proven (${n} finding${n === 1 ? "" : "s"})`);
    } else if (record.verdict === "not-run") unproven.push(`judgement gate ${gate} not run: ${record.reason ?? "no reason given"}`);
  }
```

In `renderReport`, after the Gates table (evidence.ts:272), before the Gap round block:

```ts
  // The rulings as the judge gave them; a finding outside the change is named as such, never hidden (ADR 0006).
  const judgement = evidence.judgement ?? [];
  if (judgement.length) {
    lines.push("", "## Judgement gates", "", "| Gate | Verdict | Reviewer | Findings | Tokens |", "| :- | :- | :- | -: | -: |");
    for (const j of judgement) {
      const verdict = j.verdict === "not-run" ? `not run: ${j.reason ?? "no reason given"}` : j.verdict === "not-proven" ? "not proven" : "proven";
      lines.push(`| ${j.gate} | ${verdict} | ${j.reviewer ?? ""} | ${j.findings.length} | ${j.tokens ?? ""} |`);
    }
    const findings = judgement.flatMap((j) => j.findings.map((f) => ({ gate: j.gate, ...f })));
    if (findings.length) lines.push("");
    for (const f of findings)
      lines.push(`- ${f.gate}: ${f.file}${f.line ? `:${f.line}` : ""} ${f.text} (${f.severity}${f.outside ? ", outside the change" : ""})`);
  }
```

`packages/engine/src/gates.ts`: `runGates` and `assess` pass `expectedJudgement: judgement` to `computeVerdict`.

- [ ] **Step 6: The command, the delivery helper, the skip**

`packages/engine/src/cli.ts`:
- `BOOLEAN_FLAGS` gains `"not-run"`; `KNOWN_FLAGS` gains `judgement: ["ruling", "not-run", "reason"]`.
- Imports: `notRunRecord, parseRulings, plannedNote, recordJudgement, stampRuling` from ./judgement.ts; `JUDGEMENT_GATES`; types `Evidence`, `JudgementRecord`.
- `skipStep`: a gate name is valid when `GATE_NAMES.includes(name) || isJudgementGateName(name)`.
- A helper after `guardContext`, replacing the inline block in the `gate` case (the phase loop at cli.ts:862-865, `saveWork`, the `writeProtectedText(... renderReport ...)` at :868):

```ts
/**
 * A proving step is also the work's delivery: the phase moves as far as the guards allow (a gate run
 * is the work entering its gate phase; an item already in gate is delivered by the step that proves
 * it, finding 18) and the report is written. Shared by the gate run and the judgement record.
 */
function deliver(env: Env, opened: Opened, evidence: Evidence): void {
  for (const target of ["gate", "deliver"] as const) {
    if (nextPhaseOf(opened.work) !== target) continue;
    if (!advancePhase(opened.work, guardContext(env, opened.work, opened.tampered)).ok) break;
  }
  saveWork(env.paths, opened.work);
  writeProtectedText(env.paths, join(workDir(env.paths, opened.work.id), "report.md"), renderReport(opened.work, evidence, env.policy, loadLedger(env.paths, opened.work.id).ledger));
}
```

- The new case after `gate`:

```ts
    case "judgement": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage = 'usage: crew judgement <id> record --ruling <file> | crew judgement <id> record <gate> --not-run --reason "<why>"';
      if (args[1] !== "record") return refuse(usage);
      const before = assess(env.paths, opened.work, env.profile, env.policy, env.tampered || opened.tampered);
      const planned = before.judgement.map((j) => j.gate);
      const records: JudgementRecord[] = [];
      if (parsed.flags["not-run"]) {
        const gate = args[2];
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!gate || !reason) return refuse(usage);
        if (!isJudgementGateName(gate)) return refuse(`unknown judgement gate: ${gate} (${JUDGEMENT_GATES.join(", ")})`);
        if (!planned.includes(gate)) return refuse(`${gate} is not planned for this item${plannedNote(planned)}`);
        records.push(notRunRecord(gate, reason, before.currentFingerprint));
      } else {
        if (typeof parsed.flags.ruling !== "string") return refuse(usage);
        const text = readText(resolve(io.cwd, parsed.flags.ruling));
        if (text === null) return refuse(`no ruling file at ${parsed.flags.ruling}`);
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          return refuse(`the ruling file is not valid JSON: ${parsed.flags.ruling}`);
        }
        const parsedRulings = parseRulings(raw, planned);
        if ("refused" in parsedRulings) return refuse(parsedRulings.refused);
        for (const ruling of parsedRulings.rulings) records.push(stampRuling(ruling, before.currentFingerprint, before.changed));
      }
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      for (const record of records) recordJudgement(evidence, record);
      saveEvidence(env.paths, opened.work.id, evidence);
      // The verdict as it stands with the rulings in; a record that proves the work delivers it.
      const result = assess(env.paths, opened.work, env.profile, env.policy, env.tampered || opened.tampered);
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      saveEvidence(env.paths, opened.work.id, result.evidence);
      deliver(env, opened, result.evidence);
      const lines = records.map((r) => {
        const outside = r.findings.filter((f) => f.outside).length;
        const detail = r.verdict === "not-run" ? `: ${r.reason}` : ` (${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}${outside ? `, ${outside} outside the change` : ""})`;
        const word = r.verdict === "not-proven" ? "not proven" : r.verdict === "not-run" ? "not run" : "proven";
        return `  ${r.gate}: ${word}${detail}`;
      });
      lines.push(result.verdict === "proven" ? `Proven: ${opened.work.id}` : `Not proven: ${result.unproven.join("; ")}`);
      // Like gate run: the exit code says whether the work is proven, so a chain stops at "Not proven".
      return { code: result.verdict === "proven" ? 0 : 1, stdout: true, text: lines.join("\n"), data: { records, verdict: result.verdict, unproven: result.unproven } };
    }
```

- HELP gains, after `gate run`:

```
  judgement <id> record --ruling <file>  record the rulings of a review file ({"rulings":[{gate,verdict,reviewer,judge,findings,tokens}]}); exit 0 once proven
  judgement <id> record <gate> --not-run --reason "<why>"   a judgement gate that could not run, never passed by default
```

and the `skip` line reads `skip <id> <step> --reason "<text>"    record a skip of a tdd step, a gate or a judgement gate (asks the user; --mode as for approve)`.

- [ ] **Step 7: Green, after, gate, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/judgement.test.ts packages/engine/tests/cli.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/evidence.test.ts
crew tdd green <id> AC-3 -- bun test packages/engine/tests/evidence.test.ts
crew tdd green <id> AC-4 -- bun test packages/engine/tests/cli.test.ts
crew tdd after <id> AC-5 -- bun test packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts packages/engine/tests/gates.test.ts packages/engine/tests/judgement.test.ts packages/engine/tests/work.test.ts
crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2b: judgement rulings recorded through the engine, judged by the verdict, shown in the report

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: The debate record

**Files:**
- Modify: `packages/engine/src/types.ts` (Debate; `WorkItem.debate`)
- Modify: `packages/engine/src/work.ts` (DebateState, debateState, openDebate, closeDebate; plan guard)
- Modify: `packages/engine/src/evidence.ts` (Gap round: the Debate line)
- Modify: `packages/engine/src/cli.ts` (command `debate`, KNOWN_FLAGS, status `debate`, HELP)
- Test: `packages/engine/tests/work.test.ts`, `evidence.test.ts`, `cli.test.ts`

**Interfaces:**
- Produces, in `types.ts`: `interface Debate { openedAt: string; reason: string; closedAt?: string; tokens?: number }`; `WorkItem.debate?: Debate`.
- Produces, in `work.ts`: `type DebateState = "none" | "open" | "closed"`; `debateState(work): DebateState`; `openDebate(work, reason): Debate | { refused: string }` (once per item); `closeDebate(work, tokens?): Debate | { refused: string }`; the plan guard adds `the debate is open (<reason>); close it with the judge's ruling (crew debate <id> close [--tokens n])`.
- Produces elsewhere: the report's Gap round section renders when there are decisions or a debate and ends with `- Debate: none` or `- Debate: opened (<reason>), open|closed[, <n> tokens]`; CLI `crew debate <id> open --reason "<why>"`, `crew debate <id> close [--tokens n]`; `status --json` gains `debate: DebateState`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 4: the engine records the conclave's debate, when and why it opened and when it closed with its cost, holds the plan while it is open, and says so in the report and the status" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "crew debate open --reason records when and why the debate opened, once per item, and crew debate close --tokens records its close and cost; entering plan is refused while the debate is open" --criterion "The report's Gap round section says Debate: none, or opened with its reason and whether it closed and what it cost, and status --json carries debate none, open or closed" --preserve "The existing work, CLI and evidence tests keep passing"
```

Spec, conclave, five `phase next`, `crew tdd before <id> AC-3 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts`.

- [ ] **Step 2: Write the failing tests**

`packages/engine/tests/work.test.ts` (import `closeDebate, debateState, openDebate`; it has `empty: GuardContext` at :41 and `applyClassification`):

```ts
test("SP2b: the debate opens once with a reason, closes with its cost, and holds the plan while open", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "standard", reasons: [], riskAreas: [] });
  work.phase = "conclave";
  const conclave = "## Assumed by good practice\nnone\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n";
  const ctx = { ...empty, conclaveText: conclave };
  expect(debateState(work)).toBe("none");
  expect(guardFor(work, "plan", ctx)).toEqual([]);
  expect(openDebate(work, "  ")).toEqual({ refused: "a debate opens for a reason: the decision with consequences" });
  expect(openDebate(work, "which models are hard-deleted")).toMatchObject({ reason: "which models are hard-deleted" });
  expect(debateState(work)).toBe("open");
  expect(guardFor(work, "plan", ctx)).toEqual([
    "the debate is open (which models are hard-deleted); close it with the judge's ruling (crew debate <id> close [--tokens n])",
  ]);
  expect(openDebate(work, "again")).toMatchObject({ refused: expect.stringContaining("the debate is already open") });
  expect(closeDebate(work, 5400)).toMatchObject({ tokens: 5400 });
  expect(typeof work.debate?.closedAt).toBe("string");
  expect(debateState(work)).toBe("closed");
  expect(guardFor(work, "plan", ctx)).toEqual([]);
  expect(closeDebate(work)).toEqual({ refused: "the debate is already closed" });
  expect(openDebate(work, "once more")).toEqual({ refused: "the debate is closed; it opens once per item" });
  expect(closeDebate(createWork(paths, "other"))).toEqual({ refused: 'no debate is open (crew debate <id> open --reason "<why>")' });
  saveWork(paths, work);
  expect(loadWork(paths, work.id).work?.debate).toMatchObject({ reason: "which models are hard-deleted", tokens: 5400 });
});
```

`packages/engine/tests/evidence.test.ts` (import `addDecision, closeDebate, openDebate` from ../src/work.ts):

```ts
test("SP2b: the gap round section says whether the debate opened, why, and whether it closed", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  expect(renderReport(work, evidence, DEFAULT_POLICY)).not.toContain("## Gap round");
  addDecision(work, "Erasure or deactivation?", "deactivation");
  expect(renderReport(work, evidence, DEFAULT_POLICY)).toContain("- Debate: none");
  openDebate(work, "erasure or deactivation changes what is deleted");
  expect(renderReport(work, evidence, DEFAULT_POLICY)).toContain("- Debate: opened (erasure or deactivation changes what is deleted), open");
  closeDebate(work, 5400);
  const report = renderReport(work, evidence, DEFAULT_POLICY);
  expect(report).toContain("- Debate: opened (erasure or deactivation changes what is deleted), closed, 5400 tokens");
  expect(report.indexOf("- D-1:")).toBeLessThan(report.indexOf("- Debate:"));
  const other = workWith(paths);
  openDebate(other, "the user asked for it");
  expect(renderReport(other, evidence, DEFAULT_POLICY)).toContain("## Gap round");
});
```

`packages/engine/tests/cli.test.ts`:

```ts
test("SP2b: debate open and close through the command; plan waits while the debate is open; status says so", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/a.ts": "x" });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Delete accounts", "--answers", standard)).data.id as string;
  for (let i = 0; i < 3; i++) await c.run("phase", id, "next");
  expect((await c.json("status")).data.phase).toBe("conclave");
  write(root, `.crew/work/${id}/conclave.md`, "# Gap round\n\n## Assumed by good practice\nnone\n\n## Decisions only the user can make\nnone\n\n## Proposals\nnone\n\n## Warnings\nnone\n");
  expect((await c.json("status")).data.debate).toBe("none");
  expect((await c.run("debate", id, "open")).code).toBe(1);
  const opened = await c.json("debate", id, "open", "--reason", "erasure or deactivation");
  expect(opened.code).toBe(0);
  expect(opened.data.debate).toMatchObject({ reason: "erasure or deactivation" });
  expect((await c.json("status")).data.debate).toBe("open");
  const refused = await c.run("phase", id, "next");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("the debate is open (erasure or deactivation)");
  expect((await c.run("debate", id, "close", "--tokens", "lots")).err.trim()).toBe("--tokens is a number");
  const closed = await c.json("debate", id, "close", "--tokens", "5400");
  expect(closed.data.debate).toMatchObject({ reason: "erasure or deactivation", tokens: 5400 });
  expect((await c.json("status")).data.debate).toBe("closed");
  expect((await c.json("phase", id, "next")).data.phase).toBe("plan");
  expect((await c.run("debate", id, "open", "--reason", "again")).err.trim()).toBe("the debate is closed; it opens once per item");
});
```

(The spec phase needs `spec.md` before `phase next` into conclave in the standard route: write it in the test as the existing SP2a conclave tests do, copying their helper lines.)

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/evidence.test.ts packages/engine/tests/cli.test.ts
```

- [ ] **Step 4: Implement**

`types.ts`, before `WorkItem`: `/** The debate of the conclave (SP2 §7): when it opened and why, when it closed, and what it cost. */ export interface Debate { openedAt: string; reason: string; closedAt?: string; tokens?: number }`; in `WorkItem` after `decisions`: `/** The debate, when the gap round found a decision with consequences. Absent before 0.4.0 and when none opened. */ debate?: Debate;`.

`work.ts`, after `unansweredDecisions`:

```ts
export type DebateState = "none" | "open" | "closed";

export function debateState(work: WorkItem): DebateState {
  if (!work.debate) return "none";
  return work.debate.closedAt ? "closed" : "open";
}

/** Opens the debate, once per item: a decision with consequences is the reason, never the route (SP2 §7). */
export function openDebate(work: WorkItem, reason: string): Debate | { refused: string } {
  const current = work.debate;
  if (current) {
    return { refused: current.closedAt ? "the debate is closed; it opens once per item" : `the debate is already open (${current.openedAt}): ${current.reason}` };
  }
  if (!reason.trim()) return { refused: "a debate opens for a reason: the decision with consequences" };
  work.debate = { openedAt: nowIso(), reason: reason.trim() };
  return work.debate;
}

/** Closes the debate once the judge has ruled, keeping what the round cost when known, so the eval can report it. */
export function closeDebate(work: WorkItem, tokens?: number): Debate | { refused: string } {
  const debate = work.debate;
  if (!debate) return { refused: 'no debate is open (crew debate <id> open --reason "<why>")' };
  if (debate.closedAt) return { refused: "the debate is already closed" };
  debate.closedAt = nowIso();
  if (tokens !== undefined) debate.tokens = tokens;
  return debate;
}
```

In `guardFor`'s `plan` branch, after the objections block:

```ts
    // The judge's ruling comes before the plan: an open debate is a decision still being taken (SP2 §7).
    if (debateState(work) === "open")
      missing.push(`the debate is open (${work.debate?.reason ?? ""}); close it with the judge's ruling (crew debate <id> close [--tokens n])`);
```

`evidence.ts`, the Gap round block renders when `decisions.length || work.debate` and ends with:

```ts
    const debate = work.debate;
    lines.push(debate ? `- Debate: opened (${debate.reason}), ${debate.closedAt ? "closed" : "open"}${debate.tokens !== undefined ? `, ${debate.tokens} tokens` : ""}` : "- Debate: none");
```

`cli.ts`: `KNOWN_FLAGS` gains `debate: ["reason", "tokens"]`; import `closeDebate, debateState, openDebate`; status data gains `debate: debateState(work)` after `awaiting`; the new case:

```ts
    case "debate": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const usage = 'usage: crew debate <id> open --reason "<why>" | crew debate <id> close [--tokens n]';
      if (args[1] === "open") {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!reason) return refuse(usage);
        const result = openDebate(opened.work, reason);
        if ("refused" in result) return refuse(result.refused);
        saveWork(env.paths, opened.work);
        return ok(`debate open on ${opened.work.id}: ${result.reason}`, { debate: result });
      }
      if (args[1] === "close") {
        const flag = parsed.flags.tokens;
        const tokens = flag === undefined ? undefined : typeof flag === "string" ? Number(flag) : Number.NaN;
        if (tokens !== undefined && !(Number.isFinite(tokens) && tokens >= 0)) return refuse("--tokens is a number");
        const result = closeDebate(opened.work, tokens);
        if ("refused" in result) return refuse(result.refused);
        saveWork(env.paths, opened.work);
        return ok(`debate closed on ${opened.work.id}${tokens !== undefined ? ` (${tokens} tokens)` : ""}`, { debate: result });
      }
      return refuse(usage);
    }
```

HELP, after the `objection … waive` line:

```
  debate <id> open --reason "<why>"     the conclave's debate opens on a decision with consequences (once per item)
  debate <id> close [--tokens n]        the judge has ruled; plan is held while the debate is open
```

- [ ] **Step 5: Green, after, gate, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/evidence.test.ts packages/engine/tests/cli.test.ts
crew tdd after <id> AC-3 -- bun test packages/engine/tests/work.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/evidence.test.ts
crew gate run <id>
git add -A packages/engine plugins/core && git commit -m "SP2b: the debate record, held before the plan, in the report and the status

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Rubrics, the five reviewers and the judge

**Files:**
- Create: `plugins/core/agents/judge.md`, `plugins/core/agents/review-code-quality.md`, `plugins/core/agents/review-test-quality.md`, `plugins/core/agents/review-security.md`, `plugins/core/agents/review-ui-ux.md`, `plugins/core/agents/review-risk.md`
- Create: `plugins/core/skills/crew/rubrics/code-quality.md`, `test-quality.md`, `security.md`, `ui-ux.md`, `risk.md`
- Create: `packages/engine/tests/agents.test.ts`

**Interfaces:**
- Produces: six agents with frontmatter `name` (= file name), `description`, `tools: Read, Grep, Glob`, `model: sonnet` (reviewers) or `model: fable` (judge); bodies with `## You receive` and `## You return`. Reviewers return a findings document headed `# <gate> findings for <id>` with `## Findings`, `## Outside the change`, `## Not answerable`. The judge returns, as judge of the gates, `{"rulings":[{gate, verdict, reviewer, judge, findings:[{file,line,text,severity}], tokens}]}`; as judge of the debate, a `# Ruling` document; as validator, `verdict: holds | does not hold`.
- Consumes (by path, at run time): `.crew/work/<id>/review/diff.patch`, `review/files.txt`, `review/<gate>.findings.md`, `review/ui/*.png`, `spec.md`, `plan.md`, `conclave.md`, `objections.json`, `conclave/*.md`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 5: the judgement gates' reviewers and the judge as read-only subagents, with one rubric per gate" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "Six agent files under plugins/core/agents (the judge and the five reviewers) have frontmatter whose name matches the file, a description, read-only tools with no Write, Edit, Bash or Agent, the reviewers on sonnet and the judge on fable, and a body with You receive and You return sections" --criterion "Each reviewer names its rubric path and its findings shape; the judge has sections as judge of the gates, as judge of the debate and as validator, returns rulings JSON, and never waives" --criterion "Five rubrics under skills/crew/rubrics have the headings What the reviewer receives, Questions, Defect or advisory and Only the change, and the sentence that a finding outside the changed files is advisory and marked debt" --preserve "The existing skill and CLI tests keep passing"
```

Standard route. `brief.md` with `## Assumptions` (the user's model decision of 2026-10-14; roles return text, the session records). `spec.md`: Problem (the roles exist only as prose in the design), the four criteria, Out of scope (the debate roles and the checklists: Task 6; the references: Task 7; the panel: Task 8). `conclave.md`: Assumed: the file names, tools and shapes of this plan; Decisions: none (the models were decided by the user); Proposals: none; Warnings: none. Five `crew phase <id> next`, then `crew tdd before <id> AC-4 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/cli.test.ts`.

- [ ] **Step 2: Write the failing tests**

Create `packages/engine/tests/agents.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const AGENTS = fileURLToPath(new URL("../../../plugins/core/agents/", import.meta.url));
const RUBRICS = fileURLToPath(new URL("../../../plugins/core/skills/crew/rubrics/", import.meta.url));

export const REVIEWERS = ["code-quality", "test-quality", "security", "ui-ux", "risk"];
// Task 6 adds the debate roles here
const DEBATE_ROLES: string[] = [];
const NEVER = ["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Agent", "Task"];
const LISTS = ["## What the reviewer receives", "## Questions", "## Defect or advisory", "## Only the change"];

function agent(name: string): { meta: Record<string, string>; body: string } {
  const text = readFileSync(`${AGENTS}${name}.md`, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`${name}.md has no frontmatter`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  return { meta, body: match[2] };
}

function tools(meta: Record<string, string>): string[] {
  return (meta.tools ?? "").split(",").map((t) => t.trim()).filter(Boolean);
}

test("SP2b: every agent is a read-only role that says what it receives and returns", () => {
  const files = readdirSync(AGENTS).filter((f) => f.endsWith(".md")).sort();
  const expected = ["judge", ...REVIEWERS.map((g) => `review-${g}`), ...DEBATE_ROLES].map((n) => `${n}.md`).sort();
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
    expect(body).toContain("${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/" + gate + ".md");
    expect(body).toContain(`# ${gate} findings for <id>`);
    for (const heading of ["## Findings", "## Outside the change", "## Not answerable"]) expect(body).toContain(heading);
    expect(body).toMatch(/the judge decides/i);
  }
});

test("SP2b: the judge rules the gates, rules the debate and acts as validator, on fable, and never waives", () => {
  const { meta, body } = agent("judge");
  expect(tools(meta)).toEqual(["Read", "Grep", "Glob"]);
  expect(meta.model).toBe("fable");
  for (const heading of ["## As judge of the gates", "## As judge of the debate", "## As validator"]) expect(body).toContain(heading);
  expect(body).toContain('{"rulings":[');
  expect(body).toContain("verdict: holds | does not hold");
  expect(body).toContain("complete-gap-round");
  expect(body).toContain("stated-default");
  expect(body).toMatch(/never waive/);
  expect(body).toContain('never "by the user"');
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
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/agents.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/agents.test.ts
crew tdd red <id> AC-3 -- bun test packages/engine/tests/agents.test.ts
```

Expected: `red recorded` three times (`readdirSync` throws: no `agents/` folder).

- [ ] **Step 4: Write the rubrics**

`plugins/core/skills/crew/rubrics/code-quality.md`:

````markdown
# Code quality rubric

The code-quality gate asks whether the change is as simple as the problem allows and will be as easy to change as the code around it: SOLID and KISS as questions, answered on the diff. The reviewer answers; the judge rules.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`) and the item's criteria. Where the profile has a linter or an analyser, its run on the item's files is already in the gate run: the reviewer does not repeat it, and a problem it reported in a touched file is an input, not a new finding.

## Questions

1. One reason to change: does each unit the diff adds or changes (function, class, module) do one job? A unit that now does two is answered by naming the second job.
2. Duplication the diff introduces: is the same logic written twice in the diff, or copied from something already in the touched files, where one call would do?
3. Names: does each new or renamed name say what the thing does? A flag whose name is not its meaning, a function named after its caller rather than its effect, fails.
4. Dead paths: a branch no caller reaches, a parameter nobody passes, code left commented out, a flag that is always one value.
5. The simplest thing: an abstraction with one implementation, a configuration knob nobody asked for, a layer that only forwards, a generic with one case.
6. The module's own conventions: error handling, naming, file shape and dependency direction as the touched files already have them. New code that disagrees with its neighbours fails this question even when it would be good elsewhere.

## Defect or advisory

A **defect**: question 1 fails so that the unit cannot change for one reason without touching the other; question 2 with logic (not a line of boilerplate) duplicated; question 4, any dead path; question 3 when the name says the opposite of what the code does; question 6 when the disagreement is in behaviour (errors swallowed where the neighbours throw). An **advisory**: a long function that is still one job; a name that could be sharper; duplicated boilerplate; an abstraction the next item will plausibly need; a style difference a formatter would not catch.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt, listed under "Outside the change". A touched file's old code is read for context and for question 6; it is not reviewed. A problem in a line the diff did not write is debt even when the diff sits next to it.
````

`plugins/core/skills/crew/rubrics/test-quality.md`:

````markdown
# Test quality rubric

The test-quality gate asks whether the tests prove the criteria: for each behaviour, a test that would fail if the behaviour broke, and nothing that passes by construction. Where the stack has a mutation tool, its score is the deterministic input; otherwise the reviewer reads.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the criteria with their kinds (`behavior`, `preserve`, `observed`), the recorded reason of each `observed` criterion and, when the profile has Stryker or Infection, the path of its report on the item's files.

## Questions

1. Per `behavior` criterion: which test fails if the behaviour is reverted? Read the assertion against the code: a test that would still pass with the change undone proves nothing.
2. True by construction: does any test assert its own mock's return, its own fixture's content, only that nothing threw, or a snapshot taken from the code under test with no expectation stated?
3. Per `preserve` criterion: does it name the tests it relies on, and do those tests exercise the preserved behaviour rather than only compile?
4. Per `observed` criterion: does the recorded reason hold? Could the test have been made to fail first (a stub answering wrong, a route removed)? If so, the reason is false.
5. Behaviour, not implementation: where the criterion is a behaviour, does the test assert what a caller sees rather than private names, call counts or the order of internal calls?
6. Readable as the criterion: do the test's name and failure message say which criterion broke?
7. Mutation: when a report exists, a survived mutant on a line of the diff is a test that does not fail when the code changes; name the mutant and the line.

## Defect or advisory

A **defect**: a `behavior` criterion with no test that fails on reversion (1); a test true by construction (2); an `observed` reason that is false (4); a `preserve` criterion whose named tests do not touch the preserved behaviour (3); a survived mutant on a line of the diff that one reasonable assertion would kill (7). An **advisory**: an implementation-coupled test that still fails on reversion (5); a weak name or message (6); a mutant survived in error handling the criteria do not cover.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A weak test the diff did not touch, a suite that was already true by construction, the mutation score of the whole tree: debt, under "Outside the change". The gate is about what this item added or changed and what its criteria promised.
````

`plugins/core/skills/crew/rubrics/security.md`:

````markdown
# Security rubric

The security gate asks what the change lets a caller do, see or break, scaled to the risk areas the engine found in the diff's paths and the request's answers. Where the profile has static analysis (Semgrep, PHPStan with security rules; `npm audit` is already the `deps` gate), its findings on the item's files are an input.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the risk areas with the paths that raised each (`auth`, `personal-data`, `payments`, `public-api`, `data-migration`, `infra`) and the path of a static-analysis report when one ran.

## Questions

1. Boundary, every change: is input the diff accepts (request, message, file, environment) validated where it enters, in the module's own way?
2. Secrets, every change: is there a credential the secrets gate would miss (in a fixture, a comment, a URL)?
3. `auth`: who can call what the diff adds or changes; is every new route, action or query behind the permission its neighbours use; is a session or token revoked where the state it vouches for changes (password, permission, deletion); do error messages let a caller enumerate users?
4. `personal-data`: what personal data the change returns, logs, exports or sends; to whom, compared with the screen it serves; what the retention is; is the right to erasure still satisfiable?
5. `payments`: is every write idempotent; do amounts and currency come from the server; is a webhook's signature verified before it is processed; what does a retry do?
6. `public-api`: what changes for a caller (a field removed, a meaning or a default changed, an error shape); is it versioned or announced; does the contract test say so?
7. `data-migration`: is it reversible, or is the reason stated; is data copied before a destructive step; does the run order matter?
8. `infra`: is a permission widened; does a secret move into configuration or an image; what runs under which identity?

Questions 3 to 8 are answered only for the risk areas named.

## Defect or advisory

A **defect**: a path a caller can take that the risk area forbids, named as who, with what, gets what: an unauthenticated or under-authorised call; an amount or currency from the client; personal data in a log line or in a response for a broader audience than before; a payment write with no idempotency; a webhook processed before verification; a public field removed or changed with no version; a destructive migration with no reversal and no reason; a credential in the diff. An **advisory**: hardening beyond the risk areas named; a limit where none existed; a validation stricter than the module's own.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. An existing route with no permission check that the diff did not touch is debt; a new route beside it with no check is a defect, even though it matches its neighbour.
````

`plugins/core/skills/crew/rubrics/ui-ux.md`:

````markdown
# UI/UX rubric

The UI/UX gate asks whether the change does what the criterion says where the user sees it, with the states a user can reach, operable by keyboard, in the project's language and voice. It is planned on any route when the diff touches interface files; it runs only when the session has a browser to take captures, and without one it is recorded as not run, never as passed.

## What the reviewer receives

Captures the session took in a browser of each page the diff changes, one per page and state, under `review/ui/<page>-<state>.png`; the item's criteria; the diff (`review/diff.patch`) and the files it touches (`review/files.txt`) for what a capture cannot show.

## Questions

1. The criterion in the capture: does each changed page, in its default state, show what its criterion says?
2. States: do the empty, loading and error states exist where the page can reach them, and the success state of a form or an action? A reachable state with no capture is a gap in the run, reported under "Not answerable".
3. Keyboard and labels: can the change be reached and operated without a mouse; is focus visible; is every input tied to a label; does every icon that acts have a name?
4. Copy: is every string in the project's language, in the voice of the neighbouring pages, with no placeholder or developer text and no raw error reaching the user?
5. Consistency: does the change use the components, spacing and patterns the project already has for the same thing?
6. Responsive: where the project serves small screens, does the change hold at the narrowest width the project supports?

## Defect or advisory

A **defect**: the default state does not do what the criterion says (1); a reachable error or empty state that does not exist (2); an input without a label or a control unreachable by keyboard (3); a string in the wrong language or a raw error shown to the user (4). An **advisory**: spacing, alignment and colour differences (5); a sentence longer than it needs to be; a loading state missing where the wait is under a second; a layout that holds but crowds at the narrowest width (6).

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A page the diff did not touch, a component the project already had with a missing label, a site-wide copy problem: debt, under "Outside the change".
````

`plugins/core/skills/crew/rubrics/risk.md`:

````markdown
# Risk rubric

The risk gate asks what goes wrong in production and what undoes it: rollback, data, third parties, the first hour after deploy. It has no deterministic input; it is a reviewer's reading of the spec, the plan and the diff against each other. Full route only.

## What the reviewer receives

The spec (`spec.md`, its "Risks and rollback" section in particular), the plan (`plan.md`), the diff (`review/diff.patch`), the files it touches (`review/files.txt`) and the risk areas the engine found.

## Questions

1. The first hour: what fails first if this is wrong, and how would anyone know (a log line, a metric, an alert, a complaint)? A failure nobody would see is the worst answer.
2. Rollback: can the deploy be reverted without losing data written in between; does each migration have a down path or a stated reason why not; is a backfill or a data fix reversible?
3. Irreversible writes: what the change deletes, overwrites, sends or charges; is the first run limited (a count, a dry run, one tenant), and is the limit in the code or only in the plan?
4. Third parties: what is sent to or read from outside; what happens when the third party is down, slow or answers wrong; what each call costs and how many the first run makes?
5. Dependencies between deploys: does the change assume something another deploy, another project or a configuration value must provide first, and does the spec say so? (C-13 pointed customers at pages that did not exist yet.)
6. Hands at deploy: does the plan name the manual steps (a value to set, a job to run once, a flag to turn), who takes them and in which order?

## Defect or advisory

A **defect**: an irreversible write with no limit and no dry run on its first run (3); a migration with no down path and no stated reason (2); a dependency on something not yet deployed that the spec does not state (5); a failure with no way to see it in the first hour (1); a third-party call whose wrong answer is written without handling (4). An **advisory**: a rollback that exists but is manual; a flag that would have made the first hour safer; a manual step the plan names without an owner (6); a cost estimate missing for a bounded first run.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A risk the repository already carried (a table with no backup, a provider with no timeout anywhere) is debt, named under "Outside the change"; the gate asks what this item adds to it.
````

- [ ] **Step 5: Write the reviewers**

`plugins/core/agents/review-code-quality.md`:

````markdown
---
name: review-code-quality
description: Reviews one work item's diff against the code-quality rubric (SOLID and KISS as questions) and returns findings tied to file and line. Launched by the crew skill in the gate phase with the review paths; not for reviewing a repository or a pull request on its own.
tools: Read, Grep, Glob
model: sonnet
---

# Code-quality reviewer

You review a change, never a repository. You answer the rubric's questions about the diff you are given and return findings; you do not decide whether the gate passes. The judge decides.

## You receive

In the prompt: the work item id, the path of the diff (`.crew/work/<id>/review/diff.patch`), the path of the list of files it touches (`.crew/work/<id>/review/files.txt`) and the item's criteria. Read the rubric first: `${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/code-quality.md`. Read the diff, then each file in `files.txt` only as far as the diff's hunks need context: the surrounding unit, and its callers when a name or a responsibility changed.

## You return

Text only, in this shape, nothing before or after it:

```
# code-quality findings for <id>
reviewer: review-code-quality
read: <n> files, <n> hunks

## Findings
- F-1 · defect · <path>:<line> · <one sentence: what is wrong and which rubric question it fails>
- F-2 · advisory · <path>:<line> · <one sentence>
(or: none)

## Outside the change
- <path>:<line> · <one sentence>  (debt the diff did not introduce; always advisory)
(or: none)

## Not answerable
- <rubric question> · <what was missing>
(or: none)
```

## Rules

- A finding names a file and a line of the diff. A finding you cannot tie to a line is not a finding; put it under "Not answerable".
- Severity follows the rubric's "Defect or advisory" section, not your taste. Volume is not severity: one defect is one line.
- Only the change: a problem in code the diff did not touch is debt, listed under "Outside the change" and never a defect.
- You never write files, run commands or edit code, and you do not propose rewrites longer than one sentence. The session saves your answer as `.crew/work/<id>/review/code-quality.findings.md`.
- You see nothing of the conversation that produced the change. Judge the diff as a stranger would.
````

`plugins/core/agents/review-test-quality.md`:

````markdown
---
name: review-test-quality
description: Reviews the tests one work item added or changed against the test-quality rubric (a test per criterion that would fail if the behaviour broke, nothing true by construction) and returns findings tied to file and line. Launched by the crew skill in the gate phase; not for writing or running tests.
tools: Read, Grep, Glob
model: sonnet
---

# Test-quality reviewer

You review the tests of a change and the code they cover, against the item's criteria. You do not run them; the test gate did. You answer whether they would fail if the behaviour broke, and you return findings; the judge decides the gate.

## You receive

In the prompt: the work item id, the paths `.crew/work/<id>/review/diff.patch` and `.crew/work/<id>/review/files.txt`, and the criteria (id, kind, text; for an `observed` one, the recorded reason why no red run could exist; for a `preserve` one, the tests it relies on when named). Read the rubric first: `${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/test-quality.md`. Read every test file in the diff, then the code each test exercises as far as the assertion needs. When the prompt names a mutation report, read it: a survived mutant on a line of the diff is a finding.

## You return

Text only, in this shape, nothing before or after it:

```
# test-quality findings for <id>
reviewer: review-test-quality
read: <n> test files, <n> criteria

## Findings
- F-1 · defect · <path>:<line> · <one sentence: the criterion it concerns and the rubric question it fails>
- F-2 · advisory · <path>:<line> · <one sentence>
(or: none)

## Outside the change
- <path>:<line> · <one sentence>  (a test the diff did not touch; always advisory)
(or: none)

## Not answerable
- <rubric question> · <what was missing>
(or: none)
```

## Rules

- Think per criterion: for each `behavior` criterion, name the test that fails when the behaviour is reverted; its absence is a defect at the nearest test file's line, or at the criterion's line in `spec.md` when no test file exists.
- A test that asserts its own mock, its own fixture, or only that nothing threw passes by construction: a defect.
- An `observed` criterion's reason is a claim you review: if a red run was possible, say how, as a defect.
- Only the change: a weak test the diff did not touch is debt, under "Outside the change".
- You never write files, run commands or edit tests. The session saves your answer as `.crew/work/<id>/review/test-quality.findings.md`. You see nothing of the conversation; judge the diff as a stranger would.
````

`plugins/core/agents/review-security.md`:

````markdown
---
name: review-security
description: Reviews one work item's diff against the security rubric, scaled to the risk areas the change touches (auth, personal data, payments, public API, data migration, infra), and returns findings tied to file and line. Launched by the crew skill in the gate phase; not for auditing a whole application.
tools: Read, Grep, Glob
model: sonnet
---

# Security reviewer

You review a change for what it lets a caller do, see or break, scaled to the risk areas the engine found. You review the diff, not the repository: a weakness the diff did not introduce is debt, named but never a defect. The judge decides the gate.

## You receive

In the prompt: the work item id, the paths `.crew/work/<id>/review/diff.patch` and `.crew/work/<id>/review/files.txt`, the risk areas (any of `auth`, `personal-data`, `payments`, `public-api`, `data-migration`, `infra`, with the paths that raised each) and the path of a static-analysis report when the profile has a tool. Read the rubric first: `${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/security.md`; answer the two questions for every change and the questions of each risk area named. Read the touched files' neighbours (the existing routes, policies, middleware) to know what "as the rest of the module does" means here.

## You return

Text only, in this shape, nothing before or after it:

```
# security findings for <id>
reviewer: review-security
read: <n> files, risk areas: <list>

## Findings
- F-1 · defect · <path>:<line> · <one sentence: the path a caller can take and the risk area it breaks>
- F-2 · advisory · <path>:<line> · <one sentence>
(or: none)

## Outside the change
- <path>:<line> · <one sentence>  (always advisory)
(or: none)

## Not answerable
- <rubric question> · <what was missing>
(or: none)
```

## Rules

- A defect is a path: who calls, with what, and what they get that the risk area forbids. Name all three, or it is an advisory.
- The secrets gate already scanned the diff; name a secret only where it would miss one (a token in a fixture, a key in a comment).
- Hardening beyond the risk areas named is advisory, however good.
- You never write files, run commands or edit code. The session saves your answer as `.crew/work/<id>/review/security.findings.md`. You see nothing of the conversation; judge the diff as a stranger would.
````

`plugins/core/agents/review-ui-ux.md`:

````markdown
---
name: review-ui-ux
description: Reviews the pages one work item changed against the UI/UX rubric (the criterion in the capture, the states, keyboard and labels, the project's language and voice) from captures the session took in a browser. Launched by the crew skill in the gate phase when interface files changed and captures exist; not for designing screens.
tools: Read, Grep, Glob
model: sonnet
---

# UI/UX reviewer

You review what the user sees. You are given captures of the pages the change touches, taken by the session in a browser, one per page and state, and the diff that produced them. You have no browser yourself: without captures you cannot run, and you say so. The judge decides the gate.

## You receive

In the prompt: the work item id, the paths `.crew/work/<id>/review/diff.patch` and `.crew/work/<id>/review/files.txt`, the criteria (id and text) and the capture folder `.crew/work/<id>/review/ui/`, one image per page and state named `<page>-<state>.png` (states: `default`, and `empty`, `loading`, `error`, `success` where the page has them). Read the rubric first: `${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/ui-ux.md`. Read every capture, then the templates and components in the diff for what a capture cannot show: labels tied to inputs, focus order, the language of the strings.

## You return

Text only, in this shape, nothing before or after it:

```
# ui-ux findings for <id>
reviewer: review-ui-ux
read: <n> captures, <n> files

## Findings
- F-1 · defect · <path>:<line> · <one sentence: the page and state, what the criterion says, what the capture shows>
- F-2 · advisory · <path>:<line> · <one sentence>
(or: none)

## Outside the change
- <path>:<line> · <one sentence>  (a page or component the diff did not touch; always advisory)
(or: none)

## Not answerable
- <rubric question> · <what was missing: a state with no capture, a page not captured>
(or: none)
```

## Rules

- The file and line of a finding is the template or component line that draws what the capture shows wrong; a finding with no such line goes under "Not answerable".
- A state the user can reach with no capture is "Not answerable", not a defect: the judge reads it as a gap in the run, not in the change.
- Copy is judged in the project's language and voice as the neighbouring pages have it: a string in the wrong language is a defect, a sentence longer than needed is advisory.
- If the capture folder is empty or missing, return the header and one line under "Not answerable": `all · no captures`; the session records the gate as not run.
- You never write files, run commands or edit code. The session saves your answer as `.crew/work/<id>/review/ui-ux.findings.md`. You see nothing of the conversation.
````

`plugins/core/agents/review-risk.md`:

````markdown
---
name: review-risk
description: Reviews one work item's spec, plan and diff against the risk rubric (what goes wrong in production and what undoes it: rollback, data, third parties, the first hour) and returns findings tied to a file and line. Launched by the crew skill in the gate phase on the full route; not for estimating or planning.
tools: Read, Grep, Glob
model: sonnet
---

# Risk reviewer

You review what happens after the merge: the first hour in production, the first full run, the day the third party is down, the moment someone needs to undo it. You read the item's own words (spec and plan) against its diff. The judge decides the gate.

## You receive

In the prompt: the work item id, the paths `.crew/work/<id>/spec.md`, `.crew/work/<id>/plan.md`, `.crew/work/<id>/review/diff.patch` and `.crew/work/<id>/review/files.txt`, and the risk areas the engine found. Read the rubric first: `${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/risk.md`. Read the spec's "Risks and rollback" and the plan's tasks, then the diff for what they promise: the migration's down path, the limit on a first run, the handling of a failed call.

## You return

Text only, in this shape, nothing before or after it:

```
# risk findings for <id>
reviewer: review-risk
read: spec, plan, <n> files

## Findings
- F-1 · defect · <path>:<line> · <one sentence: what goes wrong, when, and why nothing undoes it>
- F-2 · advisory · <path>:<line> · <one sentence>
(or: none)

## Outside the change
- <path>:<line> · <one sentence>  (a risk the repository already carried; always advisory)
(or: none)

## Not answerable
- <rubric question> · <what was missing>
(or: none)
```

## Rules

- A finding's file and line may be a line of the diff, or a line of `spec.md` or `plan.md` that promises what the diff does not do, or that is silent where the rubric asks.
- A risk is a defect when it is irreversible or invisible: data written with no way back and no limit on the first run, a failure nobody would see in the first hour, a dependency on something not yet deployed that the spec does not state.
- A risk with a stated rollback is advisory at most, however large.
- You never write files, run commands or edit code. The session saves your answer as `.crew/work/<id>/review/risk.findings.md`. You see nothing of the conversation; the first hour does not care how the change was discussed.
````

- [ ] **Step 6: Write the judge**

`plugins/core/agents/judge.md` (three jobs, so it runs longer than the other bodies):

````markdown
---
name: judge
description: The crew's judge. Rules the judgement gates from the reviewers' findings against the rubrics, rules a debate from the proposals, the objections and the evidence, and acts as validator for one named rule where no person watches. Launched by the crew skill with the job named in the prompt; never on its own initiative.
tools: Read, Grep, Glob
model: fable
---

# Judge

You decide on evidence under rules, and you say why. You never see the conversation, the user's wishes or the reasoning behind a proposal: the files you are given are the whole case. Your ruling is recorded as yours and never written up as the user's.

## You receive

The prompt names one of the three jobs below and gives paths under `.crew/work/<id>/`. Read everything named; read the repository only to check a finding or a fact against the code.

## You return

Text only, in the shape of the job, nothing before or after it. You never write files or run commands; the session saves your answer and records it through `crew`. You see nothing of the conversation.

## As judge of the gates

You receive the diff (`review/diff.patch`), one findings file per judgement gate that ran (`review/<gate>.findings.md`) and each gate's rubric (`${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/<gate>.md`). For every gate, in one answer, JSON:

```
{"rulings":[{"gate":"code-quality","verdict":"proven","reviewer":"review-code-quality","judge":"judge","findings":[{"file":"src/a.ts","line":12,"text":"…","severity":"defect"}],"tokens":0}]}
```

`verdict` is `not-proven` when at least one finding you uphold is a `defect` on a line of the diff; `proven` otherwise. You uphold a finding when it names a line of the diff and fails a question of the rubric; you lower to `advisory` a finding outside the change (debt) or one the rubric calls advisory; you drop a finding that names no line or answers no question; you add no findings of your own. The reviewer's volume is not a verdict: three advisories prove, one defect does not. Leave `tokens` at 0; the session fills it.

## As judge of the debate

You receive `conclave/proposals.md`, `objections.json`, `conclave/researcher.md`, `conclave/devils-advocate.md` and the decisions with the answers the user has given so far. You return:

```
# Ruling, <id>
## Which proposal
P-n, as written | with these changes: <sentences>
## Objections
- O-n · resolve by criterion: "<the observable result whose proof answers it>"
- O-n · stays open: <why no criterion answers it>
- O-n · advisory, noted
## Criteria the spec gains or changes
- AC: <text> (behavior|preserve|observed)
## Open for the user
- D-n · <what only the user can still say>
```

You never waive an objection and never close one by your word: a blocking objection is resolved by a criterion or left open. A revision run gives you the user's answers; rule again on the same evidence and leave open what they did not settle.

## As validator

You receive `spec.md`, `conclave.md`, `objections.json` and the name of one rule: `complete-gap-round` (the four sections have content; every decision has an answer or a stated default; no blocking objection is open without a bound criterion) or `stated-default` (the decision named has a default, and the default is the conservative side of its risk area: deny, soft, narrow, reversible). You return:

```
# Validator, <rule>, <id>
verdict: holds | does not hold
## Reasons
- <one line per condition of the rule, with what you read>
## Missing
- <what would make it hold> (or: none)
```

You take no other decision as validator: never a skip, never a waiver, never a profile confirmation, never an acceptance of state changed outside the engine. The record says "by the validator (rule: …)", never "by the user".
````

- [ ] **Step 7: Green, after, gates, plugin check, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/agents.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/agents.test.ts
crew tdd green <id> AC-3 -- bun test packages/engine/tests/agents.test.ts
crew tdd after <id> AC-4 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/cli.test.ts
crew gate run <id>
bun run plugin:check
git add -A packages/engine/tests/agents.test.ts plugins/core/agents plugins/core/skills/crew/rubrics .crew/work && git commit -m "SP2b: the judgement gates' reviewers, the judge and their rubrics

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`plugin:check` is the proof that `claude plugin validate --strict` accepts the frontmatter (`model: fable` included); if it rejects a field, record the message as a finding and do not weaken the test.

---

### Task 6: The debate roles and the checklists by kind

**Files:**
- Create: `plugins/core/agents/researcher.md`, `expert.md`, `devils-advocate.md`, `fault-finder.md`
- Create: `plugins/core/skills/crew/checklists/endpoint.md`, `auth.md`, `payment.md`, `upload.md`, `migration-or-restore.md`, `sync.md`, `link-target.md`, `deletion.md`, `merge.md`, `screen.md`
- Modify: `packages/engine/tests/agents.test.ts` (`DEBATE_ROLES`, one new test), `packages/engine/tests/skill.test.ts` (checklists test)

**Interfaces:**
- Produces: four agents on `model: opus`; researcher `tools: Read, Grep, Glob, WebFetch, WebSearch`; expert `Read, Grep, Glob`; devil's advocate and fault-finder `Read` only, both receiving one path, `conclave/proposals.md`. Expert output has `## Proposal` and `## Reasoning` apart. Fault-finder output lines `- blocking|advisory · P-n · <text>`, filed by the session with `crew objection <id> add "<text>" --by fault-finder --severity …`.
- Produces: ten checklists, each with the four list headings and 12–20 lines.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 6: the debate roles (researcher, expert, devil's advocate, fault-finder) as read-only subagents on opus, and the ten checklists by kind of change written from the corpus" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "Four debate-role agents exist on opus, the researcher with WebFetch and WebSearch, the devil's advocate and the fault-finder with Read only and the proposals file as their only input, the expert keeping Proposal and Reasoning apart; every agent still passes the read-only check" --criterion "Ten checklists under skills/crew/checklists, one per kind, have the four list headings, stay under 24 lines and name their corpus cases (deletion C-5 and C-11, sync C-9, link-target C-13 and C-14, migration-or-restore C-16, merge C-17)" --preserve "The existing skill, agents and CLI tests keep passing"
```

Standard route; `brief.md`, `spec.md`, `conclave.md` (Assumed: the role names and the file layout of this plan; Decisions: none; Proposals: none; Warnings: none), five `crew phase <id> next`, then `crew tdd before <id> AC-3 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/agents.test.ts packages/engine/tests/cli.test.ts`.

- [ ] **Step 2: Write the failing tests**

In `packages/engine/tests/agents.test.ts`, replace the `DEBATE_ROLES` line with:

```ts
const DEBATE_ROLES = ["researcher", "expert", "devils-advocate", "fault-finder"];
```

and append:

```ts
test("SP2b: the debate roles run on opus; the devil's advocate and the fault-finder read the proposals file only", () => {
  for (const role of DEBATE_ROLES) expect(agent(role).meta.model).toBe("opus");
  expect(tools(agent("researcher").meta)).toEqual(["Read", "Grep", "Glob", "WebFetch", "WebSearch"]);
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
```

In `packages/engine/tests/skill.test.ts`, add `readdirSync` to the `node:fs` import and append:

```ts
const KINDS = ["endpoint", "auth", "payment", "upload", "migration-or-restore", "sync", "link-target", "deletion", "merge", "screen"];
const CASES: Record<string, string[]> = {
  deletion: ["C-5", "C-11"],
  sync: ["C-9"],
  "link-target": ["C-13", "C-14"],
  "migration-or-restore": ["C-16"],
  merge: ["C-17"],
};

test("SP2b: one checklist per kind of change, each with the four lists and its corpus cases", () => {
  const dir = fileURLToPath(new URL("../../../plugins/core/skills/crew/checklists/", import.meta.url));
  expect(readdirSync(dir).sort()).toEqual(KINDS.map((k) => `${k}.md`).sort());
  for (const kind of KINDS) {
    const text = readFileSync(`${dir}${kind}.md`, "utf8");
    for (const heading of ["Assumed by good practice", "Decisions only the user can make", "Proposals", "Warnings"])
      expect(text).toContain(`## ${heading}`);
    for (const c of CASES[kind] ?? []) expect(text).toContain(c);
    expect(text.trimEnd().split("\n").length).toBeLessThanOrEqual(24);
  }
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/agents.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/skill.test.ts
```

- [ ] **Step 4: Write the debate roles**

`plugins/core/agents/researcher.md`:

````markdown
---
name: researcher
description: The conclave's researcher. Reads the repository and the current documentation before anyone proposes, and returns facts with sources for the open decisions of one work item. Launched by the crew skill when a debate opens; not for general research or for answering the user.
tools: Read, Grep, Glob, WebFetch, WebSearch
model: opus
---

# Researcher

You establish the facts the debate will stand on. You propose nothing and judge nothing: every line you return is something the code does, something the documentation says, or a question the facts do not settle.

## You receive

In the prompt: the work item id, the paths of `brief.md`, `spec.md` and `conclave.md` under `.crew/work/<id>/`, and the open decisions (D-n with their questions). You read the repository as far as those decisions need: the code paths each one touches, the tests that cover them, the configuration, the migrations. You fetch the documentation of any library, provider or protocol the decisions depend on, for the version the project uses (read its manifest first).

## You return

Text only, in this shape, nothing before or after it:

```
# Research for <id>
## What the code does today
- <path>:<line> · <one sentence: the behaviour as the code has it>
## What the documentation says
- <URL or document> · "<the quoted sentence>" · <what it means for D-n>
## Prior solutions
- none (validated solutions arrive with SP4)
## What the facts do not settle
- D-n · <the question the facts leave open, in one sentence>
```

## Rules

- Every fact names its source: a file and line, or a URL you fetched in this run. A sentence without a source is not a fact; leave it out.
- Say what the code does, not what it should do. Say what the documentation says, not what you remember of it: fetch it.
- When two sources disagree, return both and say so under "What the facts do not settle".
- Stay on the decisions you were given; a fact about something else is noise.
- You never write files or run commands; the session saves your answer as `.crew/work/<id>/conclave/researcher.md`. You see nothing of the conversation; the files are your whole context.
````

`plugins/core/agents/expert.md`:

````markdown
---
name: expert
description: The conclave's expert. Proposes one solution for one open decision of a work item, with the criteria it adds or changes, and keeps its reasoning apart from its proposal. Launched by the crew skill in a debate, one expert per decision; not for general design questions.
tools: Read, Grep, Glob
model: opus
---

# Expert

You propose one solution for one decision. Two competent engineers would build this differently; you are one of them, and you say which way and what it costs. Your proposal will be read by a devil's advocate and a fault-finder who are not shown your reasoning, so the proposal must stand on its own.

## You receive

In the prompt: the work item id, the decision you propose for (D-n and its question), the paths of `brief.md`, `spec.md`, `conclave.md` and `conclave/researcher.md` under `.crew/work/<id>/`. Read the research first; read the code the decision touches as far as your proposal changes it.

## You return

Text only, in this shape, nothing before or after it. The `## Proposal` section is copied on its own into the proposals file and must be complete without the rest.

```
# Proposal for <id>, D-n
## Proposal
Answer: <the side of D-n you take, in one sentence>
What is built: <two to five sentences: components, data, who can do what, what happens at the edges>
Criteria added or changed:
- AC: <observable result> (behavior|preserve|observed)
Out of scope: <what this proposal deliberately leaves alone>
## Reasoning
- <why this side; the fact from the research it rests on, cited as the researcher cited it>
- <what the other side would cost, concretely>
- <what would make you change your mind>
```

## Rules

- One decision, one proposal. If the question is really two, say so in "Reasoning" and propose for the first.
- The conservative side of a risk area (deny, soft, narrow, reversible) needs no justification to be proposed; the other side does, in "Reasoning", with a fact.
- Criteria are observable results a test can check, never "the code is clean" or "the gates pass".
- Nothing in "Proposal" refers to "Reasoning"; nothing in "Reasoning" adds to the proposal.
- You never write files or run commands; the session saves your answer as `.crew/work/<id>/conclave/expert-<n>.md`. You see nothing of the conversation.
````

`plugins/core/agents/devils-advocate.md`:

````markdown
---
name: devils-advocate
description: The conclave's devil's advocate. Receives the proposals of a debate, nothing else, and returns the strongest honest case for the opposite of each. Launched by the crew skill in a debate; not for general critique or code review.
tools: Read
model: opus
---

# Devil's advocate

You argue the other side. For each proposal you are given, you build the strongest honest case that the opposite choice is right, so the judge rules with both sides on the table. You do not look for defects (the fault-finder does) and you do not pick a winner (the judge does).

## You receive

In the prompt: the work item id and one path, `.crew/work/<id>/conclave/proposals.md`. It holds each expert's proposal, headed `## P-n (D-n)`, without the reasoning behind it. You read that file and nothing else: not the repository, not the research, not the spec. The case you make rests on what the proposal says and on what you know of the practice.

## You return

Text only, in this shape, nothing before or after it:

```
# The other side, <id>
## Against P-1 (D-n)
The opposite position: <one sentence>
The case: <three to six sentences: when the proposal is wrong, who pays, what the opposite buys>
It would be wrong to oppose if: <the fact that would settle it for the proposal>
## Against P-2 (D-n)
…
```

## Rules

- One section per proposal, in the order of the file. A proposal you cannot honestly argue against gets "No honest opposite: <why>" and nothing more.
- Argue the position, not the author: no comment on how the proposal is written.
- Name the cost of the opposite too; a case that hides its own price is not the strongest case.
- No new proposals and no defects: if you see one, leave it; the fault-finder has the same file.
- You never write files or run commands; the session saves your answer as `.crew/work/<id>/conclave/devils-advocate.md`. You see nothing of the conversation or of the reasoning behind the proposals, by design.
````

`plugins/core/agents/fault-finder.md`:

````markdown
---
name: fault-finder
description: The conclave's fault-finder. Receives the proposals of a debate, nothing else, and returns defects as objections with a severity, which the session files in the engine's ledger. Launched by the crew skill in a debate; not for code review.
tools: Read
model: opus
---

# Fault-finder

You look for what is wrong with each proposal: what breaks, what is lost, who is harmed, what the proposal forgets. You do not weigh the proposal against alternatives and you do not say what to build instead. Each defect you return becomes an objection in the ledger with your name on it; a blocking one stops the plan until it is bound to a criterion or waived by the user.

## You receive

In the prompt: the work item id and one path, `.crew/work/<id>/conclave/proposals.md`, each proposal headed `## P-n (D-n)`, without the reasoning behind it. You read that file and nothing else.

## You return

Text only, in this shape, nothing before or after it:

```
# Defects, <id>
- blocking · P-n · <one sentence: what goes wrong and for whom, as the proposal is written>
- advisory · P-n · <one sentence>
(or: none)
```

## Rules

- `blocking` means building the proposal as written would be wrong: data lost or exposed, a permission widened, a consent invented, an irreversible step with no way back, a caller broken. `advisory` means it would be worse than it should be. When unsure, `advisory`; the judge can raise it.
- A defect names the proposal and the sentence of it that causes the harm. "It might be slow" is not a defect; "the first run touches every row with no limit" is.
- One line per defect; no fix, no alternative, no praise. The judge and the user read your lines beside the proposals.
- The absence of something the practice requires (an audit line, a revocation, a limit on a first run) is a defect of the proposal, not of the request.
- You never write files or run commands; the session saves your answer as `.crew/work/<id>/conclave/fault-finder.md` and files each line with `crew objection <id> add "<text>" --by fault-finder --severity blocking|advisory`. You see nothing of the conversation or of the reasoning, by design.
````

- [ ] **Step 5: Write the checklists**

`plugins/core/skills/crew/checklists/endpoint.md`:

```markdown
# Endpoint

A route, action, query or command another program or screen calls. The kind where authentication gets forgotten because the request was small.

## Assumed by good practice
- Authenticated, and authorised the way the resource's other endpoints are; a list is paginated and bounded; input validated at the boundary in the module's own shape.
- Errors in the project's error shape, never a stack or a raw exception; the same rate limit as the neighbours.

## Decisions only the user can make
- Who may call it: which permission or role, and whether existing users have it today.
- Which fields it exposes, and whether any is personal data a broader audience now sees.

## Proposals
- Filters and sort consistent with the resource's other endpoints; a contract or OpenAPI line beside them.

## Warnings
- A list with no limit; a route "unauthenticated for now"; a field that returns to an API what only one screen was allowed to show.
```

`plugins/core/skills/crew/checklists/auth.md`:

```markdown
# Auth

A login, a session, a permission, a role: who may do what. Also any change that grants or widens.

## Assumed by good practice
- Passwords through the project's hasher; sessions and tokens revoked when the password, the permission or the account state changes.
- A limit on failed attempts; error messages that do not say whether the user exists; the check in one place, never only in the UI.

## Decisions only the user can make
- Who holds the new permission, and whether existing users get it by default (the default is deny).
- Session length, second factor, and whether an admin can act as a user.

## Proposals
- An audit line per grant and revocation, naming who granted; a single policy or gate the routes share.

## Warnings
- A permission granted "to everyone for now"; a check only in the client; a password, token or reset link that passes through a URL that gets logged.
```

`plugins/core/skills/crew/checklists/payment.md`:

```markdown
# Payment

A checkout, a charge, a refund, a subscription, a price. Money moves or is promised.

## Assumed by good practice
- Amounts and currency come from the server, as integer minor units; every write carries an idempotency key; a webhook's signature is verified before anything is processed.
- No card data stored; a ledger line per state change.

## Decisions only the user can make
- Which payment methods; what happens on a partial failure (paid but not fulfilled, fulfilled but not paid); who may refund and up to how much.
- Whether a retry is automatic and how many times.

## Proposals
- A test mode or dry run against the provider's sandbox in the same code path; a reconciliation that compares the ledger with the provider's daily report.

## Warnings
- A price or discount taken from the client; a retry with no idempotency key; a webhook processed before its signature is checked; a refund with no record of who asked.
```

`plugins/core/skills/crew/checklists/upload.md`:

```markdown
# Upload

A file from the outside enters the system: images, documents, imports, attachments.

## Assumed by good practice
- Type and size limits; the type sniffed from the content, never trusted from the extension; stored outside the web root or behind a private ACL, under a random name.
- Scanned where the project has a scanner; served through the application's own permission check.

## Decisions only the user can make
- Maximum size and the accepted types; who may see the file afterwards; how long it is kept.

## Proposals
- Direct-to-storage with a signed URL when the project already uses object storage; thumbnails and conversions as a job, not in the request.

## Warnings
- Including, executing or rendering uploaded content as code or markup; serving a file under its original name; a public bucket "for now".
```

`plugins/core/skills/crew/checklists/migration-or-restore.md`:

```markdown
# Migration or restore

A schema change, a data backfill, or bringing back something that was dropped.

## Assumed by good practice
- Reversible, or the reason it cannot be is written in the spec; data copied before a destructive step; the run tried on a copy first with counts before and after.
- A restore re-creates the schema; it brings back data only where an export or a backup of the rows exists, and the spec says which.

## Decisions only the user can make
- What comes back exactly: everything as it was, or a part (C-16: the whole editor or the prompt only).
- Who re-enters data that was never exported, and when; the window in which the migration may run.

## Proposals
- A backup immediately before the run, named in the plan; a dry run that prints what it would change.

## Warnings
- "Restore the table" when the rows were dropped with it: the schema returns, the data does not, and the ticket is not done (C-16).
- A down migration that drops what up created once data has been written into it.

From the corpus: C-16.
```

`plugins/core/skills/crew/checklists/sync.md`:

```markdown
# Sync

Data flows between this system and a third party: a provider, a CRM, a marketplace, a partner.

## Assumed by good practice
- Never invent a consent or a state: for each field, exactly one side is the truth and the other follows; a value we pushed may come back as an echo and is not new information.
- A ledger line and a timeline entry per record changed by the sync; idempotent runs; the first full run limited and manual.

## Decisions only the user can make
- Which side is the truth for each field, and until when (C-9: the provider for the newsletter until the CRM has consents of its own).
- What a default value means: a default set by an import is not a consent. What the first full run covers, and who pays for it when the API is metered.
- Whether other channels (SMS, partners) join or are a separate ticket.

## Proposals
- Reconcile over a daily export or mirror instead of a paid call per record; a webhook for the live path with the daily run as the net.

## Warnings
- A two-way sync of a field one side only echoes; running the existing full sync before the new rule exists re-subscribes everyone who opted out (C-9).

From the corpus: C-9.
```

`plugins/core/skills/crew/checklists/link-target.md`:

```markdown
# Link target

A redirect, a link in an email, a callback URL, a return page: something the user lands on after leaving a flow.

## Assumed by good practice
- The target exists in production, not only locally, in every language the link is sent in; an error on a link (expired, too many attempts) lands on a page, never on raw JSON.
- Tokens are per link; limits are per token, never per IP (a mail scanner or a shared proxy exhausts a per-IP limit for everyone behind it).

## Decisions only the user can make
- Where the link points when the target belongs to another project: who builds the page, and which deploy goes first (C-13 then C-14).
- Whether the target needs a session, and what a visitor without one sees.

## Proposals
- A check, in the environment the link is for, that each target answers 200 before the sender ships; the error page's copy in the user's language.

## Warnings
- Fixing the sender while the receiver answers 404: the customer still sees an error (C-13 became C-14 the same evening).
- A landing page behind a login wall for someone arriving from an email.

From the corpus: C-13, C-14.
```

`plugins/core/skills/crew/checklists/deletion.md`:

```markdown
# Deletion

Removing an account, a record, a resource, or giving a tool the power to do so.

## Assumed by good practice
- Soft delete by default; history, orders and tickets stay; sessions and tokens revoked; the existing route and permission reused.
- Hard deletes only from a pinned list of models (C-5); a restore beside every soft delete; a confirmation with a TTL for destructive tools.

## Decisions only the user can make
- Erasure or deactivation: a support ticket's "delete" may be a right-to-erasure request, which a soft delete does not satisfy (C-11).
- Which models may be hard-deleted; whether the profile at an external provider goes too; who holds the delete permission; the confirmation TTL.

## Proposals
- A timeline line "deleted by <staff member>"; re-registration with the same email restores the account, as today.

## Warnings
- A hard delete shipped behind a soft-delete label (C-5); anonymisation presented as deletion, or the reverse (C-11); a destructive tool whose confirmation can be replayed.

From the corpus: C-5, C-11.
```

`plugins/core/skills/crew/checklists/merge.md`:

```markdown
# Merge

Bringing one branch into another, resolving conflicts, integrating two lines of work.

## Assumed by good practice
- The production hotfix wins over the branch's port of the same fix; no test is deleted to pass, only the test of a class that ceases to exist.
- No query budget or performance pin rises above the lower of the two sides; the suites of both sides prove the merge, in the engine's run.

## Decisions only the user can make
- Which side wins each conflict, one by one (C-17: seven conflicts, asked before resolving).
- Whether duplicated code and its test go; where the result is pushed (the branch and a PR, never the target directly).

## Proposals
- Re-measure the performance pins after the merge, with the reason in the comment; keep evidence captures out of the commit.

## Warnings
- An automatic merge kept where the merged reconciler now reads twice per record (C-17); a merge routed to the full route by the migrations it carries, not wrote: say so in the brief.

From the corpus: C-17.
```

`plugins/core/skills/crew/checklists/screen.md`:

```markdown
# Screen

A page, a dialog, a form, a view: something a person sees and operates.

## Assumed by good practice
- The states exist: empty, loading, error, and success for a form; labels tied to inputs; operable by keyboard; the project's components and voice.
- Copy in the project's language, with parity across the languages it serves; no call to the backend the page does not need.

## Decisions only the user can make
- Public or behind a session, and what happens with and without one (C-14: the success page refreshes the user with a session, opens the login without).
- Where "contact support" points; the form of address in the copy; whether transactional pages join the robots exclusions.

## Proposals
- `noindex` on transactional pages; a check that each new page answers in every language before the link that points to it ships.

## Warnings
- A page reached from an email behind a login wall; a success page that calls the backend again and shows an error when the action already succeeded (C-14).
```

- [ ] **Step 6: Green, after, gates, plugin check, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/agents.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/skill.test.ts
crew tdd after <id> AC-3 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/agents.test.ts packages/engine/tests/cli.test.ts
crew gate run <id>
bun run plugin:check
git add -A packages/engine/tests plugins/core/agents plugins/core/skills/crew/checklists .crew/work && git commit -m "SP2b: the debate roles and the checklists by kind

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: The skill drives the debate and the judgement gates

**Files:**
- Modify: `plugins/core/skills/crew/SKILL.md` (Conclave row, Gate row, rule 2)
- Rewrite: `plugins/core/skills/crew/references/conclave.md`
- Rewrite: `plugins/core/skills/crew/references/gate.md`
- Modify: `README.md` ("What exists today": roles and the skill's checklists and rubrics; the mod bullet; "Where state lives": `review/` and `conclave/`), `docs/specs/2026-10-14-sp2-conclave-and-judgement-gates-design.md` (status line)
- Modify: `packages/engine/tests/skill.test.ts` (the SP2a assertion on "SP2b"; one new test)

**Interfaces:**
- Consumes: the agents of Tasks A and B by scoped name; the engine half's `crew gate run` output ("Judgement gates to run: …"), `review/diff.patch`, `review/files.txt`, `crew judgement <id> record --ruling <path>`, `crew judgement <id> record <gate> --not-run --reason`, `crew debate <id> open --reason` / `close --tokens`.
- Produces: the wording the test asserts; the file layout `.crew/work/<id>/review/<gate>.findings.md`, `review/ruling.json`, `review/ui/<page>-<state>.png`, `conclave/researcher.md`, `conclave/expert-<n>.md`, `conclave/proposals.md`, `conclave/devils-advocate.md`, `conclave/fault-finder.md`, `conclave/judge.md`, `conclave/validator-<rule>.md`.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 7: the skill drives the debate through the roles and the judgement gates through the reviewers and the judge, recording everything through crew" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "SKILL.md's Conclave row names the checklists and the judge and keeps its command cell; its Gate row names the judgement gates and crew judgement <id> record" --criterion "references/conclave.md names the checklists, the debate protocol with the five roles by scoped name, the proposals file, the fault-finder's objections, crew debate open and close, the one screen and one revision, and the validator protocol through the judge where no person watches; the interim paragraph is gone" --criterion "references/gate.md has a Judgement gates section with the planned list, the reviewers by scoped name with the model rule, the judge, review/ruling.json, crew judgement record --ruling and --not-run, and that a judgement gate is never passed by default" --preserve "The existing skill, agents and CLI tests keep passing"
```

Standard route; `conclave.md` (Assumed: file layout and protocol of this plan; Decisions: none; Proposals: none; Warnings: the references name commands that exist only with the engine half, so this task ships with it). Five `crew phase <id> next`, then `crew tdd before <id> AC-4 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/agents.test.ts packages/engine/tests/cli.test.ts`.

- [ ] **Step 2: Write the failing tests**

In `packages/engine/tests/skill.test.ts`, in the SP2a test, replace `expect(conclave).toContain("SP2b");` with `expect(conclave).not.toContain("you run the round yourself");`, then append:

```ts
test("SP2b: the skill drives the debate through the roles and the judgement gates through the reviewers and the judge", () => {
  const method = skill.slice(skill.indexOf("## The method"), skill.indexOf("## The nine typed"));
  expect(method).toMatch(/\| Conclave \|[^\n]*checklists\/<kind>\.md[^\n]*conclave\.md[^\n]*judge[^\n]*\| `crew decision <id> add`/);
  expect(method).toMatch(/\| Gate \|[^\n]*judgement gates[^\n]*never passed by default[^\n]*\| `crew gate run <id>`, `crew judgement <id> record` \|/);
  expect(skill.slice(skill.indexOf("## Rules that do not bend"))).toMatch(/never edit a findings file or a ruling/);

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
  expect(conclave).toContain("The validator never waives an objection and never skips a gate or a test-first record");

  const gate = readReference("gate.md");
  expect(gate).toContain("## Judgement gates");
  expect(gate).toContain("Judgement gates to run:");
  for (const g of ["code-quality", "test-quality", "security", "ui-ux", "risk"])
    expect(gate).toContain(`wizardingcode-developer-crew:review-${g}`);
  expect(gate).toContain("`model: opus`");
  expect(gate).toContain("wizardingcode-developer-crew:judge");
  expect(gate).toContain("review/<gate>.findings.md");
  expect(gate).toContain("review/ruling.json");
  expect(gate).toContain("crew judgement <id> record --ruling .crew/work/<id>/review/ruling.json");
  expect(gate).toContain('crew judgement <id> record <gate> --not-run --reason "<why>"');
  expect(gate).toContain("review/ui/<page>-<state>.png");
  expect(gate).toMatch(/never passed by default/);
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- bun test packages/engine/tests/skill.test.ts
crew tdd red <id> AC-2 -- bun test packages/engine/tests/skill.test.ts
crew tdd red <id> AC-3 -- bun test packages/engine/tests/skill.test.ts
```

- [ ] **Step 4: Edit SKILL.md**

Method table, the Conclave row (the command cell is unchanged, so the SP2a regex still matches):

```markdown
| Conclave | The gap round, from the checklists for the kind of change (`checklists/<kind>.md`): write the four lists in `conclave.md`, ask each decision only the user can make, file what goes against good practice as an objection; when a decision has consequences, the debate: researcher, experts, devil's advocate, fault-finder and judge as subagents, closed by the judge (standard and full routes) | `crew decision <id> add`, `crew decide <id> D-n`, `crew objection <id> add|resolve|waive`, `crew phase <id> next` |
```

The Gate row:

```markdown
| Gate | Run the gates; fix what fails. Then the judgement gates the run planned: the reviewers and the judge as subagents, their ruling recorded as proven, not proven with findings, or not run with a reason, never passed by default | `crew gate run <id>`, `crew judgement <id> record` |
```

Rule 2 gains one sentence at its end: "A judgement gate's ruling is the judge's: never edit a findings file or a ruling, and never re-launch a reviewer to get a different answer; the diff changes or the user decides."

- [ ] **Step 5: Rewrite `references/conclave.md`**

Full new text:

```markdown
# Conclave

Standard and full routes, after the spec. Goal: say what the request leaves out before a line is written, and let the user decide what only they can. The gap round is yours, in this context, from the checklists; the debate, when it opens, runs in roles with their own contexts.

## The gap round, always

Pick the checklists for the kind of change, `checklists/<kind>.md` in this skill's folder (beside `references/`): `endpoint`, `auth` (a login or a permission), `payment` (a checkout or a payment), `upload`, `migration-or-restore`, `sync` (a third party), `link-target` (a redirect or a link), `deletion`, `merge`, `screen`. A change is often two kinds (a deletion behind a permission: `deletion` and `auth`); read each. Then write `.crew/work/<id>/conclave.md` with the four headings below, each with content or the word "none", answering the checklists' questions for this request. The engine refuses `crew phase <id> next` into Plan until all four have content, until every decision has a counted answer, and until every blocking objection is bound to a criterion or waived.

## Assumed by good practice

What you will do without asking, stated so the user can refuse: "The endpoint is authenticated and paginated." Each line becomes a criterion (`crew criteria <id> add "<text>"`), `preserve` when it keeps something as it is.

## Decisions only the user can make

What two competent engineers would build differently. Record each one as you find it: `crew decision <id> add "<question>" --default "<the conservative answer>"`. Present them on one screen, each with what is being decided, why, the facts, the evidence and the default you propose (mark the work with `crew await <id> user` when the answers need a turn). The user's positive word is the signature: record each answer with `crew decide <id> D-n "<answer>"` yourself; under the default policy no prompt appears and the record says "by the user, relayed by the agent". A decision without a counted answer blocks Plan. In an unattended session (headless, bypassPermissions or dontAsk), and only when `policy.json` sets `unattendedDecisions` to `validator`, the validator takes the stated default (see The validator): `crew decide <id> D-n --mode <mode> --validator stated-default`. No default, no validator: the item waits for a person.

## Proposals

Optional improvements, each with its reason. The user takes or leaves each; a taken one becomes a criterion.

## Warnings

What the request asks for that goes against good practice, and why. Each one is an objection: `crew objection <id> add "<text>" --by gap-round --severity advisory`, or `blocking` when building it as asked would be wrong. A blocking objection is answered by binding it to the criterion whose proof resolves it (`crew objection <id> resolve O-n --criterion AC-k`) or by the user's waiver (`crew objection <id> waive O-n --reason "<why>"`, which asks the user and shows in the report as decided by the user). Plan is refused while a blocking objection is neither; the item is not proven while one is open or bound to an unproven criterion. The report lists every objection with its status, and its verdict line says how many were waived.

## When the debate opens

The debate opens on consequences, never on the route alone: a blocking objection from the round, a warning the user wants to build anyway on a risk area, a decision whose answer changes a risk area (who holds a permission, what is hard-deleted, which side of a conflict wins), or the user asking for it. Say why in one line: `crew debate <id> open --reason "<the consequence>"`. It is capped: one research pass, at most three experts, one revision.

## The debate, step by step

Each role is a subagent of this plugin with a clean context and read-only tools. Launch it with the Agent tool by its scoped name; pass paths and questions, never transcripts; save its answer verbatim with the Write tool (the files under `.crew/work/<id>/conclave/` are yours to write; the ledger is not). Add up the token usage the Agent tool reports for each call.

1. **Researcher**, `wizardingcode-developer-crew:researcher`: the id, the paths of `brief.md`, `spec.md` and `conclave.md`, the open decisions (D-n and question). Save as `conclave/researcher.md`.
2. **Experts**, `wizardingcode-developer-crew:expert`, in parallel in one message, one per open decision with consequences, at most three: the same paths, `conclave/researcher.md`, and its one decision. Save as `conclave/expert-<n>.md`. Then write `conclave/proposals.md`: each expert's `## Proposal` section only, headed `## P-<n> (D-<n>)`; never its `## Reasoning`.
3. **Devil's advocate**, `wizardingcode-developer-crew:devils-advocate`, and **fault-finder**, `wizardingcode-developer-crew:fault-finder`, in parallel, each given one path, `conclave/proposals.md`, and nothing else. Save as `conclave/devils-advocate.md` and `conclave/fault-finder.md`. File each of the fault-finder's lines: `crew objection <id> add "<text>" --by fault-finder --severity blocking|advisory`.
4. **Judge**, `wizardingcode-developer-crew:judge`, "as judge of the debate": `conclave/proposals.md`, `objections.json`, `conclave/researcher.md`, `conclave/devils-advocate.md`, and the decisions with the answers given so far (from `crew status --json`). Save as `conclave/judge.md`.
5. **One screen to the user**: the proposals in a line each, the objections with their severity, the ruling, what it leaves open. Each decision in the form rule 4 asks (what is being decided, why, the facts, the evidence, the default you propose); their positive word is the signature, `crew decide <id> D-n "<answer>"`. The user may decide against the ruling: `crew objection <id> waive O-n --reason "<their words>"`, which asks them, and the report says "decided by the user".
6. **One revision**: when an answer changes a proposal, the judge once more, with the user's answers in the prompt, on the same files; it replaces `conclave/judge.md`. No second round of experts.
7. **Close**: `crew debate <id> close --tokens <the sum>`. Amend `spec.md` from the ruling (Design, criteria); add each criterion it names (`crew criteria <id> add "<text>" --kind <kind>`); bind each blocking objection (`crew objection <id> resolve O-n --criterion AC-k`). What the judge left open stays a decision: answered, or `crew await <id> user`.

## The validator

The validator decides only what a rule covers: a spec approval under `complete-gap-round` and, where no person watches, a decision's stated default. With a person present, when the round found nothing to decide, you approve under the rule yourself: `crew approve <id> spec --validator complete-gap-round`, refused by the engine while a section, a default or a binding is missing, and counted because the person is there to object; the judge does not run. Where no person watches (headless, bypassPermissions or dontAsk) and `policy.json` sets `unattendedDecisions` to `validator`, the judge reads the rule first: launch `wizardingcode-developer-crew:judge` "as validator" with `spec.md`, `conclave.md`, `objections.json` and the rule's name; save the answer as `conclave/validator-<rule>.md`. "holds": run the command with `--mode <mode> --validator <rule>` (`crew approve <id> spec …` or `crew decide <id> D-n …`). "does not hold": do what its "Missing" names when it is yours to do (a section, a default), otherwise `crew await <id> user`. Under policy `wait` or `count`, as before. The validator never waives an objection and never skips a gate or a test-first record. The record always says "by the validator (rule: …)", never "by the user".

## Then

`crew phase <id> next` into Plan, and on as the method says.
```

- [ ] **Step 6: Rewrite `references/gate.md`**

The existing text (lines 1–19) stays as it is; append:

```markdown
## Judgement gates

After the deterministic gates pass, `crew gate run <id>` cuts the change for review (`.crew/work/<id>/review/diff.patch`, `.crew/work/<id>/review/files.txt`) and prints the plan: `Judgement gates to run: code-quality (standard route), test-quality (standard route), security (risk area auth), ui-ux (interface files)`. Code quality and test quality run on standard and full; security on full, and on standard when a risk area is touched; UI/UX on any route when interface files changed; risk on full. The roles run as subagents with clean contexts; the engine records their ruling and judges the verdict from it. A judgement gate is never passed by default: it is proven, not proven with findings, or not run with a reason.

1. **Reviewers, in parallel**, one Agent call each in the same message, `subagent_type: wizardingcode-developer-crew:review-<gate>`. Pass `model: opus` on the Agent call on the full route or when the diff touches a risk area; pass nothing otherwise (the file's default, sonnet). The prompt gives the id, the two review paths and the criteria (id, kind, text; the recorded reason of an `observed` one), plus per gate: security, the risk areas and the paths that raised each; risk, the paths of `spec.md` and `plan.md`; ui-ux, the capture folder. Save each answer verbatim with Write as `.crew/work/<id>/review/<gate>.findings.md`.
2. **UI/UX needs captures.** With a browser the session can drive, open each page the diff changes in each state its criterion names and save one capture per page and state as `.crew/work/<id>/review/ui/<page>-<state>.png` before launching the reviewer. Without a browser, do not launch it: `crew judgement <id> record ui-ux --not-run --reason "no browser"`.
3. **The judge, once**, `wizardingcode-developer-crew:judge`, "as judge of the gates": the id, the diff path, every findings file and each gate's rubric path (`${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/<gate>.md`). Save its JSON as `.crew/work/<id>/review/ruling.json`; set each ruling's `tokens` to the reviewer's and the judge's reported usage when you have it, else leave 0.
4. **Record**: `crew judgement <id> record --ruling .crew/work/<id>/review/ruling.json`. The verdict follows: a not-proven gate lists its findings by file and line. Fix them (the diff changes, so the next `crew gate run <id>` cuts it again and plans the gates again) or the user decides (`crew skip` only when `policy.json` lists the gate).
5. **A gate that cannot run** for any other reason (a reviewer answered with nothing under "Findings" and `all · …` under "Not answerable"): `crew judgement <id> record <gate> --not-run --reason "<why>"`. Not run leaves the item not proven until the user decides.

Never edit a findings file or a ruling; never launch the judge before every planned reviewer has answered; never re-launch a reviewer to get a different answer. The report's "Judgement gates" section names each gate's verdict, the number of findings and the tokens.
```

If this Claude Code version's Agent tool has no `model` field, the frontmatter default runs; record it as a finding and leave the reference as written, since the host's `AgentSpec.model` exists.

- [ ] **Step 7: README and the spec's status line**

`README.md`, "What exists today": the skill bullet gains ", with the checklists by kind the gap round reads (`skills/crew/checklists/`) and the rubrics the judgement gates are ruled by (`skills/crew/rubrics/`)". A new bullet after it:

```markdown
- **The roles** (`plugins/core/agents/`): ten subagents with clean contexts and read-only tools, launched by the skill and never on their own. For the judgement gates, five reviewers (sonnet; opus on the full route or a risk area) and the judge (fable); for the debate, the researcher, the experts, the devil's advocate and the fault-finder (opus), closed by the judge, who also acts as validator where no person watches. They return text; the session saves it under `.crew/work/<id>/review/` and `conclave/` and records it through `crew`, so nothing a role says becomes a verdict without the engine.
```

The mod bullet gains: "; a mark per judgement gate after the gate marks; the panel lists the gap round's decisions, the objections and one row per judgement gate". "Where state lives", `work/<id>/` gains "`review/` (the diff and the files the gate run cut, the reviewers' findings, the judge's ruling, UI captures) and `conclave/` (the debate's research, proposals, objections, ruling)".

The spec's status line (line 3): replace "the roles as plugin agents, the checklists, the judgement gates, the mod's panel (SP2b) and the evals and hardening (SP2c) await their plans" with "SP2b (the roles as plugin agents, the rubrics, the checklists, the judgement gates, the debate record, the panel) is implemented by the [SP2b plan](../plans/2026-10-14-sp2b-roles-and-judgement-gates.md); the evals and hardening (SP2c) await their plan".

- [ ] **Step 8: Green, after, gates, commit**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/skill.test.ts
crew tdd green <id> AC-2 -- bun test packages/engine/tests/skill.test.ts
crew tdd green <id> AC-3 -- bun test packages/engine/tests/skill.test.ts
crew tdd after <id> AC-4 -- bun test packages/engine/tests/skill.test.ts packages/engine/tests/agents.test.ts packages/engine/tests/cli.test.ts
crew gate run <id>
git add -A packages/engine/tests/skill.test.ts plugins/core/skills README.md docs/specs .crew/work && git commit -m "SP2b: the skill drives the debate and the judgement gates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The panel shows decisions, objections and judgement gates

**Files:**
- Modify: `plugins/core/hooks/register.js` (`paneTree`, `gatesText`, `verdictLine`, `statusText`; new `decisionText`, `objectionText`, `judgementText`, `judgementMarks`, `conclaveText`)
- Modify: `plugins/core/tests/crew-mod.test.ts` (fixture `JUDGED`, four tests)

**Interfaces:**
- Consumes, from `crew status --json`: `decisions: [{id, question, answer?, by?}]`, `objections: [{id, severity, status, text?}]`, `judgement: [{gate, status: "planned"|"proven"|"not-proven"|"not-run"|"stale"|"skipped", planned, findings, reason?}]`, `debate: "none"|"open"|"closed"`. Every field optional: the mod reads `status.x || []`.
- Produces: pane lines `D-1 <question> → <answer> (by <who>)` / `→ unanswered`, `O-1 blocking open · <text>`, `debate open`, `<gate>: proven (n findings)` / `not proven (n findings)` / `not run (<reason>)` / `stale (<reason>)` / `planned`; strip marks `<gate> ✓|✗|?|…` appended after the deterministic marks (`…` for planned and stale, `?` for not run); `/crew status` line `  decisions 2 (1 unanswered) · objections 1 (1 blocking open) · debate open` and one `  <gate>: …` row per judgement gate; the verdict line names proven judgement gates after the deterministic ones.

- [ ] **Step 1: Open the work item**

```bash
crew start "SP2b task 8: the mod shows the gap round's decisions, the objections and the judgement gates in the strip, the panel and /crew status" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "The strip appends one mark per judgement gate after the deterministic gate marks: proven ✓, not proven ✗, not run ?, skipped –, planned and stale …" --criterion "The panel lists each decision with its answer and who took it or unanswered, each objection with severity, status and text, the debate state, and one line per judgement gate with its verdict and findings or reason" --criterion "/crew status prints the conclave counts and one row per judgement gate, and a proven item's verdict line names the judgement gates it proved" --preserve "The existing mod tests keep passing on answers without the SP2b fields"
```

Standard route; `conclave.md` (Assumed: the status fields as the engine half defines them; the mod tolerates their absence; Decisions: none; Proposals: none; Warnings: none). Five `crew phase <id> next`, then `crew tdd before <id> AC-4 -- claude plugin test plugins/core`. (`crew tdd` runs the command through the shell; the mod tests need the plugin runtime, so `claude plugin test` is the test command for this task.)

- [ ] **Step 2: Write the failing tests**

Append to `plugins/core/tests/crew-mod.test.ts`, after the `PANE` constant:

```ts
// A standard-route item in its gate phase: the deterministic gates passed, the judgement gates in every state
const JUDGED = {
  ...PROVEN,
  active: "2026-10-15-002-delete-accounts",
  title: "Delete accounts",
  phase: "gate",
  route: "standard",
  phases: ["receive", "recognize", "understand", "specify", "conclave", "plan", "build", "gate", "deliver"],
  verdict: "unproven",
  unproven: ["judgement gate test-quality not proven"],
  decisions: [
    { id: "D-1", question: "Erasure or deactivation?", answer: "deactivation", by: "user" },
    { id: "D-2", question: "Who holds the delete permission?" },
  ],
  objections: [{ id: "O-1", severity: "blocking", status: "open", text: "A support ticket's delete may be an erasure request" }],
  judgement: [
    { gate: "code-quality", status: "proven", planned: "standard route", findings: 0 },
    { gate: "test-quality", status: "not-proven", planned: "standard route", findings: 3 },
    { gate: "ui-ux", status: "not-run", planned: "interface files: resources/views/account.blade.php", findings: 0, reason: "no browser" },
    { gate: "security", status: "planned", planned: "risk area personal-data", findings: 0 },
  ],
  debate: "open",
};

test("the strip appends one mark per judgement gate after the gate marks", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(JUDGED), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "crew 2026-10-15-002-delete-accounts · gate · standard · not proven (judgement gate test-quality not proven) · secrets ✓ test ✓ code-quality ✓ test-quality ✗ ui-ux ? security …" })).toBeDefined();
  await ui.unmount();
});

test("the panel lists decisions with their answers, objections with their text, the debate and the judgement gates", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(JUDGED), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "receive › recognize › understand › specify › conclave › plan › build › [gate] › deliver" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "D-1 Erasure or deactivation? → deactivation (by user)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "D-2 Who holds the delete permission? → unanswered" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "O-1 blocking open · A support ticket's delete may be an erasure request" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "debate open" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "code-quality: proven (0 findings)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "test-quality: not proven (3 findings)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "ui-ux: not run (no browser)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "security: planned" })).toBeDefined();
  await ui.unmount();
});

test("/crew status prints the conclave's counts and one row per judgement gate", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(JUDGED), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "status" });
  expect(answer.text).toContain("  decisions 2 (1 unanswered) · objections 1 (1 blocking open) · debate open");
  expect(answer.text).toContain("  code-quality: proven (0 findings)");
  expect(answer.text).toContain("  test-quality: not proven (3 findings)");
  expect(answer.text).toContain("  ui-ux: not run (no browser)");
  expect(answer.text).toContain("  security: planned");
  expect(answer.text).toContain("Not proven: judgement gate test-quality not proven");
});

test("a proven item's verdict line names the judgement gates it proved", async ($, on) => {
  const judged = { ...PROVEN, judgement: [{ gate: "code-quality", status: "proven", findings: 0 }], decisions: [], objections: [], debate: "none" };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(judged), stderr: "" }));
  on("turn.complete", () => ({ text: "theirs" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const line = await $.turn.complete({ turnId: "t1", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(line.text).toBe("Proven: secrets, test, code-quality");
});
```

- [ ] **Step 3: Run the red**

```bash
crew tdd red <id> AC-1 -- claude plugin test plugins/core
crew tdd red <id> AC-2 -- claude plugin test plugins/core
crew tdd red <id> AC-3 -- claude plugin test plugins/core
```

Expected: the four new tests fail (strip text without the judgement marks; pane lines and status lines not found; verdict line "Proven: secrets, test"), the sixteen existing ones pass.

- [ ] **Step 4: Change `register.js`**

In `paneTree`, replace the block from the criteria loop to the skips loop (lines 141–153) with:

```js
    for (const c of status.criteria || []) {
      lines.push(Text({ children: [c.id + ' ' + c.kind + ' · ' + c.tdd + ' · ' + c.text] }))
    }
    for (const d of status.decisions || []) {
      lines.push(Text({ children: [decisionText(d)] }))
    }
    for (const o of status.objections || []) {
      const open = o.severity === 'blocking' && o.status === 'open'
      lines.push(open ? Text({ color: 'red', children: [objectionText(o)] }) : Text({ children: [objectionText(o)] }))
    }
    if (status.debate && status.debate !== 'none') {
      lines.push(Text({ dimColor: true, children: ['debate ' + status.debate] }))
    }
    lines.push(Text({ children: [' '] }))
    for (const r of status.runs || []) {
      lines.push(Text({ children: [r.gate + ' (' + r.target + '): ' + r.status + ' in ' + (r.durationMs / 1000).toFixed(1) + 's' + (r.reason ? ' (' + r.reason + ')' : '')] }))
    }
    for (const j of status.judgement || []) {
      lines.push(Text({ children: [judgementText(j)] }))
    }
    for (const reason of status.unproven || []) {
      lines.push(Text({ color: 'red', children: ['✗ ' + reason] }))
    }
    for (const s of status.skips || []) {
      lines.push(Text({ dimColor: true, children: ['skipped ' + s.step + ': ' + s.reason] }))
    }
```

After `phasesText`, add the four helpers:

```js
// "D-1 Erasure or deactivation? → deactivation (by user)", or "→ unanswered"
function decisionText(d) {
  const answer = d.answer ? d.answer + (d.by ? ' (by ' + d.by + ')' : '') : 'unanswered'
  return d.id + ' ' + d.question + ' → ' + answer
}

// "O-1 blocking open · <text>"; an engine before SP2b sends no text
function objectionText(o) {
  return o.id + ' ' + o.severity + ' ' + o.status + (o.text ? ' · ' + o.text : '')
}

const JUDGEMENT_WORDS = { planned: 'planned', proven: 'proven', 'not-proven': 'not proven', 'not-run': 'not run', stale: 'stale', skipped: 'skipped' }

// "code-quality: proven (0 findings)", "ui-ux: not run (no browser)", "security: planned"
function judgementText(j) {
  const word = JUDGEMENT_WORDS[j.status] || j.status
  if (j.status === 'planned') return j.gate + ': ' + word
  if (j.status === 'not-run' || j.status === 'stale' || j.status === 'skipped') return j.gate + ': ' + word + (j.reason ? ' (' + j.reason + ')' : '')
  return j.gate + ': ' + word + ' (' + (j.findings || 0) + ' findings)'
}

// "decisions 2 (1 unanswered) · objections 1 (1 blocking open) · debate open", or '' when the item has none
function conclaveText() {
  const decisions = status.decisions || []
  const objections = status.objections || []
  const parts = []
  if (decisions.length) parts.push('decisions ' + decisions.length + ' (' + decisions.filter((d) => !d.answer).length + ' unanswered)')
  if (objections.length) parts.push('objections ' + objections.length + ' (' + objections.filter((o) => o.severity === 'blocking' && o.status === 'open').length + ' blocking open)')
  if (status.debate && status.debate !== 'none') parts.push('debate ' + status.debate)
  return parts.join(' · ')
}
```

In `gatesText`, replace the comment and the return:

```js
// The gates as one short list: "secrets ✓ test ✗ lint …", a planned gate with no run yet as "…";
// the judgement gates follow with the same marks, "?" for not run, "…" for planned or stale
function gatesText() {
  …existing body up to the loop…
  const judged = { proven: '✓', 'not-proven': '✗', 'not-run': '?', planned: '…', stale: '…', skipped: '–' }
  for (const j of status.judgement || []) parts.push(j.gate + ' ' + (judged[j.status] || '?'))
  return parts.join(' ')
}
```

In `verdictLine`, the proven branch:

```js
  if (status.verdict === 'proven') {
    const passed = (status.runs || []).filter((r) => r.status === 'pass').map((r) => r.gate)
    const judged = (status.judgement || []).filter((j) => j.status === 'proven').map((j) => j.gate)
    const names = [...passed, ...judged]
    return 'Proven: ' + (names.length ? names.join(', ') : 'nothing to run')
  }
```

In `statusText`, after the phase line and after the runs loop:

```js
  const conclave = conclaveText()
  if (conclave) lines.push('  ' + conclave)
  for (const r of status.runs || []) { …unchanged… }
  for (const j of status.judgement || []) lines.push('  ' + judgementText(j))
  lines.push(verdictLine())
```

- [ ] **Step 5: Green, after, gates, plugin check, commit**

```bash
crew tdd green <id> AC-1 -- claude plugin test plugins/core
crew tdd green <id> AC-2 -- claude plugin test plugins/core
crew tdd green <id> AC-3 -- claude plugin test plugins/core
crew tdd after <id> AC-4 -- claude plugin test plugins/core
crew gate run <id>
bun run plugin:check
git add -A plugins/core/hooks/register.js plugins/core/tests/crew-mod.test.ts .crew/work && git commit -m "SP2b: the panel shows decisions, objections and judgement gates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

`register.js` is outside biome's `includes` (`!**/plugins`), so the formatting of the new helpers follows the file's own style (single quotes, no semicolons) by hand.

---

---

### Task 9: Release 0.4.0

**Files:**
- Modify: `package.json`, `packages/engine/package.json`, `packages/engine/src/version.ts`, `plugins/core/.claude-plugin/plugin.json` (version 0.4.0)
- Modify: `packages/engine/tests/version.test.ts` (:12), `packages/engine/tests/cli.test.ts` (the `--version` line, :50)
- Modify: `README.md` (the "0.3.0" line at :69 becomes the 0.4.0 line: roles, rubrics, checklists, judgement gates, debate record, panel), `docs/vision.md` (status line :3: "0.4.0 … is SP2b: …; the evals (SP2c) are next"), `docs/specs/2026-10-14-sp2-conclave-and-judgement-gates-design.md` (status line, if Task 7 did not already name 0.4.0)
- Build: `plugins/core/dist/crew.mjs` (committed; `scripts/build.ts` refuses a version mismatch between `plugin.json` and `VERSION`)

**Interfaces:**
- Consumes: every task above, merged on `main`.
- Produces: tag `v0.4.0`, the GitHub release, the marketplace entry (`WizardingCode-io/wizardingcode-plugins`: `version`, `ref: v0.4.0`, `metadata.version`, committed as `wizardingcode-developer-crew 0.4.0`).

- [ ] **Step 1: Open the work item** (fast route, as the 0.3.0 item was)

```bash
crew start "0.4.0: version 0.4.0 in package.json, packages/engine/package.json, src/version.ts and plugin.json, and the two tests that assert it" --answers '{"work_type":"chore","is_vague":0.02,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "crew --version prints 0.4.0 and package.json, packages/engine/package.json and plugins/core/.claude-plugin/plugin.json say 0.4.0"
```

- [ ] **Step 2: Red** — edit the two tests to expect `0.4.0`, then `crew tdd red <id> AC-1 -- bun test packages/engine/tests/version.test.ts` (fails: `Received: "0.3.0"`).

- [ ] **Step 3: Bump** — the four files to `0.4.0`; `bun run build`; the README, vision and spec lines.

- [ ] **Step 4: Green, gate, commit, tag, release**

```bash
crew tdd green <id> AC-1 -- bun test packages/engine/tests/version.test.ts
crew gate run <id>
bun run check && bun run plugin:check
git add -A && git commit -m "0.4.0: roles and judgement gates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git tag -a v0.4.0 -m "0.4.0: roles and judgement gates" && git push origin main --tags
gh release create v0.4.0 --title "0.4.0: roles and judgement gates" --notes "SP2b: the five debate roles and the five reviewers as plugin agents with clean contexts; the judge as validator; judgement gates planned from the route, the risk areas and the diff, recorded through crew judgement, never passed by default; checklists by kind for the gap round; the debate record; the panel shows decisions, objections and judgement gates."
```

Then in the marketplace repository: the entry's `version` and `ref` to `v0.4.0`, `metadata.version`, committed as `wizardingcode-developer-crew 0.4.0`. The plugin updates on the next `claude plugin update` and takes effect after the user restarts Claude Code (the agent never asks the user to run a command; it says the restart is needed and why).

---

## After the last task

- `bun run check && bun run plugin:check` green on `main`; everything pushed; the marketplace points at `v0.4.0`.
- The user restarts Claude Code. The first real use of SP2b in this repository is the next standard item: its gap round reads `checklists/`, its gate run prints the judgement gates and the roles run; the first full item opens a debate if a decision has consequences. What gets in the way is a finding in `docs/real-use/findings.md` against SP2b, in particular: whether the Agent tool honours `model: opus` and `model: fable` from the frontmatter and the call; tokens per gate as the evidence records them; any finding that reached `ruling.json` without a file and line; the time a standard item's two reviewers plus the judge add.
- SP2c plan next (`docs/plans/…-sp2c-evals-and-hardening.md`): the eight eval cases of spec §15 (including `judgement-gate-not-run`, which `review-ui-ux.md` and `references/gate.md` step 2 are written for, and `validator-unattended-approval`, which the judge's "As validator" section is written for), the fast-route-overhead case re-measured, the hardening items of ADR 0004, then the real-use phase that ADR 0004 asks for before 1.0.
- Not in SP2b, by design (spec §2 non-goals): calibrated decision backends for the roles (SP3), per-stack checklists in packs (SP6), mutation tooling installed by the engine (the test-quality rubric reads a report when the profile has one).

## Self-review

- **Spec coverage.** §6 checklists by kind: Task 6; `conclave.md` reads them: Task 7. §7 roles in separate contexts, the critic and the fault-finder receive the proposals only, the judge never sees the conversation, the user in the room, one revision, the cap: Tasks 6 and 7; the debate record and its cost: Task 4. §9 the judge as validator with the two rules and nothing else: Task 5 (body), Task 7 (protocol); the engine's checks are SP2a's. §10 the five gates with routes, what each receives, rubrics, "not run never passed", findings tied to file and line, the judge decides, the change not the repository, the planned list printed before the run, tokens per gate: Tasks 1, 2, 3, 5, 7. §13 engine changes: Tasks 1 to 4 (phases unchanged; `judgementGates`, `allowSkips` by name; `evidence.judgement`; report sections; hooks unchanged by construction, tested in Task 2). §14 skill and plugin: Tasks 5 to 8. §16 acceptance 6 (Task 3), 9 (SessionStart untouched; checked by the existing hooks-context tests), 10 (every task is a crew item with a gap round). ADR 0006: `outside` marking (Task 3), rubrics' "Only the change" (Task 5). ADR 0005: no new user-only command; `--mode` and `--validator` paths unchanged.
- **Placeholders.** None: each step has its code, its file text or its exact wording. Two places say "copy from the code": the existing skip refusal wording (cli.ts:914) and the SP2a objection test's text (cli.test.ts:1091), both quoted in the plan with their line numbers.
- **Type consistency.** `JudgementGateName`, `PlannedJudgement`, `JudgementRecord`, `Evidence.judgement` (Task 1) are what Tasks 2 and 3 read and what the mod (Task 8) renders: the status row's `status` set is `planned | proven | not-proven | not-run | stale | skipped` in both `judgementRows` (Task 2) and `JUDGEMENT_WORDS` (Task 8); the ruling file's shape is the same in `parseRulings` (Task 3), the judge's body (Task 5) and `references/gate.md` (Task 7); the review paths (`review/diff.patch`, `review/files.txt`, `review/<gate>.findings.md`, `review/ruling.json`, `review/ui/`) are the same in `writeReviewInputs` (Task 2), the gate run's printed line (Task 2), the agents (Task 5) and the references (Task 7); the debate commands (Task 4) are the ones `conclave.md` names (Task 7). The scoped agent names `wizardingcode-developer-crew:<name>` match the `name` frontmatter asserted in `agents.test.ts`.
- **Review Focus.** 1, 2, 4, 5 in Task 3; 3 in Tasks 1 and 2; 6 in Tasks 5 and 6 (`agents.test.ts`); 7 in Task 8 (the existing fixtures carry none of the new fields and their tests stay); 8 in Task 4. Two more from the plugin half: a finding without file and line never becomes a defect (the judge's body drops it; the reviewers list it under "Not answerable": Task 5), and an expert's reasoning never reaches the devil's advocate or the fault-finder (`expert.md` keeps the sections apart; `conclave.md` step 2 copies `## Proposal` only: Tasks 6 and 7).
- **Order.** Tasks 1 to 4 first (the engine), then 5 and 6 (agents, rubrics, checklists; they test without the engine half), then 7 (the references name the new commands, so it ships with them), then 8 (the panel reads the new status fields), then 9. Nine commits, one release.

