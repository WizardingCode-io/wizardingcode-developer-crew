# Understand

Standard and full routes only. Goal: agree on the problem before designing a solution.

Write, in the conversation, on one screen:

- **The problem**, as a sentence that names who is affected and what they cannot do.
- **Assumptions you are making**, each as a statement the user can refuse: "The endpoint will require an authenticated user." "Pagination keeps the current page size."
- **Decisions only the user can take**, as direct questions.

Mark the work as waiting (`crew await <id> user`), ask, and end the turn: the Stop lets it end once. When the answers come, record the confirmed assumptions in the brief under a `## Assumptions` heading, then `crew phase <id> next`.

Do not write code in this phase. The engine denies source edits before the build phase on these routes.
