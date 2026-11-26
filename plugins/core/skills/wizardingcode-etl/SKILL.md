---
name: wizardingcode-etl
description: "The ETL team's entry: the interview and the choice of how to store, move and process data, by a volume measured or estimated in writing, and where each of the team's thirteen subjects is held."
---

# Sizing to the volume

## When

Read this skill before a change to a schema, a query, a pipeline or a load of data, before a choice of how to store or move data, and before such a change is judged. Find the subject below and read the skill that holds it; this skill holds the interview and the choice that come first. A larger solution is proposed only from a volume measured, or estimated in writing, and said in the item. The engine records no measured volume on an item yet: this skill gives the interview and the choice, and the measure or the written estimate is said in the item's report. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one.

## The thirteen subjects

| Subject | Skill | Its sources |
| :- | :- | :- |
| Schema and migrations | `wizardingcode-etl-schema-evolution` | `wizardingcode-etl-schema-evolution/sources.md`, the section of that name |
| Queries and ORM use | `wizardingcode-etl-query-optimiser` | `wizardingcode-etl-query-optimiser/sources.md`, the section of that name |
| Transactions | `wizardingcode-etl-query-optimiser` | `wizardingcode-etl-query-optimiser/sources.md`, the section of that name |
| Indexes | `wizardingcode-etl-query-optimiser` | `wizardingcode-etl-query-optimiser/sources.md`, the section of that name |
| Availability of the data while the change runs | `wizardingcode-etl-schema-evolution` | `wizardingcode-etl-schema-evolution/sources.md`, the section of that name |
| Pipelines | `wizardingcode-etl-pipeline` | `wizardingcode-etl-pipeline/sources.md`, the section of that name |
| Data quality and validation | `wizardingcode-etl-quality-monitor` | `wizardingcode-etl-quality-monitor/sources.md`, the section of that name |
| Imports, exports and file formats | `wizardingcode-etl-pipeline` | `wizardingcode-etl-pipeline/sources.md`, the section of that name |
| Integrations and synchronisation between systems | `wizardingcode-etl-pipeline` | `wizardingcode-etl-pipeline/sources.md`, the section of that name |
| Backups, restore and retention | `wizardingcode-etl-schema-evolution` | `wizardingcode-etl-schema-evolution/sources.md`, the section of that name |
| Data warehouse and analytics | `wizardingcode-etl` | `wizardingcode-etl/sources.md`, the section of that name |
| Sizing the solution to the volume | `wizardingcode-etl` | `wizardingcode-etl/sources.md`, the section of that name |
| Documentation, catalogue and lineage of the data | `wizardingcode-etl-documentation` | `wizardingcode-etl-documentation/sources.md`, the section of that name |

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The solution is chosen by an interview and by a volume measured or estimated in writing, from a small load to billions of rows. | `plugins/core/teams/etl.md` | The interview and the choice of the solution, from a small load to billions of rows, by a volume measured or estimated in writing |
| An existing project keeps the tools it uses, and a new one chooses by the measured volume. | `plugins/core/teams/etl.md` | In an existing project the team runs what the project uses; for a new one it chooses by the measured volume |
| A tool runs only where the project's database and stack take it. | `plugins/core/teams/etl.md` | Each tool runs only where the project's database and stack take it. |
| A backfill is batched, and no migration holds a lock across a long step on a table the application reads. | `plugins/core/skills/crew/rubrics/data.md` | Availability: does a migration hold a lock across a long step on a table the application reads; is a backfill batched? |
| A change is judged by what it does to stored data. | `plugins/core/skills/crew/rubrics/data.md` | The data gate asks what the change does to stored data: its schema and migrations, its queries and ORM use, its transactions and indexes, and the availability of the data while the change runs. |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Before any query is drafted, settle precisely what a single output row stands for and at what time unit, because every later design choice depends on that answer. | `mozilla` |
| Open the interview by learning which business activity the model represents, who will consume it and to decide what, and a handful of concrete questions it must answer, raised as the talk unfolds rather than in one batch. | `mozilla` |
| Ask how current the data must be and how far back its history must reach, and partition the table on the same time unit as its grain. | `mozilla` |
| Load large tables and append-style daily data incrementally by default, and reserve full rebuilds for small reference tables or data whose past values can still change. | `mozilla` |
| Record before building what must already exist upstream, what will consume the result downstream, and every open blocker with its owner and date where these are known. | `mozilla` |

## Where the subjects are read

- Data warehouse and analytics: `sources.md`, the section of that name.
- Sizing the solution to the volume: `sources.md`, the section of that name.

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What the skills hold

- No rule of the eleven comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
