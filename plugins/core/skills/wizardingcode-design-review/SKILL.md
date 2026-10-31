---
name: wizardingcode-design-review
description: "Reviews a new site's captures with no inherited context: fourteen passes, a score and a disposition. Under 8.5, or with a cap, the site is not proven."
---

# Design review

## When

After the e2e gate passes on a Persuade or Experience page at `surface` or `world`. The UI/UX gate runs on every interface item; this adds the finish review to it.

## Inputs

The manifest, the captures, `design/direction.md`, `rubrics/design-finish.md`.

## Steps

1. **Validate the captures first.** Motion settled, nothing half loaded, each file shows what its name claims. A bad capture means recapture, and nothing reviewed on it binds.
2. **Launch `review-ui-ux`** with a fresh context, adding to its prompt `rubrics/design-finish.md` and `design/direction.md`. It never inherits the build's conversation. It judges only the pictures: a problem visible in a capture is real, whatever the code says.
3. **Record the score**: `crew design <id> score` reads the line the reviewer filed.
4. **Run this before the other reviewers.** Every edit makes each ruling stale, so the finish review reaches `ship` first, and code quality, test quality and security read the page that stays. A score under 8.5 is a `fix`, whatever the word says: never stop at it to ask, and never call it accepted.
5. **Act on the disposition.** `recapture`: the evidence failed, recapture and review again. `rebuild`: fidelity failed wholesale, rebuild the named regions and review again from the start. `fix`: the material fixes in one batch, in the rubric's order, rebuild once, recapture, review. `ship`: nothing is owed.
6. **Stop.** Two fix rounds at least with nobody present, each from the findings in the rubric's order; then say what is left and that the site is not proven. With a person, when the second still lists open items, put them to the person. Stop the moment a round resolves nothing. The findings are the only list you work from.
7. **What the reviewer also asks.** Inventory the capture in your own words before reading the contract. Mandatory rows TYPE, MATERIAL, GROUND: imitation material (CSS bevels, fake stamps) counts as contradicted. A picture under a wash does not count as shipped. A verdict pass scores each fix resolved, partial or unresolved; a moved position with the quality still absent is partial; a person's screenshot outranks staged captures. Commits since `DESIGN.md` are no proof it is stale. Stress with plausible worst-case content kept only when a cue matches: empty, one, ten times, a long name, an unbreakable string; mock data looks like the product. A proof section needs a real visual with surface area, not an icon card. Colour as the sole state signal, an action and static text sharing one colour, equal-weight columns, crowded beside empty, a centred heading over left body, decoration outweighing function, a call to action quieter than its neighbours, what looks clickable and is not, orphaned controls and awkward folds. Placed space reads calm; leftover space reads unfinished. Open the deployment package at its real root and verify it there; sample inside each section and at intermediate scroll states, not evenly.

## Output

`review/ui-ux.findings.md` with its score line, `design/score.json` (the engine's).

## Done when

Score at least 8.5, no cap, disposition `ship`, on the current code. Say what it is: a model's reading of the captures. The engine proves the process ran and the measurable signs are absent, never that a site has taste.
