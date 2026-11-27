---
name: wizardingcode-devops-pipelines
description: "The DevOps team's rules for a pipeline as the crew's own files hold them: the gates before a deploy step, a job the pipeline can run, a pinned action, and a deploy pipeline the team never triggers."
---

# Pipelines

## When

Before a change to a pipeline's file, and before such a change is judged. The team reads and validates a pipeline; it triggers none that deploys. The entry is `wizardingcode-devops`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The team works on the CI the project has: it reads and validates, and never triggers a deploy pipeline. | `plugins/core/teams/devops.md` | Always the CI the project has; the team reads and validates, and never triggers a deploy pipeline. |
| The reviewer asks whether every gate the profile knows runs before a deploy step. | `plugins/core/skills/crew/rubrics/infra.md` | does every gate the profile knows run before a deploy step |
| The reviewer asks whether there is a job the project's own pipeline cannot run, for a tool it lacks or a runner it does not have. | `plugins/core/skills/crew/rubrics/infra.md` | is there a job the project's own pipeline cannot run (a tool it lacks, a runner it does not have) |
| A pipeline that never ran the tests before deploying is debt; a deploy step the diff adds before them is a defect, even where it matches its neighbour. | `plugins/core/skills/crew/rubrics/infra.md` | A pipeline that never ran the tests before deploying is debt; a new deploy step the diff adds before them is a defect, even though it matches its neighbour. |
| A duplicated job, an unpinned tool where neighbours pin, a comment missing on a manual step and a host name in a comment are each an advisory. | `plugins/core/skills/crew/rubrics/infra.md` | An **advisory**: a duplicated job; an unpinned tool where neighbours pin; a comment missing on a manual step; a host name in a comment |
| Trivy stays at a pinned and verified version, never through `trivy-action` at a moving tag; in CI the action is pinned by SHA. | `plugins/core/teams/devops.md` | Trivy stays, always at a pinned and verified version (a release's signature or its checksum), and never through `trivy-action` at a moving tag; in CI the action is pinned by SHA. |

## Where the subjects are read

- Pipelines: `sources.md`, the section of that name.
- The pipeline's supply chain: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
