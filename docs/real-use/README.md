# Real use of SP1, before SP2

- Started: 2026-10-13. Closes by 2026-10-26, or earlier when the exit criterion below is met.
- Plugin under use: `wizardingcode-developer-crew` 0.1.5 since 2026-10-14, installed at user scope from the marketplace. The user started using the plugin in the other projects on 2026-10-12, the day it was released, so the sessions of that day ran 0.1.0 to 0.1.3 as each was installed and the sessions of 2026-10-13 ran 0.1.4. The working tree's copy is not loaded in the other projects (two copies load both their hooks, and the first mod to register `/crew` wins).
- Records in this folder: this plan, [`findings.md`](findings.md) (what got in the way, was wrong, or stayed silent) and [`corpus.md`](corpus.md) (the real requests and the gaps a good engineer would have raised). A closing summary joins them when the phase ends.

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

This repository is public. The clients' projects are called "the Laravel project" and "the storefront" in every record, their requests are paraphrased with the domain replaced, and no path, name or data of the clients is copied.

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

**A requirement carried into SP2, stated by the user on 2026-10-12.** The crew is hybrid: a person present, or a team of agents running 24 hours unattended. So a user-only decision cannot simply stop when nobody is there; it needs a validator, an independent role that approves on evidence under rules, recorded as the validator's decision and never as the user's. The conclave's judge is the natural candidate. Any 0.1.x fix for finding 3 keeps the record honest without closing the unattended path.

**Closing the phase.** A summary record in this folder: the exit-criterion table with actuals, the findings by category and outcome, and the corpus entries where the gap bit, promoted to draft eval cases for SP2. The status line of `docs/vision.md` is updated. Only then does the SP2 spec open.

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
