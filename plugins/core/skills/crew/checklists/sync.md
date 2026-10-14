# Sync

Data flows between this system and a third party: a provider, a CRM, a marketplace, a partner.

## Assumed by good practice
- Never invent a consent or a state: for each field, exactly one side is the truth and the other follows; a value we pushed may come back as an echo and is not new information.
- A ledger line and a timeline entry per record changed by the sync; idempotent runs; the first full run limited and manual.

## Decisions only the user can make
- Which side is the truth for each field, and until when (C-9: the provider for the newsletter until the CRM has consents of its own).
- What a default value means: a default set by an import is not a consent. What the first full run covers, and who pays for it when the API is metered.
- Whether other channels (SMS, partners) join or are a separate ticket.

## Proposals
- Reconcile over a daily export or mirror instead of a paid call per record; a webhook for the live path with the daily run as the net.

## Warnings
- A two-way sync of a field one side only echoes; running the existing full sync before the new rule exists re-subscribes everyone who opted out (C-9).

From the corpus: C-9.
