# Sources of Infrastructure as code

Each section is a subject of the team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research opened each page and read its title, not the page end to end; a line that says a page was not opened, or that names a paid book, names nothing that was read. A line is where a subject is read and no line is a rule. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Infrastructure as code

- The project's own infrastructure files
- the tool the project uses: Terraform, under the Business Source License 1.1, which is not an open-source licence, only where the project already uses it, at "Terraform overview" (https://developer.hashicorp.com/terraform/docs), its language (https://developer.hashicorp.com/terraform/language), its state (https://developer.hashicorp.com/terraform/language/state), its modules (https://developer.hashicorp.com/terraform/language/modules) and the "Terraform Registry" (https://registry.terraform.io/)
- OpenTofu, under MPL-2.0, the one the team proposes on a new project (https://opentofu.org/docs/), with the "OpenTofu Registry" (https://search.opentofu.org/)
- Pulumi (https://www.pulumi.com/docs/)
- "What is CloudFormation?" (https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/Welcome.html) and "What is the AWS CDK?" (https://docs.aws.amazon.com/cdk/v2/guide/home.html)
- "What is Bicep?" (https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/overview)
- Ansible, under GPL-3.0 (https://docs.ansible.com/)
- SST, moved from `sst/sst` to `anomalyco/sst` (https://sst.dev/docs/)
- Serverless Framework, whose version 4 is not plain open source, its repository's LICENSE being a link to a "serverless customer agreement", only where the project already uses it (https://www.serverless.com/framework/docs)
- Helm (https://helm.sh/docs/) and Kustomize (https://kustomize.io/)
- HashiCorp's "Learn Terraform recommended practices" (https://developer.hashicorp.com/terraform/cloud-docs/recommended-practices) and Google Cloud's "Best practices for general style and structure", one page of a set (https://docs.cloud.google.com/docs/terraform/best-practices/general-style-structure)
- Martin Fowler's "Infrastructure As Code" (https://martinfowler.com/bliki/InfrastructureAsCode.html)
- "Infrastructure as Code", by Kief Morris, a paid book, by name, in its third edition by the book's own site (https://infrastructure-as-code.com/), its publisher's page being https://www.oreilly.com/library/view/infrastructure-as-code/9781098150341/ (not opened)
- GitOps: the OpenGitOps principles (https://opengitops.dev/), Argo CD (https://argo-cd.readthedocs.io/en/stable/) and Flux (https://fluxcd.io/flux/)
- policy as code: Open Policy Agent (https://www.openpolicyagent.org/docs) and Conftest (https://www.conftest.dev/)

## Cost

- The platform's pricing page and calculator, of which the research opened none, each being the page of the service the project uses
- the FinOps Framework, "FinOps Framework Overview" (https://www.finops.org/framework/)
- "Cost Optimization Pillar - AWS Well-Architected Framework" (https://docs.aws.amazon.com/wellarchitected/latest/cost-optimization-pillar/welcome.html), Azure's "Cost optimization quick links - Microsoft Azure Well-Architected Framework" (https://learn.microsoft.com/en-us/azure/well-architected/cost-optimization/) and Google Cloud's "Well-Architected Framework: Cost optimization pillar" (https://docs.cloud.google.com/architecture/framework/cost-optimization)
- the cloud's cost tools: AWS Cost Explorer (https://docs.aws.amazon.com/cost-management/latest/userguide/ce-what-is.html) and AWS Budgets (https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-managing-costs.html), Google Cloud's billing reports (https://docs.cloud.google.com/billing/docs/how-to/reports), Azure Cost Management (https://learn.microsoft.com/en-us/azure/cost-management-billing/)
- Infracost (https://www.infracost.io/docs/) and OpenCost (https://opencost.io/)
- the CI's and the observability service's pricing pages, none opened
- the rule of the case measured or estimated in writing
