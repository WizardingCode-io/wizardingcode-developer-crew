# Understand

Standard and full routes only. Goal: agree on the problem before designing a solution.

Write, in the conversation, on one screen:

- **What the base holds**: read `.crew/work/<id>/knowledge.md` first, the engine's list of the entries that bear on the request (what this project may read: unmarked entries, and marked ones of this workspace; nothing hidden is ever listed); `crew knowledge show K-n` prints an entry; a listed entry that settles a choice is cited in the spec as `[K:<id>]`, and the strategy may rest on it as on a researched fact. `crew knowledge <id> lookup` reads the base again after a kind raise or a new entry.
- **The problem**, as a sentence that names who is affected and what they cannot do.
- **The outcome**: what the person can do, or stops suffering, once this is done. It answers "what do you want to happen next", and it is said before any design.
- **The judge**: what shows the outcome was reached and is neither you nor the user: a test, a gate, a measure. An outcome with no such judge is too high for this item: state a lower one.
- **The smallest change that reaches it**: that change is the item. A wider change is a proposal of the gap round, with its reason, never the item; what makes the work larger without making it better is left out. What the method asks of the change is part of it and is never left out as wider: its route and risk areas, the gates, what stays green, and the gap round's assumed practice and warnings.
- **Assumptions you are making**, each as a statement the user can refuse: "The endpoint will require an authenticated user." "Pagination keeps the current page size."
- **What the request points at** (a route, a page, a table, a field): read where the repository lists them and say whether each exists; what does not exist is a decision for the user, never an assumption.
- **Earlier decisions**: `crew decisions` lists what this project decided before (answers, waivers, approvals, upheld defects, returned validations); quote the ones that touch the request before assuming anything they settled; a decision changed is a new decision, taken in words and recorded, never a silent deviation (rule 8). `crew decisions --grep <word>` narrows the list.
- **Decisions only the user can take**, as direct questions, each recorded with `crew decision <id> add "<question>" --default "<the conservative answer>"` as it is asked, never left in prose (finding 38).

Mark the work as waiting (`crew await <id> user`), ask, and end the turn: the Stop lets it end once. A doubt that must be on record (what was asked, where, who answered) is a question: `crew question <id> add "<text>"` records it, posts it where the engine can (the questions file beside a request document, a notice to the project's own mail) and waits; what is left to post (the ticket) the engine names, you post with the session's tools and mark `crew question <id> posted Q-n --channel ticket --ref <comment url>`. The answer is a person's: `crew question <id> answer Q-n "<answer>"` (asked as `crew approve` is, relayed under `relay`; with nobody present it is refused and the item keeps waiting). When the answers come, record the confirmed assumptions in the brief under a `## Assumptions` heading, then `crew phase <id> next`.

Do not write code in this phase. The engine denies source edits before the build phase on these routes. The rule reads the Write and Edit tools and a command line's own write shapes (a redirect, `tee`, `sed -i`, `cp` or `mv` onto a source file); a write made inside an interpreter's script (`python3 - <<E`) is one it cannot read, and the leads' validations on record are what keeps such an item not proven.

On a new project (`kind new-project`, or a feature raised with `crew kind <id> raise --reason "<why>"` while its spec is open), the strategy comes next, before the spec: `references/strategy.md`.

Provenance (ADR 0017): the outcome, its judge and the smallest change distil the skill `be-ambitious` (MIT, RoboNuggets, `dc116a3`), which turns Felix Rieseberg's article "How to be more ambitious" into steps, in the crew's words; `docs/sources/ledger.json` has a row per rule.
