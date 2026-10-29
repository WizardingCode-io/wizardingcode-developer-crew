# Packs

A pack is knowledge that installs apart from the core (vision §11): what a model gets wrong about a technology and how work in it is verified (a stack pack), the checklists the gap round reads for a domain (a domain pack), a team's path rule (a team pack). A pack is data the engine serves (ADR 0010): a folder with `pack.json`, `checklists/*.md`, `knowledge/<stack>.md`, a detector rule and a team template. It has no code, no agent, no hook and no skill of its own; this skill reads what the engine prints for it.

## What the engine does with a pack

- **Registers it**, after checking it whole: `crew pack add <path>` reads `pack.json` (the shape field by field), refuses a core range this engine does not satisfy, a named file missing or outside the pack's root, a secret in `pack.json` or any Markdown file, a path or glob that is absolute or climbs, a detector rule naming a core stack, a template that loosens anything, and a provenance entry without its measuring case. Nothing is written when a check fails. Under Claude Code, a pack installed from the marketplace is registered at session start without a command (`crew pack sync` runs that discovery by hand); a pack registered by hand is never touched by it.
- **Lists it with its state**: `crew pack list` says `ok`, `missing` (the folder is gone), `unreadable (<reason>)` or `changed since registration (<files>)`. Only an `ok` pack is served; `crew pack add <path>` again registers a changed one. `crew pack show <name>` prints the manifest's fields; `crew pack remove <name>` unregisters.
- **Refines the profile**: a stack pack's detector rule refines the core target of its folder (the gates it names, the package manager, the scoped test) and tags the target with its id, or adds a new stack. A pack's gate command enters the profile as proposed and is never run unseen: the gate says `unavailable: pack <name>'s command is not confirmed (crew profile confirm <gate>)` until a person confirms it in the project, as a guessed command is confirmed (`references/gate.md`); the hold stands on every runner, the e2e's and a todo's scoped test included, and `crew tdd red|green` without `--` refuses to run it with the same text. `crew profile` prints `testScoped=<cmd>` beside the gates with the same `[proposed]` and `(pack <name>)` marks; `crew profile confirm test` confirms a pack's scoped template with its test command.
- **Seats a team**: a team pack's template gives a `paths` team (agentic OS, the frontend) its globs; with `team.template` set to the template's name in `policy.json`, a changed file under a glob seats the team as the expert's knowledge seat, on standard and full, with the reason `pack <name> (<glob>)`. A template adds globs and nothing else: no cap, no removal, nothing seated always, nothing on the fast route.
- **Serves its files by path**: `crew pack files checklists <kind> [--item <id>]` prints the core's checklist of that kind first and the checklists the registered packs hold for it after, one absolute path per line, refuses a kind that is neither (naming the core's kinds), and records the kind read on the item named or on the active one (the way into Plan on standard and full; `crew pack files checklists none --reason "<why>"` records that no kind applies); `crew pack files knowledge <key>` the knowledge files for a stack or tag; `crew pack files knowledge --item <id>` the files the expert reads for an item (the stacks and tags of the targets its changed files sit in, plus `team.specialists` entries of the form `<pack>:<key>`), and records the packs served in the item (the report's Packs line).

## What this skill does with a pack

- **In the gap round** (`references/conclave.md`): the checklists for the kind are every path `crew pack files checklists <kind>` prints, the core's checklist of that kind first and the packs' after it; the command records the kind on the item, and Plan waits for a read.
- **In the debate**: each expert is launched with the paths `crew pack files knowledge --item <id>` prints under a `## Knowledge` line of its prompt; the expert reads them first and cites them as it cites the researcher's facts.
- **Never written**: a pack's files are the pack's own; the session reads them and the engine says when one changed.

## The trust a pack asks

A pack's Markdown enters an agent's context scanned for secrets, not for instructions: installing a pack is the same trust as installing the plugin. Install packs from the marketplace or from a checkout you read.

Under Claude Code the discovery reads `<config dir>/plugins/installed_plugins.json`, the config dir being `CLAUDE_CONFIG_DIR` when set and `<HOME>/.claude` otherwise: a session under another configuration directory registers and prunes against that configuration's plugins.

## Before a downgrade

A profile written with a pack registered holds the pack's commands and scoped test template as proposed with the pack's name, which this engine never runs unconfirmed. An engine before 0.11.0 reads them as plain proposed commands and runs them as it runs a core guess. So, before a downgrade to 0.10.0 or earlier, the complete way is `crew pack remove <name>` and `crew detect --refresh` in each project that detected the pack: a removed pack's proposed commands and scoped template leave the profile at the next detection. A pack the marketplace installed is uninstalled from Claude Code first (`claude plugin uninstall wizardingcode-pack-<name>@<marketplace>`), or the discovery registers it again at the next session start, before that start's profile refresh; otherwise run every refresh before any further 0.11.0 session starts. By hand, `crew profile unset <gate>` or `crew profile set <gate> "<cmd>"` replaces a gate's command and `crew profile set testScoped "<cmd>"` the template; `crew profile unset` takes gates alone, so a template left in place needs the set or the remove path.

## The manifest

```json
{
  "name": "wizardingcode-pack-laravel",
  "version": "0.1.0",
  "kind": "stack",
  "core": ">=0.11.0",
  "verifiedAgainst": { "laravel": "12.x" },
  "detectors": [
    { "stack": "laravel", "extends": "php", "markers": ["artisan", "composer.json"], "packageManager": "composer",
      "gates": { "test": "php artisan test", "lint": "vendor/bin/pint --test" }, "testScoped": "php artisan test {files}" }
  ],
  "checklists": ["checklists/eloquent-model.md"],
  "knowledge": { "laravel": "knowledge/laravel.md" },
  "team": null,
  "evals": ["pack-laravel-refines-the-gates"],
  "provenance": []
}
```

`kind` is `stack`, `domain` or `team`; `core` is `>=X.Y.Z`; `verifiedAgainst` names at least one technology with the version the content was verified against (vision §11); `team` is null or `{ "template": "<name>", "teams": { "<team>": { "mandatory": { "kind": "paths", "globs": [...] } } } }` for a `paths` team; `evals` names the cases that show the pack's difference (a pack ships only with them); `provenance` lists every outside source folded into the pack, each with the case that measured it.

## Writing a pack

1. Say what it is verified against. A knowledge file says what the model gets wrong, how the work is verified and where the current documentation is; never a tutorial the model knows.
2. Write its checklists in the four-list shape the gap round fills (assumed by good practice, decisions only the user can make, proposals, warnings).
3. Write its eval case first, run it with the core alone, then with the pack: it ships when the second run shows the difference.
4. An outside skill is folded in only with proof: write the case with the skill's claim as its criterion, run it before any line enters the pack, fold in what the case proved, run it again, and list the source under `provenance` with its case. The engine refuses a pack with provenance and no measuring case.
