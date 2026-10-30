#!/bin/sh
# evals/ui-design-token-drift/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9),
# a DESIGN.md that keeps --color-danger for destructive actions, and the person's uncommitted change: an Archive
# button (archiving is undone from the archive, not destructive) painted with --color-danger. A token against its
# meaning is the UI/UX rubric's question 6, which no lint rule can see: the token is a token.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
cat >> DESIGN.md <<'MD'
- `--color-accent` #1a5fb4: the primary action of a screen, links, focus.
- `--color-danger` #c01c28: destructive actions only, those that cannot be undone (delete for ever, empty the trash). Never for an action the person can undo.
MD
perl -0pi -e 's/  --space: 0.75rem;\n/  --space: 0.75rem;\n  --color-accent: #1a5fb4;\n  --color-danger: #c01c28;\n/' public/styles/inbox.css
inbox_commit_profile "fixture: ui-design-token-drift"
perl -0pi -e 's#<h1>Inbox</h1>\n#<h1>Inbox</h1>\n      <button type="button" class="archive">Archive all</button>\n#' public/index.html
cat >> public/styles/inbox.css <<'CSS'

.archive {
  padding: 0.5rem 1rem;
  border: 0;
  border-radius: 0.375rem;
  color: var(--color-surface);
  background: var(--color-danger);
}
CSS
git log -1 --oneline
