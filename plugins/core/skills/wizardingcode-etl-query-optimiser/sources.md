# Sources of Query optimiser

Each section is a subject of the team's definition (`docs/specs/2026-11-15-etl-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the pages on 2026-11-15; a line that says a page was not opened, or that it answered with a redirect alone, names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Queries and ORM use

- The database's documentation on execution plans: PostgreSQL's Using EXPLAIN (https://www.postgresql.org/docs/current/using-explain.html), MySQL's EXPLAIN statement (https://dev.mysql.com/doc/refman/8.4/en/explain.html) and Optimizing Queries with EXPLAIN (https://dev.mysql.com/doc/refman/8.4/en/using-explain.html), MariaDB's EXPLAIN (https://mariadb.com/docs/server/reference/sql-statements/administrative-sql-statements/analyze-and-explain-statements/explain), SQLite's EXPLAIN QUERY PLAN (https://www.sqlite.org/eqp.html), MongoDB's explain (https://www.mongodb.com/docs/manual/reference/command/explain/)
- Use The Index, Luke (https://use-the-index-luke.com/)
- the PostgreSQL wiki's "Don't Do This" (https://wiki.postgresql.org/wiki/Don%27t_Do_This)
- the documentation of the project's ORM, with what it says on N+1 and eager loading: Eloquent (https://laravel.com/framework/docs/eloquent-relationships#eager-loading), Django's QuerySet reference (https://docs.djangoproject.com/en/6.1/ref/models/querysets/) and Database access optimization (https://docs.djangoproject.com/en/6.1/topics/db/optimization/), SQLAlchemy's Relationship Loading Techniques (https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html), Prisma's Query optimization (https://www.prisma.io/docs/orm/v7/prisma-client/queries/advanced/query-optimization-performance), Drizzle (https://orm.drizzle.team/docs/overview), GORM (https://gorm.io/docs/), sqlc (https://docs.sqlc.dev/en/latest/), Diesel (https://diesel.rs/guides/), SQLx (https://docs.rs/sqlx/latest/sqlx/)
- the OWASP Query Parameterization cheat sheet (https://cheatsheetseries.owasp.org/cheatsheets/Query_Parameterization_Cheat_Sheet.html)

## Transactions

- The database's documentation on isolation and locking: PostgreSQL's Transaction Isolation (https://www.postgresql.org/docs/current/transaction-iso.html) and Explicit Locking (https://www.postgresql.org/docs/current/explicit-locking.html), MySQL's InnoDB Locking and Transaction Model (https://dev.mysql.com/doc/refman/8.4/en/innodb-locking-transaction-model.html), Isolation In SQLite (https://www.sqlite.org/isolation.html), MongoDB's Transactions (https://www.mongodb.com/docs/manual/core/transactions/)
- the framework's transactions documentation: Laravel (https://laravel.com/framework/docs/database#database-transactions), Django (https://docs.djangoproject.com/en/6.1/topics/db/transactions/)
- Jepsen's consistency models (https://jepsen.io/consistency) and analyses (https://jepsen.io/analyses)
- the transactional outbox pattern (https://microservices.io/patterns/data/transactional-outbox.html)

## Indexes

- The indexes chapter of the database's documentation: PostgreSQL (https://www.postgresql.org/docs/current/indexes.html), MySQL's Optimization and Indexes (https://dev.mysql.com/doc/refman/8.4/en/optimization-indexes.html), MariaDB's (https://mariadb.com/docs/server/ha-and-performance/optimization-and-tuning/optimization-and-indexes), SQLite's Query Planning (https://www.sqlite.org/queryplanner.html), MongoDB (https://www.mongodb.com/docs/manual/indexes/)
- Use The Index, Luke (https://use-the-index-luke.com/)
- the PostgreSQL wiki's Index Maintenance (https://wiki.postgresql.org/wiki/Index_Maintenance)
- pganalyze's Index Advisor, part of a paid product (https://pganalyze.com/docs/index-advisor)
