---
name: wizardingcode-etl-data-tests
description: "The ETL team's rules for the tests a table's schema and data call for: uniqueness, ranges and consistency between fields, on fixtures and never on live data."
---

# Data test generator

## When

Before the tests of a table, a query or a transformation are written or changed, and before such tests are judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A table gets the tests its schema and data call for: uniqueness, ranges and consistency between fields. | `plugins/core/teams/etl.md` | Writes the tests a table's schema and data call for: uniqueness, ranges, consistency between fields |
| A removed constraint or index is a defect, as is an N+1 in a list path or personal data kept without its retention. | `plugins/core/skills/crew/rubrics/data.md` | an N+1 in a list path the ORM would have avoided; a constraint or an index removed; personal data in a column without its retention |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Give every table the query reads its own fixture, even one that contributes next to nothing, so that the test reads its fixtures and no data beyond them. | `mozilla` |
| Treat a test that runs slowly, returns far more rows than its expected output or shows real identifiers as a sign that it reads data beyond its fixtures. | `mozilla` |
| Cover each join with rows that find a partner and rows that find none on every side the join keeps, plus the case where an inner join matches nothing. | `mozilla` |
| Test an incremental load on a run that updates records whose key already exists and merges new rows into stored state, and on a first run with no earlier state. | `mozilla` |
| When the expected rows follow a sort, give the sort columns distinct values in the fixtures so the order of the result is fixed. | `mozilla` |

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
