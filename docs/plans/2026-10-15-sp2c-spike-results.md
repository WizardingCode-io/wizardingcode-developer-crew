# SP2c spike: the opener, the plugin in `claude -p`, SubagentStop, the eval sandbox

- Date: 2026-10-15. Claude Code 2.1.300. Plugin 0.4.0 installed at user scope (`wizardingcode-developer-crew@wizardingcode-plugins`); this repository's `plugins/core` is the same version.
- Each question: the command, the output (trimmed to what answers it; tokens, socket paths and proxy credentials masked), the answer in one line prefixed `- Answer:`. The later tasks of `2026-10-15-sp2c-mail-evals-and-hardening.md` read the answers as constants.
- Where the commands ran: the session's scratchpad folder, `spike/`, with four scaffolded repositories (`scratch-a` to `scratch-d`, one commit each), so that no run shares a checkout with another. Every `claude -p` here cost between 0.12 and 0.53 USD; the whole spike about 5 USD.

## A1. The user-scope plugin in `claude -p`

In `scratch-a`, with the three session variables unset so the run is a plain terminal's:

```sh
env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_CHILD_SESSION claude -p "Reply with the single word pong and nothing else." --permission-mode dontAsk --max-turns 1 --output-format json
```

Exit 0. The JSON (one object, 26 keys): `result: "pong"`, `session_id: "90d56479-72c4-4148-87a1-d1895809774f"`, `total_cost_usd: 0.456`, `num_turns: 1`, `duration_ms: 4389`, `is_error: false`, `subtype: "success"`, plus `type`, `usage`, `modelUsage`, `permission_denials`, `terminal_reason`, `subagent_stats`, `stop_reason`, `duration_api_ms`, `uuid`, `safety_stops`, `api_error_status`, `fast_mode_state`, `queued_turn_count`, `result_index`, `ttft_ms`, `ttft_stream_ms`, `time_to_request_ms`, `first_content_frame_ms`, `fast_mode_disabled_reason`. After the run `scratch-a/.crew/local/state.json` existed with that session id under `sessions` (the plugin's SessionStart hook ran, so the user-scope plugin loaded). The run's model was `claude-fable-5-1` (the account's default; the opener may want `--model`), and a one-word answer cost 0.46 USD because the system prompt of a session with every installed plugin is about 37k tokens of cache creation.

The same with `--plugin-dir /Users/andreagroferreira/AIProjects/wizardingcode-developer-crew/plugins/core --output-format stream-json --verbose`: exit 0, `result: "pong"`. The `system/init` message lists `plugins` with `wizardingcode-developer-crew` once, `path: …/wizardingcode-developer-crew/plugins/core`, `source: "wizardingcode-developer-crew@inline"`, `version: "0.4.0"`; `agents` holds each of the ten roles once; four `hook_started` events for SessionStart (one per plugin that has one, not two for the crew). `--debug` printed nothing about plugins to stderr in `-p`.

- Answer: yes, `claude -p` loads the user-scope plugin with no flag (its SessionStart hook ran in a fresh repository); `--plugin-dir` beside it does not conflict: a directory plugin with the same name takes the place of the installed copy (source `@inline`), one load, no duplicate agents.

## A2. A nested `claude -p` from a session

From this session's Bash tool (`CLAUDECODE=1`, `CLAUDE_CODE_ENTRYPOINT=cli`, `CLAUDE_CODE_CHILD_SESSION` set), in `scratch-a`, with nothing unset:

```sh
claude -p "Reply with the single word pong and nothing else." --permission-mode dontAsk --max-turns 1 --output-format json
```

Exit 0, `result: "pong"`, `session_id: "e947bed1-bc73-43e9-8000-21b65391fbfa"`, `num_turns: 1`, `total_cost_usd: 0.527`; `state.json` gained that session id (the plugin's hook ran in the child). The same command with `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_CHILD_SESSION` (A1's run) behaves the same. No error, no refusal, in either form. The eval sandbox is the one place a nested `claude -p` refused, for another reason (A6).

- Answer: a nested `claude -p` runs from a Claude Code session with `CLAUDECODE` set, with no refusal; unsetting the three variables changes nothing (A8 shows the child sets every `CLAUDE*` variable itself), so Task 4's `OPENER_STRIPS` is a precaution, not a requirement.

## A3. The read-only tool flags

In `scratch-b` (README.md, one commit), nested, three runs:

```sh
claude -p "List the files of this folder and reply with their names." --permission-mode dontAsk --max-turns 3 --output-format json --allowedTools Read Glob Grep "Bash(crew *)" --disallowedTools Write Edit MultiEdit NotebookEdit
claude -p "Create a file named x.txt with the word hi, then reply done." --permission-mode dontAsk --max-turns 3 --output-format json --allowedTools Read Glob Grep "Bash(crew *)" --disallowedTools Write Edit MultiEdit NotebookEdit
ls x.txt
claude -p "Reply pong." --permission-mode dontAsk --max-turns 1 --output-format json --allowed-tools "Read,Glob,Grep,Bash(crew *)" --disallowed-tools "Write,Edit"
```

Run 1: exit 0, `num_turns: 2`, the answer names `README.md`, `.crew` and `.git` (the plugin's hook had created `.crew/` at SessionStart), `permission_denials: []`. Run 2: exit 1, `is_error: true`, `subtype: "error_max_turns"`, `terminal_reason: "max_turns"`, `result: ""`, `num_turns: 4`; `permission_denials` holds one entry, `tool_name: "Bash"`, with the command `printf 'hi\n' > ".../scratch-b/x.txt" && cat ".../x.txt"`; `ls x.txt`: `No such file or directory`. Run 3 (comma-separated, hyphenated spellings): exit 0, `result: "pong"`.

- Answer: both spellings are accepted (`--allowedTools A B "Bash(crew *)"` space-separated and `--allowed-tools "A,B,Bash(crew *)"` comma-separated, likewise `--disallowedTools`/`--disallowed-tools`); `Bash(crew *)` lets no other Bash command through under `dontAsk` (`x.txt` was not created, the attempt is in `permission_denials`), and a session whose only way forward is denied burns its turns and exits 1 with `subtype: "error_max_turns"` and an empty `result`, which Task 4's `readOutcome` must read as an end (the opener's `--max-turns` is the cap).

## A4. The SubagentStop and SubagentStart payloads

In `scratch-c`, `.claude/settings.local.json` with two `tee -a` hooks (SubagentStop, SubagentStart) appending the payload to a file each, then nested:

```sh
claude -p "Use the Agent tool with subagent_type wizardingcode-developer-crew:researcher and the prompt 'Reply with the word pong and the number 42 on one line; read nothing.' Then reply with what it returned." --permission-mode dontAsk --max-turns 6 --output-format json
```

Exit 0; `subagent_stats.by_type: { "wizardingcode-developer-crew:researcher": 1 }`. SubagentStart payload, every field:

```json
{"session_id":"4f51d6af-69c7-4bb0-a6ee-2eb650095952","transcript_path":"/Users/…/.claude/projects/<project>/4f51d6af-….jsonl","cwd":"…/spike/scratch-c","prompt_id":"90a442f6-7b6a-4371-8758-e859be5e857b","agent_id":"aad044f3c3975e205","agent_type":"wizardingcode-developer-crew:researcher","hook_event_name":"SubagentStart"}
```

SubagentStop payload, every field (`last_assistant_message` whole):

```json
{"session_id":"4f51d6af-…","transcript_path":"…/4f51d6af-….jsonl","cwd":"…/scratch-c","prompt_id":"90a442f6-…","permission_mode":"dontAsk","agent_id":"aad044f3c3975e205","agent_type":"wizardingcode-developer-crew:researcher","effort":{"level":"medium"},"hook_event_name":"SubagentStop","stop_hook_active":false,"agent_transcript_path":"…/4f51d6af-…/subagents/agent-aad044f3c3975e205.jsonl","last_assistant_message":"pong 42","background_tasks":[],"session_crons":[]}
```

No `scratchpad_dir` field (the documentation lists it; absent on 2.1.300 in `-p`). `agent_id` is 17 hex characters starting with `a`.

- Answer: SubagentStop carries `session_id`, `transcript_path`, `cwd`, `prompt_id`, `permission_mode`, `agent_id`, `agent_type`, `effort.level`, `hook_event_name`, `stop_hook_active`, `agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons`; SubagentStart carries `session_id`, `transcript_path`, `cwd`, `prompt_id`, `agent_id`, `agent_type`, `hook_event_name`; `agent_type` of a plugin agent is exactly `wizardingcode-developer-crew:researcher` (so the `hooks.json` matcher anchors on `^wizardingcode-developer-crew:`); `last_assistant_message` is the agent's whole final text when the agent ends with text, and only its closing text when it hands back through `SubagentHandback` (A5 shows the judge's is its first sentence, useless alone).

## A5. Tokens and the hand-back in the agent transcript

The spike agent's transcript (`agent_transcript_path`, 14 lines, types `user`, `attachment` ×8, `api-request-shape`, `api-request-blob` ×2, `api-request`, `assistant`) has one `type: "assistant"` line whose `message.usage` is `{ input_tokens: 2, output_tokens: 6, cache_creation_input_tokens: 5623, cache_read_input_tokens: 0 }`, sum 5631. The parent transcript's tool result for that Agent call ends with `<usage>subagent_tokens: 5631 tool_uses: 0 duration_ms: 1527</usage>`: the sum of the four fields over the assistant lines equals the parent's figure exactly. A `.meta.json` sits beside each agent transcript (`agentType`, `description`, `toolUseId`, `spawnDepth`, `requestShape`, `requestNonInteractive`). Assistant lines also carry `requestedModel`, `agentId`, `effort`, `sessionId`.

The same rule applied to this session's real roles of item `2026-10-15-001` (sonnet reviewers, fable judge): code-quality reviewer 5 assistant lines, sum 136,895 (in 12, out 3,691, cache creation 76,796, cache read 56,396); test-quality reviewer 6 lines, 180,938; judge 25 lines, 965,631 (cache read 443,276 of it). The figures hand-copied into finding #26 (about 40k per reviewer, 71k for the judge) cannot be reproduced from the transcripts under any combination of the four fields; the engine's record (Task 3) replaces the hand-copied number for good, and Task 8 re-measures under this rule.

The hand-back: in both the reviewer's and the judge's transcripts the last `tool_use` named `SubagentHandback` has `input: { message: "…" }` with the whole report (the reviewer's findings file; the judge's ruling JSON). The judge's last text block is `"I will read the diff, the two findings files, the two rubrics and the spec."` (its first turn), so `last_assistant_message` is not the answer when a hand-back exists. The spike's researcher used no hand-back and its `last_assistant_message` was the whole answer.

- Answer: usage sits on `type: "assistant"` lines under `message.usage` with `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, and the sum of the four over the assistant lines equals the parent's `subagent_tokens` exactly (0 percent off, 5631 = 5631); the answer is the `message` input of the last `SubagentHandback` tool_use when the transcript has one (the roles of this plugin always do), else the last assistant text.

## A6. The nested opener inside the eval sandbox

A throwaway case `plugins/core/evals/spike-nested-claude` (fixture: a one-commit repository; prompt: run the nested `claude -p` of A1, then `env | grep -i -E 'HOME|CLAUDE|PROXY|SANDBOX'`, then `crew mail status`; grader: regex `"result"\s*:\s*"pong` on the trace), with `"Bash(env *)"` and `"Bash(claude *)"` added to `ALLOW_TOOLS` of `scripts/eval.ts` for the run; `bun scripts/eval.ts --case spike-nested-claude` (36 s, 0.12 USD), then once more with `--keep-temp` to read the trace. Both deleted and reverted after the run.

The nested `claude -p` inside the sandbox: exit 1, and its JSON says `"is_error": true, "terminal_reason": "api_error", "total_cost_usd": 0, "result": "Not logged in · Please run /login"`. The sandbox's environment, as the Bash tool inside it saw it: `CLAUDE_CONFIG_DIR=/private/tmp/e-<run>/config` and `CLAUDE_CODE_MANAGED_SETTINGS_PATH=/private/tmp/e-<run>/config` (a temporary configuration directory with no credentials), `CLAUDE_CODE_EVAL_CONFINED=1`, `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, `CLAUDE_CODE_TMPDIR=/private/tmp/e-<run>/tmp/claude-501`, `CLAUDE_CODE_SESSION_ATTENDED=0`, `CLAUDE_CODE_CHILD_SESSION=1`, `CLAUDE_CODE_ENTRYPOINT=sdk-cli`, `ALL_PROXY`/`HTTPS_PROXY`/`FTP_PROXY`/Docker and gcloud proxy variables pointing at `localhost:<port>` with per-run credentials (masked), `GIT_CONFIG_PARAMETERS` routing git through that proxy. The engine ran inside the sandbox: `crew mail status` printed `unknown command: mail` and the 0.4.0 help. The grader failed as expected (`pattern not found in trace`).

- Answer: no, the nested `claude -p` refuses inside the eval sandbox, not for the nesting or the network but because the sandbox's temporary `CLAUDE_CONFIG_DIR` holds no login ("Not logged in · Please run /login"); so Task 7's three mail cases are engine tests with the fake opener plus one recorded end-to-end run from a plain terminal, and the cases stay in the suite with the tag `needs-real-opener` and a README line.

## A7. The doorbell

`ListAgents` from this session before: two interactive peers (`<name>-5c [d8ac4c]`, `<name>-b9 [b89e07]`), each `interactive · idle`; this session is `wizardingcode-developer-crew-cb [8c43ff]`. In `scratch-a`, in the background:

```sh
claude -p "First run the Bash command 'sleep 40' and wait for it. Then reply with the word pong. If a message from another session arrived meanwhile, quote its text after pong." --name crew-spike --permission-mode dontAsk --allowedTools "Bash(sleep *)" --max-turns 4 --output-format json
```

`ListAgents` 27 seconds later: `crew-spike [f3a9ba] · interactive · busy · started 27s ago`. `SendMessage` to `crew-spike` with the text "Doorbell test: the crew spike rang you. Quote this line after pong." returned `success: true` ("in that session's inbox, not yet read by its Claude"). The session's result: `"pong\n\nChegou uma mensagem da sessão \"wizardingcode-developer-crew-cb\", que diz:\n\n> Doorbell test: the crew spike rang you. Quote this line after pong."`, `num_turns: 1`, `session_id: "ccb002d3-54bb-4217-bdcf-6e83fa83aec6"`: the message was delivered inside the running turn, at the session's next tool round, and the `-p` session saw the sender's name. A first attempt with a one-turn prompt finished in 4 s and was not listed afterwards: a finished `-p` session is not a listed peer (no five-minute hold showed in the listing), so a doorbell reaches a live session only, and the mailbox is the record either way. The `[ref]` (`f3a9ba`) is neither the session id nor the name; the hook payload's `session_id` is the string the registry records.

- Answer: yes, a `-p` session appears in `ListAgents` under the exact `--name` given (`crew-spike`), while it runs, as `interactive · busy`; its `session_id` in the hook payload (`ccb002d3-…`) is a different string from the name and from the listing's `[ref]`, so the registry records the hook's session id and the name the opener gave, and the doorbell line of `crew mail send` prints the name ("ring it with SendMessage to crew-M-…").

## A8. The harness variables a hook sees in `-p`

In `scratch-d`, `.claude/settings.local.json` with a SessionStart hook `env | grep -i CLAUDE | sort >> <scratchpad>/spike/env.txt`, two runs of `claude -p "Reply pong." --permission-mode dontAsk --max-turns 1 --output-format json`: one nested with this session's variables inherited, one with every `CLAUDE*` variable of this session unset (`env -u CLAUDE_CODE_ENTRYPOINT -u CLAUDE_CODE_MESSAGING_SOCKET -u CLAUDE_CODE_MESSAGING_TOKEN -u CLAUDE_CODE_EXECPATH -u CLAUDECODE -u CLAUDE_CODE_SESSION_ID -u CLAUDE_CODE_CHILD_SESSION -u CLAUDE_CODE_SESSION_ATTENDED -u CLAUDE_PID -u CLAUDE_EFFORT -u CLAUDE_CODE_VERSION`). Both exit 0, `pong`. The hook saw the same set in both runs, with the child's own values:

```
AI_AGENT=claude-code_2-1-300_harness
CLAUDECODE=1
CLAUDE_CODE_CHILD_SESSION=1
CLAUDE_CODE_ENTRYPOINT=sdk-cli
CLAUDE_CODE_EXECPATH=/Users/…/.local/share/claude/versions/2.1.300
CLAUDE_CODE_MESSAGING_SOCKET=<masked>
CLAUDE_CODE_MESSAGING_TOKEN=<masked>
CLAUDE_CODE_SESSION_ATTENDED=0
CLAUDE_CODE_SESSION_ID=<the child's own id; 24ba63f9-… nested, a71d9d56-… clean>
CLAUDE_CODE_VERSION=2.1.300 (Claude Code)
CLAUDE_EFFORT=xhigh
CLAUDE_ENV_FILE=/Users/…/.claude/session-env/<child session id>/sessionstart-hook-0.sh
CLAUDE_PID=<the child's pid>
CLAUDE_PROJECT_DIR=…/spike/scratch-d
```

`CLAUDE_CODE_CHILD_SESSION=1` and `CLAUDE_CODE_ENTRYPOINT=sdk-cli` mark every `-p` run, nested or not. `CLAUDE_CODE_SESSION_ATTENDED=0` in both runs (finding #19 held on 2.1.299; it holds on 2.1.300).

- Answer: `CLAUDE_CODE_SESSION_ATTENDED` is `0` in a `-p` session on 2.1.300, and a hook sees `AI_AGENT`, `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION`, `CLAUDE_CODE_ENTRYPOINT`, `CLAUDE_CODE_EXECPATH`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, `CLAUDE_CODE_SESSION_ATTENDED`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_VERSION`, `CLAUDE_EFFORT`, `CLAUDE_ENV_FILE`, `CLAUDE_PID`, `CLAUDE_PROJECT_DIR`, every one set by the child itself whatever the parent exported, so the opener strips none of them for correctness (Task 4 keeps `OPENER_STRIPS` to the parent's session-bound four, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_ENV_FILE`, `CLAUDE_CODE_MESSAGING_SOCKET`, `CLAUDE_CODE_MESSAGING_TOKEN`, as a precaution) and sets only its own `WIZARDINGCODE_CREW_MAIL_ID`, `WIZARDINGCODE_CREW_MAIL_AGENT` and `WIZARDINGCODE_CREW_MAIL_HOPS`.

## What the plan does with each answer

- A1 yes: the opener passes no `--plugin-dir` (`OPENER_PASSES_PLUGIN_DIR = false`); when the engine runs from a `--plugin-dir` checkout the child loads the installed copy, which is what a user has. Observed beside it: the child runs on the account's default model and the first turn costs about half a dollar, so Task 4 records the cost from the log's `total_cost_usd` and Task 8 weighs a `mail.model` key.
- A2 runs either way: `OPENER_STRIPS` is the precaution of A8, not a requirement; the opener is built and tested with the fake opener and exercised for real in Task 7's end-to-end run.
- A3: `READ_ONLY_FLAGS = ["--allowedTools", "Read", "Glob", "Grep", "Bash(crew *)", "--disallowedTools", "Write", "Edit", "MultiEdit", "NotebookEdit"]` as planned; `readOutcome` treats a final JSON line with `is_error: true` or a `subtype` other than `success` as an end with `outcome: "failed"` and the `result` text (or the `subtype`) as the reason.
- A4: the field names into `HookPayload` (Task 3: `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `prompt_id`, `permission_mode`, `effort`); the `hooks.json` matcher anchored on `^wizardingcode-developer-crew:`.
- A5: `roleTokens` sums the four usage fields over the `type: "assistant"` lines (`from: "transcript"`), 0 with `from: "none"` when no line has usage; `roleAnswer` takes the last `SubagentHandback` tool_use's `input.message`, else `last_assistant_message`.
- A6 refuses: Task 7's three mail cases are engine tests with the fake opener plus one recorded end-to-end run from a plain terminal; the cases stay in the suite with the tag `needs-real-opener` and a README line, and the suite run skips that tag.
- A7: the registry records the hook's `session_id` and the opener's `--name` (`crew-<message id>`); the "live session" line of `crew mail send` prints the name; a doorbell is attempted only for a listed live session and the mailbox stays the record.
- A8: the opener sets `WIZARDINGCODE_CREW_MAIL_ID`, `WIZARDINGCODE_CREW_MAIL_AGENT`, `WIZARDINGCODE_CREW_MAIL_HOPS` and strips the parent's four session-bound variables; the hooks keep reading `CLAUDE_CODE_SESSION_ATTENDED` for "unattended".
