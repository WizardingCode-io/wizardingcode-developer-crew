# Understand

Standard and full routes only. Goal: agree on the problem before designing a solution.

Write, in the conversation, on one screen:

- **The problem**, as a sentence that names who is affected and what they cannot do.
- **Assumptions you are making**, each as a statement the user can refuse: "The endpoint will require an authenticated user." "Pagination keeps the current page size."
- **What the request points at** (a route, a page, a table, a field): read where the repository lists them and say whether each exists; what does not exist is a decision for the user, never an assumption.
- **Earlier decisions**: `crew decisions` lists what this project decided before (answers, waivers, approvals, upheld defects, returned validations); quote the ones that touch the request before assuming anything they settled; a decision changed is a new decision, taken in words and recorded, never a silent deviation (rule 8). `crew decisions --grep <word>` narrows the list.
- **Decisions only the user can take**, as direct questions.

Mark the work as waiting (`crew await <id> user`), ask, and end the turn: the Stop lets it end once. A doubt that must be on record (what was asked, where, who answered) is a question: `crew question <id> add "<text>"` records it, posts it where the engine can (the questions file beside a request document, a notice to the project's own mail) and waits; what is left to post (the ticket) the engine names, you post with the session's tools and mark `crew question <id> posted Q-n --channel ticket --ref <comment url>`. The answer is a person's: `crew question <id> answer Q-n "<answer>"` (asked as `crew approve` is, relayed under `relay`; with nobody present it is refused and the item keeps waiting). When the answers come, record the confirmed assumptions in the brief under a `## Assumptions` heading, then `crew phase <id> next`.

Do not write code in this phase. The engine denies source edits before the build phase on these routes.

On a new project (`kind new-project`, or a feature raised with `crew kind <id> raise --reason "<why>"` while its spec is open), the strategy comes next, before the spec: `references/strategy.md`.
