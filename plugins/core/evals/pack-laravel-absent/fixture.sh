#!/bin/sh
# evals/pack-laravel-absent/fixture.sh: the same Laravel-shaped tree with no pack registered, so the core's detector gives
# its own guess (no test gate, pint and phpstan detected) and no knowledge file is served: the other half of
# the pair (decision 12 of the SP6 plan).
set -eu
. "$(dirname "$0")/../fixtures/laravel-shaped.sh"
git add -A
fixture_commit "fixture: laravel-shaped shop, no pack"
crew detect > /dev/null
