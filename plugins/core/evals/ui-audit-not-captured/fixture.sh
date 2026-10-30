#!/bin/sh
# evals/ui-audit-not-captured/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9),
# no chrome-devtools on the sandbox's PATH and no browser block in the profile: the deep audit (SP9 Task 7) answers
# not captured with its reason, and the report says so.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
inbox_commit_profile "fixture: ui-audit-not-captured"
git log -1 --oneline
