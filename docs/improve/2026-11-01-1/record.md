# Improvement run 2026-11-01-1

- At: 2026-11-01T12:00:08.766Z
- Targets: spec-bootstrap-gate, spec-bootstrap-small
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-bootstrap-gate | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| spec-bootstrap-small | 0.86, 1.00, 0.86 | 0.90 | 0.14 |
| writing-standard-ending-without-tells | 1.00, 0.83, 1.00 | 0.94 | 0.17 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/writing.md
- Rationale: That cap is on the frontend standard, not on writing.md, so the edit breaks no pinned test. Nothing else is needed.

I changed one harness page and nothing else: `plugins/core/skills/crew/references/writing.md`, a new section "Read back what you wrote" between "Facts are kept" and "Where it applies". The `reads-back` grader of `spec-bootstrap-small` judges the trace and wants a Read of a written README after the last Write; in the two failing runs the other six graders passed (the item was opened, the symbols cited, nothing committed), so the lead wrote the contracts and ended with no Read after its last write, which fits a read-back followed by a correction that was never re-read, a read-back through `cat`, or a read of only the last file. The page that governs that step, `plugins/core/skills/wizardingcode-spec-bootstrap/SKILL.md` step 8, is outside the folders I may edit, and no other page in my folders is read by a bootstrap session at that moment: the Stop hook never forces a gate run on READMEs, since `**/*.md` is in the engine's default watch exclusions, and the crew method's Build and Deliver pages are not opened for a documentation chore. The one page every session is pointed to when it writes a text is `references/writing.md`, named by the session-start hook and by `build.md` and `deliver.md`, so the rule now lives there in the crew's words: a hand-written file is read back whole with the Read tool after its last write, the read is the last call on the file, a correction is followed by another read, a shell read or a memory of the sent text does not count, and the ending says the files were read back. The test's pins on writing.md (its four headings, the tells slice, the quoted phrases) are intact, and the only byte cap near it is on the frontend standard. I did not run the tests or the eval, and the fix for the right reason in full belongs in the bootstrap skill's step 8, which I left untouched because it is out of scope.
- Probe set: spec-bootstrap-gate, spec-bootstrap-small, writing-standard-ending-without-tells
- Gain: 0.10

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| spec-bootstrap-gate | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| spec-bootstrap-small | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| writing-standard-ending-without-tells | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: unprobed (the probe set (20 cases, about 178.26 USD by the baseline's costs) is above what is left under the ceiling (3.67 USD); not probed)

- Diff: M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md, M plugins/core/skills/crew/references/receive.md
- Rationale: Nothing pins the three extended sentences, and the Gate page's round-cap sentence that a test quotes whole is untouched since my sentence sits before it. The edits are complete.

I changed three harness pages and nothing else: `plugins/core/skills/crew/references/gate.md` (one sentence in step 4 of the judgement gates, after "Fix them"), `plugins/core/skills/crew/references/deliver.md` (one sentence in the opening paragraph, before "Tell the user") and `plugins/core/skills/crew/references/receive.md` (one sentence after the `--criterion` line of section 2). The `reads-back` grader of `spec-bootstrap-small` judges the trace and wants a Read tool call on a written README after the last write to one, and the other six graders passed in the failing runs, so the contracts were written inside an item with the right citations and the ending is where the read-back was lost. The bootstrap skill (outside my folders) already says to read back with the Read tool after the last write, but its step 8 ends on "remove what does not hold", and the crew's own loop adds more writes after that read-back on the route this request takes (scope above one spot, so standard): a judgement-gate finding fixed with Edit before the next gate run, a lead's `returned` at delivery, each followed by the ending with no read of the corrected file, which is exactly what a unanimous FAIL and a split vote look like. Markdown is outside the watch, so no hook blocks the turn or names the gap. The three sentences now say that a document the item delivers is read back with the Read tool after every write to it, a correction included, so the read-back is the last thing done to the file; the gate's own scan is not one. The crew skill page itself was ruled out by measurement: it holds 9252 bytes against its 9254-byte ceiling. `spec-bootstrap-gate` reads none of these pages before it asks and writes nothing, so its score stands. I ran no tests and no eval, since this session has no shell; the only pinned sentenc

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-291
- Cases no run has measured (never probed): spec-brainstorm-open, spec-draft-owner, spec-draft-write, spec-drift-detect, spec-isolation, spec-loop-rules, spec-resolve-rules, spec-review-planted
- Cost: 16.33 USD
- Exit status: 0
