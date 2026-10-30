#!/bin/sh
# evals/ui-captures-by-fixture/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9).
# The request adds an empty state whose two screens the criterion declares; the e2e spec captures inbox:default,
# the session adds inbox:empty. The first interface change that ends proven in the sandbox.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
inbox_commit_profile "fixture: ui-captures-by-fixture"
git log -1 --oneline
