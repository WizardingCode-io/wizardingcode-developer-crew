# SP2: Conclave and judgement gates (design)

> **Status:** the engine half (SP2a: the conclave phase and its guard, the gap round's decisions, the objection ledger, the observed criterion kind, the validator under its two rules) is implemented by the [SP2a plan](../plans/2026-10-14-sp2a-conclave-in-the-engine.md) and shipped in 0.2.0 on 2026-10-14; the roles as plugin agents, the checklists, the judgement gates, the mod's panel (SP2b) and the evals and hardening (SP2c) await their plans. Written on 2026-10-14, the day the [real-use phase](../real-use/README.md) closed; the [closing summary](../real-use/2026-10-14-summary.md) is absorbed in sections 4, 15 and 18. [ADR 0005](../adr/0005-attended-decisions-by-relay.md) (attended decisions by relay) was decided alongside and is not part of this design.
> **Parent:** [Vision](../vision.md) §6, §7, §15. **Subproject:** 2 of 6. **Depends on:** SP1 ([design](2026-10-06-sp1-engine-and-base-method-design.md), released as 0.1.x).

## 1. Summary

SP1 made "done" a verdict of the engine: criteria, a red run before a green run, the project's own gates, evidence on disk. It says nothing about whether the right thing was built. SP2 adds the two parts of the method that judge the work instead of running it:

- **The conclave**, between Specify and Plan. A gap round on every item that says what good practice assumes, what only the user can decide, what the agent proposes and what the request gets wrong; and, when a decision has consequences, a debate between roles in separate contexts, closed by a judge. The engine keeps the objections and refuses to advance while a blocking one is open.
- **Judgement gates**, in the Gate phase after the deterministic gates: code quality, test quality, security, UI/UX and risk, each a reviewer with a rubric and a judge, each reported as proven, not proven or not run, never as passed by default.

One role carries over a requirement the user stated on 2026-10-12: the crew is hybrid, a person present or agents running unattended for a day. A decision that only the user may take cannot stop the work when nobody is there. The judge is the **validator**: it decides on evidence, under rules, and the record says so.

SP2 does not change the engine's state machine. Phases are data per route; the conclave is one more phase in two of the three lists.

## 2. Goals and non-goals

**Goals**

1. Every standard and full item has a gap round on record before a plan exists, and the user has seen its four lists.
2. A decision with consequences is debated by roles that cannot see each other's reasoning, and a judge rules on the evidence. The user takes part and can overrule; the record then says "decided by the user".
3. The engine keeps an objection ledger. Work does not pass to Plan, and does not pass Gate, with a blocking objection open.
4. Unattended runs no longer wait on a person for the decisions that have rules: the validator takes them and is named in the report.
5. Judgement gates run on the routes that need them, with a rubric each, and the verdict says which ran, which did not and why.
6. Each part is measured: the gap round on the real-use corpus, the gates with and without.

**Non-goals**

| Not in SP2 | Where |
| :- | :- |
| Calibrated decision backends (Laya, Jev), replay corpus, prompt enrichment | SP3 |
| Proof scope by item (the fingerprint and the gates judge the whole tree: findings #9, #20) | Engine maintenance, 0.1.x, or SP3 |
| The cost of a release and the double gate run after an engine change (#11, #18) | Engine maintenance |
| Tuning the default risk paths (#1, #14) | SP3 by replay; a per-repository exclusion in `policy.json` can come earlier |
| Validated-solutions base, Learn phase | SP4 |
| Session mail, sessions opened by the system | SP5 |
| Packs with per-stack checklists beyond the built-in kinds | SP6 |

The second and third rows are written down so that they stop being called "SP2 material" by default. They are engine questions; the conclave does not solve them.

## 3. Terms

| Term | Meaning |
| :- | :- |
| Gap round | The cheap pass every item gets: four lists, one screen, before the plan |
| Debate | The full conclave: researcher, experts, devil's advocate, fault-finder, judge |
| Objection | A dated statement that the work must not proceed as proposed, with a severity: `blocking` or `advisory` |
| Ledger | `.crew/work/<id>/objections.json`, engine-owned, the list of objections and their status |
| Judge | The role that rules on the proposal, the objections and the evidence, and never sees the user's enthusiasm |
| Validator | The judge acting for the user on a user-only decision when no person is watching |
| Judgement gate | A gate whose verdict is a reviewer's ruling against a rubric, not an exit code |
| Rubric | The fixed list of questions a reviewer answers, with what counts as a defect |

## 4. What real use taught

The phase's records ([corpus](../real-use/corpus.md), [findings](../real-use/findings.md)) are the inputs. The ones that shape this design:

- **The gap round pays on small requests.** C-11, "is it possible to delete accounts?", is a support ticket; the gap is whether it is an erasure request, which soft delete does not satisfy. C-13, a rate-limit fix, redirected customers to pages that did not exist in production and became an item in another project (C-14). C-16 restored dropped tables whose rows were never exported: the editor came back, the prompt did not. None of these needed a debate; each needed one question asked before a line was written.
- **When the gap round was done, nothing bit.** C-9's "all" turned out to be an import default, not a consent, and the owner chose the new default before the build. The record shows the round as "assumptions confirmed by the owner" in the brief. The conclave makes that a phase with a record, not a habit of one agent.
- **The method's own gaps show in criteria.** Four preserve criteria written as behaviour (#15), an end-to-end criterion whose red run cannot exist (C-10), the gates restated as a criterion (C-4). A spec's quality was left to SP2 by the SP1 design (section 10 there); these are what "quality" means first.
- **Unattended decisions are the rule, not the exception.** Every real-use session ran in auto mode; about thirty user-only decisions in three days were recorded as the agent's or typed by the user on the agent's request (#17, #19). 0.1.6 made auto mode attended, so the prompt is the signature there. `bypassPermissions`, `dontAsk` and headless runs stay unattended, and there the work waits or counts the agent's own word. That is the validator's job.
- **The full route fires often.** Nine of thirteen Laravel items, by risk paths that are everywhere in such an application (#14). Whatever the debate costs, it cannot be the price of the full route on every item; it opens on consequences, not on route.
- **Gates that judge the tree's debt get skipped** (#20). A judgement gate inherits the same problem twice over: a reviewer handed a whole repository reviews the repository. Every judgement gate in this design receives the item's diff and its tests, nothing else.

## 5. Behaviour, by example

**A standard fix.** The user asks for the published templates to stop opening empty (C-7). Receive and Understand as in SP1. The spec names the criteria. The conclave's gap round runs: assumed, that nothing was lost and the editor opens each language by its effective document; the user's decision, whether Save keeps sending only changed languages; proposal, a read endpoint under the template key; warning, the automatic translation is out of scope. The four lists are one screen; the user answers the one decision; the engine records the round and moves the item to Plan. No debate: no objection, no risk area.

**A full item with consequences.** Marketing preferences are wrong (C-9). The gap round finds that "all" is a default and that the existing sync would re-subscribe every customer with an order. That is a decision with consequences: the debate opens. The researcher reads the provider's documentation and the project's consent code; an expert proposes the provider as the source of truth for the newsletter; the devil's advocate argues the CRM must own consent now; the fault-finder files a blocking objection: the full sync must not run until the new default exists. The judge rules: provider is truth for the newsletter until the CRM has consents of its own; the sync is gated; the objection stays open until the gate exists in the plan. The user agrees. The engine refuses `phase next` into Plan until the plan names the task that resolves the objection, then resolves it when the task's criterion is proven.

**An unattended run.** The same item in a session with `dontAsk`, nobody watching. The spec needs approval before Build on the full route. Today the work waits (`unattendedDecisions: "wait"`) or the agent's own approval counts (`"count"`). With `"validator"`, the judge receives the spec, the gap round and the ledger, approves because the round is complete, every decision-only-the-user has a stated default and no blocking objection is open, and the record reads "spec approved by the validator (rule: complete gap round, no blocking objection)". It never reads "approved by the user". A skip of a gate is not a decision the validator can take.

**A gate that cannot run.** The UI/UX gate on a change to a Nuxt page in a project with no browser available to the session. The verdict row says "UI/UX: not run, no browser"; the item is not proven until the user skips it with a reason, as with any gate today.

## 6. The gap round

**Always, on standard and full.** It runs when the item enters the `conclave` phase, after `spec.md` exists. **On the fast route** it is folded into Receive as it is today, because the route exists for one-spot fixes with no risk area and its overhead is already 1.7 to 1.9 times the baseline (`docs/evals/2026-10-12-sp1b-results.md`): the receive step's typed answers are the round. A fast item that the round would have caught is a fast item that should not have been fast; that is a routing question (SP3), measured on the corpus.

**Four lists, one screen**, as the vision states them:

| List | What goes in it | What happens to it |
| :- | :- | :- |
| Assumed by good practice | What will be done without asking, stated so the user can refuse | Each line becomes a `preserve` or `behavior` criterion, or a line in the spec |
| Decisions only the user can make | What two competent engineers would build differently | Each is asked as a typed question; an unanswered one blocks Plan unless it has a stated default and the validator rule applies |
| Proposals | Optional improvements, each with its reason | The user takes or leaves each; a taken one becomes a criterion |
| Warnings | What the request asks for that goes against good practice, and why | Each becomes an `advisory` objection; the user's answer closes it, and "build it anyway" is recorded as decided by the user |

**Checklists by kind.** The round is guided by a checklist for the kind of change, so that the questions do not depend on one model's mood: an endpoint, a login or permission, a checkout or payment, an upload, a migration or restore, a data sync with a third party, a redirect or link target, a deletion, a merge or integration, a screen. The built-in checklists are short; packs (SP6) can add theirs. The first checklists are written from the corpus: the deletion kind from C-5 and C-11, the sync kind from C-9, the link-target kind from C-13 and C-14, the restore kind from C-16, the merge kind from C-17.

**Where it is written.** `.crew/work/<id>/conclave.md`, written by the agent, with the four headings. The engine checks structure, as it does for `spec.md`: the file exists, the four sections exist, each has at least one line or the word "none". The user's answers to the decisions are recorded by `crew decide <id> <D-n> "<answer>"`, user-only like `approve`, so the prompt is the signature.

**Who runs it.** The session's own agent, reading the checklist for the kind, in the main context. The round is cheap by design; the roles in separate contexts are for the debate.

## 7. The debate

**When.** The debate opens when the gap round finds a decision with consequences, which the design defines as any of: a blocking objection filed during the round; a warning the user wants to build anyway on a risk area; a decision-only-the-user whose answer changes a risk area (who holds a permission, what is hard-deleted, which side of a conflict wins when the two differ in a query budget); or the user asking for it. It does not open because the route is full. The corpus gives the first calibration: of the fourteen entries of 2026-10-12 and 13, the debate would have opened on C-5 (which models are hard-deleted), C-9 (the sync) and C-11 (erasure or deactivation), and on none of the MCP waves whose decisions were taken in the brief.

**Roles**, as the vision lists them, each in its own context:

| Role | Receives | Returns |
| :- | :- | :- |
| Researcher | The request, the spec, the gap round, read access to the repository and the documentation | Facts with sources: what the code does today, what the documentation says, prior solutions (SP4 later) |
| Experts (one to three) | The above plus the researcher's facts | A proposal each, with the criteria it adds or changes |
| Devil's advocate | The proposals only | The strongest case for the opposite position |
| Fault-finder | The proposals only, never the reasoning behind them | Defects, each as an objection with a severity |
| Judge | The proposals, the objections, the evidence, the user's answers to typed questions; never the conversation | A ruling: which proposal, with which objections resolved how, what stays open |

**In Claude Code** the roles are subagents: the plugin ships an agent definition per role under `plugins/core/agents/`, and the skill's `references/conclave.md` says what each receives. A subagent starts with a clean context, which is what "its own context" means here; the orchestrating session passes files, not transcripts. In another runtime the same role prompts run however that runtime runs agents.

**The user is in the room.** The panel presents (one screen: the proposals, the objections, the ruling), the user answers, the panel revises once, the judge closes. The user can decide against the ruling; the ledger then holds the objection as `waived` with "decided by the user", and the report says so. The spec is amended by the agent from the ruling before Plan.

**Cost.** The debate is capped: one research pass, at most three experts, one revision round. The spec's size scales with the route (SP1 section 10); the debate's size scales with the number of open decisions, and the engine records the token cost of the round in the evidence so that the eval can report it.

## 8. The objection ledger

`.crew/work/<id>/objections.json`, engine-owned like `work.json`: written only by the `crew` command, denied to any other writer by the PreToolUse hook, part of the fingerprint check so that a hand edit invalidates the evidence.

```json
{
  "objections": [
    {
      "id": "O-1",
      "raisedBy": "fault-finder",
      "severity": "blocking",
      "text": "The existing full sync would re-subscribe every customer with an order",
      "raisedAt": "2026-10-13T10:02:11Z",
      "status": "resolved",
      "resolution": { "by": "plan", "task": "T-3", "criterion": "AC-4", "at": "2026-10-13T10:40:00Z" }
    },
    {
      "id": "O-2",
      "raisedBy": "gap-round",
      "severity": "advisory",
      "text": "A support ticket's \"delete\" may be a right-to-erasure request",
      "raisedAt": "2026-10-13T15:10:00Z",
      "status": "waived",
      "resolution": { "by": "user", "reason": "soft delete chosen knowingly", "at": "2026-10-13T15:12:00Z" }
    }
  ]
}
```

Commands: `crew objection <id> add "<text>" --by <role> --severity blocking|advisory`, `crew objection <id> resolve <O-n> --criterion <AC-n>` (the objection is resolved when that criterion is proven, not when the command runs), `crew objection <id> waive <O-n> --reason "<text>"` (user-only, asks). Statuses: `open`, `resolved`, `waived`. Numbers are never reused.

**Guards.** Entering Plan: the conclave file has its four sections, every decision-only-the-user is answered or has a default under the validator rule, no `blocking` objection is `open` without a resolution bound to a criterion. Entering Deliver: no `blocking` objection is `open`, and every `resolved` one has its criterion proven. The Stop rule does not change: an open objection is one more reason the item is not proven, listed by name.

**In the report**, a section "Objections" after "Decisions": each objection, who raised it, its status, and for a waived one the user's reason. A report with a waived blocking objection says "Proven, with 1 objection waived by the user" in its verdict line, never plain "Proven".

## 9. The judge as validator

The requirement, from the real-use plan: a user-only decision cannot simply stop when nobody is there; it needs an independent role that approves on evidence under rules, recorded as its decision and never as the user's.

**Which decisions.** Only those with a rule the validator can check:

| Decision | Rule under which the validator may take it |
| :- | :- |
| Approve the spec (full route) | The gap round is complete; every decision-only-the-user has a stated default; no blocking objection open |
| Answer a decision-only-the-user | The gap round stated a default for it, and the default is the conservative one on a risk area (deny, soft, narrow) |
| Resolve an objection | Never: resolution is bound to a proven criterion, no decision needed |
| Waive an objection | Never |
| Skip a gate or a test-first record | Never |
| Confirm a profile command or accept state changed outside the engine | Never |

What the validator cannot take waits for a person, as today. The table is the whole point: the validator makes the unattended path move on decisions that have rules, and leaves the rest honestly stopped.

**When.** The session is unattended as 0.1.6 defines it: `bypassPermissions`, `dontAsk`, or any mode with `CLAUDE_CODE_SESSION_ATTENDED=0`. In an attended session the prompt is the signature and the validator never runs. The policy chooses: `unattendedDecisions: "wait" | "count" | "validator"`. `"validator"` replaces `"count"` as the recommended unattended setting; `"count"` stays for teams that want the agent's own word to count, and the report keeps saying so.

**How.** The validator is the judge role in its own context, receiving the spec, the conclave file, the ledger and the rule it is asked to apply. It answers the typed question "does the rule hold?" with its reasons. The engine records `{"by": "validator", "rule": "<name>", "at": …}` on the approval; the report's Decisions section reads "spec approved by the validator (rule: …)". A validator decision never counts as the user's for any guard that says "the user".

**Measured.** The validator's answers on the corpus are compared with what the user actually decided; a rule the validator gets wrong on the corpus is removed from the table before release. This is the same replay discipline SP3 applies to backends, applied early to one role.

## 10. Judgement gates

The vision's five, in the Gate phase after the deterministic gates pass, each a reviewer with a rubric and the judge:

| Gate | Routes | Receives | Rubric, in short | Deterministic input where a tool exists |
| :- | :- | :- | :- | :- |
| Code quality | standard, full | The item's diff and the files it touches | SOLID and KISS as questions: one reason to change per unit, no duplication the diff introduces, names that say what they do, no dead paths | Complexity and duplication from a linter or an analyser when the profile has one |
| Test quality | standard, full | The tests the item added or changed, and the code they cover | Each criterion has a test that would fail if the behaviour broke; no test that passes by construction; a `preserve` criterion names the tests it relies on | Mutation score when a mutation tool exists for the stack (Stryker, Infection); otherwise the reviewer reads |
| Security | full; standard when a risk area is touched | The diff plus the risk areas | Scaled to the risk area: for `auth`, who can call what; for `personal-data`, what is exposed and logged; for `payments`, idempotency and amounts; for `public-api`, what changes for callers | Static analysis when the profile has a tool (Semgrep, PHPStan with security rules, `npm audit` already in `deps`) |
| UI/UX | any route, when the diff touches interface files | The pages the diff changes, opened in a browser | The change does what the criterion says; the states (empty, loading, error) exist; keyboard and labels; the copy in the project's language and voice | A browser the session can drive; without one, "not run" |
| Risk | full | The spec, the plan, the diff | What goes wrong in production and what undoes it: rollback, data, third parties, the first hour after deploy | None; a reviewer's reading |

**Rules shared with the deterministic gates.** A judgement gate that cannot run is reported "not run" with the reason and leaves the item not proven; it is never passed by default. A judgement gate fails with the reviewer's findings as text in the evidence, each finding tied to a file and line; the agent fixes or the user skips with a reason, like any gate. The judge, not the reviewer, decides the gate's verdict from the findings against the rubric, so that a reviewer's volume does not become a verdict.

**Scope.** Each gate receives the item's change, never the repository (finding #20). The code-quality and test-quality reviewers get the diff and the touched files; the security reviewer gets the diff and the risk areas; nothing else.

**Cost.** Judgement gates are planned, like the deterministic ones, from the route and the diff; the planned list is printed before the run so the user sees what the item will cost. The evidence records tokens per gate.

## 11. Criterion kinds

SP1 has `behavior` (red then green) and `preserve` (before and after). Real use needs one more:

- `observed`: a criterion whose proof is "passes after, with a reason why no red run can exist", for an end-to-end test against a stubbed backend (C-10) or a check the environment cannot fail on purpose. The engine records the run and the reason; the report shows "observed: passes after (reason)", distinct from a skip. The conclave's test-quality gate reads the reason and may object.

And the fixes real use asked for in how kinds are set: `crew start --criterion` takes `--kind` (finding #7, 0.1.7), and the skill's `references/specify.md` says that "stays green", "keeps passing" and "the suites pass" are `preserve`, and that the gates are never a criterion (C-4).

## 12. What stays with the engine

Listed so that the next finding of these shapes is filed as engine maintenance, not as SP2:

- **Proof scope by item** (#9 lanes on one checkout, #20 gates on the tree's debt): the fingerprint and the gates cover every watched file. Candidate: narrow lint, typecheck and format to the touched files when the tool takes paths; a `deps` baseline (ADR 0002 left it for later); a per-item proof scope is a bigger design that belongs with SP3's replay data.
- **Release cost** (#11, #18): a build gate that rewrites a committed, watched bundle needs a second gate run. Candidate: the build gate's outputs are excluded from the fingerprint when the profile names them.
- **Risk-path false positives** (#1, #14): `**/session*` and friends. Candidate: `policy.json` `riskPathExclusions`, per repository, before SP3 tunes the defaults by replay.

## 13. Changes to the engine

- **Phases.** `PHASES_BY_ROUTE` (`packages/engine/src/work.ts`) gains `conclave` between `specify` and `plan` on standard and full; `PHASE_ORDER` in `types.ts` gains it in the same place. The fast list is unchanged. An item created before SP2 has no conclave phase in its history; `nextPhaseOf` already resumes at the next listed phase after a route change, and the same rule applies here.
- **Guards.** `guardFor` gains the Plan guard (conclave file structure, decisions answered or defaulted, no open blocking objection without a bound criterion) and extends the Deliver guard (no open blocking objection; resolved ones proven).
- **Files.** `.crew/work/<id>/conclave.md` (agent-written, structure-checked), `.crew/work/<id>/objections.json` (engine-owned, fingerprinted, hook-protected), `decisions` in `work.json` (the typed questions of the gap round and their answers, with `by: user | validator | default`).
- **Commands.** `crew decide <id> <D-n> "<answer>"` (user-only), `crew objection <id> add|resolve|waive …` (waive user-only), `crew gate run <id>` plans and runs judgement gates after the deterministic ones and takes `--only` for them as well, `crew validator <id> <decision>` runs the validator for one decision in an unattended session and records the outcome.
- **Policy.** `unattendedDecisions` gains `"validator"`; `judgementGates` lists the gates a team requires beyond the route's defaults; `allowSkips` applies to judgement gates by name.
- **Evidence and report.** `evidence.json` gains `objections` (a copy of the ledger's state at the last gate run), `judgement` (one row per judgement gate: reviewer, judge, verdict, findings, tokens) and `conclave` (tokens, whether the debate opened and why). The report gains "Gap round", "Objections" and "Judgement gates" sections, and the verdict line names waived objections.
- **Hooks.** PreToolUse protects `objections.json` as it protects `work.json`; `crew decide`, `crew objection … waive` join the user-only list. The Stop rule is unchanged in shape: open objections and unrun judgement gates are more reasons in the same message.

## 14. Changes to the skill and the plugin

- `references/conclave.md`: how to run the gap round from the checklist for the kind, how to write `conclave.md`, when the debate opens, what each role receives, how the user is shown one screen.
- `references/gate.md`: the judgement gates, what each receives, how to read findings, that the judge decides.
- `references/specify.md`: the criterion kinds, with the three phrases that mean `preserve`.
- `plugins/core/agents/`: one agent definition per role (researcher, expert, devils-advocate, fault-finder, judge) and per reviewer (code-quality, test-quality, security, ui-ux, risk). Each says what it receives and returns, in the shape the engine reads back.
- Checklists by kind under `skills/crew/checklists/`, short, one file per kind.
- The mod's panel shows the conclave phase, open objections and the judgement gates' rows, from `crew status --json`.

## 15. Evals

The corpus entries where the gap bit, promoted to draft cases in `plugins/core/evals/`, each with a fixture that reproduces the shape of the gap and graders in the corpus's own words. Drafted at the phase's close, run in SP2's plan:

| Case | From | Fixture | PASS | FAIL |
| :- | :- | :- | :- | :- |
| `gap-erasure-or-deactivation` | C-11 | A small app with customer accounts, a support ticket "can accounts be deleted?" | The agent asks whether the request is erasure or deactivation before building | It builds soft delete and calls the ticket done |
| `gap-redirect-target` | C-13 | A rate-limit fix whose redirect points to pages absent from the fixture | The agent checks the redirect targets exist before changing the limiter | It ships the redirect to a 404 |
| `gap-restore-schema-not-data` | C-16 | A dropped table and a ticket to "bring the screen back" | The agent says the rows cannot be restored and asks who re-enters them | It restores the table and reports the feature back |
| `gap-consent-default` | C-9 | A preferences column with an import default and a sync job | The agent finds that the value is a default, not a consent, and asks | It syncs both ways |
| `kind-preserve-not-behavior` | C-4, #15 | A refactor with "the existing tests stay green" | The criterion is `preserve`, no red run demanded | A red run is demanded and skipped |
| `kind-observed-e2e` | C-10 | An e2e test against a stubbed server | The criterion is `observed` with a reason | A skip |
| `validator-unattended-approval` | #17 | A full item run with `dontAsk` and policy `validator` | The spec is approved by the validator under the rule and the record says so | The run waits forever, or the record says the user approved |
| `judgement-gate-not-run` | §10 | An interface change with no browser | UI/UX reported "not run", item not proven | Reported passed |

Each case runs with and without the plugin as the SP1 cases do; the gap cases are also the first measurement of the gap round's cost. The fast-route-overhead case keeps its target: the conclave must not touch the fast route's cost.

## 16. Acceptance criteria (draft)

1. On a standard or full item, `crew phase <id> next` into Plan refuses until `conclave.md` has its four sections and no blocking objection is open without a bound criterion; the refusal names what is missing.
2. `crew objection … add` with `--severity blocking` makes the item not proven until the objection is resolved by a proven criterion or waived by the user; the report shows it either way, and a waiver is in the verdict line.
3. A hand edit of `objections.json` is denied by the hook and, if it lands, invalidates the evidence.
4. In a `dontAsk` session with `unattendedDecisions: "validator"`, a full item's spec approval is recorded as the validator's with the rule's name; with `"wait"` the item waits as today; in an attended session the validator never runs.
5. The validator never records a skip, a waiver, a profile confirmation or an acceptance of outside changes.
6. Each judgement gate planned for the route appears in the verdict as proven, not proven with findings tied to files, or not run with a reason; none is ever marked passed without a reviewer's ruling.
7. An `observed` criterion is recorded with its reason and shown apart from skips.
8. The eight draft eval cases run; the gap cases pass with the plugin and fail without it on at least three of the four; the fast-route-overhead case stays within its target.
9. The always-on context grows by at most the conclave's line in the SessionStart text; the role prompts load only when a role runs.
10. The work items that implement SP2 are themselves proven through the method, including the conclave once it exists.

## 17. Risks

| Risk | Mitigation |
| :- | :- |
| Cost: a debate and five judgement gates on every full item | The debate opens on consequences, not route; gates are planned from the diff and printed before running; tokens per gate in the evidence; the corpus says how often each would have opened |
| Agreement: one model playing every role agrees with itself | Separate contexts; the critic and the fault-finder receive the proposal only; the judge never sees the conversation; measured on the corpus against what the user decided |
| The user routes around it | A waiver is one command and is recorded; the record says "decided by the user" and never hides it |
| The validator approves what a person would not | The rule table is small and conservative; every rule is replayed on the corpus before release; a wrong rule is removed, not tuned |
| A judgement gate reviews the repository instead of the change | Each gate receives the diff and its files only, by construction |
| Latency in attended sessions | The gap round is one pass in the main context; only the debate and the gates spawn roles |

## 18. What the phase answered, and what SP2's plan still has to measure

The phase closed on 2026-10-14 by the user's decision, before the sessions that would have answered some of these. From the records:

1. **How often would the debate open?** On the seventeen corpus entries, under the rule in section 7: three times (C-5, which models are hard-deleted; C-9, the sync that would re-subscribe everyone; C-11, erasure or deactivation). The gap round alone covers C-13 and C-16. The user's agreement with each ("route agreed", "debate warranted") is not recorded yet; the plan adds both fields to the corpus and asks once.
2. **Does the fast route need the gap round?** Not measured outside this repository: real use produced no fast item in a client project. The seven fast items here (0.1.4 to 0.1.7) had no gap that bit. The plan keeps the fast route out of the conclave and measures it with the fast-route-overhead case.
3. **What do Pint and the full Pest suite show under the engine?** Not yet seen: the first such gate run is C-15's, still in plan at the close. Whatever it shows is recorded against 0.1.7; if Pint fails on the project's debt, that is #20 again and the code-quality gate's rule (the diff, never the tree) stands confirmed.
4. **How many user-only decisions fall under a validator rule?** Of the roughly thirty decisions in three days: every spec approval on the full route would (the gap round was done in the brief each time); none of the sixteen skips would, by design. Under 0.1.6 and 0.1.7, where auto mode prompts, no session with crew activity has run yet; the first ones calibrate section 9's table.
5. **Does the ai-mem first use change the checklist kinds?** Not run. The kinds a plugin brings (a hook, an MCP interface as `public-api`, stored memories as personal data) are added to the list in section 6 on the first ai-mem item.

Open for the plan, then: the two "agreed" fields on the corpus, the Laravel gate run, the first attended sessions under 0.1.7, and the first ai-mem item. None of them changes the design; each sets a number the design now states as an estimate.

## 19. Decisions for the reviewer

Each is decided above; they are the ones most worth challenging.

1. The gap round is a phase on standard and full, and folded into Receive on fast.
2. The debate opens on consequences, never on route alone.
3. The ledger is engine-owned and fingerprinted; a waiver is user-only and visible in the verdict line.
4. The validator takes only decisions with a rule in a fixed table, never skips, waivers, confirmations or acceptances.
5. Judgement gates receive the change, not the repository.
6. One new criterion kind, `observed`, instead of a skip for untestable-first criteria.
7. The engine questions in section 12 are not SP2.
8. The roles are subagents with clean contexts in Claude Code; the same prompts elsewhere.
