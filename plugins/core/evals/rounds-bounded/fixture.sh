#!/bin/sh
# evals/rounds-bounded/fixture.sh: the plain Node project with a policy that allows one judgement
# round, and an item already through it: deactivateAccount proven test-first, its gates ruled at
# round 1, code-quality and security not proven for a defect left in the code (a debug line that
# prints the account's email, which also gives the item the personal-data area and the security
# review, finding 149's engine fix). The session fixes it; the next record is a second round, which the engine
# refuses under the policy (finding 149: no reviewer can be made to find a defect, so the first
# round's defect is the fixture's, recorded as the engine records any ruling). The cap only tightens
# the default of 2: it weakens no rule.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p .crew
cat > .crew/policy.json <<'JSON'
{ "team": { "maxJudgementRounds": 1 } }
JSON
git add -A
fixture_commit "fixture: node project, one judgement round"
crew detect > /dev/null
ANSWERS='{"work_type":"chore","is_vague":0,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
ID=$(crew start "Add deactivateAccount(id) to src/accounts.mjs" --answers "$ANSWERS" --criterion "deactivateAccount(id) sets active to false and returns the account; an unknown id returns undefined" --json | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d;}).on("end",()=>{process.stdout.write(JSON.parse(s).id);});')
cat > tests/deactivate.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { createAccount, deactivateAccount } from "../src/accounts.mjs";

test("deactivating an account sets active to false and returns it; an unknown id returns undefined", () => {
  createAccount("d1", "d@example.invalid");
  const account = deactivateAccount("d1");
  assert.equal(account.active, false);
  assert.equal(deactivateAccount("missing"), undefined);
});
EOF
crew tdd red "$ID" AC-1 -- "node --test tests/deactivate.test.mjs" > /dev/null
cat >> src/accounts.mjs <<'EOF'

export function deactivateAccount(id) {
  const account = accounts.get(id);
  if (!account) return undefined;
  console.log(`deactivating ${account.email}`);
  account.active = false;
  return account;
}
EOF
crew tdd green "$ID" AC-1 -- "node --test tests/deactivate.test.mjs" > /dev/null
crew gate run "$ID" > /dev/null || true
REVIEW=".crew/work/$ID/review"
LINE=$(grep -n 'console.log(`deactivating' src/accounts.mjs | cut -d: -f1)
cat > "$REVIEW/code-quality.findings.md" <<EOF
# code-quality findings for $ID
reviewer: review-code-quality
read: 1 file, 1 hunk

## Findings
- F-1 · defect · src/accounts.mjs:$LINE · a debug line left in deactivateAccount prints the account's email to the console on every call; nothing in the request asks for it, and it writes personal data to the output.

## Outside the change
none

## Not answerable
none
EOF
cat > "$REVIEW/ruling.json" <<EOF
{"rulings":[{"gate":"code-quality","verdict":"not-proven","reviewer":"review-code-quality","judge":"judge","findings":[{"file":"src/accounts.mjs","line":$LINE,"text":"Upheld as a defect: the debug line prints the account's email on every call; remove it.","severity":"defect"}]},{"gate":"test-quality","verdict":"proven","reviewer":"review-test-quality","judge":"judge","findings":[]},{"gate":"security","verdict":"not-proven","reviewer":"review-security","judge":"judge","findings":[{"file":"src/accounts.mjs","line":$LINE,"text":"Upheld as a defect: the account's email is written to the console, personal data in the output with no reason.","severity":"defect"}]}]}
EOF
# A ruling that is not proven exits 1; the record is checked, so a refusal still stops the fixture.
crew judgement "$ID" record --ruling "$REVIEW/ruling.json" > /dev/null ||
  crew status "$ID" | grep -q "judgement gate code-quality not proven"
git add -A
fixture_commit "deactivateAccount: proven test-first, code-quality not proven at round 1"
git log -1 --oneline
