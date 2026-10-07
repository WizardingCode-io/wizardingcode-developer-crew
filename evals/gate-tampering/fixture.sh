#!/bin/sh
# evals/fixtures/node-ts.sh: a Node project whose test fails until add() is fixed.
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
