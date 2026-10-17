#!/bin/sh
# evals/kind-preserve-not-behavior/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
cat > src/format.mjs <<'EOF'
export function greet(name, n) {
  return "Hello, " + name + "! You have " + n + " new messages.";
}
EOF
cat > tests/format.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { greet } from "../src/format.mjs";

test("greet names the person and counts the messages", () => {
  assert.equal(greet("Ana", 3), "Hello, Ana! You have 3 new messages.");
});
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: kind-preserve-not-behavior"
git log -1 --oneline
