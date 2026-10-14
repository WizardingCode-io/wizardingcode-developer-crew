# Migration or restore

A schema change, a data backfill, or bringing back something that was dropped.

## Assumed by good practice
- Reversible, or the reason it cannot be is written in the spec; data copied before a destructive step; the run tried on a copy first with counts before and after.
- A restore re-creates the schema; it brings back data only where an export or a backup of the rows exists, and the spec says which.

## Decisions only the user can make
- What comes back exactly: everything as it was, or a part (C-16: the whole editor or the prompt only).
- Who re-enters data that was never exported, and when; the window in which the migration may run.

## Proposals
- A backup immediately before the run, named in the plan; a dry run that prints what it would change.

## Warnings
- "Restore the table" when the rows were dropped with it: the schema returns, the data does not, and the ticket is not done (C-16).
- A down migration that drops what up created once data has been written into it.

From the corpus: C-16.
