#!/bin/sh
# evals/no-environment-cannot-prove/fixture.sh: the green Node project of node-plain.sh with a page and an end-to-end command, and no environment anywhere (no compose file, no start script, nothing in the profile).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
cat > package.json <<'EOF'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test", "test:e2e": "node tests/e2e/run.mjs" } }
EOF
mkdir -p tests/e2e
cat > src/index.html <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Fixture</title>
  </head>
  <body>
    <h1>Fixture</h1>
  </body>
</html>
EOF
cat > tests/e2e/run.mjs <<'EOF'
// The end-to-end run: against the environment (the flag), it loads the page as a browser would and writes the console the gate grades.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (!existsSync("var/up")) {
  console.error("the environment is not up (var/up missing)");
  process.exit(1);
}
const page = readFileSync("src/index.html", "utf8");
const entries = [{ page: "/", type: "log", text: "index.html loaded" }];
if (!/<title>[^<]+<\/title>/.test(page)) entries.push({ page: "/", type: "error", text: "the page has no title" });
if (process.env.WIZARDINGCODE_CREW_CONSOLE_FILE) writeFileSync(process.env.WIZARDINGCODE_CREW_CONSOLE_FILE, JSON.stringify(entries));
if (entries.some((e) => e.type === "error")) process.exit(1);
console.log("e2e: the page loaded with a title");
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: no-environment-cannot-prove"
git log -1 --oneline
