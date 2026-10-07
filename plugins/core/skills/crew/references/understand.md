# Understand

Standard and full routes only. Goal: agree on the problem before designing a solution.

Write, in the conversation, on one screen:

- **The problem**, as a sentence that names who is affected and what they cannot do.
- **Assumptions you are making**, each as a statement the user can refuse: "The endpoint will require an authenticated user." "Pagination keeps the current page size."
- **Decisions only the user can take**, as direct questions.

Mark the work as waiting (`crew await <id> user`) while the user answers. Record the confirmed assumptions in the brief under a `## Assumptions` heading. Then `crew resume <id>` and `crew phase <id> next`.

Do not write code in this phase. The engine denies source edits before the build phase on these routes.
