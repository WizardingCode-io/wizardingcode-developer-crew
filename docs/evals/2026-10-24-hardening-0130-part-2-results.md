# Eval re-run of findings 61 and 149 (2026-10-24, the 0.13.0 hardening, part 2)

Two cases, one run each, `bun scripts/eval.ts --case <name> --judge-model claude-opus-5-5`: the suite's judge (`claude-fable-5-1`) was still at its usage limit, so the llm graders were judged by Opus, as the user decided on 2026-10-23. The agent model was `claude-sonnet-5-5`. The plugin under test was the working tree of item `2026-10-24-001` (its bundle rebuilt before the run): the Plan row naming `crew task <id> note T-n` before `open`, and `rounds-bounded`'s prompt giving the weak test verbatim.

| Case | Finding | Score (before) | Cost | What failed, and why |
| :- | :- | :- | :- | :- |
| `rounds-bounded` | 149 | 0.50 (0.50) | 0.59 USD | `cap-refused`, `cap-respected`: the agent wrote `tests/account-age.test.mjs` exactly as given and said in its ending that the test only checks the type, yet both gates were proven at round 1. The prompt hands the weak test over as the user's own decision ("take these as my decisions"), and a judge that defers to the user's stated choice has no defect to uphold. Finding 149 stays open with this cause: the case must seed a defect the user did not choose. |
| `brief-per-todo` | 61 | 0.40 (0.40) | 1.13 USD | `brief-t1`, `brief-t2`, `briefs-say-changed`: the agent did the two todos one after the other in this checkout and ran no `crew task` command at all, so neither `note` nor `open` was reached; the Plan row's new wording did not change that. Flagged `needs-rerun` by the runner: the sandbox denied a read of `skills/crew/references` and `understand.md`. Finding 61 stays open: the agent reads "two todos, in this checkout" as plain sequential work, not as the method's todo loop. |

Total about 1.72 USD. The results folders are `plugins/core/evals/results/2026-10-24T09-59-26-387Z-case-rounds-bounded` and `2026-10-24T10-01-35-734Z-case-brief-per-todo` (ignored by git).
