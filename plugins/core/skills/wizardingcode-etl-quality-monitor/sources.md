# Sources of Data quality monitor

Each section is a subject of the team's definition (`docs/specs/2026-11-15-etl-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the pages on 2026-11-15; a line that says a page was not opened, or that it answered with a redirect alone, names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Data quality and validation

- The data-testing tools' documentation: GX Core, of Great Expectations (https://docs.greatexpectations.io/docs/core/introduction/), Soda Core (https://docs.soda.io/), dbt's data tests (https://docs.getdbt.com/docs/build/data-tests), Pandera (https://pandera.readthedocs.io/en/stable/), Pydantic (https://pydantic.dev/docs/validation/latest/get-started/)
- the database's constraints: PostgreSQL's Constraints (https://www.postgresql.org/docs/current/ddl-constraints.html), MySQL's CHECK Constraints (https://dev.mysql.com/doc/refman/8.4/en/create-table-check-constraints.html) and FOREIGN KEY Constraints (https://dev.mysql.com/doc/refman/8.4/en/create-table-foreign-keys.html)
- the framework's validation: Laravel (https://laravel.com/docs/validation), Django's Validators (https://docs.djangoproject.com/en/stable/ref/validators/) and Validating objects (https://docs.djangoproject.com/en/stable/ref/models/instances/)
- JSON Schema (https://json-schema.org/)
- DAMA UK's six data-quality dimensions, accuracy, completeness, uniqueness, consistency, timeliness and validity, as the UK Government's page lists them (https://www.gov.uk/government/news/meet-the-data-quality-dimensions), DAMA UK's own whitepaper being for members alone (https://www.dama-uk.org/resources/the-six-primary-dimensions-for-data-quality-assessment)
- two paid standards, by name: ISO 8000-1, https://www.iso.org/standard/81745.html (not opened), and ISO/IEC 25012, https://www.iso.org/standard/35736.html (not opened)
