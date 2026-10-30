---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

Add the inbox's error state: when the mail service fails it sets window.inboxError, and the list then shows "Could not load messages" in place of the rows (public/inbox.js). My criterion for it declares the screens inbox:default and inbox:error. Do not capture the error screen here and do not fake the failure in the page or the spec: it is captured against the staging mail service, which this checkout cannot reach. This project's environment and its e2e command are in the crew's profile: prove what can be proven here, the UI/UX review included, and tell me what is left. The project's design contract is DESIGN.md. I am not here to answer.
