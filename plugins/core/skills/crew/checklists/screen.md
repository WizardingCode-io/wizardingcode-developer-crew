# Screen

A page, a dialog, a form, a view: something a person sees and operates. The frontend standard (`references/frontend.md`) sets the values; the criterion carries the page's lines (`references/specify.md`).

## Assumed by good practice
- Every state the diff adds or changes is enumerated on the criterion and captured by the spec: default, and empty, loading, error, success where the page reaches them; labels tied to inputs; operable by keyboard; focus visible.
- The standard's widths and the dark scheme when the project has one (`references/frontend.md`, Responsive); a `prefers-reduced-motion` branch for every animation the diff adds; the table's defaults for duration, easing and properties; the console file beside each capture.
- Copy in the project's language, with parity across the languages it serves; no call to the backend the page does not need; no raw value where `DESIGN.md` declares a token.

## Decisions only the user can make
- The focal moment of the page: the one authored motion, if any, named in the thesis with what it does; a motion asked on a control of the standard's 100+ row stays feedback unless the user decides otherwise.
- The dark scheme when the project has none yet; public or behind a session, and what happens with and without one; where "contact support" points; the form of address in the copy.

## Proposals
- A `DESIGN.md` derived from the stylesheets when the project has none (an `observed` criterion when taken); `noindex` on transactional pages; a check that each new page answers in every language before the link that points to it ships.

## Warnings
- The failure patterns the standard refuses (`references/frontend.md`, Interface floor); a page reached from an email behind a login wall; a success page that calls the backend again and shows an error when the action already succeeded.
