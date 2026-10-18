#!/bin/sh
# evals/priority-lowered-with-reason/fixture.sh: two projects in workspace w (A at the root, B at peer/b); A accepts change requests, and B has sent it two: one proposed high, one proposed low.
# A's mail.open stays read-only, so each request is queued in A's inbox for the person present: no session is opened, no opener is needed.
set -eu
A_ACCEPT='["question", "notice", "change-request"]'
B_ACCEPT='["question", "notice"]'
B_OPEN="${B_OPEN:-read-only}"
export A_ACCEPT B_ACCEPT B_OPEN
. "$(dirname "$0")/../fixtures/two-projects.sh"
(
  cd peer/b
  crew mail send --to a --type change-request --priority high --subject "newsletter on POST /customers" "Add a newsletter boolean (default false) to the payload the checkout sends to POST /customers; we need it for the next campaign." > /dev/null
  crew mail send --to a --type change-request --priority low --subject "rename the loyalty tiers" "Rename the loyalty_tier values the checkout sends to bronze, silver and gold." > /dev/null
)
git log -1 --oneline
