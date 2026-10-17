# Receive

Goal: turn the request into a brief the engine can route, and ask only what changes the plan.

## 1. Answer the typed questions

The nine questions are on the skill page (`SKILL.md`, "The nine typed questions"); answer them before anything else.

## 2. Start the work item

```
crew start "<the request, as the user wrote it>" --answers '{"work_type":"fix","is_vague":0.1,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
```

The answers are required: `crew start` refuses without them. The engine prints the id and the route with its reasons, and how many entries the project's decision register holds (`crew decisions` lists them; on standard and full, read it in Understand). Keep the id; every later command needs it. `--criterion "<text>"` (repeatable) records acceptance criteria at the start; on the fast route that is the whole Specify phase.

## 3. Ask what is missing

When `is_vague` was 0.5 or more, mark the work as waiting (`crew await <id> user`), ask the questions whose answers would change what you build, and nothing else. Fit the questions on one screen. When the answers come, rewrite `.crew/work/<id>/brief.md`:

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
