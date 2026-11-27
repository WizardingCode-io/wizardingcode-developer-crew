# Infra rubric

The infra gate asks what the change does to the pipeline and the deployment: which steps run and in what order, what identity each runs under, where secrets live, how a destructive step is undone, and whether the result runs anywhere but one machine. It runs when the change touches infrastructure on the full route, or whenever the team policy seats DevOps.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the risk area `infra` with the paths that raised it, the profile's gates (`.crew/profile.json`) and where the project keeps its pipeline, its deployment and its environment files.

## Questions

1. Pipelines: does every gate the profile knows run before a deploy step; is there a job the project's own pipeline cannot run (a tool it lacks, a runner it does not have)?
2. Secrets: is there a credential in a file, an image, a log line or a variable's default that is committed?
3. Permissions: is an identity widened; does a role carry more than the step needs; does a step run as an administrator where its neighbours do not?
4. Rollback: is a destructive step's rollback stated (a release undone, a schema change reverted, a bucket restored)?
5. Hosts: is a path, a name or an address tied to one machine or one account?
6. Reproducibility: where the project pins its toolchain, does the change pin too; does a build depend on the time it runs?
7. Containers and images, when the diff changes a Dockerfile, a compose file or an image reference: is the base image pinned where the project pins, does the image run as a non-root user where its neighbours do, and does the build context leave out environment files and the version-control folder? The rule: `wizardingcode-devops-environment-containers`.
8. Infrastructure as code, when the diff changes Terraform or OpenTofu, Pulumi, CloudFormation or CDK, Bicep, Ansible, Helm or Kubernetes files: does a resource that holds data or serves traffic get replaced or destroyed, with its rollback stated (question 4), and does the change bring a tool whose licence is not open into a project that does not use it? The rule: `wizardingcode-devops-iac`.
9. Deployment strategies and releases, when the diff changes a deploy job, a release tool's configuration, a feature flag or a version or changelog file: can the release be undone without losing data written in between, and are its manual steps named with who takes them and in which order? The rule: `wizardingcode-devops-deploy-rollback`.
10. Observability and operation, when the diff adds a service, a job, a queue or an endpoint, or changes logging, metrics, alerts or dashboards: would a failure of the new path show in a log line, a metric or an alert the project already reads, and is an alert or a dashboard added as code the project validates? The rule: `wizardingcode-devops-operation`.
11. Platforms and hosting, when the diff adds a platform, a managed service or a cluster the project does not run on (a provider's configuration, a first Kubernetes manifest, a platform's file): does the item's spec state the case it was chosen for, measured or estimated in writing? The rule: `wizardingcode-devops-deploy-rollback`.
12. Cost, when the diff adds a billed resource or raises one (an instance size, a replica count, a database tier, a log retention, a CI runner): does the item's spec state what it costs, or the estimate it rests on? The rule: `wizardingcode-devops-iac`.
13. Backups and disaster recovery, when the diff adds a store that holds data (a database, a volume, a bucket) or changes a backup job, its schedule or its retention: is the new store inside the project's backups, and does a restore step target a test database and never production? The rule: `wizardingcode-devops-deploy-rollback`.
14. The pipeline's supply chain, when the diff adds or changes a CI step that uses a third-party action, image or downloaded tool: is it pinned by a full commit SHA or a verified version, and does the workflow's token carry only the permissions the job needs? The rule: `wizardingcode-devops-pipelines`.

Questions 7 to 14 are answered only when the diff touches their subject, by the trigger each names; questions 11 and 12 read the item's spec, `.crew/work/<id>/spec.md`.

## Defect or advisory

A **defect**: a secret in the diff; a widened permission; a deploy step before the gates; no rollback for a destructive step; a job the pipeline cannot run; an image that runs as root where its neighbours do not; a resource holding data replaced or destroyed with no rollback; a release that cannot be undone without losing data written in between; a new path whose failure no log line, metric or alert would show; a new platform with no case stated in the spec, measured or estimated in writing; a restore step that writes over production; Trivy run through `trivy-action` at a moving tag. An **advisory**: a duplicated job; an unpinned tool where neighbours pin; a comment missing on a manual step; a host name in a comment; an unpinned base image where neighbours pin; an environment file or the version-control folder inside the build context; a tool whose licence is not open brought into a project that does not use it; a manual release step with no owner named; an alert added with no validation; a billed resource added or raised with no cost stated; a new store outside the project's backups; a third-party action at a tag instead of a SHA.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A pipeline that never ran the tests before deploying is debt; a new deploy step the diff adds before them is a defect, even though it matches its neighbour.
