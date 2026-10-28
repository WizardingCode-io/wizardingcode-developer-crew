#!/bin/sh
# evals/fixtures/nuxt-shaped.sh: a Nuxt 4-shaped tree with no Nuxt (SP9 Task 11, decision 7 of its plan): the
# skeleton's package.json (its five scripts spelled through node, since the scaffold has no node_modules/.bin;
# no test, lint or typecheck script, so the core's detector gives the build gate and the scoped template alone),
# nuxt.config.ts (the pack's marker), app/app.vue, and three faked packages committed under node_modules/:
# vitest (a node script, red until app/utils/slugify.ts exports slugify and tests/slugify.test.ts names it, the
# request's own red-then-green), eslint and nuxt (exit 0). Each stub reads the files its check names or nothing,
# writes nothing and spawns nothing. No tsconfig.json: the core's `npx tsc --noEmit` guess would enter the absent
# half and fail there for the sandbox's reason (no npx), not the pack's. No lockfile: the core's manager is npm.
# Sourced by a case's fixture.sh, which registers the pack or not, commits once and detects the profile.
set -eu
# One commit of the fixture's own, with a name no project has (finding 96).
. "$(dirname "$0")/../fixtures/commit.sh"
git init -q -b main
cat > package.json <<'EOF'
{
  "name": "fixture-site",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node node_modules/nuxt/bin/nuxt.mjs build",
    "dev": "node node_modules/nuxt/bin/nuxt.mjs dev",
    "generate": "node node_modules/nuxt/bin/nuxt.mjs generate",
    "preview": "node node_modules/nuxt/bin/nuxt.mjs preview",
    "postinstall": "node node_modules/nuxt/bin/nuxt.mjs prepare"
  },
  "dependencies": { "nuxt": "^4.6.3", "vue": "^3.5.44" },
  "devDependencies": {
    "@nuxt/eslint": "^1.17.0",
    "@nuxt/test-utils": "^4.3.4",
    "eslint": "^10.13.0",
    "vitest": "^5.0.5"
  }
}
EOF
cat > nuxt.config.ts <<'EOF'
export default defineNuxtConfig({
  compatibilityDate: "2026-10-28",
  modules: ["@nuxt/eslint"],
});
EOF
mkdir -p app/utils node_modules/vitest node_modules/eslint/bin node_modules/nuxt/bin
cat > app/app.vue <<'EOF'
<template>
  <main>
    <h1>Fixture site</h1>
    <p>A Nuxt-shaped tree for the crew's eval cases.</p>
  </main>
</template>
EOF
# The faked vitest: one check over the two files the request names; `run`, `related <files> --run` and a file
# filter all run it. Red as committed (no util, no test), green once both exist.
cat > node_modules/vitest/package.json <<'EOF'
{
  "name": "vitest",
  "version": "0.0.0-fixture",
  "description": "The crew's eval fixture stub, not Vitest: a node script that passes once app/utils/slugify.ts exports slugify and tests/slugify.test.ts names it.",
  "type": "module",
  "bin": { "vitest": "vitest.mjs" }
}
EOF
cat > node_modules/vitest/vitest.mjs <<'EOF'
#!/usr/bin/env node
// The fixture's vitest, not Vitest (SP9 Task 11): `run`, `related <files> --run` and a file filter all run one
// check, red until app/utils/slugify.ts exports slugify and tests/slugify.test.ts names it, as the request asks.
// It reads those two files and nothing else, writes nothing and spawns nothing.
import { readFileSync } from "node:fs";

function tryRead(read) {
  try {
    return read();
  } catch {
    return "";
  }
}
const util = tryRead(() => readFileSync("app/utils/slugify.ts", "utf8"));
const spec = tryRead(() => readFileSync("tests/slugify.test.ts", "utf8"));
const words = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const related = words[0] === "related" ? words.slice(1) : [];
const header = related.length ? ` related: ${related.join(" ")}` : "";
const exported = /export\s+(?:function|const)\s+slugify\b/.test(util);
const named = /\bslugify\b/.test(spec);
if (exported && named) {
  console.log(` ✓ tests/slugify.test.ts (1 test)${header}\n\n Test Files  1 passed (1)\n      Tests  1 passed (1)`);
  process.exit(0);
}
const why = exported
  ? "tests/slugify.test.ts does not name slugify"
  : "app/utils/slugify.ts does not export slugify";
console.log(` FAIL  tests/slugify.test.ts > slugify turns a title into a slug${header}\n       ${why}\n\n Test Files  1 failed (1)\n      Tests  1 failed (1)`);
process.exit(1);
EOF
cat > node_modules/eslint/package.json <<'EOF'
{
  "name": "eslint",
  "version": "0.0.0-fixture",
  "description": "The crew's eval fixture stub, not ESLint: exits 0 with no output, as ESLint on a clean tree.",
  "bin": { "eslint": "bin/eslint.js" }
}
EOF
cat > node_modules/eslint/bin/eslint.js <<'EOF'
#!/usr/bin/env node
// The fixture's eslint, not ESLint (SP9 Task 11): exit 0 and no output, as ESLint on a clean tree. It reads
// nothing, writes nothing and spawns nothing.
process.exit(0);
EOF
cat > node_modules/nuxt/package.json <<'EOF'
{
  "name": "nuxt",
  "version": "0.0.0-fixture",
  "description": "The crew's eval fixture stub, not Nuxt: typecheck, build and the other commands print one line and exit 0.",
  "type": "module",
  "bin": { "nuxt": "bin/nuxt.mjs", "nuxi": "bin/nuxt.mjs" }
}
EOF
cat > node_modules/nuxt/bin/nuxt.mjs <<'EOF'
#!/usr/bin/env node
// The fixture's nuxt CLI, not Nuxt (SP9 Task 11): typecheck, build, dev, generate, preview and prepare print
// one line and exit 0. It reads nothing, writes nothing and spawns nothing.
const command = process.argv[2] ?? "help";
console.log(`[nuxt] ${command}: the fixture's stub, nothing run`);
process.exit(0);
EOF
chmod +x node_modules/vitest/vitest.mjs node_modules/eslint/bin/eslint.js node_modules/nuxt/bin/nuxt.mjs
