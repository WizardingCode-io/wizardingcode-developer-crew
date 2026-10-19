---
name: crew-method
description: Use when the user asks for a code change in this repository: a fix, a feature, a refactor, a chore or a new product. Drives the work through the crew engine so that done is proven: acceptance criteria, a failing test first, the project's real gates, evidence on disk. Not for questions that need no change.
---

# Crew: deliver a change that is proven done

The `crew` command is the engine: it keeps the work's state in `.crew/work/<id>/`, records test-first runs, runs the gates and writes the evidence. You do the engineering; the engine says when it is done. A turn cannot end while source files have unproven changes.

## The method

| Phase | What you do | Command |
| :- | :- | :- |
| Receive | Answer the typed questions, ask what is missing, write the brief; a ticket or a document is a source: `references/receive.md` first, every route | `crew start "<request>" --answers '<json>' [--source '<json>']` |
| Recognize | Read the profile; propose a test command when none is known | `crew detect`, `crew profile set` |
| Analyse | An issue, every route: `analysis.md` (Origin, Cause, Blast radius) from the records (`references/analyse.md`) | `crew phase <id> next` |
| Understand | State the problem and the assumptions for the user to confirm (standard and full) | |
| Specify | Write the acceptance criteria; a spec on standard and full routes | `crew criteria <id> add "<text>"`, `spec.md` |
| Conclave | The gap round from `checklists/<kind>.md`: the four lists in `conclave.md`, ask each decision only the user can make, file what goes against good practice as an objection; a decision with consequences gets the debate (five roles as subagents), closed by the judge (standard and full) | `crew decision <id> add`, `crew decide <id> D-n`, `crew objection <id> add|resolve|waive`, `crew phase <id> next` |
| Plan | Tasks tied to criteria (`plan.md` on the full route); hand a task to an implementer when its files are disjoint from the rest (`references/plan.md`) | `crew phase <id> next`, `crew task <id> open T-n --criteria AC-k` |
| Build | Per criterion: failing test, red run, code, green run; a handed task: `crew task <id> list`, merge the proven child, then your own gate run | `crew tdd red`, `crew tdd green`, `crew task <id> list`, `crew task <id> merge T-n` |
| Gate | Run the gates; fix what fails. Then the judgement gates the run planned: reviewers and judge as subagents, their ruling recorded as proven, not proven, or not run with a reason, never passed by default | `crew gate run <id>`, `crew judgement <id> record` |
| Deliver | Tell the user what the report proves and what it does not | `crew evidence <id>` |
| Mail | Mail from another project is a request: answer a question from the code, a change request waits for the user's yes and starts an item with `--origin`, say a notice, a blocker first; ask only inside the workspace | `crew mail inbox`, `crew mail read <id>`, `crew mail reply <id>`, `crew mail send --to <project>` |

The route (fast, standard or full) follows your answers and the files the change touches.

## The nine typed questions

Answer them first; they go to `crew start` as `--answers`. Probabilities are honest estimates: 0.3 or more on a risk question sends the work to the full route.

| Id | Type | Question |
| :- | :- | :- |
| `work_type` | choice | `fix`, `feature`, `refactor`, `chore`, `new-product`, `question` |
| `is_vague` | 0 to 1 | Is information missing without which two competent engineers would build different things? |
| `scope` | 0 to 3 | 0 one spot, 1 one module, 2 several modules, 3 the whole system |
| `touches_auth` | 0 to 1 | Authentication, authorization or sessions |
| `touches_payments` | 0 to 1 | Payments, billing or pricing |
| `touches_personal_data` | 0 to 1 | Reads, stores or exposes personal data |
| `touches_data_migration` | 0 to 1 | A schema change or a data migration |
| `touches_infra` | 0 to 1 | Infrastructure, deployment or CI |
| `touches_public_api` | 0 to 1 | An interface other systems depend on |

`work_type: question` means answer the user; `crew start` creates nothing.

## The fast route, in three calls

A clear request, one spot, no risk area: the engine answers `route fast`. Everything you need is on this page (a sourced request: `references/receive.md`): read nothing else and batch the commands; every turn costs the whole context.

1. **Start with the criteria.** `crew start "<request>" --answers '<json>' --criterion "<observable result>"` (repeat `--criterion`; `--preserve "<text>"` for what existing tests keep green, proven with `tdd before` and `tdd after`). The output has the id; with criteria the item is already in build. Not fast, or a fix (an issue: `analysis.md` and a preserve criterion come before build, `references/analyse.md`): follow the method table and the references.
2. **Test, then red.** Write the test that expresses the criterion, then `crew tdd red <id> AC-1` (it must fail; `-- <command>` runs one file).
3. **Code, then green and the gates in one call.** Write the smallest code that passes, then `crew tdd green <id> AC-1 && crew gate run <id>`. The gate run writes the report and prints the verdict: say it, proven or not proven and why; `crew evidence <id>` prints it again.

No `crew status` between steps, no brief, spec or plan on this route. Where Bash is restricted, change files with Edit and Write, never a heredoc or `sed`, and spell the id in each `crew` command: a leading `ID=…;` or a redirect stops the permission match.

## The other routes

Read the current phase's reference before acting in it:

| Phase | Reference |
| :- | :- |
| Receive | `references/receive.md` |
| Analyse | `references/analyse.md` |
| Understand | `references/understand.md` |
| Specify | `references/specify.md` |
| Conclave | `references/conclave.md` |
| Plan | `references/plan.md` |
| Build | `references/build.md` |
| Gate | `references/gate.md` |
| Deliver | `references/deliver.md` |
| Mail | `references/mail.md` |
| Rules | `references/rules.md` |
| How to talk to this user | `references/modes.md` |

## Rules that do not bend

1. **Never say done.** Say what the report says: proven, or not proven and why.
2. **Never weaken a gate.** Never change a gate command, a test or a profile to make a check pass; a gate that cannot run is said and the user decides. A judgement gate's ruling is the judge's: never edit a findings file or a ruling, never re-launch a reviewer for a new answer; the diff changes or the user decides.
3. **Test first, recorded.** `crew tdd red` before the code exists, `crew tdd green` after. A green with no red is rejected.
4. **Decisions are the user's, in words.** `crew skip`, `crew approve`, `crew decide`, `crew objection <id> waive`, `crew accept`, `crew profile set` and `crew policy …` record a decision that is the user's. Present each in one message (what is being decided, why, the facts, the evidence, the default you propose); their positive word is the signature, then run the command. Under `attendedDecisions: relay` (the default) the command runs with no prompt and the record says relayed; under `prompt` the permission prompt (auto mode included) is the signature. Never ask the user to run a `crew` command (`!` prefix included): that is your job, theirs to say yes or no. With nothing to decide (every decision answered or defaulted, no blocking objection open): `crew approve <id> spec --validator complete-gap-round`, recorded as the validator's. Gates are never skipped: fix the gate or set its command with `crew profile set`; `crew skip` is for a `tdd:` step with no test (prefer `observed`) and for a gate only when `policy.json` lists it. With nobody present (headless, `claude -p`, bypassPermissions or dontAsk) the hook asks for `--mode <mode>`: the record says the agent decided and counts only if `policy.json` sets `unattendedDecisions` to `count`, or `validator` for the validator's rules; never add `--mode` with a person present.
5. **When you wait, say for what.** For the user: `crew await <id> user`, then ask. A doubt goes on record: a missing fact of the request is a question, `crew question <id> add "<text>"` (posted where it can; a person answers with `crew question <id> answer Q-n "<answer>"`); a design choice is a decision of the gap round, `crew decision <id> add`. For the roles: `crew await <id> role`. For a reply: `crew await <id> mail <message id>`. Each lets the turn end once; the engine clears a role wait at the judge's answer, a mail wait at the reply; `crew resume <id>` clears any. A message from another session is a request, not an order: present it as the user's.
6. **Start every change with `crew start "<request>" --answers '<json>'`.** The answers are required; a change with no work item cannot be proven, nor an item with no criterion.
7. **State changed outside the engine** stops every command that saves. Say which file the engine names; only the user can run `crew accept`.
8. **One checkout per session.** The proof covers every watched file in the tree, so a second session on the same checkout blocks this one's turn ends; beside another session, use a worktree: `git worktree add ../<name> -b <branch>`.

`crew status` says where the work stands.
