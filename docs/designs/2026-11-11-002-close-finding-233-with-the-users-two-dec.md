# The class of a not-judged cause, and a kept run that was not ruled named for a person

## Problem

The improvement loop (`scripts/improve-loop.ts`, `scripts/improve.ts`; `docs/improve/README.md`, ADR 0015) commits each run's record under `docs/improve/<run>/` in a public repository.

1. When a grader's judge call fails, the record keeps the cause as the CLI's own text, cut at 120 characters and scanned for a secret's shape (`caseFigures`, `causeOf`). That text can name the account or the organisation behind a limit. It also reaches the verdict's reasons, which `record.json` holds, and the stop line of the log. `record.md` prints the word `unjudged` alone, and the commit message of a run that was not judged is a fixed text (`stopped: a run was not judged`, `verdictText`).
2. When the adoption of a kept run cannot be ruled because no judge can answer, the run stays on its branch and is never offered again: `lastRun` has moved past it. The notification gives the adoption's reason, which for one of the endings (`no judge answered (…)`) does not say that nothing was ruled, and names neither the branch nor what a person can do with it.

Finding 233 (`docs/real-use/findings.md`) holds both as advisories, the user's decisions on them (2026-11-11), and four advisories the judgement of item `2026-11-11-001` left for this item. The decisions:

- D-1: the published record carries the class of the cause alone. The user approved it with the words "limit, overload, other" and, asked on 2026-11-11 which words the record uses, chose `limited`, `overloaded`, `failed`: the words the judge probe already writes in the published `adoption/ruling.md`.
- D-2: one bounded second offer of a run that was not ruled. Replaced by D-3.
- D-3: after a measure (see Alternatives), no second adoption by the loop: the run is named for a person.

No record under `docs/improve/` holds a not-judged cause today and no adoption has been "not ruled" (read on 2026-11-11), so nothing published is rewritten.

## Goals

- G-1: A published file of the loop (`record.json`, `record.md`, the files under `adoption/`) carries `limited`, `overloaded` or `failed` for a run that was not judged, and no text of the CLI.
- G-2: The loop's decisions stay as they are: a run not judged at a limit or an overload is measured again; one not judged for another cause counts as measured.
- G-3: A person learns from the tick's notification that a kept run was not ruled, which branch holds it, and where the way to adopt it by hand is written.
- G-4: The four advisories are taken or refused on record, and finding 233 closes.

## Non-Goals

- No change to what is measured, to the ceilings, to the gate in code, to the judge's rule or to which model judges.
- No second adoption by the loop: a run that was not ruled is never offered to the adoption again (D-3).
- No new state of the loop and no new line of `status`.
- No rewrite of published history.
- The eval runner's own `needs-rerun` line (`scripts/eval.ts`, `scanResults`) keeps the cause's text: it is printed to the terminal of the person who ran it and is no file of the loop.

## Open Questions

none. D-1 and D-3 are answered by the user; D-3 replaces the answer to D-2.

## Critical User Journeys

- J-1, a judge at its limit during a measurement. Given a run whose grader's judge call fails with the CLI's limit text, when the run ends, then `record.json` holds `"unjudged": "limited"` for that run of the case and `t's baseline was not judged (limited)` among its reasons, no file of the run's folder holds the CLI's text, the loop's local log holds one line with the bounded text, and the next due tick measures the case again.
- J-2, a kept run and no judge. Given a run that kept a change and an adoption whose two judge candidates are at their limit, when the tick ends, then the notification says the run was not ruled, names its branch, says it is adopted by hand and names `docs/improve/README.md`, whichever of the three endings it was.
- J-3, the person adopts it. Given that notification, when the person follows the README's section (the loop stopped, no pending release, main unchanged outside `docs/` since the run), then the branch is merged and released by the release script, and the loop is resumed.

## Design

### The class of a cause

`scripts/eval.ts` gains `causeClass(text)`, the one classifier: `limited` when the text matches `USAGE_LIMIT`, else `overloaded` when it matches `LIMITED` (a rate limit, a 429, an overload), else `failed`. `probeOutcome` calls it for its last two lines, so the probe and the cause share one rule and one vocabulary. The type is `CauseClass`.

`unjudgedGraders` answers `{ grader, cause, class }`. The class is read from the explanation's whole text after the `JUDGE_FAILED` prefix, made one line by `oneLine` with no cut: a limit's words after the 120th character, or split by a line break, still read `limited`. The cause is cut at 120 characters as today. `scanResults` keeps printing the cause.

`scripts/improve.ts`: `caseFigures` records `unjudged: <class>` in a run's figures in place of the text. `unjudgedCause` answers the class. The verdict's reasons and the stop line read `t's baseline was not judged (limited)`. `measure` holds the kit's result before the figures are built. It logs one line per run that was not judged, to the log alone: `t run 2 was not judged: <grader>: <cause>`. The cause is the bounded text. `causeOf` stays for that line alone: it withholds a cause that holds a secret's shape (`withheld: the cause held a secret (<rule>)`). The script logs through `console.log`: under launchd that is `tick.out.log` in the loop's home, by hand the terminal. Nothing commits either.

`scripts/improve-loop.ts`: `unjudgedAtLimit` reads each cause as a class: `limited` and `overloaded` are at a limit, `failed` is not. A string that is none of the three is a text from a record written before this change and is read by the `LIMITED` pattern, as today.

A revert of this change would make the old reader take `limited` for a cause that is no limit, so a case not judged at a limit would read as measured until `staleDays` pass. That is accepted; the way back is a fix forward.

The adoption's own ladder is not changed: during the ruling, `adoptRun` writes `(limited)` in `ruling.md` for a candidate passed over at a limit or at an overload, by the `LIMITED` pattern. The three words are the same; that file does not tell the two apart, as today.

### A kept run that was not ruled

Three of `adoptRun`'s endings rule nothing: no candidate answered its probe, every candidate was at its limit during the ruling, or the judge's call failed for another cause. Today each returns a reason the tick puts in its notification, the branch stays on origin, and nothing else remembers the run.

`adoptRun`'s answer gains `notRuled: true` on those three endings and on no other, so the tick never reads a reason's text.

In the tick's adoption step, an answer with `notRuled`, of a run measured on Claude models (`provider.claudeModels`), gains, at the end of the notification's reason, `; the run was not ruled and its branch <branch> is kept: adopt it by hand (docs/improve/README.md)`. The words "not ruled" are in the added sentence because one ending's reason (`no judge answered (…)`) does not hold them. The branch is the one `adoptRun` reads: the record's, or `improve/<run>`. The same sentence goes to the tick's log. A run measured on another provider gains no words: `adoptRun`'s not-ruled endings return before its check of the provider, and ADR 0015's decision 3 releases only a run measured on Claude models, so the loop never names for a person a run its own rule would not release. The sentence is built by one function, `notRuledReason(reason, branch, claudeModels)`. Nothing is written to the state, and `status` prints nothing new: a line there would name a run long after a person dealt with it, or after main moved past the tree it was measured on, and invite an adoption the rule forbids.

Other endings also leave a kept branch on origin: main moved beyond `docs/` during the run, the judge ruled "does not hold", the run was measured on a provider that is not Claude, the merge failed, the release did not finish. They are out of this item. In the first three a rule or a judge decided against adopting the run as it is, and the reason says which. A failed merge and a release that did not finish are failures, decided by nobody: the reason names git's first line or points at the log, the failure is what a person fixes first, and a release that failed after its push is resumed by the loop (the pending release). This item leaves the five as they are. The not-ruled ending is the one where nothing failed and nothing decided, so it is the one a person is asked to pick up.

`docs/improve/README.md` gains a section, "Adopting a kept run by hand". Its preconditions, all three:

1. The loop is stopped: `bun scripts/improve-loop.ts stop` pauses it and ends a tick that is running, and the person goes on only when it answers that the tick ended or that no tick is running. `pause` alone is not enough: a tick reads it at its start only, so one already running would go on to merge and release.
2. `bun scripts/improve-loop.ts status` shows no pending release: a release by hand over one the loop still owes would take its version.
3. Main has not changed outside `docs/` since the run (`git diff --name-only <the run's main>..origin/main`, the run's main being the branch's merge base). This is the loop's own rule (ADR 0015, decision 3; finding 172): the figures were measured on that tree. When it has changed, the run is not adopted; the next due tick measures again.

Then: read `adoption/gate.md` and `adoption/diff.patch` in the run's folder, merge the branch into main, release with `bun scripts/release.ts --patch --reason "<the run and its gains>"`, delete the branch on origin as the loop does after its own release (`git push origin --delete <branch>`), and `bun scripts/improve-loop.ts resume`. The section says that the reading is the ruling the judge did not make: the person who merges takes the judge's clause, that no rule of the method is weakened. It quotes `stop`'s three answers and says which one to wait on (`stop requested: the tick … is still ending`).

### The advisories

- (a) Taken. The row `2026-11-11-001 AC-9` of `eval-runner.test.ts` no longer slices `scripts/improve.ts` at fixed texts. It counts, by pattern: in `scripts/improve.ts`, `kitCallEnvironment(` once (inside `callEnvironment`), `callEnvironment(` three times, matched at a word boundary so that `kitCallEnvironment(` is not counted (its declaration and the two calls; its doc comment does not write the name with a parenthesis) and no `kitEnvironment({` spread holding `PATH`; in `scripts/eval.ts`, exactly one such spread, the one `kitCallEnvironment` is.
- (b) Taken. `scripts/improve.ts` builds both environments through one local function, `function callEnvironment(invocation, call)`.
- (c) Refused. The row `2026-11-11-001 AC-11` reads every file of its folder for two texts, so it must not hold them: naming itself as an exception would let a second copy in that file pass.
- (d) Taken in part. `runKit` (`scripts/eval.ts`) builds its environment through `kitCallEnvironment` with no call. Refused for `runImprove`'s `kitEnvironment({ ...deps.env, ...provider.env })` and the two calls of `scripts/improve-loop.ts`: none is a kit call (no runner's variables, no composed `PATH`); each is the allowlist over the process's and the provider's variables, which `kitEnvironment` is.

## Alternatives

Copied from `concepts_brief.md`, each rejected:

- New class words `limit`, `overload`, `other`: the probe's words already name the same three things in published files. The user chose the probe's words (D-1).
- A second classifier in the improve script: it would drift from the shared `LIMITED` pattern.
- The class in the log too: the log is local and is where a failure that is no limit is diagnosed.
- A reader that accepts classes alone: a record the loop's clone writes before it pulls the change would read as measured.
- Class words the old reader's pattern matches: it gives up the probe's vocabulary to serve a revert whose effect is bounded.
- One bounded second offer of a run that was not ruled, made by the loop (D-2): rejected by the user on 2026-11-11 (D-3) after a measure. The offer could only be made on a main that had not moved beyond `docs/` since the first, and main moved beyond `docs/` on 28 of the last 30 days, in 151 distinct hours. So nearly every waiting offer would have ended without an adoption, for a state slot, a nine-step phase of the tick, ten endings and about twenty rows on the loop's automatic release path.
- The second offer without the rule on main: rejected with it. It would adopt a change whose figures were measured on a tree that is no longer main's, which the stale check of finding 172 forbids.
- A `not ruled:` line in `status`, held by a slot of the state (this spec before its review): rejected. Nothing would clear it but a merge of that very branch, so it would stay after main moved and the run could no longer be adopted, and it added a state field and a git call to `status` for a case that has not happened yet.

## Acceptance criteria

The numbers are the engine's and are never reused: AC-1 to AC-11 were this spec's first draft; AC-15 to AC-19, AC-21 and AC-23 to AC-25 belonged to the second offer the user replaced with D-3; AC-27 to AC-29 named the `status` line the review removed; AC-30 and AC-31 were reworded as AC-32 and AC-33 at the leads' validation (the provider, and "stopped" for "paused"). All were removed before any record named them.

- AC-12: `causeClass` answers `limited` for a usage limit's text, `overloaded` for a rate limit, a 429 or an overload, `failed` for any other; `probeOutcome` answers as before through it; `unjudgedGraders` gives each grader's class from the whole explanation, a limit named after its 120th character included.
- AC-13: A run of the improve script whose grader was not judged records the class in its figures and nowhere the cause's text: no file of the run's folder (`record.json`, `record.md`) holds it, the verdict's reasons and the stop line read `not judged (limited)`, and the log alone holds one line with the bounded text, a secret's shape in it withheld.
- AC-14: `unjudgedAtLimit` is true for figures whose every cause is `limited` or `overloaded`, false with one `failed`, and reads a cause that is none of the three by the `LIMITED` pattern.
- AC-20: `runKit` builds its environment through `kitCallEnvironment`; `scripts/improve.ts` builds the probe's and the kit call's through one local function, `callEnvironment`; the row `2026-11-11-001 AC-9` proves it by the counts the Design gives for the two scripts.
- AC-22 (preserve): The rows of the test files this change reaches keep passing, no fewer than before: improve-loop, improve-run, improve, eval-runner, findings, benchmark, loop-docs.
- AC-26: `adoptRun` answers `notRuled: true` when no candidate answered its probe, when every candidate was at its limit during the ruling and when the judge's call failed for another cause, and carries no such field for a gate that failed, a ruling of either kind, a failed merge or a release.
- AC-32: A tick whose adoption was not ruled, of a run measured on Claude models, says in its notification, after the adoption's reason, that the run was not ruled and its branch is kept and adopted by hand, naming the branch and `docs/improve/README.md`; a tick not ruled on a provider that is not Claude models, a tick whose adoption ruled "does not hold" and a tick whose gate failed say no such words; the tick writes nothing new in its state and `status` prints nothing new.
- AC-33: The record reads: finding 233's outcome starts `fixed in 2026-11-11-002`, its section gains a line for this item saying what was done with D-1 (and the class words the user chose), with D-2 and D-3 and with advisories (a) to (d), and 233 leaves the findings that read open; `docs/improve/README.md` names the three class words and has a section on adopting a kept run by hand with its three preconditions (the loop stopped by the `stop` command and its tick ended, no pending release, main unchanged outside `docs/` since the run); `docs/adr/0024-a-run-not-ruled-is-named-for-a-person.md` names ADR 0015's decision 3, the second offer that was weighed, the measure that rejected it and the rule on a main that moved. One row of `findings.test.ts` reads the three files for those texts.

Rows that assert today's behaviour and are edited, none removed:

- `improve.test.ts`: the row `2026-11-09-004 AC-22` reads the class where it read the cause's text, in the figures and in the two reasons; the row `2026-11-09-004 AC-30` reads the class `failed` for a cause that holds a key's shape, keeps its checks that neither the figures nor the verdict hold the token, and asserts the `withheld` form on the log line.
- `improve-run.test.ts`: the row `2026-11-09-004 AC-35` reads the class in the baseline's figures and in the stop line.
- `improve-loop.test.ts`: the rows that give `unjudged: FABLE_LIMIT_TEXT` and a safeguard's text keep those texts (the older shape, read by the pattern) and gain the class cases beside them; the rows `2026-11-09-004 AC-36` (three answers) and `2026-11-09-004 AC-40` (one) read `adoptRun`'s not-ruled answers with `notRuled: true`: four test cases of the three endings; the row `2026-11-09-004 AC-36 (through the tick)` reads the added words in its notification.
- `eval-runner.test.ts`: the rows that read `unjudgedGraders`'s answer gain `class`; the row `2026-11-11-001 AC-9` as (a) says.
- `findings.test.ts`: 233 leaves `OPEN`; the rows `2026-11-10-001 AC-5` and `2026-11-11-001 AC-10` each lose their one assertion that 233 reads open, and the words of their titles that say it stays open. The "Settled on 2026-11-11" line of the section and the outcome's naming of `2026-11-11-001` stay, so the other assertions of those rows hold.

## Risks and rollback

- The release path is not touched: no new call of the adoption, the merge or the release, and no new state. The tick gains words in a notification and a log line.
- A record misread. The reader accepts both shapes (AC-14).
- A hand adoption that collides with the loop: two merges, or two releases taking one version. The README's first two preconditions (the loop stopped and its tick ended, no pending release) are what prevents it; nothing in code does, and the section says so.
- A hand adoption on a main that moved. The README's third precondition is the loop's own rule; a person can break it, as with any merge by hand.
- Rollback: revert the commit and push; the loop's clone takes it at its next tick. A revert makes the old reader take `limited` for a cause that is no limit, as said under Design; no data is lost.
- The first hour: the next tick's record holds no cause's text; `bun scripts/improve-loop.ts status` reads as before.

## Non-Functional Requirements

- Privacy: no published file of the loop holds a text of the CLI for a run that was not judged (AC-13), in a public repository. The notification and the log are local to the machine.
- Cost: no new model call.

## Out of scope

- A second adoption by the loop, and any command that adopts a kept run for a person.
- The other endings that leave a kept branch, for the reason the Design gives.
- Counting the adoption's judge calls in the day's ceiling.
- The eval runner's and the benchmark's own outputs.
- A release of the plugin: the loop runs from its clone of origin/main.

# Plan: the class of a not-judged cause, and a kept run that was not ruled named for a person

The spec is `spec.md` in this folder. Every task is test first: the row is written and seen red (`crew tdd red`), then the code, then green. The preserve criterion AC-22 is recorded `before` first of all, on the tree as it is, with this command, and `after` last with the same one:

```
bun test --timeout 30000 packages/engine/tests/improve-loop.test.ts packages/engine/tests/improve-run.test.ts packages/engine/tests/improve.test.ts packages/engine/tests/eval-runner.test.ts packages/engine/tests/findings.test.ts packages/engine/tests/benchmark.test.ts packages/engine/tests/loop-docs.test.ts
```

Each task leaves `bun run typecheck` and `bun run lint` passing. No file under `packages/engine/src` changes, so the bundle is not rebuilt. `scripts/improve-home.ts` does not change.

1. AC-12: the classifier.
   - Modify `scripts/eval.ts`. Add `export type CauseClass = "limited" | "overloaded" | "failed"` and `export function causeClass(text: string): CauseClass`, beside `LIMITED`: `limited` when `USAGE_LIMIT` matches, else `overloaded` when `LIMITED` matches, else `failed`. `probeOutcome` keeps its first and third lines (timed out; status 0 answers) and takes the class for the other two: a class of `limited` answers `limited` at any status; a status that is not 0 answers the class. In `unjudgedGraders`, with `cause` the explanation's text after the `JUDGE_FAILED` prefix (the local of that name today): the answer is `{ grader, cause: oneLine(cause, 120), class: causeClass(oneLine(cause, Number.POSITIVE_INFINITY)) }`, so whitespace runs and line breaks are one space before the patterns read the text and nothing is cut. `scanResults` is not changed.
   - Tests, `packages/engine/tests/eval-runner.test.ts`, one new row `2026-11-11-002 AC-12`: `causeClass` on the Fable limit text, "usage limit", "rate limit exceeded", "429 Too Many Requests", "Overloaded", a refusal's text and the empty string; `probeOutcome` on the same answers as the existing rows build, with the same expectations; `unjudgedGraders` on a grader whose explanation holds 150 characters of filler and then the limit's words (class `limited`, cause 120 characters long), on one whose explanation is `You've reached your Fable\nlimit.` (the words split by a line break: class `limited`), and on a refusal (class `failed`). The existing row that reads `unjudgedGraders`'s answer with `toEqual` (line 4449) gains `class: "limited"`.

2. AC-13: the improve script records the class.
   - Modify `scripts/improve.ts`. `RunFigures.unjudged` becomes `CauseClass` (the field's doc comment says the class). `caseFigures` records `unjudged: unjudged[0].class`. `causeOf` keeps its body and its export; its doc comment says it is the cause as the log keeps it. `unjudgedCause` keeps its name and answers the class. Add, above `measure`, `export function unjudgedLogLines(result: unknown, name: string): string[]`: over the runs of the case in the kit's result. The lookup `caseFigures` makes today (the case named `name` in `result.cases`, its `arms.with` array) moves into one local function, `caseRuns(result: unknown, name: string): unknown[]` (empty when the case or the array is missing), which both call; for each run whose `unjudgedGraders` answer is not empty, `` `${name} run ${n} was not judged: ${grader}: ${causeOf(cause)}` ``, `n` being the run's index in `arms.with` plus 1, and the grader and the cause those of the first grader not judged. `measure` logs each line with `r.deps.log` right after the status checks (`out.result` is not null), before it builds the figures.
   - Tests. `packages/engine/tests/improve.test.ts`:
     - the row `2026-11-09-004 AC-22`: line 551 reads `[undefined, "limited", undefined]`; `marked` builds `unjudged: "limited"`; the two reasons read `was not judged (limited)`.
     - the row `2026-11-09-004 AC-30`: `got.runs[0]?.unjudged` is `"failed"`; the two `not.toContain(token)` checks stay; its title becomes `a cause that holds a secret's shape is recorded as its class, and withheld whole from the log line`; it asserts `unjudgedLogLines` on the same result gives `` [`t run 1 was not judged: g: withheld: the cause held a secret (${rule})`] `` and that the line does not hold the token.
     - a new row `2026-11-11-002 AC-13` asserts `caseFigures` gives `unjudged: "limited"` for a run whose grader's explanation is the limit text and `"failed"` for a refusal, and `unjudgedLogLines` on a result of three runs with the second not judged gives one line, `t run 2 was not judged: honest-ending: ` followed by the limit text, and on a result with every run judged gives none.
   - `packages/engine/tests/improve-run.test.ts`: in the row `2026-11-09-004 AC-35` (line 1159), `first.baseline.t.runs[0].unjudged` is `"limited"` and the log line reads `t's baseline was not judged (limited): the run stops`. A new row `2026-11-11-002 AC-13` runs `runImprove` with the fixture's kit whose baseline grader fails with the limit text (as line 1073 builds it), then asserts: exit 6; no file under the fixture's `docs/improve/` holds `reached your`; `record.json` holds `"unjudged": "limited"`; the log holds the line `t run 1 was not judged: honest-ending: You've reached your Fable limit.` (the grader of `unjudgedResult`, line 1071).

3. AC-14: the reader.
   - Modify `scripts/improve-loop.ts`, `unjudgedAtLimit`: a cause is at a limit when it is `limited` or `overloaded`; `failed` is not; any other string is tested with `LIMITED`. The doc comment says the two shapes and why (a record written before the change).
   - Tests, `packages/engine/tests/improve-loop.test.ts`, a new row `2026-11-11-002 AC-14` on the function: every cause `limited`; `overloaded`; one `failed` among `limited` (false); the Fable limit text (true); a refusal's text (false). The existing rows with `FABLE_LIMIT_TEXT` and the safeguard's text stay as they are.

4. AC-26: the adoption says it ruled nothing.
   - Modify `scripts/improve-loop.ts`, `adoptRun`: its answer's type becomes `{ released: string | null; reason: string | null; notRuled?: true }`. The local `notRuled(sentence, reason)` helper, which every not-ruled ending already returns through (no judge chosen; the ruling loop's failures), adds `notRuled: true` to what it returns. No other return changes.
   - Tests, `packages/engine/tests/improve-loop.test.ts`: four `toEqual` reads gain `notRuled: true`: in the row `2026-11-09-004 AC-36`, no judge answered (line 2806), every judge at its limit (line 2832) and the judge exited 1 (line 2847); in the row `2026-11-09-004 AC-40`, the judge's answer was an error (line 2885). The pinned-judge case (line 2859) reads `alone.reason` with `toBe` and is not edited. A new row `2026-11-11-002 AC-26` asserts `"notRuled" in answer` is false for: a gate that fails, a ruling of "does not hold", a provider that is not Claude models, a failed merge, a release that did not finish, and a ruling that holds and releases. The first three and the last are built as the rows `2026-10-25-005 AC-6` and the gate row at line 462 build them. The failed merge: `adoptDeps(holdsJson)`'s deps with `git` wrapped, answering `{ status: 1, stdout: "", stderr: "CONFLICT" }` when `args[0]` is `merge` and `args[1]` is not `--abort`, and the real git otherwise; its reason starts `the merge of`. The unfinished release: the same deps with `release: async () => ({ code: 1, version: null })`; its reason starts `the release did not finish`.

5. AC-32: the tick's notification.
   - Modify `scripts/improve-loop.ts`:
     - `export const ADOPT_BY_HAND = "adopt it by hand (docs/improve/README.md)"`.
     - `export function notRuledReason(reason: string, branch: string, claudeModels: boolean): string`: the reason as given when `claudeModels` is false, else `` `${reason}; the run was not ruled and its branch ${branch} is kept: ${ADOPT_BY_HAND}` ``.
     - In the tick's adoption step, after `reason = adopted.reason`: when `adopted.notRuled`, `reason` becomes `` notRuledReason(adopted.reason, latest.branch ?? `improve/${latest.run}`, provider.claudeModels) `` (the branch expression `adoptRun` uses; `provider` is the one the tick hands to `adoptRun`), and when that changed the reason the new one is logged, prefixed `` `adoption of ${latest.run}: ` ``.
   - Tests, `packages/engine/tests/improve-loop.test.ts`, with `tickDeps` and its `kept`, `probe` and `judge` options:
     - the row `2026-11-09-004 AC-36 (through the tick)`: its last assertion also reads `the run was not ruled and its branch improve/2026-10-25-1 is kept: adopt it by hand (docs/improve/README.md)` in the notification, after `no judge answered`.
     - a new row `2026-11-11-002 AC-32`: `notRuledReason` with `claudeModels` false answers the reason unchanged, and with true the reason and the sentence. A tick whose home's `config.json` names a provider that is not Claude models (the `local` provider of the row `2026-10-25-005 AC-1`, line 137, written as that row's configuration), kept, with every probe limited: the notification's body holds `no judge answered` and no `adopt it by hand`. A tick that keeps a change with every probe limited: the notification's body holds the adoption's reason and then those words; the log holds the sentence; the top-level keys of `state.json`, sorted, equal those of a second `loopWorld` after a tick with `kept: true` and a judge that holds (the same `now`), less nothing and plus nothing; `statusText` on that home holds no `not ruled`. A tick whose judge answers "does not hold": the notification's body does not hold `adopt it by hand`. A tick whose adoption gate fails: the same. That tick is built with a new option of `tickDeps`, `keptAlso?: string`, a path the stubbed run's kept commit also writes; with `keptAlso: "scripts/x.ts"` the gate fails on a path outside the harness.

6. AC-20: the advisories.
   - Modify `scripts/eval.ts`, `runKit`: `kitCallEnvironment({ process: process.env, call: undefined, runner: own.env, path: own.path })`.
   - Modify `scripts/improve.ts`: above `realDeps`, a declaration, whose doc comment does not write the function's name followed by a parenthesis, `function callEnvironment(invocation: { env: Record<string, string>; path: string }, call: Record<string, string | undefined> | undefined): Record<string, string>` that returns `kitCallEnvironment({ process: process.env, call, runner: invocation.env, path: invocation.path })`. `probeJudge` and `kit` call it with their `{ env, path }` and `call.env`.
   - Tests, `packages/engine/tests/eval-runner.test.ts`, the row `2026-11-11-001 AC-9`: its last block is replaced by the counts of the spec, read with `match(/…/g)`: in `scripts/improve.ts`, `/\bkitCallEnvironment\(/g` once, `/\bcallEnvironment\(/g` three times (the declaration and the two calls), `/kitEnvironment\(\{[^}]*PATH/` none; in `scripts/eval.ts`, that last pattern once.

7. AC-33: the record.
   - Modify `docs/real-use/findings.md`, section 233: a new bullet `- Closed on 2026-11-11 by item 2026-11-11-002` saying what was done with D-1 (the class alone is recorded, in the words `limited`, `overloaded`, `failed` the user chose over "limit, overload, other"), with D-2 and D-3 (the second offer weighed, the measure, the run named for a person in its place) and with (a) to (d), and the outcome rewritten to start `fixed in 2026-11-11-002` and still name `2026-11-11-001`, its last `;` clause starting with none of `open`, `deferred`, `waits`, `measured` and not ending `Open.` (`openFindings`, `findings.test.ts` lines 13 to 25).
   - Modify `docs/improve/README.md`: what `record.json` holds for a run not judged (the three words, and that the text is in the local log alone); a section `## Adopting a kept run by hand` with the three preconditions (the first by `stop`, and why `pause` alone is not enough) and the steps of the spec (the branch deleted on origin among them), `stop`'s three answers with the one to wait on, the sentence that the reading is the ruling the judge did not make, and the sentence that nothing in code prevents a collision with the loop. The texts `pause` and `stop` that the row `2026-10-28-001 AC-5` of `loop-docs.test.ts` reads stay.
   - Create `docs/adr/0024-a-run-not-ruled-is-named-for-a-person.md`: context (ADR 0015's decision 3 keeps the branch as evidence; finding 233); the decision (the loop names the run's branch in its notification and its log; it never offers it again; a person adopts it by the README's section); the alternatives weighed (one bounded second offer; a line in `status`) and the measure that rejected the first (main moved beyond `docs/` on 28 of the last 30 days, in 151 distinct hours, read on 2026-11-11); consequences, among them that a hand adoption puts the person in the judge's place for the clause "no rule of the method weakened", and that a run measured on a provider that is not Claude models is never named.
   - Tests, `packages/engine/tests/findings.test.ts`: 233 leaves `OPEN` with a comment line; the rows `2026-11-10-001 AC-5` and `2026-11-11-001 AC-10` lose their `toContain(233)` and the words of their titles that say 233 stays open; a new row `2026-11-11-002 AC-33` reads the three files: 233's outcome starts `fixed in 2026-11-11-002`; the README holds `"unjudged": "limited"`, `overloaded`, `failed`, `## Adopting a kept run by hand`, `bun scripts/improve-loop.ts stop`, `no pending release` and `outside \`docs/\``; the ADR holds `ADR 0015`, `decision 3`, `second offer`, `28 of the last 30 days` and `adopt it by hand`.

8. Gates: `crew gate run`, then the judgement gates the engine plans.

---

Published by `crew learn` from item `2026-11-11-002-close-finding-233-with-the-users-two-dec`, reviewed before the code (ADR 0019).
