---
name: wizardingcode-etl-pandas-polars
description: "The ETL team's rules for data frames in Python: pandas, and when it stops being enough and Polars or DuckDB take over, read from the projects' own documentation."
---

# pandas and Polars

## When

Before a transformation is written with pandas, Polars or DuckDB, before one of them is chosen over another, and before such a choice is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| pandas is read from its own documentation, with when it stops being enough and Polars or DuckDB take over. | `plugins/core/teams/etl.md` | From the two projects' own documentation, with when pandas stops being enough and Polars or DuckDB take over |
| A library runs only where the project's database and stack take it. | `plugins/core/teams/etl.md` | Each tool runs only where the project's database and stack take it. |

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
