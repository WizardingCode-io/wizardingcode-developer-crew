#!/bin/sh
# evals/document-entry-opens-item/fixture.sh: the green Node project of node-plain.sh, plus a request written as a document in the repository, with one line nobody can build without asking (SP3).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p docs/requests
cat > docs/requests/newsletter.md <<'REQUEST'
# Newsletter flag on accounts

Marketing wants to know which accounts receive the newsletter.

- Each account carries a `newsletter` boolean; `createAccount` takes it as a third argument, `false` when not given.
- `listAccounts()` keeps returning every account, each with its `newsletter` value.
- Accounts that already exist get the value marketing decided.
REQUEST
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: document-entry-opens-item"
git log -1 --oneline
