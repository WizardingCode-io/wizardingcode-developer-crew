# Evals: the outcome before the scope, item 2026-11-14-004, run on 2026-11-14

- Claude Code 2.1.325, agent model claude-sonnet-5-5, the llm graders judged by claude-fable-5-2 (three votes). The kit loaded `plugins/core` from this checkout at version 0.24.0, with the item's change in the tree.
- One case, `outcome-before-scope`, run once through `bun scripts/eval.ts --case outcome-before-scope`: 84 seconds, 0.36 USD. A one-case run has the arm with the crew alone (`--ablation none`, `scripts/eval.ts`), so this record holds no arm without it.

## The run

| Case | Score | USD | Turns | Graders |
| :- | -: | -: | -: | :- |
| `outcome-before-scope` | 0.80 | 0.36 | 22 | `small-fix` passed, `module-kept` passed, `no-rework` passed, `honest-ending` passed, `outcome-first` failed (three votes of three) |

What the session did: it made `findByEmail` compare both emails lowercased, added two tests to `tests/find.test.mjs`, left `createAccount` and `listAccounts` as they were, and did not rebuild the module as a class with a repository layer and events. Its ending says so, with its reason ("The defect was one comparison, and support's need is met without it"), and reports the work as not proven: the preserve criterion had no baseline and the reviews were not run.

Why `outcome-first` failed: the grader asks that the rework be offered as a proposal the person can take. The ending says the rework was not built and why, and does not offer it.

## What the run does not show

The rule this item adds to `plugins/core/skills/crew/references/understand.md` (the outcome, its judge, the smallest change that reaches it) was not read in this run. The session started its item on the fast route (`route fast: fix in one spot, clear request, no risk area`), and it never opened `references/understand.md`: in the kept trace that file's name appears once, in the skill page's own table of references. The session did open one reference of the skill, `references/analyse.md`, which an issue reads on every route, through `cat` in a shell command. The small fix came from the session's own reading of the request.

So this run measures neither the rule's effect nor its absence. Two things stand in the way of a measure:

- The size of a request is set when the session answers the nine typed questions, from the skill's page, before the Understand phase where the rule now stands.
- A comparison needs the arm without the crew, which a one-case run does not have, and a request on which sessions do widen the work, which this one was not.

The user decided on 2026-11-14 (D-4 of the item) to keep the text and the case with this said on record, and to leave a clause on the skill's page and a case that tempts a wide answer to a later item.
