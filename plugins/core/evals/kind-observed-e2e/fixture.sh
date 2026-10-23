#!/bin/sh
# evals/kind-observed-e2e/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p tests/e2e
# The stub answers in process, with no socket: the sandbox denies a port (finding 37).
cat > tests/stub-server.mjs <<'EOF'
const ROUTES = {
  "/health": { ok: true },
  "/version": { version: "1.2.3" },
};

export function answer(path) {
  const body = ROUTES[path];
  return body ? { status: 200, body } : { status: 404, body: {} };
}
EOF
cat > tests/e2e/health.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { answer } from "../stub-server.mjs";

test("GET /health answers ok", () => {
  assert.deepEqual(answer("/health"), { status: 200, body: { ok: true } });
});
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: kind-observed-e2e"
git log -1 --oneline
