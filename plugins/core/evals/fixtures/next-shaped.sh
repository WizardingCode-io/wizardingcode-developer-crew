#!/bin/sh
# evals/fixtures/next-shaped.sh: a Next 16-shaped tree with no Next (SP9 Task 12, decision 7 of the SP9 plan): the
# skeleton's package.json (dev, build and start spelled through node, since the scaffold has no node_modules/.bin;
# no test, lint or typecheck script, so the core's detector gives the build gate and the scoped template alone),
# next.config.ts (the pack's marker), app/layout.tsx, app/page.tsx, and three faked packages committed under
# node_modules/: vitest (a node script, red until lib/slugify.ts exports slugify and tests/slugify.test.ts names it,
# the request's own red-then-green), eslint and next (exit 0). Each stub reads the files its check names or nothing,
# writes nothing and spawns nothing. No tsconfig.json: the core's detected `npx tsc --noEmit` would enter both halves
# and fail there for the sandbox's reason (no npx), not the pack's (D-2 of the item). No lockfile: the core's manager
# is npm. Sourced by a case's fixture.sh, which registers the pack or not, commits once and detects the profile.
set -eu
# One commit of the fixture's own, with a name no project has (finding 96).
. "$(dirname "$0")/../fixtures/commit.sh"
git init -q -b main
cat > package.json <<'EOF'
{
  "name": "fixture-site",
  "private": true,
  "scripts": {
    "dev": "node node_modules/next/dist/bin/next dev",
    "build": "node node_modules/next/dist/bin/next build",
    "start": "node node_modules/next/dist/bin/next start"
  },
  "dependencies": { "next": "^16.4.3", "react": "^19.3.1", "react-dom": "^19.3.1" },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.2",
    "eslint": "^10.13.0",
    "eslint-config-next": "^16.4.3",
    "jsdom": "^30.1.3",
    "vitest": "^5.0.5"
  }
}
EOF
cat > next.config.ts <<'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
EOF
mkdir -p app lib node_modules/vitest node_modules/eslint/bin node_modules/next/dist/bin
cat > app/layout.tsx <<'EOF'
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
EOF
cat > app/page.tsx <<'EOF'
export default function Page() {
  return (
    <main>
      <h1>Fixture site</h1>
      <p>A Next-shaped tree for the crew's eval cases.</p>
    </main>
  );
}
EOF
# git keeps no empty folder: lib/ exists once the request writes the util.
rmdir lib
# The faked vitest: one check over the two files the request names; `run`, `related <files> --run` and a file
# filter all run it. Red as committed (no util, no test), green once both exist.
cat > node_modules/vitest/package.json <<'EOF'
{
  "name": "vitest",
  "version": "0.0.0-fixture",
  "description": "The crew's eval fixture stub, not Vitest: a node script that passes once lib/slugify.ts exports slugify and tests/slugify.test.ts names it.",
  "type": "module",
  "bin": { "vitest": "vitest.mjs" }
}
EOF
cat > node_modules/vitest/vitest.mjs <<'EOF'
#!/usr/bin/env node
// The fixture's vitest, not Vitest (SP9 Task 12): `run`, `related <files> --run` and a file filter all run one
// check, red until lib/slugify.ts exports slugify and tests/slugify.test.ts names it, as the request asks.
// It reads those two files and nothing else, writes nothing and spawns nothing.
import { readFileSync } from "node:fs";

function tryRead(read) {
  try {
    return read();
  } catch {
    return "";
  }
}
const util = tryRead(() => readFileSync("lib/slugify.ts", "utf8"));
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
  : "lib/slugify.ts does not export slugify";
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
// The fixture's eslint, not ESLint (SP9 Task 12): exit 0 and no output, as ESLint on a clean tree. It reads
// nothing, writes nothing and spawns nothing.
process.exit(0);
EOF
cat > node_modules/next/package.json <<'EOF'
{
  "name": "next",
  "version": "0.0.0-fixture",
  "description": "The crew's eval fixture stub, not Next.js: dev, build, start, typegen and the other commands print one line and exit 0.",
  "bin": { "next": "dist/bin/next" }
}
EOF
cat > node_modules/next/dist/bin/next <<'EOF'
#!/usr/bin/env node
// The fixture's next CLI, not Next.js (SP9 Task 12): dev, build, start, typegen and the rest print one line and
// exit 0. It reads nothing, writes nothing and spawns nothing.
const command = process.argv[2] ?? "help";
console.log(`[next] ${command}: the fixture's stub, nothing run`);
process.exit(0);
EOF
chmod +x node_modules/vitest/vitest.mjs node_modules/eslint/bin/eslint.js node_modules/next/dist/bin/next
