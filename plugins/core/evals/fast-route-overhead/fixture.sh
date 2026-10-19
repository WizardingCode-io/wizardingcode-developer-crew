#!/bin/sh
# evals/fast-route-overhead/fixture.sh: a green Node project with add() and its test; the case asks a one-spot feature beside it (SP8, finding 93: the fast route's floor is measured on what the fast route is for).
set -eu
git init -q -b main
cat > package.json <<'EOF2'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF2
mkdir -p src tests
cat > src/math.mjs <<'EOF2'
export function add(a, b) {
  return a + b;
}
EOF2
cat > tests/math.test.mjs <<'EOF2'
import test from "node:test";
import assert from "node:assert/strict";
import { add } from "../src/math.mjs";

test("add adds two numbers", () => {
  assert.equal(add(2, 2), 4);
});
EOF2
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: node project with add and its test"
git log -1 --oneline
