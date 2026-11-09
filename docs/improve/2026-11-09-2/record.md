# Improvement run 2026-11-09-2

- At: 2026-11-09T10:00:09.310Z
- Targets: gap-consent-default, gap-restore-schema-not-data
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-consent-default | 1.00, 1.00, 0.50 | 0.83 | 0.50 |
| gap-restore-schema-not-data | 0.00, 0.50, 0.50 | 0.33 | 0.50 |
| spec-bootstrap-small | 1.00, 0.86, 0.86 | 0.90 | 0.14 |

## P-1: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`; no tests or eval rerun were possible in this session, which has no shell. Both cases allow only Read, Glob, Grep and Skill, so no `crew` command ever runs, and every recorded run shows `reads: []`: the skill page is the only harness text they read. That is why the three earlier attempts on the reference pages and checklists moved nothing. The words both regexes look for are the checklists' own: `checklists/sync.md` has "a default set by an import is not a consent", and `checklists/migration-or-restore.md` has "Who re-enters data" and "the schema returns, the data does not". The method reads those only at Conclave, after the lead has already asked in its own words or, in the restore run that lost all three judge votes, ended without the backup question. I added one sentence after "Answer them first" in the typed-questions paragraph: "A risk area or a doubt: read the fitting `checklists/` page before you ask or build; say its warnings and ask its decisions in its words." A clear fast-route request has neither, so it still reads nothing else. One caveat on "the right reason": a Read of the checklist puts the regex's words in the trace by itself, so `names-consent` and `says-data-gone` can pass on the read alone. The `honest-ending` judge over the final message is what shows whether the lead actually said it. The sentence is paid for with trims no test pins, and the page is at 9,252 of its 9,254 bytes, measured by regex probes:

- **Opening line:** "The `crew` command is the engine" became "`crew` is the engine", and "when the work is done" became "when work is done".
- **Typed-questions intro:** it now reads "Answer them first, for `crew start --answers`; … means the full route".
- **`work_type: question` line:** folded into its table row as "(answer the user, no item)".
- **Fast route:** "is on this page" became "is here".
- **Rule 4:** "the command runs with no prompt" became "no prompt
- Probe set: gap-consent-default, gap-restore-schema-not-data, spec-bootstrap-small
- Gain: -0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-consent-default | 0.50, 0.50, 0.50 | 0.50 | 0.00 |
| gap-restore-schema-not-data | 1.00, 0.50, 0.50 | 0.67 | 0.50 |
| spec-bootstrap-small | 0.86, 1.00, 0.86 | 0.90 | 0.14 |

## P-2: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell): no tests and no eval rerun, so whether the scores move is unmeasured. Every recorded run of `gap-consent-default` and `gap-restore-schema-not-data` shows `reads: []`, so the lead reads only the skill page, and the earlier edits to reference pages and checklists never reached it. The words all four graders want are in `checklists/sync.md` ("a default set by an import is not a consent") and `checklists/migration-or-restore.md` (the schema returns, the data does not; who re-enters data; a backup of the rows). The method reads those only at Conclave, after the lead has already asked in its own words and ended the turn. Rule 5 now carries one sentence right after "For the user: `crew await <id> user`, then ask.": "Before asking, read `checklists/<kind>.md` for each kind the request touches; say its warnings and ask its decisions in its words." I put it at the wait because every standard or full run passes that step before building, while a clear fast-route request never waits and so reads nothing more. The sentence itself matches neither trace regex, but a read of either checklist does, so the regex graders can pass on the read alone; the `honest-ending` judges are the real measure of whether the lead then says it. To pay for the sentence I trimmed wording in the opening line, the typed-questions line, the `work_type: question` line, the fast-route heading and its first line, and rules 4 and 6. I checked each trim against the tests and none touches a pinned string. The page is 9252 bytes against its 9254 cap, measured by regex probes.
- Probe set: gap-consent-default, gap-restore-schema-not-data
- Gain: -0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gap-consent-default | 0.50, 1.00, 0.50 | 0.67 | 0.50 |
| gap-restore-schema-not-data | 0.50, 0.50, 0.50 | 0.50 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-327, K-328
- Cases no run has measured (never probed): none
- Cost: 15.11 USD
- Exit status: 0
