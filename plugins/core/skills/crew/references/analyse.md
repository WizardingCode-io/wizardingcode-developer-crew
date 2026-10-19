# Analyse

An issue only (a `fix`, or an answered `kind: issue`), on every route, right after Recognize. Goal: know where the defect came from before deciding how to fix it, so that a fix never creates (rule 11).

## 1. The origin, from the records

`crew analyse <id> --paths <the files the defect touches>` writes `analysis/origin.json`: the commits that touched those lines, the items whose records they carry, their roles, tasks, decisions and mail (SP3 Task 5). Until the command exists, read `git log` and `git blame` on the paths yourself and write the file by hand, `{ "paths": [], "items": [] }` at the least: the engine asks for it in a git repository.

## 2. The document

Write `.crew/work/<id>/analysis.md` with three sections, "none" where there is nothing:

- `## Origin`: which item, which agent or task, under which decisions the lines were written (from `origin.json`); "outside the records" when the code predates the crew.
- `## Cause`: what is wrong and why, in a paragraph a reviewer can check against the code.
- `## Blast radius`: what else reads the same code or data, and what the fix must not break.

One screen on the fast route. Then `crew phase <id> next`: the engine reads the three headings and the origin file.

## 3. The criteria of a fix

Before build an issue needs both: the regression test as a behaviour criterion (`crew criteria <id> add "<the behaviour the defect broke>"`, red first) and what works kept as a preserve criterion (`crew criteria <id> add "<what stays green>" --kind preserve`, proven with `tdd before` and `tdd after`). The engine refuses build without them, and the root cause goes to the knowledge base at Learn (SP4).
