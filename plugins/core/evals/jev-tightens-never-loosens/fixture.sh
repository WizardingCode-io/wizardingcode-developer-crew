#!/bin/sh
# evals/jev-tightens-never-loosens/fixture.sh: the green Node project of node-plain.sh, plus a module under src/auth/ (the full route, where the spec's approval is a guard of the engine), the policy that lets the validator approve, and a canned Jev whose second answer disputes the validator's rule (SP3).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p src/auth .crew
printf 'export const SESSION_TIMEOUT_MINUTES = 30;\n' > src/auth/session.mjs
cat > tests/session.test.mjs <<'SESSION'
import test from "node:test";
import assert from "node:assert/strict";
import { SESSION_TIMEOUT_MINUTES } from "../src/auth/session.mjs";

test("the session times out after 30 minutes", () => {
  assert.equal(SESSION_TIMEOUT_MINUTES, 30);
});
SESSION
printf '{ "unattendedDecisions": "validator" }\n' > .crew/policy.json
printf '{ "v1": { "type": "noul", "noul": 0.95 }, "v2": { "type": "noul", "noul": 0.03 } }\n' > jev-answers.json
git add -A
fixture_commit "fixture: jev-tightens-never-loosens"
# The canned file is named by a path the engine reads from the folder crew runs in (the scaffold root), so the sandbox may move the scaffold.
crew config jev.endpoint "file://jev-answers.json" > /dev/null
git log -1 --oneline
