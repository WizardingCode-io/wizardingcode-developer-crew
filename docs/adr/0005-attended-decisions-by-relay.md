# ADR 0005: With a person present, the team policy may let the agent relay the user's yes

- Status: accepted, 2026-10-14. Shipped in 0.2.0 as an opt-in; **amended the same day: `relay` is the default since 0.3.0**, `prompt` the opt-in, by the user's decision ("if there are decisions, show them in detail with the why, the facts and the evidence, and I say approved"). In the same release the approval of a spec with nothing pending is taken under the validator's `complete-gap-round` rule with a person present, so a full-route item asks the user nothing unless the gap round found a decision; and gates are mandatory (`allowSkips` defaults to `tdd`).
- Context: findings 3, 17, 19 and 22 of the real-use phase (`docs/real-use/findings.md`); the hybrid validator requirement (`docs/real-use/README.md`).

## Context

A user-only decision (`crew approve`, `crew skip`, `crew decide`, `crew objection … waive`, `crew accept`, `crew profile confirm`) is signed by the permission prompt the command raises: the PreToolUse hook answers "ask" with a person present, in auto mode too since 0.1.6, and the record says "by the user". With no person watching (`bypassPermissions`, `dontAsk`, a headless run) the agent adds `--mode` and the record says the agent decided; the policy's `unattendedDecisions` says what that is worth (ADR 0004's successor spec adds the validator).

The user's position, stated three times between 2026-10-13 and 2026-10-14 in three projects, is that a yes in the conversation is enough: "isto do crew corre tudo tu, eu não vou estar aqui sempre a parar por isto"; "se eu digo aprovo chega". In the storefront they wrote a `count` policy to avoid the prompt, which 0.1.6 then made impossible (`--mode auto` is refused where a person is present). Two prompts per decision (the agent's question in the conversation, then the permission prompt for the same thing) is the friction they object to; and the prompt is what the agent in finding 22 routed around by asking the user to type the command.

The prompt exists because of finding 3: a record that said "approved by the user" when the agent had approved on its own. The engine cannot see the conversation, so without the prompt "by the user" is the agent's claim.

## Decision

`policy.json` gains `attendedDecisions`, with two values:

- `prompt`, the default: today's behaviour. The hook asks; the prompt is the signature; the record says "by the user".
- `relay`: with a person present, the hook lets a bare user-only command run with no prompt. The command records the decision as the user's with `relayed: true`, and every place the record is shown says **"by the user, relayed by the agent"**: the command's output, the report's Decisions and Objections sections, the verdict line. The decision counts as a person's.

Three things keep the relay honest:

- The record states the chain. A reader of the report knows that "relayed by the agent" is the agent reporting the user's yes, and can check the conversation; it never reads as a prompt the user answered.
- The policy that governs signatures is itself signed by a prompt. `crew policy set` and `crew policy accept` are asked even under `relay`, so the policy changes only when a person clicks. Switching a repository to `relay` is one prompt, once. Amended by ADR 0012 on 2026-10-24: `crew policy accept` still takes no `--mode`; `crew policy set` takes `--mode` and `--validator policy-change` in one case alone, where nobody watches and a policy a person set to `unattendedPolicyChanges: validator` lets the validator lower one of eight caps, and nothing else.
- Nothing changes where no person is present. `bypassPermissions`, `dontAsk` and headless runs keep the `--mode` path, `unattendedDecisions` and the validator. `--mode` stays refused with a person present.

`crew policy set <key> <value>` is added so that the user never edits the file by hand: it writes `attendedDecisions` and `unattendedDecisions` through the engine, keeps the other fields, and leaves the file trusted.

## Alternatives rejected

- **Keep the prompt and improve the skill's timing** (present what is being approved and run the command in the same turn, so the prompt is the question). Worth doing under `prompt`, and the skill says so, but it still stops the user once per decision, which is what they object to.
- **Count the agent's own decision under `unattendedDecisions: count` with a person present.** That records "by the agent" for a decision the user did take in the conversation, which understates the record, and it conflates two situations: the agent deciding alone, and the agent relaying a person.
- **A hook-to-command channel that marks whether a prompt was shown** (`updatedInput`). It would let the record distinguish a clicked prompt from a relay without a policy, at the price of the hook rewriting the agent's command; the policy is simpler and the user's choice is explicit.
- **Relay everywhere by default.** The default must stay the verifiable signature; a team that wants the relay says so in a protected file.

## Consequences

- Section 15 of the SP1 design is amended: `attendedDecisions` joins the policy; the hook's user-only rule reads it.
- A report from a `relay` repository can say Proven on the agent's word that the user said yes. That is the user's choice, visible in the policy and on every line of the record.
- The rule that the agent runs every crew command (finding 19, the skill's rule 4) is unchanged; `relay` removes the agent's last reason to ask the user to type one.
