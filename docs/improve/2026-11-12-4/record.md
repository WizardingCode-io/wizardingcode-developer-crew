# Improvement run 2026-11-12-4

- At: 2026-11-12T05:00:11.732Z
- Targets: pack-next-absent, ticket-triaged-against-business
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-opus-5-5 (passed over: claude-fable-5-2 (limited))

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-next-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| ticket-triaged-against-business | 0.67, 0.67, 0.67 | 0.67 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I didn't change any file under `plugins/core/skills/crew/` or `plugins/core/agents/`, and I ran no tests or eval reruns. `pack-next-absent` is listed at mean 1.00, spread 0.00, with no evidence, so it is passing and needs nothing. For `ticket-triaged-against-business`, the `lowered` grader is a regex that expects `priority normal (proposed high, against the signed business priorities): <reason>` in the trace (`plugins/core/evals/ticket-triaged-against-business/graders/lowered.md:4`). That is the wording the engine printed before SP7. Today `packages/engine/src/priorities.ts:153` prints `proposed high, confirmed normal against the signed business priorities: <reason>`, so the pattern can't match any run. The case's other two graders, `source-recorded` and `honest-ending`, pass, which means the lead does lower the priority correctly. The only way a harness edit could make the regex pass would be to plant the old wording in a page or in the lead's own words, which passes for the wrong reason. The real fix is to update the grader's pattern to the engine's current wording, and that is outside what this improvement run may edit. I also added today's date to the existing memory note on this stale grader.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file. `pack-next-absent` is at mean 1.00 with spread 0.00 and no evidence, so it is passing and I left it alone. `ticket-triaged-against-business` fails only `lowered`, and that grader is out of date with the engine, not a gap in the harness. Its pattern (`plugins/core/evals/ticket-triaged-against-business/graders/lowered.md:4`) still expects the old triage line, `priority normal (proposed high, against the signed business priorities): <reason>`. The engine has printed `proposed high, confirmed normal against the signed business priorities: <reason>` since SP7 (`packages/engine/src/priorities.ts:153`). The case holds steady at 0.67 with spread 0 because `source-recorded` and `honest-ending` pass, which shows the lead does lower the priority to normal and gives the reason. Only the regex misses. The only harness edit that could make it pass would be putting the old wording into a page or into the lead's own words, and that would fire a trace regex without the engine having printed the line. So the fix belongs in the grader's pattern, which is outside what this loop may edit. I made no edits, so I ran no tests and no eval rerun.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 3.95 USD
- Exit status: 0
