---
name: wizardingcode-design-review
description: "Reviews a new site's captures with no inherited context: fourteen passes, a score. Under the references' level, or 8.5 where there are none, or with a cap, it is not proven."
---

# Design review

## When

After the e2e gate passes on a Persuade or Experience page at `surface` or `world`. The UI/UX gate runs on every interface item; this adds the finish review to it.

## Inputs

The manifest, the captures, `design/direction.md`, `rubrics/design-finish.md`, and `design/shots.md` with `design/refs/` where they exist.

## Steps

1. **Validate the captures first.** Motion settled, nothing half loaded, each file shows what its name claims. A bad capture means recapture, and nothing reviewed on it binds.
2. **Launch `review-ui-ux`** with a fresh context, adding to its prompt `rubrics/design-finish.md` and `design/direction.md`. It never inherits the build's conversation. It judges only the pictures: a problem visible in a capture is real, whatever the code says. With a shot list, its prompt also gets `design/shots.md` and the references, and each capture is read beside its reference: its prompt gets `review/ui/shots.json`, it reads each pair the record names, and a row with no pair is said with its reason. Launch three `review-ui-ux` in one message, each with that same prompt and a fresh context, none told of the others: the engine files each reading in a file of its own (`review/ui-ux.findings.md`, then `review/ui-ux.reading-2.findings.md` and `-3`) and the score is the median of the three. The judge is handed the three files. A reading is one the engine filed from a reviewer's own stop: never copy, edit or file one by hand. With two readings on record no score is recorded until a third reader files; a round whose reading was changed or lost, or whose reviewer was cut off before its score line, has no score until a gate run on changed code begins a new one, so launch no reader into it; the score command says which reading and why.
3. **Record the score**: `crew design <id> score` reads the lines the reviewer filed and says which bar the score was held to. References set the bar only where the user approved them for it: `crew design <id> bar`, with `--shots <shot@width>,…`, puts the question in the engine's own words, the user answers it, and only `yes` approves. Ask it once the shot list is written and never answer it in the user's place; with no approval the bar is 8.5.
4. **Run this before the other reviewers.** Every edit makes each ruling stale, so the finish review reaches `ship` first, and code quality, test quality and security read the page that stays. The bar is the references' level, dimension by dimension, where the user approved references for it, and 8.5 where there are none. A score under its bar is a `fix`, whatever the word says: never stop at it to ask, and never call it accepted.
5. **Act on the disposition.** `recapture`: the evidence failed, recapture and review again. `rebuild`: fidelity failed wholesale, rebuild the named regions and review again from the start. `fix`: the material fixes in one batch, in the rubric's order, rebuild once, recapture, review. `ship`: nothing is owed.
6. **Stop.** Two fix rounds at least with nobody present, each from the findings in the rubric's order; then say what is left and that the site is not proven. With a person, when the second still lists open items, put them to the person. The session files the person's open feedback among the findings, each as one fix, inside the rubric's eight. The rubric's order holds between kinds of finding; among findings of one kind, a round takes the person's open feedback first, else the weakest dimension of the weakest shot: each gap names its shot and its dimension. A finding that is no gap keeps the rubric's order, as every finding does with `reference: none`, and comes after the gaps of its kind. Stop the moment a round resolves nothing. The findings, with the person's feedback among them, are the only list you work from.
7. **What the reviewer also asks.** Inventory the capture in your own words before reading the contract. Mandatory rows TYPE, MATERIAL, GROUND: imitation material (CSS bevels, fake stamps) counts as contradicted. A picture under a wash does not count as shipped. A verdict pass scores each fix resolved, partial or unresolved; a moved position with the quality still absent is partial; a person's screenshot outranks staged captures. Commits since `DESIGN.md` are no proof it is stale. Stress with plausible worst-case content kept only when a cue matches: empty, one, ten times, a long name, an unbreakable string; mock data looks like the product. A proof section needs a real visual with surface area, not an icon card. Colour as the sole state signal, an action and static text sharing one colour, equal-weight columns, crowded beside empty, a centred heading over left body, decoration outweighing function, a call to action quieter than its neighbours, what looks clickable and is not, orphaned controls and awkward folds. Placed space reads calm; leftover space reads unfinished. Open the deployment package at its real root and verify it there; sample inside each section and at intermediate scroll states, not evenly.

## Output

`review/ui-ux.findings.md` with its score line, `design/score.json` (the engine's).

## Done when

Each dimension at the references' level where the user approved references for the bar, on three readings, or a score of at least 8.5 where there are none; no cap, disposition `ship`, on the current code. Say what it is: a model's reading of the captures, and what the score was read against, the references or nothing. The engine proves the process ran and the measurable signs are absent, never that a site has taste.
