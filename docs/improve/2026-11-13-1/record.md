# Improvement run 2026-11-13-1

- At: 2026-11-13T00:00:09.210Z
- Targets: ui-audit-not-captured, ui-captures-by-fixture
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| ui-audit-not-captured | 1.00, 1.00, 0.00 | 0.67 | 1.00 |
| ui-captures-by-fixture | 1.00, 0.80, 0.60 | 0.80 | 0.40 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no harness file, because the evidence does not point at a page I could edit for the right reason. In both cases one run in three never touched `public/inbox.js`. For `ui-audit-not-captured` that run lost all three graders at once (no gate-run audit line, no count, judge FAIL x3). For `ui-captures-by-fixture` it lost `empty-state` and `proven`, and its `honest-ending` was skipped at the cost ceiling, so the kit cut that run rather than the lead ending it. These are runs that stopped before Build, not runs misled at the gate or the ending, and the other runs pass every grader. Both cases scored 1.00 on all three runs on 2026-11-06. I have no trace of the failing runs and no record of what they read, so I cannot tell where the item stalled. The engine's 2026-11-12 changes to how a lead's validation is recorded fall between the two measurements, but I did not establish that they are the cause. The skill page is also at its byte cap, so an edit there would cost existing text for a guessed cause. The next step is a trace of a failing run, read for the phase the item stopped in: a returned validation, a wait for the user, or the cost cut. I ran nothing in this session (no shell), and I saved a memory note with the grader shapes and that next step.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed nothing. The evidence for both cases is the same as in this run's earlier look (2026-11-13-1), and there is still no trace or record of the failing runs in `docs/improve/`.

- **`ui-audit-not-captured` (0.67, spread 1.00):** this fits two runs at 1.00 and one at 0.00. The failing run has no `audit: not captured` line, no count in `public/inbox.js` and three judge FAILs, so it never built and never reached a gate run.
- **`ui-captures-by-fixture` (0.80, spread 0.40):** `public/inbox.js` was untouched, no `Proven:` line printed, and the ending was `skipped: cost ceiling`. The kit cut that run; the lead did not end it.

Both cases scored 1.00 on all three runs on 2026-11-06. What the evidence shows is a run that stopped or ran out before Build, not a page that misleads at the gate, and nothing here says where it stopped. That could be a returned lead validation, a wait for the user, or cost alone. Engine items 2026-11-12-004 to -006 changed how a lead's validation is recorded between the two scores, but I did not establish that they are the cause.

Any edit now would be a guess against a one-in-three loss, and the skill page is at its byte cap. Once a trace of a failing run shows the phase and the last engine line before the stop, the candidates are the "The leads' validation" section of `plugins/core/skills/crew/references/conclave.md` or `plugins/core/agents/tech-lead.md`, or nothing at all if the stop was the cost ceiling.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 21.50 USD
- Exit status: 0
