# Motion

An animation or a transition a change adds: a press, a menu, a modal, a drawer, a toast, a list, a page change. The values are the core's frontend standard; this list is the round's questions.

## Assumed by good practice
- The thesis before the code: what animates, its job, the value from the standard's table, and the candidate rejected, written under the criterion.
- Transform and opacity only; interruptible (a transition or a spring for a reversible state, keyframes one-shot); the hover gated behind `(hover: hover) and (pointer: fine)`.
- A `prefers-reduced-motion` branch for every animation (opacity only, the same duration; no parallax, scroll-driven or autoplay); a motion sample per interaction in the capture spec.

## Decisions only the user can make
- Whether a control used many times a day animates at all beyond feedback, and which one moment of the page is the authored one.
- Whether a value the project wants past the standard's band enters `DESIGN.md`'s `motion` block, on record as a decision.

## Proposals
- The rejected candidate written in the thesis, so the reviewer knows what was weighed.
- One shared enter and exit easing from the standard across the project's components, in the design contract.

## Warnings
- Motion for spectacle; a bounce or an elastic easing with no thesis; a scroll-driven effect with no reduced-motion branch; `transition: all`; a duration past 500 ms outside the thesis.
- A keyframe animation on a reversible state, which cannot be interrupted; a layout property animated (width, height, top, left, margin, padding).
