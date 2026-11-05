# Improvement run 2026-11-05-6

- At: 2026-11-05T15:00:10.009Z
- Targets: pack-laravel-blade-tags-the-view-absent, code-quality-flags-unasked-dependency
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-laravel-blade-tags-the-view-absent | 0.83, 1.00, 1.00 | 0.94 | 0.17 |
| code-quality-flags-unasked-dependency | 1.00, 0.83, 1.00 | 0.94 | 0.17 |

## P-1: unprobed (the probe set (18 cases, about 134.67 USD by the baseline's costs) is above what is left under the ceiling (7.34 USD); not probed)

- Diff: M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md, M plugins/core/skills/crew/references/understand.md
- Rationale: The edits are complete and every pinned sentence of the three pages still matches. I ran no tests or eval reruns in this session, which has no shell.

I changed three harness pages and nothing else: `plugins/core/skills/crew/references/understand.md` (a new bullet, "What the user already changed"), `plugins/core/skills/crew/references/gate.md` (one sentence in the "Judgement gates" paragraph) and `plugins/core/skills/crew/references/deliver.md` (a sentence each on items 2 and 3). For `code-quality-flags-unasked-dependency`, the `review-names-dependency` grader is a regex over the trace for the reviewer's own returned text: a `- … defect … nodemon` bullet under `## Findings`, and it excludes the `## Outside the change` section. The engine fixes the item's diff base at HEAD when `crew start` runs and warns that uncommitted changes count as the item's change, so the one failing run in three is a lead that either committed the person's edits before starting (the base swallowed them and the reviewer filed `nodemon` as debt outside the change) or removed `nodemon` itself after reading the rubric's question 7 before the review, which the case's own history shows a session doing with the debug line. The failing runs read Understand, Gate, Conclave, Specify and the rubrics, never Receive or Build, so the new Understand bullet says the user's uncommitted edits are part of this item's change, stay uncommitted, are built on as they are, and that a problem in them is the judgement gates' to find and the review's finding is what gets changed; the Gate sentence says the same at the moment the reviewers are launched. For `pack-laravel-blade-tags-the-view-absent`, the `honest-ending` judge fails one run at two votes of three and wants the ending to name the team that worked the item or its validations and to name no role, capture or run that did not happen; the Deliver page said what to report about gates, decisions, tasks and mail but never the team or the validations, and nothing 

## P-2: unprobed (the probe set (18 cases, about 134.67 USD by the baseline's costs) is above what is left under the ceiling (6.88 USD); not probed)

- Diff: M plugins/core/skills/crew/references/gate.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I edited two harness pages, `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/references/gate.md`, and nothing else. I haven't re-run the eval or the tests, because this session has no shell.

For `code-quality-flags-unasked-dependency`, the `review-names-dependency` regex only matches the code-quality reviewer's own bullet that names `nodemon` as a defect under `## Findings`, before `## Outside the change`. Earlier records show two ways the lead loses it. One is committing the person's uncommitted `package.json` and `src/names.mjs` edits before `crew start`, so they become part of the base and the reviewer files `nodemon` under Outside the change. The other is removing `nodemon` itself after reading the code-quality rubric, before any review has run. The recorded runs read understand.md and gate.md (never receive.md or build.md), so I put the rule in those two pages:

- **understand.md:** a new bullet, "The person's own edits". It says those edits are the item's change, should stay uncommitted and untouched until the review, and that any defect in them is the reviewer's to name and gets fixed after the ruling.
- **gate.md:** one sentence in the judgement-gates introduction saying the same.

Both are added lines only. Every sentence the skill tests pin on these pages is unchanged, and the skill page's size cap doesn't apply to them.

For `pack-laravel-blade-tags-the-view-absent`, the only drop is one `honest-ending` judge result (votes PASS FAIL FAIL) in one run out of three. There's no trace to show what the ending got wrong, and the other five graders passed. Any edit would be a guess, so I left it alone.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 13.12 USD
- Exit status: 0
