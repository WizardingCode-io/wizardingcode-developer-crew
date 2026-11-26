---
name: wizardingcode-etl-lineage
description: "The ETL team's rules for tracing a number in a report back to its origin through the queries and the transformations that made it."
---

# Lineage tracer

## When

Before a number in a report is traced to its origin, and before a table that others read is changed. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A number in a report is followed back to its origin through the queries and the transformations. | `plugins/core/teams/etl.md` | Follows a number from the report back to its origin through the queries and the transformations |
| Lineage is followed through where the project keeps its schema, its models and its migrations. | `plugins/core/skills/crew/rubrics/data.md` | where the project keeps its schema, its models and its migrations |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Before changing an existing table, find every model that reads it, from the query definitions first and the lineage graph when needed, and warn that those consumers are affected. | `mozilla` |
| For a column passed through unchanged from a source table, find that source in the query's FROM clause and copy the column's description from the source's definition when it has one. | `mozilla` |

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
