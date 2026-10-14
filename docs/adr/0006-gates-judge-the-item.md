# ADR 0006: The gates judge the item, not the repository's standing debt

- Status: accepted, 2026-10-14. Ships in 0.3.0 (the dependency gate now; lint and typecheck by changed files in the next item).
- Context: findings 20 and 23 of the real-use phase (`docs/real-use/findings.md`); ADR 0002, whose baseline this decision takes up.

## Context

A gate command runs over the whole repository. In a project with debt it fails for reasons outside the item: 163 pre-existing type errors in the storefront, 30 lint errors and 162 dependency advisories in the client application, advisories already on `main` in the e-commerce product, and today one **abandoned** package that made `composer audit` fail with "No security vulnerability advisories found" (finding 23). In every case the only way through was `crew skip`, which the user has now ruled out: gates are mandatory ("os gates são mandatórios sempre"), and the speed must come from judging the right thing, not from skipping.

ADR 0002 rejected a dependency baseline "for now", preferring to run the audit only when the item touches a manifest. That keeps the audit out of unrelated items, but when an item does touch the lockfile, the repository's whole history of advisories lands on it.

## Decision

**Dependencies.** The audit runs in its tool's JSON (`npm audit --json`, `pnpm audit --json`, `yarn audit --json`, `bun audit --json`, `composer audit --format=json --abandoned=report`, `pip-audit --format=json`) and the engine reads the advisories out of it (`packages/engine/src/audit.ts`). The same audit is run on the item's **base commit**: the manifest and the lockfile at `work.baseCommit` are written to a scratch folder under `.crew/local/audit-base/` and audited there. The gate fails only on advisories absent from the base. The run records how many advisories were found, how many were already there, and which are new; the report's Gates table says it ("pass: 162 known before, none new"; "fail: 1 new (GHSA-…), 162 known before"). An abandoned package is reported in the log and never fails the gate. When the tool's report cannot be read, the gate is judged by its exit code as before and the record says so; when the base cannot be audited, every advisory counts and the record says so.

**Lint and typecheck** (next item, same decision). When the tool names the files it complains about, problems in files the item did not touch are the repository's debt: reported, not failing. Problems in touched files fail the gate. A tool that names no files is judged as today.

What does not change: the test gate runs the team's own flow in full; nothing is skipped; the known debt is named on every report so it never disappears from view.

## Alternatives rejected

- **Keep skipping with a reason.** The user ruled it out; and a skipped gate proves nothing, while a baselined gate proves the item introduced nothing.
- **A baseline recorded once per repository** (a file of known advisories). It drifts, someone must maintain it, and it can hide an advisory that was fixed and came back. The base commit is always exact and costs one audit.
- **Fail on any advisory above a severity.** Severity is the tool's threshold already (`--audit-level=high`); the question here is whose advisory it is, not how bad.
- **Audit at `crew start` for every item.** Network time on items that never touch a dependency; the lazy baseline at the first deps run costs the same only when needed.

## Consequences

- ADR 0002 is amended: the baseline it postponed exists, computed from the base commit at gate time.
- A pip-audit baseline needs an environment, not a lockfile: Python keeps today's behaviour (every advisory counts) until a Python project reaches real use.
- The first deps run of an item costs two audits (base and tree). Seconds.
- A report that says Proven can carry known advisories; it says how many, every time.
