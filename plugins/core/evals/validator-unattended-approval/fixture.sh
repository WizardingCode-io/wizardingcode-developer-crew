#!/bin/sh
# evals/validator-unattended-approval/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p src/auth .crew
printf 'export const SESSION_TIMEOUT_MINUTES = 30;\n' > src/auth/session.mjs
cat > tests/session.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_TIMEOUT_MINUTES } from "../src/auth/session.mjs";

test("the session times out after 30 minutes", () => {
  assert.equal(SESSION_TIMEOUT_MINUTES, 30);
});
EOF
printf '{ "unattendedDecisions": "validator" }\n' > .crew/policy.json
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: validator-unattended-approval"
git log -1 --oneline
