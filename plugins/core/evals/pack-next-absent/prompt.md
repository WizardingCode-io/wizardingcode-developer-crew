---
max_turns: 80
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill]
---

This is a Next.js 16 application with no test runner the engine knows. Add a `slugify` util in `lib/slugify.ts` (lower case; every run of characters other than letters and digits becomes one hyphen; no hyphen at either end) with a test in `tests/slugify.test.ts`, and work it in this checkout as one feature. This checkout has no `npx`: the tests run with `node node_modules/vitest/vitest.mjs run`; pass it to `crew tdd` after `--`, or propose it as the project's test command, and say plainly what is proven. I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
