---
name: wizardingcode-design-build
description: "Builds a new site from its contract: still first, then pictures, the live thing and the motion layer, with captures that prove it. Not for a small change inside an established site."
---

# Design build

## When

After the copy, on `surface` or `world`, inside the crew's build phase, each state with its failing capture spec first.

## Inputs

The contract, `design/copy.md`, the tokens, the deal's hero and section rows, `references/frontend.md`, `references/frontend-site.md`.

## Steps

1. **Build it still**, with motion off in your head: a page that needs animation to look finished is not finished. Tokens, then the hero as the contract's first screen, at desktop and at phone width, then each section from its row with this project's content. Keep the geometry, change the subject. No three sections in a row share one layout (`frame/same-layout`), and the first screen differs from the last two sites' (`design/hero-repeat`): text left and picture right is the shape every run falls into. Carry the idea into every section, pricing, FAQ and footer included: a distinctive first screen followed by stock blocks is the commonest failure.
2. **Refuse the shapes**: identical boxed cards with an icon, nested cards, a hero metric template, section numbers, an eyebrow above each heading, gradient text, decorative glass, a coloured side stripe, hard offset shadows, a shape assembled into a fake illustration. Icons from one set, never emoji. Every section the visitor came for opens with a heading that names it.
3. **Fill the frame.** Each desktop screen reads as a poster: one dominant thing and what it carries; one deliberate rest per page at most. No stretch taller than half a screen holds nothing. When text sits in the left half, the right half holds its picture, list or figure.
4. **Pictures**, in this order: the project's own; generated when a tool exists; open archives (`crew design <id> pictures "<query>"`, off until the user sets `design.pictures`), searching the inventory's materials, trade and kind of place and not the category, never the client's name, address or number, which stay on this machine, then `crew design <id> picture <n>` to save one with its licence on record; drawn in code from the subject; type and colour alone. At least four real pictures on a Persuade or Experience page. A found picture shows the client's world and is never shown as its own product, room, dish or team. A credit sits small in the footer, and no sentence on the page says where pictures come from: "not our loaves" under a photograph is a defect of the plan, so choose a picture that needs no apology, or draw it. `alt` on each.
5. **The live thing** from the direction, built into the section where it proves the claim, with real content and a plain fallback.
6. **The comp path**, only with an image tool (`crew design <id> comp generate "<prompt>"`, `comp approve <n> --regions <file>`): the approved comp is a spatial contract. Mark each region with `data-comp="<id>"`, and the e2e run measures it. Without a tool, say so in one line and the code path stands. Never ship a crop of the comp.
7. **The motion layer**, last, from `references/frontend-site.md`: one signature move; entrances for the parts of a section, staggered, once, never content that stays hidden if the script fails; feedback on every control; one moving picture when an honest one exists. Transform and opacity; each move with its reduced-motion path. At least eight elements really move. Controls keep the frequency table.
8. **Capture**: `tests/e2e/<page>.crew.spec.ts`, `capture()` per declared state, `captureMotion()` per interaction of the thesis. Run `crew gate run <id>`, and fix what it names. Do not argue with a measure and do not hide things from it.
9. **Also hold.**
   - Pictures: motion belongs to pictures as well as text; no picture serves twice as hero, demo and proof; a poster is the clip's own first frame; flat client footage is graded before encoding, never with a CSS filter; images keep their crop and focal point at every width; a raster at 1.5 times its region; `srcset`, width and height or `aspect-ratio`, lazy below the fold. Generated images share one preamble: medium and lens, counted lights, grade, texture, a negative list. Read every generated image. A drawing classes each feature as supplied, estimated or illustrative. Illustration is a real illustrator's file with its licence, and no licence means no rights.
   - Brands: a named-brand row shows the real mark; a brand with no mark is dropped, never one text chip; never approximate another brand's mascot. A logo keeps clear space equal to its height, a full logo at least 120 px.
   - Layout: unequal columns take one treatment (centre the shorter, fill it with real content, or cap the taller). Workflow steps, metrics and integration grids stay below the hero, 3 to 4 stats, 5 to 6 logos. No empty pinning or filler to meet a length target. Truncate, wrap or clamp is decided per field; never truncate numbers, amounts or dates. `text-wrap: balance` on headings, `overflow-wrap: anywhere` and never `break-all`.
   - Motion: counters on load, charts redrawing on mount and spinners under 300 ms are decoration; removing an animation removes its hidden start state; layers moving as one are not depth, and contact points stay anchored; adjacent tooltips open instantly; a scrubbed clip maps across the stage's whole visible life; a pin spans at least 1.2 screens; cue windows overlap about 15%, and cues hold a plateau; copy translates at most 4vh across a window; looping motion can be paused (WCAG 2.2.2); animation never blocks input; nothing lingers under opacity 0.2.
   - States: a disabled control stays legible and says why; loading is flat bars at real size with no shimmer; an error stays inside the failed block with the last good time; a form without script must not GET personal input into the URL; skip link, sequential headings, a fixed bar's offset, the current location shown, navigation fixed across pages. On a light canvas a scrim lightens and type over media stays ink.

## Output

The page, its capture spec, `DESIGN.md`.

## Done when

`design-lint` and `e2e` pass with no `proportion/`, `page/`, `frame/`, `craft/`, `picture/`, `motion/` or `design/too-alike` line, then `wizardingcode-design-review`.
