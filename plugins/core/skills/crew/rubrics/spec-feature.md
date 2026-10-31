# Document rubric: feature specification

What a feature specification must hold before anything is planned.

## Core principle

A specification passes when a competent engineer or a fresh session, knowing nothing of the codebase, can understand the feature, why it is wanted and its trade-offs, and can confirm that the major risks and alternatives were faced.

## Alternatives

It must weigh alternatives. A specification that proposes one path, with no proof that other workable designs were considered and rejected for stated reasons (complexity, cost, performance, scale), fails.

## Risks and limits

It must state its own limits: failure modes, security consequences, scale limits and what answers each.

## Sections, where they apply

- Problem: the user or business problem.
- Goals and non-goals: what it will and will not deliver.
- Open questions: what is unresolved, kept across sessions so nobody asks twice, removed once answered.
- Critical user journeys: each with its given, its when and its then.
- Proposed architecture: components, data flow, how it fits around them.
- Alternatives considered: what was rejected and why.
- Risks and mitigations.
- Non-functional requirements: security and privacy, performance, rollout and rollback, only where they are real risks.

Provenance (ADR 0017): the principle and the sections distil the Elephant-Goldfish Model's `feature-spec-standard.md` (Apache-2.0, Google, `403d888`), in the crew's words.
