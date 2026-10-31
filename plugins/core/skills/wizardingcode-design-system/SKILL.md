---
name: wizardingcode-design-system
description: "After the direction: turns it into tokens with type, colour, spacing and proportion values, refusing overused fonts and AI palettes, so nothing is out of proportion."
---

# Design system

## When

After `wizardingcode-design-direction`, before the first interface file. On `extend`, read the project's tokens and add none without the user's word.

## Inputs

`design/direction.md`, the deal's type and palette rows, `references/frontend.md`, `references/frontend-site.md`.

## Steps

1. **Type.** Faces chosen like objects from the subject's world, at most two families and five sizes. The faces a generated page falls back on are refused for display: Inter, Roboto, Arial, Helvetica, Open Sans, Lato, Montserrat, Poppins, Fraunces, Playfair Display, Cormorant, Lora, Crimson, Newsreader, Syne, Space Grotesk, Space Mono, IBM Plex, DM Sans, DM Serif, Outfit, Plus Jakarta Sans, Instrument Sans, Instrument Serif, Geist, Mona Sans, Recoleta, Sora, Nunito, Raleway. A subject association is never the reason to use one. A project that wants one declares `overused-font` under `devices:`. On Operate and Read a system stack or a workhorse is fine. Serve the fonts from the project.
2. **Proportion**, from `references/frontend-site.md`: display at most 96 px and 7vw, on a phone 13vw; display 2.5 to 6 times body; a headline's box at most 40% of the first screen; body 16 to 20 px; controls 36 to 64 px, 44 on a phone; a decorative icon at most 64 px; sections 120 to 240 px apart, 72 to 112 on a phone; navigation at most a tenth of the first screen. Headings: tracking -0.01 to -0.04em, leading 1.0 to 1.2; running text 45 to 75 characters, leading 1.45 to 1.6, nothing under 13 px. A larger value needs `proportion-display-max-px` and `proportion-decision: D-n` in `DESIGN.md`, with the user's decision on record.
3. **Colour.** One ground, one ink, one accent and tinted neutrals, as roles and not swatches; ground 70 to 90% of a screen, accent under 5% unless the strategy is Committed or Drenched. Derive hues in OKLCH. Contrast 4.5:1, 3:1 for large text; on colour, tint secondary text, never grey. Refused and measured (`colour/ai-look`): a cream ground, indigo and violet as an accent nobody chose, cream with terracotta or rust. A warm subject does not require cream: look at its saturated materials first. Take colours from the subject's own materials when it has them.
4. **Space and layout.** A 4-unit scale. More space above a heading than below it. The gap between groups at least twice the gap inside one. Internal padding never larger than external. One pair of equal outer margins at every width, 16 to 32 px, tighter never. Asymmetry lives inside the grid, never in the frame. Neighbouring sections do not share a layout. Radius: an inner corner is the outer minus the gap.
5. **Write the tokens** as CSS custom properties; everything downstream reads tokens only. Write `DESIGN.md` at the end of the build, from what was built, not before: Overview, Colors, Typography, Layout, Elevation, Shapes, Components, Do's and Don'ts, with the frontmatter tokens and `devices:` naming each device adopted on purpose.
6. **Also hold.** One section-separation mechanism for the whole page. Border or shadow, never both. Two greys at most, far enough apart to read as two. A dark scheme lifts elevation with lighter surfaces and desaturates; images get their own variants. More than two weights is a finding. Precedence: `DESIGN.md` on visuals, `PRODUCT.md` on voice, the brief on this surface. `DESIGN.md` never records a refused element, a value written to make a finding vanish, or a prohibition against a device the world uses. Logical properties for direction; non-Latin text at 16 px or more.

## Output

The token file; at the end of the build, `DESIGN.md`.

## Done when

`design-lint` names no `font/`, `colour/` or `tokens/` rule, and the e2e run names no `proportion/` rule.
