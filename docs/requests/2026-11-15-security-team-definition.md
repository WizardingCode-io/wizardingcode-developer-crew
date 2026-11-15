# Security team: subjects, sources, tools, MCP servers and skills

## Context

After the backend developer team's definition (`docs/specs/2026-11-14-backend-team-stacks-design.md`), the user named the security team as the next one to define. The engine has a `security` team (`packages/engine/src/team.ts`, `TEAMS.security`) with one member, `review-security`, the gate `security`, `mandatory: always` and `validates: true`. Its reviewer reads six risk areas (`auth`, `personal-data`, `payments`, `public-api`, `data-migration`, `infra`) against `plugins/core/skills/crew/rubrics/security.md`. Nothing in the engine or the plugin says where the team reads about each area, which tools it runs, or which MCP servers and skills it uses. The engine runs two security checks of its own: the `secrets` gate on every item and the `deps` gate (`npm audit`) on Node projects.

The user chose a written definition first, decided with them point by point on 2026-11-14 and 2026-11-15. This plan writes that definition into the repository as one document, with a test that reads it. The engine, the plugin and the packs do not change in this work.

## What will be done

One crew item (a chore) that writes `docs/specs/2026-11-15-security-team-design.md`, in English, following `plugins/core/skills/crew/references/writing.md`, holding the definition below as decided, and `packages/engine/tests/security-team-definition.test.ts`, which reads the document by section and by table row as `backend-team-definition.test.ts` reads the backend's.

- Every source and tool carries the URL it was opened at on 2026-11-15. Six pages were not read that day and are marked so: the five EUR-Lex acts (EUR-Lex answered automated requests with an empty challenge) and MITRE ATLAS (its content is rendered by script).
- Every MCP server and every set of skills carries the URL it was read at and its install command, word for word from the research of 2026-11-15. A command that takes a token is written with the variable's name and no value.
- The document ends with a section "What the code needs, not decided here".

## The definition (decided 2026-11-14 and 2026-11-15)

### 1. Subjects and where their information comes from

Ten subjects: the engine's six risk areas and four more.

| Subject | Sources |
| :- | :- |
| Auth | OWASP ASVS; OWASP cheat sheets (Authentication, Session Management, Authorization, Password Storage, Multifactor Authentication); NIST SP 800-63B; RFC 9700; RFC 8725; OpenID Connect Core; W3C WebAuthn; MITRE CWE |
| Personal data | GDPR on EUR-Lex; EDPB guidelines; CNPD; the ASVS data protection chapter; OWASP User Privacy Protection cheat sheet and Top 10 Privacy Risks; NIST Privacy Framework; the ICO's guides |
| Payments | PCI DSS; PSD2 strong customer authentication (Regulation 2018/389, the EBA); EMV 3-D Secure; OWASP Third Party Payment Gateway Integration cheat sheet; the security and webhook documentation of the provider the project uses (Stripe, Adyen, PayPal, SIBS / MB WAY, Easypay, ifthenpay) |
| Public API | OWASP API Security Top 10; OWASP Top 10; ASVS; OWASP cheat sheets (REST Security, GraphQL, Input Validation, Injection Prevention, CSRF, SSRF, Mass Assignment, Denial of Service); OWASP Web Security Testing Guide; MDN web security; RFC 9110; OpenAPI security schemes; MITRE CWE |
| Data migration | OWASP cheat sheets (Database Security, SQL Injection Prevention, Query Parameterization, Logging); the ASVS data protection chapter; the security documentation of the project's database (PostgreSQL, MySQL, MariaDB, SQLite, MongoDB, Redis); the CIS Benchmarks; the migrations documentation of the project's framework; GDPR on retention and erasure |
| Infra | CIS Benchmarks; OWASP cheat sheets (Docker Security, Kubernetes Security, Infrastructure as Code Security, CI/CD Security) and Top 10 CI/CD Security Risks; the security documentation of the provider the project uses (AWS, Google Cloud, Azure, Cloudflare, Hetzner, DigitalOcean, Laravel Forge, Laravel Cloud); Docker's and Kubernetes's security documentation; GitHub Actions' secure use reference; NIST SP 800-190; the NIS2 directive |
| Dependencies and supply chain | OSV, GitHub Advisory Database, NVD, CVE, CISA KEV, EPSS; per stack FriendsOfPHP security advisories, npm audit, PyPA advisory database, Go vulnerability database, RustSec; SLSA; OpenSSF Scorecard; OWASP cheat sheets (Vulnerable Dependency Management, Software Supply Chain Security, NPM Security); CycloneDX and SPDX; the Cyber Resilience Act |
| Secrets | OWASP cheat sheets (Secrets Management, Key Management); the ASVS configuration chapter; GitHub secret scanning and push protection; gitleaks and TruffleHog; the documentation of the vault the project uses (HashiCorp Vault, AWS Secrets Manager, Google Secret Manager, Azure Key Vault, Doppler, 1Password, Infisical); the framework's configuration documentation; the Twelve-Factor App's config factor |
| Cryptography | OWASP cheat sheets (Cryptographic Storage, Password Storage, Transport Layer Security, Key Management, HTTP Strict Transport Security); the ASVS cryptography chapter; NIST SP 800-57 Part 1, SP 800-52, FIPS 203 to 205; RFC 8446 (obsoleted by RFC 9846 in July 2026, both named) and RFC 9106; Mozilla's Server Side TLS guide and configuration generator; libsodium and the stack's own cryptography library; the ECCG "Agreed Cryptographic Mechanisms" on ENISA's certification site (the user's "ENISA report on algorithms and key sizes") |
| AI and agents | OWASP Top 10 for LLM Applications; OWASP Top 10 for Agentic Applications and "Agentic AI – Threats and Mitigations"; OWASP cheat sheets (LLM Prompt Injection Prevention, AI Agent Security); MITRE ATLAS; NIST AI RMF and AI 600-1; the MCP documentation's security best practices; Anthropic's documentation on jailbreaks and prompt injections and on Claude Code's security; the security documentation of the model provider the project uses; the AI Act |

### 2. Tools the team runs

| Kind | Tools |
| :- | :- |
| Static analysis | Semgrep Community Edition; CodeQL where the repository is on GitHub; per stack: PHPStan / Larastan and Psalm's taint analysis (PHP), eslint-plugin-security (Node / TypeScript), Bandit and Ruff's flake8-bandit rules (Python), gosec and staticcheck (Go), Clippy and cargo-geiger (Rust) |
| Dependencies | per stack: `composer audit`, `npm audit` or the project's manager's, `pip-audit` and `uv audit`, `govulncheck`, `cargo audit` and `cargo deny`; common: OSV-Scanner, Trivy, OpenSSF Scorecard, Syft, Dependabot or Renovate |
| Secrets | the engine's own `secrets` gate on every item; gitleaks; TruffleHog; GitHub secret scanning with push protection |
| Infra | Trivy; Checkov; hadolint; kube-bench and kubescape; zizmor and actionlint; Docker Scout; Prowler |
| The running application | OWASP ZAP (baseline scan and API scan); Nuclei; Schemathesis; testssl.sh; Mozilla HTTP Observatory; sqlmap, to confirm a suspicion only. These run against the project's own local or test environment and nothing else |
| AI and agents | promptfoo; garak; PyRIT; Snyk Agent Scan (the user chose mcp-scan, which is its earlier name); the MCP Inspector |

### 3. MCP servers and skills

Rules, the user's:

1. The backend's rule: only an MCP server or skills made by a tool's own team; nothing from the community. A tool with no server of its own runs from the command line.
2. The server of a tool of point 2 is installed with the tool: Semgrep, OSV-Scanner, Trivy, OpenSSF Scorecard, kubescape, OWASP ZAP, promptfoo, and GitHub's server with its security toolsets where the repository is on GitHub.
3. The server of a service is installed only where the project already uses the service: Snyk, SonarQube, GitGuardian, Socket, Prowler, Cloudflare, the vault (HashiCorp Vault, 1Password, Doppler, Infisical), Stripe, Burp Suite.
4. Skills used in every team's work on an application (backend, ETL, frontend, all of them), the user's words "sempre":
   - Cloudflare's `security-audit` skill (`https://github.com/cloudflare/security-audit-skill`, MIT). On every item the security reviewer reads its attack-class guides. The whole six-phase audit runs when the change touches one of the ten subjects, and on audit items.
   - The Cybersecurity Skills of `https://github.com/mukul975/Anthropic-Cybersecurity-Skills` (Apache 2.0), a community project "Not affiliated with Anthropic PBC" and the one exception to rule 1, by the user's own choice. Sixteen domains: Web Application Security, API Security, Identity & Access Management, Cryptography, AI Security, Supply Chain Security, DevSecOps, Container Security, Cloud Security, Vulnerability Management, Privacy Compliance, Data Protection, Compliance & Governance, Mobile Security, Penetration Testing and Network Security. The other domains (Red Teaming, Malware Analysis, SOC Operations, Digital Forensics, Threat Hunting, OT/ICS Security and the rest) are left out.
   - Anthropic's `claude-security` plugin and `security-guidance` plugin.
   - Trail of Bits' skills (`https://github.com/trailofbits/skills`).
   - Semgrep's skills (`https://github.com/semgrep/skills`).

Nothing of their own was found on 2026-11-15 for gitleaks, TruffleHog, Checkov, hadolint, kube-bench, zizmor, Docker Scout, Nuclei, Schemathesis, garak, PyRIT and Syft. Anchore's `grype-mcp` is archived.

## Files

- New: `docs/specs/2026-11-15-security-team-design.md`, `packages/engine/tests/security-team-definition.test.ts`.
- Read for the form: `docs/specs/2026-11-14-backend-team-stacks-design.md`, `packages/engine/tests/backend-team-definition.test.ts`.
- No change to `packages/engine/src/`, `plugins/` or `packs/`.

## Verification

- The test reads the document: each of the ten subjects has one row in the sources table, each of the six kinds one row in the tools table, each server and each set of skills its own URL on its own row, and the last section is the one on what the code needs.
- The crew item's gates pass and the engine prints Proven.
- The user reads the document; their word closes the definition. Commit and push, no release.
