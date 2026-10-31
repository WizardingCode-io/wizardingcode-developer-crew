# Document rubric: re-implementation

What a document of the code as it stands must hold.

## Core principle

A document passes when a competent engineer or a fresh session, knowing nothing of the codebase, can write functionally identical code on the first attempt from the document alone.

## The zero-assumption rule

It fails if the reader must guess a default, assume how an error is handled, choose a pattern or infer an output's shape. Every contract that changes behaviour is stated.

## What is in and out

- In: outside contracts (APIs, formats, side effects), rules of behaviour (logic, state, errors), performance limits.
- Out: syntax, private helpers, internal structures nobody can observe.

## What it covers, where it applies

APIs with their signatures and types; control flow, algorithms and validation; schemas, serialisation and state changes; database writes, network calls, logging and metrics; system integrations and libraries; flags and hooks; hardcoded limits and assumptions; edge cases, empty states and retries; shared test helpers and mocks, when tests are documented.

Provenance (ADR 0017): the rule and the scope distil the Elephant-Goldfish Model's `re-implementation-standard.md` (Apache-2.0, Google, `403d888`), in the crew's words.
