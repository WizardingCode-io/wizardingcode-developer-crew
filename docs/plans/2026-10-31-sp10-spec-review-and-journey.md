# SP10: The document reviewed before the code, and the journey. Plan

Design: `docs/specs/2026-10-31-sp10-spec-review-and-journey-design.md`. One crew item per task, one release at the close (0.18.0). Each task runs the method: a test seen failing first, every part validated as it is built, nothing given as done without proof.

## Task 1: the records

This design, ADR 0019, ADR 0020, this plan.

## Task 2: the agents, the rubrics and the ledger

- `plugins/core/agents/goldfish-*.md` (eight), each with You receive and You return, and a brainstorm mode where the source has one.
- `plugins/core/skills/crew/rubrics/spec-*.md` (five), with a provenance footer.
- `ROLE_NAMES`, `TEAMS`, the matcher in `hooks.json`, `answerFile`, and the counts of 15 that become 23.
- `docs/sources/ledger.json`: the source with its commit, one row per rule of the agents and the standards, the refused rows, the unread list.
- Confirm whether the runtimes' generators carry `omitClaudeMd`; where they do not, the report says so.

Proof: `agents.test.ts`, AC-16 of `skill.test.ts`, `bun run plugin:check`.

## Task 3: the phase in the engine

- `spec-review` in `PHASES_BY_ROUTE` and `PHASE_ORDER`, after plan on the full route.
- `crew spec-review <id> check|record|report|status`, the document's hash, the stages in order, `not run`, the settled list, clean rounds, the cap of 5, churn.
- The guard into build and `routeDocuments`.
- The hook refuses a resumed goldfish.
- Existing full-route fixtures and items that are already past plan keep working.

Proof: tests per criterion, including the guard refusing build after an edit to the spec.

## Task 4: draft, review, review-loop, resolve

The four skills, `references/specify.md`, `references/plan.md`, `references/conclave.md`, the method's table in `skills/crew/SKILL.md`, within the page's byte limit. The ledger's rows for them. The hybrid table of the design's §5.

## Task 5: brainstorm, drift, bootstrap, publication

The three skills and `goldfish-explorer`'s use. `crew learn` publishes to `docs/designs/<slug>.md`. The ledger's rows, the sentinels and the watermark among them.

## Task 6: the journey

`crew journey start|status|stop|report`, the launchd agent, one worktree and branch, resume after a killed session, decisions by the validator, the item left waiting, `--allow`, `--until`, the report and the notification. Reuses `open.ts` and the loop's backoff.

Proof: tests per criterion, then a real two-part mission in a sandbox with nobody present.

## Task 7: the evals and the measure

- The 30 scenarios as cases, and the isolation case.
- The planted-defects fixture on the base and on the item, three runs per arm, recorded in `docs/evals/`.
- A real full-route item through the five stages.

The result is written as it comes out, in the record and in what the user is told.

## Task 8: release 0.18.0

`bun scripts/release.ts --minor`, with the plugin updated, the README and `CLAUDE.md` in step, and the restart named to the user.
