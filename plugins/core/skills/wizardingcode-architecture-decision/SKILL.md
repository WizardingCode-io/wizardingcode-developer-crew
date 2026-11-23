---
name: wizardingcode-architecture-decision
description: "The architects team's rules for a decision on the architecture or on a technology: the solution chosen by the case measured, the decision recorded in the project's own form, and what the user's links ask of an option, a tradeoff and a split into services."
---

# Decision

## When

Before a decision on the architecture's style, on a split into modules or services, on a technology or a dependency, or on how a decision is recorded, and before such a decision is judged. The crew's gate judges a change against what the project defines and never asks whether another architecture would be better: a row of the second table is a convention to weigh in a decision that is open, and no reason to change a base the project has. The entry is `wizardingcode-architecture`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The solution is chosen by the case, measured or estimated in writing, and is not the largest by default. | `plugins/core/teams/architects.md` | the solution is chosen by the case measured or estimated in writing, and not the largest by default |
| A decision is recorded in the form the project's own ADRs have. | `plugins/core/teams/architects.md` | The project's own ADRs, as the form to follow |
| For a technology or a dependency, what the project's framework already brings comes first. | `plugins/core/teams/architects.md` | The rule: first what the project's framework already brings. |
| In an existing project the team runs what the project uses, and each tool only where the project's stack takes it. | `plugins/core/teams/architects.md` | In an existing project the team runs what the project uses. Each tool runs only where the project's stack takes it. |
| Drift from what the project defines is a defect, and the gate never asks whether another architecture would be better. | `plugins/core/skills/crew/rubrics/architecture.md` | Drift from what is defined is a defect (SP7 rule 9); the gate never asks whether another architecture would be better. |
| Where the project states no base, the reviewer says so and reviews against the conventions the neighbouring code shows. | `plugins/core/skills/crew/rubrics/architecture.md` | When the project states no base, the reviewer says so under "Not answerable" and reviews against the conventions the neighbouring code shows. |
| A drift the diff did not introduce is named apart from the change and is never a defect. | `plugins/core/skills/crew/rubrics/architecture.md` | A drift the diff did not introduce is named under "Outside the change", never a defect. |
| A finding outside the changed files is advisory and is marked as debt. | `plugins/core/skills/crew/rubrics/architecture.md` | a finding outside the changed files is advisory and marked debt |

## Rules written from the user's links

Each row is a rule the crew wrote in its own words from one of the links the user gave on 2026-11-15, named in the second cell. Each link is one person's conventions. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with the project's own base or with a row of the crew's rules, the base and the crew's rule hold. No sentence of a link is copied, no link is installed, and a session opens none.

| Rule | Link |
| :- | :- |
| How personal data is kept private is weighed while a component is designed, not once it is built. | `dandgabr` |
| A decision record lets a later reader see why the choice was made and what else was on the table, not only what was chosen. | `45ck` |
| A style is chosen among alternatives that were really considered, each with what it would cost, and never by default or by fashion. | `45ck` |
| In the reasoning for a decision, what is known, what is assumed and what is still open are kept apart. | `45ck` |
| How far a system is split is decided by the people and the pressures it has today, not by the size it might one day reach. | `45ck` |
| A boundary between services is drawn where the data has one clear owner, and a split that is not worth what it costs to run is named as such. | `45ck` |
| A new component is decided from the outside in: what constrains it first, then its interfaces, and a pattern or code only after both. | `dandgabr` |

## Where the subjects are read

- Choosing the architecture style: `sources.md`, the section of that name.
- Decisions and documentation: `sources.md`, the section of that name.
- Evolution and debt: `sources.md`, the section of that name.
- Technology and dependencies: `sources.md`, the section of that name.
- AI and agents: `sources.md`, the section of that name.

## Where the links' rules come from

- `45ck`: 45ck/software-architecture-skills, MIT, read at commit 14966b2. Fourteen skills of one template; what the definition names of them entered.
- `dandgabr`: dandgabr/skills, GPL-3.0, read at commit b23ec7f, in Brazilian Portuguese. Nothing of it is copied or translated; what the definition names of it entered in the crew's words.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates one of the user's links.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
