---
name: wizardingcode-qa-measuring
description: "The QA team's rules for measuring the tests as the crew's own files hold them: the mutation report, what a survived mutant is and what is debt."
---

# Measuring the tests

## When

Before a mutation report is read. Every row below is a rule on reading that report. The entry is `wizardingcode-qa-testing`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| Where the stack has a mutation tool its score is what the gate reads | `plugins/core/skills/crew/rubrics/test-quality.md` | Where the stack has a mutation tool, its score is the deterministic input; otherwise the reviewer reads. |
| A survived mutant on a changed line is named with its line | `plugins/core/skills/crew/rubrics/test-quality.md` | a survived mutant on a line of the diff is a test that does not fail when the code changes; name the mutant and the line |
| The rubric names the survived mutant that one reasonable assertion would kill | `plugins/core/skills/crew/rubrics/test-quality.md` | a survived mutant on a line of the diff that one reasonable assertion would kill |
| The rubric names apart the mutant that survives in error handling the criteria do not cover | `plugins/core/skills/crew/rubrics/test-quality.md` | a mutant survived in error handling the criteria do not cover |
| The mutation score of the whole tree is debt | `plugins/core/skills/crew/rubrics/test-quality.md` | A weak test the diff did not touch, a suite that was already true by construction, the mutation score of the whole tree: debt |

## Where the subjects are read

- Mutation: `sources.md`, the section of that name.
- Flaky tests and determinism: `sources.md`, the section of that name.
- Property-based testing and fuzzing: `sources.md`, the section of that name.
- The suite in CI: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
- The crew's files hold no rule on properties, fuzzing, flakiness or the suite in CI: the table has none.
