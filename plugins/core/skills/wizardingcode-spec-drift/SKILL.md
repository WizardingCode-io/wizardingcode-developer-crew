---
name: wizardingcode-spec-drift
description: "Compares the documents in a folder with the code as it is now and reports only the differences. Run weekly by recommendation; a person chooses which side changes."
---

# Spec drift

## When

When asked to compare documents with the code. Weekly is the recommendation, and nothing enforces it. Not the same as the architecture gate, which judges what one diff introduced.

## Inputs

A folder of documents or READMEs, by default `docs/designs/`, where `crew learn` publishes the approved ones. Asked with no folder and none there, ask for it.

## Steps

For each document, one at a time, so nothing overflows:

1. **Read it**: its intent, the changes it proposes, the files and symbols it names.
2. **Find the code.** Follow its paths, or search for the classes, functions and endpoints it names. A document that makes you search is worth saying so: suggest adding the links.
3. **Read the code as it is now**, never from memory.
4. **Compare.** Missing features: logic described and absent. Incomplete models: fields specified and not there. Logic shortcuts: a hardcoded value where the design has logic. Architectural divergence: other patterns or libraries than proposed. An object, a field or a file the document names and the code lacks is drift, and code no document covers is drift too.
5. **Append only the differences** to `<date>_DRIFT_REPORT.md`, under `## <document>`: a bullet per divergence, or `No drift detected`. Never describe what matches.

A person chooses which side changes, the document or the code. This skill changes neither.

## Output

`<date>_DRIFT_REPORT.md`.

## Done when

Every document in the folder has its section.

Provenance (ADR 0017): this skill distils the Elephant-Goldfish Model's `egm-drift-report` (Apache-2.0, Google, `403d888`), in the crew's words.
