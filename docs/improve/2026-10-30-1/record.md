# Improvement run 2026-10-30-1

- At: 2026-10-30T00:00:07.136Z
- Targets: writing-standard-ending-without-tells, document-entry-opens-item
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| writing-standard-ending-without-tells | 0.83, 0.83, 0.83 | 0.83 | 0.00 |
| document-entry-opens-item | 0.00, 0.25, 0.25 | 0.17 | 0.25 |

## P-1: unprobed (the probe set (5 cases, about 16.95 USD by the baseline's costs) is above what is left under the ceiling (15.82 USD); not probed)

- Diff: M plugins/core/skills/crew/references/receive.md
- Rationale: I changed one sentence in `plugins/core/skills/crew/references/receive.md` and haven't re-run anything. Most of these failures aren't the harness's fault: every judge grader (`ending-without-tells`, `honest-ending`, `one-item`, `question-or-built`) "threw" because the eval kit's judge model hit its usage limit. That is why `writing-standard-ending-without-tells` dropped to 0.83, and no change to the agents' text can fix it. Those two cases need a rerun once the quota is back. The only real failure is the `source-document` regex in `document-entry-opens-item`. It looks for `source: document docs/requests/newsletter.md`, which the engine prints only when `crew start` runs with `--source '{"channel":"document",…}'`. The 0.17 mean fits that line being found in two of the three runs and missing in one. My guess is that the run pasted the document's text as the request, or never started an item because the user said they wouldn't be there to answer; I couldn't see its trace to confirm. The page's "From a document" sentence now says a file the user names is passed with `--source`, that the start prints `source: document <path>`, and that the item is started before anything is asked, even with nobody there to answer. No test pins that sentence. I left `SKILL.md` alone because a test caps its size and I couldn't measure how much room is left.

## P-2: unprobed (the probe set (5 cases, about 16.95 USD by the baseline's costs) is above what is left under the ceiling (15.15 USD); not probed)

- Diff: M plugins/core/skills/crew/references/receive.md
- Rationale: I added one paragraph to `plugins/core/skills/crew/references/receive.md`, right after the `crew start` example in step 2, and changed nothing else. I didn't re-run the eval or the skill tests: this session has no shell, so the change is untested. Only one of the failing results points at the harness. Every judge grader in both cases (`ending-without-tells`, `honest-ending`, `one-item`, `question-or-built`) threw "You've reached your Fable limit", so no harness text can fix them and they need a rerun once the quota resets. The one real failure is `source-document`, a regex for `source: document docs/requests/newsletter.md`, which the engine prints only when `crew start` gets `--source`. With three of the four graders scoring 0, a run scores either 0 or 0.25, so the mean of 0.17 means the regex passed in 2 of 3 runs and failed in one. The harness already covered document sources in three places, but the code example a lead is likely to copy leaves out `--source`, and the document case was buried mid-paragraph after the task-manager text. The new paragraph, next to the example, says a request the user points at (a file or a ticket) is started with `--source` even when its text is passed as the request. It says the start then prints `source: document <path>`, and that without it no source is recorded and the item counts as a feature instead of a client request. My reason for the one failing run is a guess, since I couldn't see its trace. I also saved a memory note that this 0.17 is mostly quota throws, so a later run doesn't read it as a failure in every run.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 4.85 USD
- Exit status: 0
