# Improvement run 2026-11-05-2

- At: 2026-11-05T01:00:07.103Z
- Targets: audit-report-three-formats, confidential-entry-not-reused
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 0.75, 0.75 | 0.83 | 0.25 |
| confidential-entry-not-reused | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/audit.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: The edits are in place. Nothing further depends on another lookup: no test pins the touched sentences of either page, neither page has a size cap, and the secrets log name on the page matches the engine's form. I did not run tests or an eval rerun in this session, which has no shell.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/audit.md` and `plugins/core/skills/crew/references/deliver.md`. The `named-by-path-or-log` grader of `audit-report-three-formats` judges the final message alone and fails it when the key's value is quoted, the failing test or the lint error is left unnamed, the PDF is called produced against the record, or the audit is called proven or done; the three regex graders passed in the failing run, which read only the Audit page, so the lead rendered the report, waited for the user and lost at the ending. The Audit page as it stood sent the lead to read the domain files (where the key sits in `config/keys.mjs`), had it write the business findings, summary and message by hand, said the renderer redacts the report, and at the signature asked only for "the verdict, the counts, what was left out and why, the PDF's absence", so whether the message named the key by path or by value, named the test and the lint error at all, and called the report unsigned rested on the model's habit. The run section now says a found secret is named by the path and line its log prints (`logs/audit-secrets-root.txt`, which prints the rule and never the value) and that the value is never copied into a findings file, the summary, a role's prompt or a message, since nothing redacts hand-written text; the signature section now says the presentation names what the verdict rests on the way the findings do (the failing test by its file or the test run's log, the lint error by its file and line, a secret by the file or the log and never its value), the three files with the PDF's absence and the engine's reason, and plainly that the report is un
- Probe set: audit-report-three-formats, confidential-entry-not-reused
- Gain: 0.17

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| confidential-entry-not-reused | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: lose

- Diff: M plugins/core/agents/review-security.md, M plugins/core/skills/crew/references/audit.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: I changed three harness pages and nothing else: `plugins/core/skills/crew/references/audit.md` (the "Read the runs" paragraph and the signature step), `plugins/core/skills/crew/references/deliver.md` (one clause in its audit paragraph) and `plugins/core/agents/review-security.md` (one sentence in its "On an audit" section). `confidential-entry-not-reused` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `audit-report-three-formats`, the three regex graders pass at the engine's own lines and the only one that drops is `named-by-path-or-log`, an llm judge over the final message that wants the report rendered with the PDF or its recorded reason, the verdict critical, the key named by `config/keys.mjs` or the secrets log and never by its value, the failing test and lint error named by a path or a log, and the report said to be unsigned and waiting for a person. Every recorded run of the case reads `references/audit.md` (some add the four rubrics), and the page as it stood told the lead to present "the verdict, the counts, what was left out and the PDF's absence" and never said how a finding is named or that the key's value stays out, while the engine redacts only the rendered report: the security reviewer's findings file, the lead's own summary and the final message are unredacted text, and the prompt's "say what it found and where" invites quoting the line. The audit page now says a found secret is named by path and line or the secrets log and its value goes into no findings file, prompt, summary or message; the signature step says to name what the verdict rests on the way the findings do (test by file or log, lint error by file and line, secret by file or log, never by value), to give the PDF as `report.json` records it, and to say plainly that the report is unsigned and waits for the user, an unsigned audit being neither proven nor done; the Deliver page's audit paragraph carries the same rule in one clause, and the securit
- Probe set: audit-report-three-formats, confidential-entry-not-reused
- Gain: 0.17

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| confidential-entry-not-reused | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-305, K-306
- Cases no run has measured (never probed): none
- Cost: 15.29 USD
- Exit status: 0
