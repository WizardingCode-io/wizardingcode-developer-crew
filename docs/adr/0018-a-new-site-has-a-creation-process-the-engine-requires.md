# 0018. A new site has a creation process the engine requires

- Status: accepted (the user, 2026-10-30, D-1 to D-5 of item 2026-10-30-005). Extends ADR 0016 and ADR 0017.
- Date: 2026-10-30

## Context

SP9 and item 2026-10-29-001 took the policing of the user's outside sources and put their creation process on "not taken" lists, by the agent's own judgement ("landing-page art direction"), without the user's word. A person who asked for a site could get a generic page that passed every gate, while believing the sources had been implemented. The user's bar: no oversized things, not everything the same from site to site, nothing out of proportion, sites of 10K as the minimum acceptable.

## Decision

1. **Six skills of our own** (`wizardingcode-design-brief`, `-direction`, `-system`, `-copy`, `-build`, `-review`), each with When, Inputs, Steps, Output and Done when. The session records the surface and the amount of invention on every interface item on the standard and full routes.
2. **The engine requires what the skills produce.** On `surface` and `world`, `design-lint` fails with `process/<file>` on a missing or malformed brief, direction, copy or deal. The gate table of ADR 0002 stands: no new gate name.
3. **The deal runs over open data vendored at build time** (`plugins/core/design/library/`), each file pinned by hash, each row scanned. It replaces Impeccable's closed binary and private catalogue.
4. **Proportion is measured** in the fixture and graded by rule id, on a Persuade or Experience page. D-5 outranks a source that asks for more.
5. **A site differs from the earlier ones** on at least 4 of 6 measured dimensions, read from a machine-wide history in a closed schema.
6. **The bar is a score from a fresh reviewer**: under 8.5, a cap or a disposition other than `ship` leaves the item not proven. It is a model's reading, and the report says so.
7. **Every rule of every source has a row in `docs/sources/ledger.json`**: the file and text that hold it, or a refusal with the decision that refused it. A test fails otherwise. Nothing leaves a source by the agent's judgement alone.

## Consequences

- An ordinary change is untouched apart from one recorded line, `extend`.
- Six skill descriptions cost every session a little (finding 60), and the user asked for them.
- No machine proves taste. The engine proves the process ran and the measurable signs are absent; the direction's choice and the score remain judgements.
- A forged reading in `review/ui/` can pass the measures, since the session owns that folder; the captures stand before the reviewer, as ADR 0016 says of the rest of the evidence.
