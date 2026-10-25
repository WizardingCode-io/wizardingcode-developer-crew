# 0014. A red is traced to its origin and resolved, never skipped or passed

- Status: accepted, 2026-10-25 (finding 164, item `2026-10-25-004`).

## Context

The method proves a criterion by a test seen failing before the code and passing after. Since 0.3.0 (finding 20) a test-first step could be skipped with the user's word (`crew skip <id> tdd:AC-n --reason`), the default policy listed `tdd` among `allowSkips`, the skill told the agent to "let the user decide" when a criterion could not be tested automatically, and the Stop hook's block reason offered the skip as a way out. The `observed` kind (SP3) later gave the honest path for a criterion that can have no red run, and `preserve` for what stays green, but the skip stayed as a path beside them.

On 2026-10-25 the session proposed that skip for a guard test over a state already correct. The user refused it, for this repository and every project the crew runs in: a red is there to see the origin and resolve it, not to pass or skip. The origin in that case was the design: the check lived only in the test, so nothing could fail; moved into code, the test had its red (the module's absence) and its green.

## Decision

1. A red that cannot happen, or a red that happens, is a question answered before the code: where the check lives (a check that cannot fail is made real in code the test drives) or what the criterion's kind is (`observed` when no red run can exist, `preserve` for what stays green). The agent never proposes a skip of a test-first step.
2. The default policy's `allowSkips` is `["e2e"]`. The e2e gate stays the one exception by default (SP7b decision 9). A team that wants the old behaviour writes `tdd` (or `*`) into its `policy.json`'s `allowSkips` by hand: the rule is a default, not a prohibition, and the decision is a person's, never the agent's (`crew policy set` does not set that key, ADR 0012).
3. The engine's refusal of a `tdd:` skip names the three ways out (the `observed` kind, the check made real in code, the policy); the Stop hook's reason says to fix what fails and that a red is traced to its origin, never skipped; the skill's rule 4 and `references/build.md` say the same.

## Consequences

- A project whose `policy.json` lists no `allowSkips` loses the tdd skip at the upgrade; the refusal says how to proceed, and the release note says so.
- The engine's own tests that used the skip as a shortcut list `tdd` in their team policy; a test that needs no red run uses the `observed` kind.
- The report's skipped section does not change: a skip a person allowed still appears there.
