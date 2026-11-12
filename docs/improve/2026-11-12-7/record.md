# Improvement run 2026-11-12-7

- At: 2026-11-12T19:00:11.317Z
- Targets: document-entry-opens-item, prose-gate-refuses-chatbot-artefact
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| document-entry-opens-item | 0.50, 0.25, 0.50 | 0.42 | 0.25 |
| prose-gate-refuses-chatbot-artefact | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page, `plugins/core/skills/crew/SKILL.md`, and nothing was run in this session (no shell), so whether the score moves is unmeasured. `prose-gate-refuses-chatbot-artefact` is at mean 1.00 with no evidence, so it is passing and I left it alone. For `document-entry-opens-item`, the `source-document` regex wants the engine's `source: document docs/requests/newsletter.md` line, which only `crew start` with a document `--source` prints. The engine also writes the `.questions.md` file beside the document only for an item started that way, so a missing source sinks `question-or-built` and the ending with it. Every recorded run of the case shows `reads: []`: the lead never opens `references/receive.md`, which is why the three earlier proposals that edited that page moved nothing. The one probe that did pass the regex (2026-10-26-2 P-1) had edited the skill page. That page offered only `[--source '<json>']` with no shape, so a lead that reads nothing else cannot write the flag. The Receive row now carries the shape in a parenthesis: "(a named file: `--source '{"channel":"document","documentPath":"<path>"}'`)", checked against `packages/engine/src/source.ts`. The row keeps its pinned wording and names no fixture file, so loading the skill cannot satisfy the regex by itself. To stay under the 9254-byte cap I paid for it with seven wording trims that no test pins:

- "The `crew` command is the engine" became "`crew` is the engine".
- "when the work is done" became "when work is done".
- "; they go to `crew start` as `--answers`" became ", for `crew start --answers`".
- "sends the work to the full route" became "means the full route".
- ", in three calls" was dropped from the fast-route heading.
- "is on this page" became "is here".
- "the command runs with no prompt" became "no prompt appears".

The page now probes at 9245 characters, 9249 bytes.
- Probe set: document-entry-opens-item, prose-gate-refuses-chatbot-artefact
- Gain: 0.42

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| document-entry-opens-item | 1.00, 0.75, 0.75 | 0.83 | 0.25 |
| prose-gate-refuses-chatbot-artefact | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: unprobed (the probe set (2 cases, about 7.26 USD by the baseline's costs) is above what is left under the ceiling (3.01 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured. `prose-gate-refuses-chatbot-artefact` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `document-entry-opens-item`, the `source-document` regex wants the `source: document <path>` line, which only a `crew start` with a document `--source` prints. The engine writes `<documentPath>.questions.md` only on an item started that way, so a missing source also sinks `question-or-built` and usually `honest-ending`. I had no trace of these runs; earlier records of this case show `reads: []`, so I took the skill page as the only harness text the lead reads. That page's Receive row gave `[--source '<json>']` with no shape and left the shape to `references/receive.md`, which the lead never opens. The Receive row's command cell now ends with ``; a file: `--source '{"channel":"document","documentPath":"<path>"}'` ``, written with a placeholder path so the page itself cannot match the grader. The page has a 9254-byte cap, so I paid for the 69 characters with five wording trims that no test pins:

- "The `crew` command is the engine" became "`crew` is the engine".
- "; they go to `crew start` as `--answers`" became ", for `crew start --answers`".
- "is on this page" became "is here".
- "the command runs with no prompt" became "no prompt appears".
- Rule 6 lost "The answers are required; ".

The page now probes at exactly 9244 characters, 9248 bytes, and the strings the tests pin (`[--source '<json>']`, the Receive row's "a ticket or a document … `references/receive.md` … every route", the fast route's "a sourced request") are untouched.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-395
- Cases no run has measured (never probed): none
- Cost: 16.99 USD
- Exit status: 0
