---
name: crew
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

The route (fast, standard or full) is chosen by the engine from your answers and from the files the change touches. Read the reference for the current phase before acting in it:

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
4. **Three commands ask the user:** `crew skip`, `crew approve` and `crew profile confirm`. Run them when the user has decided; the permission prompt is the user's signature.
5. **When you need the user,** mark the work with `crew await <id> user`, ask, and `crew resume <id>` when the answer comes.
6. **Start every change with `crew start`.** Changes without a work item cannot be proven.

`crew status` tells you where the work stands at any time.
