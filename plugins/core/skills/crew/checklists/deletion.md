# Deletion

Removing an account, a record, a resource, or giving a tool the power to do so.

## Assumed by good practice
- Soft delete by default; history, orders and tickets stay; sessions and tokens revoked; the existing route and permission reused.
- Hard deletes only from a pinned list of models (C-5); a restore beside every soft delete; a confirmation with a TTL for destructive tools.

## Decisions only the user can make
- Erasure or deactivation: a support ticket's "delete" may be a right-to-erasure request, which a soft delete does not satisfy (C-11).
- Which models may be hard-deleted; whether the profile at an external provider goes too; who holds the delete permission; the confirmation TTL.

## Proposals
- A timeline line "deleted by <staff member>"; re-registration with the same email restores the account, as today.

## Warnings
- A hard delete shipped behind a soft-delete label (C-5); anonymisation presented as deletion, or the reverse (C-11); a destructive tool whose confirmation can be replayed.

From the corpus: C-5, C-11.
