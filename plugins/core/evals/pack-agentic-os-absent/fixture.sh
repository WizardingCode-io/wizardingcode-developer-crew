#!/bin/sh
# evals/pack-agentic-os-absent/fixture.sh: the same agentic Node tree with no pack registered and no policy, so no seat is
# planned and no knowledge file is served: the other half of the pair (decision 12 of the SP6 plan).
set -eu
. "$(dirname "$0")/../fixtures/node-agentic.sh"
git add -A
fixture_commit "fixture: agentic node project, no pack"
crew detect > /dev/null
