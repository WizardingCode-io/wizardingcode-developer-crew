# ADR 0009: The knowledge base is the engine's own JSON file

- Status: accepted, 2026-10-19, the user's decision at the SP4 plan's review in this repository's session of that night.
- Context: the SP7 design (`docs/specs/2026-10-17-sp7-teams-agents-workflows-and-rules-design.md`, §12 and §18 decision 1), ADR 0007 (the open decision on the store), the SP4 plan (`docs/plans/2026-10-19-sp4-knowledge-base-learning-and-cto.md`, decisions 1 and 2), the security lead's return at the spec of SP4 Task 2 (every entry enters marked).

## Context

The SP7 design settled the knowledge base's content (five kinds of entry, each with its origin workspace and a confidentiality mark, read in Recognize and written at Learn) and left its store to one of two: the brand's memory plugin when it is installed, the engine's protected JSON otherwise (§18 decision 1). The memory plugin stores its notes in SQLite (`~/.wizardingcode/mem/wizardingcode-mem.db`). The engine is dependency-free and runs inside Claude Code's hooks on Node 20 or later: it cannot open a SQLite file there (`node:sqlite` arrives with Node 22 and is not a floor this product sets), and the lookup must run in `applyClassification`, deterministically, in every session, whether or not a plugin is installed.

## Decision

1. **The store is the engine's protected JSON, always**: `~/.wizardingcode/crew/knowledge/base.json` (honouring `WIZARDINGCODE_HOME`), `{ "version": 1, "next": <n>, "entries": [...] }`, read whole and written whole by the `crew` command under a lock on the `knowledge/` folder. The user directory is protected already: the PreToolUse hook denies any other writer.
2. **The memory plugin is a reader.** It already reads the crew's records under `.crew/`; it reads this file too, in its own release. The engine writes nothing into the plugin's store.
3. **A base the engine cannot read is never overwritten.** A missing file is created by the first write; a file that does not parse, carries a later `version` or has a wrong shape is refused with the reason, and the lookup lists nothing and says why.
4. **Every entry enters marked.** The engine's kinds (a validated solution, a root cause, a stack preference) are a client's code and data by nature; the user's kinds (`documentation`, `general`) are added with `crew knowledge add --file` from inside a project, which is the leak path the security lead named: text taken inside a client's project is that client's until a person says otherwise. An entry leaves its workspace by `crew knowledge unmark` alone, a person's decision with no unattended form, as an audit's signature is. The design's "false by default for documentation and general knowledge" is read as "may be unmarked", by that person.
5. **Visibility is one function.** An unmarked entry is read everywhere; a marked entry inside its workspace; with no workspace on either side, inside the project it came from, told by the main checkout's real path, never by a folder's name. A hidden entry is not listed, not counted, not cited, and the refusal of `show`, `contradict` and `unmark` reads as an unknown id's.

## Consequences

- One file per user, a few megabytes at most (an entry's text is cut at 4000 characters), read in a hook at every classification.
- `version` tells a later shape apart; this release has no removal of an entry and no migration.
- The eval cases seed the base by writing the file under the sandbox's `WIZARDINGCODE_HOME`.
- The memory plugin's reading of the file is its own work, outside this repository.
