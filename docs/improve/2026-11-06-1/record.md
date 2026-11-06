# Improvement run 2026-11-06-1

- At: 2026-11-06T00:00:07.416Z
- Targets: prose-gate-refuses-chatbot-artefact, document-entry-opens-item
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| prose-gate-refuses-chatbot-artefact | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| document-entry-opens-item | 0.25, 0.50, 0.50 | 0.42 | 0.25 |

## P-1: unprobed (the probe set (9 cases, about 141.51 USD by the baseline's costs) is above what is left under the ceiling (16.41 USD); not probed)

- Diff: M plugins/core/skills/crew/references/receive.md
- Rationale: I edited one file, `plugins/core/skills/crew/references/receive.md`, in two places. I haven't run any tests or an eval rerun, since this session has no shell. A search of `packages/engine/tests` shows no test pins the sentences I changed, and the pinned ones elsewhere on the page are still there. `prose-gate-refuses-chatbot-artefact` is at mean 1.00 with no evidence, so it's passing and I left it alone. For `document-entry-opens-item`, the two failing graders are linked in the engine. `source-document` looks for the `source: document docs/requests/newsletter.md` line, which only `crew start --source` prints. The engine also writes a question to `<documentPath>.questions.md` only when the item was started with a document source. So a run that skips `--source` can't produce the questions file that `question-or-built` wants named. Separately, Receive step 3 told the lead to ask its questions in conversation and never mentioned `crew question`, so even a run with the source left the unclear line ("the value marketing decided") as prose, off the record. All three runs failed `question-or-built` and two of three failed the ending. The step 2 document sentence now says that when the user names a file ("the request is in docs/requests/x.md"), the source goes on the `crew start` itself on every route, fast included, and names the line the engine prints. Step 3 now says each question is recorded with `crew question <id> add`, never in prose alone. On a document's item the engine writes it to the `.questions.md` file, nothing that depends on the answer gets built, and the ending names the question, that file and the wait, or states any assumption plainly as an assumption. I left `SKILL.md` alone: it is within a few bytes of its size cap, and the recorded runs of this case read `receive.md`.

## P-2: unprobed (the probe set (9 cases, about 141.51 USD by the baseline's costs) is above what is left under the ceiling (15.98 USD); not probed)

- Diff: M plugins/core/skills/crew/references/receive.md
- Rationale: I made two edits to `plugins/core/skills/crew/references/receive.md` and changed nothing else. They're untested: this session has no shell, so no eval rerun or skill tests ran.

`prose-gate-refuses-chatbot-artefact` is at mean 1.00 with no evidence, so it is passing and I didn't touch it. For `document-entry-opens-item`, the grader definitions and the prompt aren't in the repo. The SP3 plan describes them: the prompt is just "the request is in docs/requests/newsletter.md", and three graders need specific things in the run:
- **`source-document`** needs the engine's `source: document docs/requests/newsletter.md` line, which `crew start` only prints when it gets a document `--source`.
- **`question-or-built`** needs one of two endings for the line nobody can build without asking ("Accounts that already exist get the value marketing decided"). Either it's asked as a `crew question` and the ending names the `.questions.md` file, or the assumption is stated and the rest is built.
- **`honest-ending`** is the judge's view of the ending as a whole.

The engine only writes `docs/requests/newsletter.md.questions.md` when the item was started with a document source. So a run that pastes the document's text without `--source` fails both the regex and the question grader.

The Receive page as it stood had three gaps:
- It mentioned the document `--source` mid-paragraph and never said that a user naming a file means that flag is required.
- Step 3 only asks questions when `is_vague` is 0.5 or more, and only in prose.
- Nothing told the lead to name the questions file or the wait in its ending.

The Receive page is the one every route reads first, according to the skill page's method table. The first edit extends the "From a document" sentence: the start prints `source: document <path>`, and a user who names a file means `--source` on every route, never the text pasted as the request alone. The second is a new paragraph in step 3. It says such a line goes on record with `crew que

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 4.02 USD
- Exit status: 0
