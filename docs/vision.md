# WizardingCode Developer Crew: Vision

> **Status:** SP1 (the engine, the base method, the mod and the evals) is implemented and measured as of 2026-10-12: [SP1 design](specs/2026-10-06-sp1-engine-and-base-method-design.md), [end-to-end check](plans/2026-10-07-sp1a-e2e-results.md), [evals record](evals/2026-10-12-sp1b-results.md). It was used on five real projects from 2026-10-12 to 14 and released as 0.1.0 to 0.1.7 from what that showed: [real-use summary](real-use/2026-10-14-summary.md). SP2 (the conclave and the judgement gates) is designed, [SP2 design](specs/2026-10-14-sp2-conclave-and-judgement-gates-design.md), and its engine half is built and shipped as 0.2.0 on 2026-10-14 ([SP2a plan](plans/2026-10-14-sp2a-conclave-in-the-engine.md)): the conclave phase, the gap round's decisions, the objection ledger, the observed criterion and the validator; the roles, the judgement gates and the evals (SP2b, SP2c) are next. 0.3.0, the same evening, is the experience release: decisions reach the user only when they exist and their word is the signature ([ADR 0005](adr/0005-attended-decisions-by-relay.md), relay by default), gates are mandatory and judge the item rather than the repository's debt ([ADR 0006](adr/0006-gates-judge-the-item.md)), the profile follows the manifests, and one gate run proves. 0.4.0 (2026-10-15) is SP2b ([SP2b plan](plans/2026-10-14-sp2b-roles-and-judgement-gates.md)): the ten roles as plugin agents with clean contexts (the judge on fable, the reviewers on sonnet, the debate roles on opus), the rubrics and the checklists by kind, the judgement gates planned from the route, the risk areas and the diff and recorded through `crew judgement`, never passed by default, the debate record, and the panel; the evals (SP2c) are next. SP3 to SP6 are design. 0.4.0 (2026-10-15) is SP2b, the roles and the judgement gates ([SP2b plan](plans/2026-10-14-sp2b-roles-and-judgement-gates.md)); 0.5.0 (2026-10-17) is SP2c: mail between agents inside a workspace, the team of an item, the three waits, the roles' answers and tokens from the hook, and the eleven evals ([SP2c design](specs/2026-10-15-sp2c-mail-evals-and-hardening-design.md), [plan](plans/2026-10-15-sp2c-mail-evals-and-hardening.md), [evals record](evals/2026-10-17-sp2c-results.md)). With it SP2 is implemented in full and SP5's session mail ships inside a workspace; the real-use phase of ADR 0004 continues in the user's projects. 0.5.1 (2026-10-17) closed four debts of the SP2c eval run. SP7 (teams: the organization, the workflows per kind of work, the rules) is designed ([SP7 design](specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md)) and comes before SP3 and SP4 ([ADR 0007](adr/0007-teams-first-roadmap-re-cut.md)). 0.6.0 (2026-10-18) is SP7a, released: the team registry and the seats per route, the tech leads' validations, the three reviewers and the personalities, the gate and the brief per todo, the decision register, `crew metrics`, the rules reference and the mod's team and todo ([SP7a plan](plans/2026-10-17-sp7a-teams-and-tech-lead.md), [evals record](evals/2026-10-18-sp7a-results.md)); 0.7.0 (2026-10-18) is SP7b, released: the priorities and statuses of mail, threads with contracts and evidence, the environment in the profile and `crew env`, the e2e gate around it with the console graded as data, the per-todo judgement gates and the standing grant for the caps, `crew workspace status` and the mod's views, and four eval cases ([SP7b plan](plans/2026-10-18-sp7b-environment-priorities-visibility.md), [evals record](evals/2026-10-18-sp7b-results.md)). 0.8.0 (2026-10-19) is SP3, released: the kind of work as data with the `analyse` phase, the reception of a request from a ticket or a document with its triage against the signed business priorities, the questions record and its channels, `crew analyse` and the analysis document, and Jev as the verification backend that only tightens, with four eval cases ([SP3 plan](plans/2026-10-19-sp3-reception-triage-issues-and-jev.md), [evals record](evals/2026-10-19-sp3-results.md)). 0.9.0 (2026-10-19) is SP8, released: the strategy stage of a new project (the document checked for its five sections and its marks on researched facts, ruled by the judge, reviewed by the CTO on the full route, a feature raised to a project with `crew kind raise`) and the audit of an existing codebase (`crew audit run` over the whole tree with no baseline, the roles reading the files, `crew audit report` with every finding proof-checked, in Markdown, HTML under the brand and PDF, signed by a person alone), opened by the hardening of SP3's debt, with five eval cases ([SP8 plan](plans/2026-10-19-sp8-strategy-and-audit.md), [evals record](evals/2026-10-19-sp8-results.md)). 0.10.0 (2026-10-20) is SP4, released: the knowledge base as the engine's protected JSON ([ADR 0009](adr/0009-knowledge-base-store.md)) with its five kinds of entry marked per workspace (rule 13), the lookup at Recognize with Jev reordering and never dropping, the Learn phase after Deliver (`crew learn`: the solution, an issue's root cause once, the research's facts with a source, the workspace's stack preference), rule 17 on the issue side (`crew analyse` names a known root cause and the guard refuses until it is cited or contradicted), the CTO's review from the records and the base (`crew cto review`, the plan entered marked), with three eval cases ([SP4 plan](plans/2026-10-19-sp4-knowledge-base-learning-and-cto.md), [evals record](evals/2026-10-20-sp4-results.md)). By [ADR 0008](adr/0008-everything-before-the-next-real-use.md) the remaining subprojects are built back to back before the next real use, one release each: SP6 (0.11.0) is next; the real-use phase runs after 0.11.0 on everything at once, and 1.0 is cut from it.
> **Date:** 2026-10-06. **Owner:** WizardingCode. **License:** MIT.

## 1. What it is

WizardingCode Developer Crew is an open-source system for coding agents. You give it one input, it guides the work from that input to a delivered change, and it does not report the work as done until a deterministic engine has proven it: the build runs, the tests pass, the checks are clean, and the evidence is on disk.

It installs as a plugin in Claude Code and as skills plus hooks in other agent runtimes.

The short version of the promise: **done is proven, not claimed.**

## 2. Why it exists

Three findings from the research behind this design (October 2026) shape everything else.

**Guided delivery already exists.** Superpowers, BMAD, Compound Engineering, cc-sdd and Claude Code's own commands all take one input and drive a lifecycle. Several adapt the amount of process to the task, and most run on many runtimes. "It guides you through everything" is not a position anyone can own.

**People abandon these systems for the same reasons.**

- Cost and latency out of proportion to the benefit.
- Ceremony on small tasks, and a pile of markdown to review.
- The agent does not follow the process, so there is no real guarantee.
- Loss of control, and process failures that are hard to see.
- The runtimes absorb the process layer.

**Nobody combines the parts that make a result trustworthy.**

- "Done" gates that are deterministic, adapt to the project's stack, and block.
- Security as a gate that blocks, not as an optional reviewer.
- Verification depth driven by risk, not only by size.
- Published, reproducible evidence that the system beats a plain agent.

Skill collections have a related problem. The reference collection that inspired this project ships 67 skills with no behavioural tests, version-stale content, about 29,000 characters of always-on descriptions, and no executable checks.

WizardingCode Developer Crew is a complete method of its own, built to avoid the abandonment causes, with a proof layer that nobody else has.

## 3. Principles

1. **One entry.** No commands to memorize. You describe what you want.
2. **Process follows risk, not size.** A three-line change to login gets more scrutiny than a new screen with no sensitive data. Process shrinks with risk. Proof never disappears; only its depth changes.
3. **The engine says "done", not the model.** Completion is a state the engine computes from evidence.
4. **Never a yes-man.** Nothing is implemented or approved for the next step in order to please the user. The user can overrule the system, and the record then says the user decided.
5. **One screen.** Anything the system asks a person to read or decide fits on one screen.
6. **State lives in the repository.** Work can be resumed in another session, by another person, or by another runtime.
7. **Cost is visible, and steps can be skipped.** A skip is recorded in the evidence.
8. **Light.** One command to install. No API keys, no background services, no Python. Anything heavy is optional and off by default.
9. **Always spec-driven, test-first, SOLID and KISS.** Scaled to the task, never ceremonial.
10. **Nothing ships unmeasured.** Every skill, pack and gate has evals that compare against the agent without it.

## 4. Who it serves

One mechanism serves four kinds of user: a guidance mode that is set once and can change per request.

| Mode | For | Behaviour |
| :- | :- | :- |
| Partner | An experienced developer | Few questions, terse answers, decides only the trivial on the user's behalf |
| Guide | A developer outside their usual stack | Explains stack-specific decisions and points to the documentation |
| Pilot | A non-technical builder | Decides technical matters, asks only product questions, explains in plain language, runs every gate at full depth |

A **team policy** sits on top of any mode. It is a file committed to the repository that states which gates are required and which paths count as risky.

## 5. The method

### Phases

| # | Phase | What happens | Done by |
| :- | :- | :- | :- |
| 0 | Receive | Analyse and enrich the input, ask what is missing, classify it, route it | Skill plus typed decisions |
| 1 | Recognize | Read the project: stack, commands, conventions, work in progress. Read the session inbox. Look up the validated-solutions base | Engine |
| 2 | Understand | State the problem and the assumptions; the user confirms them | Skill |
| 3 | Specify | Write the spec. Always, at a size that fits the task | Skill, checked by the engine |
| 4 | Conclave | Find the gaps; debate when a decision has consequences; a judge rules | Agents, ledger kept by the engine |
| 5 | Plan | Tasks with a verifiable criterion, each tied to the spec | Skill |
| 6 | Build | Test-first, with the failing and passing runs recorded | Skill, recorded by the engine |
| 7 | Gate | Code quality, test quality, security, UI/UX, risk | Engine plus reviewer agents |
| 8 | Deliver | Summary, what was proven, what was not | Engine |
| 9 | Learn | The validated solution enters the base; other sessions are told | Engine |

### Routes

The engine picks a route from the classification of the request and from the files the change touches.

| Route | When | What it adds |
| :- | :- | :- |
| Fast | Low risk, clear request | Nothing: a criterion, a failing test, the change, the gates, the report |
| Standard | Medium risk | A short spec, a short plan, the full deterministic gates |
| Full | High risk, or a new product | An approved design, a written plan, independent review, deeper security |

Risk means touching authentication, payments, personal data, migrations, infrastructure or a public API. The engine can raise a route when the actual diff touches a risky path. It never lowers one.

### Spec, tests and design rules

- **Every change has a spec.** On the fast route the spec is one acceptance criterion plus the failing test that expresses it. On the full route it is a document.
- **Test-first is proven.** The engine records the test failing before the code exists and passing afterwards. A green run with no earlier red run is rejected.
- **SOLID and KISS** are rules the build skills follow and the code-quality gate checks.

### Control

The user can skip a step. The skip needs the user's explicit approval, and it appears in the evidence report as a step that was not proven.

## 6. The conclave

The conclave exists to stop two failures: building what was asked when what was asked is incomplete or wrong, and approving a solution because the user seems to want it.

### Gap round: always

Every request gets a gap round. It is a single cheap pass, guided by a checklist for the kind of feature (an endpoint, a login, a checkout, an upload). It returns four lists on one screen:

- **Assumed by good practice.** "This endpoint will be authenticated, token-based and paginated." Stated, not asked. The user can refuse.
- **Decisions only the user can make.** "Which payment methods?"
- **Proposals.** "Return relationship X as well." "This checkout converts better with Y." Optional, each with its reason.
- **Warnings.** What the request asks for that goes against good practice, and why.

A request for "an endpoint that lists users" is small, and it is exactly the kind of request where authentication gets forgotten. That is why the gap round does not depend on the size of the request.

### Full debate: when a decision has consequences

When the gap round finds real decisions or real risk, the full conclave opens.

| Role | Job |
| :- | :- |
| Researcher | Deep research before anyone answers: current documentation, prior validated solutions |
| Experts | Propose solutions |
| Devil's advocate | Argues the opposite position |
| Fault-finder | Only looks for defects in the proposal |
| Judge | Rules on the evidence |

The debate includes the user: the panel presents, the user answers, the panel revises, the judge closes the spec.

### Rules that keep it honest

- Each role runs in its own context. One model playing six roles in one conversation agrees with itself.
- The critic receives the proposal only, not the reasoning that produced it.
- The judge never sees the user's enthusiasm. It sees the proposal, the objections and the evidence.
- The engine keeps an objection ledger. Work cannot advance while a blocking objection is open.
- The user can decide against the conclave. The record then says "decided by the user", never "approved".

## 7. Quality gates

Gates run before delivery. There are two kinds.

**Deterministic gates** cost no tokens: build, tests, lint, type checks, secret scanning, dependency audit. The engine discovers the commands from the project and runs the gates the route requires. Tests and secret scanning run on every route.

**Judgement gates** use reviewer agents with a rubric and a judge:

| Gate | How |
| :- | :- |
| Code quality | Review against SOLID and KISS, with complexity and duplication as inputs |
| Test quality | Mutation testing, so test quality is measured and not argued |
| Security | Review scaled to the risk the change touches, plus static analysis where a tool exists |
| UI/UX | Review in a browser, only when the change touches the interface |
| Risk | What can go wrong in production, and what would undo it |

A gate that cannot run (a tool is missing) is reported as not proven. It is never reported as passed.

## 8. Typed decisions

Small decisions drive the routing: what kind of work is this, does it touch authentication, is the request vague. They are asked as typed questions with a fixed shape:

- `choice`: one of a defined set.
- `noul`: the probability that a condition holds.
- `score`: a level on an ordered scale.

One definition of the questions feeds four interchangeable backends:

| Backend | Runs | Default |
| :- | :- | :- |
| Rules in code | Always. They set the floor | On |
| The session's own model | In the conversation, with nothing to install | On |
| Laya | Locally, open weights | Off |
| Jev | Through an API | Off |

Two rules apply to every backend:

- **Escalate only.** A backend can tighten a risk decision. It can never loosen one that the rules made.
- **Measured by replay.** All backends answer the same recorded cases, and a backend is trusted for a decision only after it beats the rules on those cases.

## 9. Validated-solutions base

When a login system is built, proven and delivered in one project, the next project should start from it.

- **The entry ticket is evidence.** Only work that passed the gates enters the base.
- **Reading is mandatory.** The engine looks up the base in the Recognize phase. It is not left to the model to remember.
- **Client confidentiality is marked.** A solution built for one client does not flow to another without a rule that allows it.
- **Solutions are re-proven on reuse.** The gates run again in the new project.

## 10. Session mail (0.5.0: inside a workspace, SP2c)

A developer often runs several sessions on related projects. When the session on the storefront finds that an endpoint in the CRM is missing a field, it should be able to tell the CRM session.

The engine is the local mailbox. Sessions send and receive through it, and delivery happens at turn boundaries.

| Message | Destination has a session | Destination has none |
| :- | :- | :- |
| Question | Answered at the next pause | A read-only session opens, answers and closes |
| Change request | Queued for the session | A session opens on a separate branch and follows the full method |
| Notice | Shown at start or at the next pause | Waits in the inbox |
| Blocker | Interrupts at the end of the turn | A session opens and the user is notified |

Three rules are fixed:

- **High risk always waits for a person.**
- **A session opened by the system never merges or deploys.** It ends with a branch, the evidence and a reply.
- **There are limits** on concurrent sessions, on budget per message and on hops, so two sessions cannot answer each other forever.

A message from another session is a request, not an order.

## 11. Packs

The core is small. Knowledge is installed separately, in packs that depend on the core.

- **Stack packs** carry what a model gets wrong about a technology, how to verify work in it, and where the current documentation is. They do not carry tutorials the model already knows.
- **Domain packs** carry the checklists the gap round uses: what gets forgotten in an endpoint, a login, a checkout.

A pack is published only with evals that show a difference against the agent without it. Content states the version it was verified against.

The system works on a stack that has no pack. The engine discovers how to build, test and check the project, and the agent fetches current documentation.

Status. The engine serves packs since 0.11.0 (`crew pack add|remove|list|show|files|sync`, the discovery of marketplace-installed packs at session start under Claude Code, `references/packs.md`; ADR 0010): a pack is data, registered per machine, its detector rule refining a core target's gates as proposed commands a person confirms, its template adding path globs to a team and nothing else. The first two packs are in this repository under `packs/`: `wizardingcode-pack-laravel` (a stack pack) and `wizardingcode-pack-agentic-os` (a team pack); each ships with 0.11.0 once its with-and-without cases show the difference.

## 12. Architecture

**A deterministic engine plus skills.** The skills teach the agent how to do each phase. The engine, written in TypeScript, does what must not depend on a model:

- detects the stack and the project's commands;
- keeps the state of the work;
- runs the gates;
- writes the evidence;
- keeps the objection ledger, the mailbox and the solutions base.

**It is a plugin, and the mod is one of its parts.**

| Part | In Claude Code | In other runtimes |
| :- | :- | :- |
| Method, conclave roles, packs | Skills, plus agents for the roles | The same skills |
| Engine | A program inside the plugin, exposed as a command | The same program |
| Enforcement | Settings hooks | Each runtime's hooks, where they exist |
| Live experience: a panel with phase, gates, inbox and verdict | Mod | Not available; the conversation shows the text |

The engine is a library with thin faces: a command first, and an MCP server when session mail needs one.

**The guarantee never depends on the mod.** The mod is the experience. Hooks plus the engine are the guarantee. Mods exist only in Claude Code, an organization can block them, and they do not load in an untrusted folder. In all three cases the gates still block.

## 13. Runtimes

| Tier | Runtimes | What the user gets |
| :- | :- | :- |
| Enforced | Claude Code, Codex, Cursor, Copilot, Gemini CLI, OpenCode | The gates block through hooks |
| Requested | Runtimes with skills but no hooks | The same method. The system states that verification is requested, not enforced |

Skills are written once and used unchanged everywhere. They name actions, not tools, and each runtime gets a small mapping file.

## 14. Packaging

- A small core plugin, plus packs that install separately.
- Published through the `wizardingcode-plugins` marketplace, from a subfolder, already bundled. The installed plugin contains no `node_modules`.
- When `wizardingcode-mem` is installed, the system uses it. It is not a dependency.

## 15. Proof

- **Evals per part.** Each skill, pack and gate has cases that run with and without it.
- **A corpus of vague requests.** Each case lists the gaps a good engineer would raise. It measures the gap round.
- **A public benchmark.** The same tasks run with the system and with a plain agent, reporting functional pass rate, security pass rate, cost and time. The benchmark is reproducible by anyone.

## 16. Roadmap

Six subprojects, built in dependency order. Each has its own spec, plan and release. Each is used on real projects before the next begins. The first public release, 1.0, includes subprojects 1 and 2; 3 to 6 follow as 1.x releases ([ADR 0004](adr/0004-production-release-scope.md), 2026-10-14).

| # | Subproject | Depends on |
| :- | :- | :- |
| 1 | Engine and base method: phases, routes, spec, proven test-first, deterministic gates, evidence | None |
| 2 | Conclave and judgement gates | 1 |
| 3 | Reception and routing with typed decisions | 1 |
| 4 | Validated-solutions base | 1 |
| 5 | Session mail | 1 |
| 6 | Packs, runtime adapters, public benchmark | 1 to 5 |
| 7 | Teams: the organization (tech leads, CTO, judges, nine teams, personalities), the workflows per kind of work, the rules, the environment, visibility | 1, 2, 5 |
| 8 | New projects: the strategy stage and the audit with a branded report | 2, 7 |

Subproject 5 can run in parallel with 2 to 4. After 2 the order is 7, 3, 8, 4, 6 ([ADR 0007](adr/0007-teams-first-roadmap-re-cut.md)): the team model is what reception, the knowledge base and the packs are expressed through, so it comes first, in two releases (0.6.0, 0.7.0), and 1.0 is cut after its first real use.

## 17. Out of scope for now

- A hosted service. It is planned for a later phase.
- An orchestrator that drives agents with no person present. Session mail opens sessions under strict rules; a general autonomous mode can be built later on the same engine.
- Anything copied from earlier systems. This is a clean base. Earlier work contributes lessons and patterns only.

## 18. Glossary

| Term | Meaning |
| :- | :- |
| Engine | The deterministic program that detects, records, runs gates and writes evidence |
| Evidence | The record of what ran, with what result, against which state of the code |
| Gate | A check that must pass, or be skipped by the user, before delivery |
| Route | Fast, standard or full: how much process a piece of work gets |
| Work item | One request, from input to delivery, with its state in the repository |
| Conclave | The gap round and, when needed, the debate with a judge |
| Objection ledger | The engine's list of objections and their status |
| Pack | Separately installed knowledge for a stack or a domain |
| Mode | Partner, Guide or Pilot: how the system talks and how much it decides |
| Typed decision | A `choice`, `noul` or `score` question that code consumes directly |
| Team | One of the nine areas of the organization (architects, researchers, ETL, security, DevOps, QA, backend, frontend, agentic OS), with its lead role, its member roles and the rule that makes it mandatory |
| Seat | One role the engine plans for an item, with the reason it runs (the route, a risk area, the paths, the policy) |
| Tech lead | The lead of a team: the session that holds an item for its primary team; a read-only subagent for the other teams, who validates the spec and the brief |
| Personality | One of five lenses a debate seat is given (adventurous, creative, conservative, sceptical, professional) |
| Thread | The messages about one feature, from a root message, between projects and tasks of a workspace |
| Environment | The project's local services as the profile describes them (start, health, stop), brought up by the engine for an end-to-end proof |
