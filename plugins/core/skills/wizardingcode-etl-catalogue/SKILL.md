---
name: wizardingcode-etl-catalogue
description: "The ETL team's rules for a catalogue of the datasets: what each holds and who owns it, read from the catalogue the project already has."
---

# Data catalogue

## When

Before the datasets of a project are listed or their owners named, and before such a list is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The datasets are listed with what each holds and who owns it, read from the catalogue the project has where it has one. | `plugins/core/teams/etl.md` | Lists the datasets, what each holds and who owns it; where the project has DataHub or OpenMetadata it reads them |
| A column that holds personal data states its retention and erasure as the project states them. | `plugins/core/skills/crew/rubrics/data.md` | does a new or changed column hold personal data, and are its retention and erasure stated as the project states them |
| A catalogue's credential is written by its variable's name or a placeholder, never by its value. | `plugins/core/teams/etl.md` | A command that takes a token, a key, a password or a connection string is written with the variable's name or the page's placeholder and no value; a connection string is written with the page's placeholder or a local address with no credential. |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Register every table with its owners, preferably teams over single people, a readable name and a description of what it is for. | `mozilla` |
| Look up a table's structure first in the definitions kept beside the transformation code, and query the shared catalogue only when those lack it or to confirm what was found. | `mozilla` |
| When a source's existing description is unclear or incomplete, write the improved wording as a recommendation to that source's owners, so every downstream table gains from it. | `mozilla` |
| Match each table's columns to the shared column definitions by name or alias, and where an alias is in use, propose renaming it to the canonical name. | `mozilla` |

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
