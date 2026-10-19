#!/bin/sh
# evals/fixtures/node-plain.sh: a green Node project with one module and one test, for the gap cases to build on.
# Sourced by a case's fixture.sh, which adds its own files and commits once.
set -eu
# One commit of the fixture's own, with a name no project has (finding 96).
fixture_commit() {
  git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "$1"
}
git init -q -b main
cat > package.json <<'EOF'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF
mkdir -p src tests
cat > src/accounts.mjs <<'EOF'
const accounts = new Map();

export function createAccount(id, email) {
  accounts.set(id, { id, email, active: true, createdAt: new Date().toISOString() });
  return accounts.get(id);
}

export function listAccounts() {
  return [...accounts.values()];
}
EOF
cat > tests/accounts.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { createAccount, listAccounts } from "../src/accounts.mjs";

test("an account is created and listed", () => {
  createAccount("a1", "a@example.invalid");
  assert.equal(listAccounts().length, 1);
});
EOF
