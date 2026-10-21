---
max_turns: 80
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill]
---

Add the rule that a request naming an outage goes to the on-call queue to `agents/triage.md`, the triage agent's prompt file; `tests/triage.test.mjs` already expects it. Work it in this checkout as one feature. I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
