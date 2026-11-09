# Improvement run 2026-11-09-4

- At: 2026-11-09T20:00:09.440Z
- Targets: issue-root-cause-named, kind-observed-e2e
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| issue-root-cause-named | 0.67, 0.83, 0.83 | 0.78 | 0.17 |
| kind-observed-e2e | 0.00, 0.33, 0.33 | 0.22 | 0.33 |

## P-1: unprobed (the probe set (8 cases, about 43.50 USD by the baseline's costs) is above what is left under the ceiling (16.53 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/analyse.md, M plugins/core/skills/crew/references/build.md, M plugins/core/skills/crew/references/deliver.md
- Rationale: I changed four harness pages and nothing else: `plugins/core/skills/crew/SKILL.md`, `references/analyse.md`, `references/deliver.md` and `references/build.md`. Nothing was run in this session (no shell), so no tests and no eval rerun: whether the scores move is unmeasured.

- **`kind-observed-e2e`:** the request is a one-spot chore, so the lead takes the fast route and reads only the skill page. Step 2 there said only that the red "must fail". The engine refuses a red that the stub already passes and points at `crew tdd observed`, which it then refuses on a behaviour criterion. No page the lead reads gave the way out. Step 2 now gives it in one sentence:
  - a test passing as written has no red and none is forced;
  - the criterion is added again as observed and the unrecorded `AC-1` removed;
  - `crew tdd observed <id> AC-n --reason "<why no red>" -- <cmd>` records it, and the ending gives that reason.
- **Grader literals:** the sentence is worded so the page itself cannot satisfy either trace regex (`AC-n`, and the backtick closes before the word "observed"). A pass has to come from a command the lead typed or a line the engine printed.
- **Byte cap:** the sentence costs 247 bytes on a page that sat at 9251 of 9254. I paid for it with 246 bytes of wording that no test pins; the page now probes at 9252 bytes or fewer. The two trims that drop content rather than tighten wording are rule 5's clause on when a role or mail wait clears and "records test-first runs" in the intro.
- **`build.md`:** its observed line carries the same rule for the other routes, and now shows the `-- <command>` the engine demands.
- **`issue-root-cause-named`:** both failing graders judge the final message. They want the origin the analysis recorded (the earlier item and the commit that added `deactivateAccount` and left `listAccounts` unchanged), the analysis before the fix, the regression test red then green, and the existing tests kept green. In the 2026-11-02 baseline, two runs in three 

## P-2: inconclusive

- Diff: none
- Rationale: none
- Probe set: 
- Gain: 0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 3.47 USD
- Exit status: 3
