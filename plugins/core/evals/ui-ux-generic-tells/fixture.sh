#!/bin/sh
# evals/ui-ux-generic-tells/fixture.sh: the inbox page with the browser of playwright-page.sh (SP9 Task 14, design §9),
# turned into an overview whose sections all share one layout: an eyebrow, a title and a description stacked above
# every block, and three equal-weight cards repeated. The request adds one more section in the same shape. The UI/UX
# rubric's question 11 (item 2026-10-29-001, D-3) reads the captures for these tells; the rubric before 3a5e8cb has
# no such question (the red), the current one has (the green).
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
. "$(dirname "$0")/../fixtures/playwright-page.sh"
. "$(dirname "$0")/../fixtures/flag-env.sh"
. "$(dirname "$0")/../fixtures/inbox-page.sh"
cat > public/index.html <<'HTML'
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
      <section class="block">
        <p class="eyebrow">Overview</p>
        <h2>Today</h2>
        <p class="lede">Everything that reached you today, in one place.</p>
        <div class="cards">
          <article class="card"><h3>Unread</h3><p>3 messages</p></article>
          <article class="card"><h3>Flagged</h3><p>1 message</p></article>
          <article class="card"><h3>Mentions</h3><p>2 messages</p></article>
        </div>
      </section>
      <section class="block">
        <p class="eyebrow">People</p>
        <h2>Senders</h2>
        <p class="lede">The people who write to you the most, at a glance.</p>
        <div class="cards">
          <article class="card"><h3>Ana</h3><p>12 messages</p></article>
          <article class="card"><h3>Rui</h3><p>9 messages</p></article>
          <article class="card"><h3>Marta</h3><p>7 messages</p></article>
        </div>
      </section>
      <section class="block">
        <p class="eyebrow">Labels</p>
        <h2>Topics</h2>
        <p class="lede">Your messages sorted by what they are about.</p>
        <div class="cards">
          <article class="card"><h3>Finance</h3><p>4 messages</p></article>
          <article class="card"><h3>Rooms</h3><p>2 messages</p></article>
          <article class="card"><h3>Releases</h3><p>5 messages</p></article>
        </div>
      </section>
      <ul class="rows" aria-label="Messages"></ul>
    </main>
    <script src="messages.js"></script>
    <script src="inbox.js"></script>
  </body>
</html>
HTML
cat >> public/styles/inbox.css <<'CSS'

.block {
  margin-block: 2rem;
}

.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--color-muted);
}

.lede {
  color: var(--color-muted);
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--space);
}

.card {
  padding: var(--space);
  border: 1px solid var(--color-line);
  border-radius: 0.5rem;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}
CSS
inbox_commit_profile "fixture: ui-ux-generic-tells"
git log -1 --oneline
