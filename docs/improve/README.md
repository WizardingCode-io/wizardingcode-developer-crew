# Improvement runs

What the harness-improvement loop leaves here ([ADR 0013](../adr/0013-harness-improvement-loop.md), [ADR 0015](../adr/0015-the-loop-runs-always-and-releases-what-it-proves.md)), committed by the loop itself from its own clone (`~/.wizardingcode/crew-improve/repo`):

- `<date>-<n>/record.json` and `record.md`: one run (`bun scripts/improve.ts`, or the loop's tick): its targets, the baseline and each proposal's probe figures, the verdicts, what was kept, the provider it was measured on and its cost.
- `<date>-<n>/adoption/`: when the run kept a harness: `gate.md` (the gate in code: the figures' win and the diff's paths), `diff.patch` (the kept change against `main`), `ruling.md` (the judge's answer on the rule `kept-harness-adoption`).
- `daily/<date>.md`: the day's runs, the cost by provider, the releases and the failed steps.

The loop: `bun scripts/improve-loop.ts install [--clone-from <checkout>]` (the launchd agent, hourly), `status` (where it stands), `tick [--dry-run]` (one tick by hand), `uninstall`, `secret set <account>` (a token into the keychain). The release it makes: `bun scripts/release.ts`.
