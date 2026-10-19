#!/bin/sh
# evals/env-observed-proof/fixture.sh: the green Node project of node-plain.sh with a page module, a socketless environment, an end-to-end command and a policy that requires the e2e gate (SP7b decision 19).
# The environment is a flag file under var/, ignored by git: start writes it, health tests it, stop removes it. No port, so the sandbox's denial (finding #37) does not apply.
# The page is a module, not an .html file: an interface file would also plan the UI/UX judgement gate, which needs a browser the sandbox has not; the policy's requiredGates plans the e2e gate instead.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
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
cat > scripts/env.mjs <<'EOF'
// The socketless environment: a flag under var/ stands for the running application; every call logs its verb.
import { appendFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";

const flag = "var/up";
const verb = process.argv[2];
mkdirSync("var", { recursive: true });
appendFileSync("var/log.txt", `${verb}\n`);
if (verb === "start") writeFileSync(flag, "up\n");
else if (verb === "health") process.exit(existsSync(flag) ? 0 : 1);
else if (verb === "stop") {
  if (existsSync(flag)) unlinkSync(flag);
} else {
  console.error("usage: node scripts/env.mjs start|health|stop");
  process.exit(2);
}
EOF
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
crew profile set environment.start "node scripts/env.mjs start" > /dev/null
crew profile set environment.health "node scripts/env.mjs health" > /dev/null
crew profile set environment.stop "node scripts/env.mjs stop" > /dev/null
crew profile set environment.timeout 20 > /dev/null
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: the environment in the profile"
git log -1 --oneline
