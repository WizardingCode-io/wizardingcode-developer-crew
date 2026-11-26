# Sources of Source schema evolution

Each section is a subject of the team's definition (`docs/specs/2026-11-15-etl-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the pages on 2026-11-15; a line that says a page was not opened, or that it answered with a redirect alone, names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Schema and migrations

- The database's own documentation: PostgreSQL's Data Definition chapter (https://www.postgresql.org/docs/current/ddl.html) and ALTER TABLE (https://www.postgresql.org/docs/current/sql-altertable.html), MySQL's ALTER TABLE (https://dev.mysql.com/doc/refman/8.4/en/alter-table.html), MariaDB's (https://mariadb.com/docs/server/reference/sql-statements/data-definition/alter/alter-table), SQLite's (https://www.sqlite.org/lang_altertable.html), MongoDB's Schema Validation (https://www.mongodb.com/docs/manual/core/schema-validation/) and Data Modeling (https://www.mongodb.com/docs/manual/data-modeling/)
- the migrations documentation of the project's framework: Laravel (https://laravel.com/framework/docs/13.x/migrations), Django (https://docs.djangoproject.com/en/6.1/topics/migrations/), Alembic (https://alembic.sqlalchemy.org/en/latest/), Prisma (https://www.prisma.io/docs/orm/migrations/how-migrations-work), Drizzle (https://orm.drizzle.team/docs/migrations), golang-migrate (https://github.com/golang-migrate/migrate), SQLx's sqlx-cli (https://github.com/transact-rs/sqlx/blob/main/sqlx-cli/README.md) and SeaORM (https://www.sea-ql.org/SeaORM/docs/migration/setting-up-migration/)
- migrations with no downtime: strong_migrations' README, written for Rails and read for its list of unsafe operations (https://github.com/ankane/strong_migrations), gh-ost (https://github.com/github/gh-ost), pgroll (https://github.com/xataio/pgroll), Squawk's rules (https://squawkhq.com/docs/rules)
- Evolutionary Database Design (https://martinfowler.com/articles/evodb.html) and Parallel Change, the expand and contract pattern (https://martinfowler.com/bliki/ParallelChange.html)

## Availability of the data while the change runs

- The database's documentation on the locks a schema change takes and on online changes: PostgreSQL's ALTER TABLE, where each form states its lock (https://www.postgresql.org/docs/current/sql-altertable.html), and Building Indexes Concurrently (https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY), MySQL's InnoDB and Online DDL (https://dev.mysql.com/doc/refman/8.4/en/innodb-online-ddl.html), MariaDB's InnoDB Online DDL Overview (https://mariadb.com/docs/server/server-usage/storage-engines/innodb/innodb-online-ddl/innodb-online-ddl-overview)
- gh-ost (https://github.com/github/gh-ost) and pt-online-schema-change (https://docs.percona.com/percona-toolkit/pt-online-schema-change.html)
- pgroll (https://github.com/xataio/pgroll) and pg_repack (https://reorg.github.io/pg_repack/)
- strong_migrations' README, for its dangerous operations (https://github.com/ankane/strong_migrations)
- the database's replication and failover documentation: PostgreSQL's High Availability, Load Balancing, and Replication (https://www.postgresql.org/docs/current/high-availability.html), MySQL's Replication (https://dev.mysql.com/doc/refman/8.4/en/replication.html)
- Google's SRE book, the chapter "Data Integrity: What You Read Is What You Wrote" (https://sre.google/sre-book/data-integrity/)

## Backups, restore and retention

- The database's backup and restore documentation: PostgreSQL's Backup and Restore (https://www.postgresql.org/docs/current/backup.html) and Continuous Archiving and Point-in-Time Recovery (https://www.postgresql.org/docs/current/continuous-archiving.html), MySQL's Backup and Recovery (https://dev.mysql.com/doc/refman/8.4/en/backup-and-recovery.html), MariaDB's mariadb-backup (https://mariadb.com/docs/server/server-usage/backup-and-restore/mariadb-backup/mariadb-backup-overview), the SQLite Backup API (https://www.sqlite.org/backup.html), MongoDB's Backup Methods for a Self-Managed Deployment (https://www.mongodb.com/docs/manual/core/backups/)
- pgBackRest (https://pgbackrest.org/), Barman (https://docs.pgbarman.org/release/latest/) and WAL-G (https://wal-g.readthedocs.io/)
- Percona XtraBackup (https://docs.percona.com/percona-xtrabackup/8.4/)
- Litestream (https://litestream.io/)
- the backups documentation of the provider the project uses: AWS RDS (https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html), Google Cloud SQL (https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/backups), Azure Database for PostgreSQL (https://learn.microsoft.com/en-us/azure/postgresql/backup-restore/concepts-backup-restore), Supabase (https://supabase.com/docs/guides/platform/backups), Neon's Backups (https://neon.com/docs/postgres/backup-restore/backups) and Instant restore (https://neon.com/docs/postgres/backup-restore/branch-restore), PlanetScale (https://planetscale.com/docs/vitess/backups), Laravel Forge (https://laravel.com/forge/docs/resources/database-backups), Laravel Cloud's MySQL page, the one opened (https://laravel.com/cloud/docs/resources/databases/laravel-mysql)
- spatie/laravel-backup (https://spatie.be/docs/laravel-backup/v10/introduction)
- Google's SRE book, the chapter "Data Integrity: What You Read Is What You Wrote" (https://sre.google/sre-book/data-integrity/)
- NIST SP 800-34 Rev. 1 (https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final)
- the GDPR on retention and erasure, articles 5 and 17, https://eur-lex.europa.eu/eli/reg/2016/679/oj (not opened)
- CNPD's guidance and recommendations (https://www.cnpd.pt/organizacoes/orientacoes-e-recomendacoes/)
