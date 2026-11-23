---
name: wizardingcode-architecture-quality-risk
description: "The architects team's rules for quality attributes and for risk in production: what the crew's risk gate asks of the first hour, of rollback and of third parties, where a measuring tool may run, and what the user's links ask of a quality scenario, of a risk and of scale."
---

# Quality attributes and risk

## When

Before a change whose failure would show in production, before a quality attribute is stated or measured, and before such a change is judged. A tool that measures a quality attribute runs against the project's own local or test environment and nothing else. The first table's questions are the risk gate's, and that gate runs on the full route only. The entry is `wizardingcode-architecture`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The tools that measure a quality attribute run against the project's own local or test environment and nothing else. | `plugins/core/teams/architects.md` | These tools run against the project's own local or test environment and nothing else. |
| The gate asks what fails first and how anyone would know, and a failure nobody would see is the worst answer. | `plugins/core/skills/crew/rubrics/risk.md` | what fails first if this is wrong, and how would anyone know (a log line, a metric, an alert, a complaint)? A failure nobody would see is the worst answer. |
| The gate asks whether the deploy can be reverted without losing the data written in between, and whether each migration has a down path or a stated reason why not. | `plugins/core/skills/crew/rubrics/risk.md` | can the deploy be reverted without losing data written in between; does each migration have a down path or a stated reason why not; is a backfill or a data fix reversible? |
| The gate asks what the change deletes, overwrites, sends or charges, whether its first run is limited, and whether that limit is in the code or only in the plan. | `plugins/core/skills/crew/rubrics/risk.md` | what the change deletes, overwrites, sends or charges; is the first run limited (a count, a dry run, one tenant), and is the limit in the code or only in the plan? |
| The gate asks what happens when a third party is down, slow or answers wrong, what each call costs and how many the first run makes. | `plugins/core/skills/crew/rubrics/risk.md` | what happens when the third party is down, slow or answers wrong; what each call costs and how many the first run makes? |
| The gate asks whether the change assumes something another deploy, another project or a configuration value must provide first, and whether the spec says so. | `plugins/core/skills/crew/rubrics/risk.md` | does the change assume something another deploy, another project or a configuration value must provide first, and does the spec say so? |
| The gate asks whether the plan names the manual steps of the deploy, who takes them and in which order. | `plugins/core/skills/crew/rubrics/risk.md` | does the plan name the manual steps (a value to set, a job to run once, a flag to turn), who takes them and in which order? |
| A risk the repository already carried is debt, and the gate asks what this item adds to it. | `plugins/core/skills/crew/rubrics/risk.md` | A risk the repository already carried (a table with no backup, a provider with no timeout anywhere) is debt, named under "Outside the change"; the gate asks what this item adds to it. |
| The risk gate has no deterministic input, is a reviewer's reading of the spec, the plan and the diff against each other, and runs on the full route only. | `plugins/core/skills/crew/rubrics/risk.md` | It has no deterministic input; it is a reviewer's reading of the spec, the plan and the diff against each other. Full route only. |

## Rules written from the user's links

Each row is a rule the crew wrote in its own words from one of the links the user gave on 2026-11-15, named in the second cell. Each link is one person's conventions. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with the project's own base or with a row of the crew's rules, the base and the crew's rule hold. No sentence of a link is copied, no link is installed, and a session opens none.

| Rule | Link |
| :- | :- |
| A quality goal counts once it is written as a situation the system must handle and a figure it must meet. | `45ck` |
| Each architectural risk is ranked, and the worst get a way to reduce them or a small trial that would settle the doubt. | `45ck` |
| Risks and open unknowns are looked for while the design is still cheap to change. | `45ck` |
| A review for availability asks, for the journeys that matter most, what one failure would take down and how the system carries on and comes back. | `45ck` |
| Where the system will first run out under load is guessed early from its shape and its expected use, and is written down as a guess. | `45ck` |
| The load and the storage a design must carry are estimated in figures before its structure is drawn. | `dandgabr` |
| A failing dependency is isolated, so that its failure costs its callers little and does not reach the parts that do not use it. | `dandgabr` |
| What a store does when its nodes cannot reach each other is a property the design chooses the store by, not one it discovers in production. | `dandgabr` |
| Where a single writer feeds replicas that lag behind it, the design says what a user who has just written sees when reading from a replica. | `dandgabr` |
| A cache is a second copy with failure modes of its own, and the design says which of them it accepts. | `dandgabr` |

## Where the subjects are read

- Risk in production: `sources.md`, the section of that name.
- Quality attributes: `sources.md`, the section of that name.

## Where the links' rules come from

- `45ck`: 45ck/software-architecture-skills, MIT, read at commit 14966b2. Fourteen skills of one template; what the definition names of them entered.
- `dandgabr`: dandgabr/skills, GPL-3.0, read at commit b23ec7f, in Brazilian Portuguese. Nothing of it is copied or translated; what the definition names of it entered in the crew's words.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates one of the user's links.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
