# Real use of SP1, before SP2

- Started: 2026-10-13. Closed on 2026-10-14 by the user's decision, with the coverage line of the exit criterion short: [the summary](2026-10-14-summary.md) says what was met, what was not, and what carries into SP2.
- Plugin under use: `wizardingcode-developer-crew` 0.1.7 since 2026-10-14 (0.1.5 and 0.1.6 earlier the same day), installed at user scope from the marketplace. The user started using the plugin in the other projects on 2026-10-12, the day it was released, so the sessions of that day ran 0.1.0 to 0.1.3 as each was installed and the sessions of 2026-10-13 ran 0.1.4. The working tree's copy is not loaded in the other projects (two copies load both their hooks, and the first mod to register `/crew` wins).
- Records in this folder: this plan, [`findings.md`](findings.md) (what got in the way, was wrong, or stayed silent) and [`corpus.md`](corpus.md) (the real requests and the gaps a good engineer would have raised). A closing summary joins them when the phase ends.

## Second phase: SP2 in real use (0.4.0, from 2026-10-15)

ADR 0004 asks for one phase of real use of SP2 before 1.0, on the same projects, with the findings fixed in one release at the close. It started on 2026-10-15 with the first standard item in this repository under 0.4.0 (`2026-10-15-001-sp2b-review-minors-6-to-13-the-ruling-pa`, the deferred minors of the SP2b review), which ran the gap round from the checklists and the judgement gates for the first time. What this phase probes on purpose, from the SP2b plan's "After the last task": whether the Agent tool honours the roles' `model` (judge on fable, reviewers on sonnet, opus on the full route or a risk area); tokens and time per judgement gate as the evidence records them; any finding that reaches `ruling.json` without a file and a line; whether the gap round's checklists fit the kinds of change the projects bring. Findings continue in [`findings.md`](findings.md) from #24, with "against SP2b" in the heading or the date where it matters; the corpus keeps growing in [`corpus.md`](corpus.md). The exit is the one ADR 0004 names: a 1.0 release once the five projects have used SP2 for one phase and no `blocks` or `false-proof` finding is open.

### SP7a and SP7b in real use (0.6.0 and 0.7.0: after 0.11.0, ADR 0008)

[ADR 0008](../adr/0008-everything-before-the-next-real-use.md) (2026-10-18, the user's decision) supersedes the exit of the paragraph below: SP7b was built and released as 0.7.0 on the same day, with no real use between, and SP3, SP8, SP4 and SP6 follow it back to back (0.8.0 to 0.11.0). The real-use phase of this README runs after 0.11.0, on everything at once: the same three workspaces, ten items across the routes, the findings from #67 in `findings.md`, one release at the close, 1.0 cut from it under the exit criterion below. Until then the only checks are each subproject's evals (its new cases and `fast-route-overhead`, run with `--case`; the whole suite once before the phase) and the leads' validations on every task. What 0.7.0 adds to what the phase will measure: the environment started and stopped by the engine around the e2e gate, with the console and the logs graded as data; a request's priority confirmed or lowered on record; threads and the contracts a reply carries, checked at the branch's tip; a todo gated only when its planned judgements are proven; the standing grant `team.continuations: granted` in place of the user's yes per round (finding 57); `crew workspace status` as the one view of the workspace.

#### SP7a in real use, as planned before ADR 0008 (0.6.0, from the restart)

With 0.6.0 the phase gains the team: the seats the engine plans per route, the tech leads' validations of the spec and of the delivery, the gate and the brief per todo, the decision register, the rounds' caps and the mod's todo and working views. The first real use is in three workspaces of the user's (two clients' and the brand's own, unnamed here): ten items across the three routes, each recorded with the seats printed by `crew team <id>` against the roles that ran; each lead's verdict on the spec and on the delivery, and whether a return was right (a change the item needed) or a cost (a return the spec already answered); the judgement, validation and gate rounds spent, and every `crew continue`; the todo gates' time against the item's final gate run; the overhead on fast items against 2.03× (`bun scripts/eval-overhead.ts` over the run, or the tokens of a real fast item against the same change without the plugin); and the cost per item from `crew metrics --json`. A doubt from a lead that the spec cannot answer waits for the user (finding 57 says what the caps cost the user in Task 6 and Task 7; the policy's standing grant is SP7b's). What gets in the way is a finding from #48 in `findings.md`; nothing is fixed per finding, one release at the close (0.6.x only for a `blocks` or `false-proof` finding, ADR 0004). Exit (ADR 0007 §6): ten items or two weeks, whichever comes first, then the SP7b plan; 0.7.0 after this phase, 1.0 after 0.7.0's.

### SP2c in real use (0.5.0, from the restart)

With 0.5.0 the phase gains the mail between agents inside one workspace and the team of an item. The first real use is in the user's own projects: two of them declare the same workspace (`crew policy set mail.workspace <name>` in each, the user's yes relayed once per project), the first question goes from one to the other and is answered by a read-only session the engine opens there, and the first task of an item goes to an implementer in a worktree whose branch the lead merges. What to record, per exchange: when the opener started and what it said (`live session: ring it`, `opened`, `refused`), the opened session's turns, minutes and cost (`crew mail status`), whether `mail.maxTurns` 40 and `mail.maxMinutes` 30 fit a question and a change request, whether the doorbell was needed or the next prompt was soon enough, every refusal and its reason, whether the SubagentStop hook's files matched what the session would have saved, and whether a `role` wait ever ended a turn the judge then finished a moment later. What gets in the way is a finding here against SP2c. The SP2c eval run of 2026-10-17 (`docs/evals/2026-10-17-sp2c-results.md`) left the debt the release does not fix, open in this file: #33 (the fast-route overhead at 1.99×), #34 (the gap round does not ask whether a redirect's target exists), #37 (the eval sandbox denies a local port), #40 (a one-spot change on the standard route; the judge's ruling not filed by the hook inside the sandbox), #43 (a merged task's worktree kept for the engine's own files), and the advisories of Tasks 4 to 7 (#30 to #32 and Task 7's ruling).

## Why

The roadmap (`docs/vision.md` §16) says each subproject is used on real projects before the next begins. SP1 was proven on this repository, a toy sandbox and two eval fixtures, all Node or Makefile. The phase has two jobs:

1. **Show that SP1 holds outside this repository.** Other stacks, other gates, a first use in a repository with no `.crew/`, an interactive session with a person present. What breaks is fixed and released as 0.1.x.
2. **Collect the corpus that measures the conclave.** `docs/vision.md` §15 asks for a corpus of vague requests, each with the gaps a good engineer would raise. Every real request made during the phase is an entry. SP2 (the conclave) is designed against it.

## Projects

| Project | Stack | Why it is here |
| :- | :- | :- |
| ai-mem | Node, Bun, a Claude Code plugin | The sibling plugin, the most frequently touched repository. Closest in shape to this one, so it brings less new information but the most items |
| A Laravel application (a client's; not named here) | PHP, Composer, Laravel, with a Bun-built front end in the same repository | The SP1 design (`docs/specs/2026-10-06-sp1-engine-and-base-method-design.md`, the proof section) says PHP and Laravel are validated "by real use on WizardingCode projects". No record shows that it happened |
| A storefront (a client's; not named here) | Node, pnpm, Nuxt, Vitest | Joined on 2026-10-13 by the user's own choice, when a CRM fix (C-13) needed pages on the storefront side (C-14). A Node project unlike this one: two lockfiles, a two-part test command |
| A second client web application (not named here) | PHP, Laravel, with an npm front end in the same repository | Joined on 2026-10-13 by the user's own choice (C-16, the item of finding #19). Outside the coverage grid: its items feed the findings and the corpus |
| The e-commerce product (WizardingCode's own) | PHP, Laravel, with a Bun front end in the same repository | Joined on 2026-10-14 by the user's own choice (C-17). Outside the coverage grid, as above |

This repository is public. The clients' projects are called "the Laravel project", "the storefront" and "the client's web application" in every record, WizardingCode's own product "the e-commerce product", their requests are paraphrased with the domain replaced, and no path, name or data of the clients is copied.

## What the SP1 records admit is not validated

These are the things the phase must probe on purpose, not just stumble on:

- **PHP and Laravel detection and gates.** Composer scripts, Pest or PHPUnit, Pint, PHPStan or Larastan when present, `composer audit`, targets when there is more than one manifest.
- **Risk paths.** The defaults (`DEFAULT_RISK_PATHS` in `packages/engine/src/classify.ts`) already produced a false positive here: `**/session*` matched `plugins/core/hooks/session-start.ts` and raised a workspace-coverage and docs item to the full route. In a Laravel application `auth`, `payment` and `session` paths are everywhere; the question is how often the full route fires and whether the user agrees each time.
- **Fast-route overhead.** Measured at 1.7 to 1.9 times the baseline cost, "at the revised target's edge" (`docs/evals/2026-10-12-sp1b-results.md`). Real use says whether it is felt.
- **First use in a repository without `.crew/`.** ai-mem has none: `crew detect`, the proposed commands, `crew profile confirm`, the watch list defaults.
- **Interactive paths never measured headlessly.** The accepted skip, the `PermissionRequest` path, the mod's `/crew` and `/crew panel`.
- **User-only decisions when no person is watching.** The hook answers "ask" for `crew approve`, `skip`, `profile confirm`, `accept` and `policy accept`. On 2026-10-12, in auto mode, `crew approve` ran with no prompt shown (finding 3). Count how often these decisions come up in each project and in which permission mode the session ran.
- **Left out of SP1c on purpose.** No CLI to edit the watch list (hand edit plus `crew accept profile`); a workspace root without a test script, whose members all have one, is still reported as missing; workspaces are Node only and link members of the same stack only. These are fixed only if real use hits them.

## How a session goes

**First session in each project.** Only the installed plugin loaded. `crew detect`, read the proposed profile, `crew profile confirm`, read the watch list. Every friction of the first use is a finding, including "none".

**Every item.** The work goes through the crew method as the skill drives it. When the item is delivered (or abandoned), two things are written in this repository:

- an entry in `corpus.md`: the request, cleaned, and the four gap-round lists filled in hindsight;
- a finding in `findings.md` for anything that blocked wrongly, proved falsely, detected wrongly, routed against the user's judgement, cost too much, or stayed silent when it should have spoken. The evidence path (`.crew/work/<id>/`) is the pointer; the evidence stays in the project.

The wizardingcode-mem notes that each session saves are the raw capture; these two files are the consolidation. `crew status --json` and `crew evidence <id>` in each project give the state of every item without new tooling.

**Triage, weekly or at the first `blocks` or `false-proof`.** Each finding of those two categories becomes a work item here, fixed through the crew method and released as 0.1.x by the process in `CLAUDE.md`. `detect` and `route` findings are fixed when cheap. `friction` and `silent` feed SP2's design unless they block.

**From 2026-10-14: one release, at the close.** Six releases in three days (0.1.0 to 0.1.6), each for one or two findings, cost more than they returned: two gate runs, six version files, a marketplace commit and a restart each time. From that date a finding is recorded when it appears and fixed in 0.1.7, the single release that closes the phase (#7, #9 and whatever the remaining sessions bring), unless a `blocks` or `false-proof` finding stops one of those sessions. The records are brought up to date in two passes, by reading each project's `.crew/work/` from this repository: one on 2026-10-14, one at the close.

**A requirement carried into SP2, stated by the user on 2026-10-12.** The crew is hybrid: a person present, or a team of agents running 24 hours unattended. So a user-only decision cannot simply stop when nobody is there; it needs a validator, an independent role that approves on evidence under rules, recorded as the validator's decision and never as the user's. The conclave's judge is the natural candidate. Any 0.1.x fix for finding 3 keeps the record honest without closing the unattended path.

**Closing the phase.** A summary record in this folder: the exit-criterion table with actuals, the findings by category and outcome, and the corpus entries where the gap bit, promoted to draft eval cases for SP2. The status line of `docs/vision.md` is updated. The SP2 spec is drafted in parallel from 2026-10-14, by the user's decision, so that the remaining sessions and the design do not wait for each other; it leaves draft only with the summary.

## Finding categories

| Category | Meaning |
| :- | :- |
| `blocks` | The engine stopped the user without reason: a hook denial, a Stop block, an "unproven" that was not |
| `false-proof` | Proven when it should not have been. The worst kind |
| `detect` | The profile was wrong or incomplete: gates, targets, workspaces, watch list |
| `route` | A route decision the user did not agree with: risk paths, classification |
| `friction` | Overhead, repeated prompts, the mod, the skill's wording |
| `silent` | Something should have been raised and was not. SP2 material |
| `docs` | The README or the skill misled |

## Exit criterion

| Dimension | Target |
| :- | :- |
| Coverage | In each project, at least one item delivered on each route (fast, standard, full), with evidence on disk |
| Laravel | Profile detected and confirmed with real gates; at least one item proven with Pest or PHPUnit actually running |
| Quality | No `blocks` or `false-proof` finding open: each one fixed and released as 0.1.x |
| Corpus | At least 10 entries, at least 3 of them where the gap actually bit later. Those become the first SP2 eval cases |
| Time | 2026-10-13 to 2026-10-26. If coverage is short on that date, the summary says what is missing and the user decides whether SP2 opens anyway |

### Actuals on 2026-10-14

Read from each project's `.crew/work/*/work.json` and `evidence.json`; the user confirmed on 2026-10-14 that the grid stays as written.

| Project | fast | standard | full |
| :- | :- | :- | :- |
| ai-mem | missing | missing | missing |
| the Laravel project | missing | 2 proven (C-7, C-13); 2 not proven by the deps gate (C-10, C-12) | 9 proven; C-15 in plan |
| the storefront | missing | missing | 1 proven and delivered (C-14) |

- Coverage: six cells missing, all fast or ai-mem. Real use never produced a fast item; one needs a fix or chore in one spot, a clear request and no risk area by answers or by paths.
- Laravel: not yet. No proven item has had `vendor/bin/pest` and `vendor/bin/pint --test` run by the engine; the first gate run under 0.1.5 or later is C-15's.
- Quality: met with 0.1.7 (#9 fixed; #1, #7 and #14 with it).
- Corpus: 17 entries, 4 where the gap bit on the record (C-4, C-10, C-11, C-13); met.
- The remaining sessions, in the order that pays most: ai-mem fast (the first use without `.crew/`), ai-mem standard, ai-mem full, the Laravel gate run of C-15, a Laravel fast, a storefront standard, a storefront fast.
