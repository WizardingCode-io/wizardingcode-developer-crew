# Architecture rubric

The architecture gate asks whether the change follows the project's own base: its declared architecture, its data model, its contracts and its integrations. Drift from what is defined is a defect (SP7 rule 9); the gate never asks whether another architecture would be better.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the item's spec (`.crew/work/<id>/spec.md`, its Design section), and where the project states its base: an architecture document or ADRs under `docs/`, the schema or model folder, the contract files (OpenAPI, types, schemas). When the project states no base, the reviewer says so under "Not answerable" and reviews against the conventions the neighbouring code shows.

## Questions

1. Layers and boundaries: does each new or changed piece live where the base puts that kind of code (a query in the data layer, a rule in the domain, a format at the edge)? A piece that crosses a boundary the base draws is drift.
2. Data model: does the change add, rename or reinterpret a field, a table or a relation without the model saying so? A field with a new meaning is drift.
3. Contracts: does the change alter what other code or other systems rely on (a type, a route's shape, an event's payload, a return value) without the contract changing with it? A changed contract without its file is drift.
4. Integrations: does the change talk to something outside (a service, a queue, a file system) through the project's own adapter, or on its own? A new direct call where an adapter exists is drift.
5. The spec's Design: does the change build what the Design says, in the place it says? A change that builds the same thing elsewhere is drift; a change that builds something the Design does not name is scope, named as such.
6. Consistency with neighbours: when the base is silent, does the change do what the neighbouring code does (naming, error shapes, dependency direction)? A disagreement is advisory unless it crosses a boundary.
7. Choosing the architecture style, when the diff adds a deployable, a service, an event bus, a queue between the project's own parts, CQRS or event sourcing, or a module boundary the base does not have: does the item's spec or an ADR state the case it was chosen for, measured or estimated in writing? The rule: `wizardingcode-architecture-decision`.
8. Decisions and documentation, when the diff changes what an accepted ADR of the project decided, or adds an ADR: is the decision recorded in the form the project's ADRs have, and does a departure from an accepted ADR come with the ADR that supersedes it? The rule: `wizardingcode-architecture-decision`.
9. Quality attributes, when the spec's Design names a figure (a latency, a load, an availability, a size) or the diff adds a cache, a retry, a timeout or a queue for load: does the change build the mechanism and the figure the Design names? The rule: `wizardingcode-architecture-quality-risk`.
10. Evolution and debt, when the diff runs an old and a new path side by side, deprecates a call, or upgrades the framework's major version: does the change say which path is the old one and what removes it, and does an upgrade follow the framework's own upgrade guide? The row: `${CLAUDE_PLUGIN_ROOT}/teams/architects.md`, "Evolution and debt".
11. Technology and dependencies, when the diff adds a dependency, a library, a service or a client of a bought service: does the project's framework, or a dependency the project already has, already do the job? The rule: `wizardingcode-architecture-decision`.
12. AI and agents, when the diff adds or changes a call to a model, an agent, a tool an agent calls or a prompt: does the call go through the project's own client or adapter (question 4), and does each agent name the tools it holds? The rule: `wizardingcode-agentic-agents-tools-prompts`.

Questions 7 to 12 are answered only when the diff touches their subject, by the trigger each names; question 7 reads the item's spec, `.crew/work/<id>/spec.md`.

## Defect or advisory

A **defect**: a boundary crossed, a model reinterpreted, a contract changed without its file, an integration bypassing the project's adapter, a Design built elsewhere; each named as what the base says and what the change does, at a file and a line of the diff; a new style or a new deployable with no case stated, measured or estimated in writing; a departure from an accepted ADR with no ADR that supersedes it; a figure or a mechanism the Design names built otherwise; a new dependency that does what the framework already brings, with no reason stated; an agent that names no tools, or a model called around the project's adapter. An **advisory**: a naming drift, a convention disagreement where the base is silent, a layer the base does not define, a Design detail the change reads differently without crossing a boundary; an old path with nothing named that removes it; a framework upgrade that departs from its upgrade guide.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A drift the diff did not introduce is named under "Outside the change", never a defect. The reviewer reads the repository to know the base, and judges the diff.
