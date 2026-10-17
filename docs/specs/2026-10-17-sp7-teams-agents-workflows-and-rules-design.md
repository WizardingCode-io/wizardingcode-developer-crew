# SP7: teams, agents, workflows and rules

> **Status:** design, for the user's review on 2026-10-17; the roadmap re-cut that puts it before SP3 and SP4 is [ADR 0007](../adr/0007-teams-first-roadmap-re-cut.md). The design covers the whole picture the user gave on 2026-10-17 (six blocks: the client flow, the flow across projects, a new project or feature, operation and maintenance, the organization, the rules) and splits its delivery into subprojects (§16): SP7a (0.6.0) and SP7b (0.7.0) build the team; SP3, SP8, SP4 and SP6 follow as 1.x. Nothing from the user's earlier systems enters this design; it is built from the vision and the crew's engine (SP1 to SP2c).

## 1. Summary

The crew becomes a development team. Nine teams (architects, researchers, ETL, security, DevOps, QA, backend, frontend, agentic OS) with their tech leads, a CTO and the judges work an item the way a well-run human team does: the route decides who sits at the table, the researchers always research, the spec is validated by the leads with proof, the plan becomes a todo the user watches, each todo ends with a brief and a gate dedicated to the change, and nothing is called done without evidence. Every agent carries one of five personalities so the debate has lenses, not echoes. Everything the team does is recorded by the engine and visible in the mod: who works, what was said, what was decided and why.

The engine keeps the guarantee it has had since SP1: it says when work is done, the roles stay read-only in clean contexts, a decision is the user's in words, high risk waits for a person, mail never leaves the workspace. What this design adds is who does the work and how the method becomes a team's workflow for four kinds of work, with the rules the user set written down and enforced where they can be.

## 2. Goals and non-goals

Goals:

- An item is worked by a team the route sizes, under a tech lead, with every seat planned before it runs and recorded after.
- Four kinds of work have their workflow as data: a client request, a request across projects of a workspace, a new project or feature (with its strategy), an issue (with its analysis); and, for a project with code, an audit.
- A gate dedicated to the change runs at the end of each todo, with a brief; the full gate run proves the merged tree once.
- Messages between projects and tasks carry priority and status, can hold more than two parties, and a reply carries the new contracts and the evidence.
- QA proves on a local environment the engine brings up and takes down; the console is clean by measurement, not by opinion.
- Twenty rules, each with its enforcement point.
- Jev (TypeSafe) tightens decisions when its key works; the knowledge base makes what one project learned available to the next under a confidentiality mark; the CTO's report says who errs and what costs.
- The user sees all of it, in the CLI and in the mod.

Non-goals (vision §17 and SP2c §2 stand):

- An orchestrator that drives agents with no person present. The team runs unattended within the policy's validator; high risk waits for a person; every wait is visible and reachable.
- Mail across workspaces. Refused, not configurable.
- Agents per specialist or per personality as separate files. One parameterised expert and five personality files; every agent description costs every session (finding #33).
- Copying any earlier system of the user's. Where an idea recurs (a judge, a router, a lifecycle), the crew's own mechanism carries it.
- A hosted service, a networked mailbox, cross-machine mail (SP6 and later).

## 3. Terms

| Term | Meaning |
| :- | :- |
| Team | One of nine areas of the organization, with a lead role, member roles, a mandatory rule and a presence per route. |
| Seat | One role the engine plans for an item, with the reason it runs: the route, a risk area, the paths changed, the policy. |
| Tech lead | The lead of a team. For the item's primary team it is the session that holds the item; for the other teams a read-only subagent that validates the spec and the brief. |
| CTO | A read-only role: the strategy reviewer on full items; the author of the workspace's auto-improvement plan from the engine's metrics. |
| Personality | One of five lenses a debate seat is given: adventurous, creative, conservative, sceptical, professional. |
| Kind | What the work is: client-request, cross-project, new-project, feature, issue, audit. It picks the phases with the route. |
| Todo | A task of the plan (`T-n`) with its state: open, handed, merged, gated, briefed. |
| Brief | The short account the team gives of a todo when its gate passed: what changed, what was proven, what is left. |
| Thread | The messages about one feature from a root message, between projects and tasks of a workspace. |
| Contract | What a reply to a change request binds the sender to: an OpenAPI file, types, a schema, or a written clause. |
| Environment | The project's local services as the profile describes them (start, health, stop, logs), brought up by the engine for an end-to-end proof. |
| Jev | TypeSafe's System One model: typed questions over a state, answered with probabilities. The crew's verification backend (vision §8). |
| Knowledge base | One shared store of what the teams learned and catalogued, each entry with a confidentiality mark and the workspace it came from. |

## 4. What the user said

The user gave the context in six blocks on 2026-10-17; the design follows them. Client names are left out here (fixtures and documents in this repository never carry them).

**The client flow.** Requests enter in three ways, defined per workspace: a task manager through MCP or an API (ClickUp first; Jira and Notion later), a document with everything to do, or the CLI. Every request follows mandatory steps: analyse it and, in any doubt, stop and ask; research what is asked and debate the best strategy among the team's agents, following the project's base; write a spec and send it to the tech leads and the specialists to criticise and validate with real proof, never as yes-men; after the spec is validated, a todo of the work, shown in the mod (CLI and desktop) with each step checked, the agents working, the messages between agents read and unread, the branch, and the workspace's sessions working at the same time; at the end of each todo a brief among the agents shown to the user, and a quality gate dedicated to that context (a backend function changed runs the gate with those tests, not every gate, never endless rounds; passed is validated, failed goes back to the team with what is outside the standard). The team must work mostly 24 hours a day without a person, so specs and workflows are defined to the end.

**Across projects.** A complete development team per project, with tech leads who are developers, a messaging system with priorities and statuses, and active conversations between every agent that takes part in a feature. The store's frontend finds the product endpoints slow; the tests prove the cause is the CRM's; it writes the spec and contacts the CRM team; the CRM's tech lead analyses, debates with the team, validates the spec, builds; when all is tested and validated within the quality, security and project standards, the reply says it is complete, which contracts are new and the evidence. Testing means bringing up on localhost the services needed to prove conformity. Everything visible to the users; everything validated with evidence.

**A new project or feature.** Always a complete, dynamic brainstorm: planners, architects, researchers and judges do not accept a request because the user asks; they separate what is real from what is wrong and define the strategy: viability, cost, time, the stack to advise. The stack comes from the knowledge base with learning cycles (a Laravel shop tends to Laravel; a landing page with Stripe may need Vue or React, not Laravel or Nest); measured, never one size for all; the why proven point by point, and when the user asks for something worse the agents convince them with proof. Discernment in both directions: a personal finance app asking for an onion architecture, microservices and external authentication is over-engineering, and the team says so; a social network with payments and real time deserves fuller options with a strategy, a monolith with an event-driven design first and the scaling phases declared ("at X users this domain becomes a service"). Consistency: never again "you are right, I did not weigh it, I did not research it, I ignored it"; the user must be able to trust the agents and the ecosystem. A new project that already has code gets an end-to-end audit and a complete report under the brand (HTML, MD, PDF): business issues, security issues, dependencies to update with pros and cons, everything with proof.

**Operation and maintenance.** A deep analysis of each issue: where it comes from, which agent wrote the code and in what context; proof that the plan and the todos of the fix will work; judges, validators and tech leads meticulous so there are no recurrences and a fix never creates two or three issues. Entry from the user, a task manager or a document; the urgency validated against the business (everything is critical in Jira; it may not be for the business, and other tasks may ship first). Everything follows the core.

**The organization.** A team at the level of a top startup in personalities and rigour. Judges validate that everything is met, always, at every point, with Jev when the key is set and working. A CTO able to manage a huge team, understand the needs and the business rules of each project and company, see who the productive agents are and where we err, and define an auto-improvement plan. Tech leads, one or more per team, with their teams of specialists; they analyse, manage, validate and intervene when something is out of standard, organise what is implemented and bridge the agents and the CTO. Nine teams: architects (every task planned by the project's architecture, data model, contracts, integrations); researchers (mandatory: documentation, best practices, contracts, limits, pros and cons, CVEs, maintenance, alternatives, catalogued; whether a validated solution exists in another project to reuse); ETL (mandatory with databases: every database and ORM, security, resources, availability); security (analyse, test, try to break in; always present; high standards with discernment, never blocking forever); DevOps (git, pipelines, any host, test pipelines per stack; browser access when a console has no CLI or MCP); QA (always; per area; end to end; the browser for the frontend: pixel perfect, responsiveness, motion, flows; nothing passes without the proof of why); backend (specialists in ORMs, event buses, CRUD, websockets, SOLID, KISS, APIs, MCP servers, optimisation, security, integrations, plus stack specialists); frontend (UI/UX, componentisation, responsiveness, pixel perfect, business flows, creatives, motion, web optimisation, SEO and GEO, colours, design, brand validators, API integration, usability features); agentic OS (agents, tools, knowledge bases, learning and validation, visibility, mass agent flows, prompts, skills, MCPs, monitoring-driven improvement, temporary agents at scale). Five personalities in every team, which coexist and reach a near-perfect result. Later, skills from other repositories brought in to improve our agents with proof.

**The rules.** The five base rules and the fifteen the user confirmed are §5.

The user then decided the open points: the route decides the team; Jev is TypeSafe; Claude in Chrome for consoles and Playwright for frontend tests; production read-only, authorised per workspace, usable in autopilot within the rules; one shared knowledge base with a confidentiality mark per entry; four priorities confirmed by the receiver's tech lead against business priorities the user signs once; seven statuses; the environment described in the profile and run by the engine; the users: the user now, the clients' developers including juniors, non-technical managers, a product later; 1.0 after the team's first real use in three workspaces (two clients and the brand's own).

## 5. The rules

Each rule names where it is enforced: the engine (a refusal or a record), a hook (a denial), the skill (an instruction the evals measure), or a person (a decision recorded as theirs). "SP" names the subproject that makes the enforcement real where it is not yet.

| # | Rule | Enforcement |
| :- | :- | :- |
| 1 | The workflows and the hierarchy are always followed; nothing leaves what the ecosystem established or what the user asked | Engine: phases as data with guards (§7); seats planned and recorded (§6); the validation records (§6.6). SP7a |
| 2 | Nothing goes to production without tests validated and concrete proof on localhost | Engine: the e2e gate over the environment (§8.2); the deploy denial in opened sessions (SP2c); rule 20. SP7b |
| 3 | A remote test environment like production is always recommended | Skill: the strategy and the deliver references say it; the report names it when absent. SP8 |
| 4 | Never a workaround or a known security issue; never dirty, abandoned or hardcoded code | Engine: the deps gate fails on a new advisory (ADR 0006); the security seat always planned (§6.2); the code-quality rubric names dead code and magic values as defects; secrets as a gate. SP7a |
| 5 | UI/UX validated to the extreme; the console clean of errors and warnings; the backend's logs too | Engine: `console.json` and `environment.logs` read by the e2e gate (§8.3); the UI/UX rubric. SP7b |
| 6 | No verdict without evidence; never a yes-man | Engine: a ruling's finding needs a file and a line (SP2); a validation needs a file; Jev's dispute marks (§11). Skill: the rubrics and the personalities. SP7a |
| 7 | A doubt stops the work and asks; with nobody present the question goes to the channel and the work waits | Engine: `questions[]` and the `blocked` status (§7.2, §10); the Stop hook's wait (SP2c). SP7a, SP3 |
| 8 | Every decision is recorded (who, why, proof) and re-read; changing one is a new decision | Engine: the item's decisions (SP2a) and the project's decision register read in Recognize (§6.6). SP7a |
| 9 | The project's base rules: architecture, data model, contracts, conventions; drift is a defect | Engine: the architecture reviewer and rubric (§6.3). SP7a |
| 10 | Process follows risk; gates dedicated to the change; bounded rounds; advisories to recorded debt | Engine: the route and the seats (§6.2); the gate per todo (§8.1); `maxJudgementRounds`, `maxValidationRounds`, `maxGateRounds` as refusals (§6.1). SP7a |
| 11 | A fix never creates: a regression test, preserve criteria, a full gate run on the merged tree | Engine: the issue kind's guards (§7.4); the parent's gate run after a merge (SP2c). SP3 |
| 12 | Security is always in the flow; a known CVE or an unmaintained dependency blocks until a person decides | Engine: the security seat on every route (deterministic on fast); the deps gate; the researcher's catalogue flags. SP7a |
| 13 | Boundaries: mail never leaves the workspace; a client's code and data never cross workspaces; only unmarked solutions are reused | Engine: the workspace refusal (SP2c); the knowledge base's mark and refusal (§12). SP4 |
| 14 | Validation hierarchy: tech leads validate, the CTO reviews, the judges rule; a reviewer is never re-launched for another answer; a ruling is never edited | Engine: the records' order (§6.6), `contradiction()` on rulings and validations; the hook denies edits of findings and rulings (SP2b). SP7a |
| 15 | High risk waits for a person, even in 24h mode | Engine: the full route's approval is a person's (SP2c §7); a disputed validator verdict waits (§11). Stands |
| 16 | Total visibility: agents, messages, statuses, branch, sessions | Engine: `status --json` and `workspace status` (§14); the mod. SP7a, SP7b |
| 17 | Learn once: the root cause of each issue goes to the knowledge base; the same mistake twice is the system's failure | Engine: the Learn phase writes the entry; the gap round refuses a known root cause (§12). SP4 |
| 18 | Measure everything: tokens, time, rounds per item and per role | Engine: `RoleRecord`, rounds kept, `crew metrics` (§6.5). SP7a records, SP4 reports |
| 19 | Deliverables under our brand, never the provider's artifacts | Engine: the report renderer from `docs/brand/` (§13.2). SP8 |
| 20 | Deploy is a person's decision unless the policy says otherwise, and only with a green pipeline | Hook: the deploy denial in opened sessions (SP2c); the policy key that may allow it names the pipeline it requires. SP7b |

## 6. The organization

### 6.1 The registry and the policy

The engine holds the organization as a **registry**, a constant in `packages/engine/src/team.ts`: nine teams, each with a lead role (`lead-<team>`), its member roles, its mandatory rule and its presence per route. Today's roles are the members: the researcher is the researchers' team; QA is `review-test-quality`, `review-ui-ux` and the test gate; security is `review-security` with the secrets and deps gates; architects, ETL and DevOps get a reviewer each (§6.3); backend and frontend are the implementers (the lead session and the task children) with their specialists through the expert; agentic OS is a pack team (§6.3). The judges are transversal, not a team.

Every place that today knows the roles by name derives from the registry, so there is one source: `ROLE_AGENT` and `CRITICS` in `mail.ts`, `BARE_ROLE` and the answer files in `hooks/subagent-stop.ts`, the SubagentStop matcher in `hooks.json` (generated from the registry at build time and checked by a test), the gate names in `types.ts`.

`plannedSeats(route, riskAreas, changed, policy)` replaces `plannedJudgementGates` in `judgement.ts`. It returns every seat of the item, debate and gates alike, each with its reason (`standard route`, `risk area infra`, `interface files`, `policy team.always`), and `crew gate run` and `crew team <id>` print them before anything runs. The reason strings stay the report's.

The policy's `team` block tightens only, like every key in `policy.ts`:

| Key | Default | Meaning |
| :- | :- | :- |
| `team.template` | `core` | The registry a workspace's projects point at: `core` or a pack's name. How a team is "per workspace": every project of the workspace sets the same template. |
| `team.always` | `[]` | Teams added beyond the route's table (an ETL team on every item of a data product). |
| `team.specialists` | `[]` | Pack knowledge files the expert is parameterised with, by stack. |
| `team.maxExperts` | 3 | The debate's cap (SP2). |
| `team.maxValidationRounds` | 2 | The leads' validation rounds before a person decides. |
| `team.maxJudgementRounds` | 2 | The judgement rounds before a person decides. |
| `team.maxGateRounds` | 2 | A todo's gate rounds before a person decides. |

A third round is a refusal by the engine, not a habit: `crew judgement record`, `crew validation record` and `crew task gate` refuse past the cap and name the person's commands (`crew approve`, `crew skip`, `crew continue <id> <what>`); advisories go to `docs/real-use/findings.md` as the deliver reference already says.

### 6.2 The route decides the team

| Route | Seats | What runs |
| :- | :- | :- |
| Fast | none | The session is the developer; QA and security are the deterministic test and secrets gates (and deps when a manifest changed). No role, no research, no validation: the fast route stays three calls and the overhead case keeps its target. |
| Standard | tech lead(s), researcher, QA, security, judge | The item's primary team's lead is the session; the other mandatory teams' leads validate the spec and the brief; one research pass before the spec; QA (test-quality and the test gate; ui-ux when interface files changed) and security (review-security on a risk area, the secrets and deps gates always); the judge rules the gates. |
| Full | everything the rules name, the CTO included | Standard plus architects (review-architecture), ETL (review-data on data-migration or schema and ORM paths), DevOps (review-infra on infra), risk, the debate with its five lenses, the CTO as the strategy's reviewer, and a person at the spec. |

Mandatory presence is a rule per team in the registry: `always` (researchers, QA, security, from standard up), `when-risk-area:data-migration` (ETL), `when-risk-area:infra` (DevOps), `when-paths:interface` (frontend's QA half), `when-paths:agentic` (agentic OS, a pack rule), `route:full` (architects, the CTO). `team.always` adds; nothing removes.

### 6.3 Agents

- **Three new core reviewers**, each with a rubric in `skills/crew/rubrics/`: `review-architecture` (does the change follow the project's architecture, data model, contracts and integrations; drift is a defect; rule 9), `review-data` (ETL and ORM: queries, migrations, indexes, transactions, availability; planned on data-migration or on schema and ORM paths), `review-infra` (pipelines, hosts, secrets handling, rollbacks; planned on infra). They are read-only, on sonnet, opus on the full route like the others (SP2b).
- **Stack specialists** are the one `expert` agent parameterised by the stack and a pack knowledge file (`knowledge/<stack>.md`: what the model gets wrong, how to verify, where the documentation is; vision §11); the lead passes the file's path. No agent per stack.
- **Agentic OS** is a pack team: a knowledge file, a path rule (`when-paths:agentic`, the policy names the paths), and the expert; it becomes core when the real-use phase shows a project needs it on every item.
- **Personalities** are five short files `skills/crew/personalities/<name>.md` (adventurous, creative, conservative, sceptical, professional), each one paragraph: what the lens looks for, what it refuses to accept, what proof it demands. The lead assigns one per debate seat; the expert's seats rotate conservative, creative, adventurous so three proposals are never the same lens; the fault-finder is sceptical and the judge professional by construction (their files already say so). Reviewers answer rubrics and get no lens: a rubric is the opposite of a lens. The answer's header carries `personality: <name>`; the hook records it in `RoleRecord.personality`; an eval checks the proposals differ.
- **The tech lead**: one file `agents/tech-lead.md`, read-only, parameterised by its team. The item's primary team's lead is the session itself (one writer per checkout is the proof model's base; SP2c's lead). The other mandatory teams' leads are launched at two points: the spec's validation (§7.1 step 4) and the brief before delivery (step 8). Each receives the spec, the conclave file, the plan, its team's findings and the project's decision register; it returns `validated` or `returned` with numbered returns, each with a file and a line or a run; the hook saves it as `conclave/lead-<team>.md`. A receiving project's branch session (a change request) is that team's lead and writes, as SP2c allows.
- **The CTO**: one file `agents/cto.md`, read-only. On full items a seat "as reviewer of the strategy" over `strategy.md` (viability, cost, time, stack, scaling phases) returning upheld, lowered or dropped findings like a reviewer. Across a workspace, `crew cto review --workspace <ws>` (§6.5) runs it over the metrics, in the session that runs the command; it reads numbers and records, never transcripts.
- **The judges** stay the one `judge` agent: the gates, the debate, the validator rules; with Jev's verdicts beside its own when the key works (§11).

### 6.4 The tech lead's validation

On standard and full the spec is validated before the plan: the lead session writes `spec.md`; the mandatory teams' leads (and the specialists the research named) are launched in parallel, read-only; each returns `validated` or `returned`; the session records each with `crew validation <id> record --what spec --by lead-<team> --file conclave/lead-<team>.md`. The engine parses the verdict and the numbered returns and refuses a contradiction (a `validated` with open returns), as `contradiction()` does for rulings. The Plan guard requires every mandatory lead's `validated` at the current spec fingerprint; a `returned` reopens Specify. The same records close the item: the brief's validation (`--what delivery`) is the last record before Deliver. Rounds are bounded by `team.maxValidationRounds`.

### 6.5 Metrics and the CTO's plan

`crew metrics [--workspace <ws>] --json` is deterministic, over the registered projects' `.crew/work/*/`: items per route and kind; rounds per item (validation, judgement, gate); tokens per role and personality (`RoleRecord`); defects upheld per reviewer and per implementer (a task's child names who wrote the code); objections by raiser and outcome; decisions overruled by the user; gates not run or skipped; time per phase from the records' timestamps. `crew cto review --workspace <ws>` launches the CTO over that output and the last plan, and writes `~/.wizardingcode/crew/cto/<workspace>/<date>-plan.md`: what to keep, what to change (a rubric, a checklist, a knowledge entry, a cap), and the measure that will show it. The plan is linked from each project's report and becomes a knowledge entry under the workspace's mark when SP4 lands.

### 6.6 Records

- `work.json` gains `validations[]`: `{ what: spec | plan | delivery, by, verdict, round, file, fingerprint, at }`.
- `Evidence.judgement` keeps every ruling with a `round` number (finding #29 lost the history); the report's table shows the last and the count.
- `RoleRecord` gains `personality` and `team`.
- `work.json` gains `seats[]`: the planned seats with their reasons, written by the first gate run and by `crew team <id>`.
- The **project decision register**: `.crew/decisions.json`, engine-owned, appended when an item's decision is answered (`crew decide`), an objection resolved or waived, a spec approved, a ruling recorded with a defect, a validation returned; each entry names the item, the decision, the answer, who, the proof file. `crew recognize` prints the entries that touch the paths or the kind of the new item, and the Understand reference says: quote them before assuming. Rule 8's record.

## 7. The workflows

### 7.1 Phases as data

`PHASES_BY_ROUTE` becomes `phasesFor(work)`: the route's list with the kind's phases inserted. `Phase` gains `analyse`, `strategy` and `audit`; `WorkType` gains `audit`; the typed questions gain `kind` (choice: client-request, cross-project, new-project, feature, issue, audit) and `priority` (score: blocker, high, normal, low), logged for replay like the nine (vision SP3).

| Kind | Fast | Standard | Full |
| :- | :- | :- | :- |
| client-request, feature (small) | receive, recognize, build, gate, deliver | receive, recognize, understand, specify, conclave, plan, build, gate, deliver | the same |
| cross-project (the receiving side) | the same, started with `--origin` | the same | the same |
| new-project, feature (raised) | never fast | receive, recognize, understand, **strategy**, specify, conclave, plan, build, gate, deliver | the same, a person at the spec |
| issue | receive, recognize, **analyse**, build, gate, deliver | receive, recognize, **analyse**, understand, specify, conclave, plan, build, gate, deliver | the same |
| audit | never fast | never standard | receive, recognize, **audit**, deliver |

The client flow's mandatory steps map onto them: step 1 (analyse, ask) is Receive and Understand with the `questions[]` record; step 2 (research, debate) is Conclave with the researcher mandatory from standard up and the debate opening on consequences as SP2 says; step 4 (the spec validated by leads and specialists with proof) is §6.4, a guard into Plan; step 5 (the todo) is the plan's tasks with their state; step 8 (a brief and a gate per todo) is §8.1; the final gate run on the merged tree exists since SP2c.

### 7.2 Doubt stops

`questions[]` on the item: `{ id, text, askedAt, channels: [{kind: cli | mail | ticket | document, posted: boolean, ref}], answer, by, answeredAt }`. With a person present the wait is `crew await <id> user` as today. With nobody present the engine records the question and tells the skill where to echo it: a ticket comment when the source is a task manager, a `<document>.questions.md` beside a document, a notice to the workspace's mailbox always; the skill records `posted` or `not posted`; the item's status is `blocked` and the queue serves the next item. The mod shows open questions first.

### 7.3 Strategy

On `new-project` and on a feature the conclave raises, `strategy.md` comes between Understand and Specify, written by the lead from the researchers' file with the experts' proposals: sections **Viability**, **Cost**, **Time**, **Stack** and **Scaling phases** (a table: trigger, change, cost), every claim pointing at a line of `conclave/researcher.md` or a knowledge entry. The engine checks the structure as it does for `conclave.md`; an empty scaling table is refused on new-project; the judge rules the substance and the CTO reviews it on full. The skill's strategy reference carries the two rules of discernment: proportion to the real need (over-engineering is named and refused with proof), and the persuasion rule (when the user asks for something worse, the proof point by point goes before the yes; the user's final word is recorded as theirs).

### 7.4 Issue

`analyse` after Recognize on every route (one screen on fast). `crew analyse <id> --paths <files>` does the mechanical half: `git blame` on the touched lines, the commits, the items whose records those commits carry (artifacts are committed by default), their roles, tasks, decisions and mail; written to `analysis/origin.json`. The skill writes `analysis.md`: Origin (which item, which agent or task, under which decisions), Cause, Blast radius. Guards: an issue has at least one `preserve` criterion and one `behavior` criterion (the regression test); Deliver needs the full gate run current on the merged tree (rule 11). The root cause becomes a knowledge entry at Learn (SP4), and the gap round refuses a cause already known without naming it.

### 7.5 Audit

`WorkType: audit`, always full. `crew audit <id> run` runs the project's own tools read-only through the gate runners with no base commit: build, test, lint, typecheck, deps over the whole tree, secrets; beside them the researcher (dependencies: maintenance, CVEs, alternatives) and the security, architecture and data reviewers read the code. Findings go under `audit/<section>.findings.md`, each with severity, file and line or a log path. The report (§13.2) is the deliverable; a person signs it (`crew approve <id> audit`) before it leaves.

## 8. The gate dedicated to the change

### 8.1 A gate per todo

`crew task <id> gate T-n` runs when a todo's work is in (an implementer's merge, or the lead's own commit for an inline todo): the deterministic gates on the targets the todo's diff touches (the worktree makes a handed-out todo's diff exact; an inline todo declares `--scope <globs>`), the test gate narrowed where the profile declares `Target.testScoped` (a template with `{files}`: `vitest related {files}`, `phpunit --filter`, `pytest {files}`), the full suite of that target otherwise; the judgement seats per todo are only ui-ux and security when the diff asks; code quality and test quality run once, at the final gate run on the merged tree. `TaskRecord` gains `state` (open, handed, merged, gated, briefed), `gate` (the run's outcome and round) and `brief` (the file). A todo that fails `team.maxGateRounds` times waits for a person with the failing list.

The **brief** is written by the lead after a todo's gate passed, from the records: what changed (files), what was proven (the gate's lines), what is left (open returns, debt); the mandatory leads validate it at delivery (§6.4). `crew task <id> brief T-n` prints it; the mod shows it.

### 8.2 The environment

`Profile.environment { start, health, stop, logs, url, timeoutMs }`, detected where a project declares it (`docker-compose.yml`, a Herd site, a `Makefile` target) and otherwise proposed like a test command (`crew profile set environment.start "<cmd>"`, a user's decision). A new gate `e2e` is planned when an environment exists and the change touches interface or public-api paths, or the policy requires it: start, poll `health` until `timeoutMs`, run the e2e command, stop, each with its own log; a `health` that already passes before `start` means the user's environment is running: the engine uses it and never stops it (`managed: false`). No environment described: `unavailable: no environment in the profile (crew profile set environment.start …)`, which keeps the item not proven until the user decides (it cannot prove).

### 8.3 Browser evidence and the clean console

Playwright runs are deterministic: exit code, log, and `GateRun.artifacts` naming the report folder and traces under `review/e2e/`. Claude in Chrome captures stay judgement inputs under `review/ui/`, each with a sibling `console-<page>-<state>.json` saved from the console tool. Rule 5 is a measurement: the e2e run writes `console.json` from the pages it visited; zero entries at error or warning passes, otherwise the gate fails naming the first; `environment.logs` is read during the run and graded the same way; a capture without a console file leaves the UI/UX gate not answerable, never passed.

## 9. Mail: priorities, statuses, threads, contracts

- **Priority** on `Message` (blocker, high, normal, low), orthogonal to the type; the inbox orders by priority then age; a blocker keeps its interrupt (SP2c). The receiver's tech lead confirms or lowers with `crew mail accept <id> --priority <p> --reason "<why>"`, against the workspace's business priorities (§10.2); a lowering is recorded `{ proposed, confirmed, by, reason, at }`.
- **Statuses**: sent, read, accepted, in-progress, blocked, done, refused, and `expired` (a timer's end is neither refusal nor completion). Transitions the engine enforces: read by `mail read`; accepted or refused by the receiving lead; in-progress when an item starts with `--origin`; blocked by a wait or a question; done only by a reply whose child verdict is proven; an unproven reply lands as blocked, naming the unproven reasons. Records written before SP7b are mapped on read (answered → done; waiting-for-person → blocked; stopped → refused), never rewritten.
- **Threads**: `thread` on `Message` (the root's id); `crew mail send --thread <root> --to <party>` adds a party; parties are projects or tasks (`T-n`), never roles (they stay relayed through the lead, SP2c §7); `mail.maxParties` 4 and the hop limits stand; `crew mail thread <id>` prints it; the mod shows threads with read and unread.
- **Contracts and evidence in a reply**: `contracts[]` of `{ kind: openapi | types | schema | clause, path, hash, summary }`; the engine checks each at the reply's branch tip (the path exists, the hash matches, an OpenAPI or schema file parses, a types file is in the child's diff, a clause is a `## Contracts` section of the body); the reply gains `evidence { report, fingerprint, gatesPassed }` from the child's `evidence.json`, read never typed. The requesting item records the contracts in its brief and may bind a criterion to each.

## 10. Reception (SP3)

### 10.1 Channels and the source

`WorkItem.source { channel: cli | document | task-manager, connector: clickup | jira | notion | other, externalId, url, documentPath, proposedPriority }` and a `## Source` section of the brief with the original text verbatim. The engine never calls a task manager: the skill reads the ticket or the document with the MCP tools the session holds, answers the typed questions and passes the normalised fields to `crew start --source …`. ClickUp first, through its MCP server; a document is one item by default, a split is a decision the lead proposes.

### 10.2 The urgency triage

The task manager's "critical" is a proposal. The workspace's business priorities live in `~/.wizardingcode/crew/workspaces/<ws>/priorities.md`, signed once with `crew workspace priorities accept` (a user's decision, relayed): what matters first for this business, in plain sentences, with the clients' deadlines the user chooses to write. At Receive the lead confirms or lowers the proposed priority with a reason (§9); without a signed file the priority stays "proposed, unconfirmed" and the report says so.

Jev helps the triage when configured, as one System One request over a state the engine builds: `{ request: { text, source, proposedPriority }, business: priorities.md, queue: [the open items' kinds and priorities] }`, with the questions asked together: `priority` (score; levels described concretely: "blocker: production is down or data is being lost for a client", "high: a client cannot complete a core flow, or a signed deadline is at risk this week", "normal: a wanted change with no deadline at risk", "low: a nicety or a cleanup"), `is_production_down` (noul), `names_a_signed_deadline` (noul), `is_vague` (noul; a mirror of the nine questions' `is_vague`). Code decides: the score's level with confidence at or above the threshold (0.8 to start; the user's data tunes it) is proposed to the tech lead with its probabilities; below it, the lead decides without a proposal; Jev never raises a priority above the sender's proposal on its own, and the lead's confirmation is always the record (escalate only, vision §8).

## 11. Jev, the verification backend

Jev is TypeSafe's System One model: a state in, typed questions in, probabilities out (`POST https://api.typesafe.ai/v1/systemone`, `Authorization: Bearer`, `model: jev-latest`; the request's `state`, `questions` as `{ id: { type, instructions, criteria } }`; the response's `answers` with `noul`, or `choice` with `probabilities` and `confidence`, or `score` with `legend`, `probabilities` and `confidence`; `usage` with the tokens). It does not generate text or reasons; it answers narrow questions with calibrated probabilities. The crew uses it exactly for that: a second, independent judgement on a claim the engine can state, with code deciding what the probabilities mean.

**Where the engine asks** (never the roles: they are read-only, with no network and no key):

- **An upheld defect** at `crew judgement record`: the state is `{ finding: { file, line, text }, lines: the cited lines of the diff with context, rubric: the question the finding answers }`; one `choice` question `relation` with `supports` ("the lines show what the finding says"), `contradicts` ("the lines show the opposite"), `says_nothing` ("the lines do not bear on the finding"); the citation-check cookbook's shape, preceded by the deterministic check that the file and the line exist in the diff.
- **A validator rule** at `crew approve … --validator`: one `noul` per condition of the rule ("every decision has an answer or a stated default", "no blocking objection is open without a bound criterion"), over `{ conclave, decisions, objections }`.
- **A researcher's fact with a source** at the end of the research pass: the deterministic check that the quote is in the fetched source first (string match, normalised), then `relation` as above over `{ claim, source excerpt }`.

**Escalate only.** A `supports` or a `yes` at or above the confidence threshold (0.8 to start) marks the record `verified: jev`; a `contradicts` or a `no` marks it `disputed` and never drops it: a disputed defect stays a defect and the report says Jev disputes it; a disputed validator condition turns the approval into a wait for a person; a disputed fact is marked before the experts read it; `says_nothing` or a low confidence marks `unverified` and changes nothing. Jev never lowers a severity, never closes a finding, never approves on its own.

**Mandatory when configured.** With `WIZARDINGCODE_JEV_API_KEY` set and the service answering, a ruling, an approval or a research pass recorded without its Jev verdicts is refused. **When it is down** (timeout, 429 after the SDK's backoff, 5xx, 401): the record says `unverified (jev unavailable: <reason>)`, the verdict stands on the judge's word, and on the full route the item waits for a person. **Records**: `Evidence.verifications[]` `{ what, question, answer, probabilities, confidence, model, at }` and a `disputed` or `verified` flag on the finding, the approval or the fact. **Policy** `verify`: `send` (`claims`: the finding, the cited lines and the rubric question leave the machine; `claims-and-snippets` adds code excerpts; the user's one-time decision per workspace), `maxClaimsPerItem` (50), `threshold` (0.8). **Measured**: Jev's verdicts against the judge's over the recorded items (the replay the vision asks of every backend) before any threshold is lowered; `crew metrics` reports agreement.

## 12. The knowledge base (SP4)

One shared store (the brand's memory plugin when installed, the engine's protected JSON otherwise; ADR 0007's open decision), entries of kinds: `stack-preference` (a client's or workspace's tendency, measured from its projects), `validated-solution` (a design or code that was proven, with the item and the commit), `documentation` (what the researchers catalogued about a library or an API: contracts, limits, pitfalls, CVEs, maintenance), `root-cause` (an issue's origin and fix), `general` (copywriting, management, strategy material the user adds). Every entry carries `workspace` (its origin) and `confidential` (true by default for anything that quotes a client's code or data; false for documentation and general knowledge). Read in Recognize: the engine lists the entries whose stack, paths or kind match the item, marked or not; the skill reads them and the strategy or the spec quotes them. Reuse of a marked entry is refused outside its workspace (rule 13). Written at Learn (the vision's phase 9, built here): with the item's evidence as the ticket; a root cause written once and refused the second time (rule 17). Learning cycles: every entry has `confirmedBy[]` (items that reused it and were proven) and `contradictedBy[]`; the CTO's plan reads them.

## 13. Strategy and audit (SP8)

### 13.1 Strategy

§7.3; delivered when the knowledge base can feed the stack advice with measured tendencies. Until then `strategy.md` is written from the research alone and says so.

### 13.2 The report

The engine renders a report from the item's records and the findings files: Markdown by the engine, HTML by the engine from a template with the lockup and the mark of `docs/brand/` (shipped in the plugin; ADR 0001's licence note), PDF printed by Playwright from the HTML; without a browser the report says "PDF not produced". The audit's sections: summary and verdict; scope and method (what ran, what was only read); business issues; security issues (CVEs, secrets, authorisation gaps); dependencies to update (package, current, latest, pros, cons, risk, proof); architecture and code quality (drift, debt as counts with their files); tests (what ran, what could not); recommendations ordered by cost and time; appendix of logs. Every finding carries a file and a line or a log path; a person signs before it leaves.

## 14. Visibility

The engine records what the mod shows: `seats[]`, the todo state per task with its brief and gate, roles started (a PreToolUse record of the Agent tool, since SubagentStop records only the end), the current branch, threads and priorities, questions, the environment's state. `crew status --json` gains `team`, `todo`, `working` (roles running, implementer sessions with pid and minutes), `branch`, `threads`, `priority`, `questions`; `crew workspace status --json` gives the workspace: live sessions per project, open items, unread mail, open threads, unconfirmed priorities, environments up or down.

The mod (`plugins/core/hooks/register.js`): the strip adds `todo 3/7` and the item's priority; the pane gains Team (the seats and their state), Todo (with checks), Working, Mail as threads with read and unread, Branch, Workspace sessions; new verbs `/crew todo`, `/crew brief T-n`, `/crew workspace`, `/crew thread <id>`. The guarantee never depends on the mod (vision §12): everything the pane shows is a `crew` command's output. Before promising desktop-app behaviour, SP7a verifies in the mods documentation: panes in the desktop app, images or HTML in a pane, persistence across turns, a notification for a blocker arriving in the background, an event at subagent start.

## 15. Evals

Every subproject adds cases to `plugins/core/evals/` (sandbox, with and without; real-opener cases from a terminal), and `fast-route-overhead` stays the guard in every run (2.03× today, measured in `docs/evals/2026-10-17-sp2c-results.md`).

- SP7a: `team-by-route` (fast launches no role; a standard item's seats name tech lead, researcher, QA, security, judge and nobody else), `gate-scoped-to-change` (a backend fix runs no UI/UX gate), `brief-per-todo`, `decision-register-reread` (a decision of an earlier item is quoted in Recognize), `personalities-differ`, `rounds-bounded` (a third round refused).
- SP7b: `env-observed-proof` (needs a sandbox that allows a local port, finding #37, or a stub with no socket; otherwise `needs-real-opener`), `priority-lowered-with-reason`, `no-environment-cannot-prove`, `thread-with-contracts`.
- SP3: `ticket-triaged-against-business`, `document-entry-opens-item`, `jev-tightens-never-loosens` (a fake verifier), `issue-root-cause-named`.
- SP8: `strategy-rejects-over-engineering`, `strategy-declares-phases`, `audit-report-three-formats`.
- SP4: `confidential-entry-not-reused`, `root-cause-not-repeated`, `cto-report-from-records`.

Cost: four to eight USD more per suite run per subproject; a real-opener case two to six USD once.

## 16. Delivery

| # | Release | Goal | Acceptance | Real use before the next |
| :- | :- | :- | :- | :- |
| SP7a Teams and the tech lead | 0.6.0 | An item is worked by a team the route sizes, led by a tech lead, with the gate scoped to the change, a brief per todo and every decision recorded per project | A standard item's record names tech lead, researcher, QA, security, judge and nobody else; a fast item launches no role; a backend change runs the test gate and code quality, not UI/UX, and each todo's brief is on disk; the panel shows the todo with checks and the agents working; a third round is refused | Three workspaces (two clients, the brand's own): ten items across the routes; the overhead not above 2.03×; cost per item recorded |
| SP7b Environment, priorities, visibility | 0.7.0 | QA proves on a localhost environment the engine starts and stops; requests carry priority and status; threads carry contracts and evidence; the user sees sessions and messages | A frontend item's evidence holds a browser run against the environment the engine brought up and took down; a `blocker` lowered to `high` by the receiver's tech lead with the reason; with no environment the gate says it cannot prove | One cross-project request end to end with contracts and evidence; a desktop-app session |
| 1.0 | after 0.7.0's real use | ADR 0004's exit | No `blocks` or `false-proof` finding open | |
| SP3 Reception, triage, issues, Jev | 1.1.0 | A request enters from ClickUp or a document, is triaged against the business, an issue is analysed to its origin, Jev tightens decisions when its key works | A ticket marked critical lands as normal with the reason; with the key set a decision is tightened and recorded as Jev's, without it the rules alone and the record says so; an issue's analysis names the item, the role and the commit | One workspace connected; a week of tickets; Jev's agreement with the judge measured |
| SP8 New projects: strategy and audit | 1.2.0 | A new project gets a strategy with proven reasons and scaling phases; an existing codebase gets an audit under the brand | An over-engineered request answered smaller with point-by-point proof; an audit of a fixture in three formats with every finding carrying file, line and proof; a person signs it | One real audit for a prospective client |
| SP4 Knowledge base, learning, CTO | 1.3.0 | What one project learned is read in the next under a confidentiality mark; the CTO report says who errs and what costs | A solution built in A proposed in B only when unmarked; the same root cause twice refused by the gap round; the CTO report from records alone | Two workspaces; one reuse; the user acts on one line of the CTO's plan |
| SP6 Packs | 1.4.0 | Teams, stack specialists and checklists install as packs with evals; an external skill is folded in only with proof | A pack installs and an eval shows the difference; an external skill's claims measured before any line enters an agent | The first outside installer |

Each subproject keeps the method of the previous ones: one plan, each task a crew item built red first, judgement gates with at most two rounds, advisories to `docs/real-use/findings.md`, one release at the close, a real-use phase with its exit stated before it starts.

## 17. Risks

- **Cost per request.** A standard item today costs about 0.43 USD and a full one 1.17 USD (the SP2c run); the standard team adds a research pass and a security seat, the full team three reviewers, the leads and the CTO. Answers: the route sizes the team and the fast route launches nothing; reviewers on sonnet over the diff only; the caps as engine refusals; the overhead case as a criterion of every subproject; `crew metrics` so the user decides per workspace on figures.
- **Consistency.** More roles could agree with themselves. Answers: separate contexts (SP2), the personalities' rotation, the decision register re-read, rulings never edited, drift a defect, Jev as a second opinion that only tightens.
- **24h operation.** Every wait is recorded, echoed to the source channel and shown; the queue serves the next item; high risk waits for a person, always; a disputed validator verdict waits too.
- **Task managers.** The skill reads through MCP; the engine stores a source and a question, never a connector; an echo that fails is recorded and the question is still visible.
- **Confidentiality.** A mark per entry with the workspace of origin; reuse refused outside it; mail never leaves the workspace; `verify.send` keeps code on the machine by default.
- **Jev.** Optional by design; down means `unverified` and the rules alone, said in the record; a threshold tuned only on measured agreement.
- **The mod's reach.** Verified before promised; the text fallback; the guarantee independent of it.
- **The user's time.** One design (this one), at most two review rounds per task, one release per subproject, a real-use exit stated before each phase; the user's decisions gathered here (§18) and defaults for the rest.

## 18. Decisions for the reviewer

Settled by this design unless the user says otherwise:

1. The knowledge base's store: the brand's memory plugin when installed, the engine's protected JSON otherwise.
2. The fast route never launches a role; its QA and security are the deterministic gates.
3. `verify.send` defaults to `claims` (no code leaves the machine); `maxClaimsPerItem` 50; `threshold` 0.8.
4. The CTO is a report command and a strategy reviewer on full items before it is anything else.
5. Personalities apply to debate seats only; reviewers answer rubrics.
6. Agentic OS is a pack team until real use shows otherwise.
7. The seven statuses plus `expired`; old records mapped on read.
8. `mail.maxParties` 4.

Traceability (the user's blocks and rules to the sections and the subprojects):

| The user said | Section | Subproject |
| :- | :- | :- |
| Three entry channels per workspace | §10.1 | SP3 |
| Analyse and ask; research and debate; the spec validated by leads with proof; the todo; the brief and the gate per todo | §7.1, §7.2, §6.4, §8.1 | SP7a (channels aside) |
| Visibility in the mod and the CLI | §14 | SP7a, SP7b |
| 24h with high risk waiting | §5 rules 7 and 15, §17 | stands, widened per subproject |
| Teams per project, priorities and statuses, threads, contracts and evidence, localhost proof | §9, §8.2 | SP7b |
| Brainstorm, strategy, discernment, persuasion, consistency | §7.3, §6.6 | SP8 (strategy), SP7a (register) |
| The audit and the branded report | §7.5, §13.2 | SP8 |
| Issue analysis, no recurrence, urgency triage | §7.4, §10.2 | SP3 |
| Judges with Jev, CTO, tech leads, nine teams, personalities | §6, §11 | SP7a (organization), SP3 (Jev), SP4 (CTO report) |
| External skills folded into our agents | §2 non-goals, SP6 | SP6 |
| The twenty rules | §5 | each as named |
