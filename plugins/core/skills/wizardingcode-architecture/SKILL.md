---
name: wizardingcode-architecture
description: "The entry to the architects team's skills: sends each of the thirteen subjects of the team's definition to the skill that holds the crew's rule for it and to the section of its sources."
---

# Architecture

## When

Before a change to a boundary, a model, a contract or an integration, before a decision on the architecture or on a technology, and before such a change is judged. Find the subject below and read the skill that holds it. A view or a diagram of the architecture is in `wizardingcode-architecture-views`, which holds no subject of its own.

## The thirteen subjects

| Subject | Skill | Its sources |
| :- | :- | :- |
| Layers and boundaries | `wizardingcode-architecture-boundaries-contracts` | `wizardingcode-architecture-boundaries-contracts/sources.md`, the section of that name |
| Data and domain model | `wizardingcode-architecture-boundaries-contracts` | `wizardingcode-architecture-boundaries-contracts/sources.md`, the section of that name |
| Contracts | `wizardingcode-architecture-boundaries-contracts` | `wizardingcode-architecture-boundaries-contracts/sources.md`, the section of that name |
| Integrations | `wizardingcode-architecture-boundaries-contracts` | `wizardingcode-architecture-boundaries-contracts/sources.md`, the section of that name |
| The spec's Design | `wizardingcode-architecture-boundaries-contracts` | `wizardingcode-architecture-boundaries-contracts/sources.md`, the section of that name |
| Consistency with neighbours | `wizardingcode-architecture-boundaries-contracts` | `wizardingcode-architecture-boundaries-contracts/sources.md`, the section of that name |
| Risk in production | `wizardingcode-architecture-quality-risk` | `wizardingcode-architecture-quality-risk/sources.md`, the section of that name |
| Choosing the architecture style | `wizardingcode-architecture-decision` | `wizardingcode-architecture-decision/sources.md`, the section of that name |
| Decisions and documentation | `wizardingcode-architecture-decision` | `wizardingcode-architecture-decision/sources.md`, the section of that name |
| Quality attributes | `wizardingcode-architecture-quality-risk` | `wizardingcode-architecture-quality-risk/sources.md`, the section of that name |
| Evolution and debt | `wizardingcode-architecture-decision` | `wizardingcode-architecture-decision/sources.md`, the section of that name |
| Technology and dependencies | `wizardingcode-architecture-decision` | `wizardingcode-architecture-decision/sources.md`, the section of that name |
| AI and agents | `wizardingcode-architecture-decision` | `wizardingcode-architecture-decision/sources.md`, the section of that name |

## Rules written from the user's links

Each row is a rule the crew wrote in its own words from one of the links the user gave on 2026-11-15, named in the second cell. Each link is one person's conventions. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with the project's own base or with a row of the crew's rules, the base and the crew's rule hold. No sentence of a link is copied, no link is installed, and a session opens none.

| Rule | Link |
| :- | :- |
| A business rule does not depend on the framework the project is built with. | `davila7` |
| The entities of the domain are kept apart from the code that stores, sends or serves them. | `davila7` |

## Where the links' rules come from

- `davila7`: the file software-architecture of davila7/claude-code-templates, a repository under MIT, read at commit 1deb97c. Its text first appeared in a repository under GPL-3.0, so nothing of it is copied.

## What the skills hold

- No rule of the four comes from a page of section 3: a row quotes a file of the crew or restates one of the user's links.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
