#!/bin/sh
# evals/mail-refused-by-policy/fixture.sh: two projects in workspace w (A at the root, B at peer/b), B accepting ["question"].
set -eu
B_ACCEPT='["question"]'
B_OPEN="${B_OPEN:-read-only}"
export B_ACCEPT B_OPEN
. "$(dirname "$0")/../fixtures/two-projects.sh"
git log -1 --oneline
