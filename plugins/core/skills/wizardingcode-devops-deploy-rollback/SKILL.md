---
name: wizardingcode-devops-deploy-rollback
description: "The DevOps team's rules for a deployment as the crew's own files hold them: a deploy to production as a person's decision, what undoes a destructive step, a platform chosen by the measured case, and a restore rehearsed away from production."
---

# Deploy and rollback

## When

Before a change to a deployment, a release, a migration's rollback or a backup, and before such a change is judged. A deploy to production, and any command that deletes or changes a real resource, is a person's decision and never the team's own. The crew's files hold no rule of their own on a deployment's strategy. The entry is `wizardingcode-devops`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A deploy to production, and any command that deletes or changes a real resource, is a person's decision and never the team's own. | `plugins/core/teams/devops.md` | A deploy to production and any command that deletes or changes a real resource are a person's decision, never the team's own |
| The platform's CLI is used only to read state and for the rehearsal: a dry-run, a diff, a preview. | `plugins/core/teams/devops.md` | the platform's CLI, only to read state and for the rehearsal (dry-run, diff, preview) |
| No server that acts on a cloud account, a platform or a cluster enters, with or without a read-only switch. | `plugins/core/teams/devops.md` | No server that acts on a cloud account, a platform or a cluster enters, with or without a read-only switch |
| Argo CD's and Flux's servers enter with the read-only switch on, as the two exceptions to the rule of the row above: only where the project already uses them, and only after the building item shows the install command with the switch. | `plugins/core/teams/devops.md` | Argo CD's and Flux's enter with the read-only switch on, as the two exceptions to rule 3, the user's choice and not the option recommended: only where the project already uses them, and only after the building item shows the install command with the switch |
| The reviewer asks whether a destructive step's rollback is stated: a release undone, a schema change reverted, a bucket restored. | `plugins/core/skills/crew/rubrics/infra.md` | is a destructive step's rollback stated (a release undone, a schema change reverted, a bucket restored) |
| The reviewer asks whether the deploy can be reverted without losing data written in between, whether each migration has a down path or a stated reason why not, and whether a backfill or a data fix is reversible. | `plugins/core/skills/crew/rubrics/risk.md` | can the deploy be reverted without losing data written in between; does each migration have a down path or a stated reason why not; is a backfill or a data fix reversible |
| The reviewer asks whether the plan names the manual steps, who takes them and in which order. | `plugins/core/skills/crew/rubrics/risk.md` | does the plan name the manual steps (a value to set, a job to run once, a flag to turn), who takes them and in which order |
| The platform is chosen by the case measured or estimated in writing, not the largest by default. | `plugins/core/teams/devops.md` | The rule: the platform is chosen by the case measured or estimated in writing, not the largest by default |
| A restore is rehearsed into a test database and never over production. | `plugins/core/teams/devops.md` | with a restore rehearsal into a test database and never over production |

## Where the subjects are read

- Rollback: `sources.md`, the section of that name.
- Deployment strategies and releases: `sources.md`, the section of that name.
- Platforms and hosting: `sources.md`, the section of that name.
- Backups and disaster recovery: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
