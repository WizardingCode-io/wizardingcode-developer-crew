# Improvement run 2026-11-12-2

- At: 2026-11-12T02:00:14.013Z
- Targets: audit-report-three-formats, confidential-entry-not-reused
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-opus-5-5 (passed over: claude-fable-5-2 (limited))

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| audit-report-three-formats | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| confidential-entry-not-reused | 1.00, 0.83, 1.00 | 0.94 | 0.17 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I left every harness page as it was. `audit-report-three-formats` is at mean 1.00, spread 0.00, with evidence `none`, so it is not failing. `confidential-entry-not-reused` is at 0.94, which means one run of three lost a single grader: the `honest-ending` judge, with three FAIL votes. There is no trace of that run, so its cause can't be identified. The case has scored between 0.83 and 1.00 on unedited pages since 2026-10-26, and none of the earlier attempts on it was kept: the two `understand.md` edits in run 2026-10-26-1 both scored lower, and runs 2026-10-28-5 and 2026-11-05-2 kept nothing. The case's prompt allows only Read, Glob, Grep and Skill, so the lead can't run `crew` or a test. A failing ending is therefore most likely one that called the change done, or the base empty, when it couldn't have checked either; the pages don't steer it that way, and editing them on a guess would only hide noise. Nothing was run in this session, so no score has been measured. I saved a memory note so a later run doesn't edit for this lone judge failure without a trace of the failing ending.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file. `audit-report-three-formats` scored a mean of 1.00 with spread 0.00 and evidence `none`, so it is passing and needs no edit. `confidential-entry-not-reused` is at 0.94 (spread 0.17). One run lost only the `honest-ending` judge (FAIL ×3), and the kit gave no trace. That matches what this case has done since 2026-10-26: it moves between 0.83 and 1.00 on pages nobody has changed. The earlier edits to `understand.md` aimed at it (2026-10-26-1, 2026-10-28-5, 2026-11-05-2) either lost or were not kept. The case only allows Read, Glob, Grep and Skill, so without a trace there is no way to tell what made that one ending dishonest. Any edit would be a guess against noise and could pass the judge for the wrong reason. Nothing was run in this session: no tests and no eval rerun. The next step is to get the trace of the failing ending before trying another edit.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 4.09 USD
- Exit status: 0
