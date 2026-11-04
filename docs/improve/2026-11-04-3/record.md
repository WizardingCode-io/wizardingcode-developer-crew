# Improvement run 2026-11-04-3

- At: 2026-11-04T02:00:07.933Z
- Targets: rounds-bounded, task-implementer-worktree
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| rounds-bounded | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| task-implementer-worktree | 0.00, 0.00, 0.00 | 0.00 | 0.00 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no harness file, because neither listed grader can be moved by one. `rounds-bounded` is at mean 1.00 with no evidence, so it is passing and nothing was edited for it. `task-implementer-worktree` is tagged `needs-real-opener`, and every one of its five graders is out of reach inside the kit's sandbox, not because of the text the lead reads: the sandbox's `git` is the xcrun shim that fails with exit 72 for the agent and for the engine's own calls (finding 77, confirmed by the 2026-10-24 sandbox probe and still reported in the 2026-10-28 eval record), and `crew task open` needs git three times (a HEAD to branch from, `git branch --list`, `git worktree add`), so the engine refuses it before it prints the `T-2 opened: message M-…` line the `task-opened` regex wants. Even with git, the nested `claude -p` the opener spawns answers "Not logged in" in the sandbox (the README's real-opener section), so no child item is ever proven and `merged` and `proven-after-merge` cannot fire; `farewell-exists` needs `src/farewell.mjs`, which only the implementer may write, since a lead writing it is the `honest-ending` judge's FAIL condition, and that judge's PASS needs the implementer flow to have run. The baseline records fit this exactly: `reads: []` or only `plan.md`, no engine line, no file, three FAIL votes, and the 2026-10-27-6 run's Plan-page edit for this case gained nothing. The case passed in the owner's end-to-end run of 2026-10-17 after the Task 8 engine fixes, which is how the README says these cases are recorded. I saved this as a memory so a later run does not spend budget on it.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: Both facts hold: the case still carries the `needs-real-opener` tag at `plugins/core/evals/task-implementer-worktree/case.yaml:4`, and the suite runner skips that tag (`packages/engine/tests/eval-runner.test.ts:252`). No file was changed.

I changed no harness page in this run, because neither listed grader can be moved by the text the agents read. `rounds-bounded` is listed at mean 1.00, spread 0.00 with evidence `none`, so it already passes for the right reason and an edit made for it would have no failing evidence behind it. `task-implementer-worktree` sits at mean 0.00, spread 0.00 with all five graders failing, and that is a property of the improve kit's sandbox, not of the harness: the case is tagged `needs-real-opener` and skipped by the suite's own runner, because inside the eval sandbox on macOS `git` is the xcrun shim that fails with exit 72 for the agent and for the engine alike (the 2026-10-24 sandbox probe, still true in later records), so `crew task open` is refused before it prints the `T-2 opened: message M-…` line the `task-opened` regex wants; the nested `claude -p` opener answers "Not logged in" under the sandbox's temporary config dir, so no child item is ever proven and `merged` and `proven-after-merge` cannot fire; `farewell-exists` needs `src/farewell.mjs`, which only the implementer may write, and a lead writing it itself is exactly the `honest-ending` FAIL condition. The 2026-10-27-6 run edited the Plan page for this case and gained nothing, and the case did pass in the owner's end-to-end run from a plain terminal, so the kit's zero is a measurement gap to be filled by a real-opener run, not a defect in the skill or agent pages.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 7.83 USD
- Exit status: 0
