# Document rubric: zoom out

What a reviewer checks a design against from high up, before the detail is worth reading.

## Core principle

A design passes when it solves the root problem in the simplest way, uses what exists and the codebase's conventions, adds nothing for a future no requirement states, and keeps its abstractions without sinking into code-level detail.

## Questions

1. Context first: can a reader tell what is being attempted and why? If not, the review fails there and asks for that context.
2. Root problem: does it fix the cause or patch a symptom, and does it fit the goals in the project's root documents?
3. No speculation: is any abstraction, code path or feature here only for a possible future?
4. No early optimisation: caching, sharding or queues before a bottleneck is proven?
5. Short data paths: does data pass through more components than it needs?
6. No dead end: do clean boundaries leave room to grow, without building the growth now?
7. Altitude: do high-level sections hold architecture, interfaces and data flow, not helpers and loop variables?
8. Structural fix over workaround: is a complex local workaround standing where a change to the root component would be cleaner?
9. Right place: does new logic sit in the layer that owns it?
10. Reuse: was the code searched for something that exists, stable and within the dependency boundaries?
11. Patterns and platform: does it follow the codebase's patterns and the ecosystem's standard tools rather than something bespoke?
12. Known anti-patterns: bypassed authentication, hardcoded deployment settings?

Provenance (ADR 0017): the questions distil the Elephant-Goldfish Model's `zoom-out-standard.md` (Apache-2.0, Google, `403d888`), in the crew's words.
