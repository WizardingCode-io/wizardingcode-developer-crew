# Sources of Quality attributes and risk

Each section is a subject of the team's definition (`docs/specs/2026-11-15-architects-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read each source that has an address at that address on 2026-11-15; a line that says a page was not opened, or that a source was read in a summary, names nothing more than it says. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Risk in production

- Google's SRE book: Release Engineering (https://sre.google/sre-book/release-engineering/), Embracing Risk, offered to the user as "Managing Risk" (https://sre.google/sre-book/embracing-risk/), Postmortem Culture (https://sre.google/sre-book/postmortem-culture/), Addressing Cascading Failures (https://sre.google/sre-book/addressing-cascading-failures/), and the Workbook's Canarying Releases (https://sre.google/workbook/canarying-releases/)
- the AWS Builders' Library, now under the AWS Builder Center: "Ensuring rollback safety during deployments" (https://builder.aws.com/content/3F04j2yRAAMBuPSPs50xwXZqg01/ensuring-rollback-safety-during-deployments), "Automating safe, hands-off deployments" (https://builder.aws.com/content/3ErTKQOTKc5NIw031UePBPxTQ6I/automating-safe-hands-off-deployments) and, on dependencies, "Static stability using Availability Zones" (https://builder.aws.com/content/3K9SiqiJ369TGkkGzqPM95BuYWI/static-stability-using-availability-zones) and "Avoiding fallback in distributed systems" (https://builder.aws.com/content/3EuS9Sakq7L3VLQIF3qzfMfke1Y/avoiding-fallback-in-distributed-systems)
- the Reliability pillar of AWS Well-Architected (https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/welcome.html)
- Martin Fowler's FeatureFlag, offered to the user as FeatureToggle (https://martinfowler.com/bliki/FeatureFlag.html), with Pete Hodgson's Feature Toggles (https://martinfowler.com/articles/feature-toggles.html), BlueGreenDeployment (https://martinfowler.com/bliki/BlueGreenDeployment.html), CanaryRelease (https://martinfowler.com/bliki/CanaryRelease.html) and ParallelChange (https://martinfowler.com/bliki/ParallelChange.html)
- DORA's capabilities (https://dora.dev/capabilities/) and Accelerate, a paid book, by name (https://itrevolution.com/product/accelerate/)
- the framework's own upgrade and deployment guide
- the status and SLA page of the third party the project depends on
- the ETL team's definition (`docs/specs/2026-11-15-etl-team-design.md`) and the security team's (`docs/specs/2026-11-15-security-team-design.md`)

## Quality attributes

- ISO/IEC 25010, a paid standard, by name, https://www.iso.org/standard/78176.html (not opened), read in a third party's summary alone (https://iso25000.com/index.php/en/iso-25000-standards/iso-25010)
- the SEI's quality attribute scenarios, in Quality Attribute Workshops, Third Edition (https://www.sei.cmu.edu/library/quality-attribute-workshops-qaws-third-edition/), and ATAM (https://www.sei.cmu.edu/library/atam-method-for-architecture-evaluation/)
- the pillars of AWS Well-Architected (https://docs.aws.amazon.com/wellarchitected/latest/framework/the-pillars-of-the-framework.html), the Azure Well-Architected Framework (https://learn.microsoft.com/en-us/azure/well-architected/) and the Google Cloud Well-Architected Framework, offered to the user as the Google Cloud Architecture Framework (https://docs.cloud.google.com/architecture/framework)
- Google's SRE books: Service Level Objectives (https://sre.google/sre-book/service-level-objectives/), the Workbook's error budget policy (https://sre.google/workbook/error-budget-policy/), Handling Overload (https://sre.google/sre-book/handling-overload/) and Addressing Cascading Failures (https://sre.google/sre-book/addressing-cascading-failures/)
- the AWS Builders' Library, now under the AWS Builder Center: "Using load shedding to avoid overload" (https://builder.aws.com/content/3Eun1EEyX6p2e3VYNyRLSJzLuMV/using-load-shedding-to-avoid-overload), "Caching challenges and strategies" (https://builder.aws.com/content/3K9TeXp6strMiJ4vhakpRD7BQWO/caching-challenges-and-strategies) and "Static stability using Availability Zones" (https://builder.aws.com/content/3K9SiqiJ369TGkkGzqPM95BuYWI/static-stability-using-availability-zones)
- Release It! Second Edition, by Michael Nygard, a paid book, by name (https://pragprog.com/titles/mnee2/release-it-second-edition/)
- Microsoft's Cloud Design Patterns: Cache-Aside (https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside), Bulkhead (https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead), Throttling (https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling) and Queue-Based Load Leveling (https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling)
- web.dev on Core Web Vitals, a page titled "Web Vitals" (https://web.dev/articles/vitals)
- the framework's own documentation of its cache, its queues and its performance
- Designing Data-Intensive Applications, a paid book, by name (https://dataintensive.net/)
- Principles of Chaos Engineering (https://principlesofchaos.org/)
