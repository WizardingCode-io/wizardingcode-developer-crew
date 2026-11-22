# Sources of Agents, tools and prompts

Each section is a subject of the team's definition (`docs/specs/2026-11-16-agentic-os-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the content of some pages and only the answer of others; a line that says a page was not opened names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Agents and subagents

- One purpose, the tools named, a context and permissions of its own. The pack's checklist for an agent (`packs/agentic-os/checklists/agent.md`) and its knowledge page (`packs/agentic-os/knowledge/agentic.md`)
- the crew's own agents, as the form (`plugins/core/agents/`)
- Claude Code's subagents, at the address the architects' definition opened (https://code.claude.com/docs/en/sub-agents)
- Anthropic's "Building effective agents", of 2024-12-19, whose page title is today "Building effective AI agents" and whose own note says that much of the tooling it describes has changed since (https://www.anthropic.com/research/building-effective-agents)
- Anthropic's "How we built our multi-agent research system", of 2025-06-13, at the address the architects' definition opened (https://www.anthropic.com/research/multi-agent-research-system), its figures Anthropic's own: about 4 times the tokens of a chat for an agent and about 15 times for several agents
- the Agent SDK, "Agent SDK overview" (https://code.claude.com/docs/en/agent-sdk/overview), with the Python repository (https://github.com/anthropics/claude-agent-sdk-python) and the TypeScript one (https://github.com/anthropics/claude-agent-sdk-typescript), and "Claude Managed Agents overview", a beta by the research's reading of its page (https://platform.claude.com/docs/en/managed-agents/overview)
- the documentation of the project's runtime, of its model provider and of its agent framework, read in the pages of the row "Frameworks, SDKs, runtimes and models"
- the architects' definition for AI and agents (`docs/specs/2026-11-15-architects-team-design.md`, section 3, the row "AI and agents")

## Tools for agents

- The schema, a result shaped for the model, least privilege. The pack's checklist for a tool (`packs/agentic-os/checklists/tool.md`) and its knowledge page (`packs/agentic-os/knowledge/agentic.md`)
- Anthropic's "Writing effective tools for agents — with agents", of 2025-09-11, whose page title is "Writing effective tools for AI agents" (https://www.anthropic.com/research/writing-tools-for-agents)
- the Claude platform's documentation on tool use: "Tool use with Claude" (https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview) and "How tool use works" (https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works)
- Anthropic's "Introducing advanced tool use on the Claude Developer Platform", of 2025-11-24, at the address the research read, the readings of 2026-11-16 not checking whether it moved as the other posts did (https://www.anthropic.com/engineering/advanced-tool-use), its figures Anthropic's own and measured on evaluations that are not public: with the tool search tool, 49% to 74% on Opus 4 and 79.5% to 88.1% on Opus 4.5, and with examples in a tool's definition, 72% to 90% on complex parameters
- two checks of tool search on catalogues of thousands of tools, one of them a competitor's, both known by a search result alone, their pages being https://blog.arcade.dev/anthropic-tool-search-4000-tools-test (not opened) and https://stacklok.com/blog/stackloks-mcp-optimizer-vs-anthropics-tool-search-tool-a-head-to-head-comparison/ (not opened)
- the Model Context Protocol specification on tools, revision 2026-07-28, at the specification's address in the architects' definition, the page on tools itself not being opened (https://modelcontextprotocol.io/specification/2026-07-28), with the readings of the row "MCP servers"
- JSON Schema, version 2020-12, at the address the architects' definition opened (https://json-schema.org/specification)
- the provider's function calling documentation: OpenAI's "Function calling" (https://developers.openai.com/api/docs/guides/function-calling), and for the Vercel AI SDK "Tool Calling" (https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "AI and agents")

## Prompts

- Instructions apart from data, versioned with their eval. The pack's checklist for a prompt (`packs/agentic-os/checklists/prompt.md`) and its knowledge page (`packs/agentic-os/knowledge/agentic.md`)
- the crew's writing rules (`plugins/core/skills/crew/references/writing.md`) and its own prompts, as the form (`plugins/core/agents/`, `plugins/core/skills/crew/SKILL.md`)
- Anthropic's prompt engineering documentation, of which the research gives one page, on the prompt improver, known by a search result alone, its page being https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompt-improver (not opened)
- Anthropic's "Effective context engineering for AI agents", of 2025-09-29 (https://www.anthropic.com/research/effective-context-engineering-for-ai-agents)
- Anthropic's prompt library, by name, the research giving no page for it
- the prompting documentation of the provider the project uses, by name, the research giving no page for it
- structured outputs, read in the strict mode of OpenAI's "Function calling", which the research read (https://developers.openai.com/api/docs/guides/function-calling), and in JSON Schema, at the address the architects' definition opened (https://json-schema.org/specification), no page named after structured outputs being opened
- the QA team's definition for a prompt's eval (`docs/specs/2026-11-15-qa-team-design.md`, section 3, the row "Testing systems with AI")

## Prompt injection and excessive agency

- The pack's knowledge and checklists (`packs/agentic-os/knowledge/agentic.md`
- `packs/agentic-os/checklists/agent.md`, `tool.md` and `prompt.md`)
- the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "AI and agents")
- OWASP: "LLM01:2025 Prompt Injection", which says "it is unclear if there are fool-proof methods of prevention for prompt injection" (https://genai.owasp.org/llmrisk/llm01-prompt-injection/), and "LLM06:2025 Excessive Agency", whose root causes are "excessive functionality
- excessive permissions
- excessive autonomy" (https://genai.owasp.org/llmrisk/llm062025-excessive-agency/)
- the agentic top 10 that exists today, "OWASP Top 10 for Agentic Applications for 2026", dated "December 9, 2025", read at its page (https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) and in the PDF behind its download button (https://genai.owasp.org/download/52117/), with its ten entries, ASI01 Agent Goal Hijack to ASI10 Rogue Agents, and its principle of "Least-Agency", and the post that announces it (https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/)
- OWASP's older threats list, "Agentic AI - OWASP Lists Threats and Mitigations", of "February 17, 2025", read at its landing page alone, its PDF not being opened (https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/)
- Anthropic's "Mitigate jailbreaks and prompt injections" (https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks) and Claude Code's security page (https://code.claude.com/docs/en/security), both at the URL the security team's definition gives, and "Mitigating the risk of prompt injections in browser use", of 2025-11-24, whose figures are Anthropic's own (https://www.anthropic.com/research/prompt-injection-defenses)
- Simon Willison on the lethal trifecta
- CaMeL
- the Agents Rule of Two
- the three by name, the research giving no page for any of them
- "Design Patterns for Securing LLM Agents against Prompt Injections", arXiv 2506.08837, of which the abstract alone was read (https://arxiv.org/abs/2506.08837)
- MITRE ATLAS, by name, its site being https://atlas.mitre.org/ (not opened)
- the NIST AI Risk Management Framework, at the URL the security team's definition gives (https://www.nist.gov/itl/ai-risk-management-framework)
- injection that stays in a memory or arrives through a retrieved document or an MCP server's tools is read in the rows "Memory", "Knowledge" and "MCP servers" of this section

## Permissions and hooks

- Deny, ask, allow. The pack (`packs/agentic-os/knowledge/agentic.md`, on the order deny, then ask, then allow
- `packs/agentic-os/checklists/agent.md`)
- the crew's own hooks and guard (`packages/engine/src/hooks/`, of which `pre-tool-use.ts` is the guard and `index.ts` says a hook that cannot decide answers `{}`
- `plugins/core/hooks/hooks.json`)
- Claude Code: its permissions page (https://code.claude.com/docs/en/permissions) and its hooks page (https://code.claude.com/docs/en/hooks), both at the URL the pack read on 2026-10-24, "Control MCP server access for your organization" (https://code.claude.com/docs/en/managed-mcp), "Plugin security and trust" (https://code.claude.com/docs/en/plugins/security), and "Run Claude Code programmatically", which warns that "A `-p` session shows no workspace trust dialog and no per-server approval prompt" (https://code.claude.com/docs/en/headless)
- Claude Code's sandbox and its managed settings, by name, the research giving no page for either
- tool approval in the project's SDK: the Laravel AI SDK, where a tool implements `Approvable` (https://laravel.com/docs/ai-sdk), the Vercel AI SDK's "Tool Calling", for `toolApproval` (https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling), the Claude Agent SDK's "Agent SDK overview" (https://code.claude.com/docs/en/agent-sdk/overview), the OpenAI Agents SDK (https://openai.github.io/openai-agents-python/), Google's ADK, for its action confirmations (https://adk.dev/), and Inspect's "Tool Approval" (https://inspect.aisi.org.uk/approval.html)
- the reference products' approval rules: Grok Bot's "How Grok Bot works" (https://docs.x.ai/grok-bot/how-grok-bot-works) and "Approvals, security, and privacy" (https://docs.x.ai/grok-bot/approvals-security-and-privacy), OpenClaw's "Exec approvals", where "approvals can only tighten config-derived security/ask, never loosen them" (https://docs.openclaw.ai/tools/exec-approvals), botroster, where "Approvals fail closed" (https://github.com/mandarwagh9/botroster), goose's "goose Permission Modes", where "`Autonomous Mode` is applied by default" (https://goose-docs.ai/docs/guides/managing-tools/goose-permissions/), and "Managing Tool Permissions" (https://goose-docs.ai/docs/guides/managing-tools/tool-permissions/), and OpenHands' "Security", whose risk label comes from the model that proposes the action (https://docs.openhands.dev/sdk/arch/security)
- OWASP's LLM06, for "Implement authorization in downstream systems rather than relying on an LLM to decide if an action is allowed or not" (https://genai.owasp.org/llmrisk/llm062025-excessive-agency/), and ASI02 of the agentic top 10, for per-tool least-privilege profiles (https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- the security team's definition (`docs/specs/2026-11-15-security-team-design.md`, section 3, the row "AI and agents")

## Context and cost

- Window, cache, tokens. The pack (`packs/agentic-os/knowledge/agentic.md`, on what counts toward the window and on the cache's prices), with the page it read on the context window (https://platform.claude.com/docs/en/build-with-claude/context-windows)
- Anthropic: "Effective context engineering for AI agents", published "Sep 29, 2025" (https://www.anthropic.com/research/effective-context-engineering-for-ai-agents), "Prompt caching", of which the research read the first 100,000 characters (https://platform.claude.com/docs/en/build-with-claude/prompt-caching), "Compaction overview" (https://platform.claude.com/docs/en/build-with-claude/compaction.md), "Context editing", read in its first 100,000 of 108,000 characters (https://platform.claude.com/docs/en/build-with-claude/context-editing.md), both features in beta by the research's note, "Managing context on the Claude Developer Platform", whose figure of 84% fewer tokens is Anthropic's own (https://claude.com/blog/context-management), token counting, at the URL the architects' definition gives (https://platform.claude.com/docs/en/build-with-claude/token-counting), and tool search, read in "Introducing advanced tool use on the Claude Developer Platform", of 2025-11-24, whose figures are Anthropic's own (https://www.anthropic.com/engineering/advanced-tool-use), the platform's own page on the tool search tool and Anthropic's pricing page not being opened, the research giving no address for either
- Chroma's "Context Rot: How Increasing Input Tokens Impacts LLM Performance", of 2025-07-14 (https://www.trychroma.com/research/context-rot)
- "Context Engineering for AI Agents: Lessons from Building Manus", of 2025-07-18, whose figures are Manus's own (https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- the cache and the prices of the provider the project uses, read for OpenAI in "Function calling", where `allowed_tools` restricts the callable tools without changing the list (https://developers.openai.com/api/docs/guides/function-calling), and in "Latency optimization" (https://developers.openai.com/api/docs/guides/latency-optimization), no pricing page of any provider being opened
- the MCP specification's "Key Changes", where servers "SHOULD return tools from `tools/list` in a deterministic order to enable client-side caching and improve LLM prompt cache hit rates" (https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- the crew's cost rules (`plugins/core/skills/crew/references/rules.md`, rule 18, and `crew metrics`)
- the DevOps team's definition (`docs/specs/2026-11-15-devops-team-design.md`, section 3, the row "Cost")
