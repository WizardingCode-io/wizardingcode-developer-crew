# ADR 0010: packs are data the engine serves

- Status: accepted, 2026-10-20 (SP6 Task 2)
- Deciders: the user, the crew

## Context

The vision says the core is small and knowledge installs separately, in packs that depend on the core (§11, §14): stack packs that carry what a model gets wrong about a technology, how work in it is verified and where its documentation is; domain packs that carry the gap round's checklists; a team pack that gives a path team its paths (SP7 design §6.3, agentic OS). The engine had the seams (`team.template`, `team.specialists`, the `agentic-os` team with a `paths` rule and no paths, the SP1 design's "packs can ship detectors") and nothing behind them. A pack has to reach three readers: the engine (the profile's gates, the team registry), the skill (the checklists) and the expert (the knowledge files).

Three shapes were on the table:

1. A pack as a plugin of its own, with its skill, its agents and its hooks, installed beside the core.
2. A pack copied into the user's crew directory by an engine command, served from the copy.
3. A pack as a folder of data the engine registers and serves by path, installable as a marketplace plugin or from a path.

## Decision

A pack is data the engine serves. It is a folder with `pack.json`, `checklists/*.md`, `knowledge/<stack>.md`, detector rules and a team template as JSON, and nothing that runs: no code, no agent, no hook, no skill. The engine registers it per machine (one file per pack under the user's crew directory, written only by the `crew` command under a lock), checks it whole before registering (the shape field by field, the core range, every named file under the root's real path, a secrets scan of `pack.json` and the Markdown, no path or glob that is absolute or climbs, no rule naming a core stack, no template that loosens, no provenance without its measuring case), serves its files by absolute path (`crew pack files`), reads its detector rules with the core detectors, and merges its template into the team registry without ever removing or loosening. A pack's gate command enters the profile as proposed and runs only once a person confirmed it in the project. Under Claude Code the packs the marketplace installed are discovered at session start from the plugin registry, read-only and fail-open; everywhere else `crew pack add <path>` registers a checkout.

The names: `wizardingcode-pack-<name>`, kept in this repository under `packs/<name>`, published as a `git-subdir` entry of the `wizardingcode-plugins` marketplace at the release tag, each with its evals in the core's suite.

## Consequences

- One skill and one expert, whatever the packs: a pack changes what they read, never what they say. Every agent description costs every session (finding 60), so a pack adds none.
- Shape 1 is rejected for that cost and for the second copy of the method it would carry. Shape 2 is rejected for the two copies to keep in step: the engine says `changed since registration` instead, and serves nothing until the pack is registered again.
- A pack cannot loosen: a template adds globs to a `paths` team and nothing else; a rule refines or adds and never removes; a command the user never saw never runs.
- The trust a pack asks is the plugin's: its Markdown enters an agent's context scanned for secrets, not for instructions.
- A pack ships only with the evals that show its difference against the core alone, and an outside skill enters a pack only with the case that measured its claim, listed under `provenance`.
- A downgrade needs a hand: a profile written with a pack registered holds the pack's commands as proposed with the pack's name, which an engine before 0.11.0 runs as a plain proposed command. `references/packs.md` says what to unset or remove before a downgrade; a removed pack's proposed commands and scoped template leave the profile at the next detection.

## Note of 2026-10-27 (SP9 Task 9)

Four things the packs of SP9 needed from the engine, decided with the plan of 2026-10-26: a detector rule's marker may carry braces (`nuxt.config.{ts,js,mjs}`), expanded as the glob reader expands them and matched when any expansion exists, a marker past the reader's cap or left unexpanded refused at registration; a rule that `extends` a core stack may leave `packageManager` empty to keep the core target's manager (the lockfile's or the declared one), while an empty one on a rule without `extends` is refused, never defaulted; the `## Sources read on <date>` heading dates each pack's README on its own, with a real UTC date on or before the day the content test runs; and the versioned documentation hosts the content test knows are `laravel.com/docs/<version>/`, `nuxt.com/docs/<version>/` and `livewire.laravel.com/docs/<version>/`. One team template per project stays (`frontend` and `agentic-os` do not apply together); a list of templates is a later item.
