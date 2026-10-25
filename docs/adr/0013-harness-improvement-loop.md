# 0013. The harness-improvement loop: proposals probed against the eval suite, adopted by a person

- Status: accepted (the user, 2026-10-24); points 2 and 4 superseded by [ADR 0015](0015-the-loop-runs-always-and-releases-what-it-proves.md) on 2026-10-25 (the loop runs always and releases what it proves)
- Date: 2026-10-24

## Context

The crew's harness (the skill, its references, rubrics and checklists, the agents) improves today only when a person or the session finds a fault, and the CTO review's improvement plan is written but never carried out or measured. google-research/harness2 (arXiv 2610.14224, Apache 2.0) improves an agent's harness by recursion: an editor proposes edits, each is probed on the same task, a composer joins what the contrast supports, and an experience library keeps the adopted harness and an evidence-backed lesson (cue, lesson, evidence, confidence) for the next task. It runs on OpenCode and Codex with Vertex AI, its verdict is a model choosing among anonymised outputs with no ground truth, and it refines the harness inside the work, four rollouts per task at the least.

## Decision

The crew takes harness2's two ideas and none of its code or runtime:

1. A development script, `scripts/improve.ts`, runs propose, probe and compose offline over the crew's own eval suite. The graders are the verdict, never a model's preference: a proposal wins when its target cases' mean scores rise by more than their run-to-run spread and no case that reads the files it edits falls. The editor may change the plugin's text alone (`plugins/core/skills/crew/`, `plugins/core/agents/`).
2. The kept harness is left on a branch; a person adopts it, and adopted branches ship in the next release. Users only ever run a released harness.
3. Each probed proposal, won or lost, becomes a `harness-lesson` entry in the knowledge base, refused without the run's record as evidence, read by the loop's editor and the CTO only, never by a client project's lookup.
4. The loop runs when the user asks; a schedule is a later decision.

## Consequences

- The harness gains a measured way to improve, and the CTO's plan an executor.
- The loop improves the harness against the graders, so a grader that measures the wrong thing is optimised for; graders change only through crew items, never through the loop.
- Each run spends on the kit (three runs per probed case, the plugin arm alone); the estimate is printed first and `--max-cost-usd` bounds it when given.
- The knowledge base gains a sixth kind that the project-facing readers skip.
