---
name: wizardingcode-devops-environment-containers
description: "The DevOps team's rules for the project's environment and its images as the crew's own files hold them: `crew env`, nothing tied to one machine, pinned versions, and an image built locally and never pushed."
---

# Environment and containers

## When

Before a change to an environment file, a Dockerfile, a compose file or a toolchain's pin, before the project is brought up, and before such a change is judged. An image is built locally and pushed to no registry. The entry is `wizardingcode-devops`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The team works on images built locally, with no push to a registry. | `plugins/core/teams/devops.md` | On images built locally; no push to a registry. |
| The team runs `crew env` over what the project declares. | `plugins/core/teams/devops.md` | `crew env` over what the project declares |
| `crew env start` starts the environment detached and waits for health. | `plugins/core/skills/crew/references/gate.md` | `crew env start` starts it detached and waits for health |
| An environment that answers health before `crew env start` is the user's: the engine never stops it. | `plugins/core/skills/crew/references/gate.md` | An environment that answers health before `crew env start` is the user's: the engine records it as such and never stops it. |
| `crew env stop` stops what the engine started. | `plugins/core/skills/crew/references/gate.md` | `crew env stop` stops what the engine started |
| The reviewer asks whether a path, a name or an address is tied to one machine or one account. | `plugins/core/skills/crew/rubrics/infra.md` | is a path, a name or an address tied to one machine or one account |
| The reviewer asks whether the change pins where the project pins its toolchain, and whether a build depends on the time it runs. | `plugins/core/skills/crew/rubrics/infra.md` | where the project pins its toolchain, does the change pin too; does a build depend on the time it runs |
| Trivy runs at a pinned and verified version, never through `trivy-action` at a moving tag. | `plugins/core/teams/devops.md` | Trivy, as on the security team, always at a pinned and verified version (a release's signature or its checksum) and never through `trivy-action` at a moving tag, the action being pinned by SHA in CI |
| A stopped tool (Volta, rbac-tool, Overmind) is used only where the project already uses it. | `plugins/core/teams/devops.md` | Stopped tools (Volta, rbac-tool, Overmind): only where the project already uses them. |

## Where the subjects are read

- Hosts: `sources.md`, the section of that name.
- Reproducibility: `sources.md`, the section of that name.
- The project's environment: `sources.md`, the section of that name.
- Containers and images: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
