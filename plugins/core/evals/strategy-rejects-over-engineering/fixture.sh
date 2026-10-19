#!/bin/sh
# evals/strategy-rejects-over-engineering/fixture.sh: an empty project with a README naming the request's context (SP8): a new product gets a strategy before its spec.
set -eu
fixture_commit() {
  git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "$1"
}
git init -q -b main
cat > README.md <<'README'
# Household finance

A personal finance app for one household: income, expenses, monthly budgets and a report per month. One family uses it; nothing is shared with anyone else.
README
git add -A
fixture_commit "fixture: household finance, an empty project"
git log -1 --oneline
