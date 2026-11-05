# 0022. A standing e2e skip: one decision per project, counted only while the project cannot run the gate

- Status: accepted (the user, 2026-11-04 and 2026-11-05). Adds a third exception to "a policy can only tighten".
- Date: 2026-11-05

## Context

A project with no end-to-end suite stopped on every item that touched an interface or a public-api path: the e2e gate could not run, and the person was asked to skip it, item by item (finding 223). Fourteen of the twenty registered projects on the user's machine have no e2e command. `allowSkips` lists e2e by default, but it only permits a skip; the skip itself lived on one item. The user asked for one decision per project and one command that writes it into every project (D-1 to D-3), and for the ui-ux texts that sent a session to the person for a skip to send it to the captures instead (finding 224).

## Decision

1. **`policy.json` gains `standingE2eSkip`**, `{ reason, at, by: "user" }`: the person's decision, taken once, that the e2e gate is skipped on every item while the project is eligible: `allowSkips` lists e2e, `requiredGates` does not, and the profile has no e2e command. The key names e2e alone; no other gate takes one.
2. **It is a policy command.** `crew policy set standingE2eSkip --reason "<why>" | --remove` is asked by a permission prompt even under relay, and the register entry is written before the file.
3. **The run carries it, the verdict checks it.** The gate run records the e2e run skipped with the person's reason and a `standing` field holding the decision's date; nothing is copied onto the item. The verdict counts that run only while the project is still eligible and the decision held; otherwise the item is unproven, and the next gate run runs the gate and says why.
4. **A skipped run with no decision on record is never read as passing**, for any gate.
5. **`crew projects standingE2eSkip --reason "<why>" | --remove [--dry-run]`** writes or removes the decision in every registered project from one yes, leaving out, with its reason, every project where the per-project command would not write or whose root cannot be trusted (a scratch checkout, a folder outside git, a symbolic link, no profile, a file changed outside the engine).
6. **No text sends a session to the person for a skip of ui-ux.** With no captures, `crew judgement <id> record ui-ux --not-run` prints the session-driven capture path on a line of its own, and the refusal of `crew skip <id> gate:ui-ux` names it in place of an edit of the policy; the not-run reason given and the existing lines stay as they were.

## Consequences

- A policy can now loosen in three ways: `riskPathExclusions` (ADR 0003), `team.continuations: granted` (SP7b decision 15), and `standingE2eSkip`. Each is the person's decision, on record. Section 15 of the SP1 design (`docs/specs/2026-10-06-sp1-engine-and-base-method-design.md`) is amended to say so, as ADR 0003 amended it.
- An item that was proven through an agent's skip that counted under `unattendedDecisions: count` before the policy moved to `wait` becomes unproven at its next verdict (decision 4).
- A project whose session has no browser and no Playwright still cannot rule the ui-ux gate; the crew's own browser capture is finding 224's next item.
- The runtime adapters' refresh, an engine version record per project and a release step that runs the bulk command are their own item (D-4, D-5).
