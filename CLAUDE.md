# WizardingCode Developer Crew

Guided delivery for coding agents where done is proven, by **WizardingCode**: the engine, not the model, says when work is finished.

Brand conventions: products, plugins and skills are called `wizardingcode-<thing>`; variables `WIZARDINGCODE_<THING>_*`; data in `~/.wizardingcode/<thing>` (honouring `WIZARDINGCODE_HOME`). Until commit 68c1fc4 this was shibaox-developer-crew; nothing was published under that name, so there is no compatibility code. Never reintroduce the old names; `docs/plans/` keeps the names it was written with. See `docs/adr/0001-wizardingcode-brand.md`.

## Where things are

- The whole system, its principles and its roadmap: `docs/vision.md`
- Designs: `docs/specs/`; implementation plans, task by task: `docs/plans/`
- Decisions: `docs/adr/` (read the latest before changing a name, a path or a convention)
- The engine: `packages/engine` (dependency-free TypeScript; `src/hooks/` is what each Claude Code event runs, `src/cli.ts` the `crew` command)
- The plugin: `plugins/core` (`dist/crew.mjs` is the bundled `crew` command, `hooks/` the hook wiring and the mod, `skills/crew` the method)
- The eval suite: `plugins/core/evals/` (inside the plugin, where `claude plugin eval` looks for it; `results/` there is ignored, the recorded runs live in `docs/evals/`)
- The real-use phase between subprojects: `docs/real-use/` (the plan of the phase, the findings, the corpus of real requests)
- The brand's lockup and mark, as the README uses them: `docs/brand/` (not covered by the MIT licence)

## Commands

- `bun run check` — typecheck, lint and the engine tests
- `bun run build` — bundles the `crew` command into `plugins/core/dist/crew.mjs`
- `bun run format` — formats and fixes lint
- `bun run plugin:check` — `claude plugin validate --strict` and the mod's tests (they need the plugin runtime; `bun run check` does not run them)
- `bun scripts/eval.ts [--case <name>] [--max-cost-usd <usd>] [--judge-model <model>]` — runs the eval suite with the PATH and the environment it needs and prints an estimate first; the whole suite has no default cap since the user's decision of 2026-10-22 (finding 63: no hard limit, managed), so run only the affected cases with `--case` (about 0.3 to 1.4 USD each, capped at 5 unless given); the suite is about 39 USD a run at three runs and two arms; the llm graders' judge is `claude-fable-5-1` unless `--judge-model` names another (the user's decision of 2026-10-23: Opus while Fable is at its limit, said in the run's record)
- `bun scripts/benchmark.ts [--from <aggregate.json>] [--out <dir>]` — runs the benchmark set through the kit (about 35 USD, no default cap; `--max-cost-usd` sets one) and writes `docs/benchmark/<date>-<version>.{md,json}` from the aggregate alone (`docs/benchmark/README.md`)
- `claude --plugin-dir ./plugins/core` — loads the plugin for one session
- `node plugins/core/dist/crew.mjs status` — where the work stands (`crew help` lists the commands)

Node.js 20 or later on `PATH` runs the hooks and the command; development uses Bun, and `bun run check` needs `php` on `PATH` as well (the Laravel pair's rows run the fixture's `artisan`, a PHP script with no framework, through it).

## Releasing

The plugin installs from the `WizardingCode-io/wizardingcode-plugins` marketplace, whose entry points at this repository's `plugins/core` at a tag (`git-subdir`, `ref: vX.Y.Z`). A release is: the same version in `package.json`, `packages/engine/package.json`, `packages/engine/src/version.ts`, `plugins/core/.claude-plugin/plugin.json` and the two tests that assert it (`packages/engine/tests/version.test.ts`, the `--version` line in `cli.test.ts`), and the packs' versions with it (`packs/laravel/pack.json`, `packs/laravel/.claude-plugin/plugin.json`, `packs/agentic-os/pack.json`, `packs/agentic-os/.claude-plugin/plugin.json`: the `version` and the lower bound of `core`, which `packs-content.test.ts` pins to the engine's version or its next minor); `bun run build` and `bun run check && bun run plugin:check`; commit; `git tag -a vX.Y.Z` and push it; `bun scripts/build.ts --tarball` (the release asset for the runtimes that are not Claude Code: the plugin folder as `dist/wizardingcode-developer-crew-X.Y.Z.tar.gz`, ADR 0011) and `gh release create vX.Y.Z dist/wizardingcode-developer-crew-X.Y.Z.tar.gz` (a user installs it with `tar xzf`, the extracted `bin/` on PATH and `crew runtime install <name>`); then, in the marketplace repository, the entry's `version` and `ref` and the `metadata.version`, committed as `wizardingcode-developer-crew X.Y.Z`. The repository must stay public for the install to work. Nothing is built on install: `dist/crew.mjs` is committed. After the marketplace commit, run `claude plugin marketplace update wizardingcode-plugins` and `claude plugin update wizardingcode-developer-crew@wizardingcode-plugins` before asking for the restart: a restart reloads the installed copy, and only the update replaces it (finding #66).

## Conventions

- TDD: the test is written and seen failing before the code.
- Lint and format with biome; imports with an explicit `.ts` extension.
- The files the engine owns, in `.crew/` and `~/.wizardingcode/crew`, are written only by the `crew` command; the PreToolUse hook denies anything else.
- Hooks fail open: a hook that cannot decide answers `{}`, so a bug in the engine never blocks the user's session (`packages/engine/src/hooks/index.ts`).
- Repository documents (README, vision, specs, plans, ADRs, this file) are written in English.
