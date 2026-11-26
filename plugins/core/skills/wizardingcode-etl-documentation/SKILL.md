---
name: wizardingcode-etl-documentation
description: "The ETL team's rules for a table's documentation and data dictionary: written from its schema and its data, and kept current when the schema changes."
---

# Documentation and data dictionary

## When

Before a table's documentation, its data dictionary or the description of a column is written or changed, and before such a change is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A table's documentation is written from its schema and its data, and kept current when the schema changes. | `plugins/core/teams/etl.md` | Writes a table's documentation from its schema and its data, and keeps it current when the schema changes |
| A naming drift or a missing comment on a tricky migration is an advisory, not a defect. | `plugins/core/skills/crew/rubrics/data.md` | a naming drift; a missing comment on a tricky migration; a batch size with no reason |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Each column's description says how a computed value is derived, the unit it is measured in and what a null in it means. | `mozilla` |
| Correct any column description that is empty or only restates the column's name, and make each one say what kind of value it holds, a count, a flag or a rate for instance. | `mozilla` |
| Start a derived column's description from the source's and add what the derivation changed, such as a filter, but keep that narrower wording out of the source's description. | `mozilla` |
| Whenever a change alters a table's output, update its declared schema in the same change and write a description for every new field. | `mozilla` |
| A table's overview states plainly which records it includes and which it excludes, or says that no record is excluded at that layer. | `mozilla` |

## Where the subjects are read

- Documentation, catalogue and lineage of the data: `sources.md`, the section of that name.

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
