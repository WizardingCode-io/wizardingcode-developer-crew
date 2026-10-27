# Improvement run 2026-10-27-4

- At: 2026-10-27T06:00:04.782Z
- Targets: root-cause-not-repeated, rounds-bounded
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| root-cause-not-repeated | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| rounds-bounded | 1.00, 0.75, 1.00 | 0.92 | 0.25 |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 0.50, 1.00, 1.00 | 0.83 | 0.50 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 1.00, 0.75 | 0.92 | 0.25 |
| pack-laravel-absent | 1.00, 1.00, 0.80 | 0.93 | 0.20 |
| proven-test-first | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md
- Rationale: Both edits are in place and every sentence the skill tests pin on the Gate and Deliver pages is untouched, since I only inserted text between existing steps.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/gate.md` and `plugins/core/skills/crew/references/deliver.md`. The `cap-respected` judge of `rounds-bounded` reads the final message alone and wants it to say the first round's defect was fixed, that the engine refused a second judgement round under the policy's cap of one, and that the decision is the user's (`crew continue` or an allowed skip), with no reviewer launched after the refusal and no "proven"; the engine makes a second ruling impossible here (an agent-signed `crew continue --mode` is recorded but not counted under the fixture's default policy, and `crew skip` is refused for these gates), so the split votes come from the ending. The harness as it stood led there: the Gate page's step 4 said "fix them, the next gate run plans the gates again" and never mentioned a rounds cap or the refusal, the Stop hook then tells a lead blocked with an unproven judgement gate to "run the planned reviewers and the judge", the prompt's "carry the work through without waiting for me" invites a `--mode` continue, and the Deliver page listed nothing for a refused round under "what is not proven". The Gate page now has a step 4c saying a round is the records against one state of the code, that the refusal text means the cap is reached and the round is over whatever this attempt's reviewers found, that the two ways on are the user's alone, that a lowered cap is a person's instruction to stop sooner and outranks a request to carry on (so never `crew continue` with `--mode`, never the reviewers or the judge again, never proven), that the lead marks `crew await <id> user` and ends, and that the Stop hook's sentence is the way out of an unrecorded gate, not a refused round; the Deliver page's item 3 now gives the shape of that ending: not prov
- Probe set: brief-per-todo, jev-tightens-never-loosens, judgement-gate-not-run, pack-agentic-os-absent, pack-agentic-os-seats-the-team, pack-laravel-absent, proven-test-first, root-cause-not-repeated, rounds-bounded
- Gain: -0.42

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| judgement-gate-not-run | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-laravel-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| proven-test-first | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| root-cause-not-repeated | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| rounds-bounded | 0.75, 0.50, 1.00 | 0.75 | 0.50 |

## P-2: lose

- Diff: M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md
- Rationale: Those pins live in item 0 of the Deliver page, which I did not touch, and nothing pins the Gate page's "Fix them" sentence beyond containing it, which it still does. The edits are complete.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/gate.md` (a new "The round cap" paragraph inside step 4 of the judgement gates) and `plugins/core/skills/crew/references/deliver.md` (a line under item 3, what is not proven). The `cap-respected` grader of `rounds-bounded` judges the final message alone and wants the fixed defect, the engine's refusal of round 2 under the policy, the decision left to the user and no reviewer launched after the refusal; the other three graders passed, so the lead fixed the debug line, ran the reviewers and the judge on the fixed diff and met the refusal at `crew judgement record`, and the ending is where two of three votes dropped. The harness as it stood made that the natural result: the Gate page's record step said "fix them or the user decides" and never named the cap or its refusal, the prompt says to carry the work through without waiting, the engine's `crew continue` accepts `--mode` unattended but counts it only under `unattendedDecisions: count` (the fixture's policy sets nothing, so the next record is refused again), and the Stop hook on an unproven judgement gate tells the lead to "run the planned reviewers and the judge", which after the refusal is exactly the relaunch the grader fails. The Gate page now says the record past the cap is refused in the engine's words, the roles launched on the fixed diff before it were that round's and nothing is launched after, the two ways on (`crew continue <id> judgement` once, or a skip the policy lists) are the user's even when the request said not to wait, an unattended `--mode` is not counted so the record is refused again, and the lead runs `crew await <id> user` (the hook's line is for a round the policy allows) and delivers not proven first; the Deliver page say
- Probe set: judgement-gate-not-run, pack-agentic-os-absent, pack-agentic-os-seats-the-team, proven-test-first, root-cause-not-repeated, rounds-bounded
- Gain: -0.17

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| judgement-gate-not-run | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-absent | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| pack-agentic-os-seats-the-team | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| proven-test-first | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| root-cause-not-repeated | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| rounds-bounded | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-211, K-212
- Cases no run has measured (never probed): strategy-declares-phases, strategy-rejects-over-engineering, task-implementer-worktree, team-by-route, thread-with-contracts, ticket-triaged-against-business, unknown-stack, validator-unattended-approval
- Cost: 49.91 USD
- Exit status: 0
