# Sources of Boundaries and contracts

Each section is a subject of the team's definition (`docs/specs/2026-11-15-architects-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read each source that has an address at that address on 2026-11-15; a line that says a page was not opened, or that a source was read in a summary, names nothing more than it says. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Layers and boundaries

- The project's own declared architecture: its architecture document and its ADRs
- the structure documentation of the project's framework, one of those the backend team's definition names (`docs/specs/2026-11-14-backend-team-stacks-design.md`, section 4)
- Hexagonal Architecture, by Alistair Cockburn (https://alistair.cockburn.us/hexagonal-architecture)
- The Clean Architecture, by Robert C. Martin (https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Martin Fowler's PresentationDomainDataLayering (https://martinfowler.com/bliki/PresentationDomainDataLayering.html) and the catalogue of Patterns of Enterprise Application Architecture, free summaries of a paid book (https://martinfowler.com/eaaCatalog/)
- Kamil Grzybek's "Modular Monolith: A Primer", the first post of a series (https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer), and his reference application, last changed on 2024-04-20 (https://github.com/kgrzybek/modular-monolith-with-ddd)
- Simon Brown on modular monoliths, a slide deck and not an article (https://static.simonbrown.je/modular-monoliths.pdf)
- the documentation of the boundary-checking tools per stack: deptrac (https://deptrac.github.io/deptrac/), dependency-cruiser (https://github.com/sverweij/dependency-cruiser), import-linter (https://import-linter.readthedocs.io/en/stable/), go-arch-lint (https://github.com/fe3dback/go-arch-lint), ArchUnit (https://www.archunit.org/)

## Data and domain model

- The project's declared model: its schema, its models folder, its migrations, its diagram
- Domain-Driven Design: Eric Evans's DDD Reference (https://www.domainlanguage.com/ddd/reference/), Martin Fowler's BoundedContext (https://martinfowler.com/bliki/BoundedContext.html), UbiquitousLanguage (https://martinfowler.com/bliki/UbiquitousLanguage.html), DDD_Aggregate (https://martinfowler.com/bliki/DDD_Aggregate.html) and AnemicDomainModel (https://martinfowler.com/bliki/AnemicDomainModel.html), Vaughn Vernon's Effective Aggregate Design (https://www.dddcommunity.org/library/vernon_2011/), the DDD Crew (https://github.com/ddd-crew) with its Context Mapping (https://github.com/ddd-crew/context-mapping), Bounded Context Canvas (https://github.com/ddd-crew/bounded-context-canvas) and Aggregate Design Canvas (https://github.com/ddd-crew/aggregate-design-canvas), EventStorming (https://www.eventstorming.com/)
- the documentation of the project's ORM on models and relations, on the pages the ETL team's definition gives in its row "Queries and ORM use" (`docs/specs/2026-11-15-etl-team-design.md`, section 3)
- normalisation and modelling in the database's documentation: PostgreSQL's Data Definition chapter (https://www.postgresql.org/docs/current/ddl.html), MySQL's manual, MongoDB's Data Modeling (https://www.mongodb.com/docs/manual/data-modeling/)
- for schema and migrations, the row "Schema and migrations" of the ETL team's definition

## Contracts

- The project's own contract files
- the OpenAPI Specification, 3.2.1 on that day (https://spec.openapis.org/oas/latest.html)
- the AsyncAPI Specification 3.1.0 (https://www.asyncapi.com/docs/reference/specification/v3.1.0)
- JSON Schema, version 2020-12 (https://json-schema.org/specification)
- the GraphQL specification (https://spec.graphql.org/) and graphql.org's Schema Design page (https://graphql.org/learn/schema-design/)
- gRPC (https://grpc.io/docs/) and Protocol Buffers (https://protobuf.dev/), with Buf's rules of breaking changes (https://buf.build/docs/breaking/rules/)
- CloudEvents (https://cloudevents.io/)
- RFC 9110, HTTP Semantics (https://www.rfc-editor.org/rfc/rfc9110.html), and RFC 9457, Problem Details for HTTP APIs (https://www.rfc-editor.org/rfc/rfc9457.html)
- Google's API Improvement Proposals (https://google.aip.dev/), the Microsoft REST API Guidelines (https://github.com/microsoft/api-guidelines) with the Azure guidelines of the same repository (https://github.com/microsoft/api-guidelines/blob/vNext/azure/Guidelines.md), and Zalando's guidelines, now titled "RESTful API and Event Guidelines" (https://opensource.zalando.com/restful-api-guidelines/)
- Semantic Versioning 2.0.0 (https://semver.org/) and Stripe's API versioning, the reference page (https://docs.stripe.com/api/versioning) and the essay (https://stripe.com/blog/api-versioning)
- Pact (https://docs.pact.io/), Consumer-Driven Contracts on Martin Fowler's site (https://martinfowler.com/articles/consumerDrivenContracts.html) and his TolerantReader (https://martinfowler.com/bliki/TolerantReader.html)
- the framework's own documentation on API resources and validation

## Integrations

- The documentation of the system the project integrates with
- Enterprise Integration Patterns (https://www.enterpriseintegrationpatterns.com/)
- microservices.io's patterns API Gateway (https://microservices.io/patterns/apigateway.html), Saga (https://microservices.io/patterns/data/saga.html), Transactional Outbox (https://microservices.io/patterns/data/transactional-outbox.html), Idempotent Consumer (https://microservices.io/patterns/communication-style/idempotent-consumer.html), Circuit Breaker (https://microservices.io/patterns/reliability/circuit-breaker.html) and Anti-Corruption Layer (https://microservices.io/patterns/refactoring/anti-corruption-layer.html)
- Martin Fowler's CircuitBreaker (https://martinfowler.com/bliki/CircuitBreaker.html) and the Gateway of Patterns of Enterprise Application Architecture (https://martinfowler.com/eaaCatalog/gateway.html)
- Microsoft's Cloud Design Patterns: Anti-Corruption Layer (https://learn.microsoft.com/en-us/azure/architecture/patterns/anti-corruption-layer), Retry (https://learn.microsoft.com/en-us/azure/architecture/patterns/retry), Circuit Breaker (https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker), Bulkhead (https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead) and the three gateway pages, Gateway Aggregation (https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-aggregation), Gateway Offloading (https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-offloading) and Gateway Routing (https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-routing)
- the AWS Builders' Library, now under the AWS Builder Center: "Timeouts, retries, and backoff with jitter" (https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter) and "Making retries safe with idempotent APIs" (https://builder.aws.com/content/3Ev0BENTyBr0XxzRk5FDZzgNYos/making-retries-safe-with-idempotent-apis)
- Standard Webhooks (https://www.standardwebhooks.com/)
- the framework's own documentation of its HTTP client and its queues
- the row "Integrations and synchronisation between systems" of the ETL team's definition (`docs/specs/2026-11-15-etl-team-design.md`, section 3)

## The spec's Design

- The item's own spec and plan, the Design section
- the project's ADRs and architecture document
- the crew's document-review skills (`wizardingcode-spec-*`, drift among them)
- Design Docs at Google (https://www.industrialempathy.com/posts/design-docs-at-google/)
- as models of a design document, Rust's RFC process (https://github.com/rust-lang/rfcs, and the RFC Book at https://rust-lang.github.io/rfcs/) and Python's PEP process, PEP 1 (https://peps.python.org/pep-0001/)
- Software Engineering at Google (https://abseil.io/resources/swe-book), which has no chapter on design review: its chapter 9, Code Review (https://abseil.io/resources/swe-book/html/ch09.html), and its chapter 10, Documentation, where design documents are one section (https://abseil.io/resources/swe-book/html/ch10.html)

## Consistency with neighbours

- The project's neighbouring code and its declared conventions: CLAUDE.md, AGENTS.md, CONTRIBUTING, the linter's and the formatter's configuration
- the language's style guide: PSR-1 (https://www.php-fig.org/psr/psr-1/), PSR-12 (https://www.php-fig.org/psr/psr-12/) and PER Coding Style 3.1, which its page says "extends, expands and replaces PSR-12" (https://www.php-fig.org/per/coding-style/), the TypeScript Handbook (https://www.typescriptlang.org/docs/handbook/intro.html) and the Google TypeScript Style Guide (https://google.github.io/styleguide/tsguide.html), PEP 8 (https://peps.python.org/pep-0008/) and PEP 20 (https://peps.python.org/pep-0020/), Effective Go (https://go.dev/doc/effective_go) and Go Code Review Comments (https://go.dev/wiki/CodeReviewComments), the Rust API Guidelines (https://rust-lang.github.io/api-guidelines/)
- the framework's own conventions
- Google's style guides (https://google.github.io/styleguide/)
