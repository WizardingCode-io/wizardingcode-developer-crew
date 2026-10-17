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

## Tasks for implementers

A task whose files are disjoint from the rest of the plan may go to an implementer: a headless session in a worktree on its own branch, running the method on the task as its own item (`references/mail.md`). A task is handed out from a commit: commit before you open one, since the child branches from HEAD and the engine refuses `crew task <id> open` while watched files are uncommitted. Then `crew task <id> open T-n --criteria AC-k,AC-m` (the text comes from `plan.md`'s line `n.`, or `--text "<task>"`). Up to `mail.maxConcurrent` tasks at once; pick the ones whose files do not touch. `crew task <id> list` shows each task's message status, child and verdict. A lead waiting for a task's reply runs `crew await <id> mail <message id>` once; `await user` is for a decision only a person can make. A reply that says proven: `crew task <id> merge T-n` (refused for an unproven child; `--force` is the user's decision, recorded as such), then your own `crew gate run <id>` proves the merged tree and the judgement gates see the whole diff. The report's "Tasks" section lists each task, its child and the child's report.
