#!/bin/sh
# evals/code-quality-flags-unasked-dependency/fixture.sh: a Node project whose uncommitted change, the person's
# own edits the request builds on, carries a development dependency no criterion needs (nodemon, with a dev
# script) and a debug line behind an environment flag in the function the request asks for (2026-10-29-001, D-3,
# AC-20). The writer is told to build on them, so what is measured is the reviewer: the policy seats the
# code-quality reviewer on every route, and its findings name the dependency as a defect (question 7). The debug
# line may go before the review; the case asks only that neither ships. No lockfile: the dependency audit is
# not planned on the standard route.
set -eu
. "$(dirname "$0")/../fixtures/commit.sh"
git init -q -b main
cat > package.json <<'JSON'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
mkdir -p src tests .crew
cat > src/names.mjs <<'JS'
export function fullName(first, last) {
  return `${first} ${last}`;
}
JS
cat > tests/names.test.mjs <<'JS'
import test from "node:test";
import assert from "node:assert/strict";
import { fullName } from "../src/names.mjs";

test("fullName joins the two names", () => {
  assert.equal(fullName("Ana", "Lima"), "Ana Lima");
});
JS
git add -A
fixture_commit "fixture: a names module"
cat > .crew/policy.json <<'JSON'
{ "judgementGates": ["code-quality"] }
JSON
crew policy set team.continuations granted > /dev/null
# The person's edits, uncommitted.
cat > package.json <<'JSON'
{
  "name": "fixture",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test", "dev": "nodemon --watch src src/names.mjs" },
  "devDependencies": { "nodemon": "^3.1.10" }
}
JSON
cat > src/names.mjs <<'JS'
export function fullName(first, last) {
  return `${first} ${last}`;
}

export function initials(name) {
  const out = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .join("");
  if (process.env.DEBUG_NAMES) console.log("initials", name, out);
  return out;
}
JS
