# Sources of Secrets and identities

Each section is a subject of the team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Secrets

- The infra rubric and the crew's secrets gate
- the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "Secrets")
- the OWASP cheat sheet "Secrets Management" (https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)
- The Twelve-Factor App, factor III, Config (https://12factor.net/config)
- the CI's secrets documentation: GitHub Actions' "Secrets" (https://docs.github.com/en/actions/concepts/security/secrets) and "OpenID Connect" (https://docs.github.com/en/actions/concepts/security/openid-connect), GitLab's "CI/CD variables" (https://docs.gitlab.com/ci/variables/) and "OpenID Connect (OIDC) Authentication Using ID Tokens" (https://docs.gitlab.com/ci/secrets/id_token_authentication/)
- HashiCorp Vault, under the Business Source License, licensor IBM, only where the project already uses it (https://developer.hashicorp.com/vault/docs), and OpenBao, its fork under MPL-2.0, the one the team proposes on a new project (https://openbao.org/)
- AWS Secrets Manager (https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) and "AWS Systems Manager Parameter Store" (https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
- Google Secret Manager (https://docs.cloud.google.com/secret-manager/docs)
- Azure Key Vault (https://learn.microsoft.com/en-us/azure/key-vault/)
- Doppler (https://docs.doppler.com/docs/start)
- Infisical (https://infisical.com/docs/documentation/getting-started/introduction)
- 1Password (https://www.1password.dev/)
- "SOPS: Secrets OPerationS" (https://getsops.io/) and age (https://github.com/FiloSottile/age)
- Sealed Secrets, read at its repository, moved from `bitnami-labs/sealed-secrets` to `bitnami/sealed-secrets` (https://github.com/bitnami/sealed-secrets), its site being https://sealed-secrets.netlify.app/ (not opened)
- External Secrets Operator, a page titled "Introduction - External Secrets Operator" (https://external-secrets.io/latest/)
- the framework's documentation on the environment file

## Permissions and identities

- The infra rubric
- the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "Infra")
- AWS IAM's "Security best practices in IAM", of which least privilege is a section (https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- Google Cloud's "IAM overview" (https://docs.cloud.google.com/iam/docs/overview)
- "What is Azure role-based access control (Azure RBAC)?" (https://learn.microsoft.com/en-us/azure/role-based-access-control/overview) and "Microsoft Entra documentation" (https://learn.microsoft.com/en-us/entra/)
- GitHub's "GITHUB_TOKEN" (https://docs.github.com/en/actions/concepts/security/github_token) and "OpenID Connect", for GitHub Actions' OIDC to the cloud (https://docs.github.com/en/actions/concepts/security/openid-connect)
- GitLab's ID tokens (https://docs.gitlab.com/ci/secrets/id_token_authentication/)
- Kubernetes' "Using RBAC Authorization" (https://kubernetes.io/docs/reference/access-authn-authz/rbac/) and "Pod Security Standards" (https://kubernetes.io/docs/concepts/security/pod-security-standards/)
- Docker's "Rootless mode" (https://docs.docker.com/engine/security/rootless/)
- the CIS Benchmarks, by name, offered to the user as behind registration, which the research did not check (https://www.cisecurity.org/cis-benchmarks)
- NIST's "SP 800-207, Zero Trust Architecture" (https://csrc.nist.gov/pubs/sp/800/207/final)
- "Security Pillar - AWS Well-Architected Framework" (https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)
