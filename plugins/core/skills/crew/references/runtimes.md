# Runtimes

The method is one; the runtime changes what is enforced. The engine holds one table (`crew runtime list`): per runtime, the events its hooks give, how its payload is read into the engine's and the engine's answer written in its shape, where its hook configuration, skills and agents live, and what each guarantee of the method is there. A guarantee is `enforced` only where the runtime's official page documents the mechanism; elsewhere it is `requested (<why>)`, and this page and `crew runtime check <name>` print the same lines (ADR 0011; the pages read on 2026-10-20).

## The actions the skill names

The skill names actions, not tools. What each runtime does for them:

- **Launch a role.** In Claude Code, one Agent call by the role's scoped name (`wizardingcode-developer-crew:<role>`). Elsewhere, the role is an agent `crew runtime install` generated under a name crew owns, `crew-<role>` (`crew-tech-lead`, `crew-review-security`), in the runtime's agents folder and format; launch it as the runtime launches a subagent, with the same prompt.
- **File an answer.** Where the runtime has a subagent-stop event the engine's hook files the role's answer (the table says `the roles' answers filed: enforced`). Where it says `requested`, save the role's answer to a file and run `crew answer file <id> --role <role> --file <path>` (`--as <agent>` to resume a record, `expert-2`); the record says the session filed it, and the judgement, the validation and the gate run print `answers filed by the session: <roles>`. A session's filing never clears a role wait: `crew resume <id>` does. On a runtime whose hook files the answers the command is refused.
- **Read the status.** `crew status`, as everywhere; where no context reaches the session at start (OpenCode), run it first.
- **Confirm a decision.** On every runtime but Claude Code an `ask` the engine answers becomes a `deny` (Codex parses `ask` and continues the call, Cursor does not enforce it, Gemini has none, Copilot's behaviour across modes is not documented, OpenCode throws or nothing): a person-only command cannot be approved through the agent there, so the person runs it (`crew approve`, `crew skip`, `crew profile confirm`, …).

## Install, check, remove

`crew runtime install <name> [--scope project|user]` writes, and prints every file written, one absolute path per line:

| Runtime | Hook configuration (project · user) | Skills | Agents | Trust step |
| :- | :- | :- | :- | :- |
| `codex` | `.codex/hooks.json` · `~/.codex/hooks.json` | `.agents/skills/crew-method/` | `.codex/agents/crew-<role>.toml` | review and trust the hook in `/hooks` before it runs; a changed hook is skipped until trusted again |
| `cursor` | `.cursor/hooks.json` · `~/.cursor/hooks.json` | `.agents/skills/crew-method/` | `.cursor/agents/crew-<role>.md` | none |
| `copilot` | `.github/hooks/crew.json` · `~/.copilot/hooks/crew.json` | `.agents/skills/crew-method/` | `.github/agents/crew-<role>.agent.md` | none |
| `gemini` | `.gemini/settings.json` (the `hooks` key) · `~/.gemini/settings.json` | `.agents/skills/crew-method/` | `.gemini/agents/crew-<role>.md` | the first run warns about the new hook; a changed command is warned about again |
| `opencode` | `.opencode/plugins/wizardingcode-crew.js` · `~/.config/opencode/plugins/wizardingcode-crew.js` | `.agents/skills/crew-method/` | `.opencode/agents/crew-<role>.md` | none |

Claude Code is installed as a plugin (`claude plugin install wizardingcode-developer-crew@wizardingcode-plugins`), never with this command. The hook configuration is merged: crew's entries (the commands that run `crew.mjs hook`) replace crew's own and every foreign entry stays, so a reinstall writes the same file and a user's hooks are never lost; a file that is not JSON is refused naming it, nothing written. The skill is copied whole under `crew-method` (the Agent Skills standard asks the folder to carry the skill's name; every runtime reads `.agents/skills`). The agents are generated from the plugin's pages: read-only where the page's tools are (Cursor `readonly: true`, Gemini `tools: [read_file, grep_search]`, Copilot `tools: ["view", "grep", "glob"]`, OpenCode `permission: { edit: deny, write: deny, bash: deny, apply_patch: deny }`; Codex documents no tools field). The hook commands name the absolute folder of the running bundle (`node <root>/dist/crew.mjs hook <event> --runtime <name>`): a moved or updated checkout needs `crew runtime install` again, and `crew runtime check <name>` says so.

`crew runtime check <name> [--scope project|user]` (project then user when no scope is named) prints the configuration found (or `missing: <project path> | <user path>`, or `config: <path> holds no crew hook`), `root: <root> ok` (or `missing dist/crew.mjs`), one line per event (`<event>: <runtime event> ok | none | failed (<why>)`, the adapter run on the recorded sample), `skill: ok | missing | stale (<n> files differ)` and `agents: …` by sha256 against the root's sources, the guarantee lines below, and the trust step; exit 1 on anything missing, stale, failed or foreign.

To remove: `crew runtime remove <name> [--scope project|user]`, the rollback of the install. It takes crew's entries out of the merged configuration and keeps every foreign entry and every other key (the file is rewritten; a file crew alone filled, and OpenCode's plugin file, are deleted), removes `crew-method/` (one folder per scope, shared by every runtime installed there) and the agents under `crew-` names, keeps the user's own, and prints each path as `rewritten <path>` or `removed <path>`; with nothing of crew's found it says so and exits 0; a configuration that is not JSON is refused as at install. Never delete the configuration by hand: it holds the user's own settings. Nothing of the engine's state changes. Packs reach these runtimes with `crew pack add <path>`: the discovery at session start reads Claude Code's plugin registry alone.

## What the hook does with the runtime's calls

- `crew hook <event> --runtime <name>` reads the runtime's payload (stdin) into the engine's, answers through the same rules as Claude Code's, and writes the answer in the runtime's shape with exit code 0; an unknown runtime prints nothing on stdout, `unknown runtime <name> (crew runtime list)` on stderr and exits 1 (Copilot then denies the call on `preToolUse`, Cursor proceeds unchecked, Gemini warns, Codex continues); a hook that cannot decide answers `{}`.
- A `systemMessage` the runtime has no field for is kept as a notice the next context carries (Codex and Gemini show it; Cursor's `user_message` carries it on `preToolUse` and `beforeSubmitPrompt`; Copilot and OpenCode have none).
- A patch (Codex's `apply_patch`, Copilot's `Edit` or `create` carrying `*** Begin Patch`, OpenCode's `apply_patch`) is read as a write of every path its hunks name (the grammar from openai/codex's parser source: Add, Update, Delete, Move to), each made absolute against the session's working folder, so a patch on an engine-owned file is denied by path and the phase rule applies; the shell text rule is not involved.
- Copilot's `powershell` is denied when its text names an engine file at all, with either separator (the POSIX write shape knows nothing of `Set-Content` or `Remove-Item`); the line then reaches the command rules as a POSIX shell would read it. The reader is `packages/engine/src/hooks/powershell.ts`: its module comment is the grammar, form by form, and ADR 0011's last consequence the bounded subset of pwsh's argument mode it reads and the pwsh 7 run that checked it. It folds the literal forms it recognises (a backslash path as a slash path, the call operator, `pwsh -Command`, `Invoke-Expression`, `cmd /c` with `call` and `start`, `Start-Process` and `start`, literal strings joined by `+`, an evaluator or a script block given one literal string, a `#` line comment where both of PowerShell's modes start one, the rest handed to `pwsh -c` read as pwsh reads its arguments) and decodes nothing beyond a quoted part's doubled quote; a line whose text it cannot place (the module comment lists the forms; the crew word wherever it stands in a command the reader did not read as crew and did not hand on is among them, a commit message's included) is asked in every policy naming the mark, and denied where nobody watches, in a session opened by mail and on Copilot, which answers every ask of the engine as a deny; the ways out are in the reasons: the crew word's names the file form, the folder's slash and a file's folder or a glob (`git commit -F <file>`, `crew/`, `bin/cre[w]`), the comma's is `quote the list as one word (--criteria "AC-1,AC-2"), or write the words apart`, the unplaced `#`'s is `write a space before the #, or quote it`. What neither reader follows, a crew command built without the word on the line (a variable holding the program or a word, a script file, a string piped from elsewhere, a word built by an expression), is why the Copilot row's guarantee of the denial of forbidden commands is `requested` for its `powershell` tool, so a person's decision through `powershell` is read as through bash and denied on Copilot, where an ask is a deny; a `crew` at a command position the reader could not account for (a script block, whatever opens it; a hand-on it does not follow) is a crew command the hook cannot read: asked naming the way out (`write it plainly, one crew command per line`) in every policy, `relay` included, since the hook cannot tell what it would relay (on Copilot that ask is a deny), denied where nobody watches or in a session opened by mail, a reading verb inside a block and an assignment of crew's output included, while a folder with its slash (`crew/`, `.crew`), a file of another name (`crew.log`) and a word that contains `crew` are read as text. Cursor's `Delete` goes through the Write rule. A tool the table does not map keeps its name and reaches no rule (it is read-only in every documented case).
- The hook verb runs from a runtime's hook configuration alone, never from a command: a session's Bash call of `crew hook` (a person's own debugging call included, by design; the tests call the CLI in-process) is denied, so an item's observed runtimes (`work.runtimes`, what the hooks saw, printed in the report's Team section) cannot be declared by hand.
- The hold at Stop: the engine's own cap of three blocks binds first on every runtime; Cursor's entries are written with `loop_limit: null` (its default of 5 would cut the hold), Copilot overrides after eight consecutive blocks, Codex and Gemini document no cap. Copilot's `preToolUse` fails closed when the hook process crashes or `node` is missing: the call is denied there.
- Cursor says it loads Claude Code hooks: crew's live in the plugin's own `hooks.json`, not in `.claude/settings.json`, so no double run is expected; a real-use session verifies it.
- Gemini CLI was replaced by Antigravity CLI for unpaid and Google One users on 2026-06-18 and remains on paid API keys and enterprise Code Assist; the `gemini` row targets Gemini CLI, and Antigravity CLI (another hook format) is a later row.

## The guarantees per runtime

What `crew runtime check <name>` prints, from the pages (a requested line names what the page does not document).

### Claude Code
- context at start: enforced
- the status line per prompt: enforced
- the denial of engine files: enforced
- the denial of forbidden commands: enforced
- the hold at Stop: enforced
- the roles' answers filed: enforced
- the roles read-only: enforced

### Codex CLI
- context at start: enforced
- the status line per prompt: enforced
- the denial of engine files: enforced
- the denial of forbidden commands: enforced
- the hold at Stop: enforced
- the roles' answers filed: requested (the page does not say that agent_type names a custom agent)
- the roles read-only: requested (no tools field is documented for a Codex agent)

### Cursor
- context at start: enforced
- the status line per prompt: requested (beforeSubmitPrompt carries no context field)
- the denial of engine files: requested (the Write and Delete path fields are not documented; Shell is denied)
- the denial of forbidden commands: enforced
- the hold at Stop: enforced
- the roles' answers filed: requested (subagentStop gives a summary, not the transcript's last message, and the transcript format is not documented)
- the roles read-only: enforced

### GitHub Copilot CLI
- context at start: enforced
- the status line per prompt: requested (UserPromptSubmit carries no context field)
- the denial of engine files: requested (the create, edit and apply_patch input fields are not documented; file_path, path and filePath are tried and patch text is parsed; bash is denied)
- the denial of forbidden commands: requested (the powershell tool's lines are read by text and rewritten for the POSIX reader, so a crew command built without the word crew on the line may pass, and a line that names the word outside a crew command, or a crew command with an unquoted comma list, is denied, since Copilot answers every ask of the engine as a deny; bash is enforced)
- the hold at Stop: enforced
- the roles' answers filed: enforced
- the roles read-only: enforced

### Gemini CLI
- context at start: enforced
- the status line per prompt: enforced
- the denial of engine files: enforced
- the denial of forbidden commands: enforced
- the hold at Stop: enforced
- the roles' answers filed: requested (no subagent event)
- the roles read-only: enforced

### OpenCode
- context at start: requested (no context injection, and the session id field of session.created is not documented: the skill's first step runs crew status)
- the status line per prompt: requested (no prompt hook)
- the denial of engine files: requested (the write, edit and apply_patch argument names are not on an official page; filePath is tried)
- the denial of forbidden commands: enforced
- the hold at Stop: requested (no stop hook: the record says the turn's end was not held)
- the roles' answers filed: requested (no subagent event)
- the roles read-only: enforced

## The distribution

The plugin folder is the distribution on every runtime: the release attaches `wizardingcode-developer-crew-<version>.tar.gz` (the folder under one name, `bin/crew` executable, no evals). Extract it, put the extracted `bin/` on PATH, and run `crew runtime install <name>` in the project; `crew runtime check <name>` proves the install and `bin/crew --version` the bundle.
