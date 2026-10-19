#!/bin/sh
# evals/audit-report-three-formats/fixture.sh: a Node project with a passing build, a failing test, a lint error and a planted key, committed (SP8): the audit runs the tools, the roles read the code, the report leaves only signed by a person.
# The key is assembled here from two pieces, so no committed text matches the engine's rule (the repository's own secrets gate).
set -eu
fixture_commit() {
  git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "$1"
}
git init -q -b main
cat > package.json <<'PKG'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "build": "node -e \"process.exit(0)\"", "test": "node --test", "lint": "node scripts/lint.mjs" } }
PKG
mkdir -p src tests config scripts
cat > src/app.mjs <<'APP'
export function total(items) {
  var sum = 0;
  for (const item of items) sum += item.price;
  return sum;
}
APP
cat > tests/total.test.mjs <<'TEST'
import test from "node:test";
import assert from "node:assert/strict";
import { total } from "../src/app.mjs";

test("the total adds the prices", () => {
  assert.equal(total([{ price: 2 }, { price: 3 }]), 5);
});
TEST
cat > tests/fails.test.mjs <<'TEST'
import test from "node:test";
import assert from "node:assert/strict";

test("a check that fails until the discount is applied", () => {
  assert.equal(1, 2);
});
TEST
cat > scripts/lint.mjs <<'LINT'
import { readFileSync } from "node:fs";
const text = readFileSync("src/app.mjs", "utf8");
if (/\bvar\b/.test(text)) {
  console.error("src/app.mjs:2:3: error: var is not allowed, use let or const (no-var)");
  process.exit(1);
}
LINT
P1="AKIA"
P2="IOSFODNN7EXAMPLE1"
printf 'export const awsAccessKey = "%s%s";\nexport const region = "eu-west-1";\n' "$P1" "$P2" > config/keys.mjs
cat > README.md <<'README'
# Shop total

A small shop module: the total of a cart's items. The README promises a discount on carts over 100, which nothing applies yet.
README
git add -A
fixture_commit "fixture: shop total, with a failing test, a lint error and a key in config"
git log -1 --oneline
