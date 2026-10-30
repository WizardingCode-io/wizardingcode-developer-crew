#!/bin/sh
# evals/fixtures/inbox-page.sh: the inbox page the ui cases change (SP9 Task 14), sourced after node-plain.sh,
# playwright-page.sh and flag-env.sh. public/index.html lists the messages of public/messages.js as rows, styled by
# public/styles/inbox.css; tests/e2e/inbox.spec.mjs opens it by file:// and captures inbox:default through the
# crew's fixture. inbox_commit_profile commits the case's tree, then sets the profile as the user would (crew
# detect, the standing grant of the leads' rounds, the flag environment, the page's file:// url) and commits that.
. "$(dirname "$0")/../fixtures/commit.sh"
mkdir -p public/styles tests/e2e
cat > public/index.html <<'EOF'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Inbox</title>
    <link rel="stylesheet" href="styles/inbox.css">
  </head>
  <body>
    <main class="inbox">
      <h1>Inbox</h1>
      <ul class="rows" aria-label="Messages"></ul>
    </main>
    <script src="messages.js"></script>
    <script src="inbox.js"></script>
  </body>
</html>
EOF
cat > public/messages.js <<'EOF'
// The messages the inbox shows; a test may set window.inboxMessages before the page loads.
window.inboxMessages = window.inboxMessages ?? [
  { from: "Ana", subject: "Quarterly figures", at: "09:12" },
  { from: "Rui", subject: "Room booking for Thursday", at: "10:40" },
  { from: "Marta", subject: "Draft of the release note", at: "11:05" },
];
EOF
cat > public/inbox.js <<'EOF'
// Renders one row per message into the list.
const list = document.querySelector(".rows");
for (const message of window.inboxMessages) {
  const row = document.createElement("li");
  row.className = "row";
  const from = document.createElement("strong");
  from.textContent = message.from;
  const subject = document.createElement("span");
  subject.textContent = message.subject;
  const at = document.createElement("time");
  at.textContent = message.at;
  row.append(from, subject, at);
  list.append(row);
}
EOF
cat > public/styles/inbox.css <<'EOF'
:root {
  --color-text: #1d1d1f;
  --color-muted: #5f6368;
  --color-surface: #ffffff;
  --color-line: #e3e3e6;
  --space: 0.75rem;
}

body {
  margin: 0;
  font-family: system-ui, sans-serif;
  color: var(--color-text);
  background: var(--color-surface);
}

.inbox {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--space);
}

.rows {
  list-style: none;
  margin: 0;
  padding: 0;
}

.row {
  display: grid;
  grid-template-columns: 8rem 1fr auto;
  gap: var(--space);
  padding: var(--space);
  border-bottom: 1px solid var(--color-line);
}

.row time {
  color: var(--color-muted);
}
EOF
# The project's design contract: without one the frontend lead asks a person for the decision to go without, and no
# person is present in a case. A case with a contract of its own writes it after sourcing this file.
cat > DESIGN.md <<'EOF'
# Inbox design

## Tokens

- `--color-text` #1d1d1f: body text.
- `--color-muted` #5f6368: secondary text, times.
- `--color-surface` #ffffff: the page.
- `--color-line` #e3e3e6: separators.
EOF
cat > tests/e2e/inbox.spec.mjs <<'EOF'
// The inbox end to end: the page by file://, its rows, and the capture the crew's UI/UX gate reads.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { capture, expect, test } from "./crew.mjs";

const inbox = pathToFileURL(resolve("public/index.html")).href;

test("the inbox lists the messages", async ({ page }) => {
  await page.goto(inbox);
  await expect(page.locator(".row")).toHaveCount(3);
  await capture(page, "inbox", "default");
});
EOF

flag_env_write

inbox_commit_profile() {
  git add -A
  fixture_commit "$1"
  # The person's standing grant, as this repository's policy carries it: the leads' rounds past the cap are
  # theirs, and no person is present in a case to give them (finding 197).
  crew policy set team.continuations granted > /dev/null
  crew detect > /dev/null
  flag_env_profile
  crew profile set environment.url "file://$(pwd)/public/index.html" > /dev/null
  git add -A
  fixture_commit "fixture: the environment in the profile"
}
