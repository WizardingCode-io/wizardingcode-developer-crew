#!/bin/sh
# evals/personalities-differ/fixture.sh: the plain Node project, committed once, with the policy of a
# user who leaves the run unattended: the prompt's "take these as my decisions" is that user's word,
# so a decision the agent records with --mode counts (ADR 0005, finding 62: under the default
# "wait" the run stopped at D-1 before its final message could report the debate).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p .crew
cat > .crew/policy.json <<'JSON'
{ "unattendedDecisions": "count" }
JSON
git add -A
fixture_commit "fixture: node project, green"
git log -1 --oneline
