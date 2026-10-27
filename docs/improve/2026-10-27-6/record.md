# Improvement run 2026-10-27-6

- At: 2026-10-27T13:00:04.896Z
- Targets: task-implementer-worktree, team-by-route
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| task-implementer-worktree | 0.00, 0.00, 0.00 | 0.00 | 0.00 |
| team-by-route | 0.33, 0.83, 0.17 | 0.44 | 0.67 |
| brief-per-todo | 1.00, 1.00, 0.60 | 0.87 | 0.40 |
| decision-register-reread | 0.75, 0.75, 1.00 | 0.83 | 0.25 |
| judgement-gate-not-run | 1.00, 0.50, 0.50 | 0.67 | 0.50 |
| mail-question-between-projects | 0.50, 0.50, 0.50 | 0.50 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-laravel-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| proven-test-first | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| rounds-bounded | 0.75, 0.75, 1.00 | 0.83 | 0.25 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/plan.md, M plugins/core/skills/crew/references/specify.md
- Rationale: I edited three harness pages, but I couldn't see the failing runs' traces, so the causes below are inferred and nothing has been re-run.

**team-by-route.** The engine prints the `Team of <id>` line the graders look for only when `crew team <id>` is run. In the failing runs, the team line and both spec validations are missing, while the validators were written. That fits a lead who treated the request's stated decisions, with nobody present, as a reason to skip seating the team and getting the leads' validations. That step runs before the plan on every standard route. The Specify page's standard-route section never pointed to it. The Conclave page named `crew team <id>` only in passing. Its leads'-validation paragraph (`plugins/core/skills/crew/references/conclave.md`) now says the step runs on every standard and full item, including one whose request already decided everything and one with nobody present. It also says the lead runs `crew team <id>` itself and that seats read from `crew status --json` don't replace it. The Specify page (`plugins/core/skills/crew/references/specify.md`) now says the same in one line after the short-spec template. The `honest-ending` grader there failed because the judge's model hit its usage limit, which no harness change can fix.

**task-implementer-worktree.** I'm least sure here. `crew task open` never printed its line, `src/farewell.mjs` doesn't exist, and every judge vote failed, so the lead never opened T-2. This case is tagged `needs-real-opener`, and earlier findings say the sandbox couldn't start the implementer session and the agent couldn't run git there. If so, the cause is the environment and my edit won't move this case's score. The engine refuses the open while watched files are uncommitted. The Plan page (`plugins/core/skills/crew/references/plan.md`) now says to open the handed-out task first, before touching any file of your own task. It also says the lead never writes that task's files itself, and says the refusal 
- Probe set: brief-per-todo, decision-register-reread, judgement-gate-not-run, mail-question-between-projects, pack-agentic-os-seats-the-team, pack-laravel-absent, proven-test-first, task-implementer-worktree, team-by-route
- Gain: -0.39

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 0.40, 0.40, 1.00 | 0.60 | 0.60 |
| decision-register-reread | 0.75, 1.00, 1.00 | 0.92 | 0.25 |
| judgement-gate-not-run | 1.00, 0.50, 1.00 | 0.83 | 0.50 |
| mail-question-between-projects | 0.50, 0.50, 0.50 | 0.50 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-laravel-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| proven-test-first | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| task-implementer-worktree | 0.00, 0.00, 0.00 | 0.00 | 0.00 |
| team-by-route | 0.50, 0.83, 0.83 | 0.72 | 0.33 |

## P-2: inconclusive

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md, M plugins/core/skills/crew/references/plan.md
- Rationale: Every pinned sentence is intact on the five pages, and the skill page's Conclave row swapped 124 bytes for 124, so the byte ceiling holds.

I changed five harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` (the Conclave row, byte-neutral), `references/conclave.md`, `references/gate.md`, `references/plan.md` and `references/deliver.md`. For `team-by-route`, the four regex graders all anchor on lines only two commands print, and the engine explains how a run records both validations yet never prints `Team of`: `crew start` already seats the leads on every non-fast route (cli.ts:3184), so the Plan guard names `lead-qa` and `lead-security` and `crew validation record` accepts their files without `crew team`, and `crew gate run` prints its own "Judgement gates to run" line so the reviewers launch without it either; the only page that asked for `crew team` before Plan was a section of the Conclave page past the long debate steps, which a lead on a two-function refactor with nothing to decide skips to reach "Then". The skill row now names `crew team <id>` then the leads' validation as the Conclave's closing step, the Conclave page says why the call is not optional (its `Team of` line is the one print of the team the report and the delivery quote), records the leads in the order it lists them (qa before security, the regex's order), and its "Then" section makes the validation a step of every standard item, and the Gate page says the same where the plan line tempts the lead to skip it; the Deliver page's item 2 now carries the team and its validations, which the final-message judge asks for. For `task-implementer-worktree`, no harness change can make its graders pass in this sandbox: `crew task open` needs git for its head and its worktree and the session's git is the macOS shim that fails every call (finding 77, open, "nothing in this repository can fix it"), and the implementer's `claude -p` cannot log in there (the case is tagged `needs-real-opener`); I m
- Probe set: brief-per-todo, decision-register-reread, judgement-gate-not-run, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, proven-test-first, rounds-bounded, task-implementer-worktree, team-by-route
- Gain: -0.17

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 0.40, 1.00, 0.40 | 0.60 | 0.60 |
| decision-register-reread | error, error, error | 0.00 | 0.00 |
| judgement-gate-not-run | error, error, error | 0.00 | 0.00 |
| pack-agentic-os-absent | error, error, error | 0.00 | 0.00 |
| pack-agentic-os-seats-the-team | error, error, error | 0.00 | 0.00 |
| pack-laravel-absent | error, error, error | 0.00 | 0.00 |
| proven-test-first | error, error, error | 0.00 | 0.00 |
| rounds-bounded | error, error, error | 0.00 | 0.00 |
| task-implementer-worktree | error, error, error | 0.00 | 0.00 |
| team-by-route | 1.00, 0.83, 1.00 | 0.94 | 0.17 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-223
- Cases no run has measured (never probed): thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 57.47 USD
- Exit status: 0
