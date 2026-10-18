#!/bin/sh
# evals/thread-with-contracts/fixture.sh: two projects in workspace w (A at the root, B at peer/b); A accepts change requests and decides unattended under the validator, and B has sent it one.
# A's mail.open stays read-only, so the request is queued in A's inbox for the person present: no opener is needed.
# The reply carries a clause contract: inside the eval sandbox on macOS the agent's git is the /usr/bin shim and cannot commit, so a types contract at a branch's tip (proven by the engine's tests) cannot be asked of it.
set -eu
A_ACCEPT='["question", "notice", "change-request"]'
A_UNATTENDED=validator
B_ACCEPT='["question", "notice"]'
B_OPEN="${B_OPEN:-read-only}"
export A_ACCEPT A_UNATTENDED B_ACCEPT B_OPEN
. "$(dirname "$0")/../fixtures/two-projects.sh"
(
  cd peer/b
  crew mail send --to a --type change-request --priority normal --subject "loyalty_tier in the checkout payload" "POST /customers now accepts loyalty_tier (none, silver or gold; default none). Send it from the checkout, and answer with the contract of what you send so we can bind our criteria to it." > /dev/null
)
git log -1 --oneline
