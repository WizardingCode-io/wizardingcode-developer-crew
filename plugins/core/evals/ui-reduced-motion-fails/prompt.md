---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

I started a sync indicator in the inbox's heading (public/index.html and public/styles/inbox.css, uncommitted): finish it so that it reads "Syncing" beside the spinner, for screen readers as well. The criterion's screen is inbox:default, captured by the e2e spec (tests/e2e/inbox.spec.mjs, through the crew's fixture in tests/e2e/crew.mjs). Before you change anything, run the crew's gates on my change as it is, so we both see what they say; then fix what they find. This project's environment and its e2e command are in the crew's profile: prove the change end to end, the UI/UX review included. The project's design contract is DESIGN.md. I am not here to answer.
