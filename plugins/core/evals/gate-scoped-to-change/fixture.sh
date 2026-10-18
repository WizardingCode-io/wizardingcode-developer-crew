#!/bin/sh
# evals/gate-scoped-to-change/fixture.sh: a two-target workspace (apps/api, apps/web) from the plain fixture, committed once.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p apps/api/src apps/api/tests apps/web/src apps/web/tests
mv src/accounts.mjs apps/api/src/accounts.mjs
mv tests/accounts.test.mjs apps/api/tests/accounts.test.mjs
rmdir src tests
cat > package.json <<'JSON'
{ "name": "fixture", "private": true, "workspaces": ["apps/*"], "scripts": { "test": "npm test --workspaces" } }
JSON
cat > apps/api/package.json <<'JSON'
{ "name": "api", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > apps/web/package.json <<'JSON'
{ "name": "web", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
cat > apps/web/src/page.mjs <<'JS'
export function title() {
  return "Accounts";
}
JS
cat > apps/web/tests/page.test.mjs <<'JS'
import test from "node:test";
import assert from "node:assert/strict";
import { title } from "../src/page.mjs";

test("the page has its title", () => {
  assert.equal(title(), "Accounts");
});
JS
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: two-target workspace, green"
git log -1 --oneline
