# Improvement run 2026-11-11-3

- At: 2026-11-11T03:00:09.920Z
- Targets: rounds-bounded, task-implementer-worktree
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| rounds-bounded | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| task-implementer-worktree | 0.00, 0.00, 0.00 | 0.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file. `rounds-bounded` is listed at mean 1.00 with no evidence, so it is passing and needs nothing. `task-implementer-worktree` sits at a flat 0.00 with all five graders failing, the same shape as every earlier kit run of it, and nothing in the two editable folders can move it for the right reason. My notes from earlier runs put the cause in the eval sandbox: git fails there, so `crew task open` is refused before it prints the line `task-opened` looks for. The nested implementer session also cannot log in, so no child item is ever merged or proven, and `merged` and `proven-after-merge` cannot fire. `src/farewell.mjs` is the implementer's file to write, and a lead that wrote it itself to satisfy `farewell-exists` would be exactly what `honest-ending` fails. I did not re-check the sandbox in this session (no shell), and I had no trace of this run. The only check I made was that the repo still carries the `needs-real-opener` tag for cases the suite run skips; I did not open this case's own `case.yaml`. The fix belongs to the kit (leave this case out of improve runs, or run it with a real opener), not to the harness text.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file. `rounds-bounded` is listed at mean 1.00, spread 0.00, with no evidence, so it is passing and there is nothing to fix. `task-implementer-worktree` sits at a flat 0.00 with all five graders failing, the same shape as every earlier kit run of it, and the case still carries the `needs-real-opener` tag (`plugins/core/evals/task-implementer-worktree/case.yaml:4`). I did not have a trace of this run, so the cause rests on the earlier records: in the kit's sandbox, git is refused, so `crew task open` fails before it prints the line `task-opened` looks for. The nested opener also cannot log in, so no child item is proven and `merged` and `proven-after-merge` cannot fire. `src/farewell.mjs` may only be written by the implementer; a lead writing it itself is exactly what `honest-ending` fails. No wording under `plugins/core/skills/crew/` or `plugins/core/agents/` can make these graders pass for the right reason, and the 2026-10-27-6 edit to the Plan page for this case gained nothing. The case needs a run with a real opener outside the sandbox, not a harness edit.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 2.69 USD
- Exit status: 0
