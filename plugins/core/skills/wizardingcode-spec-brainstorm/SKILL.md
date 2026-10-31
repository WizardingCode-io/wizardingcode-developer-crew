---
name: wizardingcode-spec-brainstorm
description: "Turns a raw idea into a tested concept before the spec: open questions, a stated hypothesis, six reviewers with no context attacking it, and a brief the draft starts from."
---

# Spec brainstorm

## When

A feature or a new project on the full route, before the spec: the guard into specify requires the brief. An issue does not need one: `analysis.md` is its predecessor. Also on its own, for any half-formed idea.

## Inputs

The request, the repository, what `knowledge.md` lists.

## Steps

1. **Drill the problem** with open questions in plain chat, one at a time, with no canned options: what problem or bottleneck does this solve, who or what consumes it, what constraints cannot move, what is out of bounds, how is it dealt with today and why does that fail, how will success be measured. Do not launch anything after a single answer. With nobody present the request is the hypothesis, and what you would have asked goes in the brief as assumptions.
2. **State the hypothesis** in two or three sentences and ask whether to go to the reviewers or keep clarifying. Launch nothing before the person says go.
3. **Launch the six lenses in parallel**, each a fresh launch, with the concept and `Mode: brainstorm`, each with its lens: `goldfish-zoom-out` (does this need to exist, what already does it), `goldfish-design` (load, cost, quotas, tokens), `goldfish-comprehension` (usability and ergonomics), `goldfish-readiness` (migration and rollback), `goldfish-codebase` (observability and debugging), `goldfish-structural` (debt in two years). Each answers with `mode: brainstorm` as its first line. You never write an answer for one.
4. **Write `concepts_brief.md`** in the item's folder, in plain words: `## Overview`, `## Analysis` (what the lenses found, one account, duplicates merged), `## Goals vs. Non-Goals`, `## Alternatives Weighed` (each rejected option with why: the draft copies them from here and has no other source), `## Key Decisions`.
5. **Tell the person** the path and the two or three strongest objections, and ask how they want to answer: pivot, narrow, or add a constraint. Go round until the concept has survived. Critique first, no flattery.
6. **`crew spec-review <id> brief`** records it with its lenses, and the guard opens.

## Output

`concepts_brief.md`, the lenses' answers under `spec-review/`, the record.

## Done when

`crew spec-review <id> brief` accepts it. Then `wizardingcode-spec-draft`.

Provenance (ADR 0017): this skill distils the Elephant-Goldfish Model's `egm-brainstorm` (Apache-2.0, Google, `403d888`), in the crew's words.
