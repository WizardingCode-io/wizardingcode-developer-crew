---
name: wizardingcode-spec-review-loop
description: "The rounds of a document review: what makes a round clean, the settled list, at most two rounds, and churn. Also runs any chosen reviewers over any document."
---

# Spec review loop

## When

Between the rounds of `wizardingcode-spec-review`. Also on its own, to run chosen reviewers against chosen standards over a document: a README, a spec, a section. Then you keep the rounds yourself, nothing is recorded, and you say the engine proved nothing.

## Inputs

The document, the part of it under review by heading (a heading survives edits, a line number does not, so find it again before each round), the reviewers and their standards. For a feature specification: `goldfish-design` and `goldfish-structural` with `rubrics/spec-feature.md`. For a plan: `goldfish-readiness` and `goldfish-codebase` with `rubrics/spec-readiness.md`.

## Steps

1. **Launch** as `wizardingcode-spec-review` says: each reviewer a fresh launch, never resumed by `SendMessage` or `crew resume`: the one exception to the method's "resume, never relaunch", and a refused record means launching a new one.
2. **Record.** An answer reaches the record only through `crew spec-review record`. You never write or edit a reviewer's answer or its findings. A reviewer that fails is launched once more, then recorded `not run` and never filled in; it never counts as zero findings.
3. **Keep the settled list.** A finding is settled when it was contested, confirmed by a person or declined. Fresh reviewers sample differently, so one may raise it again at the same scope: mark it `settled` with `--earlier`, and it is not re-opened.
4. **A fixed finding raised again re-opens.** The fix failed, or a later edit undid it. A fixed finding is not settled.
5. **Judge the round from its reviews, before the fixes.** It is clean when every reviewer ran and only an unsettled Blocker is open: a Major and a Nit never keep a round open; they are notes the tests and the judgement gates carry.
6. **At most two rounds** (finding 227). A clean round 1 ends the review. Round 2 runs only when round 1 is not clean (an unsettled Blocker, or a reviewer not run), and after round 2 closes, clean or not, build opens with no person. Fresh reviewers find new gaps in every round, so a third round finds detail, not a change of design.
7. **The one stop.** churn: a new finding at the scope of an applied fix, which reverting that fix would resolve (`--churn` on `crew spec-review resolve`), stops the rounds before round 2. Write the open findings by severity, then ask the person one question: accept, or return the document to drafting.

Who decides: that choice is the person's. Ask, relay their own words, never answer, accept or pick for them. In a journey the item waits and you never run `accept`. An `escalate` is never turned into a `contest` to avoid asking.

## Output

The rounds in the record, and at a stop the list of what is open.

## Done when

The review is done (a clean round, two rounds), or a person chose.
