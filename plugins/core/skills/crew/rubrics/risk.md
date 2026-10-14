# Risk rubric

The risk gate asks what goes wrong in production and what undoes it: rollback, data, third parties, the first hour after deploy. It has no deterministic input; it is a reviewer's reading of the spec, the plan and the diff against each other. Full route only.

## What the reviewer receives

The spec (`spec.md`, its "Risks and rollback" section in particular), the plan (`plan.md`), the diff (`review/diff.patch`), the files it touches (`review/files.txt`) and the risk areas the engine found.

## Questions

1. The first hour: what fails first if this is wrong, and how would anyone know (a log line, a metric, an alert, a complaint)? A failure nobody would see is the worst answer.
2. Rollback: can the deploy be reverted without losing data written in between; does each migration have a down path or a stated reason why not; is a backfill or a data fix reversible?
3. Irreversible writes: what the change deletes, overwrites, sends or charges; is the first run limited (a count, a dry run, one tenant), and is the limit in the code or only in the plan?
4. Third parties: what is sent to or read from outside; what happens when the third party is down, slow or answers wrong; what each call costs and how many the first run makes?
5. Dependencies between deploys: does the change assume something another deploy, another project or a configuration value must provide first, and does the spec say so? (C-13 pointed customers at pages that did not exist yet.)
6. Hands at deploy: does the plan name the manual steps (a value to set, a job to run once, a flag to turn), who takes them and in which order?

## Defect or advisory

A **defect**: an irreversible write with no limit and no dry run on its first run (3); a migration with no down path and no stated reason (2); a dependency on something not yet deployed that the spec does not state (5); a failure with no way to see it in the first hour (1); a third-party call whose wrong answer is written without handling (4). An **advisory**: a rollback that exists but is manual; a flag that would have made the first hour safer; a manual step the plan names without an owner (6); a cost estimate missing for a bounded first run.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A risk the repository already carried (a table with no backup, a provider with no timeout anywhere) is debt, named under "Outside the change"; the gate asks what this item adds to it.
