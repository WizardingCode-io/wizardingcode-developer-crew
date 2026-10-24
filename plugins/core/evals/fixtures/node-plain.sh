#!/bin/sh
# evals/fixtures/node-plain.sh: a green Node project with one module and one test, for the gap cases to build on.
# Sourced by a case's fixture.sh, which adds its own files and commits once.
set -eu
# One commit of the fixture's own, with a name no project has (finding 96).
. "$(dirname "$0")/../fixtures/commit.sh"
git init -q -b main
cat > package.json <<'EOF'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF
mkdir -p src tests
# The accounts module. A case that sets AUDIT_HOOK=1 before sourcing this file (only
# rounds-bounded, whose fixture also writes src/audit.mjs; a test holds that no other case sets it)
# gets createAccount recording its event through audit (finding 151's seed).
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
if [ "${AUDIT_HOOK:-}" = 1 ]; then
  cat > src/accounts.mjs <<'EOF'
import { audit } from "./audit.mjs";

const accounts = new Map();

export function createAccount(id, email) {
  accounts.set(id, { id, email, active: true, createdAt: new Date().toISOString() });
  audit("account.created", accounts.get(id));
  return accounts.get(id);
}

export function listAccounts() {
  return [...accounts.values()];
}
EOF
fi
cat > tests/accounts.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { createAccount, listAccounts } from "../src/accounts.mjs";

test("an account is created and listed", () => {
  createAccount("a1", "a@example.invalid");
  assert.equal(listAccounts().length, 1);
});
EOF
