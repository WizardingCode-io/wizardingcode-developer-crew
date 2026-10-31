---
name: wizardingcode-spec-resolve
description: "Answers each finding of a document review from the session that wrote the document: fix it, contest it with evidence, give it to the person, or decline a Nit. Never changes a severity."
---

# Spec resolve

## When

After a stage of `wizardingcode-spec-review` records its findings, in the session that wrote the document: it holds why each choice was made.

## Inputs

The findings (`crew spec-review <id> status`), the document, the code.

## Steps

1. **Give each finding one disposition**, `crew spec-review <id> resolve <finding> <disposition> --reason "<why>"`:
   - `propose-fix`: the finding is right. Say the exact change.
   - `contest`: it is wrong, or misreads the code. `--evidence <file:symbol>`.
   - `escalate`: it is wrong, and the proof lies outside everything the reviewer could read, such as a team convention or a spoken decision. Say so; the person answers.
   - `decline`: a Nit, recorded and not fixed. You may fix a Nit if the fix is worth it.
   - `settled`: it repeats a finding already closed, `--earlier <finding>`, at the same scope.
2. **The rules.**
   - A contest needs evidence the reviewer could read: a file and a symbol, or a decision recorded in the document. "This was intentional" is no evidence. The engine checks that it exists, not that it refutes, and a person reads every contest in the report.
   - A comprehension gap is never contested: if a fresh reader could not follow the document, the document is missing context.
   - Do not add context only to satisfy a reviewer. Add it when a human reader needs it; if only a reader with no context does, `escalate`.
   - A severity is never changed. If a Blocker looks like a Nit, contest it and say why.
   - You wrote the document. A wish to contest is no evidence that the reviewer is wrong.
   - An `escalate` is never turned into a `contest` to avoid asking.
3. **List each `escalate` first** when you tell the person: they need the person's knowledge, not only an approval. Then `crew spec-review <id> answer <finding> <confirm|add-fact> --reason "<their words>"`.
4. **Apply the fixes after the round closes**, then check the document still reads in order, and re-read it before the next round.

Who decides: an answer to an `escalate` is the person's. Ask, relay their own words, never answer, accept or pick for them. In a journey the item waits and you never run `accept`.

## Output

A disposition on every Blocker and Major, and the document fixed.

## Done when

`crew spec-review <id> close` no longer refuses for a finding with no answer.
