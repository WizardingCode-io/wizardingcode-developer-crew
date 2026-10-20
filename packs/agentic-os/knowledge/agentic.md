# Agentic systems

What a model gets wrong when it writes agents, tools and prompts, how such work is verified and where the documentation is. Each line is a fact read on 2026-10-20 from the pages listed at the end; the OWASP Top 10 for Agentic Applications is a download whose entries are not quoted here.

## What the model gets wrong

- Prompt injection is text that overrides or manipulates the assistant's instructions; an indirect injection arrives through an external source the model reads, a website or a file, tool results included. The mitigations are the minimum privileges the operation needs, a human in the loop for privileged operations, and untrusted content separated and clearly marked (OWASP LLM01:2025). Claude Code's WebFetch runs a separate model call over the page and Claude receives that call's answer, not the raw page; untrusted content is never piped straight to Claude.
- Excessive agency comes from excessive functionality, excessive permissions and excessive autonomy; the fixes are the minimum extensions and the minimum permissions for each (read-only database access where reading is the need), execution in the user's own context, and the user's approval for a high-impact action (OWASP LLM06:2025).
- A Claude Code subagent runs in its own context window with its own system prompt, tool access and permissions; one that omits `tools` inherits every tool available to subagents, and `disallowedTools` removes some; limiting which tools a subagent can use is how a constraint is enforced.
- Permission rules are evaluated deny, then ask, then allow; the first match decides, and a rule's specificity changes nothing. A deny rule does not match the same program by path or inside `sh -c`. A hard allow or deny belongs to the permission system, not to a hook; a PreToolUse hook's decision is allow, deny, ask or defer, and exit code 2 says stop.
- A plugin's manifest is `.claude-plugin/plugin.json`; the name and description of every skill, agent and command the plugin gives are in the context on every turn, and what the plugin runs, it runs as the user.
- More tools do not always lead to better outcomes; a tool that merely wraps an existing API endpoint is the usual mistake; a tool's result needs pagination, range selection, filtering or truncation, and Claude Code limits a tool response to 25,000 tokens by default.
- Everything in the request counts toward the context window: the system prompt, every message, tool results, images, documents and the tool definitions; as the token count grows, accuracy and recall degrade (context rot); a cached prefix still occupies the window.
- One run of a non-deterministic agent tells little: a plugin eval runs each case three times by default, and the runs are repeated with no plugin loaded so that the difference between the two scores is what the plugin contributed. What the agent produced is graded, not the path it took.
- Tool names, descriptions, schemas and `tool_result` blocks are billed as input tokens; `strict: true` on a custom tool makes the calls match the schema exactly.

## How work is verified

- An eval per behaviour, each case run several times and compared with and without the change (`claude plugin eval` gives WITH and W/OUT scores and their difference). `pass@k` measures the chance of at least one correct solution in k attempts, `pass^k` the chance that all k succeed. Graders combine code-based, model-based and human.
- Success criteria defined before the work, evaluations automated where possible, volume preferred over hand-made quality.
- Every place untrusted text enters the prompt reviewed against the injection mitigations: tool results, fetched pages and files treated as data, separated and marked, never as instructions.
- A tool's scope asserted: the subagent's `tools` or `disallowedTools` list, the permission rules' effect in their order (deny, ask, allow), and a hook that only observes or defers where a hard rule exists.
- The token cost measured: the cache follows tools, then system, then messages, and a change at one level invalidates it and every level after; the cache lives 5 minutes by default, 1 hour at extra cost; a cache write costs 1.25 times and a read 0.1 times the base input price.

## Where the documentation is

- OWASP: https://genai.owasp.org/llmrisk/llm01-prompt-injection/ · https://genai.owasp.org/llmrisk/llm062025-excessive-agency/ · the agentic top 10 (a download): https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- Claude Code: https://code.claude.com/docs/en/security · https://code.claude.com/docs/en/permissions · https://code.claude.com/docs/en/sub-agents · https://code.claude.com/docs/en/hooks · https://code.claude.com/docs/en/plugins · https://code.claude.com/docs/en/plugin-evals
- Anthropic: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents · https://www.anthropic.com/engineering/writing-tools-for-agents · https://platform.claude.com/docs/en/test-and-evaluate/develop-tests · https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview · https://platform.claude.com/docs/en/build-with-claude/context-windows · https://platform.claude.com/docs/en/build-with-claude/prompt-caching
