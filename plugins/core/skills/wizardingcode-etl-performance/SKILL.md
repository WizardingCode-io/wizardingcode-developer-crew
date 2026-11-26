---
name: wizardingcode-etl-performance
description: "The ETL team's rules for timing a query or a pipeline at a stated volume and keeping the measure to compare against."
---

# Performance measuring

## When

Before a query or a pipeline is timed, before a claim about its speed is made, and before such a claim is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A query or a pipeline is timed at a stated volume, and the measure is kept to compare against. | `plugins/core/teams/etl.md` | Times a query or a pipeline at a stated volume and keeps the measure to compare against |
| The connection a measure runs through is written by its variable's name or a placeholder, never by its value. | `plugins/core/teams/etl.md` | A command that takes a token, a key, a password or a connection string is written with the variable's name or the page's placeholder and no value; a connection string is written with the page's placeholder or a local address with no credential. |
| A slower query with an index present is an advisory, not a defect. | `plugins/core/skills/crew/rubrics/data.md` | a slower query with an index present; a naming drift |

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
