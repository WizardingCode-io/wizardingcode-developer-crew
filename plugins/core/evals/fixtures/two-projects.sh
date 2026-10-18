#!/bin/sh
# evals/fixtures/two-projects.sh: A at the root and B at peer/b, both in workspace w, both registered.
# The case sets B_ACCEPT (a JSON list) and B_OPEN (read-only|branch) before sourcing this file, and, since
# SP7b, A_ACCEPT (a JSON list) and A_UNATTENDED (wait|count|validator); the defaults are the engine's own.
set -eu
A_ACCEPT="${A_ACCEPT:-[\"question\", \"notice\"]}"
A_UNATTENDED="${A_UNATTENDED:-wait}"
B_ACCEPT="${B_ACCEPT:-[\"question\", \"notice\"]}"
B_OPEN="${B_OPEN:-read-only}"
git init -q -b main
cat > package.json <<'EOF'
{ "name": "a", "private": true, "type": "module", "scripts": { "test": "node --test" } }
EOF
mkdir -p src tests .crew peer
printf '{ "mail": { "workspace": "w", "name": "a", "worktrees": ".crew/worktrees", "accept": %s }, "unattendedDecisions": "%s" }\n' "$A_ACCEPT" "$A_UNATTENDED" > .crew/policy.json
cat > src/checkout.mjs <<'EOF'
// The storefront's checkout. The CRM (peer/b) owns POST /customers; its fields are not documented here.
export function customerPayload(customer) {
  return { email: customer.email, name: customer.name };
}
EOF
cat > tests/checkout.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { customerPayload } from "../src/checkout.mjs";

test("the payload carries email and name", () => {
  assert.deepEqual(customerPayload({ email: "e", name: "n" }), { email: "e", name: "n" });
});
EOF
printf 'peer/\n' > .gitignore
(
  cd peer && mkdir b && cd b
  git init -q -b main
  printf '{ "name": "b", "private": true, "type": "module", "scripts": { "test": "node --test" } }\n' > package.json
  mkdir -p src .crew
  printf '{ "mail": { "workspace": "w", "name": "b", "accept": %s, "open": "%s" }, "unattendedDecisions": "validator" }\n' "$B_ACCEPT" "$B_OPEN" > .crew/policy.json
  cat > src/customers.mjs <<'EOF'
// POST /customers. Accepted fields: email (required), name, loyalty_tier (one of "none", "silver", "gold"; default "none").
export function createCustomer(body) {
  const tier = body.loyalty_tier ?? "none";
  if (!["none", "silver", "gold"].includes(tier)) throw new Error(`loyalty_tier must be none, silver or gold, not ${tier}`);
  return { id: "c1", email: body.email, name: body.name ?? null, loyalty_tier: tier };
}
EOF
  git add -A
  git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: b"
  crew detect > /dev/null
)
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: a, with b as a peer"
crew detect > /dev/null
