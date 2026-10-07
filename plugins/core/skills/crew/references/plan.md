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
