# 0019. The document is reviewed before the code, by reviewers with no context

- Status: accepted (the user, 2026-10-31). Extends ADR 0017 and ADR 0018.
- Date: 2026-10-31

## Context

The judgement gates review the diff after the code, and the leads validate the spec with the item's records in hand. Nothing reads the document before the code with no context, so an assumption the author holds in memory survives until it is built. The user asked for Google's Elephant-Goldfish Model (Apache-2.0, v0.1.0, commit `403d888`) whole in the core. The design is `docs/specs/2026-10-31-sp10-spec-review-and-journey-design.md`.

## Decision

1. **Every item on the full route passes a `spec-review` phase** between plan and build: stages in order over `spec.md` and `plan.md` (five at first; stages 5, 7 and 9 since item 2026-11-08-001, point 4). The agent recommended a trigger by work type, since EGM itself excludes a small clear bug fix; the user chose the whole route.
2. **The guard into build requires the review done** (point 4): at first the stages closed on the document's hash, an edit making them stale; since item 2026-11-08-001 a done review holds on the text that follows, so the fixes a round proposed do not reopen it.
3. **Reviewers have no context**: read-only, `omitClaudeMd: true`, fresh on every round. The record refuses a resumed one, by the agent id the hook filed. This is the one exception to "resume, never relaunch".
4. **At most two rounds** (item 2026-11-08-001, finding 227, replacing the source's two clean rounds in a row and its cap of five): a clean round ends the review, round 2 runs only after a round 1 that is not clean, and after round 2 build opens with no person; a round is clean when every reviewer ran and no Blocker is unsettled; a round has stages 5, 7 and 9; the churn rule stays, on a counter of its own beside `team.maxJudgementRounds`.
5. **The source enters rewritten**, one ledger row per rule, as ADR 0017 and ADR 0018 ask. The synthesizer and the bootstrap orchestrator have no agent, because a role here may not write or launch; the session does their work and the rows record the refusal. The site, the packaging, the release scripts and the contribution rules are refused by the user's word.

## Consequences

- A full-route item costs more: 9 to 16 reviewers a pass by the source's records, and up to 5 rounds. The user accepted this for small fixes in a risk area too.
- Fresh reviewers sample differently, so findings do not reach zero. The settled list and the clean-round rule stop that from running forever.
- The gain is measured with planted defects (the design's §7) and reported as it comes out. The source says of itself that finishing its workflow does not demonstrate a productivity improvement.
- The existing roles keep receiving `CLAUDE.md`. Whether they should is a decision for after the measure.
