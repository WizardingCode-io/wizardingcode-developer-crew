# Sources of Decision

Each section is a subject of the team's definition (`docs/specs/2026-11-15-architects-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read each source that has an address at that address on 2026-11-15; a line that says a page was not opened, or that a source was read in a summary, names nothing more than it says. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Choosing the architecture style

- The rule, which is the ETL team's (the row "Sizing the solution to the volume" of its definition): the solution is chosen by the case measured or estimated in writing, and not the largest by default. Martin Fowler's MonolithFirst (https://martinfowler.com/bliki/MonolithFirst.html), MicroservicePremium (https://martinfowler.com/bliki/MicroservicePremium.html), Microservices, with James Lewis (https://martinfowler.com/articles/microservices.html), the Software Architecture Guide (https://martinfowler.com/architecture/), What do you mean by "Event-Driven"? (https://martinfowler.com/articles/201701-event-driven.html), CQRS (https://martinfowler.com/bliki/CQRS.html), EventSourcing, part of a series its page says was not completed (https://martinfowler.com/eaaDev/EventSourcing.html), and Mike Roberts's Serverless Architectures (https://martinfowler.com/articles/serverless.html)
- microservices.io's Monolithic Architecture (https://microservices.io/patterns/monolithic.html), Microservice Architecture (https://microservices.io/patterns/microservices.html) and decomposition, by business capability (https://microservices.io/patterns/decomposition/decompose-by-business-capability.html) and by subdomain (https://microservices.io/patterns/decomposition/decompose-by-subdomain.html)
- two paid books, by name: Fundamentals of Software Architecture, by Richards and Ford, in its second edition by the authors' own pages, https://www.oreilly.com/library/view/fundamentals-of-software/9781098175504/ (not opened), and Software Architecture: The Hard Parts, https://www.oreilly.com/library/view/software-architecture-the/9781492086888/ (not opened), whose companion site, https://architecturethehardparts.com/ (not opened), did not answer either
- The Majestic Monolith, by DHH (https://signalvnoise.com/svn3/the-majestic-monolith/)
- Shopify on the modular monolith: Deconstructing the Monolith (https://shopify.engineering/deconstructing-monolith-designing-software-maximizes-developer-productivity), Under Deconstruction: The State of Shopify's Monolith (https://shopify.engineering/shopify-monolith) and the article on Packwerk (https://shopify.engineering/enforcing-modularity-rails-apps-packwerk)
- the Azure Architecture Center's architecture styles (https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/) and the AWS Well-Architected Framework (https://docs.aws.amazon.com/wellarchitected/latest/framework/welcome.html)
- The Twelve-Factor App (https://12factor.net/)
- Team Topologies' key concepts (https://teamtopologies.com/key-concepts) and Conway's law, on Martin Fowler's page (https://martinfowler.com/bliki/ConwaysLaw.html) and in Conway's own paper (https://www.melconway.com/Home/Committees_Paper.html)
- Designing Data-Intensive Applications, a paid book, by name (https://dataintensive.net/)

## Decisions and documentation

- The project's own ADRs, as the form to follow
- Michael Nygard's Documenting Architecture Decisions (https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
- adr.github.io (https://adr.github.io/)
- MADR, version 4.0.0 (https://adr.github.io/madr/)
- Joel Parker Henderson's repository of ADR examples and templates, moved to its own organisation (https://github.com/architecture-decision-record/architecture-decision-record)
- the ADR guidance of AWS Prescriptive Guidance (https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html), of Google Cloud's Architecture Center (https://docs.cloud.google.com/architecture/architecture-decision-records) and of Microsoft's Azure Well-Architected Framework (https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record)
- the C4 model (https://c4model.com/)
- Structurizr (https://structurizr.com/) and its DSL (https://docs.structurizr.com/dsl)
- Mermaid (https://mermaid.js.org/)
- PlantUML (https://plantuml.com/)
- arc42 (https://arc42.org/) and its documentation (https://docs.arc42.org/home/)
- ISO/IEC/IEEE 42010, a paid standard, by name, https://www.iso.org/standard/74393.html (not opened), whose 2022 edition is the active one by IEEE's page (https://standards.ieee.org/ieee/42010/6846/)
- Diátaxis (https://diataxis.fr/) and Docs as Code, of Write the Docs (https://www.writethedocs.org/guide/docs-as-code/)

## Evolution and debt

- Martin Fowler's StranglerFigApplication (https://martinfowler.com/bliki/StranglerFigApplication.html), BranchByAbstraction (https://martinfowler.com/bliki/BranchByAbstraction.html), ParallelChange (https://martinfowler.com/bliki/ParallelChange.html), TechnicalDebt (https://martinfowler.com/bliki/TechnicalDebt.html), TechnicalDebtQuadrant (https://martinfowler.com/bliki/TechnicalDebtQuadrant.html), Patterns of Legacy Displacement (https://martinfowler.com/articles/patterns-legacy-displacement/), the catalogue of refactorings (https://refactoring.com/catalog/) and Is High Quality Software Worth the Cost? (https://martinfowler.com/articles/is-quality-worth-cost.html)
- Building Evolutionary Architectures, a paid book, by name, in its second edition by its author's page, https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/ (not opened), with the book's own site (https://evolutionaryarchitecture.com/), and Thoughtworks' article on fitness functions (https://www.thoughtworks.com/insights/articles/fitness-function-driven-development)
- Working Effectively with Legacy Code, by Michael Feathers, a paid book, by name, at its publisher's store (https://www.informit.com/store/working-effectively-with-legacy-code-9780131177055)
- Strangler Fig in Microsoft's Cloud Design Patterns (https://learn.microsoft.com/en-us/azure/architecture/patterns/strangler-fig) and in AWS Prescriptive Guidance, in its guide of cloud design patterns (https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/strangler-fig.html) and in its guide on decomposing monoliths (https://docs.aws.amazon.com/prescriptive-guidance/latest/modernization-decomposing-monoliths/strangler-fig.html)
- the framework's own upgrade guides and endoflife.date (https://endoflife.date/)
- the automatic upgrade tools: Rector (https://getrector.com/), Laravel Shift, a paid service (https://laravelshift.com/), codemods with jscodeshift (https://github.com/meta/jscodeshift), OpenRewrite (https://docs.openrewrite.org/)
- SQALE, whose own site is gone, its domain serving a betting site, so the method is read in Wikipedia's article alone (https://en.wikipedia.org/wiki/SQALE), and SonarQube's debt model, in its page of measures and metrics (https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition)
- for migrations with no downtime, the rows "Schema and migrations" and "Availability of the data while the change runs" of the ETL team's definition (`docs/specs/2026-11-15-etl-team-design.md`, section 3)

## Technology and dependencies

- The rule: first what the project's framework already brings. Thoughtworks' Technology Radar (https://www.thoughtworks.com/radar) and how to build one's own (https://www.thoughtworks.com/radar/byor)
- Choose Boring Technology (https://boringtechnology.club/)
- a dependency's health: OpenSSF Scorecard (https://scorecard.dev/), deps.dev, whose service is named Open Source Insights, https://deps.dev/ (not opened), libraries.io (https://libraries.io/), the package registry of the project's stack (Packagist, npm, PyPI, pkg.go.dev, crates.io) and the dependency's own repository
- licences: the SPDX License List (https://spdx.org/licenses/), choosealicense.com (https://choosealicense.com/) and the Open Source Initiative's licences (https://opensource.org/licenses)
- endoflife.date (https://endoflife.date/)
- the pricing, limits and SLA page of a bought service
- the CNCF Landscape (https://landscape.cncf.io/) and the CNCF's maturity levels, whose criteria stand on its lifecycle page (https://contribute.cncf.io/projects/lifecycle/)
- Martin Fowler's UtilityVsStrategicDichotomy (https://martinfowler.com/bliki/UtilityVsStrategicDichotomy.html) and Wardley Maps (https://learnwardleymapping.com/)
- for dependencies and supply chain, the row "Dependencies and supply chain" of the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3)

## AI and agents

- Anthropic: Building effective agents, now titled "Building effective AI agents" (https://www.anthropic.com/research/building-effective-agents), the articles on context engineering (https://www.anthropic.com/research/effective-context-engineering-for-ai-agents), on a multi-agent research system (https://www.anthropic.com/research/multi-agent-research-system) and on writing tools for agents (https://www.anthropic.com/research/writing-tools-for-agents), and the Claude platform's documentation: tool use (https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview), prompt caching (https://platform.claude.com/docs/en/build-with-claude/prompt-caching), the Agent SDK (https://code.claude.com/docs/en/agent-sdk/overview), and Claude Code's subagents (https://code.claude.com/docs/en/sub-agents), hooks (https://code.claude.com/docs/en/hooks), skills (https://code.claude.com/docs/en/skills) and plugins (https://code.claude.com/docs/en/plugins)
- the Model Context Protocol specification, revision 2026-07-28 (https://modelcontextprotocol.io/specification/2026-07-28), and the Agent Skills specification (https://agentskills.io/home)
- the A2A protocol (https://a2a-protocol.org/)
- the documentation of the model provider the project uses (OpenAI, Google) and of its agent framework: LangGraph (https://docs.langchain.com/oss/python/langgraph/overview), the Vercel AI SDK (https://ai-sdk.dev/docs/introduction), the Laravel AI SDK (https://laravel.com/framework/docs/ai-sdk), Pydantic AI (https://pydantic.dev/docs/ai/overview/)
- the Azure Architecture Center's guide to AI architecture design (https://learn.microsoft.com/en-us/azure/architecture/ai-ml/ai-get-started) and the Generative AI Lens of AWS Well-Architected (https://docs.aws.amazon.com/wellarchitected/latest/generative-ai-lens/generative-ai-lens.html)
- evals: Anthropic's documentation (https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) and Hamel Husain's "Your AI Product Needs Evals" (https://hamel.dev/blog/posts/evals/)
- retrieval: pgvector's documentation, its README (https://github.com/pgvector/pgvector), and Anthropic's Contextual Retrieval (https://www.anthropic.com/research/contextual-retrieval)
- the crew's own documents, `docs/vision.md` and the ADRs
- for AI and agents seen as a risk, the row "AI and agents" of the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3)
