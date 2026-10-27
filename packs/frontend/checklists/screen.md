# Screen

A page, a dialog, a form, a view, in a project this pack seats. The core's screen checklist holds the general lists; these are the frontend team's own, read beside them.

## Assumed by good practice
- The criterion carries its page lines (`screen:`, `motion:`, `design:`) and the plan has the capture spec: one `capture()` per declared state and viewport, one `captureMotion()` per interaction of the thesis.
- Every state the diff adds or changes has its branch and its capture at the standard's widths and schemes; the console file sits beside each capture the session takes by hand.
- Every animation the diff adds has a `prefers-reduced-motion` branch and a motion sample; no value is written raw where `DESIGN.md` declares a token.

## Decisions only the user can make
- The dark scheme when the project has none; the focal moment of the page, if any, and whether a control used many times a day animates at all.
- Where an error, an empty or a success state sends the person, and in which voice.

## Proposals
- A `DESIGN.md` derived from the stylesheets when the project has none (an `observed` criterion when taken).
- A dedicated `tests/e2e/<page>.crew.spec.ts` per page the item touches, so the evidence is the fixture's and not the session's.

## Warnings
- A page whose error and empty branches cannot be reached; a hover as the only way to see information; an icon set mixed with emoji.
- A capture taken by hand where the fixture should take it: the reviewer reads it as `by: "session"`, with no viewport known.
