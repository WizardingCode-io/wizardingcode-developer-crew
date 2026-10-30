#!/bin/sh
# evals/env-observed-proof/fixture.sh: the green Node project of node-plain.sh with a page module, a socketless environment, an end-to-end command and a policy that requires the e2e gate (SP7b decision 19).
# The environment is fixtures/flag-env.sh: a flag file under var/, ignored by git; no port (finding #37).
# The page is a module, not an .html file: an interface file would also plan the UI/UX judgement gate, which needs captures this case does not take (it carries no browser, fixtures/playwright-page.sh); the policy's requiredGates plans the e2e gate instead.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
cat > package.json <<'EOF'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test", "test:e2e": "node tests/e2e/run.mjs" } }
EOF
mkdir -p scripts tests/e2e .crew
cat > .crew/policy.json <<'EOF'
{ "requiredGates": ["e2e"] }
EOF
cat > src/page.mjs <<'EOF'
// The one page of the application, rendered as a string the environment serves.
export function renderPage() {
  return [
    "<!doctype html>",
    '<html lang="en">',
    "  <head>",
    '    <meta charset="utf-8">',
    "    <title>Fixture</title>",
    "  </head>",
    "  <body>",
    "    <h1>Fixture</h1>",
    "  </body>",
    "</html>",
  ].join("\n");
}
EOF
flag_env_write
cat > tests/e2e/run.mjs <<'EOF'
// The end-to-end run: against the environment (the flag), it loads the page as a browser would and writes the console the gate grades.
import { existsSync, writeFileSync } from "node:fs";
import { renderPage } from "../../src/page.mjs";

if (!existsSync("var/up")) {
  console.error("the environment is not up (var/up missing)");
  process.exit(1);
}
const page = renderPage();
const entries = [{ page: "/", type: "log", text: "page loaded" }];
if (!/<title>[^<]+<\/title>/.test(page)) entries.push({ page: "/", type: "error", text: "the page has no title" });
if (process.env.WIZARDINGCODE_CREW_CONSOLE_FILE) writeFileSync(process.env.WIZARDINGCODE_CREW_CONSOLE_FILE, JSON.stringify(entries));
if (entries.some((e) => e.type === "error")) process.exit(1);
console.log("e2e: the page loaded with a title");
EOF
printf 'var/\n' > .gitignore
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: env-observed-proof"
# The environment in the profile, key by key, as the user sets it; the e2e gate comes from the test:e2e script.
crew detect > /dev/null
flag_env_profile
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: the environment in the profile"
git log -1 --oneline
