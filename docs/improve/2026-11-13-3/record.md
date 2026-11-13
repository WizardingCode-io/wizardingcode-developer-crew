# Improvement run 2026-11-13-3

- At: 2026-11-13T13:00:11.132Z
- Targets: ui-missing-screen-named, ui-motion-frequency-found
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| ui-missing-screen-named | 1.00, 0.60, 0.40 | 0.67 | 0.60 |
| ui-motion-frequency-found | 1.00, 0.25, 0.75 | 0.67 | 0.75 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no harness file. Both cases fail in a way that says the run never built anything, not that a page misled the lead: `ui-missing-screen-named` left `public/inbox.js` untouched and printed neither the missing-screen line nor the verdict, and `ui-motion-frequency-found` left `public/styles/inbox.css` untouched, recorded no review, and had its `honest-ending` judge skipped at the cost ceiling. Both cases scored 1.00 in all three runs on 2026-11-06, and I found no later edit made for either. There is no trace or `reads` list for any failing run, because the 2026-11-13-2 run that targeted `ui-missing-screen-named` stopped at the ceiling before recording its baseline. Two other inbox cases with the `ui` tag dropped in the same way earlier today, which points at something shared (the engine's recent changes to how a lead's validation is recorded, or the kit's cost ceiling), though I did not establish which. An edit from that inference would be a guess against pages that passed a week ago, and the skill page sits at its byte cap. The next step is a rerun that keeps the failing run's trace, to see the phase where the item stopped. I extended the existing memory note on the inbox cases to cover these two.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file. The failing evidence for `ui-missing-screen-named` and `ui-motion-frequency-found` describes runs that never built: `public/inbox.js` and `public/styles/inbox.css` are untouched, there is no review or verdict line in the trace, and one ending was skipped at the kit's cost ceiling. Both cases scored 1.00 three times on 2026-11-06, and no harness page has been edited for them since. There is still no trace or `reads` list for the failing runs: `docs/improve/` holds records only for 2026-11-13-1 and -2, and the -2 run stopped at the improve ceiling before recording a baseline. Without knowing where the item stopped (a returned validation, a wait for the user, or the cost cut), any edit would be a guess at the cause. Four `ui` inbox cases dropping together on one day also points at something shared in the engine or the kit's cost rather than a misleading page. The next step is a trace of one failing run, not a harness change.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 23.64 USD
- Exit status: 0
