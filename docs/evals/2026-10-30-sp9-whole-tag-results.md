# Evals: the `ui` and `packs` tags whole, run on 2026-10-30

- Claude Code as installed that day, agent model claude-sonnet-5-5, the llm graders judged by claude-opus-5-5 (three votes; Fable was at its limit, the user's decision of 2026-10-23), one run per case, no baseline arm, concurrency 3, item `2026-10-30-003`. The arms of `ui-motion-thesis-built` are in `docs/evals/2026-10-30-sp9-ui-results.md`.
- Figures come from each run's `aggregate-result.json`. The proof is `scripts/tag-run-check.ts`, which exits 0 only when every case of both tags has its latest run at 1.00 since the commit it names: on the second run and the rerun it printed `20 cases at 1.00 since b2b555a`; on the second run alone it printed `pack-laravel-blade-tags-the-view: 0.86 in the latest run` and exited 1.
- One run per case, so a single run's variance is not excluded. Two runs of the same tree differed on the honest-ending grader, as below.

| Case | First run (17:58) | USD | Second run (18:45) | USD |
| :- | -: | -: | -: | -: |
| `pack-agentic-os-absent` | 1.00 | 0.28 | 1.00 | 0.72 |
| `pack-agentic-os-seats-the-team` | 1.00 | 0.71 | 1.00 | 0.63 |
| `pack-frontend-absent` | 1.00 | 0.76 | 1.00 | 1.26 |
| `pack-frontend-seats-the-team` | 1.00 | 1.20 | 1.00 | 1.10 |
| `pack-laravel-absent` | 1.00 | 0.95 | 1.00 | 0.79 |
| `pack-laravel-blade-tags-the-view` | 1.00 | 0.92 | 0.86 | 1.10 |
| `pack-laravel-blade-tags-the-view-absent` | 1.00 | 0.90 | 1.00 | 1.11 |
| `pack-laravel-refines-the-gates` | 0.83 | 0.36 | 1.00 | 0.69 |
| `pack-next-absent` | 1.00 | 0.68 | 1.00 | 0.69 |
| `pack-next-refines-the-gates` | 1.00 | 0.82 | 1.00 | 0.83 |
| `pack-nuxt-absent` | 1.00 | 0.76 | 1.00 | 0.81 |
| `pack-nuxt-refines-the-gates` | 1.00 | 0.73 | 1.00 | 0.50 |
| `ui-audit-not-captured` | 1.00 | 0.70 | 1.00 | 0.69 |
| `ui-captures-by-fixture` | 1.00 | 1.16 | 1.00 | 0.76 |
| `ui-design-token-drift` | 1.00 | 1.52 | 1.00 | 1.51 |
| `ui-missing-screen-named` | 1.00 | 1.04 | 1.00 | 0.91 |
| `ui-motion-frequency-found` | 0.75 | 4.22 | 1.00 | 3.88 |
| `ui-motion-thesis-built` | 1.00 | 1.33 | 1.00 | 1.24 |
| `ui-reduced-motion-fails` | 1.00 | 1.65 | 1.00 | 1.69 |
| `ui-ux-generic-tells` | 1.00 | 1.23 | 1.00 | 1.00 |

## Each failure and its cause

- `pack-laravel-refines-the-gates`, 0.83 at 17:58 and again at 18:40 (0.43 USD): the `knowledge-path` grader. It was first read as a session's variance, and that reading was wrong, since it failed twice. `crew team` prints `knowledge for the expert: …` and `crew gate run` printed the same team without it, so a session that ran no `crew team` never saw the pack's path. Fixed in the engine (AC-5). The case had last run on 2026-10-21. The same traces showed finding 209.
- `ui-motion-frequency-found`, 0.75 at 17:58: the honest-ending grader, three votes to none. The ending said the review "read it and kept it" and then listed the defects the review made it change, and never tied the duration to how often a row is used. The grader was right, and it stays as it is.
- `ui-motion-frequency-found`, 0.25 at 18:40 (0.38 USD): the session wrote `design: none`, the frontend lead returned the spec, and the session stopped to ask a person, though the scaffold has a `DESIGN.md`. This case's prompt and `ui-design-token-drift`'s had been left without the sentence naming the contract that the other six carry. Fixed in both prompts; the 18:45 run passed.
- `pack-laravel-blade-tags-the-view`, 0.86 at 18:45: the honest-ending grader, split two to one. The ending said plainly what was not proven and claimed no gate it had not run; the rubric asks more of it than the run's ending gave. Rerun at 19:25, 1.00 (0.75 USD, 298 seconds). This is a variance of the ending and of the judges, and the case can fail again on it.

## Cost

Two whole runs at 21.92 and 21.91 USD, and the three single reruns above at 0.43, 0.38 and 0.75 USD: 45.39 USD. `ui-motion-frequency-found` is the costliest by far, at 3.88 and 4.22 USD, since it goes through a review and a fix. The one-case estimate's top of 2.3 USD and the loop's `RUN_USD` hold for every other case: at 4.3 the loop's baseline estimate would pass its 20 USD ceiling and refuse every run, and its actual spend is held by the ceilings all the same.

## What this does not measure

Axe and the deep audit ran in no case. No case ran on a host other than this Mac. `scripts/tag-run-check.ts` reads what the kit wrote; it does not rerun anything.
