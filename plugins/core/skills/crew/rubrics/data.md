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
7. Pipelines, when the diff adds or changes a job, a scheduled task, a DAG, a queue worker or a transformation: does the transformation come with its tests, does a re-run on the same input give the same outcome rather than writing its rows twice, and is every connection written by its variable's name? The rule: `wizardingcode-etl-pipeline`.
8. Data quality and validation, when the diff reads data that arrives from outside the code (a load, an import, a sync, a consumer): is the data read against its expected schema, checked for completeness and duplicates, and is what failed reported rather than dropped? The rule: `wizardingcode-etl-quality-monitor`.
9. Imports, exports and file formats, when the diff reads or writes a file (CSV, JSON, XML, Parquet, a spreadsheet): is the schema that arrived set beside the one expected before rows are written? The rule: `wizardingcode-etl-schema-evolution`.
10. Integrations and synchronisation, when the diff adds or changes a webhook handler, a message consumer, a change-data-capture reader or a job that writes to another system: does a message delivered twice write once, and can a write to the other system and a write to the database not happen one without the other? The row: `${CLAUDE_PLUGIN_ROOT}/teams/etl.md`, "Integrations and synchronisation between systems".
11. Backups, restore and retention, when the diff adds a table or a store, changes a backup or retention setting, or deletes data on a schedule: does the new store fall inside the backups the project already takes, does a restore step target a test database and never production, and does a scheduled deletion keep the retention the project states? The rule: `wizardingcode-devops-deploy-rollback`.
12. Data warehouse and analytics, when the diff adds or changes a model, a view or a table for reporting (a dbt model, a warehouse table, a materialized view): does it say what one row stands for and at which time unit, and is a large table that only grows loaded incrementally rather than rebuilt? The rule: `wizardingcode-etl`.
13. Sizing the solution to the volume, when the diff adds a store, an engine, a queue, a partitioning scheme or a batch mechanism the project does not have: does the item's spec state the volume it was chosen for, measured or estimated in writing? The rule: `wizardingcode-etl`.
14. Documentation, catalogue and lineage, when the diff changes a table's columns or a model's output and the project keeps a data dictionary, schema descriptions or catalogue entries: are they updated in the same diff, and are the models that read the changed table named? The rule: `wizardingcode-etl-documentation`.

Questions 7 to 14 are answered only when the diff touches their subject, by the trigger each names; question 13 reads the item's spec, `.crew/work/<id>/spec.md`.

## Defect or advisory

A **defect**: a data loss a reader of the diff can name; an irreversible step with no stated reason; an N+1 in a list path the ORM would have avoided; a constraint or an index removed; personal data in a column without its retention; a lock held across a long step on a live table; a transformation with no test; a re-run that writes the same rows twice; data from outside written with no check against its expected schema; a restore step that writes over production; a scheduled deletion that contradicts the retention the project states; a new store, engine or partitioning scheme with no volume stated in the spec, measured or estimated in writing. An **advisory**: a slower query with an index present; a naming drift; a missing comment on a tricky migration; a batch size with no reason; a consumer with no guard against a message delivered twice; a new store outside the project's backups; a reporting model whose grain is unstated, or a large append-only table rebuilt in full; a data dictionary or catalogue entry not updated with the columns; a changed table whose readers are not named.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A table with no index that the diff did not touch is debt; a new query beside it that scans the same table is a defect.
