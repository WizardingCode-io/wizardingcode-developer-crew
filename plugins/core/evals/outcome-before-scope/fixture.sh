#!/bin/sh
# evals/outcome-before-scope/fixture.sh: the green Node project of node-plain.sh with a lookup that misses an account when the email's case differs (item 2026-11-14-004). The request asks for the outcome and supposes a rework the defect does not need.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
cat >> src/accounts.mjs <<'CODE'

export function findByEmail(email) {
  return [...accounts.values()].find((account) => account.email === email) ?? null;
}
CODE
cat > tests/find.test.mjs <<'FIND'
import test from "node:test";
import assert from "node:assert/strict";
import { createAccount, findByEmail } from "../src/accounts.mjs";

test("an account is found by the email it was created with", () => {
  createAccount("f1", "f@example.invalid");
  assert.equal(findByEmail("f@example.invalid").id, "f1");
});
FIND
git add -A
fixture_commit "fixture: accounts with a lookup by email"
git log -1 --oneline
