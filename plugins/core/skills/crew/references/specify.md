# Specify

Every change has a spec. Its size follows the route.

## Fast route: criteria only

One or more criteria, each a single sentence that a test can check:

```
crew criteria <id> add "The cart total subtracts an active discount."
```

A refactor or a chore changes no behaviour. Its criterion preserves behaviour and is recorded as such. The same goes for any criterion that says "stays green", "keeps passing" or "the suite passes" on any route: it has no red run, so it is `preserve`, never `behavior`. The gates themselves (lint, typecheck, the full suite) are never a criterion; they run anyway.

```
crew criteria <id> add "Existing cart tests keep passing." --kind preserve
crew start "<request>" --answers '<json>' --preserve "Existing cart tests keep passing."
```

## Standard route: a short spec

Write `.crew/work/<id>/spec.md` and add each criterion with `crew criteria`:

```markdown
# <title>

## Problem
One paragraph.

## Acceptance criteria
- AC-1: <observable result>
- AC-2: <observable result>

## Out of scope
What this change does not do.
```

## Full route: the complete spec, approved

Same file, with these sections: Problem, Design (the chosen approach and the alternatives rejected, with the reason), Acceptance criteria, Risks and rollback, Out of scope. Present it to the user, mark the work as waiting, and when the user agrees run `crew approve <id> spec` yourself; the permission prompt is their signature, in auto mode too. Only in a headless session, or in bypassPermissions or dontAsk mode, the hook asks for `--mode <mode>`: the approval is recorded as the agent's and satisfies the full route only if `policy.json` sets `unattendedDecisions` to `count`.

The engine checks that `spec.md` exists and has a non-empty "Acceptance criteria" section before the build phase; the quality of the spec is your responsibility.
