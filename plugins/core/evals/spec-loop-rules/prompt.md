---
max_turns: 20
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

A document review has these rounds. Using `wizardingcode-spec-review-loop`, answer in your final message: after each round, is it clean, has it converged, and what comes next? There is no item to record them on, and no reviewers to launch.

- Round 1: `goldfish-zoom-out` raised a Major at "Design". It was contested, with evidence. Every reviewer ran.
- Round 2: every reviewer ran. Two Nits. No Blocker, no Major.
- Round 3: `goldfish-zoom-out` raised the same Major at "Design" as round 1, and `goldfish-style` raised a new Nit. Every reviewer ran.
- Round 4: `goldfish-readiness` is listed in the summary, `goldfish-codebase` has no status at all, and the summary reports zero findings.
