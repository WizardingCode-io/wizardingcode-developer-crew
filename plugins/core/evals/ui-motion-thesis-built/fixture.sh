#!/bin/sh
# evals/ui-motion-thesis-built/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9).
# The request adds a motion when a message arrives; with the plugin the motion has its line in spec.md's thesis, a
# motion sample in the e2e spec (captureMotion) and a reduced-motion branch. Both arms run.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
inbox_commit_profile "fixture: ui-motion-thesis-built"
git log -1 --oneline
