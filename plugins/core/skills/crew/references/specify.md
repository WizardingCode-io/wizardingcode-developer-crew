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

A criterion that passes after the change but can have no red run (an end-to-end test against a stubbed server, a check the environment cannot fail on purpose) is `observed`, not a skip:

```
crew criteria <id> add "The stubbed checkout flow passes end to end." --kind observed
```

It is proven with `crew tdd observed <id> AC-n --reason "<why no red run can exist>"`, and the report shows the reason apart from skips.

A criterion whose text a later revision made false is never removed once it has a record (evidence stays): `crew criteria supersede AC-n --by AC-m` records that AC-m's text replaces AC-n's. The report shows both, with what AC-n proved on its own; the verdict reads AC-m's proof for AC-n; AC-m must prove at least as much (a behaviour by a behaviour, a preservation by a preservation or a behaviour, an observation by any), and an objection still bound to AC-n is resolved against AC-m first.

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

Same file, with these sections: Problem, Design (the chosen approach and the alternatives rejected, with the reason), Acceptance criteria, Risks and rollback, Out of scope. The approval follows the gap round (`references/conclave.md`), not a ritual:

- The round found nothing to decide (every decision answered or with a stated default, no blocking objection open): approve under the rule yourself, `crew approve <id> spec --validator complete-gap-round`. The engine checks the four sections, the defaults and the bindings, refuses while one is missing, and records "by the validator (rule: complete-gap-round)". No question to the user.
- The round found a decision: present it in one message (what is being decided, why, the facts, the evidence, the default you propose), wait for the user's positive word, record it with `crew decide`, then `crew approve <id> spec` yourself. Under the default policy no prompt appears and the record says "by the user, relayed by the agent".

Only in a headless session, or in bypassPermissions or dontAsk mode, the hook asks for `--mode <mode>`: the approval is recorded as the agent's or the validator's and satisfies the full route only if `policy.json` sets `unattendedDecisions` to `count` or `validator`.

The engine checks that `spec.md` exists and has a non-empty "Acceptance criteria" section before the build phase; the quality of the spec is your responsibility.
