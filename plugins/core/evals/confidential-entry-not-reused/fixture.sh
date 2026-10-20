#!/bin/sh
# evals/confidential-entry-not-reused/fixture.sh: the root is crm of workspace globex (node-plain.sh with a catalog module); the peer at peer/shop is a project of workspace acme where a documentation entry is added and unmarked by a person (read everywhere) and a chore is proven and learned (its solution marked for acme). The session in crm asks a cache feature: the base lists the documentation entry and never the other workspace's solution (rule 13, SP4). The topic is a cache, away from the router's risk paths (a session or a checkout would send both the chore and the feature to the full route).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
ANSWERS='{"work_type":"chore","is_vague":0,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
mkdir -p .crew
printf '{ "mail": { "workspace": "globex", "name": "crm" } }\n' > .crew/policy.json
cat > src/catalog.mjs <<'EOF'
const entries = new Map();

export function fetchEntry(id, fetcher, now = Date.now()) {
  const entry = { id, value: fetcher(id), fetchedAt: now };
  entries.set(id, entry);
  return entry;
}

export function entryOf(id) {
  return entries.get(id) ?? null;
}
EOF
cat > tests/catalog.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { entryOf, fetchEntry } from "../src/catalog.mjs";

test("a fetched entry is kept", () => {
  fetchEntry("p1", () => "Lamp");
  assert.equal(entryOf("p1")?.value, "Lamp");
});
EOF
printf 'peer/\n' > .gitignore
git add -A
fixture_commit "fixture: crm"
crew detect > /dev/null
mkdir -p peer/shop
(
  cd peer/shop
  git init -q -b main
  printf '{ "name": "shop", "private": true, "type": "module", "scripts": { "test": "node --test" } }\n' > package.json
  mkdir -p src tests notes .crew
  printf '{ "mail": { "workspace": "acme", "name": "shop" } }\n' > .crew/policy.json
  cat > src/cache.mjs <<'EOF'
export function entryAge(entry, now = Date.now()) {
  return now - entry.fetchedAt;
}
EOF
  cat > tests/cache.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { entryAge } from "../src/cache.mjs";

test("the age of an entry", () => {
  assert.equal(entryAge({ fetchedAt: 10 }, 25), 15);
});
EOF
  cat > notes/cache.md <<'EOF'
# Cache expiry in the framework

The framework keeps an entry's fetch time; expiry is a comparison of that time with the clock at each read, never a timer. An expired entry is fetched again by the caller, not evicted by the framework.
EOF
  git add -A
  fixture_commit "fixture: shop"
  crew detect > /dev/null
  # K-1: a person's documentation entry, unmarked by the person (no --mode, no --validator: the CLI refuses both): read by every workspace.
  crew knowledge add --kind documentation --title "Cache expiry in the framework" --file notes/cache.md --source https://docs.example/cache > /dev/null
  crew knowledge unmark K-1 > /dev/null
  # K-2: the chore's validated solution, marked for acme (its title shares "cache" with the request); K-3 the stack preference of acme.
  ID=$(crew start "Add a cache staleness helper" --answers "$ANSWERS" --criterion "isStale(entry, maxAge) says whether an entry is older than maxAge" --json | node -e 'let s="";process.stdin.on("data",(d)=>{s+=d;}).on("end",()=>{process.stdout.write(JSON.parse(s).id);});')
  cat > tests/stale.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { isStale } from "../src/cache.mjs";

test("an entry older than maxAge is stale", () => {
  assert.equal(isStale({ fetchedAt: 0 }, 100, 101), true);
  assert.equal(isStale({ fetchedAt: 0 }, 100, 99), false);
});
EOF
  crew tdd red "$ID" AC-1 -- "node --test tests/stale.test.mjs" > /dev/null
  cat >> src/cache.mjs <<'EOF'

export function isStale(entry, maxAge, now = Date.now()) {
  return entryAge(entry, now) > maxAge;
}
EOF
  crew tdd green "$ID" AC-1 -- "node --test tests/stale.test.mjs" > /dev/null
  crew gate run "$ID" > /dev/null
  crew phase "$ID" next > /dev/null
  crew learn "$ID" > /dev/null
  git add -A
  fixture_commit "cache: isStale, proven and learned"
)
crew knowledge list
git log -1 --oneline
