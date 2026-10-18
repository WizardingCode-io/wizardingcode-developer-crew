---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

Two changes to `src/accounts.mjs`: `deactivateAccount(id)` sets `active` to false and returns the account; `listActiveAccounts()` returns the active ones. Each with a test. Work them as two todos, one after the other, in this checkout. Decisions: an unknown id returns `undefined`; no other change. I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
