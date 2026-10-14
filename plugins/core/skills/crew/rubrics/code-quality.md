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

## Defect or advisory

A **defect**: question 1 fails so that the unit cannot change for one reason without touching the other; question 2 with logic (not a line of boilerplate) duplicated; question 4, any dead path; question 3 when the name says the opposite of what the code does; question 6 when the disagreement is in behaviour (errors swallowed where the neighbours throw). An **advisory**: a long function that is still one job; a name that could be sharper; duplicated boilerplate; an abstraction the next item will plausibly need; a style difference a formatter would not catch.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt, listed under "Outside the change". A touched file's old code is read for context and for question 6; it is not reviewed. A problem in a line the diff did not write is debt even when the diff sits next to it.
