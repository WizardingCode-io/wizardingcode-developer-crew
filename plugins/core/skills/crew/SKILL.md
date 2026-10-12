---
name: crew-method
description: Use when the user asks for a code change in this repository: a fix, a feature, a refactor, a chore or a new product. Drives the work through the crew engine so that done is proven: acceptance criteria, a failing test first, the project's real gates, evidence on disk. Not for questions that need no change.
---

# Crew: deliver a change that is proven done

The `crew` command is the engine. It knows the project's build, test and check commands, keeps the state of the work in `.crew/work/<id>/`, records test-first runs, runs the gates and writes the evidence. You do the engineering; the engine says when it is done. A turn cannot end while source files have unproven changes.

## The method

| Phase | What you do | Command |
| :- | :- | :- |
| Receive | Answer the typed questions about the request, ask the user what is missing, write the brief | `crew start "<request>" --answers '<json>'` |
| Recognize | Read the profile; propose a test command when none is known | `crew detect`, `crew profile set` |
| Understand | State the problem and the assumptions; the user confirms them (standard and full routes) | |
| Specify | Write the acceptance criteria; a spec on standard and full routes | `crew criteria <id> add "<text>"`, `spec.md` |
| Plan | Tasks tied to criteria (`plan.md` on the full route) | `crew phase <id> next` |
| Build | For each criterion: failing test, red run, code, green run | `crew tdd red`, `crew tdd green` |
| Gate | Run the gates; fix what fails | `crew gate run <id>` |
| Deliver | Write the report and tell the user what is proven and what is not | `crew evidence <id>` |

The route (fast, standard or full) is chosen by the engine from your answers and from the files the change touches.

## The nine typed questions

Answer them about the request before anything else; they go to `crew start` as `--answers`. Probabilities are honest estimates, not wishes: 0.3 or more on a risk question sends the work to the full route, the safe side.

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

A clear request, one spot, no risk area: the engine answers `route fast`. Everything you need is on this page; read no reference, and batch the commands, because every turn costs the user the whole context again.

1. **Start with the criteria.** `crew start "<request>" --answers '<json>' --criterion "<observable result>"` (repeat `--criterion` for each). The output has the id; with its criteria a fast-route item is already in the build phase. If the route is not fast, follow the method table and the references from here.
2. **Test, then red.** Write the test that expresses the criterion, then `crew tdd red <id> AC-1` (it must fail; `-- <command>` runs one file).
3. **Code, then green and the gates in one call.** Write the smallest code that passes, then `crew tdd green <id> AC-1 && crew gate run <id>`. The gate run moves the item on, writes the report and prints the verdict. Tell the user what it says: proven, or not proven and why. `crew evidence <id>` prints the report again when they ask for it.

No `crew status` between steps, no brief, no spec and no plan on the fast route.

Two habits that keep the calls from being refused where Bash is restricted: write and change files with the Edit and Write tools, never with a heredoc or `sed` through Bash; and spell the id out in each `crew` command rather than keeping it in a shell variable (a leading `ID=…;` or a redirect stops a command from matching its permission).

## The other routes

Read the reference for the current phase before acting in it:

| Phase | Reference |
| :- | :- |
| Receive | `references/receive.md` |
| Understand | `references/understand.md` |
| Specify | `references/specify.md` |
| Plan | `references/plan.md` |
| Build | `references/build.md` |
| Gate | `references/gate.md` |
| Deliver | `references/deliver.md` |
| How to talk to this user | `references/modes.md` |

## Rules that do not bend

1. **Never say done.** Say what the report says: proven, or not proven and why.
2. **Never weaken a gate.** Do not change a gate command, a test or a profile to make a check pass. If a gate cannot run, say so and let the user decide to skip it.
3. **Test first, recorded.** `crew tdd red` before the code exists, `crew tdd green` after. A green with no red is rejected.
4. **Some commands ask the user:** `crew skip`, `crew approve`, `crew accept`, `crew profile confirm`, `crew policy accept` and `crew profile set ... --force`. Run them when the user has decided; the permission prompt is the user's signature. When no person is watching (auto, bypassPermissions or dontAsk mode) the hook refuses the bare command and tells you to add `--mode <mode>`: the record then says the agent decided, in which mode, and the decision counts for the proof only if the team's `policy.json` sets `unattendedDecisions` to `count`. Never add `--mode` when a person is present; the hook refuses that too.
5. **When you need the user,** mark the work with `crew await <id> user` and ask. `await` lets the turn end once, with a notice that the work is not proven; the turn that ends spends it. `crew resume <id>` clears it without ending the turn.
6. **Start every change with `crew start "<request>" --answers '<json>'`.** The answers are required; changes without a work item cannot be proven, and an item without a criterion is never proven.
7. **State changed outside the engine** stops every command that saves. Tell the user which file the engine names; only they can run `crew accept`.

`crew status` tells you where the work stands at any time.
