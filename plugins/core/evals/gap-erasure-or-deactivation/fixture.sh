#!/bin/sh
# evals/gap-erasure-or-deactivation/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: gap-erasure-or-deactivation"
git log -1 --oneline
