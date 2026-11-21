---
name: wizardingcode-devops-operation
description: "The DevOps team's rules for operation as the crew's own files hold them: how a failure would be seen in the first hour, dashboards and alerts as code, and a service's CLI used only to read and, in a rehearsal, to send sourcemaps or mark a release."
---

# Operation

## When

Before a change to logging, metrics, traces, dashboards or alerts, and before such a change is judged. The team reads a service; in a rehearsal alone it sends sourcemaps or marks a release, and it writes nothing else to it. The crew's files hold no rule of their own on incidents or runbooks. The entry is `wizardingcode-devops`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The service's CLI is used only to read, and to send sourcemaps or mark a release in a rehearsal. | `plugins/core/teams/devops.md` | the service's CLI, only to read and to send sourcemaps or mark a release in a rehearsal |
| The reviewer asks what fails first if the change is wrong and how anyone would know: a failure nobody would see is the worst answer. | `plugins/core/skills/crew/rubrics/risk.md` | what fails first if this is wrong, and how would anyone know (a log line, a metric, an alert, a complaint)? A failure nobody would see is the worst answer. |
| Among what the team runs: dashboards and alerts as code, validated. | `plugins/core/teams/devops.md` | dashboards and alerts as code, validated |
| The server of a service with an account enters only where the project already uses the service, and always reading. | `plugins/core/teams/devops.md` | The server of a service with an account (CI, delivery, incidents, observability) enters only where the project already uses the service, and always reading |

## Where the subjects are read

- Observability and operation: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
