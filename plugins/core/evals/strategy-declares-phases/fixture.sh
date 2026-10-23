#!/bin/sh
# evals/strategy-declares-phases/fixture.sh: an empty project with a README naming the request's context (SP8): a new product declares the phases at which its design changes.
set -eu
. "$(dirname "$0")/../fixtures/commit.sh"
git init -q -b main
cat > README.md <<'README'
# Circle

A social network for a club: members, posts, payments between members (dues, shared costs) and real-time messaging. 500 members at launch; the club expects up to 100 000 within two years if other clubs join.
README
git add -A
fixture_commit "fixture: circle, an empty project"
git log -1 --oneline
