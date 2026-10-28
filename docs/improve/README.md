# Improvement runs

What the harness-improvement loop leaves here ([ADR 0013](../adr/0013-harness-improvement-loop.md), [ADR 0015](../adr/0015-the-loop-runs-always-and-releases-what-it-proves.md)), committed by the loop itself from its own clone (`~/.wizardingcode/crew-improve/repo`):

- `<date>-<n>/record.json` and `record.md`: one run (`bun scripts/improve.ts`, or the loop's tick): its targets, the baseline and each proposal's probe figures, the verdicts, what was kept, the provider it was measured on and its cost.
- `<date>-<n>/adoption/`: when the run kept a harness: `gate.md` (the gate in code: the figures' win and the diff's paths), `diff.patch` (the kept change against `main`), `ruling.md` (the judge's answer on the rule `kept-harness-adoption`).
- `daily/<date>.md`: the day's runs, the cost by provider, the releases and the failed steps.

The loop: `bun scripts/improve-loop.ts install [--clone-from <checkout>]` (the launchd agent, hourly), `status` (where it stands), `tick [--dry-run]` (one tick by hand), `uninstall`, `pause` (no tick runs until `resume`), `resume`, `stop` (the running tick ended and the loop paused), `secret set <account>` (a token into the keychain). The release it makes: `bun scripts/release.ts`.

## The ceilings

The loop's configuration (`~/.wizardingcode/crew-improve/config.json`, the user's file) bounds its spend (item 2026-10-27-006, D-2): `maxRunUsd` is one run's ceiling, passed to the run as `--max-cost-usd`, 20 USD by default; `maxDayUsd` is a day's ceiling over its priced runs, 60 USD by default: a due tick at or above it runs nothing, and the first such tick of the day writes the day's report with a `Skipped ticks` section (the time, the reason, the priced cost and the count of unpriced records), commits and pushes it and notifies once; later ticks of the day only log. `0` means no ceiling for either key. A value that is not a finite number at or above 0 is read as the key's default, and the tick's log names the key, the value and the default applied. The day's cost sums the finite costs at or above 0 of the day's records; a record with no list price or a malformed cost adds nothing and is counted as unpriced in the skip's line.

## Stopping, pausing and the relaunch

`bun scripts/improve-loop.ts pause` writes `paused: true` into the configuration and no tick runs until `resume` (item 2026-10-28-001, finding 187). `stop` pauses the loop, writes the marker `stop.json` in the loop's home and ends the running tick: the lock is checked before anything is signalled (an integer pid above 1, this boot, an ISO start, the process alive and running the tick's own command line), then `SIGTERM` goes to the tick's process group (the pid alone when the group is not its own) and the lock is waited for up to thirty seconds. The tick keeps a `SIGTERM` handler for its duration so the signal ends the kit's child and never the tick: the run stops at its next step with exit 4, the partial record is written, the commit, the day's report row and the notification say `stopped by the user`, no failure is counted and nothing is adopted (a kept harness stays on its branch). A lock that fails a check signals nothing and `stop` says no tick is running. `kill -KILL` of the tick's group stays the person's last resort; the next tick then records the dead one.

The run's exit statuses: 0 done, 1 refused before any spend, 2 the ceiling, 3 a failure, 4 stopped by the user. The commit and the report name each (`stopped at the ceiling (20.74 USD)`, `failed (exit 3)`, `stopped by the user`), never `errored`.

A tick runs the code bun loaded at its launch; when its sync of the clone changed a file under `scripts/` or `packages/engine/src/`, the tick releases its lock and runs itself again once as `tick --relaunched` on the new code, so a fix pushed to main is taken at once (finding 188).

A proposal whose probe set the run's ceiling cannot pay is `unprobed` (finding 189): before the first probe run the set's cost is estimated from the baseline's costs (this run's, else the latest earlier record's, else the mean of this run's, twice for a case without a baseline in this run), and a set above what is left under the ceiling is not probed at all; the record says so with the estimate and what was left, and the run goes on to the next proposal.

A tick that dies leaves its lock behind; the next tick takes it over and records the dead tick (finding 190): the lock's pid and start once checked, the run folder left without a record (removed from the clone, since it would never be committed empty), a notification once, a `Dead ticks` section in the day's report and a line in `status`.
