---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill]
---

Refactor src/format.mjs to use a template literal instead of string concatenation. The existing tests stay green; no new behaviour.
