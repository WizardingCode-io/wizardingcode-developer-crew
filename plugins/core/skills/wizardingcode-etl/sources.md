# Sources of Sizing to the volume

Each section is a subject of the team's definition (`docs/specs/2026-11-15-etl-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the pages on 2026-11-15; a line that says a page was not opened, or that it answered with a redirect alone, names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Data warehouse and analytics

- dbt's "How we structure our dbt projects" (https://docs.getdbt.com/best-practices/how-we-structure/1-guide-overview)
- the documentation of the warehouse the project uses: BigQuery (https://docs.cloud.google.com/bigquery/docs), Snowflake (https://docs.snowflake.com/en/), Amazon Redshift (https://docs.aws.amazon.com/redshift/latest/dg/welcome.html), ClickHouse (https://clickhouse.com/docs), DuckDB (https://duckdb.org/docs/stable/) and MotherDuck (https://motherduck.com/docs/getting-started/), and PostgreSQL used as a warehouse, on the pages the other rows give
- Kimball Group's Dimensional Modeling Techniques (https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/)
- SQLMesh (https://sqlmesh.readthedocs.io/en/stable/)
- the semantic layer and the reporting tools the project uses: the dbt Semantic Layer (https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl) and MetricFlow (https://docs.getdbt.com/docs/build/about-metricflow), Metabase (https://www.metabase.com/docs/latest/), Apache Superset (https://superset.apache.org/docs/intro/), Looker Studio, which its page now calls Data Studio (https://docs.cloud.google.com/data-studio), Power BI (https://learn.microsoft.com/en-us/power-bi/)
- PostgreSQL's Materialized Views (https://www.postgresql.org/docs/current/rules-materializedviews.html)
- OpenLineage (https://openlineage.io/docs/)

## Sizing the solution to the volume

- Designing Data-Intensive Applications (https://dataintensive.net/), whose second edition, by Martin Kleppmann and Chris Riccomini, came out in March 2026 (https://martin.kleppmann.com/2026/03/24/designing-data-intensive-applications-2e.html)
- partitioning: PostgreSQL's Table Partitioning (https://www.postgresql.org/docs/current/ddl-partitioning.html), MySQL's Partitioning (https://dev.mysql.com/doc/refman/8.4/en/partitioning.html)
- batches in the framework: Laravel's chunk, lazy and cursor in Eloquent (https://laravel.com/framework/docs/13.x/eloquent) and in the query builder (https://laravel.com/framework/docs/13.x/queries), Django's `iterator()` and `bulk_create` (https://docs.djangoproject.com/en/6.1/ref/models/querysets/), SQLAlchemy's ORM-Enabled INSERT, UPDATE, and DELETE statements (https://docs.sqlalchemy.org/en/20/orm/queryguide/dml.html), and the database's bulk load, on the pages the row of imports gives
- read replicas and pooling: PostgreSQL's Hot Standby (https://www.postgresql.org/docs/current/hot-standby.html), PgBouncer (https://www.pgbouncer.org/)
- distributed and time-series databases: Citus (https://docs.citusdata.com/en/stable/), Vitess (https://vitess.io/docs/), TimescaleDB, documented under the Tiger Data name (https://www.tigerdata.com/docs)
- columnar engines: ClickHouse (https://clickhouse.com/docs), DuckDB (https://duckdb.org/docs/stable/), BigQuery (https://docs.cloud.google.com/bigquery/docs), Snowflake (https://docs.snowflake.com/en/)
- lakehouse formats: Apache Iceberg (https://iceberg.apache.org/), Delta Lake (https://docs.delta.io/), Apache Hudi (https://hudi.apache.org/)
- processing engines: Apache Spark (https://spark.apache.org/docs/latest/), Apache Flink (https://nightlies.apache.org/flink/flink-docs-stable/), Apache Beam (https://beam.apache.org/documentation/)
- streaming: Apache Kafka (https://kafka.apache.org/documentation/)
- measuring: pgbench (https://www.postgresql.org/docs/current/pgbench.html), sysbench (https://github.com/akopytov/sysbench), and EXPLAIN ANALYZE, on the pages the row of queries gives
