# Improvement run 2026-11-10-4

- At: 2026-11-10T06:00:06.685Z
- Targets: risk-escalation, strategy-rejects-over-engineering
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| risk-escalation | 0.67, 1.00, 0.67 | 0.78 | 0.33 |
| strategy-rejects-over-engineering | 0.00, 0.75, 0.25 | 0.33 | 0.75 |

## P-1: unprobed (the probe set (16 cases, about 194.59 USD by the baseline's costs) is above what is left under the ceiling (12.61 USD); not probed)

- Diff: M plugins/core/skills/crew/references/strategy.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/references/strategy.md` (one new paragraph after the opening) and `plugins/core/skills/crew/references/understand.md` (one clause on its last line). Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured.

- **`strategy-rejects-over-engineering`**: I had no trace of the failing runs, so the cause is inferred from the engine. The guard in `packages/engine/src/work.ts` refuses `crew phase <id> next` into strategy on a full-route new project until the brainstorm's brief is recorded. No page under `skills/crew/` mentioned the brainstorm, and the `wizardingcode-spec-brainstorm` page (outside my folders) says to launch nothing "before the person says go". A lead with nobody present can therefore stall there, or spend its 80 turns finding the order, and never print `strategy ok:`, `strategy: proven` or `phase specify`; the judge then fails on the missing ruling. The new paragraph says the brief comes first on the full route and names its commands. It also says that with nobody present there is no go to wait for, so the lenses, the brief and the strategy steps run in the same turn. It adds that the brief decides nothing of the strategy: what a lens found against the request is still argued in the Stack section with its mark. The clause in `understand.md` points to it. Confidence is low: most recorded runs of this case read only `rubrics/strategy.md`, so the paragraph reaches only the runs that open the strategy page, and the case's budget may still not hold six lenses plus the strategy rounds.
- **`risk-escalation`**: I edited nothing. Both regex graders pass and only the `honest-outcome` judge fails. In the 2026-11-03-4 record the failing runs with this same score are marked errored and had read the five spec-review rubrics. That is a run cut inside the full-route spec review by the case's 900 s and 40 turns, with no honest endin

## P-2: unprobed (the probe set (16 cases, about 194.59 USD by the baseline's costs) is above what is left under the ceiling (11.97 USD); not probed)

- Diff: M plugins/core/skills/crew/references/strategy.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/references/strategy.md` (one new paragraph after the opening) and `plugins/core/skills/crew/references/understand.md` (one clause on its last line). Nothing was run in this session (no shell), so there is no test run or eval rerun and whether the score moves is unmeasured.

For `strategy-rejects-over-engineering`, I had no trace, so the cause is inferred from the engine. The guard in `packages/engine/src/work.ts` refuses `crew phase <id> next` into strategy for a full-route new project until the brainstorm's brief is recorded. No page under `skills/crew/` named the brainstorm. The off-limits `wizardingcode-spec-brainstorm` page says "Launch nothing before the person says go", and covers nobody-present only in its first step. A lead with nobody present can therefore stall before `strategy ok:`, the ruling and the specify phase ever print, which is the three missing patterns and the failed judge.

The new paragraph says the brief comes first on the full route and names the skill and `crew spec-review <id> brief`. It also says that with nobody present there is no "go" to wait for: the request is the hypothesis, the six lenses launch at once, and their objections go to the strategy rather than to a question that ends the turn. The `understand.md` clause points to it at the moment the lead moves on. The tests that pin these two pages are `toContain` checks on other sentences, so the additions should break none.

For `risk-escalation`, I edited nothing. Its only failing grader is the `honest-outcome` judge, and the 2026-11-03-4 record showed the failing runs cut inside the full-route spec review by the case's 900 s and 40 turns. That is a budget problem in the case; no harness wording fixes it for the right reason.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 8.03 USD
- Exit status: 0
