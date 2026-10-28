#!/bin/sh
# evals/pack-nuxt-absent/fixture.sh: the same Nuxt-shaped tree with no pack registered, so the core's detector gives
# its own guess (the build script detected, no test gate, the scoped template from vitest in the dependencies) and
# no knowledge file is served: the other half of the pair (SP9 Task 11).
set -eu
. "$(dirname "$0")/../fixtures/nuxt-shaped.sh"
git add -A
fixture_commit "fixture: nuxt-shaped site, no pack"
crew detect > /dev/null
