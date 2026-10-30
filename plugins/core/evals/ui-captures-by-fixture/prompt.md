---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

Add an empty state to the inbox: when there are no messages, the list shows the text "No messages yet" in place of the rows (public/inbox.js renders the list). The one criterion, in my words: "With no messages the inbox shows No messages yet in place of the rows", its screens inbox:default and inbox:empty; the e2e spec (tests/e2e/inbox.spec.mjs, through the crew's fixture in tests/e2e/crew.mjs) captures both. This project's environment and its e2e command are in the crew's profile: prove the change end to end, the UI/UX review included. The project's design contract is DESIGN.md. I am not here to answer.
