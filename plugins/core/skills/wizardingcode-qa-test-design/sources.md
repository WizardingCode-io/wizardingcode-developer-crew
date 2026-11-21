# Sources of Test design

Each section is a subject of the team's definition (`docs/specs/2026-11-15-qa-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Nothing true by construction

- The test-quality rubric
- xUnit Test Patterns, by Gerard Meszaros, the page "Test Smells at XUnitPatterns.com" (http://xunitpatterns.com/Test%20Smells.html)
- Martin Fowler's "Assertion Free Testing" (https://martinfowler.com/bliki/AssertionFreeTesting.html) and "Mocks Aren't Stubs" (https://martinfowler.com/articles/mocksArentStubs.html)
- the Google Testing Blog: "Testing on the Toilet: Change-Detector Tests Considered Harmful" (https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html), "Testing on the Toilet: Don't Mock Types You Don't Own" (https://testing.googleblog.com/2020/07/testing-on-toilet-dont-mock-types-you.html) and the series Testing on the Toilet, a page titled "Google Testing Blog: TotT", whose latest post is of 2026-10-05 (https://testing.googleblog.com/search/label/TotT)
- Software Engineering at Google, chapters 11 to 13, "Testing Overview", "Unit Testing" and "Test Doubles" (https://abseil.io/resources/swe-book/html/toc.html)
- Kent C. Dodds's "Testing Implementation Details" (https://kentcdodds.com/blog/testing-implementation-details) and "Effective Snapshot Testing" (https://kentcdodds.com/blog/effective-snapshot-testing)
- the snapshot and mock documentation of the project's test framework

## Behaviour, not implementation

- The test-quality rubric
- Software Engineering at Google, chapter 12, "Unit Testing" (https://abseil.io/resources/swe-book/html/toc.html)
- the Google Testing Blog: "Testing on the Toilet: Test Behavior, Not Implementation" (https://testing.googleblog.com/2013/08/testing-on-toilet-test-behavior-not.html) and "Testing on the Toilet: Test Behaviors, Not Methods" (https://testing.googleblog.com/2014/04/testing-on-toilet-test-behaviors-not.html)
- Kent Beck's Test Desiderata, a page titled "TestDesiderata" that lists twelve properties (https://testdesiderata.com/), whose original essay stands on Medium, https://medium.com/@kentbeck_7670/test-desiderata-94150638a4b3 (not opened)
- Kent C. Dodds's "Testing Implementation Details" (https://kentcdodds.com/blog/testing-implementation-details) and the Testing Library's "Guiding Principles" (https://testing-library.com/docs/guiding-principles)
- Ian Cooper's talk "TDD: Where Did It All Go Wrong?", recorded at Build Stuff 2013, offered to the user as "TDD, Where Did It All Go Wrong" (https://www.infoq.com/presentations/tdd-original/)
- names: Martin Fowler's "Given When Then" (https://martinfowler.com/bliki/GivenWhenThen.html) and the naming conventions of the project's test framework

## Fixtures with neutral names

- The crew's rule (the rubric, the engine's personal-data scan)
- the security team's definition for personal data (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "Personal data")
- the names reserved for examples: RFC 2606, "Reserved Top Level DNS Names" (https://www.rfc-editor.org/rfc/rfc2606.html), and RFC 6761, "Special-Use Domain Names" (https://www.rfc-editor.org/rfc/rfc6761.html), for example domains, RFC 5737, "IPv4 Address Blocks Reserved for Documentation" (https://www.rfc-editor.org/rfc/rfc5737.html), and RFC 3849, "IPv6 Address Prefix Reserved for Documentation" (https://www.rfc-editor.org/rfc/rfc3849.html), for documentation addresses
- the documentation of each stack's Faker: FakerPHP (https://fakerphp.org/), @faker-js/faker (https://fakerjs.dev/), Python's Faker (https://faker.readthedocs.io/en/master/), gofakeit (https://github.com/brianvoe/gofakeit), Rust's fake (https://github.com/cksac/fake-rs)
- the ICO's guidance on anonymisation, with a chapter on pseudonymisation, https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/ (not opened), and the EDPB's "Guidelines 01/2025 on Pseudonymisation", version 1 for public consultation (https://www.edpb.europa.eu/our-work-tools/documents/public-consultations/2025/guidelines-012025-pseudonymisation_en), and "Guidelines 02/2026 on Anonymisation", version 1.0 for public consultation, https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202602_anonymisation_v1_en_0.pdf (not opened)
- the test cards and test data a provider itself publishes, as Stripe's page "Testing" (https://docs.stripe.com/testing)

## Strategy and levels

- The project's own suite and profile
- on Martin Fowler's site, "The Practical Test Pyramid", written by Ham Vocke (https://martinfowler.com/articles/practical-test-pyramid.html), and Martin Fowler's "Test Pyramid" (https://martinfowler.com/bliki/TestPyramid.html), "Integration Test" (https://martinfowler.com/bliki/IntegrationTest.html), "Contract Test" (https://martinfowler.com/bliki/ContractTest.html) and "On the Diverse And Fantastical Shapes of Testing" (https://martinfowler.com/articles/2021-test-shapes.html)
- Kent C. Dodds's "The Testing Trophy and Testing Classifications" (https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) and "Write tests. Not too many. Mostly integration." (https://kentcdodds.com/blog/write-tests)
- Software Engineering at Google, chapter 11, "Testing Overview" (https://abseil.io/resources/swe-book/html/toc.html), and the Google Testing Blog's "Test Sizes" (https://testing.googleblog.com/2010/12/test-sizes.html)
- Spotify's honeycomb, in "Testing of Microservices" (https://engineering.atspotify.com/2018/01/testing-of-microservices)
- Pact's documentation (https://docs.pact.io/) and the architects' definition for contracts (`docs/specs/2026-11-15-architects-team-design.md`, section 3, the row "Contracts")
- the ISTQB's Foundation syllabus (https://www.istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/)
- the testing documentation of the project's framework

## Test doubles and boundaries

- Martin Fowler's "Test Double" (https://martinfowler.com/bliki/TestDouble.html) and "Mocks Aren't Stubs" (https://martinfowler.com/articles/mocksArentStubs.html)
- xUnit Test Patterns: "Test Double at XUnitPatterns.com" (http://xunitpatterns.com/Test%20Double.html) and "Test Double Patterns at XUnitPatterns.com" (http://xunitpatterns.com/Test%20Double%20Patterns.html)
- Software Engineering at Google, chapter 13, "Test Doubles" (https://abseil.io/resources/swe-book/html/toc.html), and the Google Testing Blog: "Testing on the Toilet: Know Your Test Doubles" (https://testing.googleblog.com/2013/07/testing-on-toilet-know-your-test-doubles.html) and "Testing on the Toilet: Don't Mock Types You Don't Own" (https://testing.googleblog.com/2020/07/testing-on-toilet-dont-mock-types-you.html)
- the documentation of each stack's mock library: Mockery (https://github.com/mockery/mockery) and PHPUnit (https://phpunit.de/), Vitest (https://vitest.dev/) and Jest (https://jestjs.io/), MSW (https://mswjs.io/), unittest.mock and pytest-mock (https://github.com/pytest-dev/pytest-mock), gomock, which today is `uber-go/mock` (https://github.com/uber-go/mock), and testify (https://github.com/stretchr/testify), mockall (https://github.com/asomers/mockall)
- the framework's own fakes, on Laravel Http, Queue, Mail, Event and Storage, in its page "Mocking" (https://laravel.com/docs/mocking)
- Testcontainers (https://testcontainers.com/) and WireMock (https://wiremock.org/)
- the architects' definition for boundaries and integrations (`docs/specs/2026-11-15-architects-team-design.md`, section 3, the rows "Layers and boundaries" and "Integrations")

## Test data and state

- The project's own factories, seeders and test configuration
- the framework's documentation on the database in tests: Laravel's "Database Testing", for factories, RefreshDatabase and DatabaseTransactions (https://laravel.com/docs/database-testing)
- Django's "Writing and running tests", for TestCase and fixtures (https://docs.djangoproject.com/en/stable/topics/testing/overview/)
- factory_boy (https://factoryboy.readthedocs.io/en/stable/)
- Prisma's "Unit testing with Prisma ORM" (https://www.prisma.io/docs/orm/prisma-client/testing/unit-testing) and Drizzle, of which the overview alone was opened and no page about tests was found (https://orm.drizzle.team/docs/overview)
- fishery (https://github.com/thoughtbot/fishery)
- go-txdb (https://github.com/DATA-DOG/go-txdb)
- `sqlx::test` (https://docs.rs/sqlx/latest/sqlx/attr.test.html)
- Testcontainers (https://testcontainers.com/)
- xUnit Test Patterns: "Fresh Fixture at XUnitPatterns.com" (http://xunitpatterns.com/Fresh%20Fixture.html) and "Shared Fixture at XUnitPatterns.com" (http://xunitpatterns.com/Shared%20Fixture.html)
- Test Data Builder and Object Mother, offered to the user as patterns of that catalogue, which has no page of either name: Test Data Builder is Nat Pryce's pattern, of Growing Object-Oriented Software (https://growing-object-oriented-software.com/), and Object Mother is read in Martin Fowler's "Object Mother" (https://martinfowler.com/bliki/ObjectMother.html)
- the ETL team's definition for schema and migrations (`docs/specs/2026-11-15-etl-team-design.md`, section 3, the row "Schema and migrations") and the security team's for personal data (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "Personal data")
