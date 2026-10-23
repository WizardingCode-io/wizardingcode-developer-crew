#!/bin/sh
# evals/cto-report-from-records/fixture.sh: the two-project workspace w of two-projects.sh with records: in a one chore proven and learned (K-1 its solution, K-2 the stack preference of w), in b two chores proven and learned (K-3 the first's solution; the second cites [K:K-1] in its spec, so its learn confirms K-1), and K-3 contradicted from a. The session runs the CTO's review of w: the inputs from the records and the base, the plan filed and entered (SP7 §6.5, SP4). The chores stay away from the router's risk paths (checkout, session), so the fast route proves them.
set -eu
. "$(dirname "$0")/../fixtures/two-projects.sh"
ANSWERS='{"work_type":"chore","is_vague":0,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
read_id() {
  node -e 'let s="";process.stdin.on("data",(d)=>{s+=d;}).on("end",()=>{process.stdout.write(JSON.parse(s).id);});'
}
# One commit of the fixture's own, with a name no project has (finding 96); two-projects.sh commits inline and defines no helper.
. "$(dirname "$0")/../fixtures/commit.sh"
# a: a greeting for the banner, proven and learned.
A_ID=$(crew start "Add a greeting for the storefront banner" --answers "$ANSWERS" --criterion "greeting(name) returns the banner's greeting for the name" --json | read_id)
cat > tests/greeting.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { greeting } from "../src/greeting.mjs";

test("the banner greets by name", () => {
  assert.equal(greeting("Ana"), "Welcome back, Ana");
});
EOF
crew tdd red "$A_ID" AC-1 -- "node --test tests/greeting.test.mjs" > /dev/null
cat > src/greeting.mjs <<'EOF'
export function greeting(name) {
  return `Welcome back, ${name}`;
}
EOF
crew tdd green "$A_ID" AC-1 -- "node --test tests/greeting.test.mjs" > /dev/null
crew gate run "$A_ID" > /dev/null
crew phase "$A_ID" next > /dev/null
crew learn "$A_ID" > /dev/null
git add -A
fixture_commit "greeting: the banner greets by name, proven and learned"
(
  cd peer/b
  mkdir -p tests
  # b, first chore: a lookup by email, proven and learned (K-3).
  ID=$(crew start "Add a lookup of a customer by email" --answers "$ANSWERS" --criterion "findCustomer(email) returns the created customer" --json | read_id)
  cat > tests/find.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { createCustomer, findCustomer } from "../src/customers.mjs";

test("a created customer is found by email", () => {
  createCustomer({ email: "f@example.invalid" });
  assert.equal(findCustomer("f@example.invalid")?.email, "f@example.invalid");
});
EOF
  crew tdd red "$ID" AC-1 -- "node --test tests/find.test.mjs" > /dev/null
  cat > src/customers.mjs <<'EOF'
// POST /customers. Accepted fields: email (required), name, loyalty_tier (one of "none", "silver", "gold"; default "none").
const customers = new Map();

export function createCustomer(body) {
  const tier = body.loyalty_tier ?? "none";
  if (!["none", "silver", "gold"].includes(tier)) throw new Error(`loyalty_tier must be none, silver or gold, not ${tier}`);
  const customer = { id: `c${customers.size + 1}`, email: body.email, name: body.name ?? null, loyalty_tier: tier };
  customers.set(customer.email, customer);
  return customer;
}

export function findCustomer(email) {
  return customers.get(email) ?? null;
}
EOF
  crew tdd green "$ID" AC-1 -- "node --test tests/find.test.mjs" > /dev/null
  crew gate run "$ID" > /dev/null
  crew phase "$ID" next > /dev/null
  crew learn "$ID" > /dev/null
  git add -A
  fixture_commit "customers: findCustomer, proven and learned"
  # b, second chore: the phone kept, its spec citing a's solution, so the learn confirms K-1.
  ID=$(crew start "Keep the customer's phone" --answers "$ANSWERS" --criterion "createCustomer keeps the phone" --json | read_id)
  cat > ".crew/work/$ID/spec.md" <<'EOF'
# Keep the customer's phone

## Acceptance criteria

- AC-1: createCustomer keeps the phone the storefront sends, as the banner's greeting reads the name the same way [K:K-1].
EOF
  cat > tests/phone.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { createCustomer } from "../src/customers.mjs";

test("the phone is kept", () => {
  assert.equal(createCustomer({ email: "p@example.invalid", phone: "p" }).phone, "p");
});
EOF
  crew tdd red "$ID" AC-1 -- "node --test tests/phone.test.mjs" > /dev/null
  node -e '
const fs = require("node:fs");
const p = "src/customers.mjs";
fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace("loyalty_tier: tier };", "loyalty_tier: tier, phone: body.phone ?? null };"));
'
  crew tdd green "$ID" AC-1 -- "node --test tests/phone.test.mjs" > /dev/null
  crew gate run "$ID" > /dev/null
  crew phase "$ID" next > /dev/null
  crew learn "$ID" > /dev/null
  git add -A
  fixture_commit "customers: the phone kept, proven and learned"
)
# a disputes b's lookup: the framework's query replaced it.
crew knowledge contradict K-3 --reason "findCustomer was replaced by the framework's query" --item "$A_ID" > /dev/null
crew knowledge list
crew metrics --workspace w | head -2
git log -1 --oneline
