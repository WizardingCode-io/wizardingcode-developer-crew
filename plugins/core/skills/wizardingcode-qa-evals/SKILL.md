---
name: wizardingcode-qa-evals
description: "The QA team's rules for testing systems with AI as the crew's own files hold them: the cases, their graders and the judge."
---

# Evals

## When

Before an eval case is written or changed, and before an eval's result is read. The entry is `wizardingcode-qa-testing`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A case runs with the plugin and without it, and the difference is what is reported | `plugins/core/evals/README.md` | runs each case in an isolated session with only this plugin loaded, once with the plugin and once without, and reports the difference |
| A case builds its own repository | `plugins/core/evals/README.md` | Every case scaffolds its own git repository (`fixture.sh`), because the engine is inactive outside a repository. |
| The judge is never weaker than the agent it grades | `plugins/core/evals/README.md` | the owner's rule: the judge is never weaker than the agent it grades |
| A model's grade counts only against a baseline | `plugins/core/evals/README.md` | An llm grader is scored only where the case has a baseline arm to compare it with |
| What ran is read by a pattern over the trace, anchored on what ran | `plugins/core/evals/README.md` | what must be read in the trace is a regex grader, anchored on what ran |
| Only the cases a change affects are run, one at a time | `plugins/core/evals/README.md` | Run only the cases a change affects, with `--case`, one at a time |
| A run whose judge failed is named and run again | `plugins/core/evals/README.md` | A line `needs-rerun: <case> (not judged: <grader>: <cause>)` names a run whose judge call failed during the run: run the case again. |

## Where the subjects are read

- Testing systems with AI: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
