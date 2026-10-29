# Improvement run 2026-10-29-2

- At: 2026-10-29T14:00:09.290Z
- Targets: pack-laravel-blade-tags-the-view, pack-laravel-blade-tags-the-view-absent
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-laravel-blade-tags-the-view | 0.86, 0.71, 0.86 | 0.81 | 0.14 |
| pack-laravel-blade-tags-the-view-absent | 0.83, 0.83, 0.83 | 0.83 | 0.00 |

## P-1: unprobed (the probe set (10 cases, about 44.04 USD by the baseline's costs) is above what is left under the ceiling (14.54 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md
- Rationale: I made one edit to `plugins/core/skills/crew/references/conclave.md`. In the gap round's list of checklist kinds, `screen` was the only kind with no description beside it, so I added one: `screen` (a page, a dialog, a form, a view, or a component a view renders). The first four items come from the screen checklist's own description. Only one of the two `screen-checklist` failures is a real one. The engine prints `.packs/laravel/checklists/screen.md` only when `crew pack files checklists screen` runs, and earlier runs on this bundle that did run it passed. So the failing run most likely filed the alert component under another kind or `none`, and the gloss makes a Blade component on `welcome.blade.php` clearly a screen. I haven't seen the failing trace and haven't re-run the case. Another possibility is that the run took the fast route, which never reaches the gap round. The description can't fix that, and I didn't change the route rules. The two `honest-ending` failures are not about the harness: the judge's call hit the Fable usage limit, so there was no verdict on the ending. Re-running both cases once there's quota will score them. No test pins the edited sentence.

## P-2: unprobed (the probe set (10 cases, about 44.04 USD by the baseline's costs) is above what is left under the ceiling (14.11 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md
- Rationale: I made one small edit to `plugins/core/skills/crew/references/conclave.md`, in the "Pick the checklists" paragraph. The `screen` kind there now has a short definition: anything a person sees, such as a page, a view, a template, a component or a partial, in whatever the stack calls it (Blade, Vue or JSX alike). This was the only real failure. The `honest-ending` graders in both cases never scored the ending: they "threw" because the judge model hit its usage limit. So they're infrastructure noise, not a harness problem, and I didn't touch anything for them. The `screen-checklist` grader passes only when `crew pack files checklists screen` prints `.packs/laravel/checklists/screen.md` into the trace. A feature never takes the fast route, and the engine won't let a standard item into Plan without a checklist read. That means the failing run (one of three, going by the 0.14 spread) must have read a different kind, or recorded `none` with a reason. My guess is that it didn't see "an anonymous Blade component" as a `screen`, because `screen` was the only kind on that line with no definition next to it. I couldn't see the failing trace, so this cause is inferred and nothing has been re-run. The pinned strings on the page (the kinds line's `motion`/`design-contract`, the `crew pack files checklists` wording) are untouched. The new words don't include the pack's path, so `no-screen-checklist` in the absent case still holds.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 5.89 USD
- Exit status: 0
