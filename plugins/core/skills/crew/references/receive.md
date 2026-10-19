# Receive

Goal: turn the request into a brief the engine can route, and ask only what changes the plan.

## 1. Answer the typed questions

The nine questions are on the skill page (`SKILL.md`, "The nine typed questions"); answer them before anything else.

Two optional answers may join them: `kind` (choice: `client-request`, `cross-project`, `new-project`, `feature`, `issue`) and `priority` (a level: 0 low, 1 normal, 2 high, 3 blocker). Without `kind` the engine derives it and says from what (`kind issue (from work_type fix)` at `crew start`): a fix is an issue and a new product a new project whatever the channel; an item started with `--origin` is cross-project; a request that entered from a task manager or a document is a client request; anything else is a feature. An answer is taken where the type leaves it open and refused where it would lower a fix or a new product. `priority` sets the item's priority when neither `--priority` nor an origin message gives one. An issue walks through Analyse before Understand (or before Build on the fast route): `references/analyse.md`.

## 2. Start the work item

```
crew start "<the request, as the user wrote it>" --answers '{"work_type":"fix","is_vague":0.1,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
```

The answers are required: `crew start` refuses without them.

**From a task manager** (ClickUp first, through the MCP tools the session holds; Jira and Notion later): read the ticket with those tools, pass its text as the request, and record where it came from with `--source '{"channel":"task-manager","connector":"clickup","externalId":"<id>","url":"<url>","proposedPriority":"<blocker|high|normal|low>"}'`: the brief quotes the text under `## Source`, the kind is `client-request`, and the ticket's own urgency is a proposal (everything is critical in a task manager; the business decides). **From a document** in the repository: `--source '{"channel":"document","documentPath":"docs/requests/<file>.md"}'` reads the document whole into the brief; a document is one item by default, and a split into several is a decision you propose with `crew decision <id> add`, never assume. The engine never calls a task manager: you read, it records.

**The triage.** A source's proposed priority is judged against the business priorities the user signed once (`crew workspace priorities` says where they stand; `crew workspace priorities accept --file <path>` copies the user's file in and signs it: a user's decision, like `crew accept`). With them signed, `crew start` confirms the proposal, or lowers it with `--priority <lower> --reason "<why>"`; a raise is refused. Without a signed file the proposal stays unconfirmed on record (`priority high (proposed, unconfirmed: no signed business priorities)`), the report says so, and `--priority` is refused until the user signs. When nobody is present and the source is a ticket, echo the triage as a comment on the ticket with the session's tools.

A request that came by mail carries a priority: confirm or lower it on record before the item starts (`crew mail accept <message id> [--priority <p>] --reason "<why>"`, `references/mail.md`), and the item takes the confirmed level; `--priority blocker|high|normal|low` sets an item's own, `normal` otherwise. `crew status` prints it after the route. The engine prints the id and the route with its reasons, and how many entries the project's decision register holds (`crew decisions` lists them; on standard and full, read it in Understand). Keep the id; every later command needs it. `--criterion "<text>"` (repeatable) records acceptance criteria at the start; on the fast route that is the whole Specify phase.

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
