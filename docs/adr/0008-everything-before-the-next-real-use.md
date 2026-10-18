# ADR 0008: Every remaining subproject before the next real-use phase

- Status: accepted, 2026-10-18, the user's decision in this repository's session of that day.
- Context: ADR 0004 (one real-use phase per subproject), ADR 0007 (the re-cut and the timing of 1.0), the SP7 design (`docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md`), finding #66.

## Context

SP7a shipped as 0.6.0 on 2026-10-18 and, by ADR 0007, its real use in three workspaces would come before the SP7b plan. The user's projects had waited for the crew since SP7 began, and the user asked for the whole of it closed before those projects start: "é para fazer tudo, no final é que passamos aos testes reais … estamos a perder muitos dias de desenvolvimento dos projetos reais à espera disto". Offered three cuts (real use now with SP7b built in parallel, the agent's recommendation; everything first; only what the projects need now), the user chose everything first.

With 0.6.0 the crew has the engine and the base method (SP1), the conclave and the judgement gates (SP2), mail inside a workspace (SP5's first half) and the team model (SP7a). What the user's flow still lacks is in the SP7 design as design: the environment and the e2e gate, priorities, statuses and threads on mail, the workspace view (SP7b); reception from a task manager or a document, the doubt stops with nobody present, the issue analysis, Jev (SP3); the strategy stage and the audit (SP8); the knowledge base and the CTO's report (SP4); the packs (SP6).

## Decision

1. **SP7b, SP3, SP8, SP4 and SP6 are built back to back from 2026-10-18**, each from its own plan, each task a crew item on the standard route as SP7a's were, with no real-use phase between them.
2. **One release per subproject at its close**: 0.7.0 (SP7b), 0.8.0 (SP3), 0.9.0 (SP8), 0.10.0 (SP4), 0.11.0 (SP6). The marketplace entry follows each release. The install (`claude plugin update`) and the restart happen when the user wants the running plugin ahead, and before the real-use phase at the latest; the hooks of this repository's own sessions may run an older installed plugin meanwhile, as finding #66 describes, and the records say which.
3. **The evals per subproject are its new cases and `fast-route-overhead`**, run at the close with `--case`; the whole suite runs once before the real-use phase, and that run is the one the real-use README quotes.
4. **The real-use phase of ADR 0004 and ADR 0007 runs after 0.11.0**, on everything at once: the three workspaces, ten items across the routes, the findings from #67, one release at the close. 1.0 is cut from it under ADR 0004's exit criterion (no `blocks` or `false-proof` finding open).
5. **The round caps keep the user's standing yes of 2026-10-17** (finding 57) until SP7b records the grant in the policy; every continuation is recorded as the user's, relayed.

## Alternatives rejected

- **Real use now, SP7b in parallel.** The agent's recommendation: the projects stop waiting the same day, and the real items correct the next design. Rejected by the user: the projects would develop on a plugin that changes under them, and the user wants the set closed first.
- **Only what the projects need now** (reception, the doubt stops, threads, the workspace view in two or three days). Rejected for the same reason.
- **One release at the very end.** Rejected: a release per subproject keeps each close provable (the version files, the build, the checks, the tag) and lets the user install any of them.

## Consequences

- `docs/real-use/README.md`'s "SP7a in real use" paragraph is superseded by this ADR: the phase starts after 0.11.0 and covers SP7a to SP6 together; the findings keep their numbering.
- The vision's status line names the order and the versions; its §16 keeps the order of ADR 0007.
- The debt SP7a deferred "to the real use" (the per-todo judgement gates, the CTO's seat on full items, the e2e gate and the console check, priorities and statuses, threads with contracts and evidence, `crew workspace status`, the standing grant for the caps) is taken by the SP7b plan now.
- Risk: five subprojects without real use between them accumulate assumptions the real projects would have corrected; the per-subproject evals and the leads' validations are the only check until the phase. What a real project would have caught is recorded in `findings.md` when it surfaces.
