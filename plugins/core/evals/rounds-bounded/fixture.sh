#!/bin/sh
# evals/rounds-bounded/fixture.sh: the plain Node project with a policy that allows one judgement round, committed once.
# The cap only tightens the default of 2: it weakens no rule.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p .crew
cat > .crew/policy.json <<'JSON'
{ "team": { "maxJudgementRounds": 1 } }
JSON
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: node project, one judgement round"
git log -1 --oneline
