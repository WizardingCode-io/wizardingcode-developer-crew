#!/bin/sh
# evals/fixtures/site-project.sh: an empty site for the site cases (item 2026-10-30-005), sourced after node-plain.sh,
# playwright-page.sh and flag-env.sh with SITE_ASSETS naming the client's folder of docs/evals/site-assets. The page
# goes to public/index.html; the client's photographs are in public/assets. The e2e spec captures home:default.
. "$(dirname "$0")/../fixtures/commit.sh"
mkdir -p public/assets tests/e2e
cp "$PW_REPO/docs/evals/site-assets/$SITE_ASSETS"/* public/assets/
cat > public/index.html <<'HTML'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Coming soon</title></head><body></body></html>
HTML
cat > tests/e2e/site.spec.mjs <<'SPEC'
import { capture, expect, test } from "./crew.mjs";

test("the home page", async ({ page }) => {
  await page.goto(`file://${process.cwd()}/public/index.html`);
  await expect(page.locator("h1")).toBeVisible();
  await capture(page, "home", "default");
});
SPEC
git add -A
fixture_commit "$SITE_COMMIT"
crew policy set team.continuations granted > /dev/null
# Nobody is present in a case: a decision's stated default is taken by the validator, on the record as the validator's.
crew policy set unattendedDecisions validator > /dev/null
crew detect > /dev/null
flag_env_profile
crew profile set environment.url "file://$(pwd)/public/index.html" > /dev/null
git add -A
fixture_commit "fixture: the environment in the profile"
