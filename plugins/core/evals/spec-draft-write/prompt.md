---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, Agent]
---

Draft the design for webhook delivery with `wizardingcode-spec-draft`, into `docs/designs/webhooks.md`. Link to the billing notes in `docs/billing/README.md`. Pending deliveries are kept in a Postgres table, and retries are three, an hour apart: both are decided. Anything else still open goes under Open Questions: I'm not here to answer today. Say the path when done, not the whole draft.
