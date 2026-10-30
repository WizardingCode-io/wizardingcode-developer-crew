---
max_turns: 70
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill]
---

When a new message arrives the inbox should show it: add window.receiveMessage(message) to public/inbox.js, which puts the message's row at the top of the list, and give the arriving row a motion so a person notices it without being distracted (public/styles/inbox.css). Tell me at the end what the motion is for, its duration and easing, and what happens under reduced motion. The criterion's screen is inbox:default, and the e2e spec (tests/e2e/inbox.spec.mjs, through the crew's fixture in tests/e2e/crew.mjs) proves the arrival. This project's environment and its e2e command are in the crew's profile: prove the change end to end, the UI/UX review included. The project's design contract is DESIGN.md. I am not here to answer.
