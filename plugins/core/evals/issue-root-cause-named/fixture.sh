#!/bin/sh
# evals/issue-root-cause-named/fixture.sh: the green Node project of node-plain.sh, committed; then an item the installed crew built and proved on the fast route (a chore: the one kind the fast route takes besides a fix) (deactivateAccount, with listAccounts left returning every account: the bug this case reports), committed with its records, so that the analysis has two commits and one item to name (SP3).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
git add -A
fixture_commit "fixture: accounts"
ID=$(crew start "Add deactivateAccount to the accounts module" --answers '{"work_type":"chore","is_vague":0,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "deactivateAccount(id) marks the account inactive" --json | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d;}).on("end",()=>{process.stdout.write(JSON.parse(s).id);});')
cat > tests/deactivate.test.mjs <<'DEACTIVATE'
import test from "node:test";
import assert from "node:assert/strict";
import { createAccount, deactivateAccount } from "../src/accounts.mjs";

test("a deactivated account is marked inactive", () => {
  createAccount("d1", "d@example.invalid");
  assert.equal(deactivateAccount("d1").active, false);
});
DEACTIVATE
crew tdd red "$ID" AC-1 -- "node --test tests/deactivate.test.mjs" > /dev/null
cat >> src/accounts.mjs <<'CODE'

export function deactivateAccount(id) {
  const account = accounts.get(id);
  account.active = false;
  return account;
}
CODE
crew tdd green "$ID" AC-1 -- "node --test tests/deactivate.test.mjs" > /dev/null
crew task "$ID" note T-1 --criteria AC-1 --scope src/accounts.mjs --text "deactivateAccount marks the account inactive" > /dev/null
for role in review-code-quality review-test-quality; do
  printf '{"agent_type":"wizardingcode-developer-crew:%s","agent_id":"%s-1","last_assistant_message":"## Findings\\nnone\\n\\n## Not answerable\\nnone\\n"}' "$role" "$role" | crew hook subagent-stop > /dev/null
done
crew gate run "$ID" > /dev/null
git add -A
fixture_commit "deactivation: deactivateAccount added; listAccounts unchanged"
git log -1 --oneline
