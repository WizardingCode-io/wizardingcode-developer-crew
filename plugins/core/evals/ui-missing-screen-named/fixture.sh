#!/bin/sh
# evals/ui-missing-screen-named/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9).
# The person's criterion declares inbox:default and inbox:error; the error screen is captured against a staging
# service this checkout cannot reach, so the session must not capture it here: the e2e run names it missing and the
# item ends not proven.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
inbox_commit_profile "fixture: ui-missing-screen-named"
git log -1 --oneline
