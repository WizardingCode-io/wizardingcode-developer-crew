---
name: wizardingcode-devops-iac
description: "The DevOps team's rules for infrastructure code as the crew's own files hold them: the project's own tool, validated and planned and never applied or destroyed, and a cost measured or estimated in writing."
---

# Infrastructure as code

## When

Before a change to infrastructure code or to a cluster's manifests, and before such a change is judged. The team stops at the plan: it applies nothing and destroys nothing. The crew's files hold no rule of their own on policy as code. The entry is `wizardingcode-devops`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The team runs the project's own tool, only up to the plan: it never applies and never destroys. | `plugins/core/teams/devops.md` | Always the project's tool, and only up to the plan: never apply or destroy. |
| "kubectl diff" and the server dry-run are run against a test cluster only. | `plugins/core/teams/devops.md` | "kubectl diff" and the server dry-run, against a test cluster only |
| Bicep's what-if asks Azure about a real subscription and does not deploy. | `plugins/core/teams/devops.md` | Bicep build and what-if, which asks Azure about a real subscription and does not deploy |
| Pulumi's server, which can approve changes, Vault's, which returns secret values, and Docker's gateway and Hub servers are left out: those tools run from the command line, only up to the plan. | `plugins/core/teams/devops.md` | Left out: Pulumi's, which can approve changes, Vault's, which returns secret values, and Docker's gateway and Hub servers; those tools run from the command line, only up to the plan. |
| A tool whose licence is not open is used only where the project already uses it under its own licence: the team never installs it, and on a new project proposes the open alternative. | `plugins/core/teams/devops.md` | Tools whose licence is not open (Terraform and Vault, under the Business Source License; Serverless Framework 4; sentry-cli; Docker Scout's CLI): only where the project already uses them under its own licence. The team never installs them, and on a new project it proposes the open alternative (OpenTofu, OpenBao). |
| Cost follows the rule of the case measured or estimated in writing. | `plugins/core/teams/devops.md` | the rule of the case measured or estimated in writing |

## Where the subjects are read

- Infrastructure as code: `sources.md`, the section of that name.
- Cost: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
