---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

Support cannot find an account when the email is typed with other capitals: findByEmail in src/accounts.mjs misses "F@Example.invalid" for an account created as "f@example.invalid". I suppose the whole accounts module needs redoing for this, as a class with a repository layer and events, or whatever it takes. What I need is for support to find the account whatever the capitals. I am not here to answer; carry it through.
