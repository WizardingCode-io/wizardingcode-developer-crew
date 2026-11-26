---
name: wizardingcode-etl-pipeline
description: "The ETL team's rules for writing a pipeline from its source data: the schema and the keys inferred, the transformation and its tests written, sized to the volume."
---

# Pipeline generator

## When

Before a pipeline, an import, an export or a synchronisation between systems is written or changed, and before such a change is judged. Every figure this skill gives is computed by code or by a tool run in the project and never by the model's own reckoning, and the crew ships no script of its own for it. Measuring a volume, rehearsing a restore and anything else that loads or changes data runs only on the project's own local or test environment. This skill installs nothing, starts no server and is no leave to connect one. The entry is `wizardingcode-etl`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A pipeline infers the schema and the keys from the source data, and its transformation comes with its tests, sized to the volume. | `plugins/core/teams/etl.md` | From the source data: infers the schema and the keys, writes the transformation and its tests, sized to the volume |
| A credential or a connection string is written by its variable's name or a placeholder, never by its value. | `plugins/core/teams/etl.md` | A command that takes a token, a key, a password or a connection string is written with the variable's name or the page's placeholder and no value; a connection string is written with the page's placeholder or a local address with no credential. |
| A pipeline uses the tools the project already runs, where its database and stack take them. | `plugins/core/teams/etl.md` | In an existing project the team runs what the project uses. Each tool runs only where the project's database and stack take it. |

## Rules written from the sources

Each row is a rule the crew wrote in its own words from the source named in the second cell, read at its commit. No gate of the crew rules by a row of this table and a reviewer names none as a defect: where a row disagrees with a row of the crew's rules, the crew's rule holds. No sentence of the source is copied, the source is installed by no skill, and a session opens none.

| Rule | Source |
| :- | :- |
| Before implementing a transformation, confirm the columns it must output, the logic that produces them and the tables they come from, and put short, specific questions only about what is still missing. | `mozilla` |
| Before changing a transformation, note its existing tests and current sources, then bring every test's fixtures and expected output in line with the change and run them until they pass. | `mozilla` |
| When a test fails, decide whether the fault lies in the query's logic, the expected output or a fixture, and fix it at that cause, going back to the query when the logic is wrong. | `mozilla` |
| Run the project's formatter and validator on a new query and keep fixing it until validation passes, before producing its schema or its tests. | `mozilla` |

## Where the subjects are read

- Pipelines: `sources.md`, the section of that name.
- Imports, exports and file formats: `sources.md`, the section of that name.
- Integrations and synchronisation between systems: `sources.md`, the section of that name.

## Where the sources' rules come from

- `mozilla`: mozilla/bigquery-etl-skills, MPL-2.0, read at commit a89cf8f.

## What this skill does not hold

- No rule here comes from a page of section 3: a row quotes a file of the crew or restates the user's source.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
