# Receive

Goal: turn the request into a brief the engine can route, and ask only what changes the plan.

## 1. Answer the typed questions

Answer these nine questions about the request before anything else. Probabilities are honest estimates, not wishes; a guess of 0.3 or more on a risk question sends the work to the full route, which is the safe side.

| Id | Type | Question |
| :- | :- | :- |
| `work_type` | choice | `fix`, `feature`, `refactor`, `chore`, `new-product`, `question` |
| `is_vague` | 0 to 1 | Is information missing without which two competent engineers would build different things? |
| `scope` | 0 to 3 | 0 one spot, 1 one module, 2 several modules, 3 the whole system |
| `touches_auth` | 0 to 1 | Authentication, authorization or sessions |
| `touches_payments` | 0 to 1 | Payments, billing or pricing |
| `touches_personal_data` | 0 to 1 | Reads, stores or exposes personal data |
| `touches_data_migration` | 0 to 1 | A schema change or a data migration |
| `touches_infra` | 0 to 1 | Infrastructure, deployment or CI |
| `touches_public_api` | 0 to 1 | An interface other systems depend on |

If `work_type` is `question`, answer the user. No work item is created.

## 2. Start the work item

```
crew start "<the request, as the user wrote it>" --answers '{"work_type":"fix","is_vague":0.1,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
```

The engine prints the id and the route with its reasons. Keep the id; every later command needs it.

## 3. Ask what is missing

When `is_vague` was 0.5 or more, mark the work as waiting (`crew await <id> user`), ask the questions whose answers would change what you build, and nothing else. Fit the questions on one screen. When the answers come, `crew resume <id>` and rewrite `.crew/work/<id>/brief.md`:

```markdown
# Brief

## Goal
What the user gets when this is done, in one or two sentences.

## Context
What exists today and why it is not enough.

## Constraints
What must not change; what the user ruled out.

## Acceptance
The observable results, one per line. These become the criteria.
```

On the fast route, the brief stays as the engine wrote it.
