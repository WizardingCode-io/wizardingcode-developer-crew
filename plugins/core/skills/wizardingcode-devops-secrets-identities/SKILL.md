---
name: wizardingcode-devops-secrets-identities
description: "The DevOps team's rules for secrets and identities as the crew's own files hold them: the reviewer's questions on a credential and on a widened identity, a secret's name listed without its value, and a token never written into a command."
---

# Secrets and identities

## When

Before a change that touches a secret, a credential, a role or an identity, and before such a change is judged. The team reads a secret's name and never its value. The entry is `wizardingcode-devops`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The secret manager's CLI is used to list names only, never values. | `plugins/core/teams/devops.md` | the secret manager's CLI to list names only, never values |
| The reviewer asks whether a credential stands in a file, an image, a log line or a variable's default that is committed. | `plugins/core/skills/crew/rubrics/infra.md` | is there a credential in a file, an image, a log line or a variable's default that is committed |
| The reviewer asks whether an identity is widened, whether a role carries more than the step needs, and whether a step runs as an administrator where its neighbours do not. | `plugins/core/skills/crew/rubrics/infra.md` | is an identity widened; does a role carry more than the step needs; does a step run as an administrator where its neighbours do not |
| A command that takes a token or a key is written with the variable's name or the page's placeholder, and no value. | `plugins/core/teams/devops.md` | A command that takes a token or a key is written with the variable's name or the page's placeholder and no value. |
| The server of a service with an account enters only where the project already uses the service, and always reading. | `plugins/core/teams/devops.md` | The server of a service with an account (CI, delivery, incidents, observability) enters only where the project already uses the service, and always reading |
| Of the eight servers with a switch, GitHub's among them, the research gives a command or an address that carries the switch for Buildkite's and Rootly's alone: the other six act by default, and none is installed until the building item shows the command with the switch. | `plugins/core/teams/devops.md` | Of the eighteen servers admitted, the research found a switch on eight: Argo CD's, Flux's, GitHub's, Buildkite's, Azure DevOps's, Harness's, Rootly's and Grafana's. Of those eight, the research gives a command or an address that carries the switch for Buildkite's and Rootly's alone; the other six act by default, and none is installed until the building item shows the command with the switch. |
| GitHub's server is one of the six of the row on the switch, so it is not installed until the building item shows the command with the switch; when it is, it is without its two secret scanning tools, which return the secret's value by default. | `plugins/core/teams/devops.md` | GitHub's is installed without its two secret scanning tools, which return the secret's value by default |

## Where the subjects are read

- Secrets: `sources.md`, the section of that name.
- Permissions and identities: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
