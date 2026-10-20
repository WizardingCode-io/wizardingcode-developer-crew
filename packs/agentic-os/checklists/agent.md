# Agent

A subagent or an autonomous role. The kind where the tool list, the permission boundary and the eval get forgotten because the prompt read well.

## Assumed by good practice
- Its purpose in one sentence, and the tools it holds named explicitly: a Claude Code subagent that omits `tools` inherits every tool available to subagents.
- Its own context window, system prompt and permissions stated; what it must never do written as a permission rule (evaluated deny, then ask, then allow), not as a hope in the prompt.
- An eval with a with-and-without comparison, each case run more than once, before it ships.
- Its cost per run measured: what its description adds to every turn, what its context holds.

## Decisions only the user can make
- Whether it may take a high-impact action without a person's approval.
- Which data it may read, and whether any of it is personal.

## Proposals
- `disallowedTools` to cut the inherited tools it does not need.
- A smaller context: what it never reads kept out of its prompt.

## Warnings
- An agent that reads untrusted content (web pages, files, tool results) with write tools in hand.
- An agent evaluated once, or never compared with its absence.
- An agent whose name and description cost every session's context without earning it.
