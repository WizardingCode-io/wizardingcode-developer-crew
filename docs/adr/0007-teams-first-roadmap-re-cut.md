# ADR 0007: Teams first, then reception; the roadmap re-cut and the timing of 1.0

- Status: accepted, 2026-10-17. Ships as the SP7 design (`docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md`) and the plans that follow it.
- Context: ADR 0004 (the scope of the production release), the real-use phase of SP2 (`docs/real-use/README.md`), the SP2c eval run (`docs/evals/2026-10-17-sp2c-results.md`), the user's context of 2026-10-17 on teams, agents, workflows and rules.

## Context

With 0.5.1 the crew proves an item done, has ten read-only roles, the team of an item (tasks to implementers in worktrees), mail between the projects of a workspace and an eval suite. The vision's roadmap (§16) puts reception and routing (SP3) and the validated-solutions base (SP4) next, and ADR 0004 cuts 1.0 after one phase of real use of SP2.

On 2026-10-17 the user set what the product is for: a development team at the level of a top startup, with tech leads, a CTO, judges, nine teams (architects, researchers, ETL, security, DevOps, QA, backend, frontend, agentic OS), five personalities in every team, twenty rules, workflows for four kinds of work (a client request, a request across projects, a new project or feature, an issue), reception from task managers and documents, a knowledge base with learning cycles, Jev as the verification backend, branded audit reports, and full visibility in the mod; all of it able to run mostly 24 hours a day without a person, with high risk waiting for one. The user also said what it must not be: nothing copied from earlier systems of theirs (wzrdxOS, ArkaOS); something built from the crew's own engine.

Two facts order the work. The team model is what every other piece is expressed through ("the route decides the team"; who receives a request; who signs a priority; who the knowledge base serves), and it changes what "proven" shows in a report. The user works with real clients every day and has asked, more than once, for value in days rather than weeks and for no endless loops.

## Decision

1. **A new subproject, SP7 "Teams", comes before SP3 and SP4.** It is delivered in two releases: 0.6.0 (the team model, the tech lead, the gate scoped to the change, the brief per todo, the project's decision register, the rules reference, the first visibility in the mod) and 0.7.0 (the local environment the engine starts and checks, priorities and statuses on mail, threads with contracts and evidence in the reply, sessions and messages in the mod). Each release is used for real in three workspaces (two clients and the brand's own) before the next.
2. **A new subproject, SP8 "New projects: strategy and audit",** sits between SP3 and SP4: the strategy stage (viability, cost, time, stack, scaling phases, proof point by point) and the end-to-end audit of an existing codebase with a report under the brand.
3. **SP3 keeps its content and gains the issue workflow and Jev**: reception from a task manager (ClickUp first, through MCP) and from documents, the urgency triage against the business priorities a workspace signs, the issue analysis to its origin in the records, and Jev (TypeSafe) as the verification backend, mandatory when its key works and escalate-only, as vision §8 already demands of every backend.
4. **SP4 keeps its content and gains the CTO's report**: the shared knowledge base with a confidentiality mark per entry, the learning cycles, and `crew cto review` over the engine's records.
5. **SP6 closes** with packs (teams as templates, stack specialists, checklists), the loop that folds an external skill into our agents only with proof, runtime adapters and the benchmark.
6. **1.0 is cut after SP7's first real use (after 0.7.0)**, not from 0.5.x: ADR 0004's exit criterion stands (no `blocks` or `false-proof` finding open), applied to a product whose reports already show the team. Until then the releases are 0.6.0 and 0.7.0; from 1.0 on, SP3, SP8, SP4 and SP6 ship as 1.1 to 1.4.
7. **The knowledge base's store** is decided at the SP7 spec review: the brand's memory plugin (wizardingcode-mem) when it is installed, the engine's protected JSON otherwise; the SP7 records are shaped so either store reads them.

## Alternatives rejected

- **SP3 first, as the roadmap said.** Reception without a team to receive is a queue nobody works; the triage needs the tech lead who confirms a priority.
- **One large teams subproject in one release.** One design is right (the organization and the workflows are one picture), but one release would repeat the loops the user asked to stop; two releases show the team on real items within days.
- **Cut 1.0 now from 0.5.x and number the teams work 1.1 and 1.2.** A 1.0 whose reports do not yet name the team would be re-defined two releases later; the real-use phase of SP2 continues through SP7's.
- **Agents per specialist and per personality.** Every agent description costs every session (finding #33); one parameterised expert and five personality files cost the same regardless of the number of teams.

## Consequences

- The vision's §16 gains rows 7 and 8 and the order after 2 becomes 7, 3, 8, 4, 6; §18 gains team, seat, tech lead, personality, thread and environment.
- The real-use phase (ADR 0004) runs through SP7's two releases before 1.0; `docs/real-use/README.md` gains the SP7 paragraph when 0.6.0 ships.
- The SP2c eval debt (#33 measured, #37, #40, #45 to #47) stays recorded and is taken in the hardening item of whichever subproject touches the same files.
- Nothing from wzrdxOS or ArkaOS enters the design; where the same idea appears (a judge, a conductor, a routing table), the crew's own mechanism is used and the record says so.
