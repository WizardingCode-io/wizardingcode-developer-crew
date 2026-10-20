# Eloquent model

A model with its migration and its factory. The kind where a cast, a relation's inverse or a column's type gets forgotten because the request named a field and nothing else.

## Assumed by good practice
- Casts in the `casts()` method, one per column that is not a string; an accessor or mutator through `Attribute::make`.
- Every relation with its inverse, and the foreign key with its index in the migration.
- A factory beside the model, so tests and seeders build it one way.
- A changed column gets a new migration; a migration that already ran elsewhere is never edited.

## Decisions only the user can make
- Whether a column holds personal data, and who may read it.
- Whether an existing column changes meaning for the rows already stored.

## Proposals
- An index on the column the request filters or sorts by.
- A query scope for a filter the request repeats across screens.

## Warnings
- A model created during `boot` throws a `LogicException` in 13.
- A mass-assignable field the request should not set (an id, a role, a foreign key).
- A relation read in a loop where one eager load was expected.
