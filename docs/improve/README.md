# Improvement runs

What the harness-improvement loop leaves here ([ADR 0013](../adr/0013-harness-improvement-loop.md), [ADR 0015](../adr/0015-the-loop-runs-always-and-releases-what-it-proves.md)), committed by the loop itself from its own clone (`~/.wizardingcode/crew-improve/repo`):

- `<date>-<n>/record.json` and `record.md`: one run (`bun scripts/improve.ts`, or the loop's tick): its targets, the baseline and each proposal's probe figures, the verdicts, what was kept, the provider it was measured on and its cost.
- `<date>-<n>/adoption/`: when the run kept a harness: `gate.md` (the gate in code: the figures' win and the diff's paths), `diff.patch` (the kept change against `main`), `ruling.md` (the judge's answer on the rule `kept-harness-adoption`).
- `daily/<date>.md`: the day's runs, the cost by provider, the releases and the failed steps.

The loop: `bun scripts/improve-loop.ts install [--clone-from <checkout>]` (the launchd agent, hourly), `status` (where it stands), `tick [--dry-run]` (one tick by hand), `uninstall`, `secret set <account>` (a token into the keychain). The release it makes: `bun scripts/release.ts`.

## The ceilings

The loop's configuration (`~/.wizardingcode/crew-improve/config.json`, the user's file) bounds its spend (item 2026-10-27-006, D-2): `maxRunUsd` is one run's ceiling, passed to the run as `--max-cost-usd`, 20 USD by default; `maxDayUsd` is a day's ceiling over its priced runs, 60 USD by default: a due tick at or above it runs nothing, and the first such tick of the day writes the day's report with a `Skipped ticks` section (the time, the reason, the priced cost and the count of unpriced records), commits and pushes it and notifies once; later ticks of the day only log. `0` means no ceiling for either key. A value that is not a finite number at or above 0 is read as the key's default, and the tick's log names the key, the value and the default applied. The day's cost sums the finite costs at or above 0 of the day's records; a record with no list price or a malformed cost adds nothing and is counted as unpriced in the skip's line.
