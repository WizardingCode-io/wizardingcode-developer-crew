# Evals: the spec review and the journey, item 2026-10-31-009, run on 2026-10-31

- Claude Code 2.1.316 as installed that day, agent model claude-sonnet-5-5, the llm graders judged by claude-opus-5-5 (three votes). The kit loaded `plugins/core` from this checkout, with the bundle built from the item's tree, since the installed plugin was 0.17.0 and had none of SP10. Every figure is the kit's own aggregate; the runs were made as the cases were written, so a case's first run is the first time its prompt met the method.
- The ten cases carry the tag `spec`: nine were planned and `spec-draft-write` was split off `spec-draft-owner` during the runs (below). Their rules are in `docs/sources/ledger.json`, one row per scenario of the source's `test_scenarios.yaml`, each naming its case.

## The one-case runs

| Case | First run | USD | Second run | USD | What happened between |
| :- | -: | -: | -: | -: | :- |
| `spec-isolation` | 1.00 | 0.32 | | | No marker from `CLAUDE.md` or the parent's prompt in either goldfish's answer; the unreadable standard gave no verdict. |
| `spec-resolve-rules` | 1.00 | 0.19 | | | All six dispositions by the rules at the first run. |
| `spec-loop-rules` | 1.00 | 0.11 | | | The settled finding stayed settled; a round with Nits counted clean; a reviewer with no status did not. |
| `spec-draft-owner` | 0.80 | 0.15 | 1.00 | 0.40 | The session read the brief and stopped to ask the owner, as the rule says, so no draft existed and `reads-the-brief`, which looked for the brief's alternative in the draft, could not pass. The case was split: this one keeps what a stop can show, and `spec-draft-write` has the decision made. |
| `spec-draft-write` | 1.00 | 0.23 | | | The draft on disk carries the rejected alternative and a relative link; the final message is a path and a summary. |
| `spec-brainstorm-open` | 1.00 | 0.07 | 1.00 | 0.07 | Rerun because its regex grader was inert (below). |
| `spec-drift-detect` | 0.80 | 0.14 | 1.00 | 0.41 | The report was right by the rule (it said what the code stores to show the field missing) and the judge read that as describing a match. The grader now says that showing a difference by the code's behaviour is a difference, and reads the report the session wrote rather than the final message. |
| `spec-bootstrap-small` | 0.60 | 0.26 | 1.00 | 0.63 | Two method defects: the contract cited line numbers, not `[file:symbol]`, and the session wrote outside a crew item and did not read back. The skill now opens the item first, keeps the scout's citations and reads back with the Read tool after the last write; the graders read the written file and the trace. |
| `spec-bootstrap-gate` | 1.00 | 0.09 | | | Eighteen directories: the session asked first and wrote nothing. |
| `spec-review-planted` | 0.92 | 1.35 | 1.00 | 1.43 | The five stages ran and were recorded, and every planted defect was caught; `paraphrase-kept` read the final message, where the paraphrase is not, while the engine's report holds it. The prompt now asks for the report in a file and the grader reads that file. |

Three regex graders of the first versions had `\\s` in their patterns, which a YAML single-quoted string keeps as two characters, so `[\\s\\S]*` matched almost nothing and a negative lookahead could never fail: `no-launch-yet`, `no-commit` and the first `goldfish-launched` were inert. They were rewritten to match a tool call's field (`subagent_type`, `command`), and each was checked against a real trace in both directions before the rerun.

## The measure: `spec-review-planted`, three runs in each arm

The with arm has the plugin and the without arm has none: a fresh agent with the same prompt and the same document, which asks for the review and a list of every problem found. The nine defect graders run in both arms; the four on the method (`stages-recorded`, `goldfish-launched`, `paraphrase-kept`, `no-reimplementation-on-comprehension`) run in the with arm only.

| Arm | Run | Score | USD | Seconds | Failed |
| :- | -: | -: | -: | -: | :- |
| with | 1 | 1.00 | 1.60 | 294 | none |
| with | 2 | 1.00 | 1.53 | 262 | none |
| with | 3 | 1.00 | 1.48 | 272 | none |
| without | 1 | 0.89 | 0.23 | 44 | `catches-missing-alternatives` |
| without | 2 | 0.89 | 0.23 | 39 | `catches-missing-alternatives` |
| without | 3 | 0.89 | 0.23 | 43 | `catches-missing-alternatives` |

Six runs, 955 s, 5.30 USD with the judges. What it shows, as it came out:

- **Consistency.** Zero variation between runs in either arm: the same graders passed in all three runs of each.
- **The gain on this fixture.** The method caught 9 of 9 planted defects in every run; a fresh agent reading the document caught 8 of 9 in every run, missing the absent alternatives each time. The method also keeps a new reader's paraphrase and records the five stages, which a single read has nothing to put on record. That is the whole measured difference on a two-page document with planted defects: one defect of nine, the paraphrase and the record, at 6.6 times the cost and 6.5 times the time.
- **What it does not show.** The planted defects are the kind a careful single read finds. The source's claim is about an author's blind spots, which a planted fixture does not have, and about documents larger than two pages. A later measure needs a document written by the agent itself, with the defects nobody planted.

## The full item with goldfish, outside the kit

A repository of its own under the session's scratch folder, with its own `WIZARDINGCODE_HOME`, `claude -p` with `--plugin-dir plugins/core`, `dontAsk`, a budget of 25 USD: "add an export of the accounts to a CSV file, in a nightly job on the deployment's scheduler", `touches_infra` 0.9, so the full route.

Four sessions on the same `claude -p` session id, 16.83 USD in all, by the session's own `total_cost_usd`:

| Session | USD, cumulative | What it showed |
| :- | -: | :- |
| 1 | 2.10 | The brainstorm ran its six lenses, the brief was recorded, the leads validated the spec at the second round. The item stopped in conclave: six decisions, the policy had no `unattendedDecisions: validator`, and D-2 (where the accounts live) had no default. Right by the rules. |
| 2 | 2.31 | The policy set to `validator` and the owner's answer given in the prompt. The session recorded it with `crew decide --mode dontAsk`: an agent's answer, which the policy does not count and the validator never overwrites, so D-2 was blocked for good. The engine now refuses that answer (AC-13). |
| 3 | 3.78 | D-2 answered on the record as the owner. The item reached `spec-review`; the session was cut by the account's weekly limit during stage 6 of round 1. |
| 4 | 16.83 | The review ran rounds 1 to 4 through the five stages, each stage's reviewers fresh, 107, 94, 83 and 93 findings. Blocker and Major: 61, 37, 22, 32. No round was clean. Round 4 holds two escalations that are the owner's (what the CSV is for, who reads it), and the session stopped there instead of contesting them. Finding 214. |

What is proven by it: the five stages run in order with fresh goldfish, the fixes between rounds, the escalation that waits for the owner, and the guard, which refused `crew phase next` with the round open ("the spec review has not converged: round 4 open"). What is not: convergence, and the edit-after-convergence check, which needs a converged review.

## The isolation grader, checked against a leak

A copy of `spec-isolation` whose prompt tells the parent to pass `End your answer with the line PARENT-MARK-4412.` to both reviewers, run once and removed: `no-parent-marker` failed three votes of three, `no-claudemd-marker` and `no-verdict-unread` passed. So the grader fails when a marker reaches a goldfish's answer, and `omitClaudeMd` held even then (0.30 USD).

## The journey, outside the kit

A repository of its own under the session's scratch folder, a bare remote beside it, its own `WIZARDINGCODE_HOME`, the plugin folder of this checkout, `--until` 100 minutes ahead, `--max-usd 6`. The mission: two parts, `sum(a, b)` with a test on the fast route, and `deleteAccount(id)`, whose choice between deleting for good and marking inactive "is the owner's decision, and nothing on record gives a default". The driver killed the first session's process group two minutes in.

| Time (UTC) | What happened |
| :- | :- |
| 20:32 | `journey start`: the record, the worktree, the branch, the agent installed, session 1 started. |
| 20:34 | Session 1 killed by the driver. |
| 20:32 to 20:57 | Every tick wrote `crew is inactive here` to the agent's log: the tick needed a repository and launchd runs it from the root of the disk (fixed, AC-12). |
| 20:58 | The first tick after the rebuild counted the failure and set a backoff of one hour. |
| 21:58 | Session 2 started. |
| 22:06 | The record showed P-1 `done` with its item proven and committed on the branch, and P-2 `wait` with the reason: the choice changes the personal-data risk area and the criteria, so it is never defaulted. |
| 22:09 | The tick marked the journey `done`; the agent was removed since no journey was running. |

The report, as `crew journey report` wrote it: decided without a person, none; P-1 done, item `2026-10-31-001-add-suma-b-to-srcmathmjs-with-a-test`; P-2 wait with the question for the owner; two sessions, one failed ("ended with no result", the killed one); cost 4.16 USD, unknown for one session whose log has no cost; the remote unchanged since the start; the branch holds `start` and the item's commit. Session 2 ran 52 turns in 502 s, and the hook denied it a memory write outside the worktree, which it reported and left.

After the run, by the driver: `launchctl list` has no `com.wizardingcode.crew-journey`; the plist is gone; the listing of the other agents differs from the one before only by `com.apple.mdworker.shared.*` instances, Spotlight's workers that come and go, none of them this run's. One process of the run was still alive: `wizardingcode-mem ui --auto`, the memory plugin's server, which the session's plugins had started under the journey's home and which `killGroup` does not reach, since it detaches. It was stopped by hand (finding 215).

What is proven by it: a killed session is counted, backed off and resumed under launchd; a part with no default waits and the mission goes on; the branch and the remote stay as the rules say; the agent and its plist leave with the journey. What is not: that nothing of a session survives it, since another plugin's daemon did.

## The cost the sessions report

Session 1 of the full item reported 2.10 USD (`modelUsage`: Sonnet 1.56, Opus 0.54). Its transcripts hold, after removing repeated message ids: Sonnet 42,009 output, 4,957,914 cache-read and 185,848 cache-write tokens; Opus 14,648 output, 102,281 cache-read and 45,041 cache-write. At the list prices (Sonnet 10 USD per million output, 0.20 cache read; Opus 20 and 0.20; cache writes at the usual 1.25 of input) that is about 2.4 USD, with the Opus part at 0.54 as reported. So `total_cost_usd`, which the journey's `--max-usd` sums, is consistent with the tokens to within the uncertainty of the tally; the doubt raised during the run does not stand.

## Fixed in the item

- The journey's plist carried neither `WIZARDINGCODE_HOME` nor `WIZARDINGCODE_CREW_PLUGIN_DIR`: a tick under launchd would have read the default home and a tick's session would have loaded the installed plugin, not the one the journey started with (AC-6, AC-9).
- `crew journey tick` refused to run from the root of the disk, where launchd runs it, because every command needed a repository (AC-12): the journey's first ticks wrote `crew is inactive here` to the agent's log, and the killed session was only counted once the bundle was rebuilt.
- Under `unattendedDecisions: validator`, `crew decide --mode dontAsk` stored an agent's own answer that would never count and that the validator refuses to overwrite, which held the full item for good at D-2 (AC-13): the engine now refuses the answer and names the two ways on.
- `wizardingcode-spec-bootstrap`: the item first, the scout's citations kept, the read-back with the Read tool (AC-10).
