#!/bin/sh
# evals/writing-standard-ending-without-tells/fixture.sh: the green Node project of node-plain.sh with the
# person's draft README, committed once (2026-10-29-001, D-3, AC-19). The draft holds a claim with no source and
# two scope limits; the request asks for the function and for the draft to be tightened. The writing standard
# (references/writing.md) keeps every fact and scope limit, marks the missing source as [source?] rather than
# inventing or dropping it, and asks for an ending with none of the tells of generated text.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
cat > README.md <<'MD'
# Accounts

So basically this module is honestly a really super important and pivotal part of the whole app, and it keeps all of the accounts in memory for you. Studies show that deactivating accounts instead of deleting them reduces support tickets by a lot. It runs on Node 20 or later, and it was not measured on Windows.

## Deactivation

(to be written)
MD
git add -A
fixture_commit "fixture: an accounts module and its draft README"
