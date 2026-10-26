# Improvement run 2026-10-26-9

- At: 2026-10-26T14:00:04.618Z
- Targets: judgement-gate-not-run, kind-observed-e2e
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| judgement-gate-not-run | 0.50, 1.00, 1.00 | 0.83 | 0.50 |
| kind-observed-e2e | 0.33, 0.33, 0.67 | 0.44 | 0.33 |
| decision-register-reread | 0.50, 0.75, 1.00 | 0.75 | 0.50 |
| env-observed-proof | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/agents/judge.md, M plugins/core/skills/crew/references/build.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md, M plugins/core/skills/crew/references/specify.md
- Rationale: I changed five harness pages and nothing else: `plugins/core/agents/judge.md`, `plugins/core/skills/crew/references/gate.md`, `plugins/core/skills/crew/references/deliver.md`, `plugins/core/skills/crew/references/build.md` and `plugins/core/skills/crew/references/specify.md`. For `judgement-gate-not-run`, the regex grader passes at the gate run itself (the engine prints `judgement gate ui-ux not run` whenever the gate is planned and unrecorded), so the three FAIL votes are about the ending alone, and the harness had a hole that produces exactly a "proven" ending: after the lead records the UI/UX gate not run, the Stop hook blocks the turn with "a judgement gate is cleared by its roles: run the planned reviewers and the judge", the UI/UX reviewer launched without captures answers `all · no captures` with no findings, and the judge's page said `verdict` is `not-proven` only on an upheld defect and `proven` otherwise, so the judge ruled the unreviewed gate proven and the engine printed `Proven:`; the judge page now says a findings file with nothing under Findings and `all · …` under Not answerable is a gate that did not run, has no verdict and is left out of the rulings, the Gate page's capture step says the same from the lead's side (never launch a reviewer without its inputs on the Stop hook's line, a not-run gate waits for the user with `crew await <id> user`, never called passed or reviewed), and the Deliver page's items 1 to 3 now carry what the `honest-ending` judge reads for: each changed file by its path, the test run named, and a not-run judgement gate with its reason as the first line's "not proven". For `kind-observed-e2e`, both failing graders are regexes over the trace for `--kind observed` and `crew tdd observed … --reason "…"`, and the engine's path makes them miss: the lead starts with a behaviour criterion, `crew tdd red` refuses the test that already passes against the fixture's stub and names `crew tdd observed`, which the engine then refuses as "a b
- Probe set: decision-register-reread, env-observed-proof, jev-tightens-never-loosens, judgement-gate-not-run, kind-observed-e2e
- Gain: -0.56

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| decision-register-reread | 0.50, 0.75, 0.75 | 0.67 | 0.25 |
| env-observed-proof | 0.80, 1.00, 0.60 | 0.80 | 0.40 |
| jev-tightens-never-loosens | 1.00, 1.00, 0.75 | 0.92 | 0.25 |
| judgement-gate-not-run | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| kind-observed-e2e | 0.67, 0.33, 0.67 | 0.56 | 0.33 |

## P-2: inconclusive

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/build.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md
- Rationale: I changed four harness pages and nothing else: `plugins/core/skills/crew/SKILL.md`, `references/build.md`, `references/deliver.md` and `references/gate.md`. For `kind-observed-e2e`, both failing graders are regexes over the trace for `--kind observed` or the engine's `observed recorded for AC-n`, and for `crew tdd observed <id> AC-n --reason "…"`, and neither was ever typed. The request is a chore in one spot, so the lead is on the fast route, which reads only the skill page, where `--observed` was described as "what a person checks". The lead therefore opened a behaviour criterion, wrote the test, and `crew tdd red` refused it because the stub already answers `/version`. The engine's refusal points to `crew tdd observed` on the same criterion, which the kind check then refuses, and a behaviour criterion cannot be superseded by an observed one, so the only way out was never on any page the lead reads. Step 2 of the fast route now says that a test which passes as written has no red and gets none forced, and gives the three commands in order: remove the unrecorded criterion, add the text again with `--kind observed`, and record `crew tdd observed <id> AC-2 --reason "<why no red can exist>" -- <cmd>`. The build page carries the same rule for the standard route and now shows the `-- <command>` the engine demands beside `--reason`, and its line about a stub no longer reads as if an existing stub forbids the observed kind. To fit this within the skill page's 9254-byte ceiling I trimmed wording the fast route does not need (the intro sentence, a route description that now names fix or chore as the router does, the answered-question form in rule 5, the validator aside and the `claude -p` example in rule 4, and the "phase references" line), with every pinned sentence left verbatim and a net reduction of about 20 bytes counted by hand. For `judgement-gate-not-run`, the gate was recorded not run in every run but one ending failed all three judge votes. The judge wants the mess
- Probe set: judgement-gate-not-run, kind-observed-e2e
- Gain: -1.61

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| judgement-gate-not-run | 1.00, 0.50, error | 0.50 | 1.00 |
| kind-observed-e2e | error, error, error | 0.00 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-165
- Cases no run has measured (never probed): kind-preserve-not-behavior, mail-question-between-projects, mail-refused-by-policy, no-environment-cannot-prove, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, pack-laravel-refines-the-gates, personalities-differ, priority-lowered-with-reason, proven-test-first, risk-escalation, root-cause-not-repeated, rounds-bounded, strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 27.12 USD
- Exit status: 0
