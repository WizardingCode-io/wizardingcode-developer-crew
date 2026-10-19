# Strategy

A new project (`kind new-project`, or a feature raised with `crew kind <id> raise --reason "<why>"` while its spec is open), standard and full routes, between Understand and Specify. Goal: decide what to build and with what before a spec exists: viability, cost, time, the stack, the scaling phases, every claim with its proof. The engine checks the shape and the sources; the judge rules the substance; nothing passes it by default.

## 1. The research first

Launch the researcher (`wizardingcode-developer-crew:researcher`) with the brief's path and five questions: what exists today for this need (in the repository and the workspace's projects), what the documentation of the candidate stacks says (limits, maintenance, cost), what comparable work cost and took, what the request asks for that no need calls for, what a smaller answer would be. The hook saves `conclave/researcher.md`. Then `crew research <id> verify`: each quote checked in its source, Jev asked when configured (`references/jev.md`). At the conclave this researcher is resumed with the open decisions, never relaunched.

## 2. The document

Write `.crew/work/<id>/strategy.md` with five sections, in this order:

```markdown
# Strategy: <title>

## Viability
- <claim> [R<n>]

## Cost
- <figure with its basis> [R<n>]

## Time
- <figure with its basis> [R<n>]

## Stack
- From the research alone (no knowledge base until SP4): <the stack and why> [R<n>]

## Scaling phases

| Trigger | Change | Cost |
| :- | :- | :- |
| <an observable trigger: users, requests, records, a date> | <what changes> | <its cost> |
```

Every bullet ends with one or more marks `[R<n>]`, `n` the line number of `conclave/researcher.md` that carries the fact (a `- ` line under "What the code does today" or "What the documentation says"). A claim with no fact is not written. Knowledge marks `[K:<id>]` arrive with SP4: until then the Stack section says the strategy is from the research alone (no knowledge base until SP4). The table has at least one row: every project has a first trigger at which its design changes.

## 3. The two rules of discernment

- **Proportion.** Every element of the stack and the design is required by a need the Viability section states with a source. What nobody asked for and no fact calls for is over-engineering: name it and refuse it with the proof. A personal finance app does not need an onion architecture, microservices and an external identity provider; a social network with payments and real time deserves a monolith with an event-driven design first and the phases declared ("at X users this domain becomes a service").
- **Persuasion.** When the user asks for something worse than the need, the proof point by point comes before the yes: each of their reasons answered with a fact and its mark. Their final word is theirs: recorded with `crew decision <id> add` and `crew decide`, never written into the strategy as the team's.

A remote test environment like production is always recommended (rule 3): say so in the Time or the Stack section when the project has none, and the report names it when absent.

## 4. The check, the review and the ruling

1. `crew strategy <id> check`: the faults named (a section, an unmarked claim, a mark on a line that is not a fact, a knowledge mark, an empty table), or the review inputs written and the reviewer named.
2. Full route: launch the CTO (`wizardingcode-developer-crew:cto`) "as reviewer of the strategy" with the paths of `strategy.md`, `conclave/researcher.md` and the rubric `${CLAUDE_PLUGIN_ROOT}/skills/crew/rubrics/strategy.md`; the hook saves `conclave/cto.md`. Standard route: nobody sits; the judge reads the files.
3. Launch the judge (`wizardingcode-developer-crew:judge`) "as judge of the strategy" with the same paths and, on full, `conclave/cto.md`; the hook saves `review/ruling.json`.
4. `crew judgement <id> record --ruling .crew/work/<id>/review/ruling.json`: recorded against the hash of the two files, never the code's; an edit after it makes it stale, so check and judge again. Two strategy rounds, as the code's; `crew continue <id> judgement` is the user's.
5. `crew phase <id> next` into Specify: the spec takes the strategy's decisions as given, and the conclave resumes the researcher with what the spec leaves open.
