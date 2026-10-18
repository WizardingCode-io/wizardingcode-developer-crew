---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

Add `accountAge(id)` to `src/accounts.mjs` returning whole days since `createdAt`, with a test; use the literal `86400000` inline for the day length, do not name it (a seeded defect of this case, for the reviewers to find; it is not the repository's style). I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
