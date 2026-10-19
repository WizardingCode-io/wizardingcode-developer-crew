# Analyse

An issue only (a `fix`, or an answered `kind: issue`), on every route, right after Recognize. Goal: know where the defect came from before deciding how to fix it, so that a fix never creates (rule 11).

## 1. The origin, from the records

`crew analyse <id> --paths <the files the defect touches, comma-separated>` writes `analysis/origin.json` (engine-owned) and prints its size: `analysis/origin.json: 3 commits, 1 item (2026-10-18-004-…: roles review-code-quality, judge; tasks T-1)`. For each path: the newest twenty commits that touched it (`sha`, `at`, `author`), the lines `git blame` still attributes to each at HEAD (`lines`, 0 for a commit a rewrite replaced) and the items whose artifacts the commit carried (`items`, the `.crew/work/<id>/` folders it touched); then each item summarised from the records at HEAD (`title`, `kind`, `roles`, `tasks`, `decisions`, `mail`), or its id alone when the folder is gone. A path must be a tracked file (not a folder, not a pattern); an unknown one is refused and nothing is written. Outside git the file is empty with `note: "no git repository"`, the command says so, and the guard asks for the document alone. `crew status` prints `analysis: <size>` while the item is in this phase; the report's `## Analysis` section lists the paths and the items. An origin older than twenty commits, or code committed before the crew (`items: []`), is read by hand from `git log` and said in the document as outside the records.

## 2. The document

Write `.crew/work/<id>/analysis.md` with three sections, "none" where there is nothing:

- `## Origin`: which item, which agent or task, under which decisions the lines were written (from `origin.json`); "outside the records" when the code predates the crew.
- `## Cause`: what is wrong and why, in a paragraph a reviewer can check against the code.
- `## Blast radius`: what else reads the same code or data, and what the fix must not break.

One screen on the fast route. Then `crew phase <id> next`: the engine reads the three headings and the origin file.

## 3. The criteria of a fix

Before build an issue needs both: the regression test as a behaviour criterion (`crew criteria <id> add "<the behaviour the defect broke>"`, red first) and what works kept as a preserve criterion (`crew criteria <id> add "<what stays green>" --kind preserve`, proven with `tdd before` and `tdd after`). The engine refuses build without them, and the root cause goes to the knowledge base at Learn (SP4).
