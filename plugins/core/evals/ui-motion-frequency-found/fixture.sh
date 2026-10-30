#!/bin/sh
# evals/ui-motion-frequency-found/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9),
# a DESIGN.md and the person's uncommitted change: a row hover that eases its background over 300 ms, lint-clean
# (under 500 ms, ease-out, the hover guarded, a reduced-motion branch). A row is opened a hundred times a day and
# more: the standard's first frequency row allows no animation or feedback at 120 ms, so the UI/UX reviewer's
# question 9 finds it, which no lint rule can.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
cat >> DESIGN.md <<'MD'

## Use

The inbox is the product's main screen: a person opens a row a hundred times a day and more. A hovered row's background is `--color-line`.
MD
inbox_commit_profile "fixture: ui-motion-frequency-found"
cat >> public/styles/inbox.css <<'CSS'

.row {
  transition: background-color 300ms ease-out;
}

@media (hover: hover) {
  .row:hover {
    background-color: var(--color-line);
  }
}

@media (prefers-reduced-motion: reduce) {
  .row {
    transition: none;
  }
}
CSS
git log -1 --oneline
