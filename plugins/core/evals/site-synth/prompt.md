---
max_turns: 200
timeout_seconds: 3600
allowed_tools: [Read, Glob, Grep, Skill]
---

Build the site of Ondas, a one-person maker of analogue synthesizers in Berlin-Neukölln. Lena Vogt builds 40 units of one instrument a year, the Ondas Eins, a monophonic two-oscillator desk synth at 1,480 euros, in a walnut case from a Brandenburg joiner, each with hand-wired circuit boards and a serial number she engraves. There is a waiting list of about seven months; people join it by email at warteliste@ondas.invalid. Each has a lifetime repair promise. Musicians want to know what it sounds like, how the filter behaves, what it costs and how long the wait is. The visitor should be able to play with the filter on the page. The site is one static page, public/index.html, with its CSS and script beside it under public/, no framework and no build. The client's photographs are in public/assets (public/assets/CREDITS.txt says what each is and its licence; credit them in the footer). This project's environment and its e2e command are in the crew's profile, and tests/e2e/site.spec.mjs captures home:default through the crew's fixture. I am not here to answer, and this project runs with nobody present (the validator takes a decision's stated default): take what the brief leaves open and say what you assumed. Prove it end to end.
