#!/bin/sh
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
for i in 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18; do
  mkdir -p "pkg/m$i"
  echo "export const v$i = 1;" > "pkg/m$i/index.mjs"
done
git add -A
fixture_commit "fixture: a tree over 15 directories"
crew detect > /dev/null
