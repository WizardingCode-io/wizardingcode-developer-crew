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
