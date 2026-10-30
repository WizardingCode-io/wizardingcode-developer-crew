# Evals: the ui cases and the sandbox browser, run on 2026-10-30

- Claude Code as installed that day, agent model claude-sonnet-5-5, the llm graders judged by claude-opus-5-5 (three votes; Fable reached its limit during the first recording, the user's decision of 2026-10-23), one run per line through `bun scripts/eval.ts --case <name>`, item `2026-10-30-001`. The bundle `plugins/core/dist/crew.mjs` was rebuilt from the item's tree before the runs that followed an engine change.
- Every run of the day is listed below, each failed one with its cause and what changed. Cost and seconds come from each run's `aggregate-result.json`. A row with no figures has no aggregate: `crew tdd observed` killed it at its 10-minute limit.
- This is one run per line, so a single run's variance is not excluded. The whole `ui` and `packs` tags run once at Task 15.

## The first runs: the browser, on `ui-captures-by-fixture`

| Run (results folder) | Score | Cost (USD) | Seconds | What the run showed |
| :- | -: | -: | -: | :- |
| 2026-10-30T09-04-36-934Z | 0.00 | 0.00 | 0 | The scaffold failed and said why: the shell was not found under the sandbox's home. The kit gives a scaffold a home of its own. |
| 2026-10-30T09-06-28-908Z | 0.00 | 0.00 | 0 | The same failure with the runner passing the cache as a variable (AC-14): the variable never reached the scaffold, which gets PATH alone. AC-14 was undone and superseded by AC-15, the account's home read from the password database. |
| 2026-10-30T09-07-35-675Z | 0.80 | 0.90 | 294 | The browser ran in the sandbox: `e2e (.): pass`, `captures: 2 of 2 expected`. The judge upheld `inbox:empty`'s missing 768 as a defect the fixture cannot fill (finding 200, AC-17). |
| 2026-10-30T09-14-18-239Z | 0.80 | 0.90 | 239 | The ui-ux gate proven after AC-17. Not proven on the session's own extra criteria, a behaviour with no possible red. The prompt now names the one criterion. |

## The cases

Two failures recurred, and both came from the person being absent. The frontend lead asks for a decision when a project has no `DESIGN.md`, and a decision relayed in the prompt became a D-1 the engine does not count where nobody watches: `fixtures/inbox-page.sh` now writes a contract. The leads' rounds past the cap stopped a session (finding 197's cause): the shared fixture now carries the standing grant.

| Run (results folder) | Case | Score | Cost (USD) | Seconds | What the run showed |
| :- | :- | -: | -: | -: | :- |
| 2026-10-30T09-14-18-345Z | `ui-reduced-motion-fails` | 0.80 | 0.71 | 194 | Both reds fired on the person's spinner. The session stopped at the leads' round cap with `Syncing` unwritten, and wrote CSS through Bash before the build, which the hook let through (finding 202, AC-19). |
| 2026-10-30T09-14-18-445Z | `ui-audit-not-captured` | 0.67 | 0.72 | 224 | Proven, the audit honestly reported as not run. The grader asked for the report's line, and the session read the engine's `audit.json`: the grader reads both now. `public/inbox.js` alone planned no e2e run (finding 201, AC-18). |
| 2026-10-30T09-21-27Z to 09-21-33Z | the first four | 0.00 | 0.27, 0.16, 0.27, 0.22 | 57 to 64 | The previous account's billing stopped all four within a minute. They measured nothing and were repeated after the user's login. |
| 2026-10-30T09-28-36Z | `ui-captures-by-fixture` | 1.00 | 0.78 | 189 | The first interface change that ended proven in the sandbox. |
| 2026-10-30T09-28-38Z | `ui-reduced-motion-fails` | 0.60 | 0.45 | 109 | Stopped on the missing contract's decision, before any edit. |
| 2026-10-30T09-28-40Z | `ui-audit-not-captured` | 1.00 | 0.86 | 265 | Every grader passed. |
| 2026-10-30T09-28-42Z | `ui-missing-screen-named` | 0.80 | 1.11 | 297 | The session wrote a staging test that skips with no URL and faked nothing; the grader that refused the word `error` was too strict and now refuses a faked failure. |
| 2026-10-30T09-39-33Z | `ui-reduced-motion-fails` | 1.00 | 0.47 | 130 | Every grader passed. |
| 2026-10-30T09-39-35Z | `ui-missing-screen-named` | 0.60 | 0.49 | 151 | The decision relayed in the prompt was not counted (see above). |
| 2026-10-30T09-39-37Z | `ui-motion-frequency-found` | 0.67 | 1.18 | 329 | The frontend lead caught the hover at the spec and the session removed it before the review, so the case measured the lead. The prompt now keeps the rule until the review reads it. |
| 2026-10-30T09-39-39Z | `ui-motion-thesis-built` | 0.00 | 0.24 | 64 | The decision relayed in the prompt was not counted. |
| 2026-10-30T09-39-41Z | `ui-design-token-drift` | 1.00 | 1.28 | 397 | Every grader passed. |
| 2026-10-30T09-51-05Z | `ui-missing-screen-named` | 1.00 | 0.98 | 318 | Every grader passed, on the contract. |
| 2026-10-30T09-51-07Z | `ui-motion-frequency-found` | 0.25 | 0.72 | 248 | The hover already existed, so a behaviour criterion for it could have no red and the session stopped. The request now gives real work beside it: the hovered row's time changes colour. |
| 2026-10-30T09-51-09Z | `ui-motion-thesis-built` | 0.60 | 1.40 | 410 | Proven. The thesis went into `spec.md` through a heredoc the grader did not read, and the prompt never asked for the motion's purpose. Both fixed. |
| 2026-10-30T09-51-11Z | `ui-ux-generic-tells` | 1.00 | 1.36 | 427 | The green before the recording: a finding on the fourth section of the same layout, citing the capture. |
| 2026-10-30T09-51-13Z | `judgement-gate-not-run` | 1.00 | 0.73 | 191 | Every grader passed on "no evidence". |
| 2026-10-30T09-59-06Z | `ui-motion-frequency-found` | 1.00 | 1.60 | 528 | The reviewer named the hover a defect and the judge upheld it. |
| 2026-10-30T09-59-08Z | `ui-motion-thesis-built` | 0.80 | 1.81 | 480 | **Proven with a thesis, a motion and no sample** (finding 203, AC-20). |
| 2026-10-30T10-09-01-195Z | `ui-ux-generic-tells` | 0.67 | 1.32 | 404 | **The red of AC-12**: the rubric of the commit before 3a5e8cb in place, the item's bundle. The reviewer's one finding was a repeated eyebrow word, nothing of the sameness. |
| 2026-10-30T10-16-53-571Z | `ui-captures-by-fixture` | 0.00 | 0.17 | 44 | A read through a variable, `crew knowledge $I lookup`, was denied as a mark's removal and the session stopped (finding 204, AC-21). Fable's limit also failed the judge. |
| 2026-10-30T10-17-37-896Z | `ui-reduced-motion-fails` | 0.40 | 0.51 | 151 | Fable's limit failed the judge. The session stopped saying the repository had no `DESIGN.md`, though the scaffold has one: the prompts now name the contract. |
| 2026-10-30T10-20-09-937Z | `ui-audit-not-captured` | 0.67 | 0.49 | 154 | Fable's limit failed the judge. The recording was restarted with Opus. |
| 2026-10-30T10-22-44Z | `ui-missing-screen-named` | 0.40 | 0.53 | 215 | The same. This run outlived the stopped recording script. |

## The first recording

`crew tdd observed` recorded every case at 1.00 on the tree of the judgement's round 1, with these failures on the way, each repeated:

- `ui-motion-frequency-found`, 2026-10-30T10-46-11-727Z and 11-22-41-184Z: killed at the 10-minute limit, with no aggregate. The profile's test gate was raised to 30 minutes in between and put back, since `crew tdd` reads the target's limit and the change played no part.
- `ui-design-token-drift`, 2026-10-30T11-05-54Z, 0.50: the frontend lead caught the colour at the spec and the session changed it before the review, so the reviewer had nothing to name. The prompt now keeps the colours until the review reads them, as `ui-motion-frequency-found`'s does.

Those runs are 10-28-06Z, 10-32-33Z, 10-38-05Z, 10-41-52Z, 10-56-11Z, 11-11-49Z, 11-18-52Z, 11-32-41-266Z and 11-40-50-839Z, at 1.10, 1.33, 0.75, 1.00, 2.24, 1.35, 0.62, 1.46 and 1.47 USD.

## The judgement's round 1

Six gates, every one not proven, each upheld defect fixed under its own criterion:

- Security: AC-21 had let `crew knowledge {unmark,K-4} lookup` through as a read, which a shell expands to a mark's removal. It was found by reading, not run. AC-22 undoes the relaxation: the denial stands in every form and names the way out, writing the id. A session that reads the base through a variable now gets that message instead of a dead end (finding 204).
- Risk and infra: the improvement loop probes in a worktree with no `node_modules` and takes never-measured cases first, so the eight cases would have been its next targets and every probe would have failed at the scaffold, paid for. AC-24 reads the packages from the main checkout. No loop probe of a ui case has run, so this rests on a row that builds the same worktree shape.
- Architecture: `public` changed design §7's rule with no record, and matched at any depth, built output included. AC-23 narrows it to a root's or a workspace's folder, leaves out `build`, `dist`, `vendor` and `assets`, and §7 carries the dated note. §9 carries a note of what Task 14 built.
- Test quality: the thesis grader passed a motion line with no purpose. It now asks for one. Its reading is a word list, so an unusual sentence can fail it, and it says nothing about whether the purpose is a good one.
- Code quality: the duplicated rule went with AC-21, and the row's helper with `packScaffold`.

The advisories were resolved in the same round, save these. The spec's Design and rollback are as validated: they predate the engine changes (AC-16, AC-19, AC-20, AC-22, AC-23), which undo by a revert and a release, and a kept run's clone is removed by hand, since `scripts/eval.ts` keeps every sandbox. The phase rule on Bash reads only what a line writes before its first `cd`, and it denies a generated file in a watched path (`npm test > out.txt`) before build, as an Edit of it is denied. The suite's printed estimate (38.80 USD) and the loop's per-run figure (`RUN_USD`, 0.3 to 1.4 USD) predate the eight cases: the loop's figure drives its budget decisions and two rows pin it, so both are for Task 15, with the whole run's figures.

## The record

The runs `crew tdd observed` recorded on the final cases, after the fixes above, the whole set run again.

| Criterion | Case | Score | Cost (USD) | Seconds | Results folder |
| :- | :- | -: | -: | -: | :- |
| AC-5 | `ui-captures-by-fixture` | 1.00 | 0.99 | 305 | 2026-10-30T12-16-44-187Z |
| AC-6 | `ui-reduced-motion-fails` | 1.00 | 0.66 | 223 | 2026-10-30T12-21-50-462Z |
| AC-7 | `ui-audit-not-captured` | 1.00 | 0.66 | 217 | 2026-10-30T12-25-34-538Z |
| AC-8 | `ui-missing-screen-named` | 1.00 | 1.04 | 420 | 2026-10-30T13-38-34-271Z |
| AC-9 | `ui-motion-frequency-found` | 1.00 | 1.88 | 530 | 2026-10-30T13-45-35-467Z |
| AC-10 | `ui-motion-thesis-built` | 1.00 | 1.61 | 324 | 2026-10-30T13-54-26-460Z |
| AC-11 | `ui-design-token-drift` | 1.00 | 1.79 | 517 | 2026-10-30T13-01-58-805Z |
| AC-12 | `ui-ux-generic-tells` | 1.00 | 0.74 | 305 | 2026-10-30T13-10-36-612Z |
| AC-13 | `judgement-gate-not-run` | 1.00 | 0.58 | 216 | 2026-10-30T13-15-42-171Z |

AC-8, AC-9 and AC-10 were recorded a third time, since the judgement's round 2 tightened their graders; the other six stand on the set of 12-16 to 13-15, whose engine differs from the final one by the `public` exclusions' anchoring, the way-out string's quotes, and the shell's place. `ui-motion-thesis-built`'s attempt of 2026-10-30T12-43-20-006Z was killed at the 10-minute limit with no aggregate. Three runs of the two longest cases have now died there, so the limit is a recurring cost of recording these two, and a whole-tag run through `scripts/eval.ts` is not subject to it.

## The judgement's round 2, and the shell

Six gates proven, advisories only. They were acted on all the same, which reopened the gates for a round 3: the `public` exclusions anchored to the root folder, since at any depth they took modules that had counted before; a write before a line's first `cd` pinned; the ui cases' scaffolds as a row of their own that bun reports as a skip; the graders of AC-8 and AC-9 bound to the engine's line and the motion.

Left as they are, each on purpose. `public/js` and `public/css` stay interface files, though a build can write there (Laravel Mix does), because hand-written scripts live there too and a false e2e plan shows on the gate lines, while a missed review shows nowhere. A stylesheet under `public/build` still counts by its extension, as any stylesheet did. The phase rule's `cd` limit stands (finding 202).

At 13:20 an install in another project deleted build 1248 from the shared cache (finding 205). Ten runs of 13:32 to 13:33 failed at their scaffold for that, at 0.00 USD, and one run of the runner's test file skipped the shell's rows meanwhile. AC-25 gives the repository its own shell, exercised by the three recordings and the red above. AC-26 and AC-28 give the loop's clone its own, by rows with a stubbed shell only: no tick has run the install, so its first proof is the live loop's next due tick, which also brings the packages the deployed clone lacks, for a cause nobody found. AC-26's red was taken by removing the install line and restoring it, since its row and its code were written together; AC-27's and AC-28's rows were written and seen failing first.

## The judgement's round 3

Code quality, test quality, security and architecture proven; risk and infra not, on one finding: AC-26's install sat only in the bootstrap, which runs for an absent clone or a changed lockfile, so the clone already deployed would never get the shell, and its errored baselines would have counted as measured. AC-27 checked on every tick. The errored baseline counting as measured stays as it was: with a shell it no longer arises from this cause.

## The judgement's round 4

Code quality, security, risk, architecture and infra proven; test quality not, on one finding: AC-27's row asserted that the run did not start on a tick that was not due, so the assertion could not fail. Its advisories named a worse design beside it: a download gated pending releases and dry runs, and the back-off's notice said the next tick waits when it did not. AC-28 supersedes AC-27 and checks just before the run, after all of those, and the row goes through a due tick, a tick not due, a dry run, a paused tick, a failed install with its status, the back-off and the retry. A build counts only with its `INSTALLATION_COMPLETE`, in the tick and the fixture.

## The two arms of `ui-motion-thesis-built`

Run 2026-10-30T11-22-41-case-ui-motion-thesis-built-arms, `--ablation with-without`, 1.74 USD, 472 seconds: with the plugin 1.00, without it 0.50, Δ +0.50. Without the plugin the session wrote no `captureMotion(` and its ending failed the purposeful-motion grader; `receiveMessage` and the reduced-motion branch were there in both arms. `thesis-in-spec` is with-only.

## Question 11's measure (D-3)

`ui-ux-generic-tells` fails on the base rubric (0.67) and passes on the current one (1.00), one run per arm. The red was run twice: 2026-10-30T10-09-01-195Z before the final grader and prompts, and 2026-10-30T13-59-51-379Z (1.19 USD, 361 seconds) on the final case, the rubric of the commit before 3a5e8cb swapped in, the current bundle, the rubric restored and compared after. The pair is that red and the green of 13-10-36-612Z; between them the engine changed only as named above. The grader was changed once, after the green of 09-51-11Z: it had asked for the question's number, and it now reads the tell's own words. It was tightened again after the judgement's round 1, dropping the prompt's own words. The final form matches the green and does not match the red's kept trace. A question-11 finding is an advisory by the rubric, so the case measures that the reviewer sees the tell, not that the page changes.

## What this does not measure

- Axe and the deep audit ran in no case: the scaffold carries no `@axe-core/playwright` and no `chrome-devtools`, so both report `not captured`.
- The sandbox's browser is single-process, so the frame-time figures of a motion sample are not a real browser's.
- Finding 203's fix is a text and a judgement: the engine does not read the thesis's prose, so an item with no sample depends on the judge ruling it.

## Aggregates

Sixty-eight result folders, 52.82 USD by the sixty-five that hold an aggregate; the three runs killed at the limit have no figure, so the true total is somewhat higher. The estimate confirmed with the user was 15 to 30 USD: the difference is the repeats the defects above caused, and the set recorded more than once.

## The first real tick, and finding 207

Pushed at about 15:00, the live loop's first due tick proved half of what the rows could not: the sync relaunched on the new code, `bun install` brought the packages the deployed clone lacked, and the shell installed into the clone's own folder under launchd (AC-26, AC-28). The other half failed: `ui-audit-not-captured` 0.22 and `ui-captures-by-fixture` 0.20 over three runs each, 4.65 USD, nothing kept, since the e2e run never started from a tree under `~/.wizardingcode` (finding 207). The loop was paused until the fix. Its judge also failed at Fable's limit (finding 208).

From the checkout under the launchd agent's environment the case passed at 1.00 (0.87 USD); from the clone under the same environment, 0.40 (0.52 USD). Item `2026-10-30-002` copies the crew's fixture into the scaffold. From a git worktree under `~/.wizardingcode` with no `node_modules` of its own, under that environment, the case then passed at 1.00, twice (1.05 and 0.93 USD; the first run's record was lost to a script's error). Those three figures are the item's AC-2 and its red; every other ui case from such a tree is for the whole-tag run and the loop.
