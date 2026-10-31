#!/bin/sh
# evals/site-bakery/fixture.sh: an empty site for one client (item 2026-10-30-005): what a person's request for a site gets.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
SITE_ASSETS=bakery
SITE_COMMIT="fixture: site-bakery"
. "$(dirname "$0")/../fixtures/site-project.sh"
git log -1 --oneline
