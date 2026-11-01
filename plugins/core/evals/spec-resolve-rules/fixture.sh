#!/bin/sh
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
git add -A
fixture_commit "fixture: node project"
crew detect > /dev/null
