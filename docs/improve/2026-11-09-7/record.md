# Improvement run 2026-11-09-7

- At: 2026-11-09T23:00:07.139Z
- Targets: gate-scoped-to-change, kind-preserve-not-behavior
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-scoped-to-change | 0.60, 0.60, 0.60 | 0.60 | 0.00 |
| kind-preserve-not-behavior | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured. `kind-preserve-not-behavior` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `gate-scoped-to-change`, `todo-gated` wants the engine's `T-n gate round 1: pass` line, which only `crew task <id> gate T-n` prints, and the `web-not-run` judge wants the ending to report that todo gate with its apps/api run and say apps/web's tests were not in it. Every recorded run shows `reads: []`, so the lead takes the fast route and reads only the skill page, whose todo paragraph covered only "a request in several parts" with `--part`, "after each commit". A request to "plan it as one todo" therefore had no command that fit, and the lead went from green straight to `crew gate run`. The 2026-11-02-6 probe of a similar edit passed `todo-gated` but still lost the judge 3/3 at 0.80, so this time the ending instruction is explicit. The fast-route paragraph now adds: "Asked as one todo: the same three after the green, `--text "<todo>"` for `--part P-n`, then `crew gate run`. A todo's gate tests only its scope's targets: the ending names each it tested and each it did not (those ran only in `crew gate run`)." The page sits at its byte cap, so the 244 added bytes are paid for exactly by trimming wording that no test in `packages/engine/tests` matches: the intro, the Gate row's "as subagents", the typed-questions line, the `work_type: question` line, the heading's ", in three calls", step 1's "With criteria the item is in build", and spare clauses of rules 4, 5 and 6. The page probes at 9247 characters, 9251 bytes, as before. I left rule 5's "a role wait clears…" clause in place because `gate.md` and `mail.md` point at it.
- Probe set: gate-scoped-to-change, kind-preserve-not-behavior
- Gain: -0.03

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-scoped-to-change | 0.80, 0.80, 0.60 | 0.73 | 0.20 |
| kind-preserve-not-behavior | 1.00, 0.50, 1.00 | 0.83 | 0.50 |

## P-2: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured. `kind-preserve-not-behavior` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `gate-scoped-to-change`, `todo-gated` wants the engine's `T-n gate round 1: pass` line, which only `crew task <id> gate T-n` prints. The `web-not-run` judge wants the final message to report that todo gate with its apps/api test run and to say apps/web's tests were not part of it. Every recorded run of the case shows `reads: []`, so the lead takes the fast route and reads only the skill page, and that page gave the todo loop only for "a request in several parts" with `--part`. A request to "plan it as one todo" therefore went from green straight to `crew gate run`. The fast-route paragraph now ends its todo sentence with: "Asked as one todo: these three between the green and `crew gate run`, `--text "<todo>"` in place of `--part P-n`." An earlier attempt (2026-11-02-6) got the loop to run but still lost the judge 3 of 3 with the ending wording in that paragraph, so this time I put it where the page defines the ending. Step 3's "Say the verdict it prints: proven or not, and why" now continues: "a todo: also its gate's runs by target, and that the other targets' tests were not in it (they ran only in `crew gate run`)." The page sits at its byte cap, so the 239 added characters are paid for by trimming wording I found no test pinning. The trims are the intro's "The `crew` command" and "the work", the Gate row's "as subagents", the typed-questions and `work_type: question` lines, the heading's ", in three calls", "is on this page", step 1's "With criteria the item is in build.", step 2's "the test for the criterion", rule 4's "run", "the command runs with no prompt", "`claude -p`," and the `validator` parenthetical, rule 5's "of the gap round
- Probe set: gate-scoped-to-change, kind-preserve-not-behavior
- Gain: 0.03

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-scoped-to-change | 0.80, 0.80, 0.80 | 0.80 | 0.00 |
| kind-preserve-not-behavior | 1.00, 0.50, 1.00 | 0.83 | 0.50 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-344, K-345
- Cases no run has measured (never probed): none
- Cost: 18.16 USD
- Exit status: 0
