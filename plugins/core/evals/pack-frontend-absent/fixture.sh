#!/bin/sh
# evals/pack-frontend-absent/fixture.sh: the same Vue-shaped Node tree with no pack registered and no policy, so no seat is
# planned and no knowledge file is served: the other half of the pair (SP9 Task 10).
set -eu
. "$(dirname "$0")/../fixtures/node-vue.sh"
git add -A
fixture_commit "fixture: vue-shaped node project, no pack"
crew detect > /dev/null
