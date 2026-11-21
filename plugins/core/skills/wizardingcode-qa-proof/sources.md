# Sources of Proof

Each section is a subject of the team's definition (`docs/specs/2026-11-15-qa-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## A test per criterion, red first

- The crew's own rules (`plugins/core/skills/crew/references/build.md`, the test-quality rubric)
- the documentation of the project's test framework: PHPUnit (https://phpunit.de/), Pest (https://pestphp.com/), Vitest (https://vitest.dev/), Jest (https://jestjs.io/), pytest (https://docs.pytest.org/en/stable/), Go's testing package (https://pkg.go.dev/testing), cargo test (https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- Kent Beck's "Canon TDD", of 2023-12-11 (https://newsletter.kentbeck.com/p/canon-tdd), and "Test Driven Development: By Example", a paid book, by name, at its publisher's store (https://www.informit.com/store/test-driven-development-by-example-9780321146533)
- Martin Fowler's "Test Driven Development" (https://martinfowler.com/bliki/TestDrivenDevelopment.html), "Self Testing Code" (https://martinfowler.com/bliki/SelfTestingCode.html), "Specification By Example" (https://martinfowler.com/bliki/SpecificationByExample.html) and "Given When Then" (https://martinfowler.com/bliki/GivenWhenThen.html)
- "Growing Object-Oriented Software, Guided by Tests", by Freeman and Pryce, a paid book, by name, at the book's own site (https://growing-object-oriented-software.com/) and at its publisher's store (https://www.informit.com/store/growing-object-oriented-software-guided-by-tests-9780321503626)
- the Gherkin reference, a page titled "Reference" (https://cucumber.io/docs/gherkin/reference/), and Cucumber's "Behaviour-Driven Development" (https://cucumber.io/docs/bdd/)

## Preserve criteria and regression tests

- The crew's rules on preserve criteria (`plugins/core/skills/crew/references/specify.md`, the rubric)
- the project's existing tests
- Michael Feathers's characterization tests, in "Working Effectively with Legacy Code", a paid book, by name, at its publisher's store (https://www.informit.com/store/working-effectively-with-legacy-code-9780131177055), and in his article "Characterization Testing", of 2016-08-08 (https://michaelfeathers.silvrback.com/characterization-testing)
- Approval Tests, whose page is titled "Home" (https://approvaltests.com/), and the golden master, a term with no page of its own, read through Approval Tests and Feathers
- Martin Fowler's "Self Testing Code" (https://martinfowler.com/bliki/SelfTestingCode.html) and refactoring.com, a page titled "Refactoring" whose home page does not speak of testing before refactoring (https://refactoring.com/)
- Software Engineering at Google, chapter 14, "Larger Testing" (https://abseil.io/resources/swe-book/html/toc.html)
- the documentation of the project's test framework

## Observed criteria and their reason

- The crew's rules on observed criteria (`plugins/core/skills/crew/references/specify.md`, `plugins/core/skills/crew/references/build.md`, the rubric)
- Michael Feathers on seams, in "Working Effectively with Legacy Code", a paid book, by name (https://www.informit.com/store/working-effectively-with-legacy-code-9780131177055)
- xUnit Test Patterns: "Humble Object at XUnitPatterns.com" (http://xunitpatterns.com/Humble%20Object.html) and "Test Stub at XUnitPatterns.com" (http://xunitpatterns.com/Test%20Stub.html), and design for testability, offered to the user as a page of that catalogue, for which no page of that name was found
- the Google Testing Blog on testability: "Writing Testable Code", by Miško Hevery, of 2008-08-06 (https://testing.googleblog.com/2008/08/by-miko-hevery-so-you-decided-to.html)
- the framework's documentation on testing what looks untestable (fake HTTP, fake clock, fake queues and mail)

## Criteria observable and provable

- The crew's rules (`plugins/core/skills/crew/references/specify.md`, what the tech lead validates on the spec, `plugins/core/agents/tech-lead.md`)
- Martin Fowler's "Specification By Example" (https://martinfowler.com/bliki/SpecificationByExample.html) and "Given When Then" (https://martinfowler.com/bliki/GivenWhenThen.html)
- Gojko Adzic's "Specification by Example", a paid book, by name, at its publisher's page (https://www.manning.com/books/specification-by-example)
- the Gherkin reference (https://cucumber.io/docs/gherkin/reference/)
- INVEST, in Bill Wake's article "INVEST in Good Stories, and SMART Tasks" (https://xp123.com/invest-in-good-stories-and-smart-tasks/)
- EARS, Alistair Mavin's requirements syntax, a page titled "EARS: Easy Approach to Requirements Syntax" (https://alistairmavin.com/ears/)
- ISO/IEC/IEEE 29148, a paid standard, by name, https://www.iso.org/standard/72089.html (not opened)
- the ISTQB's glossary (https://glossary.istqb.org/) and its Foundation syllabus, "Certified Tester Foundation Level (CTFL) v4.0", the syllabus file being v4.0.1 (https://www.istqb.org/certifications/certified-tester-foundation-level-ctfl-v4-0/), on testability and acceptance criteria
