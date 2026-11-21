# Sources of Pipelines

Each section is a subject of the team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Pipelines

- The gates run before a deploy, and no job the pipeline cannot run. The project's own CI configuration and the crew's profile
- the infra rubric (`plugins/core/skills/crew/rubrics/infra.md`)
- the documentation of the project's CI: "GitHub Actions documentation" (https://docs.github.com/en/actions), GitLab CI/CD's "Get started with GitLab CI/CD" (https://docs.gitlab.com/ci/), "Welcome to CircleCI Documentation" (https://circleci.com/docs/), "Buildkite Pipelines" (https://buildkite.com/docs/pipelines), "Get started with Bitbucket Pipelines" (https://support.atlassian.com/bitbucket-cloud/docs/get-started-with-bitbucket-pipelines/), "Jenkins User Documentation" (https://www.jenkins.io/doc/)
- Martin Fowler's "Continuous Integration", an article and not an entry of his bliki, offered to the user as ContinuousIntegration (https://martinfowler.com/articles/continuousIntegration.html), "Deployment Pipeline" (https://martinfowler.com/bliki/DeploymentPipeline.html) and "Continuous Delivery" (https://martinfowler.com/bliki/ContinuousDelivery.html)
- continuousdelivery.com, by Jez Humble, a page titled "What is Continuous Delivery?" (https://continuousdelivery.com/), and "Continuous Delivery: Reliable Software Releases through Build, Test, and Deployment Automation", a paid book, by name, at its publisher's store (https://www.informit.com/store/continuous-delivery-reliable-software-releases-through-9780321601919)
- DORA's "Continuous integration" (https://dora.dev/capabilities/continuous-integration/) and "Continuous delivery" (https://dora.dev/capabilities/continuous-delivery/)
- Software Engineering at Google, chapter 23, "Continuous Integration", at the book's table of contents (https://abseil.io/resources/swe-book/html/toc.html) and at the chapter (https://abseil.io/resources/swe-book/html/ch23.html), and chapter 24, "Continuous Delivery" (https://abseil.io/resources/swe-book/html/ch24.html)
- "Release Engineering", chapter 8 of the SRE book, offered to the user as the SRE books' Release Engineering, the Workbook having no chapter of that name (https://sre.google/sre-book/release-engineering/)
- the QA team's definition for the suite in CI (`docs/specs/2026-11-15-qa-team-design.md`, section 3, the row "The suite in CI")

## The pipeline's supply chain

- Pinned actions, provenance, signing, SBOM. The security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "Dependencies and supply chain")
- SLSA (https://slsa.dev/)
- GitHub Actions' security guide, titled today "Secure use reference", for pinning actions by SHA and the token's permissions (https://docs.github.com/en/actions/reference/security/secure-use), and GitLab CI's "Pipeline security" (https://docs.gitlab.com/ci/pipeline_security/)
- OpenSSF Scorecard (https://scorecard.dev/) and the OpenSSF's best-practice guides, at the index of the "OpenSSF Best Practices Working Group (WG)", no single guide being opened (https://best.openssf.org/)
- Sigstore (https://www.sigstore.dev/) and cosign (https://docs.sigstore.dev/cosign/signing/overview/)
- GitHub's "Artifact attestations" (https://docs.github.com/en/actions/concepts/security/artifact-attestations) and npm's "Generating provenance statements" (https://docs.npmjs.com/generating-provenance-statements/)
- SBOM: SPDX (https://spdx.dev/) and CycloneDX (https://cyclonedx.org/), with Syft (https://github.com/anchore/syft)
- "OWASP Top 10 CI/CD Security Risks" (https://owasp.org/projects/top-10-cicd-security-risks)
- the CISA and NSA guidance on defending the CI/CD pipeline, read at CISA's alert of 2023-06-28 that announces it, the guidance itself, a PDF, not being opened (https://www.cisa.gov/news-events/alerts/2023/06/28/cisa-and-nsa-release-joint-guidance-defending-continuous-integrationcontinuous-delivery-cicd)
- NIST's "SP 800-204D, Strategies for the Integration of Software Supply Chain Security in DevSecOps CI/CD Pipelines" (https://csrc.nist.gov/pubs/sp/800/204/d/final)
- Docker's "Build attestations" (https://docs.docker.com/build/metadata/attestations/) and Docker Scout, whose CLI is not under an open-source licence, only where the project already uses it (https://docs.docker.com/scout/)
