# Improvement run 2026-11-12-6

- At: 2026-11-12T16:00:11.814Z
- Targets: code-quality-flags-unasked-dependency, pack-laravel-blade-tags-the-view-absent
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| code-quality-flags-unasked-dependency | 1.00, 1.00, 0.83 | 0.94 | 0.17 |
| pack-laravel-blade-tags-the-view-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: unprobed (the probe set (38 cases, about 371.20 USD by the baseline's costs) is above what is left under the ceiling (6.49 USD); not probed)

- Diff: M plugins/core/skills/crew/rubrics/code-quality.md
- Rationale: Finishing up: the edit is in place, and here is the summary.

I changed one harness page and nothing else: `plugins/core/skills/crew/rubrics/code-quality.md`, a new paragraph at the end of its "Only the change" section. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured. `pack-laravel-blade-tags-the-view-absent` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `code-quality-flags-unasked-dependency`, `review-names-dependency` is a regex over the trace for the code-quality reviewer's own `defect … nodemon` bullet under `## Findings`, before `## Outside the change`. A mean of 0.94 fits one run in three losing only that grader. I had no trace of the failing run, so the cause is inferred: the lead either commits the person's uncommitted `package.json` edit before `crew start`, so the diff base swallows it and the reviewer files `nodemon` as debt, or removes `nodemon` itself after reading question 7, before any review runs. The 2026-11-05 baseline records show all three runs reading only the two rubrics, never `understand.md` or `gate.md`, and the skill page is at its byte cap, so the rubric is the one editable page both the lead and the reviewer read. The new paragraph says the person's uncommitted edits are part of the change, that a problem in them is a finding of the review and never debt, and that the session leaves them in the diff, neither committed apart nor corrected ahead of the reviewer, and changes them after the ruling. The three `skill.test.ts` checks that pin this rubric's wording (questions 7 to 11 and the defect list) are untouched.

## P-2: unprobed (the probe set (38 cases, about 371.20 USD by the baseline's costs) is above what is left under the ceiling (5.79 USD); not probed)

- Diff: M plugins/core/skills/crew/rubrics/code-quality.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/rubrics/code-quality.md`, a new paragraph at the end of its "Only the change" section. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured. `pack-laravel-blade-tags-the-view-absent` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `code-quality-flags-unasked-dependency`, `review-names-dependency` is a regex over the trace for the code-quality reviewer's own bullet under `## Findings` that carries both `defect` and `nodemon`; a bullet under `## Outside the change`, an advisory, or the lead's prose does not match. I had no trace of the failing run, so the cause is inferred from earlier records. The item's diff base is HEAD at `crew start`, so a lead that commits the person's uncommitted edits first moves `nodemon` into the base, and the reviewer files it as debt. A lead that removes `nodemon` itself after reading question 7 leaves the reviewer nothing to find. The 2026-11-05 baseline runs read only the two rubrics besides the skill page, which is at its byte cap, so this rubric is the one editable page both the lead and the reviewer read. The new paragraph says the person's uncommitted edits are the change and a problem in them is a finding, never debt. It tells the session to start the item on them without committing first and to leave an added dependency in the manifest until the reviewer has answered. It also says the question 7 finding names the dependency and the dependency is removed after the ruling. It is limited to the dependency, so the debug line may still go before the review, as the fixture allows. The sentences `skill.test.ts` pins on this rubric are unchanged.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 14.21 USD
- Exit status: 0
