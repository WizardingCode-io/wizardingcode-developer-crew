# Screen

A page, a dialog, a form, a view: something a person sees and operates.

## Assumed by good practice
- The states exist: empty, loading, error, and success for a form; labels tied to inputs; operable by keyboard; the project's components and voice.
- Copy in the project's language, with parity across the languages it serves; no call to the backend the page does not need.

## Decisions only the user can make
- Public or behind a session, and what happens with and without one (C-14: the success page refreshes the user with a session, opens the login without).
- Where "contact support" points; the form of address in the copy; whether transactional pages join the robots exclusions.

## Proposals
- `noindex` on transactional pages; a check that each new page answers in every language before the link that points to it ships.

## Warnings
- A page reached from an email behind a login wall; a success page that calls the backend again and shows an error when the action already succeeded (C-14).
