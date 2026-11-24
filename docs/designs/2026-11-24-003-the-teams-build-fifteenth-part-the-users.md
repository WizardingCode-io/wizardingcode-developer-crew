# A gate does not pass because its tool is absent

The predecessor is `concepts_brief.md` in this item's folder: the account of six reviewers with no context who read the first concept against the code. That first concept is in the brief's Overview; this spec holds what its Goals and Key Decisions kept, and what the four leads' reading of the spec changed after it.

Size: one task for one session. Five source files (`run.ts`, `tdd.ts`, `gates.ts`, `evidence.ts` and `cli.ts` of `packages/engine/src/`), three documents (`references/gate.md`, ADR 0002, ADR 0006) and one new test file.

## Problem

A person who reads "lint: pass" or a proven item takes it that the linter and the audit ran. Where the tool never ran, they ship a change nobody checked. The security and the ETL definitions each ask one thing of the code under "What a tool that is not installed means for a gate": "A gate does not pass because its tool is absent." In most gates a planned gate that cannot run is unavailable or failing, and either leaves the item not proven. This item changes three things, two where the rule is not held and one where the answer misleads:

1. A lint or a typecheck that fails is read for the files it names, and where none of them is a file the item changed, the run is rewritten to `pass` as the repository's standing debt (ADR 0006). A command that never ran goes down the same path. A bare missing binary names no file and fails today. Two runs pass today: a script that exists and cannot be executed (exit 126), whose shell line names the script itself, an existing source file the item did not change; and a compound command whose earlier step named unchanged files and whose later step was not found (exit 127).
2. On the standard route an audit whose tool or lockfile is missing is left out of the plan, and nothing says so. An item that changed a manifest is then proven with no audit and no line that says none ran. The plan does not look at the policy's required gates, so a project that requires `deps` gets the same silence.

3. A test, a build or an audit command that never ran fails with no reason, so the verdict reads `gate test failing`, as if tests had failed though none ran.

## Goals and Non-Goals

Goals:

- A command gate whose command did not run (exit 126 or 127), or ended with no exit status (not started, or ended by a signal), ends unavailable, with a reason that holds which of the three it was and sends the reader to the run's log. This holds for build, test, lint, typecheck and the audit, and for the three callers of the function that runs one gate: the item's run, a todo's gate and `crew audit`. Its output is read neither for the files it names nor as an audit's report, and no line of it enters the reason.
- One function says "this command gave no result", read by the gates and by `crew tdd red`, which holds the rule today.
- A project whose policy requires `deps` has the audit planned on the standard route too.
- On the standard route an audit left out of the plan is said in the lines `crew gate run` prints and in the item's `report.md`, under its Gates table.

Non-Goals:

- A missing tool behind something that hides its exit code. Measured on this machine (macOS, `/bin/sh`) on 2026-11-24, a missing binary gives 127 as a direct command and behind `npm run`, `bun run` and `composer run-script`, which the rule therefore covers; `npx --no-install` and `bunx --no-install` exit 1 and `make` with no rule exits 2, which it does not. Read and not run: `turbo`, `nx`, a pipeline, a line ending in `|| true`, and Windows' cmd.exe (9009 or 1; finding 114 stands open). `pnpm` and `yarn` were not measured. A run whose code is hidden is judged as before this item.
- A command ended by a signal whose shell reports it as an exit code. Measured the same day: a single command, and one behind `npm run`, reach the engine with no exit status; a signalled step of a compound line (`echo x && <command>`) gives 137, and a line ending in `; true` gives 0. Those two are judged as before.
- A tool that ran and crashed (ESLint exits 2 on a configuration error and names its configuration file). It needs each tool's exit codes and is an item of its own.
- Rows stored before this item: a lint row stored as passed with exit 126 stands until the item's next gate run.
- A field in the evidence; the exit code in the report's Gates table.
- The todo gate where a required audit cannot run: it fails the todo with the audit's row, as on the full route today.
- The e2e gate and the design detector, which run their commands by another path and are judged as before.
- The Python audit, which looks for `pip-audit` on PATH and runs it through `uv`, `poetry` or `python`. The reason "no lockfile", which does not name the file expected. Gitleaks, which stays an extra of the secrets gate.

## Open Questions

None.

## Critical User Journeys

- Given a project whose lint command is `./tools/lint.js`, a file with no execute bit, when a session runs the gates of an item that changed another file, then the lint gate is unavailable with `its command did not run (exit 126, not executable); the log holds the shell's message`, and the verdict says `gate lint unavailable:` with that reason.
- Given a project whose test command's binary is not installed, when the gates run, then the test gate is unavailable with `its command did not run (exit 127, not found); the log holds the shell's message`, and the run's log names the binary.
- Given a standard item that changes `package.json` in a project with no lockfile, when the gates run, then the output of `crew gate run` and the item's `report.md` each hold a line that says the audit of that target was not planned and why, and the verdict is what the other gates make it.
- Given the same item in a project whose policy requires `deps`, when the gates run, then the audit is planned, ends unavailable with "no lockfile", and the item is not proven until the lockfile exists, `deps` leaves `requiredGates`, or a person lists `deps` under `allowSkips` in `policy.json` and then skips the gate (the default policy refuses that skip).

## Design

**A command that gave no result.** `packages/engine/src/run.ts` gains `gaveNoResult(result)`: true for a result that did not time out and whose exit is 126, 127 or none. 127 and 126 are what a POSIX shell gives for a command it cannot find and one it cannot execute, and the engine runs every command through a shell. No exit status is what a command gives when the shell itself could not start, and also when the command was ended by a signal and the shell did not turn the signal into an exit code. The Non-Goals say for which shapes of a command that holds. Such a command may have run for minutes (a test runner killed for memory), so the engine says of it only that it ended with no status. A run past its time bound also has no exit status; it is not this case and keeps its reason, "timed out". `crew tdd red` reads the function where it compared the three values itself; its message and its answer do not change.

In the function that runs one gate (`runOneGate` in `packages/engine/src/gates.ts`), after the run is built from the command's result and after the return for a timed-out run, before the audit's judging and the reading of named files: a run that gave no result is returned with status `unavailable` and one of three reasons, each a fixed sentence:

    its command did not run (exit 127, not found); the log holds the shell's message
    its command did not run (exit 126, not executable); the log holds the shell's message
    its command ended with no exit status (not started, or ended by a signal); the log holds its output

The run keeps its command, its exit, its log and its tail. It holds no `problems` and no `advisories`. No line of the command's output enters the reason: a reason travels to the verdict, the report, the audit's report and a mail reply, none of which passes it through the secrets scan, and the log and the tail already hold the line where a session reads it.

Unavailable is the state a gate with no command and an audit with no tool already end in ("no command", "pip-audit not on PATH"), and the verdict prints an unavailable gate's reason and not a failing gate's. A script of the project's own that exits 127 or 126 for a reason of its own ends the same way: the engine cannot tell the two apart.

`plugins/core/skills/crew/references/gate.md` tells a session what to do with each state. This item changes the state such a run ends in, so the bullet that opens "A gate is unavailable" now applies to it where the bullet "A gate fails" did, and that bullet speaks only of a gate with no command. It gains one sentence at its end, and the last sentence of the bullet that opens "Lint and typecheck", "A tool that names no files is judged by its exit code.", gains a clause. The two sentences as they will stand:

    An unavailable gate whose reason says its command did not run, or ended with no exit status, has a command, so read the run's log first: a tool or a script that is not installed asks for the project's install step, a file that cannot be executed for its mode, and then a run again; a command of the profile that names the wrong tool, or a script the project does not have, is corrected with `crew profile set`, the user's decision; a command that ended with no exit status is run again and, where it ends the same way, said to the user as it is (it was ended from outside, often for memory); a skip is never the answer to any of them.

    A tool that names no files is judged by its exit code, unless its command gave no result.

**An audit left out of the plan.** The planning keeps what it does: on the standard route a `deps` gate whose audit cannot run is left out. Two changes, both in `gates.ts`:

- It is left out only where the policy's required gates do not name `deps`. Where they do, it stays in the plan and ends unavailable with its reason, as on the full route. `gatesForTarget` already plans a required `deps` on every target the change touches, a manifest changed or not; this item removes the one line that undid it.
- The loop that makes the plan also returns what it left out: one entry per target, with its path, its stack where two targets share the path, and the reason `depsAuditCommand` gave. `plannedGates` keeps its signature and its answer; a new `auditsLeftOut(route, profile, policy, changed, root)` returns the entries, and a new `planNotesFor(paths, work, profile, policy)` returns them as the lines below for an item's change as it stands. All read the one function that makes the plan. Within one gate run the plan is made once, so the gates run and the lines printed come from the same answer.

`runGates` makes the plan once, through the one loop, and reads from that one result both the gates it runs and the entries left out. It puts one line per entry in a new `planNotes` of its outcome, and `crew gate run` prints them after the gates' summary, where it prints the notes on the standing e2e skip, and returns them in its data as `planNotes`:

    deps (<target>) not planned: <reason>; no audit ran for this change, and on the standard route the verdict does not wait for it (the policy's requiredGates can require it)

The target is written as the summary of `crew gate run` writes one: its path, then `, <stack>` where two targets share the path (`deps (.)`, `deps (., node)`). The lines come from the plan and not from the gates a run was asked for, so `--only` does not change them.

The item's `report.md` prints the same lines, each as a paragraph after its Gates table: the CLI's one function that writes a report asks `planNotesFor` when it writes, and gives the lines to the renderer as an option. Nothing is stored: the lines are worked out at each gate run and at each writing of the report. A report's lines are therefore the plan's at the moment the report is written, and can differ from the gate run whose rows stand above them; the Risks name the two cases. They read the process's environment, as the plan does, and not the gates' own, so a line can name as missing a tool that only the gates' environment has.

**The earlier decision and its one exception.** A standard item is still proven without an audit that cannot run (ADR 0002's Decision: "The standard route still drops it when no tool can run"; finding 10), with one exception this item makes: a project whose policy requires `deps`. That amends the quoted sentence of ADR 0002, by a dated note at its foot and no change to its Decision's text. ADR 0006 gains a dated note as well: a command that gave no result is unavailable and is read neither for the files it names nor as an audit's report, which narrows three of its sentences: "the gate is judged by its exit code as before", "reported, not failing" and "A tool that names no files is judged as today". In a project whose policy requires `deps`, the audit is planned for every item already, a manifest changed or not, and runs where its tool can run; what this item changes is the case where it cannot: the gate then ends unavailable where it was left out. So there a target whose audit cannot run holds every item, and a target of a stack with no audit tool (Go, Rust) is never proven until `deps` leaves `requiredGates` or a person lists `deps` under `allowSkips` in `policy.json` and then skips the gate. An item in progress in such a project turns unproven with `gate deps not run` when the engine is updated.

### Alternatives

From `concepts_brief.md` in this item's folder, but the first, which the leads' reading added.

- Quote the last line of the command's output in the reason, so that it names the missing binary. Rejected at the leads' reading: it would be the first reason to carry a command's output, into four places no secrets scan covers; the log holds the line.
- Exit 127 or 126 as `fail` with a reason, on lint and typecheck alone. Rejected: the verdict prints no reason for a failing gate, one cause would have two states in the engine, and build, test and the audit would keep a failure that says nothing.
- Read the output for "command not found" lines, to catch a wrapper that hides the code. Rejected: the words differ by shell, wrapper and language, and a tool's own output can hold them; the rule would guess.
- A rule per tool on which exit codes mean "found problems". Rejected for this item: a table of every tool's codes to write and keep.
- `evidence.auditsNotPlanned`, a stored list. Rejected: a second record of what did not run, stale once the tool is installed, and kept unread by an older engine. A line worked out when the report is written is not stored and so has neither; it shares the list's other weakness, that the plan reads the process's environment and not the gates'.
- Plan the audit on the standard route too and let the verdict excuse an unavailable one. Rejected: it changes the verdict's reading of a gate, the todo gate and the hooks' plan for every project at the update, for one line of information.
- Judge stored rows again at the verdict. Rejected: the verdict would stop being a reading of what the run stored.
- Leave a required audit with no tool out of the todo gate. Rejected: the full route's todo gate holds it today.

## Acceptance criteria

The numbers are the engine's, and a number not listed is a criterion that was replaced. The six are in the Design's order.

- AC-11: a lint run and a typecheck run whose command did not run end `unavailable` with the Design's reason for their exit code and hold no `problems`, in the two cases that pass before this item: a command that is a file of the repository with no execute bit and a source extension, unchanged by the item (exit 126); and a command that prints the path of an existing unchanged file and then calls a binary that does not exist (exit 127). A run that exits 1 and names only unchanged files still passes as pre-existing, and one that names a changed file still fails with its reason.
- AC-14: a test gate and a build gate whose command's binary does not exist end `unavailable` with the Design's reason for exit 127, and the item's verdict is unproven with `gate test unavailable:` and `gate build unavailable:` followed by the reason. A gate whose command ends itself by a signal ends `unavailable` with the Design's reason for no exit status. An audit whose command prints a readable report with one advisory and exits 127 ends `unavailable` with the reason and holds no `advisories`. In a todo's gate over a test command whose binary does not exist, the test run is `unavailable` with the reason and the todo's gate fails; `crew audit` over it records the run `unavailable` with the reason. No reason holds a line of the command's output. `gaveNoResult` is true for exit 126, 127 and none, and false for 0, 1, 2 and for a timed-out result with exit 127 or none.
- AC-15: on the standard route, for an item that changed a manifest in a target whose audit cannot run, the plan holds no `deps` gate, `auditsLeftOut` returns one entry with the target and the reason, the outcome of `runGates` holds the Design's line in `planNotes`, with `--only` naming another gate as well, the output of `crew gate run` holds it, the item's `report.md` holds it after its Gates table, the evidence holds no trace of it, and the verdict is the one the other gates give. With two targets at one path each entry and each line names its stack. Where the audit can run, where no manifest changed, and on the fast and the full routes, `auditsLeftOut` and `planNotes` are empty and the report holds no such line.
- AC-9: with `deps` among the policy's required gates, the same standard item plans the `deps` gate, its run is unavailable with the reason, `auditsLeftOut` is empty, and the verdict is unproven with `gate deps unavailable:` and the reason. With no manifest changed the gate is planned as well.
- AC-13: `references/gate.md` holds the Design's two sentences, and ADR 0002 and ADR 0006 each end with a note headed by this item's date and id that says what the Design says of it, their Decision sections unchanged.
- AC-10 (preserve): the tests that stood before this item pass with no `test(` removed, no expected value changed and no assertion made to accept more. Run before and after, the after on a built bundle: `gates`, `evidence`, `detect-go-rust`, `tdd`, `tasks`, `audit-run`, `cli`, `skill`.

## Risks and rollback

- A run that failed with exit 126, 127 or none is unavailable after the update. Failing and unavailable both leave the item not proven; a count of failing gates reads one less and of unavailable one more; `crew audit` lists such a run under what could not run.
- A command ended by a signal after it started reads "ended with no exit status", not "failing", and only its log tells it apart from one that never started. This holds for a single command and behind `npm run`; in a compound line the same signal reads `failing`, as before, so one cause has two states by the shape of the command. The run's log does not name the signal; `gate.md`'s new sentence says what to do.
- A project's own script that exits 127 or 126 on purpose, and passed lint as pre-existing, no longer passes.
- In a project whose policy requires `deps`, a target whose audit cannot run holds every standard item and every todo's gate from the update on, an item in progress included. Both ways out are a person's edit of `policy.json` (`crew policy set` writes neither list), so a run with nobody present stays unproven until then. Searched on 2026-11-24: the 18 `policy.json` files of the projects on this machine, none of which holds `requiredGates`; projects on other machines were not read.
- The report's lines can differ from the gate run above them, in two ways. A tool installed after a gate run makes the line go at the report's next writing though no audit ran; until the next gate run nothing says so, and from that run on the audit is in the plan and the verdict waits for it. A tool or lockfile that goes after a run that did audit leaves a `deps` row of that run beside a line that says not planned; the line is the current plan's, the row the last run's.
- Rollback is the revert of the one commit. No stored record changes shape. A row stored as unavailable with a command stays in the evidence under an older engine, which reads it as it reads any unavailable row.

## Non-Functional Requirements

- Cost: the check is a comparison on a result the gate already holds, and a gate run makes its plan once, as before; a report's writing makes the plan once more. This item adds no audit: a project whose policy requires `deps` and whose audit can run already runs it at every gate run and every todo's gate (two audits over the network each time, the tree and the base commit), and where the audit cannot run the gate ends unavailable without running anything.
- Security: no line of a command's output enters a reason, since a reason reaches the verdict, the report, the audit's report and a mail reply with no secrets scan. The printed line holds the engine's own words, a target's path, a stack's name and `depsAuditCommand`'s reason, which names at most a package manager.

## Out of scope

- The inventory's other gaps that are by design: a profile with no command for build, lint or typecheck, the e2e gate without chrome-devtools.
- Whether a reviewer used a tool it was given: no gate reads that.

# Plan: a gate does not pass because its tool is absent

One task, in this checkout. It builds `spec.md` of this folder.

## Files

- Create `packages/engine/tests/gates-absent-tool.test.ts`: the tests of AC-11, AC-14, AC-15, AC-9 and AC-13.
- Modify `packages/engine/src/run.ts`: export `gaveNoResult(result: Pick<RunResult, "exit" | "timedOut">): boolean`, true when `timedOut` is false and `exit` is 126, 127 or null. A comment says what the three values mean, and that no exit status is also a command ended by a signal.
- Modify `packages/engine/src/tdd.ts`: the condition of the red run that compares `exit` with 126, 127 and null becomes `result.timedOut || gaveNoResult(result)`. The message is not touched.
- Modify `packages/engine/src/gates.ts`:
  - three exported constants hold the spec's three reasons, `NOT_FOUND_REASON` (127), `NOT_EXECUTABLE_REASON` (126) and `NO_EXIT_REASON` (none); a function of the file, `noResultReason(exit)`, returns the one for an exit code.
  - in `runOneGate`, after the `GateRun` is built from the command's result and after `if (result.timedOut) return run;`, before `judgeAudit` and `judgeProblems`: `if (gaveNoResult(result)) return { ...run, status: "unavailable", reason: noResultReason(result.exit) };`.
  - the whole body of `plannedGates` moves into a function of the file, `planOf(route, profile, policy, changed, root)`, which returns `{ planned, leftOut }`: `secrets`, `prose`, `design-lint`, `design-detect`, the loop over the touched targets, the `test` gate planned at the root where no target covers the change, and `e2e`, all as they stand. Two things change, both inside the loop over the touched targets: the condition that leaves the audit out on the standard route gains `!policy.requiredGates.includes("deps")`, and where it leaves one out it pushes `{ target: target.path, stack?: target.stack, reason }` to `leftOut`, `stack` set where two targets share the path (the loop's own `shared`).
  - `plannedGates` returns `planOf(...).planned`, so `assess`, `runTaskGate` and `audit-run.ts` keep calling it unchanged. A new exported `auditsLeftOut(route, profile, policy, changed, root)` returns `planOf(...).leftOut`. An exported type `AuditLeftOut` names the entry.
  - a function of the file, `planNote(entry)`, writes one entry as the spec's line: `deps (<path>)`, or `deps (<path>, <stack>)` where the entry has a stack, then ` not planned: <reason>; no audit ran for this change, and on the standard route the verdict does not wait for it (the policy's requiredGates can require it)`.
  - a new exported `planNotesFor(paths, work, profile, policy): string[]`: the change's watched paths as `assess` reads them (`changedWatchedPaths(paths.root, profile, work)`), then `auditsLeftOut(work.route, profile, policy, changed, paths.root).map(planNote)`.
  - `GateOutcome` gains `planNotes: string[]`. `runGates` calls `planOf` once, where it called `plannedGates`, and reads `planned` and `leftOut` from that one result; `planNotes` is `leftOut.map(planNote)`, whatever `options.only` names. The outcome returns it.
- Modify `packages/engine/src/evidence.ts`: `ReportOptions` gains `planNotes?: string[]`; `renderReport` prints each as a paragraph of its own (a blank line, then the line) right after the rows of the Gates table and before the UI evidence. With none, nothing is printed.
- Modify `packages/engine/src/cli.ts`: the gate run's text gains `outcome.planNotes.map((n) => "\n" + n).join("")` right after the standing notes, and its data `planNotes: outcome.planNotes`; `reportOf` gives `renderReport` `planNotes: planNotesFor(env.paths, work, env.profile, env.policy)`.
- Modify `plugins/core/skills/crew/references/gate.md`: at the end of the paragraph that opens `- **A gate is unavailable**`, the sentence ``An unavailable gate whose reason says its command did not run, or ended with no exit status, has a command, so read the run's log first: a tool or a script that is not installed asks for the project's install step, a file that cannot be executed for its mode, and then a run again; a command of the profile that names the wrong tool, or a script the project does not have, is corrected with `crew profile set`, the user's decision; a command that ended with no exit status is run again and, where it ends the same way, said to the user as it is (it was ended from outside, often for memory); a skip is never the answer to any of them.``; in the paragraph that opens `- **Lint and typecheck**`, the last sentence becomes `A tool that names no files is judged by its exit code, unless its command gave no result.`
- Modify `docs/adr/0002-dependency-audit-on-dependency-changes.md`: a last paragraph, ``Note of 2026-11-24 (item `2026-11-24-003`): the standard route keeps the audit in the plan when `policy.json` lists `deps` in `requiredGates`, and it ends unavailable there when no tool can run; the Decision's sentence "The standard route still drops it when no tool can run" holds for every other project. Such a project already ran the audit at every item where its tool could run; what changes is that an audit that cannot run now holds the item. An audit the standard route leaves out is said in a line of the gate run's output and of the item's report, stored nowhere.``
- Modify `docs/adr/0006-gates-judge-the-item.md`: a last paragraph, ``Note of 2026-11-24 (item `2026-11-24-003`): a gate whose command did not run (exit 126 or 127) or ended with no exit status is unavailable, with a fixed reason, and is read neither for the files it names nor as an audit's report. This narrows three sentences of the Decision: "the gate is judged by its exit code as before", "reported, not failing" and "A tool that names no files is judged as today".``
- Modify `plugins/core/dist/crew.mjs`: by `bun run build`.

No change to `types.ts` or to any stored record.

## Phases

Each phase is held to the command named in it. The typecheck and the lint are green at every phase, since the new test file reaches the exports that do not exist yet through a cast; `bun run check` whole is green from phase 4 on, and not before, because the new file's tests are red until then.

0. Before any change: `crew tdd before` for AC-10 with the second command of Verify, on the untouched tree. Record in the item's `probes/expect-counts-before.txt` the count of `test(` and of `expect(` in each of the eight files, and in `probes/evidence-keys-before.txt` the top-level keys of the `evidence.json` a gate run saves, printed by a script of the probes, `probes/evidence-keys.ts`, that makes a scratch repository as the standing gate tests do, calls `runGates` and prints the sorted keys of the saved file (the list AC-15's case holds).
1. Tests first: the new file, with repositories made by the tests' kit and profiles edited in memory as `packages/engine/tests/gates.test.ts` does (its test "0.3.0: lint and typecheck judge the files the item changed" is the model for AC-11). The file reaches the exports that do not exist yet through namespace imports (`import * as gates from "../src/gates.ts"`, `import * as run from "../src/run.ts"`) cast `as unknown as` a type of the file that names the new members, so it typechecks and loads before the change and each case fails at its own assertion. Each criterion's cases sit in tests whose names open with its id (`AC-11: ...`), and its red and its green run with `bun test packages/engine/tests/gates-absent-tool.test.ts -t "AC-11"` and the like. Each red is recorded with `crew tdd red` on the assertion that names the behaviour: AC-11 `expected "unavailable", received "pass"`; AC-14 `received "fail"`; AC-15 `auditsLeftOut` is not a function, the first assertion of its case; AC-9 a plan with no `deps`; AC-13 the sentence not found. Held to: the new file runs and fails.
2. `gaveNoResult`, `tdd.ts`, the constants and the check in `runOneGate`. Held to: AC-11 and AC-14 green in the new file.
3. `planOf`, `auditsLeftOut`, `planNotesFor`, the policy's condition, `planNotes`, the printed line and the report's. Held to: AC-15 and AC-9 green.
4. `gate.md` and the two ADRs' notes. Held to: the new file green whole, and `bun run check`.
5. `bun run build`; `crew tdd after` for AC-10 on the built bundle with the same command, and the same counts taken again, compared file by file; the mutants; `bun run plugin:check`; the gates. The mutants are a script in the item's `probes/`, `mutants.py`, that for each mutant replaces one exact piece of a source file's text by another, runs the tests and puts the file back (a mutant that moves the check is one replacement of the block that holds it); it runs the new file and `tdd.test.ts`, each change to be red: each of the three values of `gaveNoResult` dropped, its `timedOut` half dropped, the check in `runOneGate` moved after `judgeProblems` and after `judgeAudit`, each constant given to another exit code, the status left `fail`, the policy's condition dropped and inverted, `leftOut` left empty, the stack dropped from an entry and from a line, `planNotes` left out of the outcome, of the CLI's text, of its data and of the report.

## Test cases

- AC-11:
  - lint command `./tools/lint.js`, a committed file with mode 644, the item changes `src/a.ts`: status unavailable, reason equal to `NOT_EXECUTABLE_REASON`, exit 126, no `problems`. The test first asserts the precondition that makes it a real case: `namedFiles(run.tail, [root, root], root)` of `packages/engine/src/problems.ts`, the arguments `judgeProblems` gives it for a target at the root, returns `["tools/lint.js"]`.
  - lint command `echo "src/b.ts:1:1 error"; no-such-linter-of-the-test`, `src/b.ts` committed and unchanged: unavailable, reason equal to `NOT_FOUND_REASON`, exit 127, no `problems`.
  - typecheck with each of the two forms: the same.
  - lint command `echo "src/b.ts:1:1 error"; exit 1`: pass, pre-existing, as today. Lint command `echo "src/a.ts:1:1 error"; exit 1`, `src/a.ts` being the changed file: fail with the standing reason.
  - the three constants are the spec's three sentences, letter for letter.
- AC-14:
  - test command `no-such-runner-of-the-test`, build command `no-such-builder-of-the-test`: each unavailable with `NOT_FOUND_REASON`; `computeVerdict`'s reasons hold `gate test unavailable: ` followed by the constant, and the same for build.
  - test command `kill -9 $$`: unavailable, exit null, reason equal to `NO_EXIT_REASON`.
  - test command `echo "token=abc123-of-the-test"; no-such-runner-of-the-test`: the reason is `NOT_FOUND_REASON` and does not contain `abc123-of-the-test`; the run's tail does.
  - the audit, through `runOneGate` given an `env` whose PATH holds a fake `npm` that prints a readable audit report with one advisory and exits 127 (the fake at `packages/engine/tests/gates.test.ts:411-418` is the model, with `exit 127` as its last line), in a target with a lockfile, the work's base commit holding no lockfile so that the advisory is new: status unavailable, reason `NOT_FOUND_REASON`, `advisories` undefined. Before the change the run is `fail` with `advisories` set.
  - `runTaskGate` with the test command `no-such-runner-of-the-test`: status fail, its test run unavailable with the reason.
  - `runAudit` on a repository whose test command is `no-such-runner-of-the-test`: the `test` row of `audit/runs.json` is `unavailable` with the reason, and `auditRunLine` of it is `test (.): unavailable (` followed by the constant and `)`.
  - `gaveNoResult`: a table of `{ exit, timedOut }`: 126, 127 and null with `timedOut` false are true; 0, 1 and 2 with `timedOut` false are false; `{ exit: 127, timedOut: true }` and `{ exit: null, timedOut: true }` are false.
- AC-15: a repository with `package.json` and no lockfile, the item changes `package.json`, route standard.
  - `auditsLeftOut` is `[{ target: ".", reason: "no lockfile" }]` (the case's first assertion); `plannedGates` holds no deps.
  - `runGates`' `planNotes` is exactly `["deps (.) not planned: no lockfile; no audit ran for this change, and on the standard route the verdict does not wait for it (the policy's requiredGates can require it)"]`, and the same with `only: ["test"]`.
  - the CLI's `gate run` text holds that line and its data `planNotes` equals the list; the `report.md` the CLI writes holds the line after the last row of its Gates table; `renderReport` with no `planNotes` holds no `not planned`.
  - the top-level keys of the saved `evidence.json` equal the list recorded at phase 0, and the file does not contain `not planned`; the verdict's reasons do not name deps.
  - two targets at one path (`composer.json` beside `package.json`), both manifests changed, neither lockfile: two entries, each with its stack, and the two lines `deps (., node) not planned: no lockfile; ...` and `deps (., php) not planned: no lockfile; ...`, whole, asserted as a set whatever their order.
  - with a lockfile and a fake manager binary (an executable file that only exits 0, never run by the case) on `process.env.PATH`, set and put back as `gates.test.ts:883-889` does: `auditsLeftOut` is empty and `plannedGates` holds deps; the case calls no `runGates`. With `src/a.ts` changed alone: empty. Routes fast and full: empty, and the plan holds deps.
- AC-9: the same repository, the policy's `requiredGates` with `deps`: the plan holds deps; its run is unavailable, "no lockfile"; `auditsLeftOut` and `planNotes` are empty; the verdict's reasons hold `gate deps unavailable: no lockfile`. With `src/a.ts` changed alone: the plan holds deps. `runTaskGate` there: status fail, its deps run unavailable.
- AC-13: `gate.md` holds the two sentences of Files, whole, each in its paragraph. Each ADR's last paragraph equals the note of Files; each ADR's text from `## Decision` to the next heading equals what it was, compared with the text written in the test, under a comment that says a later change to either Decision changes this test with it.

## Verify

- `bun test packages/engine/tests/gates-absent-tool.test.ts`
- `bun test packages/engine/tests/gates.test.ts packages/engine/tests/evidence.test.ts packages/engine/tests/detect-go-rust.test.ts packages/engine/tests/tdd.test.ts packages/engine/tests/tasks.test.ts packages/engine/tests/audit-run.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/skill.test.ts`
- `bun run check`, `bun run build`, `bun run plugin:check`

---

Published by `crew learn` from item `2026-11-24-003-the-teams-build-fifteenth-part-the-users`, reviewed before the code (ADR 0019).
