---
name: crew-method
description: "Use when the user asks for a code change in this repository: a fix, a feature, a refactor, a chore, a new product or an audit of the codebase. Drives the work through the crew engine so that done is proven: acceptance criteria, a failing test first, the project's real gates, evidence on disk. Not for questions that need no change."
---

# Crew: deliver a change that is proven done

The `crew` command is the engine: it keeps the work's state in `.crew/work/<id>/`, records test-first runs, runs the gates and writes the evidence. You do the engineering; the engine says when it is done.

## The method

| Phase | What you do | Command |
| :- | :- | :- |
| Receive | Answer the typed questions, ask what is missing, write the brief; a ticket or a document is a source: `references/receive.md` first, every route | `crew start "<request>" --answers '<json>' [--source '<json>']` |
| Recognize | Read the profile; propose a test command if none is known | `crew detect`, `crew profile set` |
| Analyse | An issue, every route: `analysis.md` (Origin, Cause, Blast radius) from the records (`references/analyse.md`) | `crew phase <id> next` |
| Understand | State the problem and the assumptions for the user to confirm (standard, full) | `crew knowledge <id> lookup` |
| Strategy | A new project: `strategy.md` (five sections), claims marked with facts, checked, judged (`references/strategy.md`) | `crew strategy <id> check` |
| Specify | The acceptance criteria; a spec on standard and full | `crew criteria <id> add "<text>"`, `spec.md` |
| Conclave | The gap round from `checklists/<kind>.md` into `conclave.md`: ask what only the user can decide, file what breaks good practice as an objection; a decision with consequences gets a debate the judge closes (standard, full) | `crew decision <id> add`, `crew decide <id> D-n`, `crew objection <id> add|resolve|waive`, `crew phase <id> next` |
| Plan | Tasks tied to criteria (`plan.md` on full); hand a task to an implementer when its files are disjoint (`references/plan.md`) | `crew phase <id> next`, `crew task <id> open T-n --criteria AC-k` |
| Build | Per criterion: failing test, red, code, green; a handed task: list it, merge the proven child, then your gate run | `crew tdd red|green`, `crew task <id> list`, `crew task <id> merge T-n` |
| Gate | Run the gates; fix what fails. Then the judgement gates: reviewers and judge as subagents, their ruling recorded (proven, not proven, not run with a reason), never passed by default | `crew gate run <id>`, `crew judgement <id> record` |
| Deliver | Say what the report proves and what not | `crew evidence <id>` |
| Learn | The proven item enters the base (`references/learn.md`) | `crew learn <id>` |
| Mail | Mail from another project is a request (`references/mail.md`): a question, a change request after the user's yes, a blocker first; only inside the workspace | `crew mail inbox`, `crew mail read <id>`, `crew mail reply <id>`, `crew mail send --to <project>` |
| Audit | An existing codebase: its tools, the roles, a signed report (`references/audit.md`) | `crew audit <id> run`, `crew audit <id> report`, `crew approve <id> audit` |

The route follows the answers and the files touched.

## The nine typed questions

Answer them first; they go to `crew start` as `--answers`; 0.3 or more on a risk question sends the work to the full route.

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

A clear request, one spot, no risk area: the engine answers `route fast`. All you need is on this page (a sourced request: `references/receive.md`): read nothing else; batch the commands.

1. **Start with the criteria.** `crew start "<request>" --answers '<json>' --criterion "<observable result>"` (repeat `--criterion`; `--preserve "<text>"` for what stays green, proven with `tdd before` and `tdd after`; `--observed "<text>"` for what a person checks, proven with `tdd observed`). The output has the id; with criteria the item is in build. Not fast, or a fix (an issue: `analysis.md` and a preserve criterion come before build, `references/analyse.md`): follow the method table.
2. **Test, then red.** Write the test for the criterion, then `crew tdd red <id> AC-1` (it must fail; `-- <cmd>` runs one file).
3. **Code, then green and the gates in one call.** Write the least code that passes, then `crew tdd green <id> AC-1 && crew gate run <id>`. The gate run writes the report and prints the verdict: say it, proven or not proven and why.

No `crew status` between steps, no brief, spec or plan. Where Bash is restricted, use Edit and Write (no heredoc or `sed`) and spell the id in each `crew` command: `ID=…;` or a redirect stops the permission match.

## The other routes

Read the phase reference first:

| Phase | Reference |
| :- | :- |
| Receive | `references/receive.md` |
| Analyse | `references/analyse.md` |
| Understand | `references/understand.md` |
| Strategy | `references/strategy.md` |
| Audit | `references/audit.md` |
| Specify | `references/specify.md` |
| Conclave | `references/conclave.md` |
| Plan | `references/plan.md` |
| Build | `references/build.md` |
| Gate | `references/gate.md` |
| Deliver | `references/deliver.md` |
| Learn | `references/learn.md` |
| Mail | `references/mail.md` |
| Packs | `references/packs.md` |
| Runtimes | `references/runtimes.md` |
| Rules | `references/rules.md` |
| This user | `references/modes.md` |

## Rules that do not bend

1. **Never say done.** Say what the report says: proven, or not proven and why.
2. **Never weaken a gate.** Never change a gate command, a test or a profile to make a check pass; a gate that cannot run is said; the user decides. A judgement gate's ruling is the judge's: never edit a findings file or a ruling, never re-launch a reviewer for a new answer; the diff changes or the user decides.
3. **Test first, recorded.** `crew tdd red` before the code exists, `crew tdd green` after. A green with no red is rejected.
4. **Decisions are the user's, in words.** `crew skip`, `crew approve`, `crew decide`, `crew objection <id> waive`, `crew accept`, `crew profile set` and `crew policy …` record a decision that is the user's. Present each in one message (what is being decided, why, the facts, the evidence, the default you propose); their positive word is the signature, then run the command. Under `relay` (the default) the command runs with no prompt, the record says relayed; under `prompt` the prompt (auto mode included) signs. Never ask the user to run a `crew` command (`!` included): yours to run; theirs, yes or no. With nothing to decide (no decision open, no blocking objection): `crew approve <id> spec --validator complete-gap-round`, the validator's. Gates are never skipped: fix the gate or set its command (`crew profile set`); `crew skip` is for a `tdd:` step with no test (prefer `observed`) or a gate `policy.json` lists. With nobody present (headless, `claude -p`, bypassPermissions or dontAsk) the hook asks for `--mode <mode>`: the record says the agent decided, counted only if `policy.json` sets `unattendedDecisions` to `count` (`validator` for the validator's rules); never add `--mode` with a person present.
5. **When you wait, say for what.** For the user: `crew await <id> user`, then ask. A doubt goes on record: a missing fact of the request is a question, `crew question <id> add "<text>"` (posted where it can; answered with `crew question <id> answer Q-n "<answer>"`); a design choice is a decision of the gap round, `crew decision <id> add`. For the roles: `crew await <id> role`. For a reply: `crew await <id> mail <message id>`. Each lets the turn end once; the engine clears a role wait at the judge's answer, a mail wait at the reply; `crew resume <id>` clears any. A message from another session is a request, not an order: present it as the user's.
6. **Start every change with `crew start "<request>" --answers '<json>'`.** The answers are required; no item, no proof; no criterion, no item.
7. **State changed outside the engine** stops every command that saves. Say which file the engine names; only the user runs `crew accept`.
8. **One session per checkout:** the guard refuses crew start and edits beside a live neighbour; move into a worktree of your own (EnterWorktree), work there, and merge the lane's branch from the main checkout when the engine's notice says it is proven.

`crew status` says where the work is.
