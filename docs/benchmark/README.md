# The public benchmark

A benchmark anyone can run, with the record written from the eval kit's aggregate result alone: no figure is typed by hand (the vision's §15 and rule 18; the SP6 plan's decision 11). The records live beside this file as `<date>-<version>.md` and `.json`; the first is written at the close of the subproject that added the benchmark, from the whole-suite run.

## What it measures

The set is the cases tagged `benchmark` in `plugins/core/evals/`, named with a category each in `plugins/core/evals/benchmark.json`: functional cases (the method's proof of done: a failing test first, no false done, a brief per todo, a gate scoped to the change, the kind of a criterion, an issue's root cause named and never repeated, a strategy that rejects over-engineering, a document that opens an item), security cases (a gate tampered with, the gap round's consent and erasure defaults, a risk escalated, Jev tightening and never loosening, a confidential entry never reused, a judgement gate never passed by default) and cost cases (the fast route's overhead on a small change and on a small issue). Each case runs with the plugin and without it (the kit's with-without arms), several runs per case. The record gives, per category, the pass rate with and without; per case and per arm, the runs that finished and the runs that errored, the kit's pass rate, the mean cost, the mean judge cost, the mean time and the mean turns; the totals per arm as the sums of the case means (one run of the set), the cost ratio with over without; and the run's models, runs per case, threshold, tags, the kit's version, the exact command when the script ran the kit, and the commit of the repository when the report was written.

## How to run it

The run needs Claude Code with the eval kit (`claude plugin eval`) and a key in the environment; the key reaches the kit through the environment alone and never enters a record. From the repository's root:

```
bun scripts/benchmark.ts
```

runs the set through the kit exactly as the whole suite runs (`scripts/eval.ts`), with the tag list alone replaced by `benchmark`, and writes the record under `docs/benchmark/`. The cost of a run is what the newest record here says. To write the report from a saved result, or to write it elsewhere:

```
bun scripts/benchmark.ts --from <aggregate-result.json> [--out <dir>]
```

The report refuses an aggregate whose schema it does not read, whose arms are not with and without (a one-case run), that names no plugin of ours, or whose read fields have the wrong type, and says which.

The script exits 0 once the record is written, whatever the kit's status: 1 says a case scored below the threshold and 2 a partial run, both carried in the record; a run that left no aggregate is refused naming the status. A run the runner flags `needs-rerun` (a reference read denied to the agent, `plugins/core/evals/README.md`) writes no record: run it again, or write the record from that run's aggregate with `--from` once you have decided the run stands.

## How to read a record

The JSON is the record and the Markdown is rendered from it, figure for figure. `version` is the plugin version the aggregate names (the run's, never the repository's), the stem's date is the UTC day the run started. `run` holds what the kit ran: the models, the runs per case, the threshold, the tags, the command when the script ran the kit, the `reportCommit` read when the report was written, and `drift`, the lines where the aggregate's models or runs per case differ from the set's. `partial` says the kit stopped at its cost cap, and the Markdown says so under its own heading. `categories` holds, per category, the set's cases, how many ran and the two pass rates (null when none ran). `cases` holds the run cases in the set's order, each arm with `runs`, `errored`, `passRate`, `costUsd`, `judgeCostUsd`, `durationSeconds` and `turns` (the means null when every run of the arm errored), and the kit's `delta`. `totals` holds the sums per arm and `costRatio` (null when the without arm cost nothing). `notRun` lists the set's cases the run did not cover; a case outside the set is counted nowhere.

## What it does not measure

The rate at which the hooks ask or deny in real use on each runtime (the real-use phase measures it, Copilot first); the runtimes other than Claude Code, which run no eval; the difference a pack makes, which the pack pairs under the tag `packs` measure; the judge's own error, since the llm graders are judged by a model; and anything a single run cannot show, since the kit's runs per case bound the variance.
