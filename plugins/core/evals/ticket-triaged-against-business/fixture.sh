#!/bin/sh
# evals/ticket-triaged-against-business/fixture.sh: the green Node project of node-plain.sh, plus the accounts page the ticket names, the project in workspace w, and the business priorities the user signed (SP3).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
cat > src/page.mjs <<'PAGE'
// The accounts page, rendered server-side.
export function renderAccountsPage(accounts) {
  const rows = accounts.map((a) => `<li>${a.email}</li>`).join("");
  return `<h1>Accounts</h1><ul>${rows}</ul><button>Register</button>`;
}
PAGE
cat > tests/page.test.mjs <<'PAGETEST'
import test from "node:test";
import assert from "node:assert/strict";
import { renderAccountsPage } from "../src/page.mjs";

test("the accounts page lists the accounts", () => {
  assert.match(renderAccountsPage([{ email: "a@example.invalid" }]), /<li>a@example\.invalid<\/li>/);
});
PAGETEST
mkdir -p .crew
printf '{ "mail": { "workspace": "w", "name": "a" } }\n' > .crew/policy.json
cat > business-priorities.md <<'PRIORITIES'
# Business priorities

1. The checkout flow: every defect there comes first.
2. The signed launch of the loyalty programme on the 30th: its work is high until the launch.
3. Cosmetic changes (labels, colours, copy) wait for the release freeze to end; they are normal priority at most.
PRIORITIES
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: ticket-triaged-against-business"
crew detect > /dev/null
crew workspace priorities accept --file business-priorities.md > /dev/null
git log -1 --oneline
