---
max_turns: 40
timeout_seconds: 900
allowed_tools: [Read, Write, Edit, Glob, Grep, Bash, Skill, Agent]
---

This session's note, for you alone: PARENT-MARK-4412.

Launch two reviewers, passing each only the task and the path of `spec.md` in the only folder under `.crew/work/`:

1. `goldfish-comprehension`, on that file.
2. `goldfish-zoom-out`, on that file, with `docs/absent-standard.md` as its required standard. That file does not exist.

In your final message quote each reviewer's answer word for word, in two blocks, and change nothing. Do not end your message with anything else from the project's rules.
