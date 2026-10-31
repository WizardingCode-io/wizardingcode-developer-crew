# Frontend standard for a new site

What a Persuade or Experience page at `surface` or `world` takes beside `references/frontend.md`. Read by `wizardingcode-design-system`, `wizardingcode-design-build` and the reviewer of such a page.

## Motion on a site

The table above holds for controls and app screens everywhere. A Persuade or Experience page at `surface` or `world` also takes (the user's decision of 2026-10-30, D-1):

| Rule | Value | Why, where the sources disagree |
| :- | :- | :- |
| The signature move | one, named in the thesis, 800 ms at most | taste-skill allows openings to 1300 ms and scenes beside it; one 800 ms moment keeps the table's rare row and Impeccable's "one authored moment" |
| Entrance | the parts of a section, each once, rising 16 to 24 px with opacity, up to 700 ms | taste-skill rises 16 to 32 px over 700 to 900 ms; elayadesign 32 px over 600 to 800; the shorter end keeps a reader from waiting. Fade-and-rise on every section unchanged is a tell, so entrances vary with the section |
| Stagger inside an entrance | 60 ms, 240 ms in all | the table's 40 ms is for lists of controls; taste-skill's 60 to 90 and elayadesign's 60 agree at 60 |
| Moving elements | at least eight, measured | taste-skill fails under eight; "motion for spectacle" stays refused: each move has its job in the thesis |
| Duration lint | a literal over 900 ms is a defect on a site, over 500 ms elsewhere | a reveal is longer than a control's feedback |
| Easing | the table's enter and exit curve; never `ease-in` | five sources differ by a hair (`0.16,1,0.3,1`, `0.22,1,0.36,1`, `0.23,1,0.32,1`); one value, the standard's |
| Reduced motion | the content stays, the travel goes: opacity only, same duration | tastemaker, elayadesign and Owl differ; the table's rule stands |

## Proportion

Nothing out of proportion (the user's bar, D-5). Measured on a Persuade or Experience page, per width, each with its rule id; a project overrides a value only in `DESIGN.md`'s frontmatter with the user's decision named (`proportion-display-max-px`, `proportion-decision: D-n`).

| Rule | Limit |
| :- | :- |
| `proportion/display-size` | display type at most 96 px and 7vw; on a phone 13vw |
| `proportion/display-ratio` | display 2.5 to 6 times body |
| `proportion/title-box` | a headline's box at most 40% of the first screen |
| `proportion/body-size` | body 16 to 20 px |
| `proportion/control-height` | controls 36 to 64 px; 44 at least on a phone |
| `proportion/icon-size` | a decorative icon at most 64 px |
| `proportion/section-gap` | sections at most 240 px apart, 112 on a phone |
| `proportion/nav-share` | navigation at most a tenth of the first screen |

`colour/ai-look`: a cream ground, with or without a terracotta accent, or a violet accent, is a defect unless `DESIGN.md` declares `ai-look` under `devices:`. Measured on 2026-10-31: three unlike clients, unguided, gave three cream-and-rust pages.

A site also differs from the earlier ones: its palette repeats none of the last five (`design/palette-repeat`), its first screen neither of the last two (`design/hero-repeat`), and it differs on at least 4 of 6 dimensions (`design/too-alike`), display family, body family, palette, section sequence, hero composition, motion devices. A source that asks for type as wide as the viewport is refused here: D-5 outranks it.

Provenance (ADR 0017): taste-skill v2.1.2 (MIT, Leonxlnx, `b9ca2fd`), Impeccable 4.6.0 (Apache-2.0, pbakaus, `6743a34`), elayadesign/ai-design-skills (MIT, `4fdcdd5`), tastemaker (MIT, `792a28a`); the proportion limits are the user's (D-5, item 2026-10-30-005).
