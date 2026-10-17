#!/bin/sh
# evals/judgement-gate-not-run/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p public
cat > public/index.html <<'EOF'
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Inbox</title></head>
  <body>
    <h1>Inbox</h1>
    <p class="empty">No messages yet.</p>
  </body>
</html>
EOF
printf 'export const EMPTY_STATE = "No messages yet.";\n' > src/render.mjs
cat > tests/render.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { EMPTY_STATE } from "../src/render.mjs";

test("the empty state copy", () => {
  assert.equal(EMPTY_STATE, "No messages yet.");
});
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: judgement-gate-not-run"
git log -1 --oneline
