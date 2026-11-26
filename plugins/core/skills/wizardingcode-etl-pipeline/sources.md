# Sources of Pipeline generator

Each section is a subject of the team's definition (`docs/specs/2026-11-15-etl-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the pages on 2026-11-15; a line that says a page was not opened, or that it answered with a redirect alone, names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Pipelines

- The documentation of the orchestrator the project uses: Apache Airflow's Best Practices (https://airflow.apache.org/docs/apache-airflow/stable/best-practices.html), Dagster (https://dagster.io/docs), Prefect (https://www.prefect.io/docs), Temporal (https://docs.temporal.io/)
- the framework's queues and scheduler: Laravel's Queues (https://laravel.com/docs/queues) and Task Scheduling (https://laravel.com/docs/scheduling), Celery (https://docs.celeryq.dev/en/stable/), BullMQ (https://docs.bullmq.io/)
- the extraction and load tools: Airbyte (https://docs.airbyte.com/), Meltano (https://docs.meltano.com/) and the Singer specification (https://hub.meltano.com/singer/spec), dlt (https://dlthub.com/docs/intro)
- dbt for the transformation (https://docs.getdbt.com/)
- what each says on idempotency, retries and backfills: Airflow's Retry Policies (https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/tasks.html) and Backfill (https://airflow.apache.org/docs/apache-airflow/stable/core-concepts/backfill.html), Dagster's partitions and backfills (https://dagster.io/docs/guides/build/partitions-and-backfills) and op retries (https://dagster.io/docs/guides/build/ops/op-retries), dbt's microbatch incremental models (https://docs.getdbt.com/docs/build/incremental-microbatch) and `dbt retry` (https://docs.getdbt.com/reference/commands/retry)
- Astronomer's "DAG writing best practices in Apache Airflow" (https://www.astronomer.io/docs/learn/dag-best-practices)
- Fundamentals of Data Engineering, by Reis and Housley, https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/ (not opened)

## Imports, exports and file formats

- The formats' specifications: RFC 4180 for CSV (https://www.rfc-editor.org/rfc/rfc4180), RFC 8259 for JSON (https://www.rfc-editor.org/rfc/rfc8259), JSON Lines (https://jsonlines.org/), XML 1.0 (https://www.w3.org/TR/xml/), Apache Parquet's File Format (https://parquet.apache.org/docs/file-format/), Apache Avro's Specification (https://avro.apache.org/docs/++version++/specification/), the Arrow Columnar Format (https://arrow.apache.org/docs/format/Columnar.html), ECMA-376 for Office Open XML (https://ecma-international.org/publications-and-standards/standards/ecma-376/)
- the database's bulk load: PostgreSQL's COPY (https://www.postgresql.org/docs/current/sql-copy.html), MySQL's LOAD DATA (https://dev.mysql.com/doc/refman/8.4/en/load-data.html), mongoimport (https://www.mongodb.com/docs/database-tools/mongoimport/)
- the stack's libraries: league/csv (https://csv.thephpleague.com/) and Laravel Excel (https://docs.laravel-excel.com/4.x/), pandas' IO tools (https://pandas.pydata.org/docs/user_guide/io.html) and Polars' IO (https://docs.pola.rs/user-guide/io/), DuckDB's CSV import, https://duckdb.org/docs/stable/data/csv/overview (not opened), and Parquet import, https://duckdb.org/docs/stable/data/parquet/overview (not opened), csv-parse (https://csv.js.org/parse/), Go's encoding/csv (https://pkg.go.dev/encoding/csv), Rust's csv crate (https://docs.rs/csv/latest/csv/)
- character encoding: Unicode's FAQ on UTF-8, UTF-16, UTF-32 and the BOM (https://www.unicode.org/faq/utf_bom.html), RFC 3629 for UTF-8 (https://www.rfc-editor.org/rfc/rfc3629), WHATWG's Encoding Standard (https://encoding.spec.whatwg.org/)
- OWASP's File Upload cheat sheet (https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html) and CSV Injection page (https://community.owasp.org/attacks/CSV_Injection)

## Integrations and synchronisation between systems

- The documentation of the system the project integrates with, the provider's own API and webhooks
- Standard Webhooks (https://www.standardwebhooks.com/)
- change data capture: Debezium (https://debezium.io/documentation/reference/stable/index.html) and the database's logical replication: PostgreSQL's Logical Replication (https://www.postgresql.org/docs/current/logical-replication.html), MySQL's Binary Log (https://dev.mysql.com/doc/refman/8.4/en/binary-log.html), MongoDB's Change Streams (https://www.mongodb.com/docs/manual/changeStreams/)
- the queue or broker the project uses: Apache Kafka (https://kafka.apache.org/documentation/), RabbitMQ (https://www.rabbitmq.com/docs), Redis Streams (https://redis.io/docs/latest/develop/data-types/streams/), Amazon SQS (https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html), Google Cloud Pub/Sub (https://docs.cloud.google.com/pubsub/docs/overview), NATS (https://docs.nats.io/)
- CloudEvents (https://cloudevents.io/) and AsyncAPI (https://www.asyncapi.com/docs)
- the transactional outbox (https://microservices.io/patterns/data/transactional-outbox.html) and idempotent consumer (https://microservices.io/patterns/communication-style/idempotent-consumer.html) patterns and Enterprise Integration Patterns (https://www.enterpriseintegrationpatterns.com/patterns/messaging/)
- RFC 9110 on idempotent methods, section 9.2.2 (https://www.rfc-editor.org/rfc/rfc9110.html), and the Internet-Draft of the Idempotency-Key header, draft 08 of 2026-10-22 and not an RFC (https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
