# Improvement runs

What the harness-improvement loop leaves here ([ADR 0013](../adr/0013-harness-improvement-loop.md), [ADR 0015](../adr/0015-the-loop-runs-always-and-releases-what-it-proves.md)), committed by the loop itself from its own clone (`~/.wizardingcode/crew-improve/repo`):

- `<date>-<n>/record.json` and `record.md`: one run (`bun scripts/improve.ts`, or the loop's tick): its targets, the baseline and each proposal's probe figures, the verdicts, what was kept, the provider it was measured on and its cost.
- `<date>-<n>/adoption/`: when the run kept a harness: `gate.md` (the gate in code: the figures' win and the diff's paths), `diff.patch` (the kept change against `main`), `ruling.md` (the judge's answer on the rule `kept-harness-adoption`; the ruling names the model that ruled, or says not ruled).
- `daily/<date>.md`: the day's runs, the cost by provider, the releases and the failed steps.

The loop: `bun scripts/improve-loop.ts install [--clone-from <checkout>]` (the launchd agent, hourly), `status` (where it stands), `tick [--dry-run]` (one tick by hand), `uninstall`, `pause` (no tick runs until `resume`), `resume`, `stop` (the running tick ended and the loop paused), `secret set <account>` (a token into the keychain). The release it makes: `bun scripts/release.ts`.

## The ceilings

The loop's configuration (`~/.wizardingcode/crew-improve/config.json`, the user's file) bounds its spend (item 2026-10-27-006, D-2): `maxRunUsd` is one run's ceiling, passed to the run as `--max-cost-usd`, 20 USD by default; `maxDayUsd` is a day's ceiling over its priced runs, 60 USD by default: a due tick at or above it runs nothing, and the first such tick of the day writes the day's report with a `Skipped ticks` section (the time, the reason, the priced cost and the count of unpriced records), commits and pushes it and notifies once; later ticks of the day only log. `0` means no ceiling for either key. A value that is not a finite number at or above 0 is read as the key's default, and the tick's log names the key, the value and the default applied. The day's cost sums the finite costs at or above 0 of the day's records; a record with no list price or a malformed cost adds nothing and is counted as unpriced in the skip's line.

## Stopping, pausing and the relaunch

`bun scripts/improve-loop.ts pause` writes `paused: true` into the configuration and no tick runs until `resume` (item 2026-10-28-001, finding 187). `stop` pauses the loop, writes the marker `stop.json` in the loop's home and ends the running tick: the lock is checked before anything is signalled (an integer pid above 1, this boot, an ISO start, the process alive and running the tick's own command line), then `SIGTERM` goes to the tick's process group (the pid alone when the group is not its own) and the lock is waited for up to thirty seconds. The tick keeps a `SIGTERM` handler for its duration so the signal ends the kit's child and never the tick: the run stops at its next step with exit 4, the partial record is written, the commit, the day's report row and the notification say `stopped by the user`, no failure is counted and nothing is adopted (a kept harness stays on its branch). A lock that fails a check signals nothing and `stop` says no tick is running. `kill -KILL` of the tick's group stays the person's last resort; the next tick then records the dead one.

The run's exit statuses: 0 done, 1 refused before any spend, 2 the ceiling, 3 a failure, 4 stopped by the user, 5 no judge answered (nothing ran, no record; the day's report names the day's first such skip), 6 a measurement was not judged (the run stopped there with its record; when the judge was at a limit the next due tick measures the same cases again). `record.json` names the model that judged the run (`judge`) and each model passed over at its start (`judgeSkipped`). For a run of a case that was not judged it holds the class of the cause and never the CLI's text, which can name an account in a public repository (item 2026-11-11-002): `"unjudged": "limited"` for a usage limit, `overloaded` for a rate limit, a 429 or an overload, `failed` for any other cause. The text, cut at 120 characters and withheld when it holds a secret's shape, is in the tick's local log alone (`<case> run <n> was not judged: <grader>: <cause>`). A record written before that item holds the text, and the loop reads both. The commit and the report name each (`stopped at the ceiling (20.74 USD)`, `failed (exit 3)`, `stopped by the user`), never `errored`.

A tick runs the code bun loaded at its launch; when its sync of the clone changed a file under `scripts/` or `packages/engine/src/`, the tick releases its lock and runs itself again once as `tick --relaunched` on the new code, so a fix pushed to main is taken at once (finding 188).

A proposal whose probe set the run's ceiling cannot pay is `unprobed` (finding 189): before the first probe run the set's cost is estimated from the baseline's costs (this run's, else the latest earlier record's, else the mean of this run's, twice for a case without a baseline in this run), and a set above what is left under the ceiling is not probed at all; the record says so with the estimate and what was left, and the run goes on to the next proposal.

A tick that dies leaves its lock behind; the next tick takes it over and records the dead tick (finding 190): the lock's pid and start once checked, the run folder left without a record (removed from the clone, since it would never be committed empty), a notification once, a `Dead ticks` section in the day's report and a line in `status`.

## Adopting a kept run by hand

An adoption can end with nothing ruled: no judge answered its probe, every judge was at its limit during the ruling, or the judge's call failed for another cause. The loop never offers such a run again ([ADR 0024](../adr/0024-a-run-not-ruled-is-named-for-a-person.md)). When the run was measured on Claude models, the tick's notification and its log name the kept branch: `the run was not ruled and its branch <branch> is kept: adopt it by hand (docs/improve/README.md)`, `<branch>` being `improve/<run>` unless the run's record names another. A run measured on another provider is never named: the loop's own rule does not release one.

Nothing in code keeps a hand adoption from colliding with the loop. These three preconditions do, and all three must hold:

1. The loop is stopped and its tick has ended. `bun scripts/improve-loop.ts stop` pauses the loop and ends a tick that is running. Go on when it answers `no tick is running; the loop is paused` or `stopped: the tick (pid …) ended`. When it answers `stop requested: the tick (pid …) is still ending`, wait and run `status` until the tick is gone. `pause` alone is not enough: a tick reads it at its start only, so one already running would go on to merge and release.
2. `bun scripts/improve-loop.ts status` shows no pending release (`pending release: none`). A release by hand over one the loop still owes would take its version.
3. Main has not changed outside `docs/` since the run. With `<branch>` the branch the notification names: `git fetch origin`, then `git diff --name-only $(git merge-base origin/main origin/<branch>)..origin/main` lists paths under `docs/` alone. Without the fetch a stale checkout can hide a main that moved. This is the loop's own rule (ADR 0015, decision 3; finding 172): the figures were measured on that tree. When main has changed, do not adopt the run; the next due tick measures again.

Then:

1. Read `adoption/gate.md` and `adoption/diff.patch` in the run's folder. This reading is the ruling the judge did not make: whoever merges answers for the judge's clause, that the change weakens no rule of the method.
2. On a main brought to origin's (`git pull --ff-only origin main`), merge the branch: `git merge --no-ff origin/<branch>`.
3. Release: `bun scripts/release.ts --patch --reason "<the run and its gains>"`.
4. Once the release has finished, and not before, delete the branch on origin, as the loop does after its own release: `git push origin --delete <branch>`.
5. `bun scripts/improve-loop.ts resume`.

The way back from each step:

- The merge, before the release: `git reset --hard origin/main` on the local main, in a checkout with no uncommitted work, since the reset discards it. Nothing reached origin.
- A release that fails before its push: the script puts the tree back and the merge stays local. Fix what the log names and run the release again, or drop the merge as above.
- A release that fails after its push: resume it by hand with `bun scripts/release.ts --resume vX.Y.Z --from-step N`, the step its log named. The loop's state does not hold a release made by hand, so the loop stays stopped until that release has finished: a tick would otherwise start a release of its own over it.
- A release that finished and turns out bad: a published version is never withdrawn. Revert the merge on main (`git revert -m 1 <the merge commit>`) and release again with `bun scripts/release.ts --patch --reason "revert of <run>: <why>"`; the tarball install keeps the one it replaced beside it as `<install>.previous`.
- The deleted branch: the merge commit keeps it. `git push origin <the merge commit>^2:refs/heads/<branch>` puts it back.
