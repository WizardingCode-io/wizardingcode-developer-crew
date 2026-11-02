# Improvement run 2026-11-02-5

- At: 2026-11-02T17:00:09.439Z
- Targets: env-observed-proof, gap-redirect-target
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| env-observed-proof | 1.00, 0.80, 1.00 | 0.93 | 0.20 |
| gap-redirect-target | 0.50, 1.00, 1.00 | 0.83 | 0.50 |

## P-1: unprobed (the probe set (33 cases, about 148.75 USD by the baseline's costs) is above what is left under the ceiling (11.05 USD); not probed)

- Diff: M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/gate.md, M plugins/core/skills/crew/references/understand.md
- Rationale: All four edits are in place, every pinned sentence of the four pages is intact (the role-wait command, the SubagentStop and SendMessage sentences stay on their lines in the Gate page; the Conclave page's lead-reply rules, the Understand bullet's "never an assumption" clause and the Analyse page's headings and commands are untouched), and no new page text can match either grader's regex on its own. No tests or evals were run: this session has no shell.

I changed four harness pages and nothing else: `plugins/core/skills/crew/references/gate.md`, `plugins/core/skills/crew/references/conclave.md`, `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/references/analyse.md`. For `env-observed-proof`, the losing run has `e2e (.): pass`, the start-then-stop lifecycle in `var/log.txt`, the footer and an ending the judge accepts, yet no `Proven:` anywhere, and the engine prints that line only at a gate run that proves everything or at `crew judgement <id> record`; on the standard route the first gate run always ends `Not proven: judgement gate … not run`, so the shape is a run that passed the e2e gate and never recorded a ruling. That is finding 183, still open on the engine side: the Gate page's reviewer step told the lead "the roles answer in the background and the turn may end once" after `crew await <id> role`, and in the kit's one-turn session with nobody present a lead that follows it ends the turn with the reviewers' answers unrecorded and reports honestly that the judgement gates are pending. The Gate step now says the Agent call returns with the role's answer, the reviewers are launched in the foreground and the judge and the record follow in the same turn, that the role wait is for a runtime whose subagent runs on after the turn and only with a person present to open the next one, and that where nobody watches the turn is never ended on a role wait because no next turn comes; the Conclave page's leads' validation paragraph says the same

## P-2: unprobed (the probe set (12 cases, about 44.38 USD by the baseline's costs) is above what is left under the ceiling (5.24 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/gate.md
- Rationale: Every pinned phrase is intact on both pages, and the skill page's net change is a trim of about 16 bytes by hand count, since this session has no shell to measure it or run the tests and evals.

I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` and `plugins/core/skills/crew/references/gate.md`. For `gap-redirect-target`, the `names-the-gap` grader is a regex over the trace that wants `/slow-down` and "not" beside "route", "page", "exist" or "serve" on one line, and the recorded failing runs read no reference page at all, which fits a one-spot chore or fix on the fast route, where the skill page says to read nothing else and nothing on it told the lead to look at where the routes are listed, so one run in three shipped the redirect and named the gap in other words or not at all; the only page the Understand bullet and the link-target checklist could not reach was the skill page, which sits at its byte cap, so step 1 of the fast route now says a redirect or link target is checked against where the routes are listed first, that a target no route serves is said as "<path> is not a route the app serves" and asked as a decision with `crew decision <id> add` and `crew await <id> user`, never assumed (233 bytes), paid for by dropping four clauses no test pins and that other pages carry (rule 4's parenthetical on what "nothing to decide" means, its "Gates are never skipped" sentence that rule 2 and the Gate page already state, its "A red is traced to its origin" clause that the Build page and the Stop hook's own text carry, and the `validator` aside on `unattendedDecisions` that the Conclave page explains), 249 bytes in all. For `env-observed-proof`, the lost run passed the e2e, lifecycle, footer and honest-ending graders and lost only the engine's `Proven:` line, which the gate run and `crew judgement record` both print at a proven verdict; on the standard route this feature takes, the Stop hook blocks a turn that ends with a judgement gate u

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 14.76 USD
- Exit status: 0
