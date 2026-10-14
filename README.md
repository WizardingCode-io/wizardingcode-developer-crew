<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/wizardingcode-lockup-reverse.svg">
    <img src="docs/brand/wizardingcode-lockup.svg" alt="wizardingcode" width="280">
  </picture>
</p>

<h1 align="center">WizardingCode Developer Crew</h1>

<p align="center">
  <strong>Done is proven, not claimed.</strong><br>
  Give your coding agent one input and get guided to a result that is proven done: the engine, not the model, says when work is finished.
</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/licence-MIT-6B35E0?labelColor=100E0D"></a>
  <img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude%20Code-plugin-6B35E0?labelColor=100E0D">
  <img alt="Node.js 20 or later" src="https://img.shields.io/badge/Node.js-20%2B-6B35E0?labelColor=100E0D">
</p>

<p align="center">
  One engine · the project's real build, tests and checks · evidence on disk · a turn cannot end unproven
</p>

---

## What exists today

- **The engine** (`packages/engine`): dependency-free TypeScript that detects the project's build, test, lint and type-check commands (Node and TypeScript, PHP and Laravel, Python), routes each request (fast, standard or full), records test-first runs, runs the gates and writes the evidence.
- **The `crew` command**: the engine's interface, bundled into one file, `plugins/core/dist/crew.mjs`. `crew help` lists the commands.
- **Hooks**: a Claude Code plugin (`plugins/core`) wires SessionStart, UserPromptSubmit, PreToolUse and Stop to `crew hook <event>`. A turn cannot end while watched source files have unproven changes, the agent cannot write the engine's files, and decisions that belong to the user (skips, approvals, accepting changed state) go through a permission prompt. The agent runs those commands and the person answers the prompt, in auto mode too. When no person can answer (a headless session, or bypassPermissions or dontAsk mode) the hook requires `--mode <mode>` on those commands: the record says the agent decided, and the decision counts for the proof only if the team's policy says so.
- **The crew skill** (`plugins/core/skills/crew`, command name `crew-method`: a skill claims the bare `/<name>`, and `/crew` belongs to the mod): the method the agent follows, phase by phase.
- **The mod** (`plugins/core/hooks/register.js`, Claude Code 2.1.287 or later): a status strip above the prompt (`crew <id> · phase · route · proven · gates`, or `not proven (<first reason>)` in place of `proven`; a planned gate that has not run shows as `…`), a line under each answer (`Proven: ...` or `Not proven: ...`), and `/crew` with `status`, `panel` and `mode <partner|guide|pilot>`. It only shows the engine's state; the hooks and the command carry the guarantee, so disabling the mod changes nothing about what is enforced.

Requirement: Node.js 20 or later on `PATH` (the hooks and the `crew` command run on it). Development uses Bun.

## Where state lives

- **`.crew/` in the repository.** Crew is active in a git repository, or in a folder that already holds `.crew/` (`crew detect` creates it); anywhere else it stays silent.
  - `profile.json`: the detected project profile and gate commands.
  - `policy.json` (optional): the team policy, written by a person. `unattendedDecisions` (`wait`, the default, or `count`) says whether an approval or skip the agent recorded with no person watching counts for the proof. `riskPathExclusions` lists globs of paths that never raise the route (ADR 0003); the report names them when they applied.
  - `work/<id>/`: one folder per work item, with `work.json` (state), `brief.md`, `spec.md`, `plan.md`, `evidence.json` (test-first records and gate runs), `report.md` (the delivery report) and `logs/` (full command output, ignored).
  - `local/`: per-machine state such as the session baselines (ignored).
- **`~/.wizardingcode/crew/` for the user**: `config.json` (mode and settings) and `integrity/`, the hashes the engine uses to notice state changed outside it.

## Install

```sh
claude plugin marketplace add WizardingCode-io/wizardingcode-plugins
claude plugin install wizardingcode-developer-crew@wizardingcode-plugins
```

Open a session inside a git repository and ask for a code change; the crew skill takes it from there. `crew status` shows where the work stands. The marketplace points at a released version; `claude plugin update wizardingcode-developer-crew` moves to the next one.

## Develop

```bash
bun install && bun run build
claude --plugin-dir ./plugins/core      # loads the plugin for one session, instead of the installed one
bun run plugin:check      # validate --strict and the mod tests
```

Development note: `bun run check` runs the engine tests under `packages/`; the mod's tests need the plugin runtime and run only through `bun run plugin:check`.

## What is next

The eval suite (`plugins/core/evals/`) measures the method on fixture projects against plain Claude Code. Its first runs are recorded in [`docs/evals/2026-10-12-sp1b-results.md`](docs/evals/2026-10-12-sp1b-results.md): every case passes with the plugin, including the one that stops at the spec approval the full route reserves for the user, and a trivial fix on the fast route costs about 1.7–1.9× the baseline after the fast route was cut to three calls, from 2.3× on the first run. The 1.2× the design hoped for is below the floor of a method that records red, green and the gates; the record says what is left to take out.

Release 0.1.7 (2026-10-14) closes the real-use phase's open findings in one go ([findings 1, 7, 9 and 14](docs/real-use/findings.md)): `crew start` takes `--preserve "<text>"` beside `--criterion`, so the fast route can say that existing tests stay green, and every command refuses a flag it does not know instead of ignoring it; `start` warns and records it when another item is still being worked on in the same checkout with uncommitted changes, and says to use a worktree; the team policy's `riskPathExclusions` keeps named paths out of the risk patterns, the one way a policy loosens a default, written down in [ADR 0003](docs/adr/0003-risk-path-exclusions.md) and named in the report when it applied; and a gate run that proves an item already in its gate phase delivers it, so the second run after a build gate rewrote the bundle no longer leaves the item one phase short.

Release 0.1.6 (2026-10-14) puts the user's signature back where it belongs ([findings 3 and 19](docs/real-use/findings.md)): auto mode shows the prompt a hook asks for, so a user-only decision (an approval, a skip, a confirmation) is asked there as in default mode and the user answers yes or no; the agent runs the command and never asks the user to type it. Only a headless session (`claude -p`, in any mode) or bypassPermissions and dontAsk mode take the `--mode` path, where the record says the agent decided. `crew gate run` exits non-zero while the work is not proven, so a command chain stops there (finding 18).

Release 0.1.5 (2026-10-14) answers the first two days of real use on two client projects ([findings 8 to 17](docs/real-use/findings.md)): a folder with two manifests (a Laravel app with a `package.json` beside it) has one target per manifest, keyed by path and stack, and every target's gates run and are reported under their own name, where before the second target's commands never ran (`crew profile set --stack` names one); the dependency audit runs on every route when the change touches a manifest or a lockfile, not on every item ([ADR 0002](docs/adr/0002-dependency-audit-on-dependency-changes.md)); a watch list left by an earlier release follows the current default by itself at session start; a Node project with several lockfiles and no `packageManager` field gets proposed commands to confirm instead of a guess; the hook takes a user-only `crew` verb for the command only at the command position, so a `grep` that quotes it is not stopped; and the Stop block names `crew await` as the way to end a turn with a question.

Release 0.1.1 (2026-10-12) closed what SP1 left open: a workspace member package is covered by the package that lists it, so a monorepo (this repository included) can be proven; `.claude/**` is unwatched by default; a new work item starts from the previous item's proven state instead of inheriting its uncommitted files; a read of an engine file with stderr silenced is no longer denied; `bun scripts/eval.ts` runs the eval suite; and the interactive check of the mod found and fixed `/crew` being taken by the plugin's own skill ([record](docs/plans/2026-10-07-sp1a-e2e-results.md), "Interactive check"). After upgrading, run `crew detect --refresh` once in each repository: a profile written by 0.1.0 keeps its watch list and knows no workspaces until it is re-detected, and the session start says so.

## Documents

- [Vision](docs/vision.md): the whole system, its principles and its roadmap.
- [SP1 design](docs/specs/2026-10-06-sp1-engine-and-base-method-design.md): the first subproject, the engine and the base method.
- [SP1a implementation plan](docs/plans/2026-10-07-sp1a-engine-cli-and-plugin.md): engine, `crew` command, hooks, skill and plugin packaging, task by task.
- [SP1b implementation plan](docs/plans/2026-10-07-sp1b-mod-and-evals.md): the mod and the eval suite.
- [ADR 0001](docs/adr/0001-wizardingcode-brand.md): the shibaox brand is retired; the names, the paths and the convention for the brand's products.
- [Evals, first full run](docs/evals/2026-10-12-sp1b-results.md): the six cases with and without the plugin, the fast-route overhead, and what the run opened.
- [SP1a end-to-end check](docs/plans/2026-10-07-sp1a-e2e-results.md): the live sessions behind the acceptance criteria, including the re-run of 2026-10-12.

---

<p align="center">
  <img src="docs/brand/wizardingcode-mark.svg" alt="" width="48">
</p>

<p align="center">
  A <a href="https://wizardingcode.io">WizardingCode</a> product · MIT · © 2026 WizardingCode<br>
  <sub>Tools for the agents you already use. More on the way.</sub>
</p>
