# Improvement run 2026-10-27-5

- At: 2026-10-27T10:00:04.424Z
- Targets: strategy-declares-phases, strategy-rejects-over-engineering
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| strategy-declares-phases | 0.40, 1.00, 0.40 | 0.60 | 0.60 |
| strategy-rejects-over-engineering | 1.00, 0.25, 1.00 | 0.75 | 0.75 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/strategy.md
- Rationale: The edits are in place and every pinned substring of the Strategy page is intact; I'm finishing with the summary.

I changed one harness page and nothing else: `plugins/core/skills/crew/references/strategy.md`. Both failing cases pass their check graders (`strategy ok` with the rows) and fail `ruling-recorded`, `specify-reached` and the final-message judge together, which is the trace of a strategy that was written and checked but never got a proven ruling recorded: the judge's final-message graders fail by their own text whenever the ruling is missing. The engine makes that the likely end of any run that needs a second round: the ruling is stamped with the check's hash, an edit after the check is refused at the record, a `conclave/cto.md` older than the check is refused, the policy's cap is two rounds and nobody present can grant a third, and a proven ruling goes stale on a later edit, while the page as it stood gave one linear sequence (check, CTO, judge, record), said only "two strategy rounds" without saying what a second round is, and never told the lead to read the rubric it hands the CTO before the check. The page now says, before the check, that the first ruling is the one to get right and lists the five defects the rubric upholds (an unsourced stack element, a mark that outruns its fact, a figure with no basis, a row with no figure, a bundled change or an empty cost, a smaller answer asserted without the request's reasons answered) so the lead fixes them before the check; that the check stamps the hash, so edit first and check last; that the CTO is launched after the check and alone, never beside the judge; that a missing `ruling.json` is filed by resuming the judge; that a not-proven ruling means fixing the named lines and running the whole sequence again as round 2, the last, with no gate run and no edit after a proven ruling; and that the ending of a run asked to stop at the spec carries the engine's `strategy: proven` and `phase specify` lines, then the
- Probe set: strategy-declares-phases, strategy-rejects-over-engineering
- Gain: -0.77

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| strategy-declares-phases | 1.00, 0.80, 1.00 | 0.93 | 0.20 |
| strategy-rejects-over-engineering | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/strategy.md
- Rationale: The engine prints `<id>: phase specify` at the phase step, so the page's words match. Nothing further depends on another lookup: the pinned strings are intact, the engine's refusal and print texts quoted on the page are the ones in `cli.ts`, and the edits are complete.

I changed one harness page and nothing else: `plugins/core/skills/crew/references/strategy.md`. Both failing cases are new products on the full route with nobody present, and their failing runs got past `crew strategy check` (the `strategy-checked`, `two-scaling-rows` and `trigger-figures-in-table` regexes passed) but never printed `strategy: proven` or `phase specify`, which is the shape of a first ruling the judge finds wanting followed by a second round that is lost: the page's step 4 said only "check and judge again", while the engine refuses a record whose `conclave/cto.md` predates the new check, a fresh judge's answer writes over `review/ruling.json` with no archive, a re-recorded old ruling spends the round on the old text, and the policy allows two rounds with no third for a session that cannot `crew continue`; the SP8 record of the same case shows exactly that path (the ruling refused on a stale CTO file, round 2 left four small defects, the cap reached), and a two-round run cost 62 of the case's 80 turns. The page now has a paragraph under the document's shape saying how a draft passes the five rubric questions the first time in a bare repository (each claim says what its README fact says and no more, cost and time as budgets or ranges whose basis is a count a fact gives and never a provider's price no fact quotes, every row's three cells filled with a figure and its unit, one stack element per Viability need, the request's extras refused with their fact), step 4 names the engine's `strategy: proven` or `strategy: not proven` line, and a new "A round that is not proven" paragraph gives the loop in the engine's words: fix each defect at its line and nothing else, check again, the CTO again 
- Probe set: strategy-declares-phases, strategy-rejects-over-engineering
- Gain: -0.93

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| strategy-declares-phases | 1.00, 0.80, 1.00 | 0.93 | 0.20 |
| strategy-rejects-over-engineering | 0.75, 0.75, 1.00 | 0.83 | 0.25 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-217, K-218
- Cases no run has measured (never probed): task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 36.33 USD
- Exit status: 0
