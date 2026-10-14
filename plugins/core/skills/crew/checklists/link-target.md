# Link target

A redirect, a link in an email, a callback URL, a return page: something the user lands on after leaving a flow.

## Assumed by good practice
- The target exists in production, not only locally, in every language the link is sent in; an error on a link (expired, too many attempts) lands on a page, never on raw JSON.
- Tokens are per link; limits are per token, never per IP (a mail scanner or a shared proxy exhausts a per-IP limit for everyone behind it).

## Decisions only the user can make
- Where the link points when the target belongs to another project: who builds the page, and which deploy goes first (C-13 then C-14).
- Whether the target needs a session, and what a visitor without one sees.

## Proposals
- A check, in the environment the link is for, that each target answers 200 before the sender ships; the error page's copy in the user's language.

## Warnings
- Fixing the sender while the receiver answers 404: the customer still sees an error (C-13 became C-14 the same evening).
- A landing page behind a login wall for someone arriving from an email.

From the corpus: C-13, C-14.
