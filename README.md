# Shibaox Developer Crew

Give your coding agent one input and get guided to a result that is proven done: the engine, not the model, says when work is finished.

## What exists today (SP1a)

- **The engine** (`packages/engine`): dependency-free TypeScript that detects the project's build, test, lint and type-check commands (Node and TypeScript, PHP and Laravel, Python), routes each request (fast, standard or full), records test-first runs, runs the gates and writes the evidence.
- **The `crew` command**: the engine's interface, bundled into one file, `plugins/core/dist/crew.mjs`. `crew help` lists the commands.
- **Hooks**: a Claude Code plugin (`plugins/core`) wires SessionStart, UserPromptSubmit, PreToolUse and Stop to `crew hook <event>`. A turn cannot end while watched source files have unproven changes, the agent cannot write the engine's files, and decisions that belong to the user (skips, approvals, accepting changed state) go through a permission prompt.
- **The crew skill** (`plugins/core/skills/crew`): the method the agent follows, phase by phase.

Requirement: Node.js 20 or later on `PATH` (the hooks and the `crew` command run on it). Development uses Bun.

## Where state lives

- **`.crew/` in the repository.** Crew is active in a git repository, or in a folder that already holds `.crew/` (`crew detect` creates it); anywhere else it stays silent.
  - `profile.json`: the detected project profile and gate commands.
  - `policy.json` (optional): the team policy, written by a person.
  - `work/<id>/`: one folder per work item, with `work.json` (state), `brief.md`, `spec.md`, `plan.md`, `evidence.json` (test-first records and gate runs), `report.md` (the delivery report) and `logs/` (full command output, ignored).
  - `local/`: per-machine state such as the session baselines (ignored).
- **`~/.shibaox/crew/` for the user**: `config.json` (mode and settings) and `integrity/`, the hashes the engine uses to notice state changed outside it.

## Try it

```bash
bun install && bun run build
claude --plugin-dir ./plugins/core      # loads the plugin for one session
```

Open the session inside a git repository and ask for a code change; the crew skill takes it from there. `node plugins/core/dist/crew.mjs status` shows where the work stands.

## What is next

SP1b adds the mod (a status strip and a `/crew` panel inside Claude Code) and the eval suite that measures the method on fixture projects.

## Documents

- [Vision](docs/vision.md): the whole system, its principles and its roadmap.
- [SP1 design](docs/specs/2026-10-06-sp1-engine-and-base-method-design.md): the first subproject, the engine and the base method.
- [SP1a implementation plan](docs/plans/2026-10-07-sp1a-engine-cli-and-plugin.md): engine, `crew` command, hooks, skill and plugin packaging, task by task.
- [SP1b implementation plan](docs/plans/2026-10-07-sp1b-mod-and-evals.md): the mod and the eval suite.

Part of the Shibaox family by WizardingCode. MIT licensed.
