# Infra rubric

The infra gate asks what the change does to the pipeline and the deployment: which steps run and in what order, what identity each runs under, where secrets live, how a destructive step is undone, and whether the result runs anywhere but one machine. It runs when the change touches infrastructure, or when the team policy seats DevOps.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the risk area `infra` with the paths that raised it, the profile's gates (`.crew/profile.json`) and where the project keeps its pipeline, its deployment and its environment files.

## Questions

1. Pipelines: does every gate the profile knows run before a deploy step; is there a job the project's own pipeline cannot run (a tool it lacks, a runner it does not have)?
2. Secrets: is there a credential in a file, an image, a log line or a variable's default that is committed?
3. Permissions: is an identity widened; does a role carry more than the step needs; does a step run as an administrator where its neighbours do not?
4. Rollback: is a destructive step's rollback stated (a release undone, a schema change reverted, a bucket restored)?
5. Hosts: is a path, a name or an address tied to one machine or one account?
6. Reproducibility: where the project pins its toolchain, does the change pin too; does a build depend on the time it runs?

## Defect or advisory

A **defect**: a secret in the diff; a widened permission; a deploy step before the gates; no rollback for a destructive step; a job the pipeline cannot run. An **advisory**: a duplicated job; an unpinned tool where neighbours pin; a comment missing on a manual step; a host name in a comment.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A pipeline that never ran the tests before deploying is debt; a new deploy step the diff adds before them is a defect, even though it matches its neighbour.
