---
name: wizardingcode-research-evidence-map
description: "The researchers team's rules for an evidence map: one question and one position, four kinds of node and four kinds of edge, evidence held to a bounded region of a source, and what is not known written as unknown and never as a number."
---

# Evidence map

## When

Before an evidence map is made for a question whose answer rests on several pieces of evidence that support, contradict or qualify one another, and before such a map is judged. The crew has no script that validates a map: a map made by this skill is read, and none is called valid. The entry is `wizardingcode-research`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The map is a graph of four kinds of node, position, claim, evidence and unknown, and four kinds of edge, supports, contradicts, qualifies and missing. | `plugins/core/teams/researchers.md` | four kinds of node (position, claim, evidence, unknown) and four kinds of edge (supports, contradicts, qualifies, missing) |
| No confidence percentage is invented, and what is not known is written as unknown. | `plugins/core/teams/researchers.md` | No confidence percentage is invented: what is not known is written as unknown. |
| In a conflict both sources are given, with no average and no winner picked. | `plugins/core/teams/researchers.md` | in a conflict both are given, with no average and no winner picked |
| The result of a research gives the contrary evidence, the open questions and what is past its freshness window. | `plugins/core/teams/researchers.md` | The contrary evidence, the open questions, and what is past its freshness window. |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from one of the sources the user gave on 2026-11-15, named in the second cell. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of a source is copied, no source is installed by this skill, and a session opens none.

| Rule | Source |
| :- | :- |
| An edge is drawn for what one node does to another, and neither a shared subject nor a difference of setting is by itself such a relation. | `evidence-map` |
| A map is about one question a reader could act on, with the answer it favours for now given as provisional. | `evidence-map` |
| Evidence against the answer stays on the map when the answer survives it, as a contradiction or as a qualification. | `evidence-map` |
| A node of evidence says what one located passage of a source says and no more, and a passage that cannot be located gives an unknown and not evidence. | `evidence-map` |
| A map whose shape is sound is traceable, and is not thereby true. | `evidence-map` |
| A gap is written as the one fact whose absence leaves the answer open, not as a call for more research. | `evidence-map` |

## Where the sources' rules come from

- `evidence-map`: github/awesome-copilot, MIT, read at commit f10fdb8.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates one of the user's sources.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
