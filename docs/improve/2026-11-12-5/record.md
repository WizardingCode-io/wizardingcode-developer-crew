# Improvement run 2026-11-12-5

- At: 2026-11-12T06:00:15.697Z
- Targets: pack-laravel-blade-tags-the-view, pack-next-refines-the-gates
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-opus-5-5 (passed over: claude-fable-5-2 (limited))

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-laravel-blade-tags-the-view | 0.71, 0.86, 1.00 | 0.86 | 0.29 |
| pack-next-refines-the-gates | 0.71, 1.00, 1.00 | 0.90 | 0.29 |

## P-1: refused (the editor changed nothing)

- Diff: none
- Rationale: I changed no file under `plugins/core/skills/crew/` or `plugins/core/agents/`, and I ran no tests or eval reruns. In each case, one run out of three never built anything. The next case's failing run never wrote `lib/slugify.ts`, so the test gate line `gate-ran` looks for (`test (.): pass`) never printed. Its ending still passed. The laravel case's failing run never wrote `resources/views/components/alert.blade.php` and never recorded UI/UX as not run, and its ending failed two judge votes of three. The other two runs of each case passed everything. Both cases scored 1.00 in all three runs on 2026-11-05-5, and the only harness edit kept since then is the 2026-11-08-6 change to the `goldfish-comprehension` agent's description. That agent belongs to spec review, not to the steps these items stopped at, so no page I may edit explains the drop. This matches what `team-by-route` showed on 2026-11-11: a feature item that stops before Plan, with no trace. My guesses, none of them checked, are that the tech leads sent the spec back at validation, that a decision blocked Plan, or that the run hit its limit of 80 turns or 1800 seconds. The round limit alone can't explain both cases, because the laravel fixture grants extra rounds and the next fixture doesn't. Engine commits made since 2026-11-05 are also possible causes. An edit without a trace would be a guess, and the skill page is already at its byte limit, so I left the harness as it was. I saved a memory note saying what to look for when a trace of the failing run is available.

## P-2: refused (the editor changed nothing)

- Diff: none
- Rationale: I didn't change any file in the harness. In both cases, one run out of three never wrote its target file, and there is no trace of those runs. In `pack-next-refines-the-gates`, `lib/slugify.ts` is missing and `gate-ran` fails. That's expected, because nothing was built for the gate to test. In `pack-laravel-blade-tags-the-view`, `alert.blade.php` is missing, `ui-ux-not-run` fails, and two of the three `honest-ending` judge votes are FAIL. Both cases scored 1.00 in all three runs on 2026-11-05 with the same pages. The only harness edit kept since then was to the goldfish-comprehension agent's description, and that agent isn't on this route. That leaves no page to blame. The likely cause is a feature item that stops before Plan: the lead returns the spec, a decision blocks Plan, or the run hits its turn or time limit. I can't tell which without a trace, and none of the records under `docs/improve/` after 2026-11-09-6 mentions either case. Any edit now would be a guess, and the skill page is already at its byte cap. Nothing was run in this session (there's no shell), so neither score has been re-measured. I added a note about this second session with the same evidence to the existing memory entry for these cases. The next useful step is a trace of a failing run, to see where the item stopped.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 7.89 USD
- Exit status: 0
