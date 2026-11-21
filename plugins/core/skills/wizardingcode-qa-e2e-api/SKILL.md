---
name: wizardingcode-qa-e2e-api
description: "The QA team's rules for end to end and API tests as the crew's own files hold them: the environment, the run's verdict, the console and the logs."
---

# End to end and API

## When

Before an end to end test is written, and before the e2e gate's result is read. The crew's files hold no rule of their own on a test over HTTP, so the table has none. The entry is `wizardingcode-qa-testing`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The gate is planned once an item where the change touches an interface file or a public API path | `plugins/core/skills/crew/references/gate.md` | Planned once per item when the change touches an interface file or a public-api path |
| An environment the person has running is used and left running | `plugins/core/skills/crew/references/gate.md` | health first, so an environment the user has running is used and never stopped |
| An environment that answered before the engine started one is the person's | `plugins/core/skills/crew/references/gate.md` | An environment that answers health before `crew env start` is the user's: the engine records it as such and never stops it. |
| The verdict is the command's exit, then the console, then the logs | `plugins/core/skills/crew/references/gate.md` | The verdict: the command's exit, then the console (the first entry at error or warning fails the gate, naming it: `console warning on /home: deprecated`), then the logs |
| The environment's logs are read for what the run added | `plugins/core/skills/crew/references/gate.md` | the environment's logs are read (a file path inside the project, only the lines the run added; a command, its output) |
| A logs path outside the project is not read | `plugins/core/skills/crew/references/gate.md` | a logs path outside the project is never read and the tail says so |
| A Playwright project records its console through the crew's fixture | `plugins/core/skills/crew/references/gate.md` | A Playwright project records its console by importing the crew's fixture instead of `@playwright/test` |
| A runner with no console measurement says so in the report | `plugins/core/skills/crew/references/gate.md` | another runner writes the console file itself, or has no console measurement and the report says `not captured` |
| A project that cannot run the gate has each run recorded as skipped under its standing decision | `plugins/core/skills/crew/references/gate.md` | While the project cannot run the gate (`allowSkips` lists e2e, `requiredGates` does not, no e2e command), each e2e run is recorded skipped with that decision |
| The capture spec of an interface item is written red first | `plugins/core/skills/crew/references/plan.md` | written red first like any test (the e2e gate runs it and grades its evidence) |

## Where the subjects are read

- End to end: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
