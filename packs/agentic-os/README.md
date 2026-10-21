# wizardingcode-pack-agentic-os

A team pack for the WizardingCode Developer Crew: data the crew engine serves, never code. It holds one team template, three checklists the gap round reads and one knowledge file the expert reads. It has no skill, no agent and no hook; the crew skill reads what the engine prints for it (`crew pack files`), and the engine refuses it whole when a check fails (ADR 0010 of the core repository).

Verified against: OWASP Top 10 for LLM Applications 2025; Claude Code and Anthropic documentation read on 2026-10-20.

## What it changes in a project

- **The seat.** With the template set in the project's policy, a changed file under one of the template's globs (`agents/**`, `skills/**`, `prompts/**`, `hooks/**`, `**/*.prompt.md`, `.claude/**`) seats the `agentic-os` team as the expert's knowledge seat on the standard and full routes, with the reason `pack wizardingcode-pack-agentic-os (<the glob matched>)`. Nothing changes on the fast route, and the pack proposes no gate command.
- **The expert's file.** A team pack has no detector rule, so no target is tagged by it; the expert reads `knowledge/agentic.md` when the policy's specialists name it. Set both lines together in `policy.json`:

```json
{ "team": { "template": "agentic-os", "specialists": ["wizardingcode-pack-agentic-os:agentic"] } }
```

- **The gap round.** `crew pack files checklists agent | tool | prompt` prints the checklist of that kind beside the core's.
- **What it never does.** The template adds globs and nothing else: no cap, no team removed, nothing seated always; the engine refuses a template that would (`crew pack add` says which field). A pack's gate command, where a pack has one, runs only once a person confirmed it (`crew profile confirm <gate>`); this pack has none.

## Install

From the WizardingCode marketplace, with the core plugin at 0.11.0 or later:

```sh
claude plugin install wizardingcode-pack-agentic-os@wizardingcode-plugins
```

The engine registers it at the next session start (`crew pack list` shows it). From a checkout of the core repository, in any runtime:

```sh
crew pack add packs/agentic-os
```

## The cases

The pack ships with the cases that show its difference (`plugins/core/evals` of the core repository, SP6 Task 6): `pack-agentic-os-seats-the-team` (a Node tree with `agents/triage.md` and `prompts/`, the pack registered and the policy set: `crew team <id>` lists the seat with the reason `pack wizardingcode-pack-agentic-os (agents/**)` and the expert's launch carries `knowledge/agentic.md`) beside `pack-agentic-os-absent` (the same tree without the pack: no seat, no path). Their figures are in the SP6 evals record, `docs/evals/2026-10-21-sp6-results.md` of the core repository: on 2026-10-21, one run each with the plugin, the with case passed every grader (the seat row in the report's Team table, the knowledge path, the rule added, an honest ending) and the absent case passed its own (the rule added, no seat, no knowledge path, an honest ending), so the pair's difference is the seat and the knowledge file alone, as the pack claims.

## Sources read on 2026-10-20

Every URL the pack's files name, with the claim it supports.

- https://genai.owasp.org/llmrisk/llm01-prompt-injection/ · LLM01:2025 Prompt Injection: indirect injection through external sources such as websites or files; the mitigations (the minimum privileges, a human in the loop for privileged operations, untrusted content separated and marked).
- https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ · LLM06:2025 Excessive Agency: excessive functionality, permissions and autonomy; minimise extensions and their permissions, run in the user's context, require approval for high-impact actions.
- https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/ · the OWASP Top 10 for Agentic Applications (published 2025-12-09) is a download; its entries are not quoted in this pack.
- https://code.claude.com/docs/en/security · prompt injection defined; WebFetch runs a separate model call and Claude receives its answer, not the raw page; avoid piping untrusted content to Claude.
- https://code.claude.com/docs/en/permissions · rules evaluated deny, then ask, then allow, the first match decides and specificity changes nothing; a deny rule does not match the same program by path or inside `sh -c`.
- https://code.claude.com/docs/en/sub-agents · a subagent's own context window, system prompt, tools and permissions; `tools` omitted inherits every tool available to subagents; `disallowedTools`; limiting a subagent's tools as a way to enforce a constraint.
- https://code.claude.com/docs/en/hooks · a PreToolUse hook's decision is allow, deny, ask or defer; exit code 2 means stop; a hard allow or deny belongs to the permission system.
- https://code.claude.com/docs/en/plugins · the manifest at `.claude-plugin/plugin.json`; the name and description of every skill, agent and command are in the context on every turn; what the plugin runs, it runs as the user.
- https://code.claude.com/docs/en/plugin-evals · each case runs three times by default; the runs repeated with no plugin give WITH and W/OUT scores, and their difference is what the plugin contributed.
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents · several trials for consistent results; `pass@k` and `pass^k`; grade what the agent produced, not the path; graders code-based, model-based and human.
- https://platform.claude.com/docs/en/test-and-evaluate/develop-tests · success criteria defined first; automate when possible; volume over quality.
- https://www.anthropic.com/engineering/writing-tools-for-agents · more tools do not always lead to better outcomes; tools that merely wrap an endpoint; pagination, range selection, filtering or truncation; Claude Code limits tool responses to 25,000 tokens by default.
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview · client and server tools; tool names, descriptions, schemas and `tool_result` blocks billed as input tokens; `strict: true`.
- https://platform.claude.com/docs/en/build-with-claude/context-windows · everything in the request counts toward the context window; accuracy and recall degrade as it grows; cached prefixes still occupy it.
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching · the 5-minute cache by default and the 1-hour option; cache writes 1.25 times and reads 0.1 times the base input price; the order tools, system, messages.
- https://github.com/WizardingCode-io/wizardingcode-developer-crew · the core repository (the plugin manifest's homepage and repository).
- https://wizardingcode.io · the author.

## Licence

MIT, as the core.
