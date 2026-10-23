# Data rubric

The data gate asks what the change does to stored data: its schema and migrations, its queries and ORM use, its transactions and indexes, and the availability of the data while the change runs. It runs when the change touches a data migration on the full route, or whenever the team policy seats ETL.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the risk areas the engine found with the paths that raised each (`data-migration`, and `personal-data` when present), and where the project keeps its schema, its models and its migrations.

## Questions

1. Migrations: is each step reversible, or is the reason it is not stated beside it; is data copied before a destructive step (a drop, a rename, a type narrowed); does the run order matter and is it fixed?
2. Queries: does an index exist for what the query filters or joins on; does a query scan a table that grows; does a list path load one row's relations per row (N+1) where the ORM loads them once?
3. ORM use: is a relation loaded as the model intends; is a raw query used where the ORM's own is safe; does a transaction span a network call or a long step?
4. Types: does the code use the schema's types (a nullable read as present, a decimal read as a float, an enum widened)?
5. Personal data: does a new or changed column hold personal data, and are its retention and erasure stated as the project states them?
6. Availability: does a migration hold a lock across a long step on a table the application reads; is a backfill batched?

## Defect or advisory

A **defect**: a data loss a reader of the diff can name; an irreversible step with no stated reason; an N+1 in a list path the ORM would have avoided; a constraint or an index removed; personal data in a column without its retention; a lock held across a long step on a live table. An **advisory**: a slower query with an index present; a naming drift; a missing comment on a tricky migration; a batch size with no reason.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A table with no index that the diff did not touch is debt; a new query beside it that scans the same table is a defect.
