# ADR 0004: The production release is SP1 hardened plus SP2; SP3 to SP6 follow as 1.x

- Status: accepted by the user on 2026-10-14 ("sim força").
- Context: the user's goal stated on 2026-10-14, "terminar o plugin e passar para prod"; the vision's roadmap (`docs/vision.md` §16).

## Context

The vision says the first public release includes all six subprojects. SP1 is built, released as 0.1.x and in daily use on five projects. SP2 is designed. SP3 to SP6 (typed decision backends with replay, the validated-solutions base, session mail, packs and the public benchmark) are a line each in the vision.

The user wants the plugin finished and in production. "Production" here means: a version a team can install from the marketplace and rely on every day, with the method complete enough that "done" means proven and "right" means judged, and with the engine hardened against what three days of real use found. It does not need, on day one, a second decision backend, a base of validated solutions, mail between sessions or a public benchmark: none of the twenty findings asked for those, and every one of them asked for the engine to be right or for the conclave to exist.

## Decision

1.0 is:

- **SP1 hardened.** The engine questions the real-use phase named and left open: the proof scope by item (findings 9 and 20: lint, typecheck and format narrowed to the touched files where the tool takes paths; a `deps` baseline), the cost of a release (#11, #18: build outputs out of the fingerprint), and the real-use records' loose ends (the Laravel full suite under the engine). Each is a 0.1.x or 0.2.x item, proven through the method.
- **SP2 complete**, as designed in `docs/specs/2026-10-14-sp2-conclave-and-judgement-gates-design.md`: the gap round, the debate, the objection ledger, the validator for unattended runs, the five judgement gates, the `observed` criterion kind, and its evals.
- **Used in production first** on the same five projects for one phase, as SP1 was, with findings fixed in one release at the close.

SP3 to SP6 keep their place in the vision and ship as 1.x, each after its own real use. The order stays the vision's: 3 and 4 are the next value for the method (routing that learns, solutions that are reused); 5 and 6 widen where it runs.

## Alternatives rejected

- **All six before 1.0**, as the vision says. Months more before a team other than the author can rely on a stable release, with SP3 to SP6 designed against no real-use data of SP2.
- **1.0 now, SP1 alone.** SP1 proves "done"; it says nothing about whether the right thing was built, and the corpus shows that the gap round is where the real mistakes were (C-11, C-13, C-16). Shipping 1.0 without the conclave ships half the promise.

## Consequences

- The vision's §16 is amended: "The first public release includes subprojects 1 and 2; 3 to 6 follow as 1.x releases."
- The SP2 plan is the critical path. It is written next, task by task, from the SP2 design.
- The hardening items are planned beside SP2, not after it, since each one costs every SP2 item a second gate run or a skipped gate.
