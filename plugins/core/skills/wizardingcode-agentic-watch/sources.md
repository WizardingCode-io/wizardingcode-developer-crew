# Sources of Watch

Each section is a subject of the team's definition (`docs/specs/2026-11-16-agentic-os-team-design.md`, section 3) with its sources as the definition's row holds them, one a line. The research read the content of some pages and only the answer of others; a line that says a page was not opened names nothing that was read. A line is where a subject is read; where a line states a rule of the team's own, a session follows it only as a row of a skill gives it, and never from this file. The addresses are provenance: they are never opened by the session, and nothing in this file is a step for a session to take.

## Frameworks, SDKs, runtimes and models

- Per stack
- always first what the project's framework brings. Laravel and PHP: the Laravel AI SDK, `laravel/ai`, at its documentation (https://laravel.com/docs/ai-sdk) and repository (https://github.com/laravel/ai), with "Introducing Laravel AI SDK v1.0", of 2026-09-23 (https://laravel.com/blog/introducing-laravel-ai-sdk-v1)
- Laravel MCP (https://github.com/laravel/mcp) and Laravel Boost, a tool for the developer's coding agent and not a framework inside the application (https://github.com/laravel/boost), the three told apart in "Laravel AI SDK, Boost, or MCP: Which Tool Do You Need?", of 2026-03-04 (https://laravel.com/blog/laravel-ai-sdk-boost-or-mcp-which-tool-do-you-need). Node, Next and Nuxt: the Vercel AI SDK, "AI SDK introduction" (https://ai-sdk.dev/docs/introduction), "AI SDK agents overview" (https://ai-sdk.dev/docs/agents/overview), its page on MCP tools (https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) and the Nuxt quickstart (https://ai-sdk.dev/docs/getting-started/nuxt), the Next.js quickstart not being opened
- Mastra (https://mastra.ai/docs, and its index at https://mastra.ai/llms.txt)
- LangGraph.js (https://github.com/langchain-ai/langgraphjs). Python and the providers' SDKs: the Claude Agent SDK (https://code.claude.com/docs/en/agent-sdk/overview)
- the OpenAI Agents SDK (https://openai.github.io/openai-agents-python/)
- Google's Agent Development Kit (https://adk.dev/)
- LangGraph, "LangGraph overview" (https://docs.langchain.com/oss/python/langgraph/overview)
- Pydantic AI (https://pydantic.dev/docs/ai/overview/). .NET and Go: "Microsoft Agent Framework overview" (https://learn.microsoft.com/en-us/agent-framework/overview/agent-framework-overview)
- ADK for Go (https://github.com/google/adk-go)
- Genkit, moved from `firebase/genkit` (https://github.com/genkit-ai/genkit)
- Eino, read in its README (https://github.com/cloudwego/eino). Rust: Rig, read in its README alone (https://github.com/0xPlaygrounds/rig), its documentation site answering 404, being https://docs.rig.rs/ (not opened). Java: Spring AI, "Introduction :: Spring AI Reference", at version 2.0.2 (https://docs.spring.io/spring-ai/reference/). The providers' documentation on their models, by name, the research giving no page for it. The coding runtimes: Claude Code's documentation, at its index (https://code.claude.com/docs/llms.txt), and the other runtimes as the crew already holds them (`plugins/core/skills/crew/references/runtimes.md`), their pages on skills standing in the row "Skills". The backend team's definition, for each stack and its frameworks (`docs/specs/2026-11-14-backend-team-stacks-design.md`, sections 3 and 4)

## Keeping current

- A standing duty with its own sources. The rule: a novelty becomes a rule of the team only through the sources ledger (`docs/sources/ledger.json`
- `docs/adr/0017-outside-sources-enter-the-core-distilled.md`). The research's weekly list: the Claude Code changelog (https://code.claude.com/docs/en/changelog) with its release feed (https://github.com/anthropics/claude-code/releases.atom)
- the Claude Agent SDK's releases (https://github.com/anthropics/claude-agent-sdk-python and https://github.com/anthropics/claude-agent-sdk-typescript)
- the Claude Platform release notes (https://platform.claude.com/docs/en/release-notes/overview)
- OpenAI's API changelog (https://developers.openai.com/api/docs/changelog)
- Codex's changelog (https://learn.chatgpt.com/docs/changelog)
- Gemini CLI's changelogs (https://geminicli.com/docs/changelogs/)
- the MCP blog (https://blog.modelcontextprotocol.io/) and the MCP specification's repository (https://github.com/modelcontextprotocol/modelcontextprotocol)
- the `skills` CLI (https://github.com/vercel-labs/skills)
- GitHub's changelog (https://github.blog/changelog/)
- Cursor's changelog (https://cursor.com/changelog). The monthly list: the Agent Skills specification (https://agentskills.io/specification) and its repository, whose commits are the only signal of a change, the specification having no version (https://github.com/agentskills/agentskills)
- the Agent Skills client list (https://github.com/agentskills/agentskills/blob/main/docs/snippets/clients.jsx)
- the MCP roadmap, its page being https://modelcontextprotocol.io/development/roadmap (not opened), and the SEP index, its page being https://modelcontextprotocol.io/seps/index (not opened)
- MCP's extensions (https://modelcontextprotocol.io/extensions/overview) with their client matrix (https://modelcontextprotocol.io/extensions/client-matrix), the list of who ships Skills over MCP (https://github.com/modelcontextprotocol/ext-skills/blob/main/docs/implementations.md), SDK tiers (https://modelcontextprotocol.io/docs/sdk), registry (https://modelcontextprotocol.io/registry/about and https://github.com/modelcontextprotocol/registry) and security best practices (https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices)
- Anthropic's engineering posts (https://www.anthropic.com/engineering) and news (https://www.anthropic.com/news) and Claude's blog (https://claude.com/blog, which redirects to https://claude.com/resources/articles)
- Google's developers blog (https://developers.googleblog.com/) and the Gemini API changelog (https://aistudio.google.com/docs/changelog)
- the Agentic AI Foundation (https://aaif.io/projects/ and https://aaif.io/blog)
- AGENTS.md (https://agents.md/ and https://github.com/agentsmd/agents.md)
- the A2A protocol (https://a2a-protocol.org/latest/)
- OWASP (https://genai.owasp.org/ and https://owasp.org/projects/mcp-top-10)
- the runtimes' skills pages, read in the row "Skills". The documentation indexes an agent can compare from one reading to the next: https://agentskills.io/llms.txt, https://modelcontextprotocol.io/llms.txt and https://code.claude.com/docs/llms.txt. Fixed dates, by the MCP blog's post of 2026-11-11: the next specification on 2027-03-30, then 2027-09-28 (https://blog.modelcontextprotocol.io/posts/mcp-release-cycle/). Every address of the two lists answered on 2026-11-16
- the research read the content of some and only the answer of the others, and the notes under this table say which

## The reference assistants' engineering

- Studied for their engineering, never installed, never a measure of precision: by the research, neither Grok Bot, `nightly-labs/openbot` nor OpenClaw publishes a routing or tool-selection accuracy figure. Code under a non-commercial licence or none is read to learn and not copied. OpenClaw, MIT, of the OpenClaw Foundation (https://github.com/openclaw/openclaw): "Heartbeat migration" (https://docs.openclaw.ai/gateway/heartbeat), "Automations" (https://docs.openclaw.ai/automation/cron-jobs), "Skills" (https://docs.openclaw.ai/tools/skills), "Memory overview" (https://docs.openclaw.ai/concepts/memory) and "Exec approvals" (https://docs.openclaw.ai/tools/exec-approvals), its "Security" page being downloaded and not gone through (https://docs.openclaw.ai/gateway/security). Grok Bot, a proprietary hosted service in beta, of the company its pages write as "SpaceXSI": "Introducing Grok Bot" (https://x.ai/news/introducing-grok-bot), "How Grok Bot works" (https://docs.x.ai/grok-bot/how-grok-bot-works), "Skills and routines" (https://docs.x.ai/grok-bot/skills-routines-and-automations) and "Approvals, security, and privacy" (https://docs.x.ai/grok-bot/approvals-security-and-privacy), its overview being downloaded and only its title read (https://docs.x.ai/grok-bot/overview). The OpenBot projects, four repositories and not three: `nightly-labs/openbot`, under the PolyForm Noncommercial License 1.0.0, its versions up to 0.1.11 under Apache-2.0 (https://github.com/nightly-labs/openbot)
- `mandarwagh9/openbot`, which redirects to botroster, Apache-2.0, "Pre-alpha" (https://github.com/mandarwagh9/botroster)
- `CopilotKit/OpenBot`, whose application template is MIT and whose CopilotKit Intelligence service is "separately licensed" (https://github.com/CopilotKit/OpenBot), with CopilotKit's post of "September 1, 2026" (https://www.copilotkit.ai/blog/openbot-updates-v0.0.5)
- `meetopenbot/openbot`, MIT, with no release and no push since 2026-07-07 (https://github.com/meetopenbot/openbot). What others publish: Claude Code's scheduled tasks (https://code.claude.com/docs/en/routines)
- Manus's "Context Engineering for AI Agents: Lessons from Building Manus" (https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- Intercom's "Fin AI Engine", whose figures are its own (https://fin.ai/ai-engine)
- Sierra's "Constellation of models", of 2025-12-03 (https://sierra.ai/blog/constellation-of-models). The open agents: goose, Apache-2.0, of the Agentic AI Foundation, at "goose Architecture" (https://goose-docs.ai/docs/goose-architecture/), "goose Permission Modes" (https://goose-docs.ai/docs/guides/managing-tools/goose-permissions/) and "Memory Extension" (https://goose-docs.ai/docs/mcp/memory-mcp/), its repository having moved from `block/goose` (https://github.com/aaif-goose/goose)
- OpenHands, MIT, its enterprise repository under the PolyForm Free Trial License 1.0.0 (https://github.com/OpenHands/OpenHands), at its SDK's architecture pages "Overview" (https://docs.openhands.dev/sdk/arch/overview), "Tool System & MCP" (https://docs.openhands.dev/sdk/arch/tool-system), "Security" (https://docs.openhands.dev/sdk/arch/security), "Condenser" (https://docs.openhands.dev/sdk/arch/condenser) and "Skill" (https://docs.openhands.dev/sdk/arch/skill)
