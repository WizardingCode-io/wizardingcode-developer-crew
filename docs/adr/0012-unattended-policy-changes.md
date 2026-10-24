# ADR 0012: where nobody watches, the policy decides whether the validator may lower a cap

Date: 2026-10-24. Status: accepted. Work item: `2026-10-24-007` (finding 122). Amends ADR 0005.

## Context

ADR 0005 made the policy a person's: `crew policy set` and `crew policy accept` are asked even under `relay` and take no `--mode`, "so the policy changes only when a person clicks". Finding 122 (2026-10-21) kept that where nobody watches: the PreToolUse hook denies every policy command in a headless, `bypassPermissions` or `dontAsk` session. On 2026-10-24 the user asked for the crew to run unattended without stopping for a person, with the danger held back: "depende da política... quero que isto também trabalhe de forma autónoma sem validação do user... temos que acautelar isso".

The three leads of the item (QA, security, architects) returned the first design, a blocklist of guarded keys, for the same reason: every key not listed, and every key added to the table later, would be open to the validator unseen, among them `verify.send` (code sent out of the repository) and the caps of the review rounds.

## Decision

- `policy.json` gains `unattendedPolicyChanges`, `never` (the default; a missing or unknown value reads as `never`) or `validator`. Only a person sets it.
- Under `validator`, where nobody watches, the validator may take one policy change: lowering one of eight caps, `team.maxJudgementRounds`, `team.maxValidationRounds`, `team.maxGateRounds`, `mail.maxConcurrent`, `mail.maxHops`, `mail.maxTurns`, `mail.maxMinutes`, `mail.maxParties`. A lower cap only makes the crew stop sooner and wait for a person; it passes nothing.
- The one form is `crew policy set <cap> <value> --mode <mode> --validator policy-change`, in a mode that shows no prompt (`dontAsk`, `bypassPermissions`). One function, `unattendedPolicyChange` in `policy.ts`, decides for the hook and the command, so they cannot drift.
- The register entry is written before the file: a decision on `policy`, by "the validator (rule: policy-change), in <mode> mode", naming the key, the old and the new value, so a person restores it with one command. A refusal writes neither. The entry is no work item's approval.
- The hook's branch fails closed: a policy file changed outside the engine, a change the function refuses, a line that is not the one plain form, or a mode that is not the session's is denied, naming why. The hooks' fail-open convention covers blocks a bug would cause, never grants.
- Everything else stays a person's under every policy: raising any cap, who decides (`attendedDecisions`, `unattendedDecisions`, `unattendedPolicyChanges`), the risk route's loosening (`riskPathExclusions`), the grant past the caps (`team.continuations`), writing sessions and identity (`mail.open`, `mail.workspace`, `mail.name`, `mail.worktrees`), what leaves the machine and how strict verification is (`verify.*`), the team (`team.template`, `team.maxExperts`), `crew policy accept` and `crew accept policy`.

ADR 0005's line "the policy changes only when a person clicks" now reads: unless the policy itself, set by a person, lets the validator lower a cap where nobody watches.

## Alternatives rejected

- A blocklist of guarded keys: a key added later would be open unseen (the three leads' returns).
- The validator for every key: it could hand itself power over who decides and what is reviewed.
- Raising caps: the same power as `team.continuations: granted`, which stays a person's.
- `--mode` alone implying the rule: the record names its rule, as `stated-default` and `complete-gap-round` do.

## Consequences

- An unattended run can make itself more conservative without a person; it can never make itself less so. A lowered cap is a stall, never a pass: past a round cap the item waits for `crew continue` by a person, past a mail cap the opened session is stopped; a run that lowers a cap to its range minimum stalls itself sooner, each step on the register with its old value.
- The command cannot see whether a person watches: `--mode` is the caller's word, as for every user-only command, and the PreToolUse hook is what checks the session (ADR 0005's dependence, unchanged). A caller that reaches the command without the hook (a runtime with no hook) can lower one of the eight caps under a policy a person set to `validator`, and nothing more.
- A headless session in a mode that shows a prompt (`default`) never reaches the lowering: the command takes only `dontAsk` and `bypassPermissions`, and the hook requires the session's own mode. It fails closed.
- The register entry carries the rule and the mode as fields beside the readable `by`; a write that fails after its entry adds a second entry saying it was not written.
- A project that never sets the key behaves as before (`never`).
- Rollback: `crew policy set unattendedPolicyChanges never`, a person's command, or the revert of the item's commit.
