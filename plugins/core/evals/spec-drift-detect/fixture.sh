#!/bin/sh
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p docs/designs
cat > docs/designs/accounts.md <<'DOC'
# Accounts

Accounts live in `src/accounts.mjs`. `createAccount(id, email)` stores an account with `id`, `email`, `active`, `createdAt` and `tier`. `tier` comes from `pricing.tierFor(email)`. `deleteAccount(id)` removes one and writes to the audit log.
DOC
cat > src/reports.mjs <<'DOC'
export const monthly = () => [];
DOC
git add -A
fixture_commit "fixture: a document and code that differ"
crew detect > /dev/null
