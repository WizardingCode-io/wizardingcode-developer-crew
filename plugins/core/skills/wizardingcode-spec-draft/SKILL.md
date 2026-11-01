---
name: wizardingcode-spec-draft
description: "Writes the full route's spec and plan so a reader with no context can review them and an engineer can build from them: goals, journeys, alternatives, no choice left open."
---

# Spec draft

## When

An item on the full route, in specify and plan, before `wizardingcode-spec-review` reads what you wrote. Also on its own, for a design document outside an item.

## Inputs

The predecessor: the concept brief from `wizardingcode-spec-brainstorm`, `analysis.md` on an issue, or the person's notes. The repository. `rubrics/spec-feature.md` and `rubrics/spec-readiness.md`, which the reviewers will hold you to.

## Steps

1. **Read the predecessor first**, from the file. Drafting often runs in a new session, so memory is no source. With none, ask for the problem, the goals and the context.
2. **Write `spec.md`**: Problem, then Goals and Non-Goals, Open Questions (kept across sessions so nobody asks twice, removed once answered), Critical User Journeys (each with its given, its when and its then), Design with its Alternatives (each rejected option with why, copied from the predecessor; absent there, ask), Acceptance criteria, Risks and rollback, Non-Functional Requirements where they are real risks, Out of scope. Say why before how. Long text goes in the file, and chat gets its path and two or three lines.
3. **The owner decides the architecture.** A decision with more than one defensible answer (a data model, a boundary, storage, a protocol) goes to the person as `references/conclave.md` says: up to three options, each with its mechanism, its trade-offs and when it fails, unranked. Asked to choose for them, say the trade-offs again and ask again. A mechanical choice with one defensible answer (a file name, a format) is yours.
4. **Write `plan.md`** so that an engineer who knows nothing of the code builds it on the first attempt: every file marked `Create`, `Modify` or `Delete`, with what changes and why; each phase leaving the code buildable; the test cases, happy path and edge cases; the commands that verify. Pseudocode, APIs and schemas are fine. Implementation code is not. Links use relative paths inside a package and to a sibling.
5. **Stress-test before you agree.** Critique first, no flattery: state what is wrong, missing or risky, and the strongest case against, before any merit. Agree only after that. `references/writing.md` holds the rest of how this reads.
6. **Stop at a contradiction.** If a new request contradicts an earlier goal or the architecture, change no file in that turn: say the contradiction and ask.
7. **Design only.** No production file changes in this skill. Illustrative code goes in the document, or in a scratch file outside the project.
8. **Reconcile with the predecessor**, since no reviewer reads it. Contradiction: the predecessor decided a question and the draft decides it differently. Addition: the draft decides something the predecessor never raised, and it changes the architecture, an interface or a dependency. List contradictions first, one line each, quoting both, and the person decides each: the draft can be right, because drafting reads code the brainstorm did not. Do not grade the draft against the zoom-out rubric here: the session that wrote it agrees with it.

## Output

`spec.md` and `plan.md` in the item's folder (outside an item, `docs/designs/<feature>.md`), and the list from step 8.

## Done when

Every section holds or says why it does not apply, no contradiction is open, and the plan leaves zero choices to the implementer.
