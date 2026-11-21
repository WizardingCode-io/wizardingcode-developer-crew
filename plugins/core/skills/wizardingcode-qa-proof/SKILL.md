---
name: wizardingcode-qa-proof
description: "The QA team's rules of proof as the crew's own files hold them: a test per criterion red first, preserve and observed criteria, and criteria a test can check."
---

# Proof

## When

Before a criterion is written, before the first test of a criterion, and before a criterion is recorded as preserved or observed. Two rows below do not agree on a test against a stub: one file gives an end to end test against a stubbed server as an observed criterion, and another refuses an observed criterion where a stub makes a test possible. Both stand as their files hold them. The entry is `wizardingcode-qa-testing`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| The test comes first and fails for want of the behaviour | `plugins/core/skills/crew/references/build.md` | Write the test that expresses the criterion. It must fail because the behaviour does not exist yet. |
| A test that passes before the code exists proves nothing | `plugins/core/skills/crew/references/build.md` | a test that passes before the code exists proves nothing |
| A pass is recorded only after its failure | `plugins/core/skills/crew/references/build.md` | A green with no earlier red is rejected. |
| The red and the green are one command | `plugins/core/skills/crew/references/build.md` | so the pair proves one command red and then green |
| The code is the least that passes | `plugins/core/skills/crew/references/build.md` | Write the smallest code that makes the test pass. |
| A failure is resolved at its origin | `plugins/core/skills/crew/references/build.md` | A red is traced to its origin and resolved, never skipped or passed. |
| A failure that cannot happen is settled in the design | `plugins/core/skills/crew/references/build.md` | A red that cannot happen is a question about the design, answered before the code |
| A preserved behaviour is run before the change and after it | `plugins/core/skills/crew/references/build.md` | For a `preserve` criterion: `crew tdd before <id> <criterion>` with the tests passing, make the change, `crew tdd after <id> <criterion>`. |
| An observed criterion carries its reason | `plugins/core/skills/crew/references/build.md` | The reason is in the record and the report; a missing reason is refused. |
| Where a stub makes a test possible the criterion is not observed | `plugins/core/skills/crew/references/build.md` | An `observed` criterion is refused where a stub makes a test possible: write the stub and the test instead |
| A criterion is one sentence a test can check | `plugins/core/skills/crew/references/specify.md` | each a single sentence that a test can check |
| A criterion that says something stays green is a preserve criterion | `plugins/core/skills/crew/references/specify.md` | it has no red run, so it is `preserve`, never `behavior` |
| The gates are no criterion | `plugins/core/skills/crew/references/specify.md` | The gates themselves (lint, typecheck, the full suite) are never a criterion; they run anyway. |
| What can have no failing run is observed, and is no skip | `plugins/core/skills/crew/references/specify.md` | A criterion that passes after the change but can have no red run (an end-to-end test against a stubbed server, a check the environment cannot fail on purpose) is `observed`, not a skip |
| A behaviour's test fails when the change is undone | `plugins/core/skills/crew/rubrics/test-quality.md` | a test that would still pass with the change undone proves nothing |
| A preserve criterion names the tests it rests on | `plugins/core/skills/crew/rubrics/test-quality.md` | does it name the tests it relies on, and do those tests exercise the preserved behaviour rather than only compile? |
| An observed reason is false where the test could have failed first | `plugins/core/skills/crew/rubrics/test-quality.md` | Could the test have been made to fail first (a stub answering wrong, a route removed)? If so, the reason is false. |
| A test says which criterion broke | `plugins/core/skills/crew/rubrics/test-quality.md` | do the test's name and failure message say which criterion broke? |

## Where the subjects are read

- A test per criterion, red first: `sources.md`, the section of that name.
- Preserve criteria and regression tests: `sources.md`, the section of that name.
- Observed criteria and their reason: `sources.md`, the section of that name.
- Criteria observable and provable: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
