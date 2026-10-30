---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

Give the inbox's heading a count of the messages, "Inbox (3)", from the messages the page lists (public/inbox.js and public/index.html). The criterion's screen is inbox:default, captured by the e2e spec (tests/e2e/inbox.spec.mjs, through the crew's fixture in tests/e2e/crew.mjs). This project's environment and its e2e command are in the crew's profile: prove the change end to end, the UI/UX review included, and tell me whether the browser's deep audit ran and, if not, why. Do not install anything. The project's design contract is DESIGN.md. I am not here to answer.
