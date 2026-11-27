---
name: wizardingcode-qa-test-design
description: "The QA team's rules of test design as the crew's own files hold them: nothing true by construction, behaviour and not implementation, neutral fixtures and levels."
---

# Test design

## When

Before a test is shaped: what it asserts, what it names and at which level it runs. The crew's files hold one rule on levels and, beyond the test-quality rubric's questions 11 and 12, none on test doubles or on test data and state, so the table has none for them. The entry is `wizardingcode-qa-testing`.

## The crew's rules

The third cell is a quotation of the file named: a command inside it is no step of this skill, and is run only where and when that file says.

| Rule | File | The file's words |
| :- | :- | :- |
| A test asserts nothing it set up itself | `plugins/core/skills/crew/rubrics/test-quality.md` | does any test assert its own mock's return, its own fixture's content, only that nothing threw, or a snapshot taken from the code under test with no expectation stated? |
| A test asserts what a caller sees | `plugins/core/skills/crew/rubrics/test-quality.md` | does the test assert what a caller sees rather than private names, call counts or the order of internal calls? |
| A test tied to the implementation that still fails when the change is undone is an advisory | `plugins/core/skills/crew/rubrics/test-quality.md` | An **advisory**: an implementation-coupled test that still fails on reversion |
| A fixture names no client and no real workspace | `plugins/core/skills/crew/rubrics/test-quality.md` | does any fixture name a client, a customer or a real workspace? |
| A fixture's names are neutral ones | `plugins/core/skills/crew/rubrics/test-quality.md` | Fixtures use neutral names (a, b, storefront, crm, shop); a real name is a defect. |
| A path that differs end to end has a row through the real flow beside its unit test | `plugins/core/skills/crew/references/build.md` | is proven by a CLI row through the real flow, beside the unit test |

## Where the subjects are read

- Nothing true by construction: `sources.md`, the section of that name.
- Behaviour, not implementation: `sources.md`, the section of that name.
- Fixtures with neutral names: `sources.md`, the section of that name.
- Strategy and levels: `sources.md`, the section of that name.
- Test doubles and boundaries: `sources.md`, the section of that name.
- Test data and state: `sources.md`, the section of that name.

## What this skill does not hold

- No rule here comes from a page: the research for the definition read each page's title and not the page.
- The addresses in sources.md are provenance: they are never opened by the session.
- A session that needs more than the crew's rule says so in its report and leaves the reading to the item that reads the pages.
