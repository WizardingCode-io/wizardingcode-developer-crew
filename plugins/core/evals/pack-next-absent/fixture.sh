#!/bin/sh
# evals/pack-next-absent/fixture.sh: the same Next-shaped tree with no pack registered, so the core's detector gives
# its own guess (the build script detected, no test gate, the scoped template from vitest in the dependencies) and
# no knowledge file is served: the other half of the pair (SP9 Task 12).
set -eu
. "$(dirname "$0")/../fixtures/next-shaped.sh"
git add -A
fixture_commit "fixture: next-shaped site, no pack"
crew detect > /dev/null
