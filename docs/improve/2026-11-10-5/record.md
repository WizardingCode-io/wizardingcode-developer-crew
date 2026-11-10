# Improvement run 2026-11-10-5

- At: 2026-11-10T12:00:11.951Z
- Targets: brief-per-todo, decision-register-reread
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| brief-per-todo | 0.80, 0.40, 1.00 | 0.73 | 0.60 |
| decision-register-reread | 1.00, 0.50, 0.50 | 0.67 | 0.50 |

## P-1: unprobed (the probe set (2 cases, about 17.40 USD by the baseline's costs) is above what is left under the ceiling (0.64 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell), so there are no tests and no eval rerun, and whether the scores move is unmeasured. I had no trace of the failing runs, so both causes are inferred from the graders, the page and earlier records.

- **`brief-per-todo`:** the three brief graders want the `# Brief: T-n` text with its `## Changed` list, which only `crew task <id> brief T-n` prints. The request is a feature, so the lead is on the standard route and follows the method table. The table never mentioned `--part`, and its Plan row named only `note`. The todo loop sat in the fast-route section, where it reads as fast-route-only. The Receive row now ends "parts or todos: `--part` (below)", the Plan row reads "`note`, `gate`, `brief`", and the fast-route paragraph opens "A request in several parts or todos, every route".
- **`decision-register-reread`, `register-read`:** the grader wants a Bash call containing `crew decisions`. The skill page never named that command; it was only in `references/understand.md` and `references/rules.md`, which earlier records show these leads do not read. The Understand row now asks for "the earlier decisions that touch it" and lists `crew decisions` first.
- **`decision-register-reread`, `first-proven`:** the grader wants the first item's `Proven:` line. My reading is that the lead opens a decision for a choice the request already made, and an unattended answer is not counted under the default policy, so Plan stays refused. Rule 5 now says "one the request already made is a criterion, never a `D-n`".

The page was 9,251 bytes against a 9,254-byte cap, so the additions are paid for with wording trims that no test pins: the intro sentence, the typed-questions line, the `work_type: question` line, the fast-route heading and opening, "as subagents" in the Gate row, and clauses in rules 4, 5 and 6. Rule 6 lost "The answers are required;", which the bolded `cre

## P-2: unprobed (the probe set (2 cases, about 17.40 USD by the baseline's costs) is above what is left under the ceiling (0.00 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the scores move is unmeasured; I also had no trace of the failing runs, so both causes are inferred from the engine and earlier records.

- **`brief-per-todo`**: the three brief graders want the `# Brief: T-n of …` text with its `## Changed` list, which only `crew task <id> brief T-n` prints. The request is a feature, so it never takes the fast route, and the todo loop was written only in the fast-route section. An item started without `--part` is proven with no brief ever asked for. The Receive row now says a request in parts ("two todos") takes `--part` each and shows `[--part "<text>"]` in its `crew start` form. The Plan row now reads "todo in this checkout: `note`, `gate`, `brief`".
- **`decision-register-reread`**: `register-read` wants a `crew decisions` Bash call, a command the skill page never named. The Understand row now says "quote earlier decisions" and lists `crew decisions`. `first-proven` wants the first item's `Proven:` line. In the headless kit an opened decision answered with `--mode` is not counted, and Plan is refused for good. Rule 5 now says a design choice "the request already made is a criterion, never a `D-n`".
- **Byte cap**: the page sat 3 bytes under its 9254-byte cap, so the 177 added characters are paid for by 182 trimmed from clauses no test pins:
  - the intro's "The `crew` command" and "the work is done";
  - the typed-questions sentence and the `work_type: question` line;
  - the fast-route heading's ", in three calls" and "is on this page";
  - "Write the test for the criterion";
  - rule 4's "then run the command", "the command runs with no prompt" and the `validator` parenthesis;
  - rule 5's "of the gap round";
  - rule 6's "The answers are required".

  Length probes put the page at 9246 bytes or less.
- **Risk**: the rule 5 clause could keep the fir

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 20.97 USD
- Exit status: 0
