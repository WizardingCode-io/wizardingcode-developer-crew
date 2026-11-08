# 0021. The document review is calibrated: one style stage, a Major that names the wrong build, a stop on no progress

- Status: accepted (the user, 2026-11-01). Calibrates ADR 0019. Its stop on no progress is superseded by the two-round rule of item 2026-11-08-001 (finding 227, ADR 0019 point 4); the single style stage and the Major rule stay.
- Date: 2026-11-01

## Context

The first real full item under ADR 0019 (`docs/evals/2026-10-31-spec-review-results.md`, finding 214) ran the five stages four times on a nightly CSV export in a one-module repository and never had a clean round: 61, 37, 22 and 32 Blockers and Majors raised per round, about 13 USD in the review. `goldfish-style` ran in stage 7 and in stage 9, so its findings counted twice a round, and the reviewers rated wording and structure as Major under a definition that reserved it for a wrong build. The loop's only stops were the cap of five and a churn mark the session puts on one finding. The user was offered one style stage with tightened severities and a stop when the count does not fall, a smaller review for small features, or nothing, and chose the first.

## Decision

1. **`goldfish-style` reviews in stage 7 only.** Stage 9 keeps `goldfish-readiness` and `goldfish-codebase`.
2. **A Major names, on the finding, what a competent reader would build wrong or the real risk they would miss.** A finding that sentence cannot be written for is a Nit, as are wording, structure, repetition and headings. Blocker keeps its meaning. The seven goldfish pages carry the line word for word.
3. **The rounds stop on no progress.** When the last two closed rounds in which every reviewer ran have the last raising no fewer Blockers and Majors than the one before, above zero, the engine stops the rounds and a person chooses, as at the cap: `crew spec-review <id> accept`, or the document back to drafting. The count is what the reviewers raised, never the dispositions, so a session cannot make it fall. The stops rank churn, no progress, cap, not run.
4. **The full route keeps the review.** The user did not choose a smaller review for small features.

## Consequences

- By the rule, a review that makes no progress ends at the first round that does not fall below the one before, instead of at the cap. The one run recorded ended at round 4, as the baseline's session had by its own choice, so a saving in rounds is the rule's promise, not yet a measured one.
- Whether the calibrated reviewers converge on the item of finding 214 is measured by running it again, once, and recorded beside the baseline in the same results file; the item records the result as it comes out, and finding 214 closes only if the review converges.
- The source's rules stay in the ledger; the three calibrations have rows of their own naming this ADR.
