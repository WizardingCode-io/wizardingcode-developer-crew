# SP10: The document reviewed before the code, and the journey. Design

- Status: approved by the user on 2026-10-31 (the plan of this date), to be built as 0.18.0
- Source: `google/elephant-goldfish-model` (EGM), Apache-2.0, v0.1.0, commit `403d888`, read on 2026-10-31
- Extends ADR 0017 and ADR 0018; ADR 0019 and ADR 0020 record the two decisions

## 1. Why

An agent that writes a design cannot review it: it holds the reasoning that made the text look complete. The crew reviews the diff after the code and the leads validate the spec, and nothing reviews the document before the code with no context. The user asked for EGM in the core, whole, for consistency and better results.

The user also asked for a mode that keeps working on a mission while they rest, in their words "um modo auto journey que permite que eu vá descansar e tudo fique a trabalhar em determinada missão". The crew stops today wherever no rule covers a decision and nobody is present.

## 2. Decisions of 2026-10-31

1. **Form**: everything enters, rewritten in the crew's words, one ledger row per rule (ADR 0017).
2. **Where it is required**: every item on the full route, small fixes in a risk area included. The agent recommended a narrower trigger by work type; the user chose the whole route.
3. **People**: hybrid. With a person, the stages run without stops and only an architecture decision or an `ESCALATE` asks. In a journey, nothing stops the mission.
4. **Left out**: the egm.dev site, EGM's packaging and release scripts, and its contribution rules (`AI_POLICY.md`, the 100-line PR limit). The synthesizer and the bootstrap orchestrator have no agent of their own, because the session does their work (§3).

## 3. What enters

| EGM | In the core |
| :- | :- |
| `egm-brainstorm`, `-draft`, `-review`, `-review-loop`, `-resolve`, `-drift-report`, `-bootstrap` | `plugins/core/skills/wizardingcode-spec-{brainstorm,draft,review,review-loop,resolve,drift,bootstrap}`, each with When, Inputs, Steps, Output and Done when; each can also be run on its own |
| `zoom_out`, `comprehension`, `design_critic`, `structural`, `style`, `implementation_readiness`, `codebase_details` | `plugins/core/agents/goldfish-{zoom-out,comprehension,design,structural,style,readiness,codebase}.md`: `Read, Grep, Glob`, `omitClaudeMd: true`, each with a review mode and a brainstorm mode |
| The bootstrap's scout | `plugins/core/agents/goldfish-explorer.md`: read-only, every entry cited as `[file:symbol]`, `["None"]` when the code states nothing |
| `synthesizer`, `bootstrap_orchestrator` | No agent: the agent rules of this repository forbid Write and Agent to a role, and EGM supports direct dispatch. The session dispatches, `crew spec-review <id> report` deduplicates and writes. Refused rows in the ledger |
| Five document standards | `plugins/core/skills/crew/rubrics/spec-{zoom-out,feature,readiness,reimplementation,heilmeier}.md` with a provenance footer |
| Design template, the alternatives rule, the zero-decision rule | `references/specify.md` and `references/plan.md`; the full route's spec gains Goals, Non-Goals, Open Questions, Critical User Journeys, Alternatives and Non-Functional Requirements under its four sections |
| 30 scenarios in `test_scenarios.yaml` | Cases under `plugins/core/evals/`. EGM has no runner for them (`docs/designs/drift_report.md:119`) |
| The isolation probe in `tests/integration/test_claude.py` | An eval case (§7) |

What exists only in EGM's `docs/designs/*` gets a row too: the bootstrap's sentinels, the severity definitions, the watermark. Where a design contradicts its skill (the scout's limits, the approval threshold, the six lenses, reviewers A and B), the skill holds and the row says why.

`goldfish-style` applies `references/writing.md`; it does not bring a second writing standard.

## 4. The phase

The full route becomes `specify → conclave → plan → spec-review → build`. The precedent is `strategy` (`work.ts`, `strategyHash`): a judged document whose edit makes the ruling stale.

- **The document**: `spec.md` is the feature range and `plan.md` the detailed range. There is no second document to keep in step.
- **The stages run in order**, and only reviewers of one stage run at once:

| Stage | Reviewers | Range | Standard |
| :- | :- | :- | :- |
| 5 Zoom out | zoom-out | both | spec-zoom-out |
| 6 Comprehension | comprehension, whose full answer is kept, its paraphrase first | both | none |
| 7 Critic | design, structural, style | feature | spec-feature, spec-heilmeier |
| 8 Second zoom out | zoom-out, on what stages 6 and 7 added | both | spec-zoom-out |
| 9 Readiness | readiness, codebase, style | detailed | spec-readiness, spec-reimplementation |

- **The guard into build** requires the five stages closed on the document's current hash. It also lives in `routeDocuments`, so the gate and the delivery check it again.
- **Commands**: `crew spec-review <id> check|record|report|status`. Answers land in `review/spec/`.
- **A reviewer that fails** is launched once more, then counts as `not run`, never as zero findings. A `not run` keeps the round from being clean.
- **Convergence is EGM's**: two consecutive clean rounds, a cap of 5, the churn rule. Clean means no unsettled Blocker or Major; a contested or recorded finding stays settled; a fixed finding raised again re-opens. It has its own counter, because `team.maxJudgementRounds` allows 1 or 2. At the cap or on churn the person chooses to accept, continue or return to drafting; a journey leaves the item waiting.
- **Fresh every time**: the SubagentStop hook refuses a resumed goldfish. This is the one exception to "resume, never relaunch", and nothing forces a fresh role today.
- **Resolve**: `PROPOSE FIX`, `CONTEST` (with evidence the reviewer could read), `ESCALATE` (the evidence lies outside what it could read), `DECLINE` (a Nit). A comprehension gap is never contested and a severity is never changed.
- **Brainstorm**: required for `feature` and `new-project` on the full route, with the six lenses in brainstorm mode. On an issue, `analysis.md` is the predecessor.
- **Publication**: `crew learn` writes the approved spec and plan to the project's `docs/designs/<slug>.md`, which `wizardingcode-spec-drift` compares with the code. The weekly cadence is a recommendation, as in EGM.
- **Registration**: `ROLE_NAMES` and `TEAMS` in `team.ts`, the matcher in `hooks.json` (the two must agree), `answerFile`, and the agent counts pinned at 15 in `skill.test.ts`, `tarball.test.ts` and `agents.test.ts`, which become 23.

## 5. People

| | With a person | In a journey |
| :- | :- | :- |
| Stages, valid fixes | Run on, one consolidated report | The same |
| An architecture decision | Stop: up to three options, each with its mechanism, trade-offs and when it fails, unranked, one question at a time | The validator applies the recorded conservative default; the decision heads the morning report |
| No default, or it changes a gate or a risk area | Ask | The item waits and the mission moves to its next part; never a guess |
| `ESCALATE` | Ask | As the row above |

Rule 4 stays for every other decision. The default stays on record for architecture decisions too, because the journey needs it; with a person it is not shown as a recommendation.

## 6. The journey

`crew journey start "<mission>" [--until <time>] [--allow push]`, `status`, `stop`, `report`.

- **It survives without the person**: detached `claude -p` sessions under launchd, reusing `open.ts` and the loop's backoff (`backoffHours`, ADR 0015). A usage limit or an error pauses and resumes; the model ladder exists (finding 152).
- **Where**: one worktree and one branch, `journey/<id>`. The mission splits into crew items with the same gates; no gate is weakened.
- **Limits by default**: commits on that branch alone. No push, release or deploy unless `--allow` names it at the start. The validator still cannot waive an objection (`objections.ts`). Extra rounds are granted by the mission through `team.continuations granted`.
- **The end**: a notification and `crew journey report`, with what was proven, what was not and why, the decisions taken without the person, and the cost.
- **Its limits**: the Mac stays on and awake, as for the loop. launchd makes this macOS only until a user of another system asks.

## 7. How it is proven

- `bun run check`, `bun run plugin:check`, `bun run build`.
- **The measure (ADR 0017 rule 3)**: one fixture whose spec holds planted defects (a false assumption, a missing alternative, a nonexistent API, a decision left to the implementer), on the base and on the item, three runs per arm: the defects caught before the code and the spread between runs, which is the user's measure of consistency.
- **Isolation**: markers in the workspace `CLAUDE.md` and in the parent's prompt must not appear in the child's transcript; a denied persona gives a stop with no verdict.
- **End to end**: a real full item passes the five stages, and the guard refuses build after an edit to the spec.
- **The journey**: a real two-part mission in a sandbox with nobody present; a session killed halfway resumes; a decision with no default leaves its item waiting while the mission goes on; no push without `--allow`.

## 8. What stays unproven

- EGM is v0.1.0. Its FAQ says finishing the workflow "does not demonstrate a productivity improvement". The gain here is known only from the measure above, reported as it comes out.
- EGM's isolation probe covers one reviewer, not the workflow. `omitClaudeMd` isolates context, not the file system.
- `omitClaudeMd` belongs to Claude Code (2.1.271 or later; this machine has 2.1.316). The generators for the other runtimes probably do not carry the key, to be confirmed in the item that adds the agents; where they do not, the report says isolation is not proven there.
- **Cost**: one pass uses 9 to 16 reviewers (EGM's `TESTING.md` records), up to 5 rounds, on the whole full route, small fixes included. The 30 cases cost about 9 to 69 USD, estimated from the per-case figures in `CLAUDE.md`.
- The existing roles (`review-*`, judge, leads) keep receiving `CLAUDE.md`, and some reviewers may rely on the conventions there. It is left for a decision after the measure, recorded as a finding.
