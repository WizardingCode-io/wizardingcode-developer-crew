# Evals: three whole sites, before and after item 2026-10-30-005, run on 2026-10-31

- Claude Code as installed that day, agent model claude-sonnet-5-5, the llm graders judged by claude-opus-5-5 (three votes), one run per case, no baseline arm. The base is a git worktree of commit `762544e` (0.16.0) with the three cases copied in. The item's runs are its tree, with the bundle rebuilt first.
- The cases: `site-bakery`, `site-law`, `site-synth`. The figures come from each run's aggregate and the pages from the kept sandboxes, compared by `scripts/site-distinctness.ts` and looked at in full-page screenshots.

**The bar was not reached.** No site reached 8.5 in any run, and none ended proven on the item's method. By the user's decision (D-7), the item is released with the bar active, so a new site stays not proven below it, and this record stands in place of AC-18.

## The runs

| Run | Tree | Case | Kit score | USD | What the run showed |
| :- | :- | :- | -: | -: | :- |
| 1 | base | `site-bakery` | 0.50 | 0.63 | Nothing built: the session waited for a person. The cause was the case, which had no validator policy. |
| 1 | base | `site-law` | 0.75 | 1.30 | Nothing built, the same cause; the llm grader passed an empty page as not generic, so its criterion now fails the empty page. |
| 1 | base | `site-synth` | 1.00 | 4.70 | Built and proven: this session took the defaults itself, without the validator policy. Its page was not part of the comparison, which used run 2. |
| 2 | base | `site-bakery` | 0.75 | 1.17 | Built, cream and rust, not proven. |
| 2 | base | `site-law` | 1.00 | 2.39 | Built, cream with a dark first screen and rust, proven. |
| 2 | base | `site-synth` | 1.00 | 5.72 | Built, cream and rust, display type at 112 px, proven. |
| 3 | item | `site-bakery` | 0.50 | 10.42 | Built, near-black with arches, score 7.5, not proven; the session wrote `ship` at 7.5 and stopped. |
| 3 | item | `site-law` | 0.50 | 2.24 | Built, pale blue and teal, timed out at 3000 s before its review. |
| 3 | item | `site-synth` | 0.50 | 15.93 | Built, dark brown and green, score 7.8, not proven. |
| 4 | item | none | none | 0 | The three cases refused at the start: the kit's limits are 200 turns and 3600 s, and they asked for more. |
| 5 | item | `site-bakery` | 0.25 | 4.33 | Nothing built: the session stopped asking for a decision the validator should have taken. |
| 5 | item | `site-law` | 0.50 | 18.09 | Built, grey and oxblood, slab serif, timed out at the kit's maximum of 3600 s. |
| 5 | item | `site-synth` | 0.50 | 14.32 | Built, black and red, heavy grotesque, a playable filter, score 7.5, not proven. |

Run 3 had the method before the rules below; run 5 had those rules, and not the last engine change (a score under the bar is a `fix` whatever word was written), which no run has exercised.

## What the base showed

The three unlike clients gave one look: a cream ground, a rust accent, hairlines between blocks and no motion. They differed on 4 of 6 dimensions, so the first threshold let them through, and the llm grader called all three not generic. Two of the three ended proven. That is the answer to the user's question of 2026-10-30, with one limit: run 1's `site-synth`, read afterwards, came out dark with an orange accent, so the cream look is what three of the four base pages did, not all of them.

## What the runs changed

- `colour/ai-look` and `design/palette-repeat`, since the 4 of 6 threshold passed the three pages above.
- `frame/same-layout` and `design/hero-repeat`, since the item's first three pages all put text left and a picture right.
- The probe reads `oklch` through a canvas, since the method's own pages made its contrast and fingerprint blind.
- A header holding the hero stopped counting as navigation, and an off-screen skip link as a margin.
- A new site's default capture is the whole page, since the reviewer saw the first screen alone.
- The Art Institute's archive left the search: it answers 403 to any download.

## What this does not measure

- One run per case, so a single run's variance is not excluded.
- The score is a model's reading of the captures, and the first base run shows an llm grader passing an empty page. No machine proves a site is worth 10K.
- The agent was Sonnet and the pictures were archive photographs, not the client's own. Neither Opus nor a client's real material has been measured.
- The fingerprint's history was empty in each sandbox, so `design/palette-repeat`, `design/hero-repeat` and `design/too-alike` have fired only in the engine's rows; the comparison across the three pages was made by `scripts/site-distinctness.ts`.
- Axe, the deep audit, the comp path and a real archive search inside a case ran in no run.

## Cost

Base 15.91 USD for runs 1 and 2; item 65.33 USD for runs 3 and 5; run 4 cost nothing; 81.24 USD in all. A whole site costs 2 to 18 USD a run on the item's method, against 1 to 6 on the base.
