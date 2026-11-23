---
name: wizardingcode-architecture-views
description: "The architects team's rules for the views of an architecture: what a runtime view, a deployment view and a diagram at each level of zoom show, written from the user's links, drawn with the tools the project already uses."
---

# Views

## When

Before a view or a diagram of the architecture is drawn or changed, a runtime view, a deployment view or a diagram of the system at one of its levels, and before one is judged. In an existing project a diagram is made with what the project uses. This skill holds no subject of the definition's section 3. The entry is `wizardingcode-architecture`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| None of the user's four links is installed, and text under the GPL is not copied. | `plugins/core/teams/architects.md` | None of the four is installed, and text under the GPL is not copied. |
| In an existing project the team runs what the project uses, and each tool only where the project's stack takes it. | `plugins/core/teams/architects.md` | In an existing project the team runs what the project uses. Each tool runs only where the project's stack takes it. |
| The dependency map is made as an image from the boundary tools of the declaration's table, with Graphviz. | `plugins/core/teams/architects.md` | the dependency map as an image, from the tools of the first row with Graphviz |

## Rules written from the user's links

Each row is a rule the crew wrote in its own words from one of the links the user gave on 2026-11-15, named in the second cell. Each link is one person's conventions. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with the project's own base or with a row of the crew's rules, the base and the crew's rule hold. No sentence of a link is copied, no link is installed, and a session opens none.

| Rule | Link |
| :- | :- |
| The widest diagram shows the system whole among the people and the systems around it, and each narrower one opens a single part of the one before. | `dandgabr` |
| A runtime view is told as what happens over time in the flows that matter, the unhappy paths among them. | `45ck` |
| A deployment view says where each piece of software runs and what that placement makes possible or puts at risk. | `45ck` |
| A diagram answers a question someone has, and says which. | `45ck` |
| Detail is added to a diagram only where a reader would otherwise be lost, and a drawing a tool can generate from the code is not kept by hand. | `dandgabr` |
| A diagram can be read without its author: nothing on it is unlabelled, and no arrow leaves the reader to guess what passes along it. | `dandgabr` |

## Where the subjects are read

- C4, arc42 and the diagram tools are read under the subject "Decisions and documentation": `wizardingcode-architecture-decision/sources.md`, the section of that name.

## Where the links' rules come from

- `45ck`: 45ck/software-architecture-skills, MIT, read at commit 14966b2. Fourteen skills of one template; what the definition names of them entered.
- `dandgabr`: dandgabr/skills, GPL-3.0, read at commit b23ec7f, in Brazilian Portuguese. Nothing of it is copied or translated; what the definition names of it entered in the crew's words.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates one of the user's links.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
