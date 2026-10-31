---
max_turns: 200
timeout_seconds: 3600
allowed_tools: [Read, Glob, Grep, Skill]
---

Build the site of Forno das Sete Portas, a bakery at Rua das Sete Portas 7 in Lisbon's Alfama. The street is named for seven doors that no longer exist; the bakery's own door is the last old one. It bakes once a month, on the first Saturday, in a wood oven lit at five in the morning, about 240 loaves of three kinds: rye (6 euros), spelt (7 euros) and a dark loaf with fig (9 euros). Orders close the Wednesday before, by telephone at +351 21 000 0000. Founded in 1961 by Amélia Cruz; her granddaughter Inês runs it now. People come to order, and to find the street. The site is one static page, public/index.html, with its CSS and script beside it under public/, no framework and no build. The client's photographs are in public/assets (public/assets/CREDITS.txt says what each is and its licence; credit them in the footer). This project's environment and its e2e command are in the crew's profile, and tests/e2e/site.spec.mjs captures home:default through the crew's fixture. I am not here to answer, and this project runs with nobody present (the validator takes a decision's stated default): take what the brief leaves open and say what you assumed. Prove it end to end.
