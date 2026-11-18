# Design finish rubric

The finish review of a new site on a Persuade or Experience page, added to the UI/UX rubric by `wizardingcode-design-review`. Judge only the captures, at the page's full reading: would a design director send this back? The change is held to its contract, promise by promise.

## The fourteen passes

1. One second, then five: what does the page say at a glance, and what can a first-time visitor do within five seconds?
2. Squint: with the detail blurred, does the hierarchy still say what matters first?
3. Cover the logo: can you still tell whose page it is?
4. Edges: how many distinct left edges does the screen have, and does each have a reason?
5. Space and frame: equal outer margins, no huddled section, no blank stretch.
6. Type: faces with a point of view, proportion held, headlines at two lines.
7. Colour: does it own regions and come from the subject, or is it a tint on a neutral template?
8. Images: real, large, used with intent, and never presented as what they are not.
9. Sameness: one word per section for its layout; the same word three times in a row is a tell.
10. Phone: its own composition, not a squeezed desktop.
11. Fullness: each screen a poster, one deliberate rest at most.
12. Substance: is every section the visitor came for complete?
13. Collisions: text on text, text on a busy picture, an element covering another.
14. The competitor and the live thing: does the idea still work with the nearest competitor's name in it, and is there one thing to do made from the idea?

## Proportion

Anything out of proportion is a defect, measured or not: a word as wide as the screen, a giant number, a section whose scale shouts over its neighbours, a control larger than its job. The user's bar: nothing oversized, nothing out of proportion.

## The score

Design 40, usability 30, creativity 20, content 10, out of 10 overall.

The caps, each named in the line:
- Overall: a failed measure 6.0; a three-line headline, an eyebrow, mono labels, 01/02/03, a decorative gradient, a resting shadow or hairline 6.5.
- Creativity: pass 3 fails 6; the idea passes for the competitor 7; no live thing 7.5.
- Design: under four pictures 6.5; barely moves or identical fades 7; two empty screens or small grey text 6.5; unequal margins, a huddled section or a blank stretch 6.5; out of proportion 6.5.
- Content: placeholder 5; a missing section 6.
- Usability: no first-screen button 7; pass 1 fails 6; an unheaded section 7; a covered headline 6; a blank band or clipped content 5.

## The line

The reviewer files, right after its `read:` line, exactly: `score: <n> · caps: <none or a comma list> · disposition: <recapture|rebuild|fix|ship>`. The word is derived: `recapture` when the evidence failed; `rebuild` when the focal material is contradicted; `fix` when a material fix remains; `ship` when none does. At most eight material fixes, in this order: what blocks reading, proportion, the frame, the idea, the rest. Then `keep`: what must not be lost.

Right after the score line the reviewer files two more, each on a line of its own, in this order. Nothing is added to the score line itself: the engine reads it by its exact shape.

```
dimensions: design <n> · usability <n> · creativity <n> · content <n>
reference: <n> shots
```

The third line is `reference: <n> shots`, or `reference: none` where the brief says `no references`. The three stand together, before the fixes. Each of the four figures is out of 10, after its own caps; the overall figure is their weighted sum after the overall caps.

With shots (`design/shots.md`, `design/refs/`), the reviewer names for each shot the three largest gaps between the capture and its reference, each with where, what is wrong and what to change, and only on what the shot's row says to take. The gaps are findings: they enter the material fixes, which stay eight at most, in the order above. A score filed with `reference: none` was read against nothing but the rubric, and the session's report says so. The weakest dimension is named in words in the sentence after the three lines: the overall figure does not hide it.

Provenance (ADR 0017): the passes, the weights and the caps distil taste-skill v2.1.2's critique (MIT, Leonxlnx, `b9ca2fd`); the dispositions and the fresh review distil Impeccable's finish reviewer (Apache-2.0, pbakaus, `6743a34`). The proportion cap is the user's (D-5, item 2026-10-30-005). The shot list, a figure per dimension and the three gaps distil cook (MIT, Leon Lin, `b23cac6`); the four dimensions, the overall figure kept beside them and the shot list's columns on whose a reference is, what to leave and its width are the crew's own.
