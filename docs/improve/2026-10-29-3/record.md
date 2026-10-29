# Improvement run 2026-10-29-3

- At: 2026-10-29T23:00:09.670Z
- Targets: code-quality-flags-unasked-dependency, prose-gate-refuses-chatbot-artefact
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| code-quality-flags-unasked-dependency | 0.17, 0.67, 0.83 | 0.56 | 0.67 |
| prose-gate-refuses-chatbot-artefact | 0.75, 0.75, 0.75 | 0.75 | 0.00 |

## P-1: unprobed (the probe set (20 cases, about 96.28 USD by the baseline's costs) is above what is left under the ceiling (14.17 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/understand.md
- Rationale: I edited two harness pages so that a choice the request already answers is no longer reopened as a decision. Nothing has been re-run, and I couldn't see the failing runs' traces, so the cause below is inferred.

**Fix for `code-quality-flags-unasked-dependency`.** In the failing runs, no ruling was recorded, the review never named `nodemon` as a defect, and both the dependency and the debug line shipped. That fits a session that stopped before the build. The case's own results log (`docs/evals/2026-10-29-no-slop-results.md`) records the same failure at run 21-19: the session waited on "keep or remove the person's edits". The prompt was later changed to give that answer in advance, but the harness still let the stop happen:
- `references/understand.md` said to mark the work as waiting, ask and end the turn, with no case for nothing left to ask.
- The Conclave page sent every "two engineers would differ" choice to `crew decision <id> add`.
- This fixture's policy keeps the default `unattendedDecisions: "wait"`. So a decision added while nobody is present blocks Plan forever, and that would explain why the score varies between runs.

**What the pages now say:**
- **Understand:** a choice the request's words already answer, such as what to do with the user's own uncommitted edits, is recorded as a confirmed assumption quoted from the request and never asked again. The ask-and-end-the-turn step now applies only when something is left to ask.
- **Conclave (`references/conclave.md`, "Decisions only the user can make"):** such a choice is quoted under "Assumed by good practice" as "the request decides:", and the session builds on it. It is not added as a decision, which would stop the item before Plan.

Choices the request leaves open are still recorded with `crew decision <id> add` as before. No test pins the sentences I changed.

**No fix for `prose-gate-refuses-chatbot-artefact`.** Its only failure is the `honest-ending` grader, which threw because the judge model hit it

## P-2: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one file, `plugins/core/skills/crew/SKILL.md`, and haven't run anything: no tests, no byte count of the page, no eval rerun. In the failing run of `code-quality-flags-unasked-dependency`, four graders failed: nothing was recorded at `crew judgement … record`, no review named `nodemon` as a defect, and both `nodemon` and the `console.log` shipped. That looks like a run that never reviewed at all, and the harness explains why. The fixture's policy adds the `code-quality` judgement gate on every route, and the engine plans it on the fast route too (`for (const g of policy.judgementGates) gate(g, "policy")` in `packages/engine/src/team.ts`). This request is small, one spot and no risk area, so the lead can take the fast route. That route's section of the skill page says to read nothing else and stop after `crew gate run` with "Say the verdict it prints", and it never mentions judgement gates. A lead following it reports "not proven" and ends, with no review, no ruling and the person's edits untouched. Step 3 of the fast route now says that any judgement gates the gate run plans (a policy can add them on any route) are run as `references/gate.md` says, with their defects fixed, and that the ending says the verdict, why, and what a review found. The review then names the dependency and the debug line, the prompt lets the lead change them, and the ending reports them. Every fast-route turn re-reads this page and a test caps it at 9254 bytes, so I made the change size-neutral by estimate (about 18 bytes shorter). I shortened the unpinned intro sentence and removed rule 4's "Gates are never skipped: fix it or set its command (`crew profile set`)", which rule 2 and rule 4's own "`crew skip` only for a step `policy.json` lists" already cover. The `honest-ending` failures in both cases, and the only failure in `prose-gate-refuses-chatbot-artefact`, happened because the judge model had hit its usage limit. That is the eval kit's problem, not the harness's, so I made no
- Probe set: code-quality-flags-unasked-dependency, prose-gate-refuses-chatbot-artefact
- Gain: 0.28

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| code-quality-flags-unasked-dependency | 0.83, 0.83, 0.83 | 0.83 | 0.00 |
| prose-gate-refuses-chatbot-artefact | 0.75, 0.75, 0.75 | 0.75 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-257
- Cases no run has measured (never probed): writing-standard-ending-without-tells
- Cost: 11.71 USD
- Exit status: 0
