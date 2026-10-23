#!/bin/sh
# evals/personalities-differ/fixture.sh: the plain Node project, committed once.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
git add -A
fixture_commit "fixture: node project, green"
git log -1 --oneline
