---
name: wizardingcode-etl-quality-monitor
description: "The ETL team's rules for checking data that arrives: against its expected schema, for completeness, duplicates and outliers, with what failed reported."
---

# Data quality monitor

## When

Before checks on the quality of a table or of data that arrives are written or changed, and before such a change is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| Incoming data is read against its expected schema, checked for completeness, duplicates and outliers, and what failed is reported. | `plugins/core/teams/etl.md` | Reads incoming data against its expected schema, checks completeness, duplicates and outliers, and reports what failed |
| The code reads each value with the schema's own type. | `plugins/core/skills/crew/rubrics/data.md` | does the code use the schema's types (a nullable read as present, a decimal read as a float, an enum widened) |
| A column that holds personal data states its retention and erasure as the project states them. | `plugins/core/skills/crew/rubrics/data.md` | does a new or changed column hold personal data, and are its retention and erasure stated as the project states them |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Watch freshness on tables loaded on a schedule, where staleness points to a failed load, and watch row volume on tables with predictable counts, where a sudden fall means lost data and a sudden rise duplicates. | `mozilla` |
| Put checks on the critical outputs of a data flow and on the tables behind reports, and leave out scratch tables that nobody reads. | `mozilla` |
| Let a failed check stop a deployment only for critical tables whose checks rarely raise false alarms, and let it merely alert while a table is still settling or false alarms are expected. | `mozilla` |
| Beyond freshness and row volume, check columns for nulls, duplicate values and malformed values, and add custom checks for the table's own business rules. | `mozilla` |
| When a freshness check fails, first confirm on the table itself that it did not update and that the check runs on a schedule aligned with the load, since either can raise a false alarm. | `mozilla` |

## Where the subjects are read

- Data quality and validation: `sources.md`, the section of that name.

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
