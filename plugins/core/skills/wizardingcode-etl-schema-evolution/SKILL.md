---
name: wizardingcode-etl-schema-evolution
description: "The ETL team's rules for a schema that changes: what arrived set beside what was expected, migrations that can be undone, data copied before a destructive step, backups and availability."
---

# Source schema evolution

## When

Before a pipeline runs on a schema that may have changed, before a migration or a change of backups and retention, and before such a change is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The schema that arrived is set beside the one expected, and what was added, removed or renamed is said before a pipeline runs. | `plugins/core/teams/etl.md` | Compares the schema that arrived with the one expected, and says what was added, removed or renamed before a pipeline runs |
| Each migration step can be undone or says why not, data is copied before a destructive step, and the run order is fixed where it matters. | `plugins/core/skills/crew/rubrics/data.md` | Migrations: is each step reversible, or is the reason it is not stated beside it; is data copied before a destructive step (a drop, a rename, a type narrowed); does the run order matter and is it fixed |
| A data loss a reader can name and an irreversible step with no stated reason are defects. | `plugins/core/skills/crew/rubrics/data.md` | a data loss a reader of the diff can name; an irreversible step with no stated reason |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Compare the declared schema with the columns the query really returns, fix its types to the output, add missing columns with descriptions, and ask a person before deleting a declared column the query no longer returns. | `mozilla` |
| Coordinate any change to a table's schema with its downstream consumers and record the analysis of its impact in the requirements. | `mozilla` |
| When rewriting a schema file, change only the descriptions, keeping every field's name, type, mode and position, then read it back to confirm no field was renamed or dropped and the count is as expected. | `mozilla` |

## Where the subjects are read

- Schema and migrations: `sources.md`, the section of that name.
- Availability of the data while the change runs: `sources.md`, the section of that name.
- Backups, restore and retention: `sources.md`, the section of that name.

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
