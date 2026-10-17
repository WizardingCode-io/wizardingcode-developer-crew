# Plan

Standard route: list the tasks in the conversation. Full route: write `.crew/work/<id>/plan.md`.

Each task names the criterion it serves and ends with something the engine can check:

```markdown
# Plan: <title>

1. AC-1: write the failing test for the discount in `tests/cart.test.ts`; red run.
2. AC-1: subtract the discount in `src/cart/total.ts`; green run.
3. AC-2: ...
4. Gates: `crew gate run <id>`.
```

Keep tasks small enough that each has its own red and green. Then `crew phase <id> next` to enter the build phase.

## The todo loop

Each todo of the plan ends with its own gate and its brief (SP7 §8.1). A handed-out task, after its merge: `crew task <id> gate T-n`, then `crew task <id> brief T-n`. A todo you do inline, after its commit: `crew task <id> note T-n --criteria AC-k --scope <path>[,<path>]` once (the text comes from `plan.md`'s line `n.`, or `--text "<todo>"`), then the same two commands. The gate runs the deterministic gates on the files the todo touched (the merge commit's diff, or the declared scope), never the secrets scan (the item's gate run covers the whole change); the test command is narrowed where the profile has a scoped template (detected for vitest, jest and pytest; set with `crew profile set testScoped "<cmd with {files}>" [--target <path>]` otherwise). Two failing rounds wait for a person (`team.maxGateRounds`; `crew continue <id> gate T-n` is the user's). The brief says what changed, what was proven and what is left; the leads read the briefs at delivery.

## Tasks for implementers

A task whose files are disjoint from the rest of the plan may go to an implementer: a headless session in a worktree on its own branch, running the method on the task as its own item (`references/mail.md`). A task is handed out from a commit: commit before you open one, since the child branches from HEAD and the engine refuses `crew task <id> open` while watched files are uncommitted. Then `crew task <id> open T-n --criteria AC-k,AC-m` (the text comes from `plan.md`'s line `n.`, or `--text "<task>"`). Up to `mail.maxConcurrent` tasks at once; pick the ones whose files do not touch. `crew task <id> list` shows each task's message status, child and verdict. A lead waiting for a task's reply runs `crew await <id> mail <message id>` once; `await user` is for a decision only a person can make. A reply that says proven: `crew task <id> merge T-n` (refused for an unproven child; `--force` is the user's decision, recorded as such), then your own `crew gate run <id>` proves the merged tree and the judgement gates see the whole diff. The report's "Tasks" section lists each task, its child and the child's report.
