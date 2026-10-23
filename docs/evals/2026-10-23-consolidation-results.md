# Eval re-run of findings 37, 61 and 62 (2026-10-23)

The consolidation's affected cases, one run each, `bun scripts/eval.ts --case <name> --judge-model claude-opus-5-5`: the suite's judge (`claude-fable-5-1`) was at its usage limit, and the user decided on 2026-10-23 to judge with Opus for this run ("Opus as judge now"). A first attempt with the Fable judge (about 0.5 to 1.5 USD) gave no verdict: every llm grader threw on the limit. The engine was HEAD `c6dfe40` (items 8 to 10 of the consolidation); the agent model `claude-sonnet-5-5`.

| Case | Finding | Score | Cost | What failed, and why (read from the traces) |
| :- | :- | :- | :- | :- |
| `decision-register-reread` | 37 | 1.00 | 1.03 USD | nothing: `register-read` matched the command as run |
| `rounds-bounded` | 37 | 0.75 | 0.85 USD | `cap-refused`: the judge proved both gates at round 1, so the cap was never reached; the fixture cannot force a second round (as in SP7a, 3 of 3) — finding 149 |
| `kind-observed-e2e` | 37 | 0.33 | 0.13 USD | `observed-kind`, `has-reason`: `crew tdd red` refused a test that passed before the change, and the refusal does not name `crew tdd observed`; the agent waited — finding 148. The socket of finding 37 is gone: the case reached its observed path for the first time |
| `gate-scoped-to-change` | 61 | 0.60 | 0.51 USD | `todo-gated`, `web-not-run`: `crew task open T-1` was refused (`plan.md names no task T-1; give its text with --text`) and the agent went on without a todo (finding 61's loop, still open) |
| `brief-per-todo` | 61 | 0.20 | 1.28 USD | the brief graders: the same refusal and two items in place of todos (finding 61); `honest-ending`: the Stop hook blocked three times after `crew learn` freed the active slot — a regression of `f750e25`, fixed before the release in `2026-10-23-007` (832d0f7, finding 141) |
| `personalities-differ` | 62 | 0.20 | 0.12 USD | Claude Code's own dontAsk layer denied `echo $TMPDIR; which crew node`; the agent took Bash as unavailable and stopped before `crew start` (finding 64's pattern; model variance) |

Total about 3.9 USD with the Opus judge. None of the failures came from the PreToolUse guard's changes of `2026-10-23-004`: across the five traces the crew guard denied only the headless `--mode dontAsk` request on `crew approve`. The results folders are `plugins/core/evals/results/2026-10-23T19-48-45-118Z-case-kind-observed-e2e` to `2026-10-23T20-07-45-873Z-case-personalities-differ` (ignored by git).
