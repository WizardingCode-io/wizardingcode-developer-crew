# ADR 0002 — The dependency audit runs when the change touches a dependency

Date: 2026-10-14 · Status: accepted. Amended the same day by [ADR 0006](0006-gates-judge-the-item.md) (0.3.0): the baseline this decision postponed exists; the audit is judged against the item's base commit, so only advisories the item introduced fail the gate, and the known ones are counted on every report.

## Context

The SP1 design (`docs/specs/2026-10-06-sp1-engine-and-base-method-design.md`, section 12) planned the dependency audit on every item of the standard and full routes, and only on manifest changes on the fast route. In two days of real use on a client's Laravel project (`docs/real-use/findings.md`, finding 10), `bun audit` reported 18 advisories in packages no item touched; the lockfile did not change in any of the thirteen items. The user skipped the gate on twelve items, each with a paragraph of justification, and two items were left Not proven because of it. On the full route the skip is user-only, so in auto mode it also cost a `--mode auto` record each time.

An audit of dependencies the item did not change audits the owner's standing debt, not the change. The gates look at the change (section 12); this gate did not.

## Decision

On every route the dependency audit is planned when the change, measured from the item's base commit, touches a manifest or a lockfile (`manifestChanged` in `packages/engine/src/gates.ts`), or when the team's `policy.json` lists `deps` in `requiredGates`. The standard route still drops it when no tool can run; the full route still records it unavailable and the user must skip it.

## Consequences

- An item that changes no dependency has no `deps` row in its report. The report says what ran; nothing is implied about the debt.
- The moment the lockfile changes is the moment the audit fails on standing advisories as well as new ones. That is the right moment to look at the debt, and the user's skip then says so once.
- A team that wants the audit on every item says so in `policy.json`, as for any gate.
- Rejected: a baseline of the advisories present at the base commit (it needs the audit tool to run against a checkout of the base, per tool), and an accepted list of advisory ids in `policy.json` (it needs a parser per tool's output). Both can come later without undoing this rule.

Note of 2026-10-29 (item `2026-10-29-001`, the user's decision D-2): the gates every route plans gained a second built-in gate beside the secret scan. `prose` runs on every item and every route right after `secrets`, over the change's added lines, and fails on the artefacts a chat model leaves in shipped text (`references/gate.md`); like `secrets` it needs no command and is planned out of an audit, since it judges a change, not a repository.
