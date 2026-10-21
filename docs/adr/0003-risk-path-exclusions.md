# ADR 0003: The team policy may exclude paths from the risk patterns

- Status: accepted, 2026-10-14. Shipped in 0.1.7.
- Context: findings 1 and 14 of the real-use phase (`docs/real-use/findings.md`).

## Context

The engine raises the route to full when the change touches a risk path: a default list of globs per risk area (`DEFAULT_RISK_PATHS` in `packages/engine/src/classify.ts`), which the team policy can extend. The SP1 design says the policy can only tighten (`docs/specs/2026-10-06-sp1-engine-and-base-method-design.md`, section 15): it adds required gates and risk paths, raises the minimum route, narrows what may be skipped.

Real use showed the defaults firing where nothing is at risk. In this repository `**/session*` matched `plugins/core/hooks/session-start.ts`, a hook named after a Claude Code event, and raised a watch-list fix to the full route, where it then could not pass the gate guard for want of a plan and an approval (finding 1; the item sits proven in its build phase to this day). In a Laravel application `auth`, `session` and `migrations` are everywhere: nine of thirteen items went full, and a merge chore went full for migrations it carried from `main` and did not write (finding 14). The user did not agree with those routes, and the policy gave them no way to say so.

## Decision

`policy.json` gains `riskPathExclusions`, a list of globs. A changed path that matches one of them is not matched against any risk-area pattern, default or added. It is the one way a policy loosens a default.

Two things keep the loosening honest:

- The policy is hand-written and a person accepts it (`crew policy accept`, a user-only command), so an exclusion is the user's decision in a protected file, not the agent's.
- When an exclusion kept a changed path from raising the route, the work's route reasons say so once, naming the paths (`risk paths excluded by the team policy: …`), and the report shows that line with the route.

The typed answers are untouched: an exclusion applies to paths, never to what the agent estimated about the request.

## Alternatives rejected

- **Tune the defaults now.** The defaults are tuned in SP3 by replay over recorded cases; changing them on two findings would trade one false positive for another.
- **Narrow the default patterns to the stack** (Laravel's `app/Http/Middleware/Authenticate*` and so on). Still a guess per stack, and it does not cover a repository's own naming, as the hook file here shows.
- **Let the agent ignore a raise with a reason.** That is the agent loosening the policy, which is what the policy exists to prevent.

## Consequences

- Section 15 of the SP1 design is amended: the policy can only tighten, with this one exception.
- A team that excludes too much loses the full route where it matters; the line in the report is what makes that visible in review.
- SP3's replay has, in the exclusions teams write, a record of where the defaults were wrong.
- 2026-10-21 (finding 120): the exclusion is also written by `crew policy set riskPathExclusions "<glob>"`, one glob per command, and `--remove` takes one out. It is a user-only command the PreToolUse hook asks even under `relay` (ADR 0005), each add and removal is appended to the decision register as the user's before the file is written, a glob with no literal character (`**`, `*`) is refused so one command cannot turn the risk route off for the whole project, and the file stays as protected as before: a hand edit still needs `crew policy accept`.
