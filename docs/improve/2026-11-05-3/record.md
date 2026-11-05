# Improvement run 2026-11-05-3

- At: 2026-11-05T02:00:05.128Z
- Targets: gap-erasure-or-deactivation, strategy-declares-phases
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| strategy-declares-phases | 1.00, 0.40, 0.80 | 0.73 | 0.60 |

## P-1: unprobed (the probe set (4 cases, about 76.38 USD by the baseline's costs) is above what is left under the ceiling (0.95 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/strategy.md
- Rationale: The edits are in place and every pinned string on both pages still matches. I did not run tests or an eval rerun in this session, which has no shell. The skill page is within its cap, measured by regex probes.

I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` (rule 5, paid for by trims of unpinned wording elsewhere on the page) and `plugins/core/skills/crew/references/strategy.md` (steps 4 and 5 of the check-and-ruling section). For `gap-erasure-or-deactivation`, the `asks-which` grader is a trace regex for a typed `crew decision … add` whose question names erasure or deactivation, and every recorded run reads only the skill page (two of three with no reference read at all) while `waits` and `honest-ending` pass, so the lead asks the right question in prose, waits, and records it as `crew question … add` or not at all, because rule 5 sent every doubt about the request to `crew question` and called a decision a thing "of the gap round"; the earlier edits to Receive, Understand and Analyse never reached these runs. Rule 5 now says a design choice is a decision on every route, recorded with `crew decision <id> add` and a conservative `--default` before asking, with a ticket's "delete" named as erasure (data gone) or deactivation (account kept), never "soft or hard", written so the page text itself cannot match the grader. For `strategy-declares-phases`, the failing run passed the check graders and lost `ruling-recorded`, `specify-reached` and the final-message judge together, the shape of a first ruling found not proven followed by a lost second round under the engine's rules (a record refused after an edit without a new check, a CTO file older than the check refused, two rounds and no third with nobody present). Step 4 now names those refusals and gives the second-round sequence in order, says the first ruling is the one to get right by answering the rubric's five questions on the draft before the first check, and lists what costs a ro

## P-2: unprobed (the probe set (9 cases, about 150.97 USD by the baseline's costs) is above what is left under the ceiling (0.00 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/receive.md, M plugins/core/skills/crew/references/strategy.md
- Rationale: All edits and checks are done; nothing further depends on another lookup, so I'm closing with the summary.

I changed three harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` (rule 5, with trims elsewhere on the page to pay for it), `plugins/core/skills/crew/references/receive.md` (one sentence in the "A doubt about the request" paragraph) and `plugins/core/skills/crew/references/strategy.md` (a rubric-first paragraph under the document's shape, the route named in the judge's prompt, and the not-proven loop and the ending in steps 4 and 5). For `gap-erasure-or-deactivation`, `waits` and `honest-ending` pass in every recorded run and only `asks-which` fails, a trace regex for a typed `crew decision <id> add "…"` naming erasure or deactivation; every run shows `reads: []` (one adds receive.md), so the skill page is the one lever, and its rule 5 sent "a missing fact of the request" to `crew question` and only "a design choice of the gap round" to a decision, which is how a lead reading an ambiguous ticket asked the right question in prose and typed a question or nothing. Rule 5 now says a design choice is a decision recorded with `crew decision <id> add` and a conservative `--default`, and that a request two engineers would build differently (a ticket's "delete": data gone, or account closed and kept) holds a choice, not a missing fact; the pinned regex over that sentence still matches, the page sits at 9250 or 9251 bytes under the 9254 cap (measured by regex probes, this session having no shell), and no editable page matches the grader's pattern, so a pass comes from the typed command alone. For `strategy-declares-phases`, the check graders pass and one run in three loses `ruling-recorded`, `specify-reached` and the judge together, the shape of a ruling never recorded: the engine prints `strategy:` only at `crew judgement record`, refuses a `conclave/cto.md` older than the check, a ruling naming the wrong reviewer and a third round with nobody present

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 24.14 USD
- Exit status: 0
