#!/bin/sh
# evals/issue-fast-overhead/fixture.sh: a Node project whose test fails until add() is fixed (the old fast-route-overhead case, finding 93: a fix walks through analyse, so its cost is measured on its own).
set -eu
git init -q -b main
cat > package.json <<'EOF'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF
mkdir -p src tests
cat > src/math.mjs <<'EOF'
export function add(a, b) {
  return a - b;
}
EOF
cat > tests/math.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";

test("add adds two numbers", () => {
  assert.equal(add(2, 2), 4);
});
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: node project with a failing test"
git log -1 --oneline
