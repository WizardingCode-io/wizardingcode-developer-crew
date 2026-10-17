# SP7a: Teams and the tech lead. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session, through the crew method (each task is a crew work item in this repository, as SP2c was). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Written on 2026-10-17**, from the SP7 design approved the same day (`docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md`) and ADR 0007. SP7a is the first of its two releases (0.6.0): the organization in the engine and the first visibility. SP7b (0.7.0: the environment, priorities and statuses, threads, sessions in the mod) is planned after 0.6.0's real use.

**Goal:** An item is worked by a team the route sizes, under a tech lead, with every seat planned before it runs and recorded after; the spec and the brief are validated by the mandatory teams' leads with proof; each todo ends with a gate dedicated to its change and a brief; every decision of a project is recorded once and re-read; the user sees the team, the todo and the agents working; three rounds are refused by the engine.

**Architecture:** No model runs inside the engine. A constant registry (`packages/engine/src/team.ts`) is the one source of the roles' names, the teams, their mandatory rules and their presence per route; `plannedSeats()` replaces the hardcoded judgement planning and every place that knew the roles by name derives from it (`mail.ts`, `hooks/subagent-stop.ts`, `hooks.json` checked by a test). The policy's `team` block tightens caps that the recording commands enforce as refusals. New read-only agents (three reviewers, the tech lead, the CTO) and five personality files live in the plugin; the skill's references say when the lead launches them. Validations and the project's decision register are engine-owned records written only by `crew`. The mod reads them from `crew status --json`.

**Tech Stack:** TypeScript (dependency-free engine, Bun for tests, Biome), Node 20+ at run time, the Claude Code Agent tool with `subagent_type` and `model`, the mods API already used by `plugins/core/hooks/register.js`, `claude plugin eval` for the six cases.

**Spec:** `docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md` (§5 the rules, §6 the organization, §6.4 the validation, §6.5 metrics, §6.6 records, §8.1 the gate per todo, §14 visibility, §15 evals, §16 delivery). The rules the engine enforces in this release: 1, 4, 6, 8, 9, 10, 12, 14, 16, 18.

**Decisions taken while writing this plan** (each a reading of the spec where it left a detail open; the reviewer of the plan may object to any):

1. **`plannedJudgementGates` stays exported and becomes a view of `plannedSeats`** (the seats of kind `gate` mapped to `PlannedJudgement[]`), so `gates.ts`, `evidence.ts`, the status and the panel keep their callers; the three new gates (`architecture`, `data`, `infra`) join `JudgementGateName` and `JUDGEMENT_GATES` (eight gates) and appear through the registry.
2. **The validating leads on the standard route are QA's and security's** (`lead-qa`, `lead-security`); on the full route the architects' always and ETL's or DevOps's when their rule fires; the researchers have no validating lead (their work is the research file); the item's primary team (backend, or frontend when the change touches interface files) is the session itself, recorded as `primaryTeam`. A validation is recorded by the session from the lead's file; the engine parses the verdict and refuses a contradiction.
3. **A round is counted when something is recorded, not when a gate run cuts the diff**: `work.rounds.judgement` increments at `crew judgement record` (the records against one state of the code are one round: a ruling re-filed on the same code, or a not-run beside it, counts once; a record against new code opens the next round; ruled at Task 1's execution, since the SP2b tests re-file rulings on the same code), `work.rounds.validation` at each `crew validation record --what spec` round (the set of leads recorded between two spec fingerprints), a todo's `gate.round` at each `crew task gate`. The cap is checked before recording; past it the command refuses and names `crew continue <id> judgement|validation|gate T-n`, a user-only command that grants one more round and is recorded as the user's (relayed or prompted, like every user-only command).
4. **Validations are tied to the spec's content hash** (sha256 of `spec.md` for `spec`, of `plan.md` for `plan`, of the item's evidence fingerprint for `delivery`): a spec edited after a validation makes it stale, and the Plan guard asks for the leads again.
5. **The gate per todo runs the deterministic gates only in SP7a** (the targets the todo's diff touches, the test gate narrowed by `Target.testScoped` where detected or set); the judgement gates run once at the final gate run as today. Per-todo judgement (ui-ux, security when the diff asks) is SP7b's, once the environment exists for QA's proof.
6. **`Target.testScoped` is detected for node with vitest (`vitest related {files} --run`) and jest (`jest --findRelatedTests {files}`) and for python with pytest (`pytest {files}`, test files only); other stacks set it with `crew profile set testScoped "<cmd with {files}>" [--target <path>]`**, a user's decision like `test`.
7. **The decision register lives in `.crew/decisions.json`**, protected like the ledger, appended by the commands that take or record a decision; `crew decisions [<id>] [--grep <text>]` lists it newest first; `crew start` prints how many entries the register holds. Which entries "touch" an item is the lead's reading (the Understand reference says to quote them), not a path match the engine cannot make before paths exist.
8. **Roles running are recorded by the PreToolUse hook on the Agent tool** (`tool_input.subagent_type` with the plugin's prefix) into the session's local state, and cleared by SubagentStop; the PreToolUse matcher in `hooks.json` gains `Agent`. On the fast route no Agent call is made, so the overhead case does not move.
9. **The CTO is a report before it is a seat**: `crew metrics` (deterministic) and `crew cto record --workspace <ws> --file <plan>` ship in SP7a; the CTO's seat on full items ("as reviewer of the strategy") waits for the strategy stage (SP8). The `cto.md` agent file ships now so the lead can launch it over the metrics.
10. **The personalities apply to the debate's seats only**; the experts' rotation is fixed in the registry (`conservative`, `creative`, `adventurous`), the fault-finder is `sceptical` and the judge `professional` by their files; the hook reads a `personality:` header line into `RoleRecord.personality`.
11. **`SKILL.md` keeps its 9254-byte ceiling**: the Rules row of the references table is paid for by trimming elsewhere on the page; the test from the debt item stays.
12. **One release, 0.6.0, at the close**, with the README paragraph, the real-use README's SP7 paragraph, the eval run recorded, the tag, the GitHub release and the marketplace entry; no version bump before Task 8.

## Global Constraints

- Every task is a crew work item in this repository: `crew start "<request>" --answers '<json>' --criterion "…" --preserve "…"`, the failing test and `crew tdd red` before the code, `crew tdd green`, `crew tdd before`/`after` for a preserve criterion, one `crew gate run <id>`, the judgement gates (standard route: code-quality and test-quality; the user's rule: at most two rounds, the second scoped to the first's defects, advisories to `docs/real-use/findings.md`), `crew judgement record`, commit on `main`, push after each task.
- The `crew` on PATH is the installed plugin, **0.5.1**, for the whole of SP7a; the new commands and the new agents are exercised by the tests and by `node plugins/core/dist/crew.mjs …` after `bun run build`, never by this repository's own items until 0.6.0 is installed.
- `bun run check` green before every commit; `bun run format` fixes lint. Tasks that touch `plugins/core` (2, 3, 4, 7, 8) also run `bun run plugin:check`. `bun run build` after every engine change the hooks or the mod exercise (the bundle is committed).
- The engine has no runtime dependency; imports carry an explicit `.ts`; engine-owned files are written through `writeProtectedJson`/`writeProtectedText`; the hooks fail open (`{}` on any exception).
- **A policy can only tighten**: the `team` caps' ranges end at their defaults (1 to 2 for the round caps, 1 to 3 for `maxExperts`); `team.always` adds teams, nothing removes one.
- **The fast route launches no role and its cost does not rise**: `plannedSeats("fast", …)` returns the deterministic gates' seats only; the PreToolUse hook's Agent branch runs only when an Agent call happens; `SKILL.md` stays at or under 9254 bytes.
- Roles stay read-only (no Write, Edit, MultiEdit, NotebookEdit, Bash, Agent, Task in any agent's `tools`), with clean contexts, and talk through the lead (SP2c §7). A validation, a ruling and a findings file are never edited by the session; a reviewer is never re-launched for a different answer.
- Naming: `wizardingcode-developer-crew:<agent>`; variables `WIZARDINGCODE_CREW_*`; data under the user's crew directory (`WIZARDINGCODE_HOME` honoured); files in English; no client project name in the repository (fixtures use `a`, `b`, `storefront`, `crm`, `lead`).
- No version bump before Task 8. One release, 0.6.0, at the close; the marketplace entry and the restart after it.

## Review Focus

Five input classes the spec implies and no task's tests would otherwise exercise; each line names the task that owns the test.

1. **A lead's file that says `validated` and lists open returns** (`- R-1 …` under `## Returns`): `crew validation record` refuses it as a contradiction, records nothing, and names the two ways out (the lead returns, or the returns are closed in the file). Test in Task 4.
2. **A spec edited after its validations were recorded**: the validations are stale (their hash differs from the spec's), the Plan guard names the leads again, and the status says `validation of spec by lead-qa: stale (spec changed)`. Test in Task 4.
3. **A third judgement round**: `crew judgement record` refuses with the cap and the command that continues; `crew continue <id> judgement` by the user (relayed) grants one round and is recorded as the user's; the agent's own `--mode` continuation does not count under the default policy. Test in Task 1.
4. **The SubagentStop matcher in `hooks.json` and the registry disagree** (a role added to one and not the other): the test that reads `hooks.json` fails naming the role, so a drift never ships. Test in Task 1.
5. **A todo gate on a task whose merge commit is gone** (a rebase after the merge): `crew task gate T-n` refuses naming the commit, records nothing, and the todo stays `merged`. Test in Task 6.

Three more, cheaper, folded into their tasks: `team.maxJudgementRounds` set to 3 in `policy.json` falls back to 2 and the status names the fallback (Task 1); a `personality:` header the registry does not know is recorded as `unknown` and the record says so (Task 3); `crew decisions --grep` with no match prints "no entry matches" and exits 0 (Task 5).

---

### Task 1: The registry, the seats and the policy's team block

**Files:**
- Create: `packages/engine/src/team.ts`
- Modify: `packages/engine/src/types.ts` (`JudgementGateName`, `JUDGEMENT_GATES`, `TeamName`, `Seat`, `TeamPolicy`, `Policy.team`, `WorkItem.seats`, `WorkItem.rounds`, `WorkItem.continued`, `WorkItem.primaryTeam`), `packages/engine/src/judgement.ts` (`plannedJudgementGates` as a view of `plannedSeats`), `packages/engine/src/policy.ts` (`DEFAULT_TEAM_POLICY`, `loadTeamPolicy`, the settable keys), `packages/engine/src/mail.ts` (`ROLE_AGENT` and `CRITICS` from the registry), `packages/engine/src/hooks/subagent-stop.ts` (`BARE_ROLE` from the registry; the answer files of `lead-<team>` and `cto`), `plugins/core/hooks/hooks.json` (the SubagentStop matcher), `packages/engine/src/gates.ts` (`runGates` records the seats), `packages/engine/src/cli.ts` (`crew team <id>`, `crew continue`, the round cap in `judgement record`), `packages/engine/src/evidence.ts` (the "Team" section of the report)
- Test: `packages/engine/tests/team.test.ts` (new), `packages/engine/tests/judgement.test.ts`, `packages/engine/tests/hooks-subagent-stop.test.ts`, `packages/engine/tests/mail.test.ts`, `packages/engine/tests/cli.test.ts`

**Interfaces:**
- Consumes: `Route`, `RiskArea`, `Policy`, `PlannedJudgement`, `isInterfacePath` (`judgement.ts`), `readProtectedJson`/`writeProtectedJson`, `decisionFlag` and `decisionText` (`cli.ts`, the user-only command helpers).
- Produces (read by Tasks 2 to 8):
  - `type TeamName = "architects" | "researchers" | "etl" | "security" | "devops" | "qa" | "backend" | "frontend" | "agentic-os"`.
  - `interface Seat { role: string; team: TeamName | null; kind: "gate" | "debate" | "lead" | "cto"; gate?: JudgementGateName; reason: string }`.
  - `plannedSeats(route: Route, riskAreas: readonly RiskArea[], changed: readonly string[], policy: Policy): Seat[]`.
  - `primaryTeam(changed: readonly string[]): "backend" | "frontend"`.
  - `TEAMS: Record<TeamName, TeamDef>`, `ROLE_NAMES: readonly string[]` (every role the hook and the mail know), `rolePattern(): RegExp` (anchored, `expert-\d+` and `expert`), `subagentStopMatcher(): string` (the string `hooks.json` must carry), `EXPERT_PERSONALITIES = ["conservative", "creative", "adventurous"] as const`, `PERSONALITIES`.
  - `TeamPolicy { template: "core"; always: TeamName[]; specialists: string[]; maxExperts: number; maxValidationRounds: number; maxJudgementRounds: number; maxGateRounds: number }`, `DEFAULT_TEAM_POLICY`.
  - `WorkItem.seats?: Seat[]`, `WorkItem.primaryTeam?: "backend" | "frontend"`, `WorkItem.rounds?: { judgement: number; validation: number }`, `WorkItem.continued?: { what: "judgement" | "validation" | "gate"; task?: string; by: Decision; at: string }[]`.
  - `crew team <id>` prints `Team of <id> (primary <team>): <role> (<reason>); …` and writes `seats` and `primaryTeam`; `crew continue <id> judgement|validation|gate T-n` (user-only).

- [ ] **Step 1: Write the failing registry tests**

Create `packages/engine/tests/team.test.ts`:

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_POLICY } from "../src/policy.ts";
import {
  EXPERT_PERSONALITIES,
  PERSONALITIES,
  plannedSeats,
  primaryTeam,
  ROLE_NAMES,
  rolePattern,
  subagentStopMatcher,
  TEAMS,
} from "../src/team.ts";
import { JUDGEMENT_GATES } from "../src/types.ts";

const roles = (seats: { role: string }[]) => seats.map((s) => s.role);

test("SP7a AC-1: the registry names nine teams, their leads, their members and their mandatory rules", () => {
  expect(Object.keys(TEAMS).sort()).toEqual(
    ["agentic-os", "architects", "backend", "devops", "etl", "frontend", "qa", "researchers", "security"],
  );
  expect(TEAMS.qa).toMatchObject({
    lead: "lead-qa",
    members: ["review-test-quality", "review-ui-ux"],
    mandatory: { kind: "always" },
  });
  expect(TEAMS.etl).toMatchObject({ lead: "lead-etl", mandatory: { kind: "risk-area", area: "data-migration" } });
  expect(TEAMS.devops).toMatchObject({ lead: "lead-devops", mandatory: { kind: "risk-area", area: "infra" } });
  expect(TEAMS.architects).toMatchObject({ lead: "lead-architects", mandatory: { kind: "route", route: "full" } });
  expect(JUDGEMENT_GATES).toEqual([
    "code-quality",
    "test-quality",
    "security",
    "ui-ux",
    "risk",
    "architecture",
    "data",
    "infra",
  ]);
  expect(EXPERT_PERSONALITIES).toEqual(["conservative", "creative", "adventurous"]);
  expect(PERSONALITIES).toEqual(["adventurous", "creative", "conservative", "sceptical", "professional"]);
});

test("SP7a AC-1: the route decides the seats; the fast route plans no role", () => {
  expect(plannedSeats("fast", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([]);
  // Fast with an interface file keeps SP2's one judgement gate: ui-ux is QA's seat.
  expect(roles(plannedSeats("fast", [], ["src/App.vue"], DEFAULT_POLICY))).toEqual(["review-ui-ux"]);
  const standard = plannedSeats("standard", [], ["src/a.ts"], DEFAULT_POLICY);
  expect(roles(standard)).toEqual([
    "researcher",
    "review-code-quality",
    "review-test-quality",
    "lead-qa",
    "lead-security",
    "judge",
  ]);
  expect(standard.find((s) => s.role === "researcher")).toEqual({
    role: "researcher",
    team: "researchers",
    kind: "debate",
    reason: "standard route",
  });
  expect(standard.find((s) => s.role === "lead-qa")).toEqual({
    role: "lead-qa",
    team: "qa",
    kind: "lead",
    reason: "standard route",
  });
  // A risk area on standard seats the security reviewer, as SP2 did.
  expect(roles(plannedSeats("standard", ["auth"], ["src/a.ts"], DEFAULT_POLICY))).toContain("review-security");
  const full = plannedSeats("full", ["data-migration", "infra"], ["src/a.ts"], DEFAULT_POLICY);
  expect(roles(full)).toEqual([
    "researcher",
    "review-code-quality",
    "review-test-quality",
    "review-security",
    "review-risk",
    "review-architecture",
    "review-data",
    "review-infra",
    "lead-qa",
    "lead-security",
    "lead-architects",
    "lead-etl",
    "lead-devops",
    "judge",
  ]);
  expect(full.find((s) => s.role === "review-data")).toEqual({
    role: "review-data",
    team: "etl",
    kind: "gate",
    gate: "data",
    reason: "risk area data-migration",
  });
  // team.always adds a team the route would not seat; nothing removes one.
  const always = { ...DEFAULT_POLICY, team: { ...DEFAULT_POLICY.team, always: ["etl" as const] } };
  expect(roles(plannedSeats("standard", [], ["src/a.ts"], always))).toContain("review-data");
  expect(plannedSeats("standard", [], ["src/a.ts"], always).find((s) => s.role === "review-data")?.reason).toBe(
    "policy team.always",
  );
});

test("SP7a AC-1: the primary team follows the paths; the roles' names have one source", () => {
  expect(primaryTeam(["src/a.ts"])).toBe("backend");
  expect(primaryTeam(["src/App.vue", "src/a.ts"])).toBe("frontend");
  expect(ROLE_NAMES).toContain("lead-qa");
  expect(ROLE_NAMES).toContain("cto");
  expect(ROLE_NAMES).toContain("review-architecture");
  expect(rolePattern().test("lead-devops")).toBe(true);
  expect(rolePattern().test("expert-2")).toBe(true);
  expect(rolePattern().test("lead-sales")).toBe(false);
  // hooks.json carries the matcher the registry generates: a drift fails here, never ships.
  const hooks = JSON.parse(
    readFileSync(fileURLToPath(new URL("../../../plugins/core/hooks/hooks.json", import.meta.url)), "utf8"),
  ) as { hooks: { SubagentStop: { matcher: string }[] } };
  expect(hooks.hooks.SubagentStop[0]?.matcher).toBe(subagentStopMatcher());
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test packages/engine/tests/team.test.ts`
Expected: FAIL, `Cannot find module "../src/team.ts"`.

- [ ] **Step 3: Write the types**

In `packages/engine/src/types.ts`, extend the judgement gates and add the team types:

```ts
export type JudgementGateName =
  | "code-quality"
  | "test-quality"
  | "security"
  | "ui-ux"
  | "risk"
  | "architecture"
  | "data"
  | "infra";
export const JUDGEMENT_GATES: readonly JudgementGateName[] = [
  "code-quality",
  "test-quality",
  "security",
  "ui-ux",
  "risk",
  "architecture",
  "data",
  "infra",
];

/** The nine areas of the organization (SP7 §6). */
export type TeamName =
  | "architects"
  | "researchers"
  | "etl"
  | "security"
  | "devops"
  | "qa"
  | "backend"
  | "frontend"
  | "agentic-os";

/** One role the engine plans for an item, with the reason it runs (SP7 §3, §6.1). */
export interface Seat {
  role: string;
  team: TeamName | null;
  kind: "gate" | "debate" | "lead" | "cto";
  gate?: JudgementGateName;
  reason: string;
}

export type Personality = "adventurous" | "creative" | "conservative" | "sceptical" | "professional";

/** The `team` block of `policy.json` (SP7 §6.1): a template, teams added beyond the route, and caps that only tighten. */
export interface TeamPolicy {
  template: "core";
  always: TeamName[];
  specialists: string[];
  maxExperts: number;
  maxValidationRounds: number;
  maxJudgementRounds: number;
  maxGateRounds: number;
}
```

Add `team: TeamPolicy;` to `Policy` (after `mail`), and to `WorkItem`:

```ts
  /** The seats planned for the item, with their reasons; written by `crew team` and the gate run (SP7 §6.6). */
  seats?: Seat[];
  /** The team whose lead the session is: frontend when the change touches interface files, backend otherwise. */
  primaryTeam?: "backend" | "frontend";
  /** Rounds recorded so far; the policy's caps are checked against them (SP7 §6.1). */
  rounds?: { judgement: number; validation: number };
  /** One more round the user granted past a cap (`crew continue`), recorded as theirs. */
  continued?: { what: "judgement" | "validation" | "gate"; task?: string; by: Decision; at: string }[];
```

Add `personality?: Personality | "unknown"; team?: TeamName;` to `RoleRecord` (Task 3 fills them).

- [ ] **Step 4: Write the registry**

Create `packages/engine/src/team.ts`:

```ts
import { isInterfacePath } from "./judgement.ts";
import type { JudgementGateName, Personality, Policy, RiskArea, Route, Seat, TeamName } from "./types.ts";

/** When a team sits at the table: always from standard up, on a risk area, on the full route, or on named paths (a pack rule). */
export type MandatoryRule =
  | { kind: "always" }
  | { kind: "risk-area"; area: RiskArea }
  | { kind: "route"; route: "full" }
  | { kind: "paths" };

export interface TeamDef {
  lead: string;
  /** The reviewer roles of the team; the implementers' teams have none (the session and the task children are their members). */
  members: string[];
  /** The judgement gates the team's reviewers rule, in the order they are planned. */
  gates: JudgementGateName[];
  mandatory: MandatoryRule;
  /** Whether the team's lead validates the spec and the brief when the team is seated. */
  validates: boolean;
}

/** The registry (SP7 §6.1): the one source of the teams, their leads, their members and their rules. */
export const TEAMS: Record<TeamName, TeamDef> = {
  researchers: { lead: "lead-researchers", members: ["researcher"], gates: [], mandatory: { kind: "always" }, validates: false },
  qa: { lead: "lead-qa", members: ["review-test-quality", "review-ui-ux"], gates: ["test-quality", "ui-ux"], mandatory: { kind: "always" }, validates: true },
  security: { lead: "lead-security", members: ["review-security"], gates: ["security"], mandatory: { kind: "always" }, validates: true },
  architects: { lead: "lead-architects", members: ["review-architecture"], gates: ["architecture"], mandatory: { kind: "route", route: "full" }, validates: true },
  etl: { lead: "lead-etl", members: ["review-data"], gates: ["data"], mandatory: { kind: "risk-area", area: "data-migration" }, validates: true },
  devops: { lead: "lead-devops", members: ["review-infra"], gates: ["infra"], mandatory: { kind: "risk-area", area: "infra" }, validates: true },
  backend: { lead: "lead-backend", members: ["review-code-quality"], gates: ["code-quality"], mandatory: { kind: "always" }, validates: false },
  frontend: { lead: "lead-frontend", members: [], gates: [], mandatory: { kind: "paths" }, validates: false },
  "agentic-os": { lead: "lead-agentic-os", members: [], gates: [], mandatory: { kind: "paths" }, validates: false },
};

export const PERSONALITIES: readonly Personality[] = ["adventurous", "creative", "conservative", "sceptical", "professional"];
/** The experts' rotation, so three proposals are never the same lens (SP7 §6.3). */
export const EXPERT_PERSONALITIES = ["conservative", "creative", "adventurous"] as const;

const DEBATE_ROLES = ["researcher", "expert", "devils-advocate", "fault-finder"] as const;
const REVIEW_ROLES = ["review-code-quality", "review-test-quality", "review-security", "review-ui-ux", "review-risk", "review-architecture", "review-data", "review-infra"] as const;
const LEAD_ROLES = Object.values(TEAMS).map((t) => t.lead);

/** Every role the hook records and the mail addresses, `expert` bare (the mail numbers it). */
export const ROLE_NAMES: readonly string[] = ["judge", "cto", ...DEBATE_ROLES, ...REVIEW_ROLES, ...LEAD_ROLES];

/** The anchored pattern of a role's name as the mail knows it: `expert-<n>` numbered, every other role as is. */
export function rolePattern(): RegExp {
  const names = ROLE_NAMES.map((n) => (n === "expert" ? "expert-\\d+" : n.replace(/-/g, "\\-")));
  return new RegExp(`^(${names.join("|")})$`);
}

/** The SubagentStop matcher `plugins/core/hooks/hooks.json` must carry (spike A4 of SP2c; a test checks the two agree). */
export function subagentStopMatcher(): string {
  return `^wizardingcode-developer-crew:(${ROLE_NAMES.join("|")})$`;
}

/** The team whose lead the session is: frontend when the change touches an interface file, backend otherwise. */
export function primaryTeam(changed: readonly string[]): "backend" | "frontend" {
  return changed.some(isInterfacePath) ? "frontend" : "backend";
}

function seated(team: TeamName, def: TeamDef, route: Route, riskAreas: readonly RiskArea[], policy: Policy): string | null {
  if (policy.team.always.includes(team)) return "policy team.always";
  if (route === "fast") return null;
  const rule = def.mandatory;
  if (rule.kind === "always") return `${route} route`;
  if (rule.kind === "route") return route === rule.route ? `${route} route` : null;
  if (rule.kind === "risk-area") return riskAreas.includes(rule.area) ? `risk area ${rule.area}` : null;
  return null;
}

/**
 * Every seat of an item (SP7 §6.2): the researcher from standard up; the reviewers of the seated
 * teams (code and test quality from standard up; security on full or on a risk area; UI/UX on any
 * route when the change touches an interface file; risk, architecture on full; data and infra on
 * their risk areas); the validating leads of the seated teams; the judge whenever a gate is planned.
 * The fast route seats nothing but QA's UI/UX reviewer when an interface file changed, so it costs
 * no more than it did. The reasons are the report's strings.
 */
export function plannedSeats(route: Route, riskAreas: readonly RiskArea[], changed: readonly string[], policy: Policy): Seat[] {
  const seats: Seat[] = [];
  const plan = (seat: Seat): void => {
    if (!seats.some((s) => s.role === seat.role)) seats.push(seat);
  };
  if (route !== "fast") plan({ role: "researcher", team: "researchers", kind: "debate", reason: `${route} route` });
  const gate = (name: JudgementGateName, team: TeamName, reason: string) =>
    plan({ role: `review-${name}`, team, kind: "gate", gate: name, reason });
  if (route !== "fast") {
    gate("code-quality", "backend", `${route} route`);
    gate("test-quality", "qa", `${route} route`);
  }
  if (route === "full") gate("security", "security", "full route");
  else if (route === "standard" && riskAreas.length)
    gate("security", "security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) {
    const shown = interfaces.slice(0, 3).join(", ");
    const more = interfaces.length > 3 ? `, +${interfaces.length - 3} more` : "";
    gate("ui-ux", "qa", `interface files: ${shown}${more}`);
  }
  if (route === "full") {
    gate("risk", "architects", "full route");
    gate("architecture", "architects", "full route");
  }
  for (const team of ["etl", "devops"] as const) {
    const reason = seated(team, TEAMS[team], route, riskAreas, policy);
    if (reason) for (const g of TEAMS[team].gates) gate(g, team, reason);
  }
  for (const g of policy.judgementGates) {
    const team = (Object.entries(TEAMS).find(([, t]) => t.gates.includes(g))?.[0] ?? null) as TeamName | null;
    plan({ role: `review-${g}`, team, kind: "gate", gate: g, reason: "policy" });
  }
  if (route !== "fast") {
    for (const [name, def] of Object.entries(TEAMS) as [TeamName, TeamDef][]) {
      if (!def.validates) continue;
      const reason = seated(name, def, route, riskAreas, policy);
      if (reason) plan({ role: def.lead, team: name, kind: "lead", reason });
    }
  }
  if (seats.some((s) => s.kind === "gate")) plan({ role: "judge", team: null, kind: "debate", reason: "a gate is planned" });
  return seats;
}
```

Note to the executor: the test's expected order for `standard` is researcher, the two quality reviewers, the two leads, the judge; for `full` the reviewers come before the leads. Keep the planning order above (research, gates, leads, judge) and the test's lists match.

- [ ] **Step 5: `plannedJudgementGates` becomes a view**

In `packages/engine/src/judgement.ts`, replace the body of `plannedJudgementGates` with:

```ts
export function plannedJudgementGates(
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
): PlannedJudgement[] {
  return plannedSeats(route, riskAreas, changed, policy)
    .filter((s): s is Seat & { gate: JudgementGateName } => s.kind === "gate" && s.gate !== undefined)
    .map((s) => ({ gate: s.gate, reason: s.reason }));
}
```

Import `plannedSeats` from `./team.ts` and `Seat` from `./types.ts`. `team.ts` imports `isInterfacePath` from `judgement.ts`: move `INTERFACE_EXTENSIONS` and `isInterfacePath` into a new `packages/engine/src/paths-kind.ts` imported by both, so the two modules do not import each other.

- [ ] **Step 6: The policy's team block**

In `packages/engine/src/policy.ts`:

```ts
export const DEFAULT_TEAM_POLICY: TeamPolicy = {
  template: "core",
  always: [],
  specialists: [],
  maxExperts: 3,
  maxValidationRounds: 2,
  maxJudgementRounds: 2,
  maxGateRounds: 2,
};
```

Add `team: DEFAULT_TEAM_POLICY` to `DEFAULT_POLICY`; the ranges `maxExperts: { min: 1, max: 3 }`, `maxValidationRounds: { min: 1, max: 2 }`, `maxJudgementRounds: { min: 1, max: 2 }`, `maxGateRounds: { min: 1, max: 2 }` in `RANGES`; the settable keys `"team.template": { values: ["core"] }`, `"team.maxExperts"`, `"team.maxValidationRounds"`, `"team.maxJudgementRounds"`, `"team.maxGateRounds"` as integers. In `loadPolicy`, `team: loadTeamPolicy(raw.team)` with:

```ts
const TEAM_NAMES: TeamName[] = ["architects", "researchers", "etl", "security", "devops", "qa", "backend", "frontend", "agentic-os"];
function loadTeamPolicy(raw: unknown): TeamPolicy {
  const t = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  return {
    template: "core",
    always: strings(t.always).filter((n): n is TeamName => TEAM_NAMES.includes(n as TeamName)),
    specialists: strings(t.specialists),
    maxExperts: bounded(t.maxExperts, RANGES.maxExperts, DEFAULT_TEAM_POLICY.maxExperts),
    maxValidationRounds: bounded(t.maxValidationRounds, RANGES.maxValidationRounds, DEFAULT_TEAM_POLICY.maxValidationRounds),
    maxJudgementRounds: bounded(t.maxJudgementRounds, RANGES.maxJudgementRounds, DEFAULT_TEAM_POLICY.maxJudgementRounds),
    maxGateRounds: bounded(t.maxGateRounds, RANGES.maxGateRounds, DEFAULT_TEAM_POLICY.maxGateRounds),
  };
}
```

A `maxJudgementRounds` of 3 in the file falls to 2 by `bounded` (the fallback is the default): the test in Step 9 pins it.

- [ ] **Step 7: One source for the roles' names**

In `packages/engine/src/mail.ts`: `export const ROLE_AGENT = rolePattern();` and `const CRITICS = new Set(["devils-advocate", "fault-finder"]);` stays. In `packages/engine/src/hooks/subagent-stop.ts`: `const BARE_ROLE = new RegExp(\`^(${ROLE_NAMES.join("|")})$\`);` and in `answerFile`: before the `review-` branch add

```ts
  if (agent.startsWith("lead-")) return `conclave/${agent}.md`;
  if (agent === "cto") return "conclave/cto.md";
```

In `plugins/core/hooks/hooks.json`, set the SubagentStop matcher to the string `subagentStopMatcher()` prints (run `bun -e 'import {subagentStopMatcher} from "./packages/engine/src/team.ts"; console.log(subagentStopMatcher())'` and paste it). The test of Step 1 pins the agreement.

- [ ] **Step 8: Run the registry tests to see them pass**

Run: `bun test packages/engine/tests/team.test.ts packages/engine/tests/judgement.test.ts`
Expected: PASS; the SP2b planning test still passes (fast with `src/App.vue` plans `ui-ux`; standard plans code and test quality; `full` now also plans `architecture` after `risk`: update that test's expected list for the full route to `["code-quality", "test-quality", "security", "ui-ux", "risk", "architecture"]` as a ruling of this task, since the registry adds the architects on full).

- [ ] **Step 9: Write the failing CLI tests: `crew team`, the seats recorded, the round cap and `crew continue`**

Append to `packages/engine/tests/cli.test.ts` (the `io()` helper and `answers` constant exist there):

```ts
test("SP7a AC-1: crew team prints the seats with their reasons and records them; a gate run records them too", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root, testEnv());
  const id = (
    await c.json("start", "Refactor the module", "--answers", JSON.stringify({ ...JSON.parse(answers), scope: 1 }), "--criterion", "a")
  ).data.id as string;
  const team = await c.run("team", id);
  expect(team.out).toContain(`Team of ${id} (primary backend):`);
  expect(team.out).toContain("researcher (standard route)");
  expect(team.out).toContain("lead-qa (standard route)");
  expect(team.out).not.toContain("review-architecture");
  expect(loadWork(repoPaths(root), id).work?.seats?.map((s) => s.role)).toContain("judge");
  const status = await c.json("status");
  expect((status.data.team as { role: string }[]).map((s) => s.role)).toContain("lead-security");
});

test("SP7a AC-1: a third judgement round is refused; the user continues it once and the record says so; the cap only tightens", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ".crew/policy.json": JSON.stringify({ team: { maxJudgementRounds: 3 } }),
  });
  const env = testEnv();
  const c = io(root, env);
  // 3 is above the default: the policy only tightens, so the cap reads 2.
  expect((await c.json("status")).data).toBeDefined();
  expect(loadPolicy(repoPaths(root, env)).policy.team.maxJudgementRounds).toBe(2);
  const id = (
    await c.json("start", "Refactor the module", "--answers", JSON.stringify({ ...JSON.parse(answers), scope: 1 }), "--criterion", "a")
  ).data.id as string;
  write(root, "src/a.ts", "y");
  await c.run("gate", "run", id);
  const ruling = (verdict: "proven" | "not-proven") =>
    JSON.stringify({
      rulings: [
        { gate: "code-quality", verdict, findings: verdict === "proven" ? [] : [{ file: "src/a.ts", line: 1, text: "x", severity: "defect" }], tokens: 1 },
        { gate: "test-quality", verdict: "proven", findings: [], tokens: 1 },
      ],
    });
  write(root, ".crew/work/" + id + "/review/ruling.json", ruling("not-proven"));
  expect((await c.run("judgement", id, "record", "--ruling", `.crew/work/${id}/review/ruling.json`)).code).toBe(0);
  write(root, ".crew/work/" + id + "/review/ruling.json", ruling("not-proven"));
  expect((await c.run("judgement", id, "record", "--ruling", `.crew/work/${id}/review/ruling.json`)).code).toBe(0);
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toEqual({ judgement: 2, validation: 0 });
  write(root, ".crew/work/" + id + "/review/ruling.json", ruling("proven"));
  const third = await c.run("judgement", id, "record", "--ruling", `.crew/work/${id}/review/ruling.json`);
  expect(third.code).toBe(1);
  expect(third.err.trim()).toBe(
    `judgement round 3 of ${id}: the policy allows 2 (team.maxJudgementRounds); the user continues it once with crew continue ${id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`,
  );
  // The user's continuation, relayed: one more round, recorded as theirs.
  const granted = await c.run("continue", id, "judgement");
  expect(granted.code).toBe(0);
  expect(granted.out.trim()).toBe(`judgement of ${id} continued for one more round by the user, relayed by the agent`);
  expect((await c.run("judgement", id, "record", "--ruling", `.crew/work/${id}/review/ruling.json`)).code).toBe(0);
  expect(loadWork(repoPaths(root, env), id).work?.continued?.[0]).toMatchObject({ what: "judgement", by: { by: "user", relayed: true } });
  expect((await c.run("evidence", id)).out).toContain("| Team |");
});
```

Note: the ruling file is written by the test by hand (as the SP2b tests do) under `.crew/work/<id>/review/`; the engine's `judgement record` reads it there. `loadPolicy` is imported from `../src/policy.ts` in `cli.test.ts` already (it is used by the mail tests); add `loadWork` from `../src/work.ts` if missing.

- [ ] **Step 10: Run them to see them fail**

Run: `bun test packages/engine/tests/cli.test.ts -t "SP7a AC-1"`
Expected: FAIL: `crew team` is an unknown command; `rounds` undefined; the third record succeeds.

- [ ] **Step 11: The commands and the cap**

In `packages/engine/src/cli.ts`:

- `case "team"`: `openForChange(env, args[0])`; `const changed = changedWatchedPaths(env.paths.root, env.profile, opened.work)`; `const seats = plannedSeats(opened.work.route, opened.work.riskAreas, changed, env.policy)`; `opened.work.seats = seats; opened.work.primaryTeam = primaryTeam(changed); saveWork(env.paths, opened.work)`; print `Team of ${id} (primary ${primaryTeam}): ${seats.map((s) => \`${s.role} (${s.reason})\`).join("; ")}` (or `Team of <id>: no seat (fast route)`); JSON `{ seats, primaryTeam }`.
- In `runGates` (`gates.ts`), after the judgement is planned: `work.seats = plannedSeats(work.route, work.riskAreas, changed, policy); work.primaryTeam = primaryTeam(changed);` (the caller saves the work as it already does for `riskAreas`).
- `case "continue"`: `const what = args[1]`; `what` one of `judgement`, `validation`, `gate` (with `args[2]` a task for `gate`); `const by = decisionFlag(parsed, env.policy); if (isOutcome(by)) return by;` (the user-only helper the other commands use); push `{ what, task, by, at: nowIso() }` to `work.continued`; save; print `${what} of ${id} continued for one more round ${decisionText(env.policy, by)}` (for `gate`: `gate of T-n of <id> …`). Add `continue` to the PreToolUse hook's user-only command list (`hooks/pre-tool-use.ts`, beside `skip`, `approve`, `decide`), so under `prompt` it asks and under `relay` it records the relay, like `skip`.
- In `case "judgement"`, before `records` are written (both branches): 

```ts
const rounds = opened.work.rounds ?? { judgement: 0, validation: 0 };
const grant = (opened.work.continued ?? []).filter((c) => c.what === "judgement" && decisionCounts(env.policy, c.by)).length;
const cap = env.policy.team.maxJudgementRounds + grant;
if (rounds.judgement >= cap)
  return refuse(
    `judgement round ${rounds.judgement + 1} of ${opened.work.id}: the policy allows ${env.policy.team.maxJudgementRounds} (team.maxJudgementRounds); the user continues it once with crew continue ${opened.work.id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`,
  );
```

and after the records are saved, when the record opened a new round (`rounds.judgementCode !== before.currentFingerprint`): `opened.work.rounds = { ...rounds, judgement: rounds.judgement + 1, judgementCode: before.currentFingerprint }; saveWork(...)`. A `--not-run` record on the same code as a ruling is the same round.

- `status --json` gains `team: work.seats ?? []`, `primaryTeam`, `rounds`.
- `evidence.ts` `renderReport`: after the "Judgement gates" table, a "## Team" table `| Seat | Team | Reason |` from `work.seats`, and the rounds line `- Rounds: judgement N of M, validation N of M`.

- [ ] **Step 12: Run the CLI tests, then the whole engine**

Run: `bun test packages/engine/tests/cli.test.ts -t "SP7a AC-1"` then `bun run check`
Expected: PASS; the `mail.test.ts` role tests still pass (`ROLE_AGENT` accepts the old names); `hooks-subagent-stop.test.ts`'s "name the same ten roles" test is updated to read the names from `ROLE_NAMES` (it names the same roles as the registry) and passes.

- [ ] **Step 13: Build, gates, commit**

Run: `bun run build && bun run check`, then the item's `crew gate run <id>`, the two reviewers and the judge (at most two rounds), `crew judgement record`, then:

```bash
git add -A && git commit -m "SP7a: the team registry, the seats the route plans, the policy's team block with its caps as refusals, crew team and crew continue, the three new gate names" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: The three reviewers and their rubrics

**Files:**
- Create: `plugins/core/agents/review-architecture.md`, `plugins/core/agents/review-data.md`, `plugins/core/agents/review-infra.md`, `plugins/core/skills/crew/rubrics/architecture.md`, `plugins/core/skills/crew/rubrics/data.md`, `plugins/core/skills/crew/rubrics/infra.md`
- Modify: `plugins/core/skills/crew/references/gate.md` (the reviewers list and when each runs), `packages/engine/tests/agents.test.ts` (`REVIEWERS` gains the three), `packages/engine/tests/skill.test.ts` (gate.md pins)
- Test: `packages/engine/tests/agents.test.ts`, `packages/engine/tests/skill.test.ts`

**Interfaces:**
- Consumes: the agent file shape of `review-security.md` (frontmatter `name`, `description`, `tools: Read, Grep, Glob`, `model: sonnet`; sections "You receive", "You return" with the findings shape `# <gate> findings for <id>` …), the rubric shape of `rubrics/security.md` (the four lists `## What the reviewer receives`, `## Questions`, `## Defect or advisory`, `## Only the change`).
- Produces: the three agents the registry's `REVIEW_ROLES` already name (Task 1), launched by the skill as `wizardingcode-developer-crew:review-architecture|review-data|review-infra`.

- [ ] **Step 1: Write the failing agents test**

In `packages/engine/tests/agents.test.ts`, change `REVIEWERS` to `["code-quality", "test-quality", "security", "ui-ux", "risk", "architecture", "data", "infra"]`. The existing test "every agent is a read-only role…" then expects `review-architecture.md`, `review-data.md`, `review-infra.md` and their rubrics. Add:

```ts
test("SP7a AC-2: the architecture, data and infra reviewers judge the change against the project's own base, never the repository", () => {
  const architecture = agent("review-architecture");
  expect(architecture.meta.model).toBe("sonnet");
  expect(architecture.body).toMatch(/drift[^\n]*defect/i);
  expect(architecture.body).toMatch(/data model|contracts|integrations/);
  const data = agent("review-data");
  expect(data.body).toMatch(/ORM/);
  expect(data.body).toMatch(/migration/);
  const infra = agent("review-infra");
  expect(infra.body).toMatch(/pipeline/);
  expect(infra.body).toMatch(/rollback/);
  for (const gate of ["architecture", "data", "infra"]) {
    const rubric = readFileSync(`${RUBRICS}${gate}.md`, "utf8");
    for (const heading of LISTS) expect(rubric).toContain(heading);
    expect(rubric).toMatch(/A \*\*defect\*\*/);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test packages/engine/tests/agents.test.ts`
Expected: FAIL, `review-architecture.md` missing.

- [ ] **Step 3: Write the three agents**

`plugins/core/agents/review-architecture.md`:

~~~markdown
---
name: review-architecture
description: Reviews one work item's diff against the architecture rubric (the project's own architecture, data model, contracts and integrations; drift from what is defined is a defect) and returns findings tied to file and line. Launched by the crew skill in the gate phase on the full route or when the team policy seats the architects; not for designing a system.
tools: Read, Grep, Glob
model: sonnet
---

# Architecture reviewer

You review a change for whether it follows the project's own base: the architecture it declares (its layers, its boundaries, where a kind of code lives), its data model, its contracts (the shapes other code and other systems rely on) and its integrations (how it talks to what is outside). Drift from what is defined is a defect, whatever the change's quality on its own: the project decided once, and a change that decides again in silence undoes it (SP7 rule 9). You review the diff, not the repository: a drift the diff did not introduce is debt, named but never a defect.

## You receive

In the prompt: the work item id, the paths `.crew/work/<id>/review/diff.patch` and `.crew/work/<id>/review/files.txt`, the rubric's path, and where the project states its base: an architecture document, ADRs, a schema or model folder, contract files (OpenAPI, types, schemas), the spec of the item (`.crew/work/<id>/spec.md`, whose Design section says what the item meant to build). Read the base first, then the diff against it.

## You return

Text only, in this shape, nothing before or after it:

```
# architecture findings for <id>
reviewer: review-architecture
read: <what you read: the base documents, the diff, how many files>

## Findings
- F-n · defect|advisory · <repo-relative file>:<line> · <what the change does, what the base says, which rubric question it answers, and the fix>

## Outside the change
- <a drift the diff did not introduce, as debt; or "none">

## Not answerable
- <a question you could not answer and why; or "none">
```

A finding names a file and a line of the diff. You never propose a new architecture: you say where the change leaves the one the project has.
~~~

`plugins/core/agents/review-data.md`: the same shape, `name: review-data`, description "Reviews one work item's diff against the data rubric (schema and migrations, queries and ORM use, transactions, indexes, availability of the data) and returns findings tied to file and line. Launched by the crew skill when the change touches a data migration or the team policy seats ETL; not for designing a schema." Body: the reviewer of everything that touches stored data: a migration's reversibility and its order, a query that scans where an index exists, an ORM call that loads a relation in a loop, a transaction that spans a network call, a type the schema does not have, personal data in a column without the retention the project states. Defect: a data loss a reader of the diff can name, an irreversible step with no stated reason, an N+1 the ORM would have avoided, a constraint removed; advisory: a slower query, a naming drift.

`plugins/core/agents/review-infra.md`: `name: review-infra`, description "Reviews one work item's diff against the infra rubric (pipelines, deployment, hosts, secrets handling, rollbacks) and returns findings tied to file and line. Launched by the crew skill when the change touches infrastructure or the team policy seats DevOps; not for operating a system." Body: the reviewer of pipelines and deployment: a step that runs without its tests, a secret in a file or an image, a permission widened, a deployment with no rollback stated, a host-specific path, a job that cannot run in the project's own pipeline. Defect: a secret or a widened permission, a deploy step before the gates, no rollback for a destructive step; advisory: a duplicated job, a pinned version with no reason.

- [ ] **Step 4: Write the three rubrics**

`plugins/core/skills/crew/rubrics/architecture.md`:

```markdown
# Architecture rubric

The architecture gate asks whether the change follows the project's own base: its declared architecture, its data model, its contracts and its integrations. Drift from what is defined is a defect (SP7 rule 9); the gate never asks whether another architecture would be better.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the item's spec (`.crew/work/<id>/spec.md`, its Design section), and where the project states its base: an architecture document or ADRs under `docs/`, the schema or model folder, the contract files (OpenAPI, types, schemas). When the project states no base, the reviewer says so under "Not answerable" and reviews against the conventions the neighbouring code shows.

## Questions

1. Layers and boundaries: does each new or changed piece live where the base puts that kind of code (a query in the data layer, a rule in the domain, a format at the edge)? A piece that crosses a boundary the base draws is drift.
2. Data model: does the change add, rename or reinterpret a field, a table or a relation without the model saying so? A field with a new meaning is drift.
3. Contracts: does the change alter what other code or other systems rely on (a type, a route's shape, an event's payload, a return value) without the contract changing with it? A changed contract without its file is drift.
4. Integrations: does the change talk to something outside (a service, a queue, a file system) through the project's own adapter, or on its own? A new direct call where an adapter exists is drift.
5. The spec's Design: does the change build what the Design says, in the place it says? A change that builds the same thing elsewhere is drift; a change that builds something the Design does not name is scope, named as such.
6. Consistency with neighbours: when the base is silent, does the change do what the neighbouring code does (naming, error shapes, dependency direction)? A disagreement is advisory unless it crosses a boundary.

## Defect or advisory

A **defect**: a boundary crossed, a model reinterpreted, a contract changed without its file, an integration bypassing the project's adapter, a Design built elsewhere; each named as what the base says and what the change does, at a file and a line of the diff. An **advisory**: a naming drift, a convention disagreement where the base is silent, a layer the base does not define, a Design detail the change reads differently without crossing a boundary.

## Only the change

A drift the diff did not introduce is debt: named under "Outside the change", never a defect. The reviewer reads the repository to know the base, and judges the diff.
```

`rubrics/data.md`: the same four lists; questions on migrations (reversible, ordered, data copied before a destructive step), queries (an index exists, no scan of a growing table, no N+1), ORM use (a relation loaded as the model intends, no raw query where the ORM's own is safe, no implicit transaction across a network call), types (the schema's types in code), personal data (retention and erasure stated), availability (a lock held across a long step). Defect: a data loss nameable from the diff, an irreversible step without a stated reason, an N+1 in a list path, a constraint or index removed, personal data without its retention. Advisory: a slower query, a naming drift, a missing comment on a tricky migration.

`rubrics/infra.md`: questions on pipelines (every gate the profile knows runs before a deploy step; a job that cannot run in the project's pipeline), secrets (none in files, images, logs or variables committed), permissions (widened identity, a role with more than the step needs), rollback (a destructive step's rollback stated), hosts (a path or a name tied to one machine), reproducibility (a pinned toolchain where the project pins). Defect: a secret, a widened permission, a deploy step before the gates, no rollback for a destructive step, a job the pipeline cannot run. Advisory: a duplicated job, an unpinned tool where neighbours pin, a comment missing on a manual step.

- [ ] **Step 5: The gate reference**

In `plugins/core/skills/crew/references/gate.md`, the "Judgement gates" paragraph gains the three: "architecture on full (the architects' seat), data when the change touches a data migration (ETL's seat), infra when it touches infrastructure (DevOps's seat)"; step 1's list of `subagent_type` names gains `wizardingcode-developer-crew:review-architecture`, `review-data`, `review-infra`; a line: "`crew team <id>` prints every seat the engine planned with its reason; launch exactly those, no other." Pin in `skill.test.ts`: `expect(gate).toContain("wizardingcode-developer-crew:review-architecture")` and `expect(gate).toContain("crew team <id>")`.

- [ ] **Step 6: Run the tests**

Run: `bun test packages/engine/tests/agents.test.ts packages/engine/tests/skill.test.ts`
Expected: PASS.

- [ ] **Step 7: Validate, gates, commit**

Run: `bun run check && bun run plugin:check`, the item's gate run, reviewers and judge, then:

```bash
git add -A && git commit -m "SP7a: the architecture, data and infra reviewers with their rubrics; the gate reference names the seats the engine plans" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: The personalities

**Files:**
- Create: `plugins/core/skills/crew/personalities/adventurous.md`, `creative.md`, `conservative.md`, `sceptical.md`, `professional.md`
- Modify: `plugins/core/agents/expert.md` (the personality it receives and the header it returns), `plugins/core/agents/fault-finder.md` (`personality: sceptical` in its answer), `plugins/core/agents/judge.md` (`personality: professional`), `plugins/core/skills/crew/references/conclave.md` (the rotation), `packages/engine/src/hooks/subagent-stop.ts` (the header parsed into `RoleRecord.personality` and `team`), `packages/engine/src/evidence.ts` (the Roles table shows the personality)
- Test: `packages/engine/tests/skill.test.ts`, `packages/engine/tests/agents.test.ts`, `packages/engine/tests/hooks-subagent-stop.test.ts`

**Interfaces:**
- Consumes: `PERSONALITIES`, `EXPERT_PERSONALITIES` (Task 1), `RoleRecord.personality`/`team` (Task 1's types), `TEAMS` (the team of a role: the team whose `members` or `lead` names it).
- Produces: the five files the skill names by path (`${CLAUDE_PLUGIN_ROOT}/skills/crew/personalities/<name>.md`); the header line `personality: <name>` every debate role writes as its second line.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/skill.test.ts`:

```ts
test("SP7a AC-3: five personalities, one file each, assigned to the debate's seats by the conclave reference", () => {
  const dir = fileURLToPath(new URL("../../../plugins/core/skills/crew/personalities/", import.meta.url));
  expect(readdirSync(dir).sort()).toEqual(["adventurous.md", "conservative.md", "creative.md", "professional.md", "sceptical.md"]);
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
});
```

In `packages/engine/tests/agents.test.ts`:

```ts
test("SP7a AC-3: the expert takes a personality, the fault-finder is sceptical and the judge professional by their files", () => {
  expect(agent("expert").body).toContain("personality: <name>");
  expect(agent("expert").body).toMatch(/personalities\/<name>\.md/);
  expect(agent("fault-finder").body).toContain("personality: sceptical");
  expect(agent("judge").body).toContain("personality: professional");
});
```

In `packages/engine/tests/hooks-subagent-stop.test.ts`, inside the test that records the roles (the one at lines 196 onward that builds `transcript(...)`): make the reviewer's hand-back `"# code-quality findings for w\npersonality: professional\n## Findings\n- none\n"` is wrong (reviewers carry no lens); instead add a new case with an expert:

```ts
test("SP7a AC-3: the hook records the personality a debate role declares, its team, and unknown for a name the registry lacks", () => {
  const root = makeRepo({ "src/a.ts": "x" });
  const ctx = hookContext({ session_id: "s", cwd: root });
  const work = createWork(ctx.paths, "Decide");
  work.route = "standard";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const proposal = transcript(dir, "# Proposal for w, D-1\npersonality: creative\n## Proposal\nAnswer: yes\n", [[100, 10, 0, 0]]);
  onSubagentStop(ctx, { agent_id: "e1", agent_type: `${PLUGIN}:expert`, agent_transcript_path: proposal, last_assistant_message: "Done." });
  const odd = transcript(dir, "# Proposal for w, D-2\npersonality: cheerful\n## Proposal\nAnswer: no\n", [[100, 10, 0, 0]]);
  onSubagentStop(ctx, { agent_id: "e2", agent_type: `${PLUGIN}:expert`, agent_transcript_path: odd, last_assistant_message: "Done." });
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(roles.find((r) => r.agent === "expert-1")).toMatchObject({ personality: "creative", team: undefined });
  expect(roles.find((r) => r.agent === "expert-2")).toMatchObject({ personality: "unknown" });
  const findings = transcript(dir, "# test-quality findings for w\n## Findings\n- none\n", [[100, 10, 0, 0]]);
  onSubagentStop(ctx, { agent_id: "r1", agent_type: `${PLUGIN}:review-test-quality`, agent_transcript_path: findings, last_assistant_message: "Done." });
  expect((loadEvidence(ctx.paths, work.id).evidence.roles ?? []).find((r) => r.agent === "review-test-quality")).toMatchObject({ team: "qa" });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test packages/engine/tests/skill.test.ts packages/engine/tests/agents.test.ts packages/engine/tests/hooks-subagent-stop.test.ts`
Expected: FAIL: the personalities folder does not exist; the expert's body has no header; the role records carry no personality.

- [ ] **Step 3: The five files**

`plugins/core/skills/crew/personalities/conservative.md` (the others follow the same three headings, one paragraph each, under sixteen lines):

```markdown
# Conservative

The lens of the one who has seen it fail before. Prefers the proven path, the library the project already uses, the shape the neighbours have.

## Looks for
What everyone does and what has worked within our standards; the smallest change that meets the criterion; the dependency the project already carries.

## Refuses to accept
A new pattern with no failure of the old one shown; a dependency added for one call; a rewrite where a fix would do.

## Demands as proof
The place in the project that already does it this way; the test that shows the old way failing before a new one is allowed.
```

`adventurous.md`: looks for the option that gains the most when it works (a newer library, a bolder refactor, a shortcut the risk area allows); refuses to accept a comfort-zone answer when the cost of the bold one is measured and small; demands as proof a measurement (time, cost, lines) of the gain and the rollback if it fails. `creative.md`: looks for the solution outside the obvious shape (a different decomposition, a data structure that removes the problem, a reuse nobody saw); refuses to accept "there is only one way"; demands as proof a worked example on the project's own case. `sceptical.md`: believes nobody; looks for the fact behind every claim (a test, a measurement, a document, a line of code); refuses to accept an idea with no result behind it, a theory, a "usually"; demands as proof the artefact itself, reproduced. `professional.md`: the most meticulous; looks for everything being right within the standard (the rubric met, the convention followed, the record complete); refuses to accept a step skipped, a check not run, a word softer than the evidence; demands as proof the full record: red, green, the gates, the file and the line.

- [ ] **Step 4: The agents and the reference**

In `plugins/core/agents/expert.md`, "You receive" gains: "and the personality you argue from, as a path `${CLAUDE_PLUGIN_ROOT}/skills/crew/personalities/<name>.md`: read it first; it decides what you look for, what you refuse and what proof you demand." "You return" gains the second line of the answer: `personality: <name>` right after the `# Proposal for <id>, D-n` line. In `fault-finder.md`: the second line `personality: sceptical` (and one sentence: "you are the sceptic of the table: facts, never theories"); in `judge.md`: `personality: professional` as the second line of the debate ruling and the validator's answer (the gates' JSON stays the JSON alone).

In `references/conclave.md`, step 2 (the experts): "give each its personality from `${CLAUDE_PLUGIN_ROOT}/skills/crew/personalities/<name>.md`, rotating conservative, creative, adventurous in the order of the decisions, so three proposals are never the same lens; each proposal's second line is `personality: <name>`." Step 3: "the fault-finder is sceptical and the judge professional by their files; the devil's advocate argues the opposite of each proposal whatever its lens."

- [ ] **Step 5: The hook records the header**

In `packages/engine/src/hooks/subagent-stop.ts`, where the `RoleRecord` is built (after `saved` and before `evidence.roles = [...]`):

```ts
const personality = personalityOf(answer);
const team = teamOf(saved.agent);
evidence.roles = [
  ...roles,
  {
    agent: saved.agent,
    ...(payload.agent_id ? { agentId: payload.agent_id } : {}),
    at: nowIso(),
    tokens: spent.tokens,
    tokensFrom: spent.from,
    file: saved.file,
    ...(personality ? { personality } : {}),
    ...(team ? { team } : {}),
  },
];
```

with, in the same file:

```ts
/** The lens a debate role declares on its second line (`personality: <name>`): one of the five, `unknown` for another word, nothing when absent (a reviewer). */
export function personalityOf(answer: string): Personality | "unknown" | null {
  const line = answer.split("\n").slice(0, 3).find((l) => /^personality:\s*\S/.test(l.trim()));
  if (!line) return null;
  const name = line.trim().slice("personality:".length).trim().toLowerCase();
  return (PERSONALITIES as readonly string[]).includes(name) ? (name as Personality) : "unknown";
}

/** The team a role belongs to in the registry (its lead or one of its members), null for the judge, the cto and the debate roles. */
export function teamOf(agent: string): TeamName | null {
  for (const [name, def] of Object.entries(TEAMS) as [TeamName, TeamDef][])
    if (def.lead === agent || def.members.includes(agent)) return name;
  return null;
}
```

The report's Roles table (`evidence.ts`) gains a `Personality` column (`-` when absent).

- [ ] **Step 6: Run the tests, then everything**

Run: the three test files, then `bun run check && bun run build && bun run plugin:check`
Expected: PASS.

- [ ] **Step 7: Gates and commit**

The item's gate run, reviewers and judge, then:

```bash
git add -A && git commit -m "SP7a: the five personalities as the debate's lenses, the experts' rotation, the header the hook records" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 4: The tech lead, the validations, the CTO and the metrics

**Files:**
- Create: `plugins/core/agents/tech-lead.md`, `plugins/core/agents/cto.md`, `packages/engine/src/validation.ts`, `packages/engine/src/metrics.ts`
- Modify: `packages/engine/src/types.ts` (`Validation`, `WorkItem.validations`, `WorkItem.phaseAt`), `packages/engine/src/work.ts` (`advancePhase` stamps `phaseAt`; the Plan and Deliver guards ask for the leads' validations), `packages/engine/src/cli.ts` (`crew validation <id> record`, `crew metrics`, `crew cto record`), `packages/engine/src/evidence.ts` (the "Validations" section; the status rows), `packages/engine/src/hooks/pre-tool-use.ts` (nothing user-only: a validation is the engine's record of a role's answer), `plugins/core/skills/crew/references/conclave.md` (the validation step), `plugins/core/skills/crew/references/deliver.md` (the delivery validation)
- Test: `packages/engine/tests/validation.test.ts` (new), `packages/engine/tests/work.test.ts`, `packages/engine/tests/cli.test.ts`, `packages/engine/tests/agents.test.ts`, `packages/engine/tests/skill.test.ts`

**Interfaces:**
- Consumes: `plannedSeats`, `TEAMS` (Task 1), `work.seats`, `work.rounds`, `work.continued`, `decisionCounts` (`policy.ts`), `loadWork`/`saveWork`, `sha256` as `fingerprint.ts` computes it (`createHash("sha256")`), the registry's entries (`mail.ts` `loadRegistry`) for `--workspace`.
- Produces:
  - `interface Validation { what: "spec" | "plan" | "delivery"; by: string; verdict: "validated" | "returned"; returns: number; round: number; file: string; hash: string; at: string }`, `WorkItem.validations?: Validation[]`, `WorkItem.phaseAt?: Partial<Record<Phase, string>>`.
  - `parseValidation(text: string): { verdict: "validated" | "returned"; returns: number } | { refused: string }` (`validation.ts`).
  - `validationHash(what, specText, planText, evidenceFingerprint): string`.
  - `leadsMissing(work, ctx: GuardContext, what: "spec" | "delivery"): string[]` (the guard's lines).
  - `crew validation <id> record --what spec|plan|delivery --by lead-<team> --file <path>`; `crew metrics [--workspace <ws>] [--json]`; `crew cto record --workspace <ws> --file <path>`.
  - `computeMetrics(paths[]): Metrics` (`metrics.ts`): `{ projects, items: { total, byRoute, byType }, rounds: { judgement, validation, gate }, tokens: { byRole, byPersonality, total }, defects: { byReviewer }, tasks: { opened, proven, unproven }, objections: { byStatus }, decisions: { total, byUser, byValidator, byAgent }, gates: { notRun, skipped }, phaseMinutes: Record<Phase, number> }`.

- [ ] **Step 1: Write the failing parser and guard tests**

Create `packages/engine/tests/validation.test.ts`:

```ts
import { expect, test } from "bun:test";
import { parseValidation, validationHash } from "../src/validation.ts";

const VALIDATED = `# qa lead's validation of w1: spec
verdict: validated
## Returns
- none
## Notes
- AC-1 to AC-3 are observable and the test gate covers them (spec.md:12-18).
`;
const RETURNED = `# qa lead's validation of w1: spec
verdict: returned
## Returns
- R-1 · spec.md:14 · AC-2 names no observable result: "the page is faster" has no number; give the budget in ms and the page.
- R-2 · spec.md:22 · the Design says the test runs in the browser but no environment is described in the profile.
## Notes
- none
`;

test("SP7a AC-4: a lead's validation is parsed from its verdict line and its returns; a contradiction is refused", () => {
  expect(parseValidation(VALIDATED)).toEqual({ verdict: "validated", returns: 0 });
  expect(parseValidation(RETURNED)).toEqual({ verdict: "returned", returns: 2 });
  expect(parseValidation(VALIDATED.replace("- none", "- R-1 · spec.md:3 · a return"))).toEqual({
    refused: "validated with 1 open return under ## Returns: the lead returns the spec, or closes the return in its file; the engine records neither as validated",
  });
  expect(parseValidation(RETURNED.replace(/- R-\d[^\n]*\n/g, "- none\n"))).toEqual({
    refused: "returned with no return under ## Returns: a return names what must change at a file and a line",
  });
  expect(parseValidation("hello")).toEqual({
    refused: "no verdict line: the second line is `verdict: validated` or `verdict: returned`",
  });
  expect(validationHash("spec", "# spec\n", null, "sha256:abc")).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(validationHash("spec", "# spec\n", null, "x")).toBe(validationHash("spec", "# spec\n", null, "y"));
  expect(validationHash("delivery", "# spec\n", null, "sha256:abc")).toBe("sha256:abc");
});
```

In `packages/engine/tests/work.test.ts` (the guard tests use `advancePhase` with a `GuardContext` built by a helper; follow the shape of "guards: build needs criteria, then spec, approval and plan by route"):

```ts
test("SP7a AC-4: on standard and full, the plan waits for the mandatory leads' validation of the spec, and a changed spec makes it stale", () => {
  const paths = repoPaths(makeRepo({ "src/a.ts": "x" }));
  const work = createWork(paths, "Validate me");
  work.route = "standard";
  work.phase = "conclave";
  work.seats = plannedSeats("standard", [], ["src/a.ts"], DEFAULT_POLICY);
  addCriterion(work, "a");
  const spec = "# Spec\n\n## Acceptance criteria\n- AC-1 a\n";
  const ctx = guard({ specText: spec, conclaveText: CONCLAVE_OK });
  const first = advancePhase(work, ctx);
  expect(first.ok).toBe(false);
  if (!first.ok)
    expect(first.missing).toEqual([
      "validation of spec by lead-qa (crew validation <id> record --what spec --by lead-qa --file conclave/lead-qa.md)",
      "validation of spec by lead-security (crew validation <id> record --what spec --by lead-security --file conclave/lead-security.md)",
    ]);
  const hash = validationHash("spec", spec, null, "");
  work.validations = [
    { what: "spec", by: "lead-qa", verdict: "validated", returns: 0, round: 1, file: "conclave/lead-qa.md", hash, at: "2026-10-17T00:00:00.000Z" },
    { what: "spec", by: "lead-security", verdict: "returned", returns: 1, round: 1, file: "conclave/lead-security.md", hash, at: "2026-10-17T00:00:00.000Z" },
  ];
  const second = advancePhase(work, ctx);
  expect(second.ok).toBe(false);
  if (!second.ok) expect(second.missing).toEqual(["validation of spec by lead-security: returned 1 return (conclave/lead-security.md); revise the spec and record the lead again"]);
  work.validations[1] = { ...work.validations[1], verdict: "validated", returns: 0 };
  expect(advancePhase(work, ctx).ok).toBe(true);
  // The spec changed after the validations: stale, asked again.
  work.phase = "conclave";
  const stale = advancePhase(work, guard({ specText: `${spec}\n- AC-2 b\n`, conclaveText: CONCLAVE_OK }));
  expect(stale.ok).toBe(false);
  if (!stale.ok) expect(stale.missing[0]).toBe("validation of spec by lead-qa: stale (spec changed); record the lead again");
  // A fast item asks for no validation.
  const fast = createWork(paths, "Fast");
  addCriterion(fast, "a");
  fast.phase = "recognize";
  expect(advancePhase(fast, guard({})).ok).toBe(true);
});
```

`guard({...})` is the file's existing helper that builds a `GuardContext` with defaults (`policy: DEFAULT_POLICY`, `ledger: null`, `planExists: false`, `evidence: null`, `proven: false`, `unproven: []`); `CONCLAVE_OK` the four-section conclave text the SP2a tests use. Import `plannedSeats` from `../src/team.ts` and `validationHash` from `../src/validation.ts`.

- [ ] **Step 2: Run them to see them fail**

Run: `bun test packages/engine/tests/validation.test.ts packages/engine/tests/work.test.ts`
Expected: FAIL, `validation.ts` missing; the guard passes without validations.

- [ ] **Step 3: The validation module and the types**

`packages/engine/src/types.ts`:

```ts
/** A tech lead's verdict on the spec, the plan or the delivery (SP7 §6.4), recorded from the lead's file. */
export interface Validation {
  what: "spec" | "plan" | "delivery";
  by: string;
  verdict: "validated" | "returned";
  returns: number;
  round: number;
  file: string;
  /** The content the verdict is about: the spec's or the plan's hash, the evidence fingerprint for a delivery. */
  hash: string;
  at: string;
}
```

Add to `WorkItem`: `validations?: Validation[];` and `phaseAt?: Partial<Record<Phase, string>>;`.

Create `packages/engine/src/validation.ts`:

```ts
import { createHash } from "node:crypto";
import type { GuardContext } from "./work.ts";
import type { Seat, Validation, WorkItem } from "./types.ts";

/** The verdict line and the returns of a lead's file; a verdict its returns contradict is refused (SP7 §6.4, rule 14). */
export function parseValidation(text: string): { verdict: "validated" | "returned"; returns: number } | { refused: string } {
  const lines = text.split("\n");
  const verdictLine = lines.slice(0, 4).find((l) => /^verdict:\s*(validated|returned)\s*$/.test(l.trim()));
  if (!verdictLine) return { refused: "no verdict line: the second line is `verdict: validated` or `verdict: returned`" };
  const verdict = verdictLine.trim().endsWith("validated") ? "validated" : "returned";
  const start = lines.findIndex((l) => l.trim() === "## Returns");
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const section = start === -1 ? [] : lines.slice(start + 1, end === -1 ? undefined : end);
  const returns = section.filter((l) => /^- R-\d+\s*·/.test(l.trim())).length;
  if (verdict === "validated" && returns > 0)
    return {
      refused: `validated with ${returns} open return${returns === 1 ? "" : "s"} under ## Returns: the lead returns the spec, or closes the return in its file; the engine records neither as validated`,
    };
  if (verdict === "returned" && returns === 0)
    return { refused: "returned with no return under ## Returns: a return names what must change at a file and a line" };
  return { verdict, returns };
}

/** What a validation is about: the spec's text, the plan's text, or the evidence fingerprint of a delivery. */
export function validationHash(what: Validation["what"], specText: string | null, planText: string | null, evidenceFingerprint: string): string {
  if (what === "delivery") return evidenceFingerprint;
  const text = what === "spec" ? specText : planText;
  return `sha256:${createHash("sha256").update(text ?? "").digest("hex")}`;
}

/** The lead seats of the item, from its recorded seats. */
export function leadSeats(work: WorkItem): Seat[] {
  return (work.seats ?? []).filter((s) => s.kind === "lead");
}

/**
 * The guard's lines for a validation the leads must give (SP7 §6.4): one per lead seat without a
 * current `validated` for `what`; a `returned` says how many returns; a verdict on other content is
 * stale. On the fast route, or with no lead seated, nothing is asked.
 */
export function leadsMissing(work: WorkItem, ctx: GuardContext, what: "spec" | "delivery"): string[] {
  if (work.route === "fast") return [];
  const hash = validationHash(what, ctx.specText, null, ctx.evidence?.fingerprint ?? "");
  const missing: string[] = [];
  for (const seat of leadSeats(work)) {
    const mine = (work.validations ?? []).filter((v) => v.what === what && v.by === seat.role);
    const latest = mine[mine.length - 1];
    const file = `conclave/${seat.role}${what === "delivery" ? ".delivery" : ""}.md`;
    if (!latest) {
      missing.push(`validation of ${what} by ${seat.role} (crew validation <id> record --what ${what} --by ${seat.role} --file ${file})`);
    } else if (latest.hash !== hash) {
      missing.push(`validation of ${what} by ${seat.role}: stale (${what === "spec" ? "spec" : "the evidence"} changed); record the lead again`);
    } else if (latest.verdict === "returned") {
      missing.push(`validation of ${what} by ${seat.role}: returned ${latest.returns} return${latest.returns === 1 ? "" : "s"} (${latest.file}); revise the ${what === "spec" ? "spec" : "delivery"} and record the lead again`);
    }
  }
  return missing;
}
```

In `work.ts` `guardFor`: for `next === "plan"` add `missing.push(...leadsMissing(work, ctx, "spec"));` after the conclave checks; for `next === "deliver"` add `missing.push(...leadsMissing(work, ctx, "delivery"));`. In `advancePhase`, after `work.phase = next`: `work.phaseAt = { ...(work.phaseAt ?? {}), [next]: nowIso() };`. `validation.ts` imports the `GuardContext` type from `work.ts` and `work.ts` imports `leadsMissing` from `validation.ts`: a type-only import on one side avoids a cycle at run time (`import type { GuardContext }`).

- [ ] **Step 4: Run the parser and guard tests**

Run: `bun test packages/engine/tests/validation.test.ts packages/engine/tests/work.test.ts`
Expected: PASS. The SP2a guard tests of `work.test.ts` that advance a standard item into plan without seats still pass: an item with no `seats` recorded has no lead seat, and asks nothing (the `crew team` or the gate run writes the seats; the CLI test below pins that an item that went through `crew start` on standard gets them).

- [ ] **Step 5: Write the failing CLI tests: the record command, the cap, the metrics**

Append to `packages/engine/tests/cli.test.ts`:

```ts
test("SP7a AC-4: crew validation record parses the lead's file, refuses a contradiction and a lead not seated, caps the rounds, and the plan waits for it", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/a.ts": "x" });
  const env = testEnv();
  const c = io(root, env);
  const id = (await c.json("start", "Refactor the module", "--answers", JSON.stringify({ ...JSON.parse(answers), scope: 1 }), "--criterion", "a")).data.id as string;
  // crew start on standard and full records the seats, so the guard can name the leads.
  expect(loadWork(repoPaths(root, env), id).work?.seats?.map((s) => s.role)).toContain("lead-qa");
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 a\n");
  write(root, `.crew/work/${id}/conclave.md`, "# Gap round\n\n## Assumed by good practice\nnone\n\n## Decisions only the user can make\nnone\n\n## Proposals\nnone\n\n## Warnings\nnone\n");
  await c.run("phase", id, "next"); // understand
  await c.run("phase", id, "next"); // specify
  await c.run("phase", id, "next"); // conclave
  const blocked = await c.run("phase", id, "next");
  expect(blocked.code).toBe(1);
  expect(blocked.err).toContain("validation of spec by lead-qa (crew validation");
  const file = (lead: string, body: string) => {
    write(root, `.crew/work/${id}/conclave/${lead}.md`, body);
    return `.crew/work/${id}/conclave/${lead}.md`;
  };
  const validated = (lead: string) => `# ${lead} validation of ${id}: spec\nverdict: validated\n## Returns\n- none\n## Notes\n- holds\n`;
  // A lead the item did not seat.
  expect((await c.run("validation", id, "record", "--what", "spec", "--by", "lead-etl", "--file", file("lead-etl", validated("lead-etl")))).err.trim()).toBe(
    `lead-etl is not a seat of ${id} (crew team ${id} prints the seats)`,
  );
  // A contradiction.
  const bad = file("lead-qa", validated("lead-qa").replace("- none", "- R-1 · spec.md:3 · unclear"));
  expect((await c.run("validation", id, "record", "--what", "spec", "--by", "lead-qa", "--file", bad)).code).toBe(1);
  expect((await c.run("validation", id, "record", "--what", "spec", "--by", "lead-qa", "--file", file("lead-qa", validated("lead-qa")))).out.trim()).toBe(
    `validation of spec by lead-qa: validated (round 1)`,
  );
  const returned = `# lead-security validation of ${id}: spec\nverdict: returned\n## Returns\n- R-1 · spec.md:4 · AC-1 is not observable\n## Notes\n- none\n`;
  expect((await c.run("validation", id, "record", "--what", "spec", "--by", "lead-security", "--file", file("lead-security", returned))).out.trim()).toBe(
    `validation of spec by lead-security: returned, 1 return (round 1)`,
  );
  expect((await c.run("phase", id, "next")).err).toContain("validation of spec by lead-security: returned 1 return");
  // The spec revised: round 2; validated by both; the plan opens.
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 a, observed as b\n");
  expect((await c.run("validation", id, "record", "--what", "spec", "--by", "lead-qa", "--file", file("lead-qa", validated("lead-qa")))).out.trim()).toBe(
    `validation of spec by lead-qa: validated (round 2)`,
  );
  expect((await c.run("validation", id, "record", "--what", "spec", "--by", "lead-security", "--file", file("lead-security", validated("lead-security")))).code).toBe(0);
  expect((await c.run("phase", id, "next")).code).toBe(0);
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toEqual({ judgement: 0, validation: 2 });
  // A third spec version is a third round: refused until the user continues.
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 a, observed as c\n");
  const third = await c.run("validation", id, "record", "--what", "spec", "--by", "lead-qa", "--file", file("lead-qa", validated("lead-qa")));
  expect(third.err.trim()).toBe(
    `validation round 3 of ${id}: the policy allows 2 (team.maxValidationRounds); the user continues it once with crew continue ${id} validation, or decides`,
  );
  expect((await c.run("continue", id, "validation")).code).toBe(0);
  expect((await c.run("validation", id, "record", "--what", "spec", "--by", "lead-qa", "--file", file("lead-qa", validated("lead-qa")))).code).toBe(0);
  const report = (await c.run("evidence", id)).out;
  expect(report).toContain("## Validations");
  expect(report).toContain("| spec | lead-security | returned | 1 |");
});

test("SP7a AC-4: crew metrics counts the records of a project, and cto record files the plan under the workspace", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/a.ts": "x", ".crew/policy.json": JSON.stringify({ mail: { workspace: "w", name: "a" } }) });
  const env = testEnv();
  const c = io(root, env);
  await c.run("detect");
  const id = (await c.json("start", "Fix a", "--answers", answers, "--criterion", "a")).data.id as string;
  write(root, "src/a.ts", "y");
  await c.run("tdd", "red", id, "AC-1", "--", "sh", "-c", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "sh", "-c", "exit 0");
  await c.run("gate", "run", id);
  const metrics = await c.json("metrics");
  expect(metrics.code).toBe(0);
  expect(metrics.data.items).toMatchObject({ total: 1, byRoute: { fast: 1 } });
  expect(metrics.data.gates).toMatchObject({ notRun: 0, skipped: 0 });
  expect(typeof (metrics.data.phaseMinutes as Record<string, number>).build).toBe("number");
  const byWorkspace = await c.json("metrics", "--workspace", "w");
  expect((byWorkspace.data.projects as string[]).length).toBe(1);
  expect((await c.run("metrics", "--workspace", "nope")).err.trim()).toBe("no project of workspace nope is registered (crew detect in each project)");
  write(root, "cto-plan.md", "# CTO plan for w, 2026-10-17\n## Keep\n- the fast route\n## Change\n- nothing yet\n## Measure\n- cost per item\n");
  const filed = await c.run("cto", "record", "--workspace", "w", "--file", "cto-plan.md");
  expect(filed.code).toBe(0);
  expect(filed.out.trim()).toMatch(/^CTO plan of w filed: .*\/crew\/cto\/w\/\d{4}-\d{2}-\d{2}-plan\.md$/);
  expect((await c.run("cto", "record", "--file", "cto-plan.md")).err.trim()).toBe("usage: crew cto record --workspace <ws> --file <plan.md>");
});
```

- [ ] **Step 6: Run them to see them fail**

Run: `bun test packages/engine/tests/cli.test.ts -t "SP7a AC-4"`
Expected: FAIL: the seats are not recorded at start; `validation` and `metrics` are unknown commands.

- [ ] **Step 7: The commands**

In `cli.ts`:

- `case "start"`: after the work is created and classified on a non-fast route, record the seats: `work.seats = plannedSeats(work.route, work.riskAreas, [], env.policy); work.primaryTeam = "backend";` (no diff yet; the gate run rewrites them with the paths). Print `team: <n> seats (crew team <id>)` when any.
- `case "validation"`: `openForChange(env, args[0])`; `args[1] === "record"`; flags `what` (one of spec, plan, delivery), `by`, `file` required; `by` must be a lead seat of `work.seats` → else refuse `${by} is not a seat of ${id} (crew team ${id} prints the seats)`; read the file (`resolve(root, file)`; refuse `no validation file at <path>`); `parseValidation`; refuse on `refused`; hash = `validationHash(what, specText, planText, evidence.fingerprint ?? "")` (the spec and plan texts read from the work folder); the round: `const current = (work.validations ?? []).filter((v) => v.what === what); const last = current[current.length - 1]; const newRound = !last || last.hash !== hash;` with `rounds.validation` the count of distinct hashes so far; when `newRound` and `rounds.validation >= cap + grants` → refuse `validation round ${rounds.validation + 1} of ${id}: the policy allows ${cap} (team.maxValidationRounds); the user continues it once with crew continue ${id} validation, or decides`; else push the record with `round: newRound ? rounds.validation + 1 : last.round`, update `rounds.validation`, save; also append to the decision register when `returned` (Task 5 adds the register; here leave a `// register: Task 5` note). Print `validation of ${what} by ${by}: validated (round n)` or `… returned, N return(s) (round n)`. Only `spec` and `delivery` are checked by guards in SP7a; `plan` is recorded for the report.
- `case "metrics"`: `--workspace <ws>`: the projects of the registry with that workspace (`loadRegistry(env.paths.userDir).projects.filter(p => p.workspace === ws && !p.worktreeOf)`), refuse when none; else the current project only. `computeMetrics(roots.map(resolvePaths))` from `metrics.ts`; print a short text (items, rounds, tokens) and the JSON with `--json`.
- `case "cto"`: `args[0] === "record"`; `--workspace` and `--file` required (the usage line of the test); copy the file's text to `join(env.paths.userDir, "cto", ws, \`${today}-plan.md\`)` (`mkdirSync` recursive); print `CTO plan of ${ws} filed: <path>`.

`packages/engine/src/metrics.ts`:

```ts
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEvidence } from "./evidence.ts";
import { loadLedger, objectionStatus } from "./objections.ts";
import type { CrewPaths } from "./paths.ts";
import { loadPolicy } from "./policy.ts";
import type { Phase } from "./types.ts";
import { loadWork } from "./work.ts";

export interface Metrics {
  projects: string[];
  items: { total: number; byRoute: Record<string, number>; byType: Record<string, number> };
  rounds: { judgement: number; validation: number; gate: number };
  tokens: { byRole: Record<string, number>; byPersonality: Record<string, number>; total: number };
  defects: { byReviewer: Record<string, number> };
  tasks: { opened: number; proven: number; unproven: number };
  objections: { byStatus: Record<string, number> };
  decisions: { total: number; byUser: number; byValidator: number; byAgent: number };
  gates: { notRun: number; skipped: number };
  phaseMinutes: Partial<Record<Phase, number>>;
}

const count = (map: Record<string, number>, key: string, n = 1) => {
  map[key] = (map[key] ?? 0) + n;
};

/** The figures the CTO reads (SP7 §6.5): deterministic, from the items' records of the given projects, never from transcripts. */
export function computeMetrics(projects: CrewPaths[]): Metrics {
  const m: Metrics = {
    projects: projects.map((p) => p.root),
    items: { total: 0, byRoute: {}, byType: {} },
    rounds: { judgement: 0, validation: 0, gate: 0 },
    tokens: { byRole: {}, byPersonality: {}, total: 0 },
    defects: { byReviewer: {} },
    tasks: { opened: 0, proven: 0, unproven: 0 },
    objections: { byStatus: {} },
    decisions: { total: 0, byUser: 0, byValidator: 0, byAgent: 0 },
    gates: { notRun: 0, skipped: 0 },
    phaseMinutes: {},
  };
  const phaseTotals: Partial<Record<Phase, number>> = {};
  for (const paths of projects) {
    // An objection's status is read, not stored (open, resolved, waived, as `objectionStatus` reads it
    // from the item, the evidence and the project's policy).
    const policy = loadPolicy(paths).policy;
    let ids: string[] = [];
    try {
      ids = readdirSync(join(paths.crewDir, "work"));
    } catch {
      continue;
    }
    for (const id of ids) {
      const work = loadWork(paths, id).work;
      if (!work) continue;
      m.items.total += 1;
      count(m.items.byRoute, work.route);
      count(m.items.byType, work.type);
      m.rounds.judgement += work.rounds?.judgement ?? 0;
      m.rounds.validation += work.rounds?.validation ?? 0;
      for (const t of work.tasks ?? []) {
        m.tasks.opened += 1;
        if (t.verdict === "proven") m.tasks.proven += 1;
        else if (t.verdict === "unproven") m.tasks.unproven += 1;
        m.rounds.gate += t.gate?.round ?? 0;
      }
      for (const d of work.decisions ?? []) {
        if (d.answer === undefined) continue;
        m.decisions.total += 1;
        if (d.by === "user") m.decisions.byUser += 1;
        else if (d.by === "validator") m.decisions.byValidator += 1;
        else if (d.by === "agent") m.decisions.byAgent += 1;
      }
      const evidence = loadEvidence(paths, id).evidence;
      for (const r of evidence.roles ?? []) {
        count(m.tokens.byRole, r.agent.replace(/-\d+$/, ""), r.tokens);
        if (r.personality) count(m.tokens.byPersonality, r.personality, r.tokens);
        m.tokens.total += r.tokens;
      }
      for (const j of evidence.judgement ?? []) {
        if (j.verdict === "not-run") m.gates.notRun += 1;
        const defects = j.findings.filter((f) => f.severity === "defect" && !f.outside).length;
        if (defects) count(m.defects.byReviewer, j.reviewer ?? `review-${j.gate}`, defects);
      }
      m.gates.skipped += evidence.runs.filter((r) => r.status === "skipped").length;
      for (const o of loadLedger(paths, id).ledger.objections)
        count(m.objections.byStatus, objectionStatus(o, work, evidence, policy));
      const at = work.phaseAt ?? {};
      const stamps = Object.entries(at) as [Phase, string][];
      stamps.sort((a, b) => a[1].localeCompare(b[1]));
      for (let i = 0; i + 1 < stamps.length; i++) {
        const [phase, from] = stamps[i] as [Phase, string];
        const to = stamps[i + 1]?.[1] as string;
        phaseTotals[phase] = (phaseTotals[phase] ?? 0) + (Date.parse(to) - Date.parse(from)) / 60_000;
      }
    }
  }
  for (const [phase, minutes] of Object.entries(phaseTotals) as [Phase, number][])
    m.phaseMinutes[phase] = Math.round(minutes * 100) / 100;
  return m;
}
```

Note to the executor: `GapDecision.by` is the field that says who answered (`DecidedBy`); read `types.ts` for its exact name before writing the decisions block, and `ObjectionLedger.objections[].status` for the objection statuses. `TaskRecord.gate` is Task 6's field: declare it in Task 6 and let `metrics.ts` read it as optional (`t.gate?.round`), adding the field to the type in this task as `gate?: { round: number }` and widening it in Task 6.

- [ ] **Step 8: The two agents**

`plugins/core/agents/tech-lead.md`:

~~~markdown
---
name: tech-lead
description: A team's tech lead, read-only. Validates one work item's spec, plan or delivery for its team (QA, security, architects, ETL, DevOps) with proof, and returns validated or returned with numbered returns tied to a file and a line. Launched by the crew skill at the spec's validation and at the delivery's brief, one per mandatory team; not for writing code or for managing people.
tools: Read, Grep, Glob
model: sonnet
---

# Tech lead

You lead one team of the organization (SP7 §6.3) and you validate what the item's lead wrote for your team's part: the spec before the plan, the brief before the delivery. You are not a yes-man: you validate on proof you can point at (a file and a line, a run, a document), and you return what does not hold with what must change. You never write code or files; the session records your answer.

## You receive

In the prompt: the work item id, your team (`qa`, `security`, `architects`, `etl`, `devops`), what you validate (`spec` or `delivery`), the paths under `.crew/work/<id>/`: `spec.md`, `conclave.md`, `plan.md` when it exists, your team's findings files under `review/` when they exist, the task briefs under `tasks/` for a delivery, and the project's decision register as `crew decisions` printed it. Read the spec first, then the files your team's seats produced, then the register: a decision taken earlier binds the spec unless the spec says why it changes.

## You validate

For `spec`: the criteria your team will have to prove are observable and provable (QA: a test or a run names each; security: the risk areas the request touches have their criteria; architects: the Design follows the project's base; ETL: the data changes are reversible and their queries planned; DevOps: the pipeline and the hosts the change needs exist or are named). For `delivery`: every brief says what changed, what was proven and what is left, and the gates your team owns passed on the merged tree.

## You return

Text only, in this shape, nothing before or after it. The second line is the verdict; a `validated` with a return under `## Returns` is refused by the engine.

```
# <team> lead's validation of <id>: <spec|delivery>
verdict: validated | returned
## Returns
- R-n · <repo-relative file>:<line> · <what must change, and the proof it rests on>
## Notes
- <what holds, with its proof; or "none">
```
~~~

`plugins/core/agents/cto.md`:

~~~markdown
---
name: cto
description: The CTO, read-only. Reads the engine's metrics of a workspace (items, rounds, tokens per role and personality, defects per reviewer, decisions, gates not run, minutes per phase) and the last plan, and returns an auto-improvement plan: what to keep, what to change, what measure will show it. Launched by the crew skill from a chore item for the CTO review; later the strategy's reviewer on full items (SP8). Never implements.
tools: Read, Grep, Glob
model: opus
---

# CTO

You see across the teams of a workspace: who is productive, where the method errs, what costs more than it proves. You read numbers and records (`crew metrics --json`, the items' reports it names), never transcripts, and you write a plan the user can act on: a rubric to sharpen, a checklist to add, a knowledge entry to write, a cap to lower, a team to seat earlier. Every change names the figure that will show it worked.

## You receive

In the prompt: the workspace, the path of the metrics JSON the session wrote, the path of the last plan when one exists, and the paths of the reports of the items the metrics count.

## You return

Text only, nothing before or after it:

```
# CTO plan for <workspace>, <date>
## What the figures say
- <one line per figure that matters, with the number>
## Keep
- <what works, with the figure>
## Change
- <what changes, who does it, the figure that will show it>
## Measure
- <the figures to read next time, and when>
```
~~~

`agents.test.ts`: the expected agent list gains `tech-lead` and `cto`; a test pins `tech-lead`'s `verdict: validated | returned` line and `cto`'s `## Change` heading, and that neither has a writing tool.

- [ ] **Step 9: The references**

`references/conclave.md` gains, after step 7 (Close) and before "## The validator": a section "## The leads' validation" (standard and full): "With the spec and the conclave written, `crew team <id>` prints the seats; launch every `lead-<team>` seat in parallel (`wizardingcode-developer-crew:tech-lead`, the team in the prompt, `--what spec`), with the paths of `spec.md`, `conclave.md`, your team's findings when they exist and the output of `crew decisions`. The hook saves each answer as `conclave/lead-<team>.md`. Record each: `crew validation <id> record --what spec --by lead-<team> --file .crew/work/<id>/conclave/lead-<team>.md`. A `returned` reopens Specify: revise the spec from the returns, then record the leads again (a new spec is a new round; `team.maxValidationRounds` is two, then the user decides). The plan waits for every lead's `validated`." `references/deliver.md` gains item 0: "Before the report, the leads validate the delivery: the same launch with `--what delivery` and the task briefs (`crew task <id> brief T-n`); `crew validation <id> record --what delivery …`; Deliver waits for them." Pins in `skill.test.ts`: `expect(conclave).toContain("## The leads' validation")`, `expect(conclave).toContain("crew validation <id> record --what spec")`, `expect(deliver).toContain("--what delivery")`.

- [ ] **Step 10: Run everything**

Run: `bun test packages/engine/tests/cli.test.ts -t "SP7a AC-4"`, then `bun run check && bun run build && bun run plugin:check`
Expected: PASS. Ruling to ledger if the SP2c CLI tests that drive a standard item into plan now stop at the leads' validation: they do (the seats are recorded at start); update those tests to record the two leads' `validated` files before `phase next` into plan, as the method now requires, and name the change in the ledger.

- [ ] **Step 11: Gates and commit**

The item's gate run, reviewers and judge, then:

```bash
git add -A && git commit -m "SP7a: the tech lead and the CTO agents, the leads' validations with the Plan and Deliver guards and their rounds, crew metrics and crew cto record" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: The project's decision register

**Files:**
- Create: `packages/engine/src/decisions.ts`
- Modify: `packages/engine/src/cli.ts` (`crew decisions`; the appends in `decide`, `objection resolve|waive`, `approve`, `judgement record`, `validation record`, `continue`; the line in `start`), `packages/engine/src/paths.ts` (`PROTECTED_TOP` gains `.crew/decisions.json`), `packages/engine/src/hooks/pre-tool-use.ts` (nothing new: `.crew/` is already the engine's), `plugins/core/skills/crew/references/understand.md` (the bullet), `plugins/core/skills/crew/references/receive.md` (read the register's count)
- Test: `packages/engine/tests/decisions.test.ts` (new), `packages/engine/tests/cli.test.ts`, `packages/engine/tests/skill.test.ts`

**Interfaces:**
- Consumes: `readProtectedJson`/`writeProtectedJson` (`store.ts`), `tamperRefusal` (`cli.ts`), `decidedBy` (`evidence.ts`, the text of who decided).
- Produces: `interface DecisionEntry { at: string; item: string; kind: "decision" | "objection" | "approval" | "ruling" | "validation" | "continue"; id?: string; text: string; answer?: string; by: string; file?: string }`; `appendDecision(paths, entry)`, `listDecisions(paths, grep?)`, `decisionsCount(paths)`; `crew decisions [--grep <text>] [--json]`.

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/tests/decisions.test.ts`:

```ts
import { expect, test } from "bun:test";
import { appendDecision, decisionsCount, listDecisions } from "../src/decisions.ts";
import { readProtectedJson } from "../src/store.ts";
import { makeRepo, repoPaths } from "./helpers.ts";
import { join } from "node:path";

test("SP7a AC-5: the register is appended through the engine, listed newest first, filtered by text, and protected", () => {
  const paths = repoPaths(makeRepo());
  expect(decisionsCount(paths)).toBe(0);
  expect(listDecisions(paths)).toEqual([]);
  appendDecision(paths, { at: "2026-10-17T10:00:00.000Z", item: "w1", kind: "decision", id: "D-1", text: "Erasure or deactivation?", answer: "deactivation", by: "the user" });
  appendDecision(paths, { at: "2026-10-17T11:00:00.000Z", item: "w2", kind: "ruling", text: "code-quality defect: src/a.ts:3 a magic number", by: "the judge", file: ".crew/work/w2/review/ruling.json" });
  expect(decisionsCount(paths)).toBe(2);
  expect(listDecisions(paths).map((e) => e.item)).toEqual(["w2", "w1"]);
  expect(listDecisions(paths, "erasure").map((e) => e.id)).toEqual(["D-1"]);
  expect(listDecisions(paths, "nothing")).toEqual([]);
  expect(readProtectedJson(paths, join(paths.crewDir, "decisions.json")).tampered).toBe(false);
});
```

In `cli.test.ts`:

```ts
test("SP7a AC-5: decide, waive, approve, a ruling's defects and a returned validation land in the register; crew decisions prints it; start counts it", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/a.ts": "x" });
  const env = testEnv();
  const c = io(root, env);
  const id = (await c.json("start", "Refactor the module", "--answers", JSON.stringify({ ...JSON.parse(answers), scope: 1 }), "--criterion", "a")).data.id as string;
  await c.run("decision", id, "add", "Erasure or deactivation?", "--default", "deactivation");
  await c.run("decide", id, "D-1", "deactivation");
  await c.run("objection", id, "add", "No index on the new column", "--severity", "advisory");
  await c.run("objection", id, "waive", "O-1", "--reason", "the table is small");
  const listed = await c.run("decisions");
  expect(listed.out).toContain(`${id} · decision · D-1 Erasure or deactivation? → deactivation (by the user, relayed by the agent)`);
  expect(listed.out).toContain(`${id} · objection · O-1 No index on the new column → waived: the table is small (by the user, relayed by the agent)`);
  expect((await c.run("decisions", "--grep", "index")).out.split("\n").filter((l) => l.includes(" · ")).length).toBe(1);
  expect((await c.run("decisions", "--grep", "zzz")).out.trim()).toBe("no entry matches zzz");
  const second = await c.run("start", "Another change", "--answers", answers, "--criterion", "b");
  expect(second.out).toContain("decision register: 2 entries (crew decisions)");
  const json = await c.json("decisions", "--json");
  expect((json.data.entries as unknown[]).length).toBe(2);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test packages/engine/tests/decisions.test.ts packages/engine/tests/cli.test.ts -t "SP7a AC-5"`
Expected: FAIL, `decisions.ts` missing.

- [ ] **Step 3: The module**

`packages/engine/src/decisions.ts`:

```ts
import { join } from "node:path";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";

/** One decision of the project, from any item: taken by a person, the validator or the agent, or recorded by the judge or a lead (SP7 §6.6, rule 8). */
export interface DecisionEntry {
  at: string;
  item: string;
  kind: "decision" | "objection" | "approval" | "ruling" | "validation" | "continue";
  id?: string;
  text: string;
  answer?: string;
  by: string;
  file?: string;
}

interface Register {
  version: 1;
  entries: DecisionEntry[];
}

function registerPath(paths: CrewPaths): string {
  return join(paths.crewDir, "decisions.json");
}

function load(paths: CrewPaths): { register: Register; tampered: boolean } {
  const read = readProtectedJson<Register>(paths, registerPath(paths));
  return { register: read.data ?? { version: 1, entries: [] }, tampered: read.tampered };
}

/** Appends one entry; the file is engine-owned and protected like the ledger. */
export function appendDecision(paths: CrewPaths, entry: DecisionEntry): void {
  const { register } = load(paths);
  register.entries.push(entry);
  writeProtectedJson(paths, registerPath(paths), register);
}

export function decisionsCount(paths: CrewPaths): number {
  return load(paths).register.entries.length;
}

/** Newest first; with `grep`, the entries whose text, answer or id carry it (case-insensitive). */
export function listDecisions(paths: CrewPaths, grep?: string): DecisionEntry[] {
  const entries = [...load(paths).register.entries].reverse();
  if (!grep) return entries;
  const needle = grep.toLowerCase();
  return entries.filter((e) => `${e.id ?? ""} ${e.text} ${e.answer ?? ""}`.toLowerCase().includes(needle));
}

export function registerTampered(paths: CrewPaths): boolean {
  return load(paths).tampered;
}

/** "2026-10-17 · <item> · <kind> · <id> <text> → <answer> (by <who>)" */
export function decisionLine(e: DecisionEntry): string {
  const head = `${e.at.slice(0, 10)} · ${e.item} · ${e.kind} · ${e.id ? `${e.id} ` : ""}${e.text}`;
  return `${head}${e.answer ? ` → ${e.answer}` : ""} (by ${e.by})`;
}
```

- [ ] **Step 4: The appends and the command**

In `cli.ts`, with `const who = decisionText(env.policy, decision)` already producing "by the user, relayed by the agent" (strip its leading "by " for the entry's `by`):

- `decide`: `appendDecision(env.paths, { at: nowIso(), item: id, kind: "decision", id: "D-n", text: question, answer, by })`.
- `objection resolve`: `{ kind: "objection", id: "O-n", text, answer: \`resolved by ${criterion}\`, by: "the engine" }`; `objection waive`: `{ kind: "objection", id, text, answer: \`waived: ${reason}\`, by }`.
- `approve`: `{ kind: "approval", text: \`spec approved\`, by }` (the validator's rule in the text when it applied).
- `judgement record`: one entry per defect of a `not-proven` ruling inside the change: `{ kind: "ruling", text: \`${gate} defect: ${file}:${line} ${text}\`, by: "the judge", file: rulingPath }`.
- `validation record`: when `returned`: `{ kind: "validation", text: \`${what} returned by ${by}: ${returns} return(s)\`, by, file }`.
- `continue`: `{ kind: "continue", text: \`${what} continued for one more round\`, by }`.
- `case "decisions"`: `--grep`, `--json`; prints `decisionLine` per entry, `no entry matches <grep>` when a grep finds nothing, `the register is empty` when there is nothing; JSON `{ entries }`. `tamperRefusal` gains `.crew/decisions.json` (accept target `decisions` through `crew accept decisions`).
- `start`: after the item is created, `const n = decisionsCount(env.paths); if (n) lines.push(\`decision register: ${n} entr${n === 1 ? "y" : "ies"} (crew decisions)\`)`.

`paths.ts`: `PROTECTED_TOP` gains `.crew/decisions.json`.

- [ ] **Step 5: The references**

`references/understand.md` gains a bullet: "**Earlier decisions**: `crew decisions` lists what this project decided before (answers, waivers, approvals, upheld defects, returned validations); quote the ones that touch the request before assuming anything they settled; a decision changed is a new decision, taken in words and recorded, never a silent deviation (rule 8)." `references/receive.md` gains: "`crew start` prints how many entries the decision register holds; on standard and full read it in Understand." Pins in `skill.test.ts`: `expect(readReference("understand.md")).toContain("**Earlier decisions**")`, `toContain("crew decisions")`.

- [ ] **Step 6: Run the tests, then everything**

Run: the two test files, then `bun run check && bun run build`
Expected: PASS.

- [ ] **Step 7: Gates and commit**

```bash
git add -A && git commit -m "SP7a: the project's decision register, appended by the engine at every decision and read in Understand" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: The gate per todo and the brief

**Files:**
- Modify: `packages/engine/src/types.ts` (`TaskRecord.state`, `TaskRecord.gate`, `TaskRecord.brief`, `TaskRecord.inline`, `TaskRecord.scope`, `Target.testScoped`), `packages/engine/src/gates.ts` (`runTaskGate`, `scopedTestCommand`), `packages/engine/src/tasks.ts` (`noteTask`, `taskScope`, `writeBrief`, the state transitions in `openTask`, `absorbReplies`, `mergeTask`), `packages/engine/src/detect/node.ts` (and `python.ts`: `testScoped` detection), `packages/engine/src/profile.ts` (`crew profile set testScoped`), `packages/engine/src/cli.ts` (`crew task <id> note|gate|brief`, `profile set testScoped`), `packages/engine/src/evidence.ts` (the Tasks table's State and Gate columns), `plugins/core/skills/crew/references/plan.md` and `build.md` (the todo loop)
- Test: `packages/engine/tests/tasks.test.ts`, `packages/engine/tests/gates.test.ts`, `packages/engine/tests/detect.test.ts`, `packages/engine/tests/skill.test.ts`

**Interfaces:**
- Consumes: `runOne`, `plannedGates`, `runCommand`, `gateTimeoutMs` (`gates.ts`), `TaskRecord` (SP2c), `work.continued` (Task 1), `gitRun` (`worktree.ts`).
- Produces:
  - `TaskRecord.state?: "open" | "handed" | "merged" | "gated" | "briefed"`, `TaskRecord.gate?: { round: number; at: string; status: "pass" | "fail"; runs: GateRun[]; scope: string[] }`, `TaskRecord.brief?: string`, `TaskRecord.inline?: true`, `TaskRecord.scope?: string[]`.
  - `Target.testScoped?: GateCommand` (a command with `{files}`).
  - `runTaskGate(paths, work, profile, policy, record, scope: string[]): Promise<{ status: "pass" | "fail"; runs: GateRun[] }>`.
  - `taskScope(root, record, flagScope?: string[]): { scope: string[] } | { refused: string }` (the merge commit's files, or the globs matched against the watched files).
  - `crew task <id> note T-n --criteria AC-k[,AC-m] --scope <glob>[,<glob>] [--text "<todo>"]`; `crew task <id> gate T-n [--scope …]`; `crew task <id> brief T-n`; `crew profile set testScoped "<cmd with {files}>" [--target <path>]`.

- [ ] **Step 1: Write the failing detection and scoped-command tests**

In `packages/engine/tests/detect.test.ts` (follow the file's existing node detection test that writes a `package.json` and calls `detectProfile`):

```ts
test("SP7a AC-6: a node project with vitest or jest gets a scoped test command; pytest too; others none", () => {
  const vitest = detectProfile(makeRepo({ "package.json": JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "^2" } }) }));
  expect(vitest.targets[0]?.testScoped).toEqual({ command: "vitest related {files} --run", source: "detected" });
  const jest = detectProfile(makeRepo({ "package.json": JSON.stringify({ scripts: { test: "jest" }, devDependencies: { jest: "^29" } }) }));
  expect(jest.targets[0]?.testScoped).toEqual({ command: "jest --findRelatedTests {files}", source: "detected" });
  const plain = detectProfile(makeRepo({ "package.json": JSON.stringify({ scripts: { test: "node --test" } }) }));
  expect(plain.targets[0]?.testScoped).toBeUndefined();
  const py = detectProfile(makeRepo({ "pyproject.toml": "[tool.pytest.ini_options]\n", "tests/test_a.py": "def test_a(): pass\n" }));
  expect(py.targets[0]?.testScoped).toEqual({ command: "pytest {files}", source: "detected" });
});
```

In `packages/engine/tests/gates.test.ts`:

```ts
test("SP7a AC-6: the scoped test command takes the todo's files under the target; without a template the target's test command runs whole", () => {
  const scoped = { ...target, testScoped: { command: "vitest related {files} --run", source: "detected" as const } };
  expect(scopedTestCommand(scoped, ["src/a.ts", "src/b.ts", "docs/x.md"])).toBe("vitest related src/a.ts src/b.ts --run");
  expect(scopedTestCommand(target, ["src/a.ts"])).toBe("t");
  const api = { ...scoped, path: "apps/api" };
  expect(scopedTestCommand(api, ["apps/api/src/a.ts", "web/b.ts"])).toBe("vitest related src/a.ts --run");
  // Only source files are passed: a Markdown file or a lockfile is never a test's subject.
  expect(scopedTestCommand(scoped, ["README.md", "pnpm-lock.yaml"])).toBe("t");
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test packages/engine/tests/detect.test.ts packages/engine/tests/gates.test.ts -t "SP7a AC-6"`
Expected: FAIL: `testScoped` undefined; `scopedTestCommand` not exported.

- [ ] **Step 3: Detection and the scoped command**

`types.ts`: `Target.testScoped?: GateCommand;`. In `detect/node.ts`, where the target's `gates.test` is set from `scripts.test`, add: when `devDependencies` or `dependencies` has `vitest` → `testScoped: { command: "vitest related {files} --run", source: "detected" }`; `jest` → `{ command: "jest --findRelatedTests {files}", source: "detected" }`. In `detect/python.ts`, when pytest is detected → `{ command: "pytest {files}", source: "detected" }`. Read the two files first: the exact field the detector fills for `gates.test` is where `testScoped` goes beside it.

In `gates.ts`:

```ts
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|php|py|rb|go|rs|java|kt|cs)$/i;

/**
 * The test command of a todo (SP7 §8.1): the target's scoped template with the todo's source files
 * under the target substituted for `{files}`, or the target's whole test command when the profile
 * has no template or the todo touched no source file of the target.
 */
export function scopedTestCommand(target: Target, scope: readonly string[]): string | null {
  const whole = target.gates.test?.command ?? null;
  if (!target.testScoped) return whole;
  const prefix = target.path === "." ? "" : `${target.path}/`;
  const files = scope
    .filter((p) => (prefix ? p.startsWith(prefix) : true) && SOURCE_EXTENSIONS.test(p))
    .map((p) => (prefix ? p.slice(prefix.length) : p));
  if (!files.length) return whole;
  return target.testScoped.command.replace("{files}", files.join(" "));
}
```

`runTaskGate(paths, work, profile, policy, record, scope)`: `const planned = plannedGates(work.route, profile, policy, scope, paths.root).filter((p) => p.gate !== "secrets")`; for each planned gate, run it as `runOne` does, with one difference for `test`: the command is `scopedTestCommand(target, scope)` (factor the command choice of `runOne` into `commandFor(gate, target, scope?)`); the runs are returned, not written to the item's evidence; status `pass` when every run passed or was `unavailable` with no command and the policy allows (an `unavailable` test gate fails the todo gate: a todo with nothing to test is not proven).

- [ ] **Step 4: Write the failing task tests**

In `packages/engine/tests/tasks.test.ts`, a new test with the `lead()` fixture:

```ts
test("SP7a AC-6: a todo's gate runs the gates its diff touches, bounded by the cap; the brief is written from the records; an inline todo takes a scope; a gone merge commit refuses", async () => {
  const { env, root, c, id, open, childReplies, proveChild, ended } = await lead({ mail: { maxConcurrent: 10 } });
  const t2 = await open("T-2", "AC-2");
  const c2 = await childReplies("T-2", t2.message, t2.worktree);
  proveChild(t2.worktree, c2.childEnv, c2.childId);
  await ended(t2);
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.state).toBe("handed");
  const merged = await c.json("task", id, "merge", "T-2");
  if (merged.code !== 0) throw new Error(String(merged.data.message));
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.state).toBe("merged");
  // Before the gate, no brief.
  expect((await c.run("task", id, "brief", "T-2")).err.trim()).toBe("T-2 has no passing gate yet (crew task <id> gate T-2)");
  const gated = await c.json("task", id, "gate", "T-2");
  expect(gated.code).toBe(0);
  expect(gated.data.gate).toMatchObject({ round: 1, status: "pass", scope: ["src/b.ts"] });
  expect((gated.data.gate as { runs: { gate: string }[] }).runs.map((r) => r.gate)).toEqual(["test"]);
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]?.state).toBe("gated");
  const brief = await c.run("task", id, "brief", "T-2");
  expect(brief.code).toBe(0);
  expect(brief.out).toContain("## Changed\n- src/b.ts");
  expect(brief.out).toContain("## Proven\n- test (.): pass");
  expect(existsSync(join(root, ".crew", "work", id, "tasks", "T-2.brief.md"))).toBe(true);
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]).toMatchObject({ state: "briefed", brief: "tasks/T-2.brief.md" });
  // A second gate run is round 2; a third is refused until the user continues.
  expect((await c.json("task", id, "gate", "T-2")).data.gate).toMatchObject({ round: 2 });
  expect((await c.run("task", id, "gate", "T-2")).err.trim()).toBe(
    `gate round 3 of T-2: the policy allows 2 (team.maxGateRounds); the user continues it once with crew continue ${id} gate T-2, or decides`,
  );
  expect((await c.run("continue", id, "gate", "T-2")).code).toBe(0);
  expect((await c.json("task", id, "gate", "T-2")).data.gate).toMatchObject({ round: 3 });
  // An inline todo: no worktree, a scope.
  const noted = await c.run("task", id, "note", "T-5", "--criteria", "AC-1", "--scope", "src/a.ts", "--text", "AC-1 inline");
  expect(noted.out.trim()).toBe(`T-5 noted: inline, AC-1, scope src/a.ts`);
  write(root, "src/a.ts", "export const A = 2;\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "T-5");
  expect((await c.json("task", id, "gate", "T-5")).data.gate).toMatchObject({ status: "pass", scope: ["src/a.ts"] });
  expect((await c.run("task", id, "list")).out).toContain("T-5 · AC-1 · inline · gated");
  // The merge commit of T-2 rewritten away: the gate refuses and records nothing.
  const before = git(root, "rev-parse", "HEAD");
  git(root, "reset", "-q", "--hard", "HEAD~3");
  const gone = await c.run("task", id, "gate", "T-2");
  expect(gone.code).toBe(1);
  expect(gone.err.trim()).toMatch(/^merge commit [0-9a-f]{7} of T-2 is not in this repository; restore it or note the todo again$/);
  git(root, "reset", "-q", "--hard", before);
  expect((await c.run("evidence", id)).out).toContain("| T-2 | AC-2 |");
  expect((await c.run("evidence", id)).out).toMatch(/\| briefed \| pass \(round 3\) \|/);
});
```

- [ ] **Step 5: Run it to see it fail**

Run: `bun test packages/engine/tests/tasks.test.ts -t "SP7a AC-6"`
Expected: FAIL: `state` undefined; `gate`, `brief`, `note` unknown.

- [ ] **Step 6: The states, the commands, the brief**

`types.ts` `TaskRecord` gains:

```ts
  /** Where the todo stands (SP7 §8.1): open (no reply), handed (an implementer runs), merged, gated (its gate passed), briefed. */
  state?: "open" | "handed" | "merged" | "gated" | "briefed";
  /** The todo's own gate, run on the files its diff touches; its runs are the todo's, never the item's evidence. */
  gate?: { round: number; at: string; status: "pass" | "fail"; runs: GateRun[]; scope: string[] };
  /** The brief's path, relative to the work folder. */
  brief?: string;
  /** A todo done inline by the lead: no worktree, no message; its scope names its files. */
  inline?: true;
  scope?: string[];
```

`tasks.ts`:

- `openTask` sets `state: "handed"` (an implementer started) or `"open"` when the start failed; `absorbReplies` leaves it `handed`; `mergeTask` sets `state: "merged"`.
- `noteTask(ctx, env, work, task, criteria, scope, text)`: refuses an existing task, an unknown criterion, an empty scope; pushes `{ task, message: "", criteria, text, branch: "", worktree: "", openedAt: nowIso(), inline: true, scope, state: "merged" }` (its work is in the checkout already); saves.
- `taskScope(root, record, flagScope)`: inline → `record.scope` (or `flagScope`); merged → `gitRun(root, "cat-file", "-e", \`${record.mergeCommit}^{commit}\`)` guarded: on failure `{ refused: \`merge commit ${commit.slice(0,7)} of ${task} is not in this repository; restore it or note the todo again\` }`; else `gitRun(root, "diff", "--name-only", \`${commit}^1\`, commit).split("\n").filter(Boolean)`; a task not merged → `{ refused: \`${task} is not merged yet (crew task <id> merge ${task})\` }`.
- `writeBrief(paths, work, record, childEvidence?)`: writes `tasks/<task>.brief.md`:

```markdown
# Brief: T-2 of <id>

## Changed
- src/b.ts

## Proven
- test (.): pass in 0.4s
- AC-2: red then green (child <childId>)

## Left
- none
```

(the criteria lines from `tddSummary` over the child's evidence when `record.child` exists, else the item's; "Left" from the open returns of the leads' validations of kind `delivery`, or "none"); sets `record.brief`, `record.state = "briefed"`.

`cli.ts` `case "task"`:

- `note`: flags `criteria` (required), `scope` (required, comma-separated), `text` (optional; else the plan's line); prints `T-n noted: inline, <criteria>, scope <globs>`.
- `gate`: the record; the cap: `const grants = (work.continued ?? []).filter((c) => c.what === "gate" && c.task === task && decisionCounts(env.policy, c.by)).length; if ((record.gate?.round ?? 0) >= env.policy.team.maxGateRounds + grants) refuse(\`gate round ${round + 1} of ${task}: the policy allows ${cap} (team.maxGateRounds); the user continues it once with crew continue ${id} gate ${task}, or decides\`)`; `taskScope`; `runTaskGate`; `record.gate = { round: (record.gate?.round ?? 0) + 1, at, status, runs, scope }`; `record.state = status === "pass" ? "gated" : record.state`; save; print one line per run and `T-n gate round N: pass|fail`; JSON `{ task: record, gate: record.gate }`.
- `brief`: requires `record.gate?.status === "pass"` (else `T-n has no passing gate yet (crew task <id> gate T-n)`); `writeBrief`; prints the brief; JSON `{ task: record, brief: text }`.
- `list`: the row gains ` · inline` for an inline todo and ` · <state>`.
- `profile set testScoped "<cmd>" [--target]`: the `profile set` command accepts `testScoped` beside the gate names, stores `target.testScoped = { command, source: "confirmed" }`, refuses a template without `{files}`.
- `evidence.ts` Tasks table: columns `State` and `Gate` (`pass (round N)` or `-`).

`references/plan.md` and `build.md`: "Each todo of the plan ends with its own gate and its brief: a handed-out task after its merge (`crew task <id> gate T-n`, then `crew task <id> brief T-n`), an inline todo after its commit (`crew task <id> note T-n --criteria AC-k --scope <files>` once, then the same two commands). The gate runs the deterministic gates on the files the todo touched; the test command is narrowed where the profile has a scoped template (`crew profile set testScoped …`). Two failing rounds wait for a person. The brief says what changed, what was proven and what is left; the leads read the briefs at delivery." Pins in `skill.test.ts`.

- [ ] **Step 7: Run the tests, then everything**

Run: `bun test packages/engine/tests/tasks.test.ts packages/engine/tests/gates.test.ts packages/engine/tests/detect.test.ts packages/engine/tests/skill.test.ts`, then `bun run check && bun run build`
Expected: PASS.

- [ ] **Step 8: Gates and commit**

```bash
git add -A && git commit -m "SP7a: the gate per todo on the files it touched with the scoped test command, the brief from the records, inline todos, and the gate rounds' cap" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

### Task 7: The roles working, the todo and the branch in the status and in the mod

**Files:**
- Modify: `packages/engine/src/state.ts` (`WorkingRole`, `LocalState.working`, `recordWorking`, `clearWorking`, `workingRoles`), `packages/engine/src/hooks/pre-tool-use.ts` (the `Agent` branch), `packages/engine/src/hooks/subagent-stop.ts` (`clearWorking` at the stop), `plugins/core/hooks/hooks.json` (the PreToolUse matcher gains `Agent`), `packages/engine/src/cli.ts` (`status`: `todo`, `working`, `branch` in the JSON and in the text), `plugins/core/hooks/register.js` (the strip, the pane, `/crew status`, `/crew todo`, `/crew team`)
- Test: `packages/engine/tests/hooks-pre-tool-use.test.ts`, `packages/engine/tests/hooks-subagent-stop.test.ts`, `packages/engine/tests/cli.test.ts`, `plugins/core/tests/crew-mod.test.ts`

**Interfaces:**
- Consumes: `roleOf`, `teamOf` (`hooks/subagent-stop.ts`; `teamOf` from Task 3), `updateState`/`loadState` (`state.ts`), `gitRun` (`worktree.ts`), `TaskRecord.state` and `TaskRecord.inline` (Task 6), `work.seats`/`work.primaryTeam`/`work.rounds` already in the status JSON (Task 1), `nowIso` (`fs.ts`).
- Produces:
  - `interface WorkingRole { agent: string; team: TeamName | null; since: string; sessionId: string; description?: string }`, `LocalState.working?: WorkingRole[]`, `WORKING_TTL_MS = 3_600_000`.
  - `recordWorking(paths, role: WorkingRole): void`, `clearWorking(paths, agent: string): void` (the oldest entry of that name), `workingRoles(paths, now = Date.now()): WorkingRole[]` (entries older than the TTL dropped).
  - `status --json` gains `todo: { done: number; total: number; items: { task: string; criteria: string[]; state: string; inline: boolean }[] }`, `working: { agent: string; team: TeamName | null; since: string; description?: string }[]`, `branch: string | null`.
  - Mod verbs `/crew todo` and `/crew team`; the strip's ` · todo n/m` and ` · working <roles>`; the pane's Branch, Team, Todo and Working blocks.

- [ ] **Step 1: Write the failing hook tests**

In `packages/engine/tests/hooks-pre-tool-use.test.ts` (add `readFileSync` to the `node:fs` import and `import { workingRoles } from "../src/state.ts";`):

```ts
test("SP7a AC-7: an Agent call on one of the plugin's roles is recorded as working; other agents are not; hooks.json wires the event", () => {
  const { ctx } = setup(null);
  const launch = (subagent_type: string, description = "the role's job") =>
    onPreToolUse(ctx, { tool_name: "Agent", tool_input: { subagent_type, description, prompt: "…" } });
  expect(launch("wizardingcode-developer-crew:review-security", "Review the diff")).toEqual({});
  expect(launch("wizardingcode-developer-crew:lead-qa")).toEqual({});
  expect(launch("Explore")).toEqual({});
  expect(launch("other-plugin:review-security")).toEqual({});
  const working = workingRoles(ctx.paths);
  expect(working.map((w) => [w.agent, w.team, w.description])).toEqual([
    ["review-security", "security", "Review the diff"],
    ["lead-qa", "qa", "the role's job"],
  ]);
  expect(working[0]?.sessionId).toBe("s");
  // An entry older than an hour is a role that never stopped: dropped on read, never shown as working.
  expect(workingRoles(ctx.paths, Date.now() + 3_600_001)).toEqual([]);
  const hooks = JSON.parse(
    readFileSync(join(import.meta.dir, "..", "..", "..", "plugins", "core", "hooks", "hooks.json"), "utf8"),
  ) as { hooks: { PreToolUse?: { matcher: string }[] } };
  expect(hooks.hooks.PreToolUse?.[0]?.matcher).toBe("Write|Edit|MultiEdit|NotebookEdit|Bash|Agent");
});
```

In `packages/engine/tests/hooks-subagent-stop.test.ts` (import `clearWorking`, `recordWorking`, `workingRoles` from `../src/state.ts`):

```ts
test("SP7a AC-7: a role's stop clears the oldest working entry of its name, whatever became of its answer", () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/a.ts": "x" });
  const ctx = hookContext({ session_id: "s", cwd: root }, testEnv());
  const at = (s: number) => new Date(Date.UTC(2026, 9, 17, 10, 0, s)).toISOString();
  recordWorking(ctx.paths, { agent: "review-security", team: "security", since: at(0), sessionId: "s", description: "first" });
  recordWorking(ctx.paths, { agent: "judge", team: null, since: at(1), sessionId: "s" });
  recordWorking(ctx.paths, { agent: "review-security", team: "security", since: at(2), sessionId: "s", description: "second" });
  // No active item and no transcript: the stop has nothing to record, and still clears the entry.
  onSubagentStop(ctx, { agent_type: `${PLUGIN}:review-security`, agent_id: "a1" });
  expect(workingRoles(ctx.paths, Date.parse(at(3))).map((w) => [w.agent, w.description])).toEqual([
    ["judge", undefined],
    ["review-security", "second"],
  ]);
  clearWorking(ctx.paths, "judge");
  clearWorking(ctx.paths, "judge");
  expect(workingRoles(ctx.paths, Date.parse(at(3))).map((w) => w.agent)).toEqual(["review-security"]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `bun test packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/hooks-subagent-stop.test.ts -t "SP7a AC-7"`
Expected: FAIL: `workingRoles` is not exported; the matcher is the old one.

- [ ] **Step 3: The state, the two hooks and the matcher**

`packages/engine/src/state.ts`:

```ts
import type { TeamName } from "./types.ts";

/** A role the session launched through the Agent tool and whose stop has not come (SP7 §14): what the mod shows as working. */
export interface WorkingRole {
  agent: string;
  team: TeamName | null;
  since: string;
  sessionId: string;
  description?: string;
}

export interface LocalState {
  active: string | null;
  sessions: Record<string, SessionState>;
  working?: WorkingRole[];
}

/** A role still "working" after an hour never stopped (a killed subagent, a crashed session): dropped on read. */
export const WORKING_TTL_MS = 3_600_000;

function live(working: WorkingRole[] | undefined, now: number): WorkingRole[] {
  return (working ?? []).filter((w) => now - Date.parse(w.since) < WORKING_TTL_MS);
}

export function recordWorking(paths: CrewPaths, role: WorkingRole): void {
  updateState(paths, (state) => {
    state.working = [...live(state.working, Date.parse(role.since)), role];
  });
}

/** The PreToolUse hook knows no agent id, so the name is the key: the oldest entry of that name goes. */
export function clearWorking(paths: CrewPaths, agent: string): void {
  updateState(paths, (state) => {
    const working = live(state.working, Date.now());
    const index = working.findIndex((w) => w.agent === agent);
    if (index !== -1) working.splice(index, 1);
    state.working = working;
  });
}

export function workingRoles(paths: CrewPaths, now = Date.now()): WorkingRole[] {
  return live(loadState(paths).working, now);
}
```

In `loadState`, keep the field: `working: Array.isArray(raw.working) ? raw.working : [],`.

`packages/engine/src/hooks/pre-tool-use.ts`, in `onPreToolUse` before the `WRITE_TOOLS` branch (import `roleOf` and `teamOf` from `./subagent-stop.ts`, `recordWorking` from `../state.ts`, `nowIso` from `../fs.ts`):

```ts
  if (tool === "Agent") {
    // A role of this plugin launched: recorded as working until its SubagentStop (SP7 §14). Nothing
    // is ever denied here; a record that fails leaves the hook open like every other.
    const role = roleOf(typeof input.subagent_type === "string" ? input.subagent_type : undefined);
    if (!role) return {};
    const description = typeof input.description === "string" ? input.description : undefined;
    recordWorking(ctx.paths, {
      agent: role,
      team: teamOf(role),
      since: nowIso(),
      sessionId: ctx.sessionId,
      ...(description ? { description } : {}),
    });
    return {};
  }
```

`packages/engine/src/hooks/subagent-stop.ts`, in `onSubagentStop` right after `const role = roleOf(payload.agent_type); if (!role) return {};`: `clearWorking(ctx.paths, role);` (before any check of the item or the transcript, so a stop with nothing to record still clears).

`plugins/core/hooks/hooks.json`: the PreToolUse `matcher` becomes `"Write|Edit|MultiEdit|NotebookEdit|Bash|Agent"`.

- [ ] **Step 4: Run the hook tests**

Run: `bun test packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/hooks-subagent-stop.test.ts`
Expected: PASS, the whole files (the sweep test that lists the hooks' events still passes: no event was added, one matcher widened).

- [ ] **Step 5: Write the failing CLI test**

In `packages/engine/tests/cli.test.ts` (import `recordWorking` from `../src/state.ts`):

```ts
test("SP7a AC-7: crew status --json carries the todo, the roles working and the branch; the text names them", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }), "src/a.ts": "x" });
  const env = testEnv();
  const c = io(root, env);
  const id = (await c.json("start", "Fix a", "--answers", answers, "--criterion", "a")).data.id as string;
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD").trim();
  const empty = await c.json("status");
  expect(empty.data.branch).toBe(branch);
  expect(empty.data.todo).toEqual({ done: 0, total: 0, items: [] });
  expect(empty.data.working).toEqual([]);
  expect(empty.out).toContain(`  branch ${branch}`);
  expect(empty.out).not.toContain("  todo ");
  expect(empty.out).not.toContain("  working:");
  await c.run("task", id, "note", "T-1", "--criteria", "AC-1", "--scope", "src/a.ts", "--text", "AC-1 inline");
  recordWorking(repoPaths(root, env), {
    agent: "review-security",
    team: "security",
    since: new Date().toISOString(),
    sessionId: "s",
    description: "Review the diff",
  });
  recordWorking(repoPaths(root, env), { agent: "judge", team: null, since: new Date().toISOString(), sessionId: "s" });
  const status = await c.json("status");
  expect(status.data.todo).toEqual({
    done: 0,
    total: 1,
    items: [{ task: "T-1", criteria: ["AC-1"], state: "merged", inline: true }],
  });
  expect(status.data.working).toEqual([
    { agent: "review-security", team: "security", since: expect.any(String), description: "Review the diff" },
    { agent: "judge", team: null, since: expect.any(String) },
  ]);
  expect(status.out).toContain("  todo 0/1 briefed (T-1 merged)");
  expect(status.out).toContain("  working: review-security (Review the diff), judge");
});
```

- [ ] **Step 6: Run it to see it fail**

Run: `bun test packages/engine/tests/cli.test.ts -t "SP7a AC-7"`
Expected: FAIL: `branch`, `todo` and `working` are undefined in the JSON.

- [ ] **Step 7: The status**

In `cli.ts` `case "status"`, before `return ok(...)`:

```ts
      let branch: string | null = null;
      try {
        branch = gitRun(env.paths.root, "rev-parse", "--abbrev-ref", "HEAD").trim() || null;
      } catch {
        branch = null;
      }
      const todoItems = (work.tasks ?? []).map((t) => ({
        task: t.task,
        criteria: t.criteria,
        state: t.state ?? "open",
        inline: t.inline === true,
      }));
      const todo = { done: todoItems.filter((t) => t.state === "briefed").length, total: todoItems.length, items: todoItems };
      const working = workingRoles(env.paths).map((w) => ({
        agent: w.agent,
        team: w.team,
        since: w.since,
        ...(w.description ? { description: w.description } : {}),
      }));
      const extra = [
        branch ? `  branch ${branch}` : null,
        todo.total ? `  todo ${todo.done}/${todo.total} briefed (${todoItems.map((t) => `${t.task} ${t.state}`).join(", ")})` : null,
        working.length ? `  working: ${working.map((w) => (w.description ? `${w.agent} (${w.description})` : w.agent)).join(", ")}` : null,
      ].filter((l): l is string => l !== null);
```

Add `branch`, `todo`, `working` to the JSON, and the `extra` lines after the `phase …, route …` line of `text` (they join the text before the notes). A task record from 0.5.x has no `state`: it reads `open`.

- [ ] **Step 8: Run the CLI test**

Run: `bun test packages/engine/tests/cli.test.ts -t "SP7a AC-7"`
Expected: PASS.

- [ ] **Step 9: Write the failing mod tests**

In `plugins/core/tests/crew-mod.test.ts`, a fixture after `JUDGED` and the tests. The unknown-verb test (line 119) changes its expected text to the new hint.

```ts
// A standard-route item under 0.6.0: the team, the todo, the roles working and the branch (SP7a)
const TEAMED = {
  ...JUDGED,
  branch: "main",
  primaryTeam: "backend",
  team: [
    { role: "lead-qa", team: "qa", kind: "lead", reason: "standard route" },
    { role: "review-code-quality", team: null, kind: "gate", gate: "code-quality", reason: "standard route" },
    { role: "judge", team: null, kind: "gate", reason: "standard route" },
  ],
  todo: {
    done: 1,
    total: 2,
    items: [
      { task: "T-1", criteria: ["AC-1"], state: "briefed", inline: true },
      { task: "T-2", criteria: ["AC-2"], state: "handed", inline: false },
    ],
  },
  working: [
    { agent: "review-code-quality", team: null, since: "2026-10-17T10:00:00.000Z", description: "Review the diff" },
    { agent: "judge", team: null, since: "2026-10-17T10:01:00.000Z" },
  ],
};

test("SP7a: the strip shows the todo count and the roles working, before the mail and the wait", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify({ ...TEAMED, awaiting: "role", mail: { unread: 1, answered: 0, waiting: 0 } }), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: / · todo 1\/2 · working review-code-quality, judge · mail 1 unread · waiting for the roles$/ })).toBeDefined();
  await ui.unmount();
});

test("SP7a: the panel shows the branch, the team, the todo with its checks and the roles working", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(TEAMED), stderr: "" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "crew", args: "panel" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "Branch: main" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Team (primary backend)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "lead-qa · standard route" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Todo 1/2" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "✓ T-1 · AC-1 · briefed · inline" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "○ T-2 · AC-2 · handed" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Working: review-code-quality (Review the diff), judge" })).toBeDefined();
  await ui.unmount();
});

test("SP7a: /crew todo and /crew team print the lists; an engine before 0.6.0 says it prints neither", async ($, on) => {
  let teamed = true;
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(teamed ? TEAMED : JUDGED), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const todo = await $.command.run({ command: "crew", args: "todo" });
  expect(todo.text).toBe("Crew: todo 1/2 of 2026-10-15-002-delete-accounts\n  ✓ T-1 · AC-1 · briefed · inline\n  ○ T-2 · AC-2 · handed");
  const team = await $.command.run({ command: "crew", args: "team" });
  expect(team.text).toBe("Crew: team of 2026-10-15-002-delete-accounts (primary backend): lead-qa (standard route), review-code-quality (standard route), judge (standard route)");
  const status = await $.command.run({ command: "crew", args: "status" });
  expect(status.text).toContain("  branch main");
  expect(status.text).toContain("  team: lead-qa, review-code-quality, judge (primary backend)");
  expect(status.text).toContain("  todo 1/2 · working: review-code-quality, judge");
  teamed = false;
  expect((await $.command.run({ command: "crew", args: "todo" })).text).toBe("Crew: this engine prints no todo (0.6.0 or later does)");
  expect((await $.command.run({ command: "crew", args: "team" })).text).toBe("Crew: this engine prints no team (0.6.0 or later does)");
});
```

The unknown-verb test's expected text becomes `'Crew: unknown verb; use /crew [status|panel|mail|todo|team|mode <partner|guide|pilot>]'`.

- [ ] **Step 10: Run them to see them fail**

Run: `bun run plugin:check`
Expected: FAIL on the three new tests and the unknown-verb text.

- [ ] **Step 11: The mod**

In `plugins/core/hooks/register.js`:

- `argumentHint: '[status|panel|mail|todo|team|mode <partner|guide|pilot>]'`; the verb check accepts `todo` and `team`; the unknown-verb text is the one the test pins.
- `if (verb === 'todo') { await refresh($); return { text: todoText() } }` and `if (verb === 'team') { await refresh($); return { text: teamText() } }`, before the status fallthrough.
- The helpers:

```js
// "✓ T-1 · AC-1 · briefed · inline" or "○ T-2 · AC-2 · handed"
function todoRow(t) {
  return (t.state === 'briefed' ? '✓ ' : '○ ') + t.task + ' · ' + (t.criteria || []).join(',') + ' · ' + t.state + (t.inline ? ' · inline' : '')
}

// The text /crew todo prints: the todo of the active item, or why there is none
function todoText() {
  if (error) return 'Crew: ' + error
  if (!hasWork()) return 'Crew: no active work item. A change starts with the crew skill.'
  if (!status.todo) return 'Crew: this engine prints no todo (0.6.0 or later does)'
  if (!status.todo.total) return 'Crew: no todo yet for ' + status.active + " (the plan's tasks appear here)"
  return ['Crew: todo ' + status.todo.done + '/' + status.todo.total + ' of ' + status.active, ...status.todo.items.map((t) => '  ' + todoRow(t))].join('\n')
}

// The text /crew team prints: every seat with its reason
function teamText() {
  if (error) return 'Crew: ' + error
  if (!hasWork()) return 'Crew: no active work item. A change starts with the crew skill.'
  if (!status.team) return 'Crew: this engine prints no team (0.6.0 or later does)'
  if (!status.team.length) return 'Crew: team of ' + status.active + ': no seat (fast route)'
  return 'Crew: team of ' + status.active + ' (primary ' + status.primaryTeam + '): ' + status.team.map((s) => s.role + ' (' + s.reason + ')').join(', ')
}

// " · todo 1/2" or ''
function todoPart() {
  return status.todo && status.todo.total ? ' · todo ' + status.todo.done + '/' + status.todo.total : ''
}

// " · working review-code-quality, judge" or ''
function workingPart() {
  return status.working && status.working.length ? ' · working ' + status.working.map((w) => w.agent).join(', ') : ''
}

// "review-code-quality (Review the diff), judge"
function workingNames() {
  return (status.working || []).map((w) => (w.description ? w.agent + ' (' + w.description + ')' : w.agent)).join(', ')
}
```

- `stripText()`: `... + (gates ? ' · ' + gates : '') + todoPart() + workingPart() + unread + waiting`.
- `statusText()`: after the `phase …` line, `if (status.branch) lines.push('  branch ' + status.branch)`; `if (status.team && status.team.length) lines.push('  team: ' + status.team.map((s) => s.role).join(', ') + ' (primary ' + status.primaryTeam + ')')`; `if ((status.todo && status.todo.total) || (status.working && status.working.length)) lines.push('  ' + [status.todo && status.todo.total ? 'todo ' + status.todo.done + '/' + status.todo.total : null, status.working && status.working.length ? 'working: ' + status.working.map((w) => w.agent).join(', ') : null].filter(Boolean).join(' · '))`.
- `paneTree()`: after the phases line, `if (status.branch) lines.push(Text({ dimColor: true, children: ['Branch: ' + status.branch] }))`; after the judgement rows and before the Tasks block: `if (status.team && status.team.length) { lines.push(Text({ dimColor: true, children: ['Team (primary ' + status.primaryTeam + ')'] })); for (const s of status.team) lines.push(Text({ children: [s.role + ' · ' + s.reason] })) }`; `if (status.todo && status.todo.total) { lines.push(Text({ dimColor: true, children: ['Todo ' + status.todo.done + '/' + status.todo.total] })); for (const t of status.todo.items) lines.push(Text({ children: [todoRow(t)] })) }`; `if (status.working && status.working.length) lines.push(Text({ children: ['Working: ' + workingNames()] }))`. An older engine's status has none of the fields and draws as before (the SP2c "engine before 0.5.0" test keeps passing).

- [ ] **Step 12: Run everything**

Run: `bun run check && bun run build && bun run plugin:check`
Expected: PASS (the bundle rebuilt before `plugin:check`, since the mod tests run the bundled CLI's shape through stubs only, but `claude plugin validate --strict` reads `hooks.json`).

- [ ] **Step 13: Gates and commit**

```bash
git add -A && git commit -m "SP7a: the roles working recorded by the PreToolUse hook on the Agent tool, the todo and the branch in crew status, and the mod's Team, Todo and Working views with /crew todo and /crew team" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: The rules reference, the six evals, the records and the release 0.6.0

**Files:**
- Create: `plugins/core/skills/crew/references/rules.md`; six eval cases under `plugins/core/evals/`: `team-by-route/`, `gate-scoped-to-change/`, `brief-per-todo/`, `decision-register-reread/`, `personalities-differ/`, `rounds-bounded/` (each `case.yaml`, `fixture.sh`, `prompt.md`, `graders/*.md`); `docs/evals/<run date>-sp7a-results.md`
- Modify: `plugins/core/skills/crew/SKILL.md` (the Rules row; trimmed back under 9254 bytes), `plugins/core/evals/README.md` (the six rows; `team` in the run command), `plugins/core/evals/fast-route-overhead/graders/no-role-launched.md` (new grader), `scripts/eval.ts` (the `--tag` list gains `team`), `README.md` (the 0.6.0 paragraph), `docs/real-use/README.md` (the SP7a paragraph), `docs/vision.md` (the status line), `docs/real-use/findings.md` (what the run found, from #48), the version in `package.json`, `packages/engine/package.json`, `packages/engine/src/version.ts`, `plugins/core/.claude-plugin/plugin.json`
- Test: `packages/engine/tests/skill.test.ts`, `packages/engine/tests/eval-runner.test.ts` (the tag line), `packages/engine/tests/version.test.ts`, `packages/engine/tests/cli.test.ts` (the `--version` line)

**Interfaces:**
- Consumes: everything Tasks 1 to 7 produced, as the evals exercise it through the skill: `crew team`, `crew validation record`, `crew decisions`, `crew task note|gate|brief`, the personalities' header line, the judgement round cap.
- Produces: `references/rules.md` (the twenty rules, numbered as the spec §5 numbers them, each with its enforcement point); the tag `team`; the release 0.6.0 (tag `v0.6.0`, the GitHub release, the marketplace entry `version: 0.6.0`, `ref: v0.6.0`, `metadata.version: 2.6.0`).

- [ ] **Step 1: Write the failing skill test**

In `packages/engine/tests/skill.test.ts`:

```ts
test("SP7a AC-8: the skill page has the Rules row and the twenty rules reference with their enforcement, within the 0.4.0 size", () => {
  expect(skill).toContain("| Rules | `references/rules.md` |");
  const rules = readReference("rules.md");
  expect(rules).toContain("# The twenty rules");
  for (let n = 1; n <= 20; n++) expect(rules).toMatch(new RegExp(`^${n}\\. \\*\\*`, "m"));
  expect(rules).toContain("Nothing goes to production without tests validated and concrete proof on localhost");
  expect(rules).toContain("A doubt stops the work and asks");
  expect(rules).toContain("High risk waits for a person, even in 24h mode");
  expect(rules).toContain("Deploy is a person's decision");
  expect((rules.match(/Enforced by:/g) ?? []).length).toBe(20);
  expect(Buffer.byteLength(skill, "utf8")).toBeLessThanOrEqual(9254);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `bun test packages/engine/tests/skill.test.ts -t "SP7a AC-8"`
Expected: FAIL: no Rules row, no `rules.md`.

- [ ] **Step 3: The rules reference and the Rules row**

Create `plugins/core/skills/crew/references/rules.md` (the spec's §5 table as prose; the numbers are the spec's):

```markdown
# The twenty rules

The rules the organization works under (SP7 design §5). Each says where it is enforced: the engine refuses or records, a hook denies, the skill instructs and the evals measure, or a person decides and the record says so. Where the enforcement is a later subproject, the rule still binds you now: follow it in words and say so in the report.

1. **The workflows and the hierarchy are always followed.** Nothing leaves what the ecosystem established or what the user asked. Enforced by: the phases as data with their guards, the seats planned and recorded (`crew team <id>`), the leads' validations before the plan and the delivery.
2. **Nothing goes to production without tests validated and concrete proof on localhost.** Enforced by: the e2e gate over the environment (SP7b), the deploy denial in opened sessions, rule 20.
3. **A remote test environment like production is always recommended.** Enforced by: the strategy and the deliver references say it; the report names it when absent (SP8).
4. **Never a workaround or a known security issue; never dirty, abandoned or hardcoded code.** Enforced by: the deps gate fails on a new advisory; the security seat is always planned; the code-quality rubric names dead code and magic values as defects; secrets as a gate.
5. **UI/UX validated to the extreme; the console clean of errors and warnings; the backend's logs too.** Enforced by: `console.json` and the environment's logs read by the e2e gate (SP7b); the UI/UX rubric.
6. **No verdict without evidence; never a yes-man.** Enforced by: a ruling's finding needs a file and a line; a validation needs a file and refuses a contradiction; the rubrics and the personalities.
7. **A doubt stops the work and asks.** With nobody present the question goes to the channel and the work waits. Enforced by: the Stop hook's wait (`crew await <id> user`); the questions record and the blocked status (SP3).
8. **Every decision is recorded (who, why, proof) and re-read; changing one is a new decision.** Enforced by: the item's decisions and the project's decision register (`crew decisions`), read in Understand.
9. **The project's base rules hold: architecture, data model, contracts, conventions; drift is a defect.** Enforced by: the architecture reviewer and its rubric.
10. **Process follows risk; gates dedicated to the change; bounded rounds; advisories to recorded debt.** Enforced by: the route and the seats; the gate per todo (`crew task <id> gate T-n`); `team.maxJudgementRounds`, `team.maxValidationRounds` and `team.maxGateRounds` as refusals.
11. **A fix never creates.** A regression test, preserve criteria, a full gate run on the merged tree. Enforced by: the issue kind's guards (SP3); the parent's gate run after a merge.
12. **Security is always in the flow.** A known CVE or an unmaintained dependency blocks until a person decides. Enforced by: the security seat on every route (deterministic on fast); the deps gate; the researcher's catalogue flags.
13. **Boundaries.** Mail never leaves the workspace; a client's code and data never cross workspaces; only unmarked solutions are reused. Enforced by: the workspace refusal; the knowledge base's mark and refusal (SP4).
14. **Validation hierarchy.** Tech leads validate, the CTO reviews, the judges rule; a reviewer is never re-launched for another answer; a ruling is never edited. Enforced by: the records' order, the contradiction refusal on rulings and validations, the hook's denial of edits to findings and rulings.
15. **High risk waits for a person, even in 24h mode.** Enforced by: the full route's approval is a person's; a disputed validator verdict waits (SP3).
16. **Total visibility: agents, messages, statuses, branch, sessions.** Enforced by: `crew status --json` and the mod (`/crew panel`, `/crew todo`, `/crew team`); `crew workspace status` (SP7b).
17. **Learn once.** The root cause of each issue goes to the knowledge base; the same mistake twice is the system's failure. Enforced by: the Learn phase and the gap round's refusal of a known root cause (SP4).
18. **Measure everything: tokens, time, rounds per item and per role.** Enforced by: the role records, the rounds kept, `crew metrics`.
19. **Deliverables under our brand, never the provider's artifacts.** Enforced by: the report renderer from the brand's files (SP8).
20. **Deploy is a person's decision** unless the policy says otherwise, and only with a green pipeline. Enforced by: the deploy denial in opened sessions; the policy key that may allow it names the pipeline it requires (SP7b).
```

`SKILL.md`: in "## The other routes", after the Mail row, add `| Rules | \`references/rules.md\` |`. Pay for it on the page: in the method table's Mail row, "Mail from another project of the workspace is a request" becomes "Mail from another project is a request" (the pin `inside the workspace` stays in "ask only inside the workspace"); the last line "`crew status` tells you where the work stands at any time." becomes "`crew status` says where the work stands." Check the size: `wc -c plugins/core/skills/crew/SKILL.md` ≤ 9254.

- [ ] **Step 4: Run the skill tests**

Run: `bun test packages/engine/tests/skill.test.ts`
Expected: PASS, the whole file (every earlier pin on the page holds).

- [ ] **Step 5: The six eval cases**

Each case is a folder under `plugins/core/evals/` with the same `case.yaml` shape (`tags: [team]`), a `fixture.sh` that sources the shared Node fixture and commits once, a `prompt.md` with the frontmatter the SP2c judgement cases use (`max_turns: 60`, `timeout_seconds: 1500`, `allowed_tools: [Read, Glob, Grep, Skill]`; the Agent tool needs no entry: the SP2c run launched the reviewers and the judge under this list), and the graders below. Every prompt ends with the unattended clause the SP2c run taught (#35): "I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me."

`team-by-route/case.yaml`:

```yaml
# evals/team-by-route/case.yaml
schema_version: "1.1"
name: team-by-route
tags: [team]
context:
  scaffold_script: fixture.sh
```

`team-by-route/fixture.sh`:

```sh
#!/bin/sh
# evals/team-by-route/fixture.sh: the plain Node project; the request touches one module (standard route).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: node project, green"
git log -1 --oneline
```

`team-by-route/prompt.md`: "Move the account id and email validation out of `src/accounts.mjs` into a new `src/validation.mjs` (`validId`, `validEmail`) and use them from `createAccount`; the tests keep passing and a test covers each validator. Decisions: an id is a non-empty string, an email has one `@`; no other change. I will not be here…" Graders: `team-standard.md` (`type: regex`, `target: trace`, `arm: with-only`, pattern `Team of 20\d\d-[^\n]*lead-qa[^\n]*`), `team-security.md` (pattern `Team of 20\d\d-[^\n]*lead-security`), `no-cto-no-risk.md` (pattern `Team of 20\d\d-(?![^\n]*\bcto\b)(?![^\n]*review-risk)[^\n]*judge`), `validations-recorded.md` (pattern `validation of spec by lead-qa: validated[\s\S]*validation of spec by lead-security: validated`), `validators-exist.md` (`target: { source: file, path: src/validation.mjs }`, `arm: both`, pattern `export function validEmail`), `honest-ending.md` (`type: llm`, `target: last_message`: "PASS if the ending says what the report proves, names the team that worked the item or its validations, or says plainly what is not proven; FAIL if it claims done without a report or names a role that was not launched").

`gate-scoped-to-change/fixture.sh`: a two-target workspace from the plain fixture: `apps/api/package.json` and `apps/web/package.json`, each `{ "name": "api"|"web", "private": true, "type": "module", "scripts": { "test": "node --test" } }`, `apps/api/src/accounts.mjs` and its test copied from the fixture's `src/` and `tests/`, `apps/web/src/page.mjs` (`export function title() { return "Accounts"; }`) with one test; a root `package.json` `{ "private": true, "workspaces": ["apps/*"] }`; commit. Prompt: "Add `listActiveAccounts()` to `apps/api/src/accounts.mjs` (the accounts whose `active` is true) with a test. Plan it as one todo and work it in this checkout. I will not be here…" Graders: `gate-ran-api.md` (with-only, trace, `test \(apps/api\): pass`), `todo-gated.md` (with-only, trace, `T-\d gate round 1: pass`), `web-not-run.md` (`type: llm`, `target: trace`: "PASS if the todo's gate (`crew task … gate`) reports a test run for apps/api and none for apps/web; FAIL if apps/web's tests ran in the todo gate or no todo gate ran"), `function-exists.md` (both, file `apps/api/src/accounts.mjs`, `export function listActiveAccounts`), `honest-ending.md`.

`brief-per-todo/fixture.sh`: the plain fixture committed. Prompt: "Two changes to `src/accounts.mjs`: `deactivateAccount(id)` sets `active` to false and returns the account; `listActiveAccounts()` returns the active ones. Each with a test. Work them as two todos, one after the other, in this checkout. Decisions: an unknown id returns `undefined`; no other change. I will not be here…" Graders: `brief-t1.md` (with-only, trace, `# Brief: T-1 of 20\d\d-`), `brief-t2.md` (with-only, trace, `# Brief: T-2 of 20\d\d-`), `briefs-say-changed.md` (with-only, trace, `## Changed\n- src/accounts\.mjs`), `functions-exist.md` (both, file `src/accounts.mjs`, `export function deactivateAccount[\s\S]*export function listActiveAccounts`), `honest-ending.md`.

`decision-register-reread/fixture.sh`: the plain fixture committed. Prompt: "Two requests, one after the other, each worked to its end before the next. First: when a user asks to delete their account, `deleteAccount(id)` must deactivate it, not remove it (my decision: deactivation, because of invoices). Second: add `purgeAccount(id)` that removes the account's row entirely, for the support team. I will not be here…" Graders: `register-read.md` (with-only, trace, `crew decisions`), `first-proven.md` (with-only, trace, `Proven: 20\d\d-`), `quotes-decision.md` (`type: llm`, `target: trace`: "PASS if, before building the second request, the agent quotes the first item's recorded decision (deactivation, invoices) and either asks the user whether the decision changes and waits, or records the change as a new decision in words with the reason; FAIL if the second request is built with no mention of the earlier decision"), `honest-ending.md`.

`personalities-differ/fixture.sh`: the plain fixture committed. Prompt: "Accounts need a `plan` (`free` or `pro`) and we must know when a plan changed. Choose how to store the plan and its history: one field with a changelog array on the account, a separate history table, or events; I leave it to the team's debate; build the choice with tests. I will not be here…" Graders: `conservative.md` (with-only, trace, `personality: conservative`), `creative.md` (`personality: creative`), `adventurous.md` (`personality: adventurous`), `proposals-differ.md` (`type: llm`, `target: trace`: "PASS if the three expert proposals take different positions or trade-offs (at least two distinct storage designs, or the same design argued for opposite reasons with different criteria); FAIL if they are three restatements of one design"), `honest-ending.md`.

`rounds-bounded/fixture.sh`: the plain fixture plus `.crew/policy.json` with `{ "team": { "maxJudgementRounds": 1 } }`, committed. Prompt: "Add `accountAge(id)` to `src/accounts.mjs` returning whole days since `createdAt`, with a test; use the literal `86400000` inline for the day length, do not name it. I will not be here…" Graders: `ruling-recorded.md` (with-only, trace, `crew judgement [^\n]* record`), `cap-respected.md` (`type: llm`, `target: trace`: "PASS if either the judge's first ruling was proven and the ending reports it, or the first ruling was not proven and the trace shows the engine's refusal of a second round (`judgement round 2 of … the policy allows 1`) followed by the agent ending with a question or a decision for the user (`crew continue`, or a skip the policy allows) without re-launching the reviewers; FAIL if the reviewers were re-launched after the refusal, or a second ruling was recorded"), `honest-ending.md`.

`fast-route-overhead/graders/no-role-launched.md`: `type: regex`, `target: trace`, `arm: with-only`, pattern `^(?![\s\S]*"subagent_type":\s*"wizardingcode-developer-crew:)`: a fast item launches no role, so the overhead case keeps measuring the method's floor.

`plugins/core/evals/README.md`: six rows in the Cases table (Case, Proves, Graders, in the style of the existing rows) and `team` added to the `--tag` list in the run command; `scripts/eval.ts`: `team` added to the tag list at the `--tag` argument; `packages/engine/tests/eval-runner.test.ts` line 94: the pinned string gains ` team`. Run: `bun test packages/engine/tests/eval-runner.test.ts` → PASS after the change.

- [ ] **Step 6: Validate the cases and run one**

Run: `claude plugin validate plugins/core --strict` (the eval directory is read); then `bun scripts/eval.ts --case team-by-route`
Expected: the validate passes; the single case runs end to end with the plugin arm; read `plugins/core/evals/results/last.json` and fix a prompt or a grader that failed for a reason of its own (a defect of the case, not of the method), as #35 and #38 were fixed in SP2c. Nothing of the engine or the skill changes for a grader.

- [ ] **Step 7: Run the suite and record it**

Run: `bun scripts/eval.ts` (about 25 USD with the six new cases, three runs, two arms; 20 to 30 minutes), in the background, with the output to a file in the scratchpad.
Expected: `plugins/core/evals/results/last.json` and `results/<timestamp>/aggregate-result.json`. Copy the aggregate to `docs/evals/<run date>-sp7a-aggregate-result.json` and write `docs/evals/<run date>-sp7a-results.md` in the shape of `docs/evals/2026-10-17-sp2c-results.md`: the header bullets (Claude Code version, models, cases × runs × arms, cost, duration, `partial`), the command, the bundle's commit, the scoring note; the table Case | With | Without | Δ | Notes with one row per case (the twenty); the fast-route overhead paragraph with the ratio against 2.03× (the SP7a acceptance: not above it); what the run found, each as a finding in `docs/real-use/findings.md` from #48 with its category, fixed in this item only where a grader or a prompt is wrong, otherwise recorded as debt.

- [ ] **Step 8: The README, the real-use README and the vision**

`README.md`: a new paragraph before the 0.5.0 one: "Release 0.6.0 (<date>) is SP7a, the team and the tech lead ([design](docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md), [plan](docs/plans/2026-10-17-sp7a-teams-and-tech-lead.md), [ADR 0007](docs/adr/0007-teams-first-roadmap-re-cut.md)). The engine has a registry of nine teams and plans every seat of an item from its route, its risk areas and its paths before anything runs (`crew team <id>`): nothing on the fast route; tech leads, researcher, QA, security and the judge on standard; everything on full. Three reviewers join (architecture, data, infra) and five personalities give the debate's experts different lenses, recorded in the evidence. A tech lead per mandatory team validates the spec before the plan and the delivery before the report, with returns tied to a file and a line (`crew validation <id> record`); a contradiction is refused, a changed spec makes a validation stale. Rounds are bounded by the policy's `team` block and refused past the cap: two judgement rounds, two validation rounds, two gate rounds per todo, one more only by the user (`crew continue`). Each todo of the plan ends with its own gate on the files it touched (`crew task <id> gate T-n`, the test command narrowed where the profile knows how) and a brief (`crew task <id> brief T-n`). Every decision of a project lands in `.crew/decisions.json` and is read in Understand (`crew decisions`). `crew metrics` counts items, rounds, tokens per role and personality, defects per reviewer and minutes per phase; `crew cto record` files the CTO's plan per workspace. The mod shows the team, the todo with its checks, the roles working and the branch (`/crew todo`, `/crew team`). Six eval cases join the suite under the `team` tag, recorded in [`docs/evals/<run date>-sp7a-results.md`](docs/evals/<run date>-sp7a-results.md)."

`docs/real-use/README.md`: after the SP2c subsection, "### SP7a in real use (0.6.0, from the restart)": the three workspaces (two clients and the brand's own, unnamed here), ten items across the routes, what to record per item (the seats printed against the seats that ran; each lead's verdict and whether a return was right; the rounds; the todo gates' time against the item's gate run; the overhead on fast items against 2.03×; the cost per item from `crew metrics`), the exit (ADR 0007 §6: 0.7.0 after this phase, 1.0 after 0.7.0's).

`docs/vision.md`: the status line reads 0.6.0 released, SP7a done, SP7b next.

- [ ] **Step 9: The version and the checks, once**

The version `0.6.0` in `package.json`, `packages/engine/package.json`, `packages/engine/src/version.ts`, `plugins/core/.claude-plugin/plugin.json`; the two tests: `version.test.ts` (`"0.6.0"`) and `cli.test.ts` (`expect((await c.run("--version")).out.trim()).toBe("0.6.0")`). Then, once, in this order:

```bash
bun run build && bun run check && bun run plugin:check
```

Expected: PASS. A test that times out under load is re-run alone before anything is concluded (#47); a red stays red until fixed, never a release over it.

- [ ] **Step 10: Gates, commit, tag, release, marketplace**

The item's gate run, the reviewers and the judge, `crew judgement record`; then:

```bash
git add -A && git commit -m "0.6.0: the team registry and the seats per route, the tech lead's validations, the three reviewers and the personalities, the gate per todo and the brief, the decision register, crew metrics, the mod's team and todo, the rules reference, six evals" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git tag -a v0.6.0 -m "0.6.0" && git push && git push origin v0.6.0
GH_TOKEN=$(gh auth token -u andreagroferreira) gh release create v0.6.0 --title "0.6.0" --notes-file <scratchpad>/release-0.6.0.md
```

The notes file holds the README paragraph. Then the marketplace entry (`WizardingCode-io/wizardingcode-plugins`, `.claude-plugin/marketplace.json`): the entry's `version` to `0.6.0`, its `source.ref` to `v0.6.0`, `metadata.version` to `2.6.0`, written through the GitHub contents API with the same token, as 0.5.0 and 0.5.1 were (there is no local clone): `gh api repos/WizardingCode-io/wizardingcode-plugins/contents/.claude-plugin/marketplace.json` for the file and its `sha`, the edited JSON base64-encoded in a `PUT` to the same path with `message` `wizardingcode-developer-crew 0.6.0` and that `sha`. The plugin updates on the next `claude plugin update` and takes effect after the user restarts Claude Code: say the restart is needed and why; never ask the user to run a command.

---

## After the last task

- `bun run check && bun run plugin:check` green on `main`, everything pushed, the marketplace at `v0.6.0`, the user restarts Claude Code.
- The real use of SP7a starts (`docs/real-use/README.md`, the SP7a paragraph): three workspaces, ten items across the routes, the seats and the validations read against what ran, the overhead on fast items against 2.03×, the cost per item. What gets in the way is a finding from #48; nothing is fixed per finding, one release at the close (0.6.x only for a `blocks` or `false-proof` finding, as ADR 0004 allows).
- The SP7b plan (`docs/plans/<date>-sp7b-environment-priorities-visibility.md`) is written from the design's §8.2, §8.3, §9 and §14 once the real use has ten items or two weeks, whichever comes first; it carries the debt this plan deferred: the per-todo judgement gates (decision 5), the CTO's seat on full items (decision 9), the e2e gate and the console check, priorities and statuses on mail, threads with contracts and evidence, `crew workspace status`.
- The skills the user brings from other repositories are folded in only with proof (SP6): a claim measured by an eval before any line enters an agent; until then they are read, not copied.
