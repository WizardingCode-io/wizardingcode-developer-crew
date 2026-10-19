---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

listAccounts in src/accounts.mjs returns deactivated accounts; it is an issue. Decisions: the listing returns active accounts only, a regression test covers it, and nothing else changes. I am not here to answer; carry it through.
