---
max_turns: 200
timeout_seconds: 3600
allowed_tools: [Read, Glob, Grep, Skill]
---

Build the site of Ferreira & Sá, a two-partner maritime law firm in Porto, at Rua da Alfândega 12, facing the Douro. They do only ship arrests, cargo claims and salvage. Marta Ferreira was a ship's officer for nine years before law; João Sá clerked at the Lisbon maritime court. They answer the arrest line at any hour, because a ship leaves on the tide: +351 22 000 0000. Their fee for an arrest is fixed in advance. Shipowners and insurers reach them when a vessel has to be held before it sails. Their clients are confidential, so there are no names or logos to show. The site is one static page, public/index.html, with its CSS and script beside it under public/, no framework and no build. The client's photographs are in public/assets (public/assets/CREDITS.txt says what each is and its licence; credit them in the footer). This project's environment and its e2e command are in the crew's profile, and tests/e2e/site.spec.mjs captures home:default through the crew's fixture. I am not here to answer, and this project runs with nobody present (the validator takes a decision's stated default): take what the brief leaves open and say what you assumed. Prove it end to end.
