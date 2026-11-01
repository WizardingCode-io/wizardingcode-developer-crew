---
name: wizardingcode-spec-review
description: "Runs five stages of review with no context over the full route's spec and plan, between plan and build, recorded by crew spec-review until two clean rounds in a row."
---

# Spec review

## When

Every item on the full route, in its `spec-review` phase. The guard into build refuses until the review converged on the document as it is, and an edit makes it stale. Also on its own, for a document with no item: the stages are the same, nothing is recorded, and what you say back states the engine proved nothing.

## Inputs

`spec.md` and `plan.md`, and any reading list you name. The reviewers read those and what they link, and nothing of how the document came to be.

## Steps

1. **`crew spec-review <id> check`** opens the round and says the stage due, its reviewers, the range and the standards. Run it before each stage.
2. **Launch the stage's reviewers**, each as a fresh launch, in parallel within the stage, never across stages:
   - 5, zoom out: `goldfish-zoom-out`, both files, `rubrics/spec-zoom-out.md`.
   - 6, comprehension: `goldfish-comprehension`, both files, no standard. Its paraphrase is compared with what you meant: a wrong one is a finding.
   - 7, critic: `goldfish-design`, `goldfish-structural`, `goldfish-style`, `spec.md`, `rubrics/spec-feature.md`, `rubrics/spec-heilmeier.md`.
   - 8, second zoom out: `goldfish-zoom-out`, both files, on what stages 6 and 7 added; name stage 5's findings so what was accepted is left alone.
   - 9, readiness: `goldfish-readiness`, `goldfish-codebase`, `plan.md`, `rubrics/spec-readiness.md`, `rubrics/spec-reimplementation.md`.

   Pass paths and the task, never your reasoning, the conversation or logs. A reviewer cannot open a URL: save the page in the workspace and pass its path.
3. **Fresh every time.** Every reviewer in every round is a fresh launch, never resumed by `SendMessage` or `crew resume`: this is the one exception to the method's "resume, never relaunch", and a refused record means launching a new one.
4. **`crew spec-review <id> record <stage>`.** An answer reaches the record only through `crew spec-review record`. You never write or edit a reviewer's answer or its findings, and `spec-review/` is the engine's. A reviewer that fails is launched once more; if it fails again, or the runtime cannot show it had no context, it is recorded `not run` and never filled in: `crew spec-review <id> record <stage> <role> --not-run --reason "<why>"`.
5. **Answer the findings** with `wizardingcode-spec-resolve`, and close the round: `crew spec-review <id> close`. Apply the fixes after the close, because the round is judged from the review, before the fixes.
6. **Go round** as `wizardingcode-spec-review-loop` says, until it says converged or stopped.
7. **`crew spec-review <id> report`** writes `spec-review/consolidated.md`. Give the person its path and the two or three findings that matter most.

Who decides: `accept`, an answer to an architecture question and an answer to an `escalate` are the person's. With nobody present, a recorded conservative default on an architecture question goes to the validator under `stated-default` (`references/conclave.md`); the rest waits. With a person, ask, relay their own words, never answer, accept or pick for them. In a journey the item waits and you never run `accept`. An `escalate` is never turned into a `contest` to avoid asking.

## Output

The record in the evidence, the answers under `spec-review/`, `spec-review/consolidated.md`.

## Done when

`crew spec-review <id> close` says converged, or a person accepted on the document as it is, and `crew phase <id> next` enters build.

Provenance (ADR 0017): this skill and its three neighbours distil the Elephant-Goldfish Model's `egm-draft`, `egm-review`, `egm-review-loop` and `egm-resolve` (Apache-2.0, Google, `403d888`), in the crew's words; `docs/sources/ledger.json` has a row per rule.
