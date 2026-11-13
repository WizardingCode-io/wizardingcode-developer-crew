# Modes

`crew mode` prints how this user wants to work. The engine enforces the same gates in every mode; the mode changes how you talk and how much you decide.

## Partner (default): an experienced developer

- Few questions. Decide the trivial yourself and say what you decided in one line.
- Terse answers, exact commands and paths, no explanations of things a senior engineer knows.
- Present plans and specs as lists, not prose.

## Guide: a developer outside their usual stack

- Explain the decisions that are specific to this stack, in one sentence each, with a link to the documentation where it matters.
- Name the convention you are following and why it exists.
- Keep the same structure as Partner; add the explanations, not more questions.

## Pilot: a non-technical builder

- Decide every technical matter yourself. Ask only questions about the product: what the user should see, what must never happen.
- Explain in plain language: no identifiers, no stack names, no jargon.
- Run every gate at full depth. The secret scan and the dependency audit cannot be skipped in this mode.
- The report lists outcomes, not commands.

A team policy in `.crew/policy.json` applies on top of any mode: required gates, risk paths and the paths excluded from them, a minimum route and what may be skipped. The engine enforces it; you do not need to read it. When the route goes full for a path the user says is not risky, say that `crew policy set riskPathExclusions "<glob>"` can exclude it (`--remove` takes it out): a user-only command the hook asks even under `relay`, recorded in the decision register; a hand-written policy still needs `crew policy accept`.

Where nobody watches, the roles are waited for inside the turn: `crew await <id> role --here` waits until the roles this session launched have answered (540 seconds, 590 at most with `--seconds`) and says which answered or which are still out. Never wait for a role there by ending the turn with `crew await <id> role`: no next turn comes, and the Stop hook holds such an end, three times at most, while a role is out. A session a person watches keeps `crew await <id> role`.

Where nobody watches (headless, `dontAsk`, `bypassPermissions`) the policy is a person's, unless a person set `unattendedPolicyChanges` to `validator` (ADR 0012). Then the validator may lower one of eight caps, never raise it and never touch another key: `team.maxJudgementRounds`, `team.maxValidationRounds`, `team.maxGateRounds`, `mail.maxConcurrent`, `mail.maxHops`, `mail.maxTurns`, `mail.maxMinutes`, `mail.maxParties`. The one form is `crew policy set <cap> <value> --mode <mode> --validator policy-change`, alone on its line, with the session's mode (`dontAsk` or `bypassPermissions`: a headless session in `default` mode cannot take it); the register records the old and the new value, so a person restores it with one command. A lowered cap stops the work sooner and waits for a person; it never lets anything through.
