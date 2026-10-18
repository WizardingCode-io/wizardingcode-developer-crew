# SP7b: Environment, priorities and visibility. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session, through the crew method (each task is a crew work item in this repository, as SP7a was). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Written on 2026-10-18**, from the SP7 design (`docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md`, §7.1 priority, §8.2, §8.3, §9, §14, §15, §16) and ADR 0008: SP7b is built right after 0.6.0, with no real-use phase between, and ships as 0.7.0. It carries the debt SP7a deferred (its plan's decisions 5 and 9, findings #50, #55, #57, #59).

**Goal:** QA proves on a localhost environment the engine starts, checks and stops, with the browser's console and the backend's logs read as a measurement; requests carry a priority the receiving lead confirms or lowers with a reason, and a status the engine moves; threads join parties and a reply carries contracts the engine checked and evidence it read; a todo's judgement gates run on its own diff; the round caps carry a grant the user signs once; the user sees the workspace's sessions, threads and environments in the CLI and the mod.

**Architecture:** No model runs inside the engine. The environment is a block of the profile (detected, proposed, confirmed like a gate command) that `crew env` and the `e2e` gate drive through `runCommand`, with the process the engine started recorded in the local state (`.crew/local/env.json`, never committed). The `e2e` gate is a `GateName` like the others, planned from the changed paths, with its artifacts under `review/e2e/` and the console file graded as data. Priorities, statuses, threads and contracts are fields of `Message` written only by the mail commands, with the old statuses mapped on read and never rewritten. The per-todo judgement reuses `writeReviewInputs` and `recordJudgement` under `review/T-n/`. The workspace view is a command (`crew workspace status`) the mod renders; nothing the pane shows exists only in the pane.

**Tech Stack:** TypeScript (dependency-free engine, Bun for tests, Biome), Node 20+ at run time, the mods API of `plugins/core/hooks/register.js`, `claude plugin eval` for the four cases. Playwright is the project's own dependency; the plugin ships one ES module the project may import.

**Spec:** the SP7 design, sections named above. The rules the engine enforces in this release: 5 (the console and the logs clean, as a measurement), 11's second half (the full gate run on the merged tree after a todo's judgement), 15 (a blocker lowered only with a reason, by the lead, on record).

**Decisions taken while writing this plan** (each a reading of the spec where it left a detail open; the leads may return any):

1. **Statuses are added, never rewritten.** `MailStatus` gains `accepted`, `in-progress`, `blocked`, `done`; the old literals stay in the type for the records on disk, and `mailStatus(m)` maps them on read (`answered` → `done`, `waiting-for-person` → `blocked`, `stopped` → `refused`). Every place that counts or prints a status reads through it; writes use the new names only.
2. **A priority is the sender's proposal until the receiving lead confirms or lowers it.** `--priority` on `crew mail send` (default `normal`; a `blocker` type proposes `blocker`); `crew mail accept <mid> [--priority <p>] --reason "<why>"` by the receiver confirms (same level) or lowers (a reason is mandatory), never raises; the record is `{ proposed, confirmed, by, reason, at }`. `accept` is for the kinds the receiver takes on as work (change-request, blocker): it moves `read` → `accepted`. A question is `done` at its reply; a notice is `done` when read.
3. **The transitions the engine enforces:** `sent` → `read` by `mail read`; `read` → `accepted` | `refused` by the lead; `accepted` → `in-progress` when an item starts with `--origin`; `in-progress` → `blocked` when that item's turn ends waiting (`crew await`) or a question is recorded; `blocked` → `in-progress` at `crew resume`; `in-progress` → `done` only by a reply whose child verdict is `proven`; an unproven reply lands as `blocked` naming the unproven reasons; `expired` and `refused` are final. A transition the table does not hold is refused naming the two states.
4. **The item's priority** is `WorkItem.priority` (`blocker | high | normal | low`): from `crew start --priority <p>`, else from the origin message's confirmed priority, else `normal`; the typed question `priority` of §7.1 is the same value given in `--answers`. `crew status` prints it after the route and `--json` gains `priority`.
5. **A thread is its root's id.** A reply inherits `thread` from the message it answers (the root's own id when the root has none); `crew mail send --thread <root> --to <project>` adds a party, with the root's subject quoted; parties are the distinct projects and tasks (`T-n`) of a thread's messages, never roles (`--agent <role>` with `--thread` is refused); `mail.maxParties` is 4 and only tightens (2 to 4); `crew mail thread <id>` prints the messages this project's boxes hold for the thread, oldest first, each with its status and priority.
6. **Contracts are checked at the reply's branch tip, from the replying project.** `crew mail reply <mid> … --contract <kind>:<path>[:<summary>]` (repeatable; kinds `openapi`, `types`, `schema`, `clause`): the path must exist at the branch's tip (`git show <branch>:<path>`), its sha256 is recorded; an `openapi` or `schema` file must parse when it is JSON, or be non-empty with an `openapi:`, `swagger:` or `$schema` line when it is not; a `types` file must be in the child's diff against the parent branch; a `clause` names no path and needs a `## Contracts` section in the body. One failed check refuses the reply naming the contract. The reply gains `evidence { report, fingerprint, gatesPassed }` read from the child's `evidence.json` (never typed). The requesting item's brief lists the contracts received; `crew criteria <id> add "<text>" --contract <mid>:<n>` binds a criterion to one.
7. **The environment is a block of the profile with a source.** `Profile.environment?: { start: GateCommand; health: GateCommand; stop?: GateCommand; logs?: string; url?: string; timeoutMs: number }`, where `GateCommand.source` says detected, proposed or confirmed. Detection proposes: a compose file (`docker compose up -d` / `docker compose down`, health `curl -fsS http://localhost:<first published port>/`); a Laravel application (`artisan`: `php artisan serve --port 8000`, health `curl -fsS http://127.0.0.1:8000/`); a Makefile with a `start`, `serve` or `dev` target; a `package.json` with a `dev` or `start` script (health `curl -fsS http://localhost:3000/`). Everything proposed is confirmed by `crew profile set environment.start "<cmd>"` (and `.health`, `.stop`, `.logs`, `.url`, `.timeout`) or `crew profile confirm environment`, user-only. Without `stop`, the engine ends the process group it started.
8. **`crew env start | health | stop | status`** drive it outside a gate: `start` runs the command detached in its own process group with its log under the local state's `env/` folder, and records `{ pid, startedAt, managed: true, log, command }` in the local `env.json`; `health` runs the health command (exit 0 is up); `stop` runs the stop command or ends the group; `status` prints up or down and who started it. A `health` that passes before `start` is the user's environment: `managed: false`, never stopped by the engine.
9. **The `e2e` gate is a `GateName`.** `Target.gates.e2e` is detected from `playwright.config.*` (`npx playwright test`) or `cypress.config.*` (`npx cypress run`) as proposed, or set with `crew profile set e2e "<cmd>"`. It is planned when the change touches interface or public-api paths, or the policy's `requiredGates` lists it. Planned with no environment in the profile: the run is `unavailable` with the reason `no environment in the profile (crew profile set environment.start …)`, and the item stays not proven until the user decides. The default `allowSkips` gains `e2e`, so that decision can be a recorded skip (`crew skip <id> gate:e2e --reason …`) in a project that has no environment to give; the report names it like every skip.
10. **The e2e run's choreography:** health first (up: `managed: false`); else start and poll health every two seconds until `timeoutMs` (default 120 000; past it `unavailable: the environment did not answer health in <s> s`); run the e2e command with `WIZARDINGCODE_CREW_E2E_DIR=<work>/review/e2e` and `WIZARDINGCODE_CREW_CONSOLE_FILE=<work>/review/e2e/console.json` in its environment; stop when managed. `GateRun.artifacts?: { dir: string; console: string | null; logs: string | null }`. Each of start, health, e2e and stop has its own log under `logs/`.
11. **The console and the logs are graded as data.** `console.json` is an array of `{ page, type, text, at }`; zero entries of type `error` or `warning` passes; otherwise the gate fails naming the first. A run that wrote no console file passes on its exit code and its tail says `console: not captured`; the item's UI/UX judgement is then not answerable (decision 13). `environment.logs` names a file the engine reads from the offset it had when the run started, or a command whose output is read after the run; a line that starts with, or whose level field is, `error`, `warn` or `warning` (case-insensitive) fails the gate naming the first.
12. **The plugin ships `plugins/core/e2e/playwright.mjs`:** `test` and `expect` from the project's own `@playwright/test` (resolved from the cwd with `createRequire`), `test` extended with an automatic fixture that records every `console` and `pageerror` event of every page into the file `WIZARDINGCODE_CREW_CONSOLE_FILE` names (one JSON array, built from lines appended during the run and folded at its end). A project imports `test` from it; one without it writes the file itself or has no console measurement. The gate reference says so.
13. **A capture without a console file is not answerable.** `review/ui/<page>-<state>.png` (or `.jpg`) taken by the session with Claude in Chrome needs `review/ui/console-<page>-<state>.json` beside it, saved from the console tool; `writeReviewInputs` lists the captures and marks the ones without a console file; the UI/UX rubric says a capture without it cannot answer the criterion, and the judge rules `not-run` with that reason, never `proven`.
14. **A todo's judgement gates run on the todo's scope.** `crew task <id> gate T-n` plans, after the deterministic gates pass, the judgement gates the scope asks for: `ui-ux` when it holds interface paths, `security` when it raises a risk area; `plannedSeats` gets a `scope` argument so the reasons stay the registry's. The inputs go under `review/T-n/`; `crew judgement <id> record --task T-n --ruling <file>` records into `TaskRecord.gate.judgement[]`; the state `gated` needs the deterministic pass and every planned judgement `proven`; `team.maxGateRounds` counts the judgement rounds of a todo with its gate rounds. The item's final gate run plans the item's gates as today (rule 11).
15. **The standing grant is `team.continuations: ask | granted`**, default `ask`, set by `crew policy set team.continuations granted` (asked, user-only, recorded in the decision register). Under `granted` the recording commands accept rounds past a cap up to the cap plus two, each recorded in `work.continued` as the user's with `standing: true`; past that ceiling they refuse as today and name `crew continue`. The second loosening a policy may carry, after `riskPathExclusions`, stated in the rules reference.
16. **The review folder is engine-owned** (finding #59): `review/*.findings.md`, `review/*.round*.md`, `review/ruling*.json`, the inputs the engine writes, and the same under `review/T-n/`; `review/ui/` and `review/e2e/` stay writable by the session (captures) and the e2e run. `isProtectedPath` says which.
17. **`crew workspace status [--json]`** reads the registry's projects of this workspace: live (`isLive`), open items (a `work.json` whose phase is not `deliver` or whose evidence is unproven), unread mail, open threads (a thread with a message not `done`, `refused` or `expired`), unconfirmed priorities (a proposal with no decision), the environment (the project's local `env.json`: up, down or none; no probe). It never runs a project's commands.
18. **The mod** adds the priority to the strip, `Mail` as threads with read and unread counts, `Workspace` (sessions per project) and the verbs `/crew workspace`, `/crew thread <id>`, `/crew brief T-n`; all from `crew status --json`, `crew workspace status --json`, `crew mail thread --json` and the brief file. The desktop verification is done against the mods documentation before anything is promised; what holds is recorded in the plan's execution notes and the README says only that.
19. **The evals** are the four of §15, with `env-observed-proof` on a socketless environment (start touches a flag file, health tests it, stop removes it, the e2e command is a node script that writes `console.json` with no error), so finding #37's port denial does not apply; `fast-route-overhead` is the guard. They run with `--case`; the whole suite runs once before the real-use phase (ADR 0008).
20. **One release, 0.7.0, at the close**, with the README paragraph, the vision's status line, the real-use README's note that the phase now starts after 0.11.0, the tag, the GitHub release and the marketplace entry; no version bump before Task 7.
21. **A here-document is data unless a shell reads it** (finding #67, found while writing this plan): the PreToolUse hook's text rules read a here-document's lines as commands only when the command that reads it is an interpreter (`sh`, `bash`, `zsh`, `node`, `python`, `eval`, `source`); a body fed to `cat`, `tee` or a file is data. Taken in Task 5 with the other hardening.

## Global Constraints

- Every task is a crew work item in this repository: `crew start "<request>" --answers '<json>' --criterion "…" --preserve "…"`, the failing test and `crew tdd red` before the code, `crew tdd green`, `crew tdd before`/`after` for a preserve criterion, one `crew gate run <id>`, the judgement gates (standard route: code-quality and test-quality; the user's rule: at most two rounds, the second scoped to the first's defects, advisories to `docs/real-use/findings.md`), `crew judgement record`, the leads' validations of the spec and of the delivery, commit on `main`, push after each task.
- The `crew` on PATH is the installed plugin, **0.6.0**, for the whole of SP7b; the new commands and hooks are exercised by the tests and by `node plugins/core/dist/crew.mjs …` after `bun run build`, never by this repository's own items until 0.7.0 is installed. Where a hook of the working tree would have recorded something the installed one does not, the record says so.
- `bun run check` green before every commit; `bun run format` fixes lint. Tasks that touch `plugins/core` (4, 6, 7) also run `bun run plugin:check`. `bun run build` after every engine change (the bundle is committed).
- The engine has no runtime dependency; imports carry an explicit `.ts`; engine-owned files are written through `writeProtectedJson`/`writeProtectedText`; the hooks fail open (`{}` on any exception); nothing the engine starts outlives a command without a record in the local `env.json`.
- **A policy can only tighten**, with the two loosenings named (`riskPathExclusions`, `team.continuations`), both user-only and on record.
- **The fast route launches no role and its cost does not rise**: no new agent file; the e2e gate is planned from paths, so a fast item without interface changes does not run it; `SKILL.md` stays at or under 9254 bytes.
- The round caps: the user's standing yes of 2026-10-17 covers every `crew continue` of this plan until Task 5 lands the grant; each is recorded as the user's, relayed.
- Naming: `wizardingcode-developer-crew:<agent>`; variables `WIZARDINGCODE_CREW_*`; data under the user's crew directory; files in English; no client project name in the repository.
- No version bump before Task 7. One release, 0.7.0, at the close.

## Review Focus

Six input classes the spec implies and no task's tests would otherwise exercise; each line names the task that owns the test.

1. **A lead that raises a priority** (`crew mail accept m-1 --priority blocker` on a message proposed `high`): refused, nothing recorded, the refusal names the proposal and says the lead confirms or lowers. Test in Task 1.
2. **A reply that says proven while the child's evidence is unproven**: the reply lands as `blocked` with the unproven reasons, `verdict: unproven`, and the thread's status shows it; the `done` transition never happens on a typed word. Test in Task 1.
3. **A contract whose file exists on the worktree but not at the branch's tip** (uncommitted): refused naming the path and the branch; nothing sent. Test in Task 2.
4. **A health command that passes before `start`**: `managed: false`, the engine never runs `stop`, the gate's tail says `environment: the user's`. Test in Task 3 and the gate's in Task 4.
5. **A console file with one `warning` entry and a passing e2e exit code**: the gate fails naming the entry's page and text; the exit code alone never passes. Test in Task 4.
6. **A third gate round of a todo under `team.continuations: granted`**: accepted and recorded `standing: true`; the fifth is refused naming `crew continue`. Test in Task 5.

Three more, cheaper, folded into their tasks: a thread's fifth party refused naming `mail.maxParties` (Task 2); `crew env stop` with no record says nothing was started by the engine (Task 3); `crew workspace status` with no workspace in the policy says so and exits 0 (Task 6).

---

### Task 1: Priorities and statuses on mail, and the item's priority

**Files:**
- Modify: `packages/engine/src/types.ts` (`MailPriority`, `MAIL_PRIORITIES`, `Message.priority`, `Message.priorityDecision`, `MailStatus` + the new literals, `WorkItem.priority`), `packages/engine/src/mail.ts` (`mailStatus()`, `SendRequest.priority`, `send` sets the proposal, `inboxSummary` orders by priority then age and counts through `mailStatus`, `acceptMail()`, the transition table `MAIL_TRANSITIONS` and `transition()`, `reply` lands `done` or `blocked`), `packages/engine/src/work.ts` (`createWork` takes the priority), `packages/engine/src/cli.ts` (`mail send --priority`, `mail accept`, `mail inbox` order, `start --priority`, status text and JSON), `packages/engine/src/hooks/stop.ts` (a blocker's interrupt reads through `mailStatus`), `packages/engine/src/evidence.ts` (the report's Mail table shows priority and status), `plugins/core/skills/crew/references/mail.md`, `receive.md` (the priority at Receive)
- Test: `packages/engine/tests/mail.test.ts`, `cli.test.ts`, `hooks-stop.test.ts`, `work.test.ts`

**Interfaces:**
- `type MailPriority = "blocker" | "high" | "normal" | "low"`; `MAIL_PRIORITIES` in that order; `isMailPriority()`.
- `Message.priority: MailPriority` (absent on old records: read as `normal`, `blocker` for a blocker type); `Message.priorityDecision?: { proposed: MailPriority; confirmed: MailPriority; by: string; reason: string | null; at: string }`.
- `mailStatus(m: Message): "sent" | "read" | "accepted" | "in-progress" | "blocked" | "done" | "refused" | "expired"`.
- `acceptMail(ctx, id, options: { priority?: MailPriority; reason?: string; by: string }, notes) → { message } | { refused }`.
- `transition(m, to) → Message | { refused: string }`, the table as decision 3.
- `WorkItem.priority?: MailPriority`; `crew start --priority <p>`; `crew status --json` gains `priority`.
- `crew mail send … --priority <p>`; `crew mail accept <mid> [--priority <p>] --reason "<why>"`; `crew mail inbox` ordered by priority then age, each line `[<priority>] <status>`.

- [ ] **Step 1: Write the failing tests** (`mail.test.ts`: the status map on the three old literals; the inbox order; `acceptMail` confirms, lowers with a reason, refuses a raise and refuses a lowering without a reason; the transition table refuses `sent → done`; a reply with an unproven child lands `blocked`. `cli.test.ts`: `crew mail send --priority`, `crew mail accept`, `crew start --priority`, the status line and JSON. `hooks-stop.test.ts`: a blocker recorded under the old `sent` status still interrupts.)
- [ ] **Step 2: `crew tdd red` for each criterion**, then the types, `mailStatus`, the table, `acceptMail`, the CLI, the report; `crew tdd green`.
- [ ] **Step 3: The references** (`mail.md`: the priority proposed, confirmed or lowered; the statuses; `receive.md`: the lead confirms the priority at Receive, against the workspace's priorities when SP3 brings them).
- [ ] **Step 4: Build, gate run, judgement, validations, commit.**

**Acceptance criteria:** AC-1 a message carries the sender's proposal and the receiver's decision, with a lowering's reason; AC-2 the inbox is ordered by priority then age; AC-3 the statuses are the seven plus `expired`, old records read mapped and are never rewritten; AC-4 a reply moves a change request to `done` only with a proven child, else `blocked` with the reasons; AC-5 an item has a priority shown by `crew status`; preserve: the SP2c mail tests stay green.

---

### Task 2: Threads, contracts and the evidence in a reply

**Files:**
- Modify: `packages/engine/src/types.ts` (`Message.thread`, `Message.contracts`, `Message.evidence`, `Criterion.contract`, `MailPolicy.maxParties`), `packages/engine/src/policy.ts` (`mail.maxParties`, range 2 to 4), `packages/engine/src/mail.ts` (`threadOf()`, `threadParties()`, `send --thread`, `reply --contract`, `checkContracts()`, `readChildEvidence()`), `packages/engine/src/tasks.ts` (`writeBrief` lists the contracts received), `packages/engine/src/work.ts` (`addCriterion` with a contract), `packages/engine/src/cli.ts` (`mail send --thread`, `mail reply --contract`, `mail thread <id>`, `criteria add --contract`), `packages/engine/src/evidence.ts` (the report's Mail table shows the thread and the contracts), `plugins/core/skills/crew/references/mail.md`
- Test: `mail.test.ts`, `tasks.test.ts`, `cli.test.ts`, `policy-config-state.test.ts`

**Interfaces:**
- `Message.thread?: string` (the root's id); `Message.contracts?: { kind: "openapi" | "types" | "schema" | "clause"; path: string | null; hash: string | null; summary: string }[]`; `Message.evidence?: { report: string; fingerprint: string | null; gatesPassed: GateName[] }`.
- `crew mail send --thread <root> --to <project> "<text>"`; `crew mail reply <mid> "<text>" --branch <b> --item <child> --contract <kind>:<path>[:<summary>]` (repeatable); `crew mail thread <id> [--json]`; `crew criteria <id> add "<text>" --contract <mid>:<n>`.
- `checkContracts(root, branch, base, contracts, body) → { ok: Contract[] } | { refused: string }`.

- [ ] **Step 1: Failing tests** (a reply inherits the thread; a send with `--thread` adds a party and quotes the subject; the fifth party refused naming `mail.maxParties`; `--agent <role>` with `--thread` refused; `crew mail thread` prints oldest first; each contract kind's check, the uncommitted file refused, the `types` file outside the diff refused, the clause without a `## Contracts` section refused; the reply's evidence read from the child's `evidence.json` and refused when the child has none; the brief lists the contracts; the criterion binds one.)
- [ ] **Step 2: Red, code, green; the reference; build, gate, judgement, validations, commit.**

**Acceptance criteria:** AC-1 a thread joins up to four parties and is printed in order; AC-2 a contract is checked at the branch's tip and a failing check refuses the reply; AC-3 a reply carries the child's evidence read from disk; AC-4 the requesting item's brief lists the contracts and a criterion can bind one; preserve: the SP2c task tests stay green.

---

### Task 3: The environment in the profile and `crew env`

**Files:**
- Create: `packages/engine/src/environment.ts` (`detectEnvironment(root)`, `envStatePath`, `startEnvironment`, `checkHealth`, `stopEnvironment`, `envStatus`), `packages/engine/src/detect/environment.ts`
- Modify: `packages/engine/src/types.ts` (`Environment`, `Profile.environment`), `packages/engine/src/detect/index.ts` (`detectProfile` fills `environment`, `mergeProfile` keeps a confirmed one, `profileChanges` names it), `packages/engine/src/cli.ts` (`profile set environment.<key>`, `profile confirm environment`, `env start|health|stop|status`), `packages/engine/src/paths.ts` (the local state's `env/` folder), `plugins/core/skills/crew/references/gate.md` (the environment), `README.md` (one paragraph: what the engine detects, what the user confirms)
- Test: `packages/engine/tests/environment.test.ts` (new), `detect-profile.test.ts`, `cli.test.ts`

**Interfaces:**
- `interface Environment { start: GateCommand; health: GateCommand; stop?: GateCommand; logs?: string; url?: string; timeoutMs: number }`; `Profile.environment?: Environment`.
- `detectEnvironment(root): Environment | null` (decision 7); `startEnvironment(paths, env) → { pid, log, managed }`; `checkHealth(paths, env) → { up: boolean; exit; tail }`; `stopEnvironment(paths, env) → { stopped: boolean; reason? }`; `envStatus(paths) → { state: "up" | "down" | "none"; managed: boolean | null; pid; since }`.
- The local `env.json`: `{ pid, startedAt, managed, log, command }`.

- [ ] **Step 1: Failing tests** (detection on four fixtures: compose, artisan, Makefile, package.json; `mergeProfile` keeps a confirmed environment over a new proposal; `profile set environment.start` writes `confirmed`; `start` on a fixture script that writes a flag file, `health` with `test -f`, `stop` removes it and the record; health passing before start gives `managed: false` and `stop` refuses to end it; `env stop` with no record says nothing was started; a `timeoutMs` set below 1 000 refused.)
- [ ] **Step 2: Red, code, green; the reference and the README; build, gate, judgement, validations, commit.**

**Acceptance criteria:** AC-1 the profile carries an environment with a source per command, detected where declared and otherwise proposed; AC-2 `crew env` starts, checks and stops it with a record of what the engine started; AC-3 an environment already up is the user's and is never stopped; preserve: the detection tests stay green.

---

### Task 4: The e2e gate, the console and the logs

**Files:**
- Create: `plugins/core/e2e/playwright.mjs`, `packages/engine/src/console.ts` (`gradeConsole(file)`, `gradeLogs(text)`)
- Modify: `packages/engine/src/types.ts` (`GateName` + `e2e`, `GATE_NAMES`, `GateRun.artifacts`, `Policy.allowSkips` default), `packages/engine/src/detect/node.ts`, `detect/scripts.ts` (the e2e command proposed), `packages/engine/src/gates.ts` (`gatesForTarget` plans `e2e`; `runOne` for `e2e`: the choreography of decision 10; `runTaskGate` excludes `e2e` unless the scope asks), `packages/engine/src/judgement.ts` (`writeReviewInputs` lists the captures and the console files), `packages/engine/src/evidence.ts` (the report names the artifacts and the console verdict), `packages/engine/src/policy.ts` (`allowSkips` default), `plugins/core/skills/crew/rubrics/ui-ux.md`, `plugins/core/skills/crew/references/gate.md`, `plugins/core/skills/crew/references/rules.md` (rule 5's enforcement line)
- Test: `gates.test.ts`, `console.test.ts` (new), `judgement.test.ts`, `detect-node.test.ts`, `cli.test.ts`

**Interfaces:**
- `GateName` gains `"e2e"`; `GateRun.artifacts?: { dir: string; console: string | null; logs: string | null }`.
- `gradeConsole(file) → { status: "pass" | "fail" | "none"; first?: { page; type; text }; counts }`; `gradeLogs(text) → { status; first? }`.
- The e2e run's environment variables: `WIZARDINGCODE_CREW_E2E_DIR`, `WIZARDINGCODE_CREW_CONSOLE_FILE`.
- `plugins/core/e2e/playwright.mjs` exports `test`, `expect`.

- [ ] **Step 1: Failing tests** (`e2e` planned on an interface change with an environment, not planned on a backend change, `unavailable` with the reason when planned without an environment; the choreography on a socketless fixture: start, health polled, the e2e command run with the two variables, stop when managed, never when the user's; a console file with one warning fails naming it; no console file passes with `console: not captured`; a logs file with an `ERROR` line written during the run fails; `writeReviewInputs` marks a capture without its console file; the skip of `gate:e2e` allowed by default; the Playwright module's fixture writes entries given a fake `page` emitter.)
- [ ] **Step 2: Red, code, green; the rubric and the references; build, `plugin:check`, gate, judgement, validations, commit.**

**Acceptance criteria:** AC-1 an interface or public-api change plans the e2e gate and, with an environment, the run holds the four logs and the artifacts; AC-2 without an environment the gate is unavailable with the reason and the item stays not proven until the user decides; AC-3 the console and the logs are graded as data and a warning fails the gate naming it; AC-4 a UI capture without its console file is not answerable; preserve: the gate tests stay green and the fast route plans no e2e gate.

---

### Task 5: The per-todo judgement gates, the standing grant and the hardening debt

**Files:**
- Modify: `packages/engine/src/team.ts` (`plannedSeats` with a `scope`), `packages/engine/src/gates.ts` (`runTaskGate` returns the planned judgement), `packages/engine/src/judgement.ts` (`reviewDir` with a task, `writeReviewInputs` for a todo), `packages/engine/src/tasks.ts` (`TaskRecord.gate.judgement`, the `gated` state's rule), `packages/engine/src/cli.ts` (`task gate` plans and prints the judgement, `judgement record --task T-n`, `continue` under the grant), `packages/engine/src/types.ts` (`TeamPolicy.continuations`, `WorkItem.continued[].standing`, `TaskRecord.gate.judgement`), `packages/engine/src/policy.ts` (`team.continuations`), `packages/engine/src/paths.ts` (decision 16), `packages/engine/src/hooks/pre-tool-use.ts` and `hooks/shell.ts` (the review folder's denial; here-documents as data, decision 21), `packages/engine/tests/*` (#50: the client's name out; #55: the lock test), `plugins/core/skills/crew/references/plan.md` (the todo loop's judgement), `rules.md` (the grant named as the second loosening), `docs/real-use/findings.md` (outcomes of #50, #55, #57, #59, #67)
- Test: `team.test.ts`, `tasks.test.ts`, `judgement.test.ts`, `cli.test.ts`, `policy-config-state.test.ts`, `hooks-pre-tool-use.test.ts`, `shell.test.ts`, `paths.test.ts`

- [ ] **Step 1: Failing tests** (a todo whose scope holds a `.vue` file plans `ui-ux`, a scope under `src/auth/` plans `security`, a backend scope plans none; `judgement record --task` writes into the todo's record and `gated` waits for it; the third gate round under `granted` accepted with `standing: true`, the fifth refused; `team.continuations` settable and asked; a Write to `review/code-quality.findings.md` denied by the hook, a Write to `review/ui/home-empty.png` allowed; a `cat > docs/x.md <<'EOF'` whose body names a protected path allowed, a `sh <<'EOF'` whose body writes one denied; the lock test's cause fixed and the test deterministic; no client name in the tests.)
- [ ] **Step 2: Red, code, green; the references; build, gate, judgement, validations, commit.**

**Acceptance criteria:** AC-1 a todo's gate plans and records the judgement gates its scope asks for and `gated` waits for them; AC-2 the grant accepts rounds up to the cap plus two and refuses past it; AC-3 the engine's review files are denied to the session, the captures are not, and a here-document is data unless a shell reads it; AC-4 findings #50 and #55 closed with their tests; preserve: the SP7a tests stay green.

---

### Task 6: Visibility: the workspace status, the status fields and the mod

**Files:**
- Create: `packages/engine/src/workspace.ts` (`workspaceStatus(ctx)`)
- Modify: `packages/engine/src/cli.ts` (`workspace status [--json]`, `status --json` gains `threads`, `priority`, `environment`), `plugins/core/hooks/register.js` (the strip's priority, `Mail` as threads, `Workspace`, `/crew workspace`, `/crew thread <id>`, `/crew brief T-n`), the mod's tests as they exist under `plugins/core/hooks/`, `README.md` (the mod's views), `plugins/core/skills/crew/SKILL.md` (within 9254 bytes, if a word changes)
- Test: `workspace.test.ts` (new), `cli.test.ts`, the mod's tests

- [ ] **Step 1: Failing tests** (`workspaceStatus` over a registry with two projects: live, open items, unread, open threads, unconfirmed priorities, environment states; no workspace in the policy says so and exits 0; `status --json` carries the three fields; the mod's text builders for threads and the workspace.)
- [ ] **Step 2: Red, code, green; the desktop verification against the mods documentation recorded in this plan's execution notes; the README; build, `plugin:check`, gate, judgement, validations, commit.**

**Acceptance criteria:** AC-1 `crew workspace status` prints the workspace's sessions, open items, unread mail, open threads, unconfirmed priorities and environments without running a project's commands; AC-2 `crew status --json` carries `threads`, `priority` and `environment`; AC-3 the mod shows the priority, the threads with read and unread, the workspace's sessions, and answers the three new verbs from command output; preserve: the SP7a mod tests stay green.

---

### Task 7: The evals, the records and the release 0.7.0

**Files:**
- Create: `plugins/core/evals/env-observed-proof/`, `no-environment-cannot-prove/`, `priority-lowered-with-reason/`, `thread-with-contracts/` (each `case.yaml`, `fixture.sh`, `prompt.md`, `graders/`), `docs/evals/<date>-sp7b-results.md`
- Modify: `plugins/core/evals/README.md` (the four rows), `packages/engine/tests/eval-runner.test.ts` (the cases' confinement), `README.md` (the 0.7.0 paragraph), `docs/vision.md` (the status line), `docs/real-use/README.md` (the phase after 0.11.0, ADR 0008), `docs/real-use/findings.md` (the run's findings), the six version files, `plugins/core/dist/crew.mjs`
- Test: `skill.test.ts`, `eval-runner.test.ts`, `version.test.ts`, `cli.test.ts`

- [ ] **Step 1: The four cases**, red first in `eval-runner.test.ts` (each case's files exist and its fixture stays confined).
- [ ] **Step 2: Run** `bun scripts/eval.ts --case <each>` and `--case fast-route-overhead`; record the figures and the findings; fix nothing per finding beyond what the plan's acceptance names.
- [ ] **Step 3: The release**: the version in the six files, `bun run build`, `bun run check && bun run plugin:check`, the records, commit, `git tag -a v0.7.0`, push, `gh release create v0.7.0`, the marketplace entry (`version`, `ref`, `metadata.version`), then `claude plugin marketplace update wizardingcode-plugins` and `claude plugin update wizardingcode-developer-crew@wizardingcode-plugins` (CLAUDE.md, finding #66).

**Acceptance criteria:** AC-1 the four cases exist, confined, and pass with the plugin; AC-2 `fast-route-overhead` stays at or under 2.03×, or the figure and its reason are recorded; AC-3 0.7.0 is tagged, released and in the marketplace with the records written; preserve: the whole test suite and `plugin:check` green.

## After the last task

- `bun run check && bun run plugin:check` green on `main`, everything pushed, the marketplace at `v0.7.0`, the two update commands run.
- The SP3 plan (`docs/plans/<date>-sp3-reception-triage-issues-and-jev.md`) is written next, from the design's §7.1, §7.2, §7.4, §10 and §11, with `typesafe:typesafe-ai` invoked before any Jev code; then SP8, SP4 and SP6 in that order (ADR 0008), each released at its close; the real-use phase after 0.11.0.
