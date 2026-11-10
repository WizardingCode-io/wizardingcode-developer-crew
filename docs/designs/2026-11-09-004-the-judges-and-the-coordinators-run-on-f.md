# The judges and the coordinators run on Fable

## Problem

The owner's rule of 2026-11-09: "os juízes e coordenadores é o fable, neste caso o 5.2" (the judges and the coordinators are Fable, 5.2 now: id `claude-fable-5-2`, alias `fable`). Three places do not follow it:

- The tech lead declares `model: sonnet` and the CTO `model: opus` (`plugins/core/agents/tech-lead.md`, `plugins/core/agents/cto.md`).
- The eval judge is `claude-opus-5-5` (`JUDGE_MODEL`, `scripts/eval.ts`), for the suite, the one-case runs, the improvement loop and the benchmark set.
- The adoption judge is launched with no `--model` (`judgeArgs`, `scripts/improve-loop.ts`) and runs on the login's default model.

The names this document uses:

- The kit is `claude plugin eval`, Claude Code's own eval runner, which runs each eval case and grades it; its llm graders are scored by a model, the eval judge. `scripts/eval.ts` and `scripts/benchmark.ts` call the kit.
- The loop is `scripts/improve-loop.ts`, a launchd agent of this Mac that runs hourly; one hourly run of it is a tick. A tick that is due starts an improvement run (`scripts/improve.ts`): it measures cases through the kit (a baseline), asks an editor model for changes to the plugin (proposals), and measures each proposal again (a proposal's probe).
- The adoption is the loop's release gate with nobody present: when a run kept a proposal, a model (the adoption judge) rules whether the change weakens the method, and on "holds" the loop merges and releases a patch.
- The mod is the plugin's hook module (`plugins/core/hooks/register.js`). Its ladder moves a role whose model is at its usage limit down to the next model.
- The judge role is the crew's subagent `plugins/core/agents/judge.md`, already on `fable`. It is not the eval judge and not the adoption judge.

The eval judge left Fable on 2026-10-30 (item 2026-10-30-004) because at Fable's usage limit every llm grader ended "grader threw: judge call failed: You've reached your Fable limit" and scored as failed (finding 208, `docs/real-use/findings.md`). That item changed the model and left the cause: the scripts read a grader whose judge call failed as a failed grader, whatever the model. Putting the eval judge back on Fable without answering the cause brings the finding back.

## Goals

- G-1: the tech lead and the CTO run on Fable.
- G-2: the eval judge and the adoption judge are Fable; with Fable unable to judge when a run or an adoption starts, `claude-opus-5-5` judges it whole (D-2, D-3).
- G-3: one model judges a whole run, and the run's record names it.
- G-4: a grader whose judge call failed is read as "not judged", with its cause, and is never counted as a failed grader or as a crashed agent.
- G-5: the eval judge's id is written once in code; tests and scripts read it from there.

## Non-Goals

- The experts, the researcher, the devil's advocate, the fault-finder, the goldfish reviewers and the gate reviewers keep their models (D-1).
- The mod's ladder (`LADDER`) is not changed: a role at its usage limit moves down as today, and the report's Roles table already shows the model each role ran on.
- No priority between the loop and a person's session for the Fable allowance.
- The kit's own scoring is not changed: the scripts read its result.
- No eval judge is swapped during a kit run.

## Open Questions

- D-4, answered by the user on 2026-11-10: this item changes no ceiling of the loop. The kit's `costUsd` leaves the judge's spend out (see Risks) and the loop's ceilings read `costUsd` alone; that stays as it was before the item.
- The exit status the CLI gives at a usage limit is not recorded anywhere in the repository. The design does not depend on it: the limit's text decides at any status.

## Critical User Journeys

CUJ-1, the suite with Fable available. Given Fable answers. When a person runs `bun scripts/eval.ts --case false-done`. Then one judge probe runs, the kit is called with `--judge-model claude-fable-5-2`, and the output has no line about the judge.

CUJ-2, the suite with Fable at its limit. Given Fable answers a judge probe with its usage limit and Opus answers. When a person runs `bun scripts/eval.ts`. Then the output says, before the estimate, that `claude-opus-5-5` judges the run whole and that `claude-fable-5-2` was passed over as `limited`, and the kit is called with `--judge-model claude-opus-5-5`.

CUJ-3, no judge. Given Fable and Opus both answer with a usage limit, or one of them fails for another reason (a login that expired, an unknown model). When a person runs `bun scripts/eval.ts` or `bun scripts/benchmark.ts`. Then the kit is not called, nothing is spent beyond the judge probes, the output names each model probed with its outcome, and the script exits 5.

CUJ-4, the limit reached during a suite run. Given the eval judge answered its probe and reaches its limit while the kit runs. When the run ends. Then `scripts/eval.ts` prints one `needs-rerun` line per run with a grader that was not judged, naming the case, the grader and the cause; `scripts/benchmark.ts` writes no record for that run, as for every flagged run.

CUJ-5, a loop run. Given the loop starts an improvement run. When the run measures its baseline and its proposals. Then the eval judge was chosen once, before the run's folder, in the run's own environment; every kit call of the run uses it; `record.json` and `record.md` name it and the models passed over. With no judge answering the run makes no folder and returns 5; the tick skips, as it does over the day's budget. At the first measurement with a run not judged, a baseline or a proposal's probe, the run stops: the figures are on record with `unjudged`, no kit call follows, and the run returns 6.

CUJ-6, the adoption. Given a run kept a proposal and the gate in code holds. When the loop asks the adoption judge. Then the adoption judge is chosen as in CUJ-1 to CUJ-3 and launched with `--model`, and `adoption/ruling.md` names the model that ruled and each model passed over (D-3). With no judge answering, or a judge call that fails, the ruling file says "not ruled", nothing is released and the notification says why.

CUJ-7, a role. Given a full-route item. When the session launches a tech lead or the CTO. Then the role starts on `fable`; at Fable's limit the mod moves it down, as it does the judge role.

## Design

### Decisions

- D-1 (the user, 2026-11-09): the coordinators are the tech lead and the CTO, and no other role.
- D-2 (the user, 2026-11-09, answer B): with Fable at its usage limit at the start of an eval run, `claude-opus-5-5` judges the run whole, chosen once and named in the record.
- D-3 (the user, 2026-11-10, answer B): the same for the adoption: `claude-opus-5-5` may rule it when Fable is at its limit, and the ruling names the model.

### Roles

`model: fable` in `plugins/core/agents/tech-lead.md` and `plugins/core/agents/cto.md`; the same two values in `ROLE_MODELS` (`plugins/core/hooks/register.js`), which a test holds equal to the agent files.

### The judge, chosen once

In `scripts/eval.ts`:

- `JUDGE_MODEL` is `claude-fable-5-2`; `JUDGE_FALLBACK` is `claude-opus-5-5`. The id was checked on 2026-11-09: `claude -p --model claude-fable-5-2` answered. No other `.ts` file under `scripts/` holds either literal. One test pins the two values (the test of AC-2); every other test that names the eval judge or its fallback reads the constant (AC-29). The id `claude-opus-5-5` stays as it is where a test names something else by it: a role's transcript model (`hooks-subagent-stop.test.ts`, `evidence.test.ts`), the agent model of the benchmark fixture, a recorded aggregate's judge, a pinned provider's judge given as test data (`benchmark.test.ts`, `improve-loop.test.ts`).
- `judgeCandidates(judge, agentModel)`: the two models in that order when the judge is `undefined` or exactly `JUDGE_MODEL` and the agent under test is `DEFAULT_AGENT_MODEL` (`claude-sonnet-5-5`) or not named; otherwise the one name alone. The owner's rule is that a judge is never weaker than the agent it grades: Opus is known not weaker than the default agent, and nothing ranks a provider's own agent model, so a provider that names another agent has its judge pinned. A judge named otherwise is pinned too, a gateway's prefixed id (`anthropic/claude-fable-5-2`) among them.
- This is a walk of two rungs of its own, beside the mod's ladder and the editor's. It cannot use the mod's: the mod asks the session's model API in-process and gives up at 20 seconds, where the judge probe must spawn the CLI the kit spawns, in the kit call's environment, to read the limit of the account that will judge; a cold CLI start with a login is why its bound is 60 seconds.
- `probeArgs(model)` is `-p "Answer with the single word ok." --model <model> --tools "" --max-turns 1 --no-session-persistence --setting-sources "" --strict-mcp-config`. The settings flags keep the session's plugins, hooks and MCP servers out of the probe.
- `probeJudge(model, env, cwd, spawn)` runs `claude` with those arguments, the environment of the call it stands for, and a timeout of 60 000 ms (`PROBE_TIMEOUT_MS`). It returns the exit status, stdout and stderr joined (the CLI writes a limit to either), and whether the timeout ended it. `spawn` is `spawnSync` unless a test gives a stub. The folder is the repository root; it does not matter to the probe, which loads no setting.
- `USAGE_LIMIT` is `/reached your [\w .-]{0,40}limit|usage limit/i`; `LIMITED` is that or `/rate.?limit|\b429\b|overloaded/i`. `LIMITED` moves from `scripts/improve.ts` (the editor's ladder reads it) and gains the first alternative: the text finding 208 recorded matched none of the others.
- `probeOutcome(answer)`, in this order: `timed out` when the timeout ended the probe; `limited` when the output matches `USAGE_LIMIT`, whatever the status; `answered` for status 0 (so a retry notice of an overload on a probe that answered changes nothing); `overloaded` for a non-zero status whose output matches `LIMITED`; `failed` otherwise.
- `oneLine(text, limit)`: whitespace runs become one space; every control character (below 0x20, 0x7f to 0x9f), every zero-width character (U+200B to U+200D, U+FEFF) and every direction mark (U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069) is removed, the set the engine's `quotedText` strips (`packages/engine/src/quote.ts`); then the text is cut at `limit`. It is not `quotedText` itself, which keeps a text's first line alone and ends a cut with an ellipsis. Every text of a judge probe or of a grader that the scripts print or record passes through it, and the two places that cleaned a line by hand use it (`agentStderrNote` in `scripts/improve-loop.ts`, the editor's failure line in `scripts/improve.ts`).
- `chooseJudge(judge, agentModel, probe)` walks the candidates in order: `answered` chooses the model and stops; `limited`, `overloaded` and `timed out` pass it over with that word as the reason; `failed` stops with no judge. A failed probe is a failure that is no limit (an expired login, an unknown model): the fallback would fail the same way, and passing to Opus on any error would judge with Opus where the owner's rule says Fable. It returns the judge or null, the models passed over (each `{ model, reason }`), every model probed with its outcome, and the lines to print: none when the first candidate answered; one naming the judge and each model passed over; with no judge, one per model probed with its outcome, and for a `failed` probe its output through `oneLine` at 200 characters. Those lines go to the output or the log alone. No judge probe's output enters a record, a ruling or a notification.

Where the choice is made:

| What | Where | Environment of the judge probe |
| :- | :- | :- |
| the suite, a one-case run, the benchmark | `runKit`, after the results directory is checked and before the estimate and the run folder | the kit call's: `kitEnvironment` over the session's, the runner's variables and `PATH` |
| a loop run | `runImprove`, after its refusals and before `startRun` | the run's: `kitEnvironment` over the session's and the provider's |
| the adoption | `adoptRun`, after the gate and the diff, before the adoption judge is launched | the provider's, as the adoption judge's own call |

`runKit` takes the probe as an option (the real one unless a test gives another). `ImproveDeps`, `AdoptDeps` and `TickDeps` each gain `probeJudge`, and the tick passes its own to `adoptRun`, so no test spends. (The loop's install probe and its `probe.json` are another thing and do not change.) A judge probe is one call per candidate: at most two for a run that takes minutes to hours.

`runKit`'s result gains the choice. With no judge its status is 5 and it has no folder; `scripts/eval.ts` and `scripts/benchmark.ts` exit 5 on a result with no folder, ahead of the branch that says the kit wrote no aggregate.

`scripts/eval.ts` and `scripts/improve.ts` read `--judge-model` through one check, `/^[A-Za-z0-9][\w.:\/-]*$/`: a value starting with `-` would reach `claude` as a flag, in the kit call and in the judge probe. The loop applies the same check to a provider's agent and judge models from its configuration file, and refuses the provider before anything runs (AC-41).

### Statuses

`scripts/eval.ts` exits: 0 every case at the threshold (the kit's), 1 a case below the threshold (the kit's), a usage error or no aggregate, 2 the cost cap reached (the kit's), 5 no judge answered and the kit was not called. `scripts/benchmark.ts` exits 5 for the same.

`runImprove` returns: 0 done, 1 refused before any spend, 2 the cost ceiling, 3 a failure, 4 stopped by the user, 5 no judge answered (no folder, no record, nothing spent beyond the judge probes), 6 a measurement was not judged and the run stopped there (the record written, as for 2, 3 and 4).

The loop's tick:

| Status | Record | `lastRun` | Failure counted | Told |
| :- | :- | :- | :- | :- |
| 5 | none | not set | no | the first of the day is kept in the state (`day.judgeSkip`), named in the day's report under Skipped ticks, committed, pushed and notified once; a later one of the day is logged alone |
| 6, every unjudged cause a limit | committed and pushed, as for 3 | left as it was | no | the notification's reason is `verdictText`: "stopped: a run was not judged" |
| 6, another cause | committed and pushed | set, as for 3 | no | the same |

The skip of status 5 and the budget's skip are one routine with the kind as its argument; the day's report prints one line per kind, each with its own sentence (the judge's: "no judge answered; a later due tick probes again"), and both can stand on the same day.

A cause is a limit when it matches `LIMITED` (a usage limit, an overload). After such a stop the reason that made the tick due stands and `lastMeasuredOf` does not count the case, so the next due tick runs the same cases again and probes first: a judge still at its limit is then passed over for the whole run, or the tick skips at no kit cost. Any other cause is a failure the next tick would meet again on the same case: the recorded one is a refusal by the model's safeguards on a case's content (`docs/improve/2026-10-26-10/record.json`). There `lastRun` is set and `lastMeasuredOf` counts the case as measured, so the loop moves to other cases and the record names the refusal.

### A grader that was not judged

The kit's result gives a grader `name`, `passed`, `scored` and `explanation` and no error field. The kit's recorded lines are in four committed records, which are the tests' fixtures: `docs/improve/2026-10-30-2/record.json` ("grader threw: judge call failed: You've reached your Fable limit. …"), `2026-10-27-5` ("… API Error: 529 Overloaded. …"), `2026-10-26-10` ("… Fable 5.1's safeguards flagged this message …") and, for a grader that threw for another reason, `2026-11-04-3` ("grader threw: case … grader focus file … does not exist"). The prefix `grader threw: judge call failed` is kept in one constant, `JUDGE_FAILED`, and read by one function, `unjudgedGraders(run)`, in `scripts/eval.ts`: each scored grader whose explanation starts with the prefix, with the cause after it through `oneLine` at 120 characters. Other thrown graders stay failed graders: they are defects of a case.

- `scanResults` (`scripts/eval.ts`) adds one line per run with such a grader: `needs-rerun: <case> (not judged: <grader>: <cause>)`, with `, +<n> more` when the run has more. The reading comes before the run's trace is looked for, so a run with no trace is still named. `scripts/benchmark.ts` already writes no record for a run with a `needs-rerun` line.
- `caseFigures` (`scripts/improve.ts`): a run gains `unjudged`, the first cause or null, and its `failing` leaves the unjudged graders out; the case gains `unjudged`, true when a run has one. The cause is withheld whole, with the rule's name, when the secret scan (`scanText`) finds a secret's shape in it. The mean and the spread are over the judged runs (0 when none is). `errored` keeps its meaning, the kit's own error. The record's table shows `unjudged` in the run's cell.
- The run stops there (`scripts/improve.ts`): after a baseline or a proposal's probe is recorded with `unjudged`, the run logs the case, the side and the cause and stops with 6. The record holds the figures, the judge and the cost so far; proposals with no verdict are inconclusive, as at every stop; nothing is kept. `verdictOf` answers inconclusive with "<case>'s baseline was not judged (<cause>)" or "…'s probe was not judged (…)", so a figure with a run not judged can never read as a win.
- `readRun` (`scripts/benchmark.ts`), for a record written with `--from` from an aggregate that holds such runs: the run is read whole and marked `unjudged` (the prefix is tested, no text is copied into the record), and the arm counts them. A case with an unjudged run in an arm is left out of the totals, as a case with an arm whose every run errored already is, and `excluded` names each with its reason, `errored` or `unjudged`. The category rates change with it: today they are means over every case that ran, an all-errored one among them; from this item they are means over the cases left in the totals, and a category holds both counts, `ran` and `counted`.

A recorded aggregate read again gives the new reading; the reports under `docs/` keep their text.

### The record names the judge

`ImproveRecord` gains `judge` (the model that judged) and `judgeSkipped` (the models passed over, each with the reason `limited`, `overloaded` or `timed out`); `record.md` gains a `- Judge:` line. `measure` passes the run's chosen judge to every kit call. Records written before have neither field and read as before. The benchmark record already names the aggregate's judge and lists any judge other than the set's under `Drift from the set`, a fallback's among them.

### The adoption judge

`judgeArgs(prompt, systemPrompt, model)` adds `--model <model>` and `--strict-mcp-config`. `adoptRun` chooses the model with `chooseJudge(provider.judgeModel, provider.agentModel, …)` through `deps.probeJudge`, with the provider's environment. `adoption/ruling.md` gains two lines under its title: `- judge: <model>` and `- passed over: <model> (<reason>)` or `none`.

A judge call that fails is not a ruling: one that ends non-zero, or one whose answer the CLI marks as an error (`is_error: true`) at any exit status, since the status the CLI gives at a limit is recorded nowhere. Today both are written as "does not hold", which records a quota event as a judgement that the change weakens the method. From this item: when the call failed at a limit (the error's text, or the output and stderr of a non-zero exit, matches `LIMITED`) and a later candidate exists, the ruling is asked once of that candidate, whole, and the ruling file names both; with no candidate left, or for any other failure, the file says "not ruled: <reason>" and nothing is released. A not-ruled file names the models asked as a ruling does (`- judge: none`, `- passed over: <model> (<reason>), …`). A ruling whose own words name a limit stays a ruling: only a failed call is read for one. With no judge at the probes the file says "not ruled: no judge answered" with each model's outcome in the fixed words, and that sentence is the reason returned for the notification.

A change that is not released, for any reason, stays on its branch for a person and is not offered for adoption again: that is today's rule for every refusal of the adoption, and "not ruled" follows it. The files go through the redaction as every adoption file does.

### Texts

`plugins/core/evals/README.md` (the command line, the paragraph that still says Fable 5.1, the judge's choice, status 5, the `not judged` line), `CLAUDE.md` (the eval command's line), `README.md` (the roles' models), `docs/improve/README.md` (statuses 5 and 6, the record's judge, the ruling's judge), `docs/benchmark/README.md` (the set's judge, the exclusion's reason, the category rates), `plugins/core/evals/benchmark.json` (`models.judge`), finding 208's outcome.

### Alternatives

- A judge probe before each kit call. Rejected: a loop run's baseline and its proposals could be judged by two models, and the verdict would read the judges' difference.
- The run not starting when Fable is at its limit. Rejected by D-2: the loop would stand still for as long as the limit lasts.
- Nothing released while Fable is at its limit. Rejected by D-3: a measured gain would wait on a branch for a person.
- A walk that goes on below Opus, to Sonnet or Haiku. Rejected: a judge below the agent under test breaks the owner's rule.
- The mod's ladder for the eval judge. Not usable: it asks the session's model API, not the kit's account and environment.
- Counting the unjudged run as `errored`. Rejected: the record would send a reader to the agent's trace for a crash that did not happen, and the benchmark would read a paid run's cost as zero.
- Reading a structured error field of the kit. Not available: the result has none.
- A retry of the unjudged graders on the fallback. Rejected: the kit grades inside its own run; the scripts cannot re-grade a kept trace.
- A record for a run with no judge. Rejected: the loop would commit and push one per due tick while the limits last; the skip of the day says it once.
- The run going on after a measurement that was not judged. Rejected: a judge at its limit stays there, and each later kit call pays an agent run that nobody judges.
- Every unjudged stop leaving the case to be measured again. Rejected: a refusal by the model's safeguards repeats on the same case, and the loop would pay its baseline at every due tick.

## Acceptance criteria

The ids are the engine's.

- AC-1: `plugins/core/agents/tech-lead.md` and `plugins/core/agents/cto.md` declare `model: fable`, and the mod's `ROLE_MODELS` names `fable` for `tech-lead` and `cto`.
- AC-2: `JUDGE_MODEL` is `claude-fable-5-2` and `JUDGE_FALLBACK` is `claude-opus-5-5`; `evalInvocation` passes `JUDGE_MODEL` as `--judge-model` for the suite and for a case when no judge is given; the loop's `runtime` provider resolves its judge to `JUDGE_MODEL`; `plugins/core/evals/benchmark.json` names `JUDGE_MODEL` as the set's judge.
- AC-10: the benchmark's record, from an aggregate with an unjudged run, counts the run in its arm as `unjudged` with its cost, time and turns read, leaves the case out of the totals and the category rates, and names it in `excluded` with the reason `unjudged`; a case with an arm whose every run errored is named with the reason `errored`.
- AC-13: the editor's ladder reads `LIMITED` from `scripts/eval.ts`: an editor answer "You've reached your Fable limit" with a non-zero status moves the editor to the next model.
- AC-16: `probeJudge` runs `claude` with `probeArgs(model)` (`-p`, the fixed prompt, `--model <model>`, `--tools ""`, `--max-turns 1`, `--no-session-persistence`, `--setting-sources ""`, `--strict-mcp-config`), the environment and the folder it is given and a timeout of 60 000 ms, and returns the status, stdout and stderr joined, and whether the timeout ended it; a stub that writes the limit text to stderr alone reads as `limited`.
- AC-18: `runKit` probes with the environment and the folder the kit call gets, calls the kit with the chosen judge as `--judge-model` and prints the choice's lines before the estimate; with no judge it makes no run folder, calls no kit and returns status 5 with no folder; `scripts/eval.ts` and `scripts/benchmark.ts` exit 5 on it without reading a folder or an aggregate.
- AC-19: `scripts/eval.ts` and `scripts/improve.ts` refuse a `--judge-model` value that is not a model name starting with a letter or a digit (exit 1), a value starting with `-` among the rows.
- AC-22: `caseFigures` marks a run with an unjudged grader `unjudged` with its first cause and the case `unjudged`, leaves the unjudged graders out of the run's `failing`, computes the mean and the spread over the judged runs alone (0 when none is) and leaves `errored` to the kit's own error; `verdictOf` answers inconclusive naming the case, the side and the cause; the record's table shows `unjudged` in that run's cell.
- AC-24: `scanResults` returns one line `needs-rerun: <case> (not judged: <grader>: <cause>)` per run with an unjudged grader, read before the run's trace is looked for, with `, +<n> more` for the run's other unjudged graders.
- AC-29: no `.ts` file under `scripts/` other than `scripts/eval.ts` holds the literal value of `JUDGE_MODEL` or of `JUDGE_FALLBACK`; under `packages/engine/tests/` the literal value of `JUDGE_MODEL` is held once, in `packages/engine/tests/eval-runner.test.ts`, in the test of AC-2 that replaces the test named "2026-10-30-004 AC-1" and pins both values; every other test that names the eval judge or its fallback reads the constant.
- AC-30: the cause a run of the loop records for a grader not judged is withheld whole, with the rule's name, when the secret scan finds a secret's shape in it, as the editor's rationale is.
- AC-31: `probeOutcome` answers `timed out` for a probe its timeout ended; `limited` for an output matching `USAGE_LIMIT` whatever the status (the recorded text of the Fable limit with status 0 and with status 1 among the rows); `answered` for status 0 otherwise, an output holding "529 Overloaded" with status 0 among the rows; `overloaded` for a non-zero status whose output names a rate limit, 429 or an overload; `failed` for any other.
- AC-32: `chooseJudge` probes `JUDGE_MODEL` then `JUDGE_FALLBACK` when no judge or `JUDGE_MODEL` is given and the agent's model is `DEFAULT_AGENT_MODEL` or not given; `JUDGE_MODEL` alone when another agent model is given; a differently named judge alone. The first that answers is chosen and none is probed after it; a `limited`, `overloaded` or `timed out` model is passed over with that word as its reason; a `failed` probe ends the choice with no judge; the choice returns every model probed with its outcome. When the first candidate answers the choice has no line; when a model was passed over one line names the judge and each model passed over with its reason; with no judge the lines name each model probed with its outcome and, for a failed one, the probe's output as one line with no control character, cut at 200 characters.
- AC-33: an improvement run chooses its judge once, after its refusals and before its run folder, probing in the run's environment; every kit call of the run carries that judge; `record.json` holds `judge` and `judgeSkipped` (each model passed over with the reason `limited`, `overloaded` or `timed out`) and `record.md` a `- Judge:` line; with no judge the run makes no folder, writes no record, calls no kit and returns 5.
- AC-34: `unjudgedGraders` returns, for a run, each scored grader whose explanation starts with `JUDGE_FAILED`, with the cause after the prefix through `oneLine` at 120 characters; none for a grader that threw for another reason, that failed or that is not scored; the fixtures are lines the kit recorded (the limit of `docs/improve/2026-10-30-2`, the overload of `2026-10-27-5`, the safeguards refusal of `2026-10-26-10`, the other throw of `2026-11-04-3`). `oneLine` turns whitespace runs into one space, removes the control characters and the direction marks and then cuts: rows with a newline, an escape sequence, a 0x85 character, U+202E and U+2067.
- AC-35: an improvement run stops at its first measurement with a run not judged, a baseline or a proposal's probe: the figures, the judge and the cost so far are in the record, no kit call follows, nothing is kept and the run returns 6.
- AC-36: `judgeArgs` carries `--model` with the model it is given and `--strict-mcp-config`; `adoptRun` chooses the adoption judge with `chooseJudge` for the provider's judge and agent model, probing in the provider's environment through `probeJudge` of `AdoptDeps`, which the tick passes from `TickDeps`, launches the judge on the chosen model and writes in `adoption/ruling.md` the model that ruled and each model passed over with its reason (D-3). A judge call that ends non-zero is never recorded as "does not hold": when it ended at a limit the ruling is asked once of the next candidate, and with none left, or for another failure, the ruling file says not ruled with the reason and nothing is released. With no judge at the probes it launches none, writes the ruling file as not ruled, releases nothing and gives the reason "no judge answered" with each model's outcome in fixed words.
- AC-37: the tick, for a run that returned 5, writes no record, sets no `lastRun`, counts no failure and, through the one skip routine the budget skip uses, keeps the first such skip of the day in the state, names it in the day's report beside a budget skip of the same day and notifies once. For a run that returned 6 it commits the record and counts no failure; it leaves `lastRun` as it was when every unjudged cause of the record is a limit (`LIMITED`) and sets it as for any run otherwise. `verdictText` answers "stopped: a run was not judged" for exit 6. `lastMeasuredOf` does not count a case whose figures are unjudged at a limit and counts one unjudged for another cause.
- AC-38: the texts name the judge as the code does: `CLAUDE.md` and `plugins/core/evals/README.md` hold `JUDGE_MODEL` and `JUDGE_FALLBACK` and no `Fable 5.1` or `claude-fable-5-1`; `plugins/core/evals/README.md` names status 5, `docs/improve/README.md` the statuses 5 and 6 and the record's judge; `docs/benchmark/README.md` names `JUDGE_MODEL` as the set's judge and `unjudged` as an exclusion's reason; `README.md` gives the tech lead and the CTO as `fable`; finding 208's outcome names this item.
- AC-39: the benchmark record's category rates are means over the cases left in the totals, so a case with an arm whose every run errored or with an unjudged run leaves them; a category holds `ran` (every case that ran) and `counted`; the Markdown names each excluded case with its arm and its reason.
- AC-40: an answer of the adoption judge that is marked as an error is not a ruling, whatever the exit status of its call: at a limit the next candidate is asked, otherwise the ruling file says not ruled; every not-ruled ruling file names the models asked, as a ruling does.
- AC-41: the loop refuses a provider whose agent or judge model is not a model name starting with a letter or a digit, before anything runs, naming the model.

## Risks and rollback

- One Fable allowance now serves the judge role, the tech lead, the CTO, the loop's editor, the eval judge and the adoption judge, so Fable reaches its limit more often than when finding 208 was recorded. The mod moves a role down; the eval judge and the adoption judge fall back whole. Runs judged by Opus and runs judged by Fable are not comparable score for score: each record names its judge, and the benchmark lists a fallback run under drift.
- A release can be ruled by Opus with nobody present (D-3). The ruling names the model, so a person reading a release's adoption folder sees which model let it through.
- The limit can still be reached during a run. A suite's runs are then paid for and not measured (`needs-rerun`); a loop run stops at its first measurement not judged, having paid for that measurement. A run stopped at a limit leaves the tick due, so the next tick pays a baseline again if its judge answers the probe and meets its limit later; the day's ceiling bounds it. Stopping a kit run at its first unjudged grader is out of scope.
- Fable as the eval judge brings back the safeguards refusal recorded on 2026-10-26: a case whose content the judge refuses is read as not judged, its run stops with 6, and the loop moves on; that case is not measured until a person looks at it. The record names the refusal.
- With Fable and Opus both at their limits the loop runs nothing: each due tick spends two judge probes, and the day's first skip is reported and notified once.
- An id the login stops serving ends every run with 5, each time with the model's line. That is loud by design: the scripts never judge with another model without saying which rule let them.
- The judge's spend is outside the kit's cost figure. Measured in six recorded aggregates of 2026-10-31 (judged by Opus): the kit's `costUsd` equals the sum of the runs' `costUsd`, and `judgeCostUsd` is a field apart, between 10% and 75% on top (0.31 on 0.41 USD, 0.34 on 0.63, 0.38 on 1.43, 1.54 on 5.30). The kit's help says the cap is checked before each run launches and names no judge spend, so `--max-cost-usd` and the loop's ceilings, which read `costUsd`, do not hold the judge's spend back; a Fable judge raises that share by the two models' price difference, not measured here. The user's answer to D-4 (2026-11-10): the ceilings stay as they are.
- A limit worded outside `USAGE_LIMIT` on a probe that exits 0 reads as `answered`, and the run then meets it as graders not judged.
- The kit's wording of a failed judge call is read by prefix. If the kit changes it, `unjudgedGraders` finds nothing and such graders score as failed again; the fixtures are the lines recorded so far and do not follow the kit.
- The first benchmark record judged by Fable 5.2 starts a new series: the records of 2026-10-21 were judged by `claude-fable-5-1`, the later ones by `claude-opus-5-5`. Its category rates also leave out excluded cases, which the earlier records' did not.
- Rollout. The scripts take effect in the loop at its first tick after the push to `main`. The two roles reach users with the next plugin release.
- Rollback. Revert this item's commit on `main` first: the loop reads `main` at its next tick, so the revert restores `claude-opus-5-5` there with no release. The two roles need a release to go back, and until it they stay on `fable`, which the mod moves down at a limit.

## Non-Functional Requirements

- A judge probe is bounded at 60 seconds per candidate, so a run or an adoption waits at most 120 seconds for its judge.
- No text of a grader's explanation enters the benchmark's record. The loop's record carries a cause as one line with no control character, cut at 120 characters, withheld whole when the secret scan finds a secret's shape in it (AC-30), and goes through the loop's redaction as every record file does. No judge probe's output enters a record, a ruling or a notification.

## Out of scope

- Stopping a kit run at its first unjudged grader, and re-grading a kept trace: the kit grades inside its own run.
- A back-off of the loop after ticks that skipped for no judge: a skip costs two judge probes.
- A second offer of a change the adoption did not release.
- Showing in the session, at launch, the model a role was moved to (the report's Roles table shows it after).

# Plan: the judges and the coordinators run on Fable

The spec is `spec.md` in this folder. Seven tasks, in this order; each leaves `bun run check` green. Every criterion is proven test-first: the test is written and recorded red (`crew tdd red`), then the code, then green. Tests use `bun:test`; a spawned script runs with the stub kit first on `PATH` (`packages/engine/tests/kit-stub.ts`), and every in-process call takes its judge probe as an argument or a dep, so no test spends.

No file is created or deleted. Every file below is `Modify`. Test rows are named by their title's first words, since lines move.

D-4 (the loop's ceilings and the judge's spend) is open. This plan changes no ceiling; if the user's answer adds it, it is one more task after T-5.

## T-1: the two roles (AC-1)

- `plugins/core/agents/tech-lead.md`: front matter `model: sonnet` becomes `model: fable`.
- `plugins/core/agents/cto.md`: front matter `model: opus` becomes `model: fable`.
- `plugins/core/hooks/register.js`, `ROLE_MODELS`: `cto: 'fable'`, `'tech-lead': 'fable'`.

Tests (the red is these rows after their edit, before the agent files change):

- `packages/engine/tests/agents.test.ts`, "SP7a AC-5 (Task 4)": expects `fable` for both roles; its title says "on fable" for both.
- `agents.test.ts`, "SP9-T5 AC-7": `expect(lead.meta.model).toBe("fable")`; the title's "with its model and tools unchanged" becomes "with its tools unchanged".
- `packages/engine/tests/runtimes.test.ts`, "SP6-T4 AC-3": `expect(page.model).toBe("fable")`, and any expected output of the row that carries the page's model follows.
- `agents.test.ts`, "AC-5 (finding 152)" already holds the mod's table equal to the agent files and needs no edit.

Verify: `bun test packages/engine/tests/agents.test.ts packages/engine/tests/runtimes.test.ts`, then `bun run plugin:check`.

## T-2: the judge's constants, the probe and the choice (AC-2, AC-13, AC-16, AC-19, AC-31, AC-32)

`scripts/eval.ts`:

- `JUDGE_MODEL = "claude-fable-5-2"`; new `JUDGE_FALLBACK = "claude-opus-5-5"`. The doc comment of `JUDGE_MODEL` says: the owner's rule of 2026-11-09 (every judge on Fable), the fallback when Fable cannot judge at a run's start (D-2), never weaker than the agent under test.
- New exports, in this order after `JUDGE_FALLBACK`:
  - `USAGE_LIMIT = /reached your [\w .-]{0,40}limit|usage limit/i`; `LIMITED = new RegExp(`${USAGE_LIMIT.source}|rate.?limit|\\b429\\b|overloaded`, "i")`.
  - `oneLine(text: string, limit: number): string`: `text.replace(/\s+/g, " ")`; then every character with a code below 0x20 or from 0x7f to 0x9f removed; then U+200E, U+200F, U+202A to U+202E and U+2066 to U+2069 removed; then `.trim().slice(0, limit)`.
  - `MODEL_NAME = /^[A-Za-z0-9][\w.:/-]*$/`.
  - `judgeCandidates(judge?: string, agentModel?: string): string[]`: `[JUDGE_MODEL, JUDGE_FALLBACK]` when `judge` is `undefined` or `JUDGE_MODEL` and `agentModel` is `undefined` or `DEFAULT_AGENT_MODEL`; `[judge ?? JUDGE_MODEL]` otherwise.
  - `PROBE_TIMEOUT_MS = 60_000`; `probeArgs(model: string): string[]`.
  - `interface ProbeAnswer { status: number | null; output: string; timedOut: boolean }`.
  - `probeJudge(model, env, cwd, spawn = spawnSync): ProbeAnswer`: `spawn("claude", probeArgs(model), { cwd, env, encoding: "utf8", timeout: PROBE_TIMEOUT_MS })`; `output` is `${stdout ?? ""}${stderr ?? ""}`; `timedOut` is true when the result's `error` has the code `ETIMEDOUT`.
  - `type ProbeOutcome = "answered" | "limited" | "overloaded" | "timed out" | "failed"`; `probeOutcome(answer)`: `timedOut` gives `timed out`; else `USAGE_LIMIT` in the output gives `limited`; else status 0 gives `answered`; else `LIMITED` in the output gives `overloaded`; else `failed`.
  - `type SkipReason = "limited" | "overloaded" | "timed out"`; `interface JudgeChoice { judge: string | null; skipped: { model: string; reason: SkipReason }[]; probed: { model: string; outcome: ProbeOutcome }[]; lines: string[] }`.
  - `chooseJudge(judge: string | undefined, agentModel: string | undefined, probe: (model: string) => ProbeAnswer): JudgeChoice`. The lines' texts:
    - a model passed over and a judge found: `judge: <judge> judges this run whole; <model> passed over (<reason>)`, with `, <model> (<reason>)` for each further one;
    - no judge: first `judge: no judge answered; nothing runs`, then one line per model probed, `judge: <model>: <outcome>`, with `: <oneLine(output, 200)>` appended for a `failed` one.
- The `--judge-model` check in the main block uses `MODEL_NAME`.

`scripts/improve.ts`:

- The local `LIMITED` goes; `LIMITED`, `MODEL_NAME` and `oneLine` are imported from `./eval.ts`.
- `parseArgs`: `--judge-model` is accepted only when `MODEL_NAME.test(value)`; otherwise the existing "unknown or bad option" return.
- `runEditor`, the failure line: `oneLine(out.output, 200)` in place of `.trim().slice(0, 200)`.

`scripts/improve-loop.ts`, `agentStderrNote`: `oneLine(redact(last, []), 200)` in place of the hand-made filter; its doc comment names `oneLine`.

`plugins/core/evals/benchmark.json`: `models.judge` becomes `claude-fable-5-2`.

Tests, in `packages/engine/tests/eval-runner.test.ts` unless named:

- AC-2: the test "2026-10-30-004 AC-1" is rewritten as "2026-11-09-004 AC-2". It pins `JUDGE_MODEL` and `JUDGE_FALLBACK` by their literals, once each, and reads the constant everywhere else in the row: `evalInvocation`'s `--judge-model` for the suite and for a case, `benchmark.json`'s judge. Its assertions on `CLAUDE.md` and the evals README move to T-7's row. The rows that hold the judge's literal today read the constant: "the suite runs with the judge and the reports" and "CON7-AC-8 (finding 63)" here; in `improve-loop.test.ts`, "2026-10-25-005 AC-1 (runtime)" asserts the provider's judge equals `JUDGE_MODEL`; in `benchmark.test.ts`, "SP6-T5 AC-1" asserts the set's judge equals `JUDGE_MODEL`, and "SP6-T5 AC-11" changes in three places: the fixture's expected drift gains `judge model claude-opus-5-5 (the set names ${JUDGE_MODEL})` built from the constant, the "matching" aggregate takes `judgeModel: JUDGE_MODEL`, and the expected text "(the set names …)" reads the constant. The fixture aggregate's own `claude-opus-5-5` stays: it is recorded data.
- AC-31: a table of rows over `probeOutcome`: timed out with any status; the recorded text "You've reached your Fable limit" with status 0 and with status 1; "usage limit" with status 1; "API Error: 529 Overloaded · Retrying" followed by `ok` with status 0 (answered); "rate limit", "429" and "overloaded" with status 1 (overloaded); `ok` with status 0; any other text with status 1 (failed).
- AC-16: `probeArgs("m")` equals the list of the spec; `probeJudge` with a stub spawn records the command, the arguments, `cwd`, `env` and `timeout: 60000`; a stub returning the limit text in `stderr` alone gives an answer `probeOutcome` reads as `limited`; a stub returning `error: { code: "ETIMEDOUT" }` gives `timedOut: true`.
- AC-32: rows over `chooseJudge` with a probe that records the models asked: the first answers (one probe, no line, `probed` holds one entry); the first limited and the second answers; the first overloaded and the second answers; the first timed out and the second answers; both limited (no judge, both in `probed`); the first failed (the second never probed, the line carries the output through `oneLine`, with a newline, an escape sequence, a 0x85 character and U+202E in the fixture, none in the line, cut at 200); a judge named otherwise is probed alone; `JUDGE_MODEL` with an agent model other than `DEFAULT_AGENT_MODEL` is probed alone, and limited gives no judge; `judgeCandidates(JUDGE_MODEL)` equals `judgeCandidates(undefined)`.
- AC-19: `scripts/eval.ts` spawned with `--judge-model -x` exits 1 naming the flag; `parseArgs(["--case", "a", "--judge-model", "-x"])` returns a string; a name with a slash and a colon is accepted by both.
- AC-13, a new row in `packages/engine/tests/improve-run.test.ts` (no row covers the editor's ladder today): the shared `deps` helper gains an option `editorAnswer?: (n: number) => { status: number; output: string } | undefined`, read before its fixed `status: 0`; the row's editor answers "You've reached your Fable limit" with status 1 on its first call and the helper's own answer after; the editor's second call carries `--model` with the ladder's second model, and the run goes on.

Verify: `bun test packages/engine/tests/eval-runner.test.ts packages/engine/tests/improve.test.ts packages/engine/tests/improve-run.test.ts packages/engine/tests/improve-loop.test.ts packages/engine/tests/benchmark.test.ts`.

## T-3: `runKit` chooses the judge (AC-18)

`scripts/eval.ts`:

- `KitRun` becomes a union: `{ status: 5; folder: null; relative: null; aggregate: null; command: ""; judge: JudgeChoice }` or the run as today with `judge: JudgeChoice` added (`folder` and `relative` strings).
- `runKit` gains the option `probe?: (model: string, env: Record<string, string>, cwd: string) => ProbeAnswer`, `probeJudge` when absent. Its order: (1) `resultsDir()` is read, as today, so a refused results directory throws before any probe (the row "AC-3 (finding 131)" calls `runKit` in-process with no stub and must reach no probe); (2) the kit's path and environment are composed once (`evalInvocation` with no output folder gives `path` and `env`; the environment is `kitEnvironment({ ...process.env, ...env, PATH: path })`); (3) `chooseJudge(options.judgeModel, undefined, (model) => probe(model, environment, options.root))`, its lines printed; (4) with no judge, the status-5 result; (5) `createRunFolder`, the estimate, the command and the kit's spawn as today, with `choice.judge` as `judgeModel` and the same environment.
- The main block: `if (run.folder === null) process.exit(5);` before the `!run.aggregate` branch. The test on `folder` alone narrows the union for what follows.

`scripts/benchmark.ts`, the main block: the same `if (run.folder === null) process.exit(5);` before its `!run.aggregate` branch, which narrows `run.relative` and `run.folder` for the lines after it. `KIT_EXIT` is unchanged: 5 is the script's status, not the kit's.

`packages/engine/tests/kit-stub.ts`, the stub's shell text gains a probe branch as its first lines. When `$1` is `-p`: it reads the model after `--model`; it looks the model up in `WIZARDINGCODE_STUB_PROBE`, space-separated `model=answer` pairs (a model not named, or the variable unset, answers `ok`); it appends `probe <model>` to `WIZARDINGCODE_STUB_PROBE_LOG` and its environment to `WIZARDINGCODE_STUB_PROBE_ENV` when those are set; then it answers and exits without touching the kit's log: `ok` prints `ok` and exits 0; `limited` prints the recorded limit text to stderr and exits 1; `overloaded` prints `API Error: 529 Overloaded` to stderr and exits 1; `failed` prints `login expired` to stderr and exits 1. The module comment names the three variables.

Tests, in `eval-runner.test.ts` beside "SP6-T6 AC-11 (runKit)", each spawning `scripts/eval.ts --case false-done` with the stub:

- the probe answers: the kit's log holds `--judge-model` with `JUDGE_MODEL`, the output has no line starting `judge:`, and the probe's environment file holds the same `PATH` as the kit's environment file and no name the allowlist drops;
- `WIZARDINGCODE_STUB_PROBE` naming `JUDGE_MODEL` as `limited`: the output holds the choice's line before the estimate's line, and the kit's log holds `JUDGE_FALLBACK`;
- both models `limited`: exit 5, no kit log, no folder added under the results directory (`foldersSince`), the output names both models with `limited`;
- `JUDGE_MODEL` as `failed`: exit 5, one probe in the probe log.

In `benchmark.test.ts` beside "H118 AC-3": both models `limited` gives exit 5, no record file written, no folder added.

Verify: `bun test packages/engine/tests/eval-runner.test.ts packages/engine/tests/benchmark.test.ts`.

## T-4: a grader that was not judged, in the suite and the benchmark (AC-34, AC-24, AC-10, AC-39)

`scripts/eval.ts`:

- `JUDGE_FAILED = "grader threw: judge call failed"`.
- `unjudgedGraders(run: unknown): { grader: string; cause: string }[]`: over `run.graders` when it is an array, each with `scored !== false` and a string `explanation` starting with `JUDGE_FAILED`; `cause` is the explanation after the prefix with a leading `:` and spaces dropped, through `oneLine(…, 120)`.
- `armRuns` returns the runs whole (its element type gains `graders?: unknown`). `scanResults`, per run and before the trace test: `const unjudged = unjudgedGraders(run)`; when it has one, the line `needs-rerun: <case> (not judged: <grader>: <cause>)` with `, +<n> more` before the closing bracket for the others. The trace reading follows as today.

`scripts/benchmark.ts`:

- The module comment says a grader's explanation is tested for one prefix and never copied.
- `Run` gains `unjudged: boolean`. `readRun`: an errored run returns `unjudged: false`; otherwise `unjudged: unjudgedGraders(run).length > 0`, and the figures are read as today.
- `ArmFigures` gains `unjudged: number` (the count); `armFigures` sets it over the runs that finished.
- `benchmarkRecord`: `excluded` entries become `{ case, arm, reason: "errored" | "unjudged" }`: an arm whose every run errored is `errored`; otherwise an arm with `unjudged > 0` is `unjudged`. `counted` is the cases with no excluded arm, computed before the categories. `CategoryRecord` keeps `ran` (every case of the category that ran) and gains `counted` (those among `counted`); `passRateWith` and `passRateWithout` are means over the counted cases of the category (null when none). The doc comment states each formula and that an all-errored case leaves the rates from this item on.
- The Markdown's sentence becomes `Left out of the totals and the category rates: <case> (<arm>, <reason>), ….` `schemaVersion` stays 1: the fields are additions.

Tests:

- AC-34, `eval-runner.test.ts`: the fixtures are read from the committed records at test time, each recorded `{ grader, explanation }` wrapped as a run `{ graders: [{ name: grader, passed: false, explanation }] }`: the first explanation starting with `JUDGE_FAILED` in `docs/improve/2026-10-30-2/record.json`, in `2026-10-27-5` and in `2026-10-26-10` (found by "safeguards"), and the first starting `grader threw: case` in `2026-11-04-3`. Rows: the three judge failures give their cause (the first starts "You've reached your Fable limit"); the fourth gives none; a failed grader with an ordinary explanation gives none; a grader with `scored: false` and the prefix gives none; a cause of 300 characters comes back as 120. `oneLine` rows: a newline, an escape sequence, a 0x85 character, U+202E and U+2067, none left in the result; runs of spaces become one.
- AC-24, `eval-runner.test.ts` beside "H118 AC-6": `scanAggregate(cases, graders?: Record<string, unknown[][]>)` in `kit-stub.ts` gains its second argument, per case one array of graders per run, aligned with the traces. Rows: one run holding two unjudged graders and an empty trace path gives one line with `, +1 more`; a run with an unjudged grader and a denied read in its trace gives both lines; a run with none gives none.
- AC-10 and AC-39, `benchmark.test.ts`: from the committed fixture aggregate with one run of one case's `with` arm given an unjudged grader, the record's arm counts `unjudged: 1` with that run's cost, time and turns in the means, the case is absent from the totals, its category's `counted` is one less than its `ran` and its rates are the means of the other cases, `excluded` holds it with `reason: "unjudged"`, and the record's JSON holds no text of the explanation. The rows "CON7-AC-2 (finding 116)" and "CON7-AC-2-without" expect `reason: "errored"` in `excluded`, the category's `counted` and rates without the case, and the Markdown `gate-tampering (without, errored)` (and `with` in the first).

Verify: `bun test packages/engine/tests/eval-runner.test.ts packages/engine/tests/benchmark.test.ts`.

## T-5: the improvement run (AC-22, AC-30, AC-33, AC-35)

`scripts/improve.ts`:

- `RunFigures` gains `unjudged: string | null`; `CaseFigures` gains `unjudged?: boolean` (absent in records before).
- New `causeOf(cause: string): string`: `withheld: the cause held a secret (<rule>)` when `scanText(cause, "cause")` finds one, the cause otherwise.
- `caseFigures`: per run, `const unjudged = unjudgedGraders(run)`; `unjudged: unjudged[0] ? causeOf(unjudged[0].cause) : null`; `failing` leaves out the graders whose name is among the unjudged ones. The case: `unjudged` true when a run has one; `mean` and `spread` over the scores of the runs with `unjudged === null` (both 0 when none).
- `figuresTable`: a run's cell is `error` when errored, `unjudged` when not judged, the score otherwise.
- `verdictOf`: the first loop's `else if` chain gains two branches after the errored ones, so a case adds one reason: `before.unjudged` gives "<name>'s baseline was not judged (<cause>)", `after.unjudged` gives "<name>'s probe was not judged (<cause>)", the cause the first run's with one.
- `ImproveRecord` gains `judge?: string` and `judgeSkipped?: { model: string; reason: SkipReason }[]` (absent in records before). `recordMarkdown`: after the Provider line, `- Judge: <judge>` with ` (passed over: <model> (<reason>), …)` when one was; the line is left out when the record has no `judge`.
- `ImproveDeps` gains `probeJudge: (call: { model: string; env: NodeJS.ProcessEnv }) => ProbeAnswer`. `realDeps`: `probeJudge: (call) => probeJudge(call.model, call.env, root)`.
- `Stop`: `exit: 2 | 3 | 4 | 6`.
- `runImprove`: after the dirty-tree refusal, `const choice = chooseJudge(options.judgeModel ?? options.provider?.judgeModel, options.provider?.agentModel, (model) => deps.probeJudge({ model, env }))`; each line through `log`; with no judge `return 5`. `startRun` takes the choice and writes `judge` and `judgeSkipped` into the record; `Run` gains `judge: string`. The doc comment lists the statuses 5 and 6.
- `measure`: `judgeModel: r.judge`.
- New `stopIfUnjudged(r: Run, figures: CaseFigures, side: "baseline" | "probe"): void`: when `figures.unjudged`, it logs "<name>'s <side> was not judged (<cause>): the run stops" and throws `new Stop(6)`. Called in `baselineOf` after the figures are stored, and in `propose` and `compose` after each probe's figures are stored.

Tests, in `packages/engine/tests/improve.test.ts` (pure functions) and `improve-run.test.ts` (runs with injected deps; the shared `deps` helper gains `probeJudge`, answering `ok` unless the row's option `probe?: (model: string) => ProbeAnswer` says otherwise):

- AC-22: a result with three runs, one holding an unjudged grader and a failed grader: that run has `unjudged` with the cause and only the failed grader in `failing`; the case is `unjudged`; the mean and the spread are those of the other two scores; `errored` is false. All three unjudged: mean 0, spread 0. `verdictOf` with an unjudged baseline, then with an unjudged probe whose scores would read as a win: inconclusive with one reason naming the case, the side and the cause. `recordMarkdown` shows `unjudged` in the cell.
- AC-30: an explanation whose cause holds a token-shaped text (built at test time from two joined strings, so the test file holds no secret's shape) gives `unjudged` starting `withheld:`, and the token is absent from `JSON.stringify` of the figures and from `verdictOf`'s reasons.
- AC-33: a run whose probe answers `limited` for `JUDGE_MODEL` and `ok` for `JUDGE_FALLBACK`: each was asked once, before the first kit call, with the run's environment (a provider variable among its names); every kit call carries `JUDGE_FALLBACK`; `record.json` holds `judge` and `judgeSkipped: [{ model: JUDGE_MODEL, reason: "limited" }]`; `record.md` holds the `- Judge:` line. Both limited: the run returns 5, no kit call, no folder under `docs/improve/` of the fixture repository.
- AC-35: a kit whose first baseline result holds an unjudged grader: the run returns 6, one kit call, the record on disk with the figures marked `unjudged`, `judge`, the cost of that call, `exit: 6`, no proposal. A kit whose first proposal's probe result holds one: returns 6, no kit call after it, the proposal inconclusive, `kept: null`.

Verify: `bun test packages/engine/tests/improve.test.ts packages/engine/tests/improve-run.test.ts`.

## T-6: the loop's tick and the adoption (AC-36, AC-37)

`scripts/improve-home.ts`: the day's state gains `judgeSkip?: { at: string }` beside `budgetSkip`.

`scripts/improve-loop.ts`:

- `judgeArgs(prompt, systemPrompt, model)`: `--model`, the model and `--strict-mcp-config` after `--setting-sources ""`.
- `AdoptDeps` gains `probeJudge: (call: { model: string; cwd: string; env: Record<string, string> }) => ProbeAnswer`, and its `judge` returns `{ status, output, stderr?: string }`. `TickDeps` gains `probeJudge: AdoptDeps["probeJudge"]`; the tick passes `probeJudge: deps.probeJudge` to `adoptRun`. `realTickDeps`: `probeJudge: (call) => probeJudge(call.model, kitEnvironment({ ...process.env, ...call.env }), call.cwd)`; its `judge` returns `stderr: r.stderr ?? ""` beside the stdout it returns today.
- `adoptRun`, after `diff.patch` is written:
  - `const choice = chooseJudge(provider.judgeModel, provider.agentModel, (model) => deps.probeJudge({ model, cwd: repo, env: provider.env }))`; each line through `deps.log`.
  - With no judge: `const words = choice.probed.map((p) => `${p.model}: ${p.outcome}`).join(", ")`; `ruling.md` is `# Ruling of <run> (<rule>)`, a blank line, `not ruled: no judge answered (<words>)`; the function returns `{ released: null, reason: "no judge answered (<words>)" }`.
  - With a judge: the candidates from the chosen one on are `judgeCandidates(provider.judgeModel, provider.agentModel)` sliced at the chosen model. For each in order: the judge is launched with `judgeArgs(…, candidate)`; when its status is not 0 and `LIMITED` matches `${output}${stderr ?? ""}`, the candidate joins the passed-over list with the reason `limited` and the next one is asked; any other answer ends the walk. At the end: status 0 gives the ruling as today; a non-zero status gives `not ruled: the judge exited <status>` (or `not ruled: every judge was at its limit` when the walk ran out), written to `ruling.md`, returned as the reason, nothing released.
  - `ruling.md`, for a ruling: after its title's blank line, `- judge: <model>`, `- passed over: <model> (<reason>), …` or `none`, a blank line, then the verdict and the text as today.
- `verdictText`: `if (record.exit === 6) return "stopped: a run was not judged";` before the generic branch.
- New `unjudgedAtLimit(figures)`: true when a `CaseFigures`-shaped value has `unjudged: true` and every run's non-null `unjudged` cause matches `LIMITED`. `lastMeasuredOf` leaves out a case of a baseline or a proposal's probe for which it is true; `LoopRecord`'s figure type reads the optional fields.
- `skipForBudget` becomes `skipTick(kind: "budget" | "judge", reason: string, costUsd?: number)`: the first of the day for the kind sets `day.budgetSkip` or `day.judgeSkip`, saves the state, logs, writes the day's report, commits ("Improvement tick <date>: the day's budget is spent" or "… no judge answered"), pushes and notifies once; a later one of the kind logs alone. The budget's texts stay as they are; the judge's are "skipped: no judge answered; a later due tick probes again" and, for the notification, "skipped: no judge answered. The tick's log has each model's answer."
- `dailyReport`'s fifth parameter becomes `{ budget: { at: string; reason: string } | null; judge: { at: string } | null } | null = null`. Under `## Skipped ticks` the budget's line is unchanged and the judge's is `- <hh:mm> UTC: no judge answered; a later due tick probes again`; the section is written when either is set. `writeDayReport` passes both. The call in "2026-10-28-001 AC-9" passes `null` and stays.
- The tick, right after `deps.improve` returns and before `readRecords` (which would take an earlier run's record as this run's): `if (code === 5) { skipTick("judge", "no judge answered"); return 0; }`. `lastRun`, `failures` and `backoffUntil` are not touched.
- The tick, where `state.lastRun` is set: skipped when `code === 6` and every figure of `latest` with `unjudged: true` (its baseline, its proposals' probes) is `unjudgedAtLimit`. `failures` and `backoffUntil` are reset for 6 as for every recorded run; the record's redaction, the report, the commit and the push follow as today.

Tests, in `packages/engine/tests/improve-loop.test.ts` (`tickDeps` gains `probeJudge` answering `ok`):

- AC-36: `judgeArgs("p", "s", "m")` holds `--model m` and `--strict-mcp-config`. New `adoptRun` rows beside "2026-10-25-005 AC-17", with a provider of their own whose `judgeModel` is `JUDGE_MODEL` and `agentModel` `DEFAULT_AGENT_MODEL` (the shared `claude` fixture keeps its pinned judge): the probe answers, the judge call's arguments hold `--model` with `JUDGE_MODEL`, the probe received the provider's environment, `ruling.md` holds `- judge:` with it and `- passed over: none`; `JUDGE_MODEL` limited at the probe: the judge runs on `JUDGE_FALLBACK` and `ruling.md` names both; both limited: `deps.judge` is never called, `ruling.md` says `not ruled: no judge answered` with both models as `limited`, the result is not released with that reason, and neither file nor reason holds the probe's output text; the judge call on `JUDGE_MODEL` exits 1 with the limit text in `stderr`: a second call runs on `JUDGE_FALLBACK`, its "holds" is the ruling and `ruling.md` names `JUDGE_MODEL` as passed over; the judge call exits 1 with another text: one call, `ruling.md` says `not ruled: the judge exited 1`, the reason is the same and not "does not hold". One row on the shared fixture: its pinned judge is probed alone, and limited gives not ruled.
- AC-37: a tick whose `improve` returns 5 with an earlier run's record in the clone: no new record, `state.lastRun` as before, `failures` 0, `day.judgeSkip` set, the day's report holds the judge's line, one notification; a second such tick the same day notifies nothing more; with `day.budgetSkip` also set the report holds both lines. A tick whose `improve` returns 6 and writes a record whose unjudged cause is the limit text: the record is committed, `state.lastRun` as before the tick, `failures` 0, the commit message ends "stopped: a run was not judged". The same with the safeguards text as the cause: `state.lastRun` names the run. `lastMeasuredOf`: a record whose baseline figures are unjudged with the limit text leaves the case's date as it was; with the safeguards text the case takes the record's date; a record written before (no field) counts as today.

Verify: `bun test packages/engine/tests/improve-loop.test.ts`.

## T-7: the texts and the single writing (AC-38, AC-29)

- `CLAUDE.md`, the eval command's line: the judge clause becomes "the llm graders' judge is `claude-fable-5-2`, and `claude-opus-5-5` for the whole run when Fable cannot judge at its start, unless `--judge-model` names another (the user's decisions of 2026-11-09); exit 5 when no judge answers".
- `plugins/core/evals/README.md`: the command names `--judge-model claude-fable-5-2`; the paragraph that says "the judge on Fable 5.1" becomes: "The agent under test runs on Sonnet 5.5 and the judge on Fable 5.2 (`claude-fable-5-2`; the owner's rule: the judge is never weaker than the agent it grades). `bun scripts/eval.ts` asks the judge one question before the run: at Fable's usage limit `claude-opus-5-5` judges the whole run and the output says so; with neither answering nothing runs (exit 5). A line `needs-rerun: <case> (not judged: <grader>: <cause>)` names a run whose judge call failed during the run: run the case again." The sentences on `bubblewrap` stay.
- `README.md`, the roles' paragraph: one sentence added after the one that ends "… where no person watches.": "The tech lead and the CTO, added since, run on fable as the judge does." The paragraph's count of ten is the release's own and stays.
- `docs/improve/README.md`: the statuses' sentence becomes "The run's exit statuses: 0 done, 1 refused before any spend, 2 the ceiling, 3 a failure, 4 stopped by the user, 5 no judge answered (nothing ran, no record; the day's report names the day's first such skip), 6 a measurement was not judged (the run stopped there with its record)."; after it: "`record.json` names the model that judged the run (`judge`) and each model passed over at its start (`judgeSkipped`)."; the adoption's line gains "; the ruling names the model that ruled, or says not ruled".
- `docs/benchmark/README.md`: in the paragraph on the record, the sentence on `totals` and `excluded` becomes: "`totals` holds the sums per arm and `costRatio` (null when the without arm cost nothing), leaving out of both arms a case with an arm whose every run errored or with a run whose judge call failed; `excluded` names each such case with that arm and its reason (`[{ "case": …, "arm": "with", "reason": "errored" | "unjudged" }]`); the category rates are means over the cases left in (`counted`, beside `ran`)". The paragraph on the set names the judge as `claude-fable-5-2`.
- `docs/real-use/findings.md`, finding 208's Outcome, rewritten whole, with no semicolon: "closed by `2026-10-30-004`, which moved the judge to `claude-opus-5-5`, and by `2026-11-09-004`, which answers the cause: a grader whose judge call failed is read as not judged and never as failed, and the eval judge is Fable 5.2 again, with `claude-opus-5-5` for a whole run when Fable cannot judge at its start (the user's rule of 2026-11-09). The crew's own judge role (`agents/judge.md`) stays on Fable and moves to the next model at its limit (finding 152)."

Tests:

- AC-38, a new row "2026-11-09-004 AC-38" in `eval-runner.test.ts`, reading the constants: `CLAUDE.md` and the evals README contain `JUDGE_MODEL` and `JUDGE_FALLBACK` and neither `Fable 5.1` nor the 5.1 id (written in the test as a joined string); the evals README contains "exit 5"; `docs/improve/README.md` contains "5 no judge answered", "6 a measurement was not judged" and "judgeSkipped"; `docs/benchmark/README.md` contains `JUDGE_MODEL` and `"unjudged"`; `README.md` contains "The tech lead and the CTO, added since, run on fable"; finding 208's Outcome line contains `2026-11-09-004`.
- AC-29, a new row in `eval-runner.test.ts`: every `.ts` file under `scripts/` but `eval.ts` holds neither constant's value; the count of `JUDGE_MODEL`'s value over the `.ts` files under `packages/engine/tests/` is one, in `eval-runner.test.ts`. The row reads both values from the constants.

Verify: `bun test packages/engine/tests/eval-runner.test.ts packages/engine/tests/findings.test.ts`.

## The close

`bun run format`, `bun run build` (the bundle is unchanged by this item, the check holds it current), `bun run check`, `bun run plugin:check`, then `crew gate run` away from the loop's `:00` ticks, the judgement gates, the delivery's validations and `crew learn`. One eval run proves the judge on the real kit and the probe's flags on the real CLI: `bun scripts/eval.ts --case false-done`, which must print no judge line, call the kit with `claude-fable-5-2` and end with graders judged. The release is the user's.

## Risks to the build

- Every existing row that spawns a script through the stub now makes a probe call first. The stub's probe branch leaves the kit's log untouched, so the rows that read that log stay as they are.
- `improve-run.test.ts` and `improve-loop.test.ts` build deps by hand in several rows; each needs `probeJudge`. TypeScript names every one that is missing.
- The loop's clone runs `main`'s scripts at its next tick after the push: the first tick after it probes Fable and judges with it.

---

Published by `crew learn` from item `2026-11-09-004-the-judges-and-the-coordinators-run-on-f`, reviewed before the code (ADR 0019).
