# 0015. The harness-improvement loop runs always and releases what it proves

- Status: accepted (the user, 2026-10-25). Supersedes points 2 and 4 of [ADR 0013](0013-harness-improvement-loop.md).
- Date: 2026-10-25

## Context

ADR 0013 made the loop a development script run on demand, whose kept harness waited on a branch for a person. The user's direction of 2026-10-25: the loop and the fixes "have to run always", in the background of this Mac with Claude Code open or closed, so that every step a user takes runs the best proven harness. The decisions D-1 to D-9 of item `2026-10-25-005` set how.

## Decision

1. **Where and when.** A launchd agent (`io.wizardingcode.crew-improve`, `~/Library/LaunchAgents`) runs `bun scripts/improve-loop.ts tick` at minute 0 of every hour (`StartCalendarInterval`, so an hour slept is caught up at wake) and once at load. A run is due when the plugin's text changed on `origin/main`, a CTO plan is newer than the last run, the harness lessons grew, or a case went seven days unmeasured; the targets are the cases never measured first, then the oldest, two a run. The loop runs while a session is open here (D-6).
2. **Its own clone, never the user's checkout (D-1, D-3, D-7).** The loop lives in `~/.wizardingcode/crew-improve` (`WIZARDINGCODE_HOME` honoured): its configuration (`paused: true` holds the ticks without removing the agent), its state, its own clone of this repository where the runs happen, its logs. Every run's record and the day's report (`docs/improve/<run>/`, `docs/improve/daily/<date>.md`, D-7: the runs, the cost by provider, the releases, the failed steps; the notification carries the day's total) are committed and pushed to `origin/main`, release or not; a kept branch is pushed too. The user's checkout is fast-forwarded only when it is clean and on `main`.
3. **The adoption (D-4, D-5, D-9).** A kept harness passes a gate in code (the figures are a win by the run's own rule; the diff touches only the skill and the agents), then the judge rules the one clause code cannot, "no rule of the method weakened", headless and read-only, its answer parsed strictly. `holds` on a run measured on Claude models merges the branch into `main` and releases a patch; each adopted harness is its own release. Anything else keeps the branch as evidence and says why.
4. **The provider (D-2, D-8).** `config.json` names the provider: the runtime's own login by default, an Anthropic key, or an Anthropic-compatible gateway (OpenRouter, Ollama, LM Studio) with its base URL and the models it serves. A secret lives in the macOS keychain under `wizardingcode-crew-improve`, read into memory and passed only to the processes that need it; every line and file the loop writes is redacted of it. The provider's token sits in the kit's environment as `ANTHROPIC_API_KEY` did, the kit's OS sandbox confining it, and a gateway's base URL receives it by design. A run measured on models that are not Claude's is never released: the plugin's users run Claude.
5. **One release flow (finding 163).** `bun scripts/release.ts` is the release for a person and for the loop: the version written into every file CLAUDE.md names, the build, the checks, the commit and the tag, the push, the tarball, the GitHub release, the marketplace entry, the plugin update and the local install here, the notification; a failure before the push puts the tree back, a failure after it is resumed step by step.
6. **The hook's home rule.** The PreToolUse hook matches the engine's home at a word end, so a sibling under `~/.wizardingcode` is another tool's.
7. **Policy.** The loop never touches a project's `.crew/policy.json`: ADR 0012 does not apply to it.

## Consequences

- A user receives a better harness without asking for it; the day's report and the notification say what changed and what it cost. No daily cap: the cost is managed through the report (the user's decision).
- The loop's first unattended run is watched through `bun scripts/improve-loop.ts status`; the documentation does not confirm that a LaunchAgent reads the Claude login from the keychain, so the install probes it and prints the fallback (`claude setup-token` in the keychain).
- The eval kit's environment allowlist admits the provider's names and the credentials it needs, and nothing else that looks like a secret.
- A run's verdict holds for the models it was measured on; the record says which.
- A tick that fails after the model was paid keeps the run on record and backs off (an hour, then double, up to a day), so a run that cannot be saved is not paid for every hour; `config.maxRunUsd` is a ceiling a person may set on one run, none by default.
- The marketplace call uses the personal account's `gh` token, which carries more authority than the one file needs; a token limited to the marketplace repository is the better key and the next step.
