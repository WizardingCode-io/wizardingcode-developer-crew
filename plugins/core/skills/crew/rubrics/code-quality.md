# Code quality rubric

The code-quality gate asks whether the change is as simple as the problem allows and will be as easy to change as the code around it: SOLID and KISS as questions, answered on the diff. The reviewer answers; the judge rules.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`) and the item's criteria. Where the profile has a linter or an analyser, its run on the item's files is already in the gate run: the reviewer does not repeat it, and a problem it reported in a touched file is an input, not a new finding.

## Questions

1. One reason to change: does each unit the diff adds or changes (function, class, module) do one job? A unit that now does two is answered by naming the second job.
2. Duplication the diff introduces: is the same logic written twice in the diff, or copied from something already in the touched files, where one call would do?
3. Names: does each new or renamed name say what the thing does? A flag whose name is not its meaning, a function named after its caller rather than its effect, fails.
4. Dead paths: a branch no caller reaches, a parameter nobody passes, code left commented out, a flag that is always one value.
5. The simplest thing: an abstraction with one implementation, a configuration knob nobody asked for, a layer that only forwards, a generic with one case.
6. The module's own conventions: error handling, naming, file shape and dependency direction as the touched files already have them. New code that disagrees with its neighbours fails this question even when it would be good elsewhere.
7. A dependency the criteria did not ask for: a runtime or development dependency a manifest gains that no criterion needs, where the standard library or a dependency already present would do.
8. Unused exports and debug leftovers: an export nothing imports, a `console.log`, `print(`, `debugger`, `var_dump` or `dd(` the diff adds outside a test or a logger.
9. A fallback, a workaround or a shim the criteria did not ask for: a second path that hides why the first failed, a guard for a case the code cannot reach, an environment shim for a problem the change did not trace to its cause.
10. A comment that narrates the change ("now uses", "updated to", "as requested", "changed from") or restates the code it sits on, instead of saying why.
11. The prose the change writes or rewrites (a document, a comment, the commit message), read against `references/writing.md`: a fact, a hedge or a scope limit of the old text dropped or altered by the rewrite ("not measured" become "not tested"), a claim with no source removed instead of marking it `[source?]`, a source invented, or a tell of generated text.

The gate run writes two inputs for questions 7 and 9 into `review/inputs.json`: `dependencies` (the names each changed `package.json` or `composer.json` adds per section since the base) and `phrases` (the action-shaped fallback phrases of the added lines). The `dependencies` and `phrases` of `inputs.json` are inputs, never a finding on their own: a name or a phrase there is read in its context, and a finding still names a line of the diff and a question.

## Defect or advisory

A **defect**: question 1 fails so that the unit cannot change for one reason without touching the other; question 2 with logic (not a line of boilerplate) duplicated; question 4, any dead path; question 3 when the name says the opposite of what the code does; question 6 when the disagreement is in behaviour (errors swallowed where the neighbours throw); question 7, a dependency no criterion needs; question 8, a debug leftover; question 9, a fallback or a workaround that hides a cause; question 11, a rewrite that drops or alters a fact, a hedge or a scope limit, removes an unsourced claim, or invents a source. An **advisory**: a long function that is still one job; a name that could be sharper; duplicated boilerplate; an abstraction the next item will plausibly need; a style difference a formatter would not catch; an unused export (question 8); a tell of generated text in the change's prose (question 11).

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt, listed under "Outside the change". A touched file's old code is read for context and for question 6; it is not reviewed. A problem in a line the diff did not write is debt even when the diff sits next to it.

Provenance (ADR 0017): question 11 is the writing standard's fact-preservation rule, which department-of-prose (CyranoB, MIT, commit `60ef0cc`) supplied; questions 7 to 10 distil ai-slop-cleaner of oh-my-claudecode (MIT, Yeachan Heo, skill commit 8690a21, read on 2026-10-29) in the crew's words; the fallback phrases distil the same repository's `pre-tool-enforcer.mjs` warning.
