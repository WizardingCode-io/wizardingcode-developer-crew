---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

Add `deactivateAccount(id)` to `src/accounts.mjs`: it sets `active` to false, records the event in the audit log as `createAccount` does, and returns the account; an unknown id returns `undefined`. With a test. I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
