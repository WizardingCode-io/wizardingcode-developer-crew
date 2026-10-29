#!/bin/sh
# evals/pack-laravel-blade-tags-the-view-absent/fixture.sh: the same Laravel Blade-shaped tree with no pack registered, so
# the core's detector gives its own guess (no test gate, no e2e gate, pint and phpstan detected), no tag, no screen
# checklist and no knowledge file: the other half of the pair (SP9 Task 13).
set -eu
. "$(dirname "$0")/../fixtures/laravel-blade-shaped.sh"
git add -A
fixture_commit "fixture: laravel-shaped shop with its views, no pack"
# The person's standing grant of the leads' rounds past the cap (finding 197): the run is unattended, and
# this repository's own policy carries the grant; both halves of the pair carry it, so the pair measures the pack alone.
crew policy set team.continuations granted > /dev/null
crew detect > /dev/null
