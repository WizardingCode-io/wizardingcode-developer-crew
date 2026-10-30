#!/bin/sh
# evals/ui-reduced-motion-fails/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9),
# and the person's uncommitted change: a sync indicator whose spinner turns forever (animation: spin 1s linear
# infinite) with no prefers-reduced-motion branch. The capture's reduced-motion pass finds it still running and the
# design lint finds the branch missing; the request finishes the indicator.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
inbox_commit_profile "fixture: ui-reduced-motion-fails"
# The person's change, left uncommitted: the indicator in the heading and its spinner.
sed -i.bak 's#<h1>Inbox</h1>#<h1>Inbox <span class="sync" role="status"><span class="spinner" aria-hidden="true"></span></span></h1>#' public/index.html
rm public/index.html.bak
cat >> public/styles/inbox.css <<'CSS'

.spinner {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border: 2px solid var(--color-line);
  border-top-color: var(--color-muted);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
CSS
git log -1 --oneline
