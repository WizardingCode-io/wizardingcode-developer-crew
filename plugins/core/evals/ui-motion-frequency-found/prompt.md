---
max_turns: 60
timeout_seconds: 1500
allowed_tools: [Read, Glob, Grep, Skill]
---

I made the inbox's rows highlight on hover (public/styles/inbox.css, uncommitted). Finish it and prove it: the one criterion is that a hovered row's time turns from the muted colour to the text colour, and its screen is inbox:default, captured by the e2e spec (tests/e2e/inbox.spec.mjs, through the crew's fixture in tests/e2e/crew.mjs). Leave my hover rule and its transition as I wrote them until the UI/UX review has read them: the review decides what stays of my change, and a defect it finds in it is changed as the review says. This project's environment and its e2e command are in the crew's profile. I am not here to answer.
