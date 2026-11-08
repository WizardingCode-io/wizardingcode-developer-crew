# Improvement run 2026-11-08-6

- At: 2026-11-08T18:00:06.501Z
- Targets: spec-resolve-rules, spec-review-planted
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-resolve-rules | 0.83, 0.83, 1.00 | 0.89 | 0.17 |
| spec-review-planted | 0.85, 0.92, 0.92 | 0.90 | 0.08 |

## P-1: win

- Diff: M plugins/core/agents/goldfish-comprehension.md
- Rationale: I changed one harness page and nothing else: `plugins/core/agents/goldfish-comprehension.md`, its frontmatter description and the first sentence of its "Review mode" section. Of the three failing graders, two cannot be reached from the editable folders for the right reason. `paraphrase-kept` of `spec-review-planted` wants the comprehension reviewer's paraphrase in the written report, but since finding 227 (today's commit e03cac3, the user's D-3) a round has stages 5, 7 and 9 only: `STAGES` in `spec-review.ts` lists no `goldfish-comprehension`, the `record` case in `cli.ts` iterates only the due stage's own reviewers, so a comprehension answer can never enter the record, `round.paraphrase` is never set and the consolidated report never prints "What a new reader understood". That grader is stale against the engine and belongs with the grader, not the harness; a lead pasting a paraphrase into `review-report.md` by hand would pass for the wrong reason and break the skill's "never write a reviewer's answer" rule. `contest-with-evidence` of `spec-resolve-rules` loses one run in three, every record shows `reads: []`, and the governing page (`wizardingcode-spec-resolve/SKILL.md`) is outside my folders; the 2026-11-01-5 edit to writing.md for the same grader gained nothing. The one reachable grader is `no-reimplementation-on-comprehension`, which fails in a single run with three votes, the shape of a lead that launched `goldfish-comprehension` on its own inside stage 9 with the readiness and re-implementation rubrics, because the agent's description still said "Launched by the crew's spec-review". The description now says it is launched by the spec-brainstorm as a lens and that no stage of the spec review launches it, since a round has stages 5, 7 and 9 and the record takes only a stage's own reviewers; the review-mode opener adds that a standard named in its prompt is not its to apply, that the readiness and re-implementation standards belong to stage 9's reviewers, and tha
- Probe set: spec-resolve-rules, spec-review-planted
- Gain: 0.08

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-resolve-rules | 1.00, 1.00, 0.83 | 0.94 | 0.17 |
| spec-review-planted | 0.92, 0.92, 0.92 | 0.92 | 0.00 |

## P-2: lose

- Diff: M plugins/core/agents/goldfish-comprehension.md
- Rationale: I changed one harness page and nothing else: `plugins/core/agents/goldfish-comprehension.md`, its description and the opening sentence of its "Review mode" section. Of the three failing graders, only `no-reimplementation-on-comprehension` of `spec-review-planted` is reachable from the editable folders and movable for the right reason. It passes whenever the comprehension reviewer is not launched, and since finding 227 (commit e03cac3) no review stage launches it: `STAGES` in the engine lists stages 5, 7 and 9 with zoom-out, the three critics, and readiness plus codebase, and the `crew spec-review check` line names only those. The one run in three that lost it is therefore a lead that launched comprehension on its own inside stage 9 and handed it `rubrics/spec-readiness.md` and `rubrics/spec-reimplementation.md`, and the trigger is the agent listing, where the page's description said "Launched by the crew's spec-review". The description now says it is launched by the spec-brainstorm as one of its six lenses, that no review stage launches it, and that it never takes the readiness or re-implementation standard; the review-mode opener adds that a standard named in the prompt anyway is left unapplied and said so under "Not answerable", because a missing file list, test list or code-level contract is the readiness stage's finding and never a new reader's. Every string the agents test pins on the page is intact. `paraphrase-kept` is stale: the record takes only a stage's own reviewers and `renderSpecReview` prints "What a new reader understood" only from a paraphrase that can no longer be recorded, so a lead pasting one into `review-report.md` would pass for the wrong reason, and I edited nothing for it. `contest-with-evidence` of `spec-resolve-rules` is unreachable: every recorded run of that case, including the 2026-11-01-5 probe of a writing.md edit that lost, shows `reads: []`, and the rule it wants (contest with a file and a symbol) lives in `wizardingcode-spec-resolv
- Probe set: spec-resolve-rules, spec-review-planted
- Gain: 0.09

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-resolve-rules | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| spec-review-planted | 0.85, 0.85, 0.92 | 0.87 | 0.08 |

## Outcome

- Composition: none
- Kept: P-1 on improve/2026-11-08-6
- Lessons: K-320, K-321
- Cases no run has measured (never probed): none
- Cost: 17.51 USD
- Exit status: 0
