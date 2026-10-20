#!/bin/sh
# evals/root-cause-not-repeated/fixture.sh: the green Node project of node-plain.sh in workspace acme; a fix carried through the fast route to learn (the analysis, the regression test red then green, the gates, crew learn), so the base holds its validated solution, its root cause on src/accounts.mjs and the stack preference; then a refactor commits listAccounts rewritten without the filter and drops the regression test with it: the same defect is back, and the base knows its cause (rule 17, SP4).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p .crew
printf '{ "mail": { "workspace": "acme", "name": "shop" } }\n' > .crew/policy.json
cat >> src/accounts.mjs <<'EOF'

export function deactivateAccount(id) {
  const account = accounts.get(id);
  account.active = false;
  return account;
}
EOF
git add -A
fixture_commit "fixture: accounts with deactivateAccount"
crew detect > /dev/null
ID=$(crew start "listAccounts returns deactivated accounts" --answers '{"work_type":"fix","is_vague":0,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "listAccounts returns active accounts only" --preserve "the existing tests stay green" --json | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d;}).on("end",()=>{process.stdout.write(JSON.parse(s).id);});')
crew analyse "$ID" --paths src/accounts.mjs > /dev/null
cat > ".crew/work/$ID/analysis.md" <<'EOF'
# Analysis

## Origin

The accounts module as the fixture committed it: deactivateAccount was added beside listAccounts, which kept returning every account the map holds.

## Cause

deactivateAccount only flips the active flag and listAccounts never filters on it, so a deactivated account is still listed.

## Blast radius

Every reader of listAccounts; the existing test counts one created account and stays green with the filter.
EOF
crew phase "$ID" next > /dev/null
crew tdd before "$ID" AC-2 -- "node --test" > /dev/null
cat > tests/active.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { createAccount, deactivateAccount, listAccounts } from "../src/accounts.mjs";

test("a deactivated account is not listed", () => {
  createAccount("x1", "x@example.invalid");
  deactivateAccount("x1");
  assert.equal(listAccounts().some((a) => a.id === "x1"), false);
});
EOF
crew tdd red "$ID" AC-1 -- "node --test tests/active.test.mjs" > /dev/null
cat > src/accounts.mjs <<'EOF'
const accounts = new Map();

export function createAccount(id, email) {
  accounts.set(id, { id, email, active: true, createdAt: new Date().toISOString() });
  return accounts.get(id);
}

export function listAccounts() {
  return [...accounts.values()].filter((a) => a.active);
}

export function deactivateAccount(id) {
  const account = accounts.get(id);
  account.active = false;
  return account;
}
EOF
crew tdd green "$ID" AC-1 -- "node --test tests/active.test.mjs" > /dev/null
crew tdd after "$ID" AC-2 -- "node --test" > /dev/null
crew gate run "$ID" > /dev/null
crew phase "$ID" next > /dev/null
crew learn "$ID" > /dev/null
git add -A
fixture_commit "fix: listAccounts filters active accounts, proven and learned"
# The regression: a refactor rewrites listAccounts without the filter and drops the test with it.
cat > src/accounts.mjs <<'EOF'
const accounts = new Map();

export function createAccount(id, email) {
  accounts.set(id, { id, email, active: true, createdAt: new Date().toISOString() });
  return accounts.get(id);
}

export function listAccounts() {
  return Array.from(accounts.values());
}

export function deactivateAccount(id) {
  const account = accounts.get(id);
  account.active = false;
  return account;
}
EOF
git rm -q tests/active.test.mjs
git add -A
fixture_commit "refactor: listAccounts rewritten with Array.from; the stale test removed"
crew knowledge list
git log -1 --oneline
