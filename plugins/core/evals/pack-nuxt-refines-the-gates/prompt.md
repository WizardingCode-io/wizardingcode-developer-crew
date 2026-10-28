---
max_turns: 80
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill]
---

This is a Nuxt 4 application. Add a `slugify` util in `app/utils/slugify.ts` (lower case; every run of characters other than letters and digits becomes one hyphen; no hyphen at either end) with a test in `tests/slugify.test.ts`, and work it in this checkout as one feature. The project's test, lint and type-check commands come from the nuxt pack: show me the pack's three commands with `crew profile`. This checkout has no `npx`: the packages are installed under `node_modules` and run through node, so set the test gate to `node node_modules/vitest/vitest.mjs run`, the lint gate to `node node_modules/eslint/bin/eslint.js .` and the type-check gate to `node node_modules/nuxt/bin/nuxt.mjs typecheck`; they are mine. I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
