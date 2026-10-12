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
- **Hooks**: a Claude Code plugin (`plugins/core`) wires SessionStart, UserPromptSubmit, PreToolUse and Stop to `crew hook <event>`. A turn cannot end while watched source files have unproven changes, the agent cannot write the engine's files, and decisions that belong to the user (skips, approvals, accepting changed state) go through a permission prompt.
- **The crew skill** (`plugins/core/skills/crew`): the method the agent follows, phase by phase.
- **The mod** (`plugins/core/hooks/register.js`, Claude Code 2.1.287 or later): a status strip above the prompt (`crew <id> · phase · route · proven · gates`, or `not proven (<first reason>)` in place of `proven`; a planned gate that has not run shows as `…`), a line under each answer (`Proven: ...` or `Not proven: ...`), and `/crew` with `status`, `panel` and `mode <partner|guide|pilot>`. It only shows the engine's state; the hooks and the command carry the guarantee, so disabling the mod changes nothing about what is enforced.

Requirement: Node.js 20 or later on `PATH` (the hooks and the `crew` command run on it). Development uses Bun.

## Where state lives

- **`.crew/` in the repository.** Crew is active in a git repository, or in a folder that already holds `.crew/` (`crew detect` creates it); anywhere else it stays silent.
  - `profile.json`: the detected project profile and gate commands.
  - `policy.json` (optional): the team policy, written by a person.
  - `work/<id>/`: one folder per work item, with `work.json` (state), `brief.md`, `spec.md`, `plan.md`, `evidence.json` (test-first records and gate runs), `report.md` (the delivery report) and `logs/` (full command output, ignored).
  - `local/`: per-machine state such as the session baselines (ignored).
- **`~/.wizardingcode/crew/` for the user**: `config.json` (mode and settings) and `integrity/`, the hashes the engine uses to notice state changed outside it.

## Try it

```bash
bun install && bun run build
claude --plugin-dir ./plugins/core      # loads the plugin for one session
bun run plugin:check      # validate --strict and the mod tests
```

Open the session inside a git repository and ask for a code change; the crew skill takes it from there. `node plugins/core/dist/crew.mjs status` shows where the work stands.

Development note: `bun run check` runs the engine tests under `packages/`; the mod's tests need the plugin runtime and run only through `bun run plugin:check`.

## What is next

The eval suite (`plugins/core/evals/`) measures the method on fixture projects against plain Claude Code. Its first full run is recorded in [`docs/evals/2026-10-12-sp1b-results.md`](docs/evals/2026-10-12-sp1b-results.md): five of six cases pass with the plugin, the sixth stops at the spec approval the full route reserves for the user, and a trivial fix on the fast route costs about 2.3× the baseline, against the 1.2× the design hoped for. Bringing that overhead down, and the open questions the run lists, are the next work on the method.

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
