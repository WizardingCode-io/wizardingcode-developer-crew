# ETL team: subjects, sources, tools, MCP servers and skills

## Context

After the backend developer team's definition (`docs/specs/2026-11-14-backend-team-stacks-design.md`) and the security team's (`docs/specs/2026-11-15-security-team-design.md`), the user named the ETL team as the next one to define. The engine has an `etl` team (`packages/engine/src/team.ts`, `TEAMS.etl`) with one member, `review-data`, the gate `data`, `validates: true`, and a seat only when the change touches a data migration. Its reviewer reads a change against `plugins/core/skills/crew/rubrics/data.md`, which asks about five things: schema and migrations, queries and ORM use, transactions, indexes, and the availability of the data while the change runs. Nothing in the engine or the plugin says where the team reads about each of them, which tools it runs, or which MCP servers and skills it uses. Nothing covers pipelines, data quality, files, integrations, backups, a warehouse, the volume of the data or its lineage.

The user chose a written definition first, decided with them point by point on 2026-11-15. Mid-way they sent three links and an article, and said what the team is for: "é muito importante que a nossa equipa de ETL consiga além de conhecer os ORMs consiga também planear, actualizar, manter e planear a melhor solução para cada caso, seja pouca carga ou uma carga de biliões de dados". This plan writes that definition into the repository as one document, with a test that reads it. The engine, the plugin and the packs do not change in this work.

## What will be done

One crew item (a chore) that writes `docs/specs/2026-11-15-etl-team-design.md`, in English, following `plugins/core/skills/crew/references/writing.md`, holding the definition below as decided, and `packages/engine/tests/etl-team-definition.test.ts`, which reads the document by section and by table row as `security-team-definition.test.ts` reads the security team's.

- Every source and tool carries the URL it was opened at on 2026-11-15. A page that was not read that day is marked "(not opened)".
- Every MCP server and every set of skills carries the URL it was read at and its install command, word for word from the research of 2026-11-15. A command that takes a token is written with the variable's name or the page's placeholder and no value.
- A name the research found wrong, renamed, archived or deprecated is written as the page gives it, with the name the user was offered beside it.
- The document ends with a section "What the code needs, not decided here".

## The definition (decided 2026-11-15)

### 1. Subjects and where their information comes from

Thirteen subjects: the five of the engine's data gate and eight more. The user took the whole proposed base for each and added no URL.

| Subject | Sources |
| :- | :- |
| Schema and migrations | the database's own documentation (PostgreSQL, MySQL, MariaDB, SQLite, MongoDB); the migrations documentation of the project's framework (Laravel, Django, Alembic, Prisma, Drizzle, golang-migrate, SQLx / SeaORM); migrations with no downtime: strong_migrations' README, gh-ost, pgroll, Squawk's rules; Evolutionary Database Design and expand / contract (martinfowler.com) |
| Queries and ORM use | the database's documentation on EXPLAIN and execution plans; Use The Index, Luke; the PostgreSQL wiki's "Don't Do This"; the documentation of the project's ORM (Eloquent, Django ORM, SQLAlchemy, Prisma, Drizzle, GORM and sqlc, Diesel and SQLx), with what each says on N+1 and eager loading; the OWASP Query Parameterization cheat sheet |
| Transactions | the database's documentation on isolation and locking (PostgreSQL Transaction Isolation and Explicit Locking; MySQL InnoDB Locking and Transaction Model; SQLite Isolation; MongoDB Transactions); the framework's transactions documentation; Jepsen's consistency models and analyses; the transactional outbox pattern (microservices.io) |
| Indexes | the indexes chapter of the database's documentation (PostgreSQL, MySQL, MariaDB, SQLite's Query Planning, MongoDB); Use The Index, Luke; the PostgreSQL wiki on index maintenance and unused indexes; pganalyze's Index Advisor documentation |
| Availability of the data while the change runs | the database's documentation on DDL locks and online changes (PostgreSQL ALTER TABLE and its lock levels, CREATE INDEX CONCURRENTLY; MySQL InnoDB Online DDL; MariaDB; MongoDB); gh-ost and pt-online-schema-change; pgroll and pg_repack; strong_migrations' README (the dangerous operations); the database's replication and failover documentation; Google's SRE book, the Data Integrity chapter |
| Pipelines (extract, transform, load, orchestration, scheduling) | the documentation of the orchestrator the project uses (Apache Airflow, Dagster, Prefect, Temporal); the framework's queues and scheduler (Laravel Queues and Task Scheduling, Celery, BullMQ); the extraction and load tools (Airbyte, Meltano and Singer, dlt); dbt for the transformation; what each says on idempotency, retries and backfills; Fundamentals of Data Engineering (Reis and Housley); an Airflow guide offered from memory as "Data Engineering Design Patterns", kept only under the name its publisher gives it |
| Data quality and validation | the data-testing tools' documentation (Great Expectations, Soda Core, dbt's tests, Pandera, Pydantic); the database's constraints (NOT NULL, CHECK, foreign keys, UNIQUE); the framework's validation; JSON Schema; DAMA's data-quality dimensions; ISO 8000 and ISO/IEC 25012, by name, being paid |
| Imports, exports and file formats | the formats' specifications (RFC 4180, RFC 8259, JSON Lines, W3C XML, Apache Parquet, Apache Avro, Apache Arrow, Office Open XML); the database's bulk load (PostgreSQL COPY, MySQL LOAD DATA, mongoimport); the stack's libraries (league/csv and Laravel Excel, pandas and Polars, DuckDB, csv-parse, Go's encoding/csv, Rust's csv crate); character encoding (Unicode and UTF-8, WHATWG's Encoding Standard); OWASP's File Upload cheat sheet and CSV Injection page |
| Integrations and synchronisation between systems | the documentation of the system the project integrates with (the provider's own API and webhooks); Standard Webhooks; change data capture: Debezium and the database's logical replication (PostgreSQL Logical Replication, MySQL's binary log, MongoDB Change Streams); the queue or broker the project uses (Apache Kafka, RabbitMQ, Redis Streams, Amazon SQS, Google Pub/Sub, NATS); CloudEvents and AsyncAPI; the transactional outbox and idempotent consumer patterns (microservices.io) and Enterprise Integration Patterns; RFC 9110 on idempotent methods and the IETF draft of the Idempotency-Key header |
| Backups, restore and retention | the database's backup and restore documentation (PostgreSQL with point-in-time recovery, MySQL, MariaDB, SQLite's Backup API, MongoDB); pgBackRest, Barman and WAL-G; Percona XtraBackup; Litestream; the backups documentation of the provider the project uses (AWS RDS, Google Cloud SQL, Azure, Supabase, Neon, PlanetScale, Laravel Forge, Laravel Cloud); spatie/laravel-backup; Google's SRE book, the Data Integrity chapter; NIST SP 800-34; GDPR on retention and erasure (articles 5 and 17) and CNPD's guidance |
| Data warehouse and analytics | dbt's documentation with "How we structure our dbt projects"; the documentation of the warehouse the project uses (BigQuery, Snowflake, Amazon Redshift, ClickHouse, DuckDB and MotherDuck, PostgreSQL used as a warehouse); Kimball Group's dimensional modelling techniques; SQLMesh; the semantic layer and the reporting tools the project uses (Metabase, Apache Superset, Looker Studio, Power BI); the database's materialised views; OpenLineage |
| Sizing the solution to the volume | Designing Data-Intensive Applications (Kleppmann); partitioning (PostgreSQL Table Partitioning, MySQL Partitioning); batches in the framework (Laravel chunk, lazy and cursor; Django iterator and bulk_create; SQLAlchemy's bulk operations) and bulk load; read replicas and pooling (PgBouncer); distributed and time-series databases (Citus, Vitess, TimescaleDB); columnar engines (ClickHouse, DuckDB, BigQuery, Snowflake); lakehouse formats (Apache Iceberg, Delta Lake, Apache Hudi); processing engines (Apache Spark, Apache Flink, Apache Beam) and streaming (Apache Kafka); measuring (pgbench, sysbench, EXPLAIN ANALYZE) |
| Documentation, catalogue and lineage of the data | OpenLineage and Marquez; dbt's documentation on `dbt docs`, exposures and model contracts; DataHub and OpenMetadata; the database's own comments and catalogue (COMMENT ON, the information schema); the Data Contract Specification and the Open Data Contract Standard (Bitol); DAMA-DMBOK, by name, being paid |

The twelfth subject is the user's requirement: the team plans, updates and maintains the best solution for each case, from a small load to billions of rows. The solution is chosen by a volume measured or estimated in writing, and not the largest by default. The thirteenth came from the article the user pasted.

### 2. Tools the team runs

The user took the whole list for each kind.

| Kind | Tools |
| :- | :- |
| Migrations and schema | Squawk; Atlas (`atlas migrate lint`); SQLFluff; per stack: Laravel `migrate --pretend` and `migrate:status`, Django `sqlmigrate` and `makemigrations --check` and django-migration-linter, Alembic `check`, Prisma `migrate diff`, Drizzle Kit, golang-migrate, `sqlx migrate`; for large tables with no downtime: gh-ost, pt-online-schema-change, pgroll, pg_repack |
| Queries and indexes | EXPLAIN (ANALYZE, BUFFERS) and the equivalents of MySQL, SQLite and MongoDB; pg_stat_statements and auto_explain; MySQL's slow query log with pt-query-digest; HypoPG and Dexter; pgBadger and PgHero; N+1 detectors per framework: Laravel `Model::preventLazyLoading`, Telescope and Debugbar, django-debug-toolbar and nplusone, Prisma's and Drizzle's query logs |
| Data quality | Great Expectations; Soda Core; dbt's tests, with dbt-expectations and dbt-utils; Pandera and Pydantic (Python); Zod and JSON Schema (Node / TypeScript); datacontract-cli; a comparison of tables before and after a load (data-diff, or what its own page says replaced it) |
| Pipelines and load | dbt and SQLMesh; Apache Airflow, Dagster and Prefect, with the framework's queues and scheduler; dlt, Airbyte and Meltano; DuckDB, Polars and pandas; Debezium and Kafka Connect; the database's bulk load (COPY, LOAD DATA, mongoimport). In an existing project the team runs what the project uses; for a new one it chooses by the measured volume |
| Backups and restore | pg_dump, pg_restore and pg_basebackup; pgBackRest, Barman and WAL-G; mysqldump, mydumper and Percona XtraBackup; mongodump and mongorestore; Litestream and SQLite's `.backup`; spatie/laravel-backup; the backups of the provider the project uses. A backup counts as proven only after a rehearsal restore, run in a local or test environment and never over production |
| Volume and measuring | pgbench and sysbench; test data at the real size (the framework's factories and seeders, Faker, PostgreSQL's `generate_series`, DuckDB's TPC-H and TPC-DS generators); EXPLAIN ANALYZE over that volume; hyperfine; the database's size statistics; k6 for the load that arrives through the application. The measuring runs in a local or test environment |
| Documentation, catalogue and lineage | `dbt docs`; SQLGlot and SQLLineage; OpenLineage's clients and Marquez; tbls and SchemaSpy; datacontract-cli; DataHub and OpenMetadata, only where the project already uses them |

### 3. MCP servers and skills

Rules, the user's:

1. The backend's rule: only an MCP server or skills made by a tool's own team; nothing from the community, with the one exception of rule 6. A tool with no server of its own runs from the command line.
2. A database's or a provider's server is installed only where the project uses that database or provider, in read-only mode where the server has one, and the same team's skills are installed with it: MongoDB, Redis, ClickHouse, DuckDB and MotherDuck, MariaDB, BigQuery, Snowflake, AWS (Redshift, Aurora, RDS), Azure, Supabase, Neon, PlanetScale, Tiger Data, CockroachDB, pganalyze, Prisma, and Google's MCP Toolbox for Databases. A server with no read-only mode (Redis's, MariaDB's, Prisma's) connects only to the local or test database, or with a read-only account. Oracle's MySQL server is left out: its own page calls it a proof of concept and not for production. PostgreSQL and MySQL are reached through Google's MCP Toolbox or the provider's server; PostgreSQL and SQLite have no server of their own, and the old reference server is archived.
3. The server and the skills of a pipeline, quality, lineage or reporting tool are installed only where the project already uses the tool, in read-only mode where it has one: dbt, Astronomer's for Airflow, Dagster+, Prefect, Temporal, dlt, Airbyte, Meltano Cloud, Soda Cloud, Confluent, DataHub, OpenMetadata, Metabase, Apache Superset and Preset, Power BI, Looker, Databricks, k6. The document marks those their publishers call experimental, beta or a preview, and those that write.
4. Skills with no server are installed with the tool: Great Expectations', Atlas's, datacontract-cli's, DuckDB's, dbt's.
5. General skills installed always: Supabase's `postgres-best-practices` and PlanetScale's `database-skills`. Tiger Data's pg-aiguide only where the project uses TimescaleDB, since it searches a hosted server. The six sets of skills the security team's definition gives to every team's work apply here unchanged.
6. The user's three links:
   - `https://github.com/mozilla/bigquery-etl-skills` (Mozilla's own, MPL-2.0, 13 skills and 4 agents): not installed, since none of its skills works unchanged outside Mozilla's `bigquery-etl` repository. It is read as a source for the team's own skills, its origin recorded in the sources ledger.
   - `https://github.com/gordonmurray/data-engineering-skills` (an individual's, MIT, nine knowledge skills): the one exception to rule 1, by the user's own choice. Each skill is installed only in the project that uses that technology (Apache Iceberg, Paimon, Fluss, Flink, Flink Agents, Apache Iggy, Lance, Firn), and Iceberg's and Flink's also when the team plans a solution for billions of rows. Its Docker Compose skill is left out, being the DevOps team's.
   - `https://claudecowork.im/resources/pandas-expert`, an unofficial listing that points at a subagent file in `https://github.com/Dlaby23/claude-agents-ultimate-collection`: the file is not used. Its repository has no licence file, so it can be neither copied nor shipped, and it pins `claude-sonnet-4-20250514`. The team writes its own skill instead (rule 7).
7. The team's own skills, eleven, defined here and written in a later item. Each has its instructions, its references loaded only when needed, and every calculation in deterministic code, as the article the user pasted describes and as the user's own rule for exact calculations asks: a data quality monitor; a pipeline generator from the source data; a documentation and data dictionary generator; a query optimiser; a lineage tracer; a data test generator; a handler of the source schema's evolution; performance measuring; a data catalogue; pandas and Polars, from the two projects' own documentation, saying when pandas stops being enough and Polars or DuckDB take over; sizing to the volume, the interview and the choice of the solution from a small load to billions of rows.

The article ("I Built A Digital Data Team In 30 Minutes", Reliable Data Engineering, 2026-01-18) gives figures with no source (a return of 21,333%, the results of two teams). None of them enters the document as a fact.

Nothing of their own was found on 2026-11-15 for PostgreSQL, SQLite, Citus, Vitess, PgBouncer, Crunchy Data, Drizzle, Django, SQLMesh, Apache Airflow, Pandera, Debezium, Apache Kafka, RabbitMQ, NATS, Squawk, SQLFluff, SQLGlot, OpenLineage, Marquez, tbls, SchemaSpy, Polars, pandas, Apache Spark, Apache Iceberg and Delta Lake.

## Files

- New: `docs/specs/2026-11-15-etl-team-design.md`, `packages/engine/tests/etl-team-definition.test.ts`.
- Read for the form: `docs/specs/2026-11-15-security-team-design.md`, `packages/engine/tests/security-team-definition.test.ts`.
- One sentence of `docs/specs/2026-11-15-security-team-design.md` changed before this work, on the user's word of 2026-11-15: its three rows beyond the names asked are confirmed. It is committed with this work.
- No change to `packages/engine/src/`, `plugins/` or `packs/`.

## Verification

- The test reads the document: each of the thirteen subjects has one row in the sources table, each of the seven kinds one row in the tools table, each server and each set of skills its own URL on its own row, each of the eleven own skills is named, the pages not read are marked so, and the last section is the one on what the code needs.
- The crew item's gates pass and the engine prints Proven.
- The user reads the document; their word closes the definition. Commit and push, no release.
