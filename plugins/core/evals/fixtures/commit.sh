#!/bin/sh
# evals/fixtures/commit.sh: fixture_commit, the one commit helper of the fixtures (finding 96): a
# commit with a name no project has. Sourced by a case's fixture.sh or by a shared fixture.
fixture_commit() {
  git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "$1"
}
