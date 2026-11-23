---
name: wizardingcode-architecture-boundaries-contracts
description: "The architects team's rules for boundaries and contracts as the crew's architecture gate asks them: layers, the data model, contracts, integrations, the spec's Design and the neighbouring code, with what the user's links ask of a boundary, of a name and of an HTTP interface."
---

# Boundaries and contracts

## When

Before a change to a layer, to a module's boundary, to the data model, to a contract other code or another system relies on, or to an integration, and before such a change is judged. The first table is what the architecture gate asks, in its file's words, and the base it asks against is the project's own. The entry is `wizardingcode-architecture`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| Each new or changed piece lives where the base puts that kind of code, and a piece that crosses a boundary the base draws is drift. | `plugins/core/skills/crew/rubrics/architecture.md` | does each new or changed piece live where the base puts that kind of code (a query in the data layer, a rule in the domain, a format at the edge)? A piece that crosses a boundary the base draws is drift. |
| A field, a table or a relation is not added, renamed or reinterpreted without the model saying so. | `plugins/core/skills/crew/rubrics/architecture.md` | does the change add, rename or reinterpret a field, a table or a relation without the model saying so? A field with a new meaning is drift. |
| What other code or other systems rely on does not change without its contract changing with it, and a changed contract without its file is drift. | `plugins/core/skills/crew/rubrics/architecture.md` | does the change alter what other code or other systems rely on (a type, a route's shape, an event's payload, a return value) without the contract changing with it? A changed contract without its file is drift. |
| The change talks to something outside through the project's own adapter, and a new direct call where an adapter exists is drift. | `plugins/core/skills/crew/rubrics/architecture.md` | does the change talk to something outside (a service, a queue, a file system) through the project's own adapter, or on its own? A new direct call where an adapter exists is drift. |
| The change builds what the spec's Design says, in the place it says, and what the Design does not name is scope, named as such. | `plugins/core/skills/crew/rubrics/architecture.md` | does the change build what the Design says, in the place it says? A change that builds the same thing elsewhere is drift; a change that builds something the Design does not name is scope, named as such. |
| Where the base is silent the change does what the neighbouring code does, and a disagreement is advisory unless it crosses a boundary. | `plugins/core/skills/crew/rubrics/architecture.md` | when the base is silent, does the change do what the neighbouring code does (naming, error shapes, dependency direction)? A disagreement is advisory unless it crosses a boundary. |
| Drift from what the project defines is a defect, and the gate never asks whether another architecture would be better. | `plugins/core/skills/crew/rubrics/architecture.md` | Drift from what is defined is a defect (SP7 rule 9); the gate never asks whether another architecture would be better. |
| A defect is named as what the base says and what the change does, at a file and a line of the diff. | `plugins/core/skills/crew/rubrics/architecture.md` | each named as what the base says and what the change does, at a file and a line of the diff |

## Rules written from the user's links

Each row is a rule the crew wrote in its own words from one of the links the user gave on 2026-11-15, named in the second cell. Each link is one person's conventions. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with the project's own base or with a row of the crew's rules, the base and the crew's rule hold. No sentence of a link is copied, no link is installed, and a session opens none.

| Rule | Link |
| :- | :- |
| A boundary is sound when what sits inside it has one job and what crosses it is a stated promise, not a reach into another part's insides. | `45ck` |
| A boundary is reviewed against the changes the system is expected to take, and against the dependency graph where there is one. | `45ck` |
| Where two parts meet, someone owns the meeting point and what passes through it is written down. | `45ck` |
| Integrations with outside systems and those between the project's own parts are mapped together, each with the risk of coordination it carries. | `45ck` |
| In a layered design a dependency points one way only, and a concern every layer needs has a stated home instead of a copy in each. | `45ck` |
| A module is named for the one thing it does in the domain, and a name that could hold anything is a sign that it has no single purpose. | `davila7` |
| A controller holds no database query, and a component of the interface holds no business rule. | `davila7` |
| An error answer has one standard shape across the whole HTTP interface, the problem-details format, in place of a shape for each route. | `dandgabr` |
| An operation that fits none of create, read, update and delete is modelled as a named action on its resource. | `dandgabr` |
| A list is paged by a cursor, so that its paging is deterministic. | `dandgabr` |
| A mutation that may be retried is designed to be idempotent, the server recognising a repeat by a key the client sends. | `dandgabr` |
| A process that finishes after its request is answered is given the contract of a long-running operation, not that of an ordinary call. | `dandgabr` |

## Where the subjects are read

- Layers and boundaries: `sources.md`, the section of that name.
- Data and domain model: `sources.md`, the section of that name.
- Contracts: `sources.md`, the section of that name.
- Integrations: `sources.md`, the section of that name.
- The spec's Design: `sources.md`, the section of that name.
- Consistency with neighbours: `sources.md`, the section of that name.

## Where the links' rules come from

- `45ck`: 45ck/software-architecture-skills, MIT, read at commit 14966b2. Fourteen skills of one template; what the definition names of them entered.
- `davila7`: the file software-architecture of davila7/claude-code-templates, a repository under MIT, read at commit 1deb97c. Its text first appeared in a repository under GPL-3.0, so nothing of it is copied.
- `dandgabr`: dandgabr/skills, GPL-3.0, read at commit b23ec7f, in Brazilian Portuguese. Nothing of it is copied or translated; what the definition names of it entered in the crew's words.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates one of the user's links.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
