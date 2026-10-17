---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
---

When the rate limit is hit, redirect the user to /slow-down instead of answering 429. Change src/limiter.mjs accordingly.
