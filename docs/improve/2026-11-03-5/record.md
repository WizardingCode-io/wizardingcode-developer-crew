# Improvement run 2026-11-03-5

- At: 2026-11-03T14:00:07.268Z
- Targets: brief-per-todo, decision-register-reread
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 1.00, 0.40, 1.00 | 0.80 | 0.60 |
| decision-register-reread | 1.00, 0.75, 1.00 | 0.92 | 0.25 |

## P-1: unprobed (the probe set (25 cases, about 193.32 USD by the baseline's costs) is above what is left under the ceiling (5.29 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/understand.md
- Rationale: The edits are complete, every pinned string on the three pages is intact, and no tests or evals were run in this session, which has no shell: the skill page's byte change is a hand count, net about 40 bytes smaller than before, so it stays under its 9254-byte cap.

I changed three harness pages and nothing else: `plugins/core/skills/crew/SKILL.md`, `plugins/core/skills/crew/references/understand.md` and `plugins/core/skills/crew/references/conclave.md`. Both cases are features, and the router gives the fast route only to a fix or a chore in one spot, so their leads follow the method table on the standard route; the failing runs read no reference page or a stray one, which is why the fast-route paragraph on `--part` (pinned by tests to that section) never reached them. For `brief-per-todo`, the three brief graders drop together while the functions and the ending pass, which is an item started without `--part`: the engine then demands no todo's note, gate or brief, and `# Brief: T-n` is printed only by `crew task <id> brief`. The Receive row of the method table now says a request in parts ("two todos") takes `--part` per part and shows `[--part "<text>"]` in its `crew start` form, and the Plan row says a part's todo is noted with `--part P-k`, then gated, then briefed; once the parts exist the verdict names the exact commands until each part is briefed. For `decision-register-reread`, the lost grader is the first item's `Proven:` line alone, and the engine makes a stuck first item the natural result of opening a decision for a choice the request already made: in the kit's headless session `crew decide` runs only with `--mode`, the answer is recorded as the agent's and not counted under the default `wait` policy, and the Plan guard keeps listing it as missing. Rule 5 of the skill page now says a choice the request settles in the user's words is a constraint and a criterion, never an opened decision; the Understand page says the same under its decisions bullet, gives th

## P-2: unprobed (the probe set (15 cases, about 132.58 USD by the baseline's costs) is above what is left under the ceiling (0.00 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/conclave.md
- Rationale: The edits are in place and verified against every pin the skill tests hold. No tests or evals were run: this session has no shell, so the byte figure comes from regex length probes (the page is between 9234 and 9254 bytes after the edit, under its cap).

I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` and `plugins/core/skills/crew/references/conclave.md`. Both failing cases are features, so their leads run the standard route from the method table, and every failing run recorded `reads: []`: the skill page was the only text they had. For `brief-per-todo`, the three missing graders want the engine's `# Brief: T-1 of <id>` text with its `## Changed` list, which only `crew task <id> brief T-n` prints, yet the page's method table said nothing of a todo's gate or brief (the Plan row read "todo in this checkout: `note`") and kept the whole loop inside the fast-route section, under a sentence that reads as fast-route-only, so a standard-route lead proved the two criteria with one gate run and never printed a brief. The Receive row now says a request in parts ("two todos") starts with `--part "<text>"` each, which makes the engine's own verdict demand the note, gate and brief per part with the exact commands; the Plan row now says each todo in this checkout runs `note`, `gate`, `brief` and points at the loop below; and that paragraph now says it applies on every route. For `decision-register-reread`, the lost grader is the first item's `Proven:` line, and the shape (register read, decision quoted, honest ending) is a first item stuck at Plan: the lead opens a `D-n` for the choice the request already made, answers it with `--mode` as the kit's headless session demands, and under the fixture's default `unattendedDecisions: wait` that answer is never counted, so Plan is refused for good. Rule 4, right after the sentence that says when an agent's decision counts, now says a choice the request made is a criterion, never a `D-n`; the Conclave page

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 20.09 USD
- Exit status: 0
