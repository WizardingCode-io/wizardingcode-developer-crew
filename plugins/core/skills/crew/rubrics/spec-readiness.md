# Document rubric: implementation readiness

What a plan must hold before anyone builds from it.

## Core principle

A plan passes when a competent engineer or a fresh session, knowing nothing of the codebase, can carry it out and produce the right change on the first attempt, with no guessing, no questions and zero design choices.

## The zero-decision rule

A plan that leaves the implementer to pick a schema, an API path or a dependency, or to decide how a new edge case behaves, fails. Those choices are made and written down in the plan.

## Phases

The work is cut into incremental phases, and each leaves the codebase stable, buildable and testable.

## What it holds, where it applies

- Scope: every file to create, modify or delete, each marked, each with what changes and why.
- Steps: the precise logic, data and API changes per file.
- Tests: the specific cases, happy path and edge cases, that must exist.
- Verification: the commands for build, tests and static analysis.
- No implementation code: pseudocode, APIs and schemas only.

Provenance (ADR 0017): the rules distil the Elephant-Goldfish Model's `implementation-readiness-standard.md` (Apache-2.0, Google, `403d888`), in the crew's words.
