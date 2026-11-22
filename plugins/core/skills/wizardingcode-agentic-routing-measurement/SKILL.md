---
name: wizardingcode-agentic-routing-measurement
description: "The agentic-os team's rules for routing and its measure as the crew's own files hold them: the simplest form that does the work, the client's cases run several times, the task's outcome measured apart, and nothing of the client sent to Promptfoo's service."
---

# Routing and measurement

## When

Before a change to how an assistant chooses a tool or a flow, before its eval is written or run, and before such a change is judged. A case counts as right only if it is right every time, and a run's cost bound is said before the run. The entry is `wizardingcode-agentic`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The form is the simplest that does the work: a function, a single call, a workflow, an agent or several agents. | `plugins/core/teams/agentic-os.md` | A function, a single call, a workflow, an agent, several agents: the simplest that does the work. |
| What is measured, per project: the client's real cases and a closed set of tools and flows, the right tool or flow chosen in more than 90% of the cases, each case run several times and counted right only if right every time, and the task's final outcome measured apart. | `plugins/core/teams/agentic-os.md` | per project, a set of the client's real cases and a closed set of tools and flows; the assistant chooses the right tool or flow in more than 90% of the cases; each case is run several times and counted right only if right every time; the task's final outcome is measured apart |
| The eval runner keeps its suite in files in the client's repository, what the project has coming first; each case is run several times, with a cost bound said first. | `plugins/core/teams/agentic-os.md` | An eval runner with the suite in files in the client's repository, what the project has first; each case run several times, with a cost bound said first. |
| The team never runs a command with `--remote` nor calls `share_evaluation`, so nothing of the client leaves for Promptfoo's service; red team runs stay the security team's. | `plugins/core/teams/agentic-os.md` | The team never runs a command with `--remote` nor calls `share_evaluation`: nothing of the client leaves for Promptfoo's service. Red team runs stay the security team's. |
| One run of a non-deterministic agent tells little, and what the agent produced is graded, not the path it took. | `packs/agentic-os/knowledge/agentic.md` | One run of a non-deterministic agent tells little: a plugin eval runs each case three times by default, and the runs are repeated with no plugin loaded so that the difference between the two scores is what the plugin contributed. What the agent produced is graded, not the path it took. |
| Success criteria are defined before the work, evaluations automated where possible, and volume preferred over hand-made quality. | `packs/agentic-os/knowledge/agentic.md` | Success criteria defined before the work, evaluations automated where possible, volume preferred over hand-made quality. |
| An agent has an eval with a with-and-without comparison, each case run more than once, before it ships. | `packs/agentic-os/checklists/agent.md` | An eval with a with-and-without comparison, each case run more than once, before it ships. |

## Where the subjects are read

- Orchestration: `sources.md`, the section of that name.
- Evaluation: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read the content of some pages and only the answer of others.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
