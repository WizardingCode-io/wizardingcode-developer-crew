# Payment

A checkout, a charge, a refund, a subscription, a price. Money moves or is promised.

## Assumed by good practice
- Amounts and currency come from the server, as integer minor units; every write carries an idempotency key; a webhook's signature is verified before anything is processed.
- No card data stored; a ledger line per state change.

## Decisions only the user can make
- Which payment methods; what happens on a partial failure (paid but not fulfilled, fulfilled but not paid); who may refund and up to how much.
- Whether a retry is automatic and how many times.

## Proposals
- A test mode or dry run against the provider's sandbox in the same code path; a reconciliation that compares the ledger with the provider's daily report.

## Warnings
- A price or discount taken from the client; a retry with no idempotency key; a webhook processed before its signature is checked; a refund with no record of who asked.
