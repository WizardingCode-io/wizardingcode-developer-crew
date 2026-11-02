# Improvement run 2026-11-02-6

- At: 2026-11-02T18:00:07.221Z
- Targets: gate-scoped-to-change, kind-preserve-not-behavior
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-scoped-to-change | 0.60, 0.60, 0.60 | 0.60 | 0.00 |
| kind-preserve-not-behavior | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. The `todo-gated` grader wants the engine's `T-n gate round 1: pass` line, which only `crew task <id> gate T-n` prints, and the `web-not-run` judge wants the ending to report that todo gate with its apps/api test run and say apps/web's tests were not part of it; every recorded run of the case shows `reads: []`, so the lead takes the fast route and reads nothing but the skill page, which is why the earlier edits to `plan.md` and `build.md` never moved the score. That page covered the todo loop only for "a request in several parts" started with `--part`, "after each commit", so a request asked as one todo in this checkout read as plain work (the engine would also refuse `--part` on an item with no parts and refuse `note` without `--text` where there is no plan.md), and the lead went from green straight to `crew gate run`. The fast-route paragraph now says a request asked as a todo runs the loop too, between green and the gate run with no commit, gives `--text "<todo>"` for the no-part case, and says the todo's gate runs its target's tests alone and that the ending says so and that a sibling's ran only in the item's gate run; step 3 points at that loop. The addition is about 190 bytes on a page measured at 9252 against its 9254-byte ceiling, so I trimmed about 210 bytes of wording no test pins (the intro's "The `crew` command", the Gate row's "as subagents", the Conclave and Build rows' spare words, rule 4's parenthetical on "nothing to decide", its "Gates are never skipped" sentence that rules 2 and 4 already cover, its `claude -p` and "the default" asides, and rule 5's "of the gap round"), counted by hand since this session has no shell; every pinned regex and sentence of the skill tests stays intact, and no test or eval was run.
- Probe set: gate-scoped-to-change, kind-preserve-not-behavior
- Gain: 0.20

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| gate-scoped-to-change | 0.80, 0.80, 0.80 | 0.80 | 0.00 |
| kind-preserve-not-behavior | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: unprobed (the probe set (2 cases, about 5.37 USD by the baseline's costs) is above what is left under the ceiling (0.00 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one file and nothing else: `plugins/core/skills/crew/SKILL.md`. The `gate-scoped-to-change` case is a one-spot feature with nobody present, so the lead takes the fast route and reads only the skill page (every recorded run shows `reads: []`), and its stable 0.60 is exactly the two graders that depend on the todo loop: `todo-gated` is a regex for `T-n gate round 1: pass`, which the engine prints only at `crew task <id> gate T-n`, and `web-not-run` is a judge that wants the ending to report that todo gate with its apps/api test run and to say apps/web's tests were not in it. The fast-route paragraph covered only "a request in several parts" with `--part` "after each commit", so a lead asked to "plan it as one todo" had no command that fit (a one-todo item has no parts and no plan.md, so `crew task note` without `--text` is refused), did the three calls and ended on the item's verdict, which is the trace the baseline shows. The paragraph now says a request for a todo in this checkout, or one in several parts, runs `crew task <id> note T-n` (with `--text "<todo>"` when there is no part), `gate T-n` and `brief T-n` after each green, with no commit needed since an inline todo's gate and brief run on the declared scope, and that the todo gate tests its files' target alone, so the ending says its runs and that the sibling target's tests were not in it while the item's gate run covers the whole tree. Every pinned regex and sentence of the fast-route section and the rules is intact (the "several parts … one item … a todo per part" and `--part "<text>"` orders, note before gate before brief, the fix parenthetical, the sourced-request pointer, the `--observed` sentence, rule 5's question-and-decision regex, rule 8 whole). The page sits at the 9254-byte ceiling, so the addition (about 214 bytes by hand count) is paid for by trimming unpinned clauses that other pages or the engine's own output carry (about 266 bytes): step 1's "With criteria the item is in build", rule 

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-298
- Cases no run has measured (never probed): none
- Cost: 21.14 USD
- Exit status: 0
