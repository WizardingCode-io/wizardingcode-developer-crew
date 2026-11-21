# Sources of Measuring the tests

Each section is a subject of the team's definition (`docs/specs/2026-11-15-qa-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Mutation

- The rubric and the project's profile
- the documentation of each stack's mutation tool: Stryker, for JavaScript and TypeScript (https://stryker-mutator.io/), Infection, for PHP (https://infection.github.io/), mutmut (https://mutmut.readthedocs.io/en/latest/) and cosmic-ray (https://cosmic-ray.readthedocs.io/en/latest/), for Python, gremlins (https://gremlins.dev/latest/) and go-mutesting, read at the repository the name points at (https://github.com/zimmski/go-mutesting) and at its maintained fork (https://github.com/avito-tech/go-mutesting), for Go, cargo-mutants, for Rust (https://mutants.rs/)
- the concepts in PIT's documentation, "PIT Mutation Testing" (https://pitest.org/)
- Google's papers on mutation at scale: "State of Mutation Testing at Google", by Petrovic and Ivankovic, ICSE SEIP 2018 (https://research.google/pubs/state-of-mutation-testing-at-google/), and "Practical Mutation Testing at Scale: A view from Google", by Petrovic, Fraser, Ivanković and Just, IEEE TSE 2021 (https://research.google/pubs/practical-mutation-testing-at-scale-a-view-from-google/)
- the Google Testing Blog's "Mutation Testing", of 2021-04-12 (https://testing.googleblog.com/2021/04/mutation-testing.html)

## Flaky tests and determinism

- Martin Fowler's "Eradicating Non-Determinism in Tests" (https://martinfowler.com/articles/nonDeterminism.html)
- the Google Testing Blog: "Flaky Tests at Google and How We Mitigate Them" (https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html) and "Where do our flaky tests come from?" (https://testing.googleblog.com/2017/04/where-do-our-flaky-tests-come-from.html)
- GitHub Engineering's "Reducing flaky builds by 18x" (https://github.blog/engineering/infrastructure/reducing-flaky-builds-by-18x/) and Spotify's "Test Flakiness – Methods for identifying and dealing with flaky tests", the one Spotify article on flakiness the research found (https://engineering.atspotify.com/2019/11/test-flakiness-methods-for-identifying-and-dealing-with-flaky-tests)
- the test framework's documentation on a fake clock, random order and isolation: PHPUnit (https://phpunit.de/) and Pest (https://pestphp.com/), Vitest (https://vitest.dev/) and Jest (https://jestjs.io/), pytest (https://docs.pytest.org/en/stable/) with pytest-randomly (https://github.com/pytest-dev/pytest-randomly) and freezegun (https://github.com/spulec/freezegun) or time-machine (https://github.com/adamchainz/time-machine), go test's `-shuffle` and `-race` (https://pkg.go.dev/testing), cargo test (https://doc.rust-lang.org/cargo/commands/cargo-test.html)
- retries and traces in Playwright: "Retries" (https://playwright.dev/docs/test-retries) and "Trace viewer" (https://playwright.dev/docs/trace-viewer)
- the documentation of the project's CI on reruns and quarantine

## Property-based testing and fuzzing

- The documentation of each stack's tool: Hypothesis, for Python (https://hypothesis.readthedocs.io/en/latest/), fast-check, for JavaScript and TypeScript (https://fast-check.dev/), proptest (https://github.com/proptest-rs/proptest) and quickcheck (https://github.com/BurntSushi/quickcheck), for Rust, Go's native fuzzing, a page titled "Go Fuzzing" (https://go.dev/doc/security/fuzz/), and rapid (https://pgregory.net/rapid/), Eris (https://github.com/giorgiosironi/eris) or Pest's and PHPUnit's datasets, for PHP
- cargo-fuzz (https://github.com/rust-fuzz/cargo-fuzz) and the Rust Fuzz Book (https://rust-fuzz.github.io/book/), Atheris (https://github.com/google/atheris), Jazzer.js (https://github.com/CodeIntelligenceTesting/jazzer.js)
- the QuickCheck paper, "QuickCheck: A Lightweight Tool for Random Testing of Haskell Programs", by Koen Claessen and John Hughes, ICFP 2000, https://dl.acm.org/doi/10.1145/351240.351266 (not opened)
- the Hypothesis blog, at its index of articles, where no article is titled after choosing properties (https://hypothesis.works/articles/)
- Scott Wlaschin's "Choosing properties for property-based testing" (https://fsharpforfunandprofit.com/posts/property-based-testing-2/)
- Schemathesis for APIs, as on the architects team (https://schemathesis.readthedocs.io/en/stable/)
- OSS-Fuzz (https://google.github.io/oss-fuzz/) and the security team's definition, which has no row on fuzzing and installs Trail of Bits' skills, the fuzzing ones among them (`docs/specs/2026-11-15-security-team-design.md`, section 5)

## The suite in CI

- The project's own CI configuration and the documentation of its CI on matrix, cache and sharding: GitHub Actions, at its page on a matrix, "Running variations of jobs in a workflow" (https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/run-job-variations), and GitLab CI, at "Get started with GitLab CI/CD" (https://docs.gitlab.com/ci/)
- the framework's documentation on tests in parallel: Pest (https://pestphp.com/) and ParaTest (https://github.com/paratestphp/paratest), Vitest (https://vitest.dev/) and Jest (https://jestjs.io/), pytest-xdist (https://pytest-xdist.readthedocs.io/en/stable/), go test `-p` (https://pkg.go.dev/testing), cargo-nextest (https://nexte.st/), Playwright's shards, "Sharding" (https://playwright.dev/docs/test-sharding)
- coverage: Martin Fowler's "Test Coverage" (https://martinfowler.com/bliki/TestCoverage.html), the Google Testing Blog's "Code Coverage Best Practices" (https://testing.googleblog.com/2020/08/code-coverage-best-practices.html), and the tool's documentation: PCOV (https://github.com/krakjoe/pcov) and Xdebug (https://xdebug.org/docs/code_coverage), c8 (https://github.com/bcoe/c8) and istanbul (https://github.com/istanbuljs/nyc), coverage.py (https://coverage.readthedocs.io/en/latest/), go cover (https://go.dev/doc/build-cover), cargo-llvm-cov (https://github.com/taiki-e/cargo-llvm-cov)
- DORA on continuous testing, a capability its page names "Test automation" (https://dora.dev/capabilities/test-automation/)
- Software Engineering at Google, chapter 23, "Continuous Integration" (https://abseil.io/resources/swe-book/html/toc.html)
- the DevOps team's definition when it exists. Coverage is a measure, not a target
