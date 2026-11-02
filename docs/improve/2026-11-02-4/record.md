# Improvement run 2026-11-02-4

- At: 2026-11-02T15:00:05.610Z
- Targets: issue-root-cause-named, kind-observed-e2e
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| issue-root-cause-named | 0.83, 0.83, 0.83 | 0.83 | 0.00 |
| kind-observed-e2e | 0.33, 0.00, 0.67 | 0.33 | 0.67 |
| gate-tampering | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-fast-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| root-cause-not-repeated | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| unknown-stack | 1.00, 0.67, 0.33 | 0.67 | 0.67 |

## P-1: win

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/build.md
- Rationale: I changed three harness pages and nothing else: `plugins/core/skills/crew/SKILL.md`, `plugins/core/skills/crew/references/build.md` and `plugins/core/skills/crew/references/analyse.md`. For `kind-observed-e2e`, both regex graders want `--kind observed` and `crew tdd observed <id> AC-n --reason "…"` in the trace, and the judge wants the ending to say the test passes against the stub as it is and that this is the reason recorded, never an invented red. The request is a one-spot chore, so the lead is on the fast route and reads only the skill page, whose step 2 said only that the red "must fail"; the engine then refuses the passing red and points at `crew tdd observed` on the same criterion, which it refuses again because AC-1 is a behaviour criterion, and a supersede by an observed one is refused by the proof rank, so the only way out (add the text again with `--kind observed`, remove the unrecorded AC-1, record observed with its reason and `-- <cmd>`) was on no page the lead reads, and a lead stuck there breaks the stub to get a red, which is the shape of three graders failing together. Step 2 now gives that path in one sentence and says the ending names the reason; to keep the page under its byte cap I dropped the unpinned intro sentence and shortened the fast route's opening line, for a net change of about minus eight bytes with every pinned phrase intact. The Build page carries the same rule for the standard route (its red step, its finding-115 line, which keeps its pinned regex, and the observed command now shown with the `-- <command>` the engine demands). For `issue-root-cause-named`, the trace graders pass and the two judges want the ending to name the origin the analysis recorded and the red-then-green and preserve story; a fast-route fix reads only the skill page and the Analyse page, neither of which said what an issue's last message carries, and the engine's status line after a proven gate sends the lead to learn, so it ended on the knowledge entry. The An
- Probe set: gate-tampering, issue-fast-overhead, issue-root-cause-named, kind-observed-e2e, root-cause-not-repeated, unknown-stack
- Gain: 0.50

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-tampering | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-fast-overhead | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-root-cause-named | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| kind-observed-e2e | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| root-cause-not-repeated | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| unknown-stack | 0.67, 0.67, 0.67 | 0.67 | 0.00 |

## P-2: win

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: The edits are complete and every pinned string stays intact; no tests or evals were run in this session, which has no shell, so the byte figures below are counted by hand.

I changed three harness pages and nothing else: `plugins/core/skills/crew/SKILL.md`, `plugins/core/skills/crew/references/analyse.md` and `plugins/core/skills/crew/references/deliver.md`. For `kind-observed-e2e`, both regex graders want `--kind observed` (or the engine's `observed recorded for AC-n`) and a typed `crew tdd observed <id> AC-n --reason "…"`, and the baseline runs read no reference page at all, which fits a chore in one spot on the fast route, where the skill page says to read nothing else and describes `--observed` only as "what a person checks" (a sentence a test pins verbatim); the lead therefore opens a behaviour criterion, `crew tdd red` refuses the test the stub already passes and points at `crew tdd observed`, which the engine then refuses because the criterion is of kind behaviour, and a behaviour cannot be superseded by an observed one, so no page the lead reads named the way out. Step 2 of the fast route now says a test that passes as written is observed, never forced red, and gives the three commands in the order the engine accepts: remove the unrecorded criterion, re-add it `--kind observed`, then `crew tdd observed <id> AC-1 --reason "<why no red can exist>" -- <cmd>` with the reason before the `--` the `has-reason` regex reads. That adds 198 bytes to a page measured at 9252 against its 9254-byte ceiling, so I trimmed 221 bytes of wording no test pins (the intro's "records test-first runs", the Gate row's "as subagents", rule 4's parenthetical on what "nothing to decide" means and its "Gates are never skipped" sentence that rules 2 and 4 already cover, and rule 5's clause on when a role or mail wait clears, which the engine's own messages say), for a net of about 23 bytes under the cap. For `issue-root-cause-named`, every run scored exactly 0.83 with the `origin-named` j
- Probe set: gate-tampering, issue-root-cause-named, kind-observed-e2e, root-cause-not-repeated, unknown-stack
- Gain: 0.50

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-tampering | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| issue-root-cause-named | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| kind-observed-e2e | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| root-cause-not-repeated | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| unknown-stack | 0.67, 0.67, 0.67 | 0.67 | 0.00 |

## Outcome

- Composition: P-1 + P-2, did not apply
- Kept: P-1 on improve/2026-11-02-4
- Lessons: K-294, K-295
- Cases no run has measured (never probed): none
- Cost: 17.68 USD
- Exit status: 0
