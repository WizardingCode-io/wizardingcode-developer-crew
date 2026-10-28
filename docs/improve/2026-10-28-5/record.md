# Improvement run 2026-10-28-5

- At: 2026-10-28T22:00:09.104Z
- Targets: audit-report-three-formats, confidential-entry-not-reused
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| confidential-entry-not-reused | 0.83, 0.83, 0.83 | 0.83 | 0.00 |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |
| strategy-declares-phases | 0.40, 1.00, 1.00 | 0.80 | 0.60 |
| ticket-triaged-against-business | 0.33, 0.67, 0.67 | 0.56 | 0.33 |

## P-1: inconclusive

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/receive.md
- Rationale: All pinned patterns still match, and nothing further depends on another lookup. The edits are complete.

I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` and `plugins/core/skills/crew/references/receive.md`. The `goes-on` grader of `confidential-entry-not-reused` is a regex over the trace for `phase (specify|conclave|plan|build)`, and the engine prints that word only from `crew phase <id> next` (the single place in `work.ts` that moves a phase) or from `crew status`; a standard-route item cannot reach build without printing it, since the hook denies source edits before build on that route. The failing runs did the work and the gates (the record shows both judgement rubrics read and the honest-ending judge passed on a red-then-green story), so the only shape that fits is the fast route, which the router grants to a `fix` or a `chore` in one spot and never to a feature. The skill page, the one page every run reads, invited exactly that: its fast-route line said "A clear request, one spot, no risk area: `route fast`" with no word on the type, and the typed-questions table listed `chore` beside `feature` with no rule between them, so a lead reading "add cache expiry to one file" as a small one-spot change typed it as a chore, got `route fast`, and never saw a phase word. The two earlier proposals on this case rewrote the Understand page's wait, a page the failing runs never read, and left the case's scores unchanged. The fast-route line now names the router's own condition and adds that a behaviour the code lacks, however small, is a `feature`, never fast; the Receive page's step 1, where the answers are given, carries the same rule in full (fix or chore in one spot goes fast, a new behaviour is a feature and goes standard, a chore or a refactor changes no behaviour, pointing to the Specify page that already says so). The skill page sits at its 9254-byte ceiling, so the 85 bytes added were paid for by trims of wording no test pins (the "
- Probe set: audit-report-three-formats, confidential-entry-not-reused, gap-erasure-or-deactivation, strategy-declares-phases, ticket-triaged-against-business
- Gain: 0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| confidential-entry-not-reused | 0.83, 0.83, 1.00 | 0.89 | 0.17 |
| gap-erasure-or-deactivation | 0.67, 0.67, 0.67 | 0.67 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 21.68 USD
- Exit status: 2
