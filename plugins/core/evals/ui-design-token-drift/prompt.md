---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

I added an "Archive all" button under the inbox's heading (public/index.html and public/styles/inbox.css, uncommitted); archived messages come back from the archive. Make it move every row out of the list when pressed, and prove it: the criterion's screen is inbox:default, captured by the e2e spec (tests/e2e/inbox.spec.mjs, through the crew's fixture in tests/e2e/crew.mjs). Leave my button's colours as I wrote them until the UI/UX review has read them: the review decides what stays of my change, and a defect it finds in it is changed as the review says. This project's environment and its e2e command are in the crew's profile. I am not here to answer.
