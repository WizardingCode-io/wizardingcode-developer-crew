---
name: wizardingcode-etl-query-optimiser
description: "The ETL team's rules for a slow query: its plan read, the index or the rewrite proposed, with the plan before and after, and how queries, the ORM and transactions are used."
---

# Query optimiser

## When

Before a query, an index, an ORM call or a transaction is written or changed for its speed or its load, and before such a change is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A slow query's plan is read, and the index or the rewrite proposed comes with the plan before and after. | `plugins/core/teams/etl.md` | Reads a slow query's plan and proposes the index or the rewrite, with the plan before and after |
| A query has an index for what it filters or joins on, does not scan a growing table, and a list path loads relations once and not row by row. | `plugins/core/skills/crew/rubrics/data.md` | does an index exist for what the query filters or joins on; does a query scan a table that grows; does a list path load one row's relations per row (N+1) where the ORM loads them once |
| A relation loads as the model intends, a raw query stands only where the ORM's own is not safe, and no transaction spans a network call or a long step. | `plugins/core/skills/crew/rubrics/data.md` | is a relation loaded as the model intends; is a raw query used where the ORM's own is safe; does a transaction span a network call or a long step |
| The connection a plan is read through is written by its variable's name or a placeholder, never by its value. | `plugins/core/teams/etl.md` | A command that takes a token, a key, a password or a connection string is written with the variable's name or the page's placeholder and no value; a connection string is written with the page's placeholder or a local address with no credential. |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Restrict each read to the partitions it needs by filtering on the partition column, and filter rows before a join so less data moves between stages. | `mozilla` |
| Read from an aggregated, deduplicated table where one holds what is needed, and when the raw table cannot be avoided, write down why in the requirements along with its cost and speed. | `mozilla` |

## Where the subjects are read

- Queries and ORM use: `sources.md`, the section of that name.
- Transactions: `sources.md`, the section of that name.
- Indexes: `sources.md`, the section of that name.

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
