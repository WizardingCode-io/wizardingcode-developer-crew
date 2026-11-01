# Improvement run 2026-11-01-5

- At: 2026-11-01T17:00:07.071Z
- Targets: spec-resolve-rules, spec-review-planted
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-resolve-rules | 1.00, 1.00, 0.83 | 0.94 | 0.17 |
| spec-review-planted | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/writing.md
- Rationale: The edit is in place and the page's pinned headings and phrases are untouched. Here is the summary.

I changed one harness page and nothing else: `plugins/core/skills/crew/references/writing.md`, a new paragraph at the end of its "Facts are kept" section. The `contest-with-evidence` grader of `spec-resolve-rules` is an llm judge over the final message alone, and it wants finding 1 contested with `src/accounts.mjs` and its Map named as the evidence; the case scored 0.94 across its runs, which is one run losing this one grader while the other five rules held, so the dispositions were made and the contest's citation is what dropped. That fits the session as it is shaped: the prompt allows only Read, Glob, Grep and Skill, there is no item and no `crew spec-review … resolve` to carry an `--evidence <file:symbol>`, and the one page that says a contest needs a file and a symbol, `plugins/core/skills/wizardingcode-spec-resolve/SKILL.md`, is outside the folders I may edit; its wording also leaves a contest written from the reviewer's own admission ("the code does hold them in a Map") as a plausible answer, with no read of the file and no symbol in the message. The only page in my folders every session is pointed to for the text it writes is `references/writing.md`, named by the session-start hook's line about every text and the ending, and it already holds the rule that a vague attribution is cured by a named source, a file and a line. The new paragraph says that a claim about what the code does carries the file's path and the symbol in the sentence, read in the code before the claim is written, never a paraphrase and never another reader's word for it, a reviewer's included; that an answer to a review finding is such a claim, so a contest names the file and the symbol that refute the finding in the text the person reads; and that a finding the code disproves is told from one the document corrects by what the file shows. The test that pins this page (its four headings, the t
- Probe set: spec-resolve-rules, spec-review-planted
- Gain: 0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-resolve-rules | 0.83, 1.00, 1.00 | 0.94 | 0.17 |
| spec-review-planted | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: unprobed (the probe set (2 cases, about 5.40 USD by the baseline's costs) is above what is left under the ceiling (3.21 USD); not probed)

- Diff: M plugins/core/skills/crew/references/writing.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/references/writing.md`, a new paragraph at the end of "Facts are kept". The `contest-with-evidence` grader of `spec-resolve-rules` judges the final message and wants finding 1 contested with `src/accounts.mjs` and its Map named as the evidence; it failed all three votes in one run while the other five dispositions passed, so the miss is on the evidence a contest carries, not on the rules the session read. The page that governs that step, `wizardingcode-spec-resolve/SKILL.md`, is outside the folders I may edit, and I confirmed from the bundled engine that a session with no item open gets nothing from the prompt hook and only one pointer into my folders from the session-start hook: the line that every text, the ending included, follows the writing page. That page said a file and line is attribution but never that a claim about the code is cited by the file and the symbol, read before it is cited, nor that a reviewer's own admission or "this was intentional" is no source. The new paragraph says exactly that with a neutral example, so a resolve session that contests from its memory of the code, or from the reviewer's "in fact it does hold them in a Map", is told to open the file and name the symbol in its answer. Every pinned string and heading of the page is intact, and I ran nothing: no tests, no eval rerun. If the failing run instead proposed a fix for finding 1, this edit does not reach it, since the disposition rules live on the resolve page I may not touch.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-293
- Cases no run has measured (never probed): none
- Cost: 16.79 USD
- Exit status: 0
