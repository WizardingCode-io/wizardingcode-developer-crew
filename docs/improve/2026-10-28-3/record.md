# Improvement run 2026-10-28-3

- At: 2026-10-28T01:00:08.003Z
- Targets: unknown-stack, validator-unattended-approval
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-1)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| unknown-stack | 0.00, 0.67, 0.33 | 0.33 | 0.67 |
| validator-unattended-approval | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| jev-tightens-never-loosens | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. The failing figure for `unknown-stack` (Bash never called, the file unfixed) is the SP7a run of 2026-10-18 in which the sandbox denied Bash, a runner defect finding 64 closed on 2026-10-24, and no run has measured the case since. Under the current engine, though, the harness still led a headless lead to an ending that fails `needs-confirmation`: the Recognize row said only "propose a test command if none is known", rule 4 and the Gate page said that with nobody present every user-only command is re-run with `--mode`, and the engine's `crew profile set` reads no `--mode` and confirms a command as it sets it, so a lead who obeyed got a confirmed `make test`, a passing test gate, a "Proven" report and an ending with no "not proven", "unconfirmed" or "profile confirm", while the case's own intent is that the project stays unproven until the user confirms the command. The Recognize row now says the proposed command is never set with `--mode`, since the engine confirms as it sets, and that a set the hook stops stays proposed, with the gate's `unavailable` meaning not proven; the engine already supplies the rest (`crew tdd red` refuses with "pass -- <cmd>", `make test` is accepted after `--`, and the gate run prints `Not proven: gate test unavailable: no test command (crew profile set test "<cmd>")`, which step 3 tells the lead to say). The attempt at `crew profile set test "<cmd>"` is the Bash call `proposed-command` counts, the fix lands on `src/greet.sh`, and the verdict the lead repeats carries "not proven". Because the skill page sits at its 9254-byte cap, the row's 119 added bytes were paid for by trimming five unpinned sentences (the opening line, the full-route sentence, the fast route's "read nothing else" line, "No `crew status` between steps", and "`claude -p`" in rule 4) for a net loss of about 15 bytes; every pinned string I could find (the Recognize-to-Analyse row regex, "a sour
- Probe set: unknown-stack, validator-unattended-approval
- Gain: 0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| unknown-stack | 0.33, 0.33, 0.33 | 0.33 | 0.00 |
| validator-unattended-approval | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-2: inconclusive

- Diff: M plugins/core/skills/crew/references/build.md, M plugins/core/skills/crew/references/deliver.md, M plugins/core/skills/crew/references/gate.md
- Rationale: Nothing further is needed: the three harness edits are in place, no test pins the sentences they extend, and the memory note is indexed.

I changed three harness pages and nothing else: `plugins/core/skills/crew/references/build.md`, `plugins/core/skills/crew/references/gate.md` and `plugins/core/skills/crew/references/deliver.md`. The `unknown-stack` figure given here (mean 0.33, `Bash called 0x`, the file unfixed, no words in the ending) is the SP7a measurement of 2026-10-18, where the kit's sandbox denied Bash to two of three sessions (finding 64, closed in the runner on 2026-10-24) and the third run passed every grader; no run has measured the case since, so no fresh trace exists and the only honest target is the case's design: a Makefile-only project where `crew tdd red` answers `no test command`, the lead proposes the command on record with `crew profile set test "make test"` (with `--mode` when nobody is present, as rule 4 and the Gate page already allow) and ends saying the proof rests on a command the user has not confirmed. The harness as it stood left two holes that produce the SP2c failure shape (the fix landed, the command offered in prose, never proposed, `proposed-command` and `needs-confirmation` failing together): the Build page's `-- <command>` paragraph read as a way around a missing profile command, and nothing said what the ending carries when the agent set the command itself, since the engine writes such a command as `confirmed` in one step and the gate run prints a plain `Proven`. The Build paragraph now says `--` never stands in for an empty profile, that such a gate run ends `test (.): unavailable` (finding 36), and that the command is proposed first with `crew profile set test "<cmd>"`, relayed with a person present or run with `--mode <mode>` without one, then red, green and the gate run on it; the Gate page's "Unconfirmed command" bullet now covers a command the agent set with `--mode` as unconfirmed whatever the profile says, the ending 
- Probe set: jev-tightens-never-loosens, judgement-gate-not-run, pack-agentic-os-seats-the-team, proven-test-first, rounds-bounded, thread-with-contracts, unknown-stack, validator-unattended-approval
- Gain: 0.00

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 20.74 USD
- Exit status: 2
