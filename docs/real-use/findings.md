# Real use: findings

One entry per finding. Categories are defined in [`README.md`](README.md). The evidence stays in the project's `.crew/work/<id>/`; the path here is the pointer. Outcomes: `open`, `fixed in <version>`, `deferred to SP<n>`, `won't fix`.

Severity: `high` blocks work or proves falsely; `medium` costs a step or a decision the user did not want; `low` is wording or a few seconds. A finding that repeats gets a new row with "same as #n" in "What happened", so frequency is visible.

## Findings

### 1. The risk path `**/session*` matched a hook named after a Claude Code event

- Date: 2026-10-12. Project: this repository. Item: `2026-10-12-001-close-the-sp1-loose-ends-workspace-cover`. Category: `route`. Severity: medium.
- What happened: the default risk path `**/session*` (`DEFAULT_RISK_PATHS.auth` in `packages/engine/src/classify.ts`) matched `plugins/core/hooks/session-start.ts`, and the gate run raised a workspace-coverage and docs item to the full route ("touches auth paths"). Delivering an item that was already proven then required the user's spec approval and a `plan.md`.
- Expected: a hook named after the `SessionStart` event is not a session store. The item should have stayed on the standard route.
- Evidence: `.crew/work/2026-10-12-001-close-the-sp1-loose-ends-workspace-cover/work.json` (`routeReasons`). First noted in `docs/plans/2026-10-07-sp1a-e2e-results.md`, "Two side observations".
- Outcome: open. The risk paths are tuned in SP3 by replay; a cheaper fix is a per-repository exclusion in `policy.json`.

### 2. A Bash command that writes a document mentioning `.crew/` paths is denied

- Date: 2026-10-12. Project: this repository. Item: none (writing `docs/real-use/`). Category: `blocks`. Severity: medium.
- What happened: a compound Bash command created three files under `docs/real-use/` with heredocs and then ran `sed -i` on `CLAUDE.md`. The text of one document names `.crew/work/<id>/work.json`. The PreToolUse hook denied the whole command: "files under .crew/ and ~/.wizardingcode/crew that the engine owns are written only by the crew command". Nothing in the command wrote under `.crew/`.
- Cause, confirmed by two probes: `ENGINE_FILES` and `WRITE_SHAPE` (`packages/engine/src/hooks/pre-tool-use.ts`) are tested independently over the whole command text. `ENGINE_FILES` matches an engine-owned file name anywhere, including inside a heredoc or a quoted string; `WRITE_SHAPE`'s verb branch (`rm`, `mv`, `cp`, `tee`, `sed -i`, …) matches anywhere too, with no look at the verb's argument. So `echo "… .crew/work/x" > docs/f && rm docs/f` is allowed (no engine file name), and `echo "… .crew/work/x/work.json" > docs/f && rm docs/f` is denied. Only the redirect branch of `WRITE_SHAPE` ties the write to an engine path.
- Expected: a verb counts as a write into an engine file only when the engine path is an argument of that verb, or at least appears in the same simple command (between `;`, `&&`, `||`, `|`). The hook's own comment chooses fail-closed over an exemption for `crew` prefixes; that choice does not require ignoring the verb's argument.
- Evidence: this session (2026-10-12), two probes as above. Workaround: the Write and Edit tools, whose check sees only the file path.
- Outcome: open. Anyone documenting the engine in a repository where the plugin is active hits it, and so does any script that mentions `work.json` and also calls `rm` or `sed -i`.

### 3. In auto mode, `crew approve` ran with no prompt although the hook answered "ask"

- Date: 2026-10-12. Project: this repository. Item: `2026-10-12-001-close-the-sp1-loose-ends-workspace-cover`. Category: `false-proof` (the record claims a user decision that did not happen). Severity: high.
- What happened: the agent ran `node plugins/core/dist/crew.mjs approve <id> spec` in a Claude Code 2.1.296 session in auto mode. The PreToolUse hook answered `permissionDecision: "ask"` ("this command records a decision that only the user can take"), exit code 0, in about 40 ms. The command ran anyway, and `work.json` now records the spec as approved. The user confirmed that no prompt was shown.
- Expected: the Claude Code docs (code.claude.com/docs/en/hooks) say a hook's "ask" forces a permission prompt in auto mode: "the classifier can still deny the tool call, but it can't approve the call silently". Whatever the host does, the engine's record must not say the user approved when no person decided.
- Cause: not in the engine. Both bundles (the working tree's and the installed 0.1.1) answer "ask" for that exact command in `default`, `auto` and `bypassPermissions`, verified by piping the payload to `crew hook pre-tool-use`. The session transcript holds the hook result ("ask") and, for the same tool call, the result "spec approved". Claude Code did not turn the "ask" into a prompt. The hook payload carries `permission_mode` (`auto` here), so the engine could have known that no prompt was guaranteed.
- Evidence: session transcript `~/.claude/projects/-Users-andreagroferreira-AIProjects-wizardingcode-developer-crew/0092c966-ddf2-448f-9fc7-bf2e06ec8d01.jsonl`, tool use `toolu_01MKPCkjeyt3fKGAiLXvokWa`, 2026-10-12T16:13:58Z; `.crew/work/<id>/work.json`, `approvals`. In this instance the user had approved, minutes earlier, the plan that said to deliver this item, so the decision itself was the user's; the record's claim about how it was taken is what is false.
- Outcome: fixed in 0.1.2 by work item `2026-10-12-002-record-user-only-decisions-honestly-when` (the first consequence below; the second stays open for SP2).
  1. Short-term, 0.1.x: the engine cannot trust "ask" to reach a person. When `permission_mode` is `auto`, `bypassPermissions` or `dontAsk`, a user-only command is recorded as taken without a person (who, and in which mode), never as the user's; whether such a record satisfies the full route is the user's policy, set once, not a silent default. The same applies to `skip`, `profile confirm`, `accept` and `policy accept`.
  2. The hybrid requirement (the user, 2026-10-12): a team of agents may run 24 hours unattended, so these decisions need a validator, an independent role that approves on evidence under rules and is recorded as the validator, not a hard stop. The conclave's judge in SP2 is the candidate; see the SP2 input in [`README.md`](README.md).

### 4. A build cannot be paused half-way: `crew await user` does not release the Stop hook

- Date: 2026-10-12. Project: this repository. Item: `2026-10-12-002-record-user-only-decisions-honestly-when`. Category: `friction`. Severity: medium.
- What happened: the session hit its usage limit after AC-1 of five was red and green. The item was marked `crew await <id> user`. The Stop hook still blocked the turn: "watched source files changed and the work is not proven", offering only `crew gate run` (which cannot prove an item with four criteria still open) or `crew skip` (dishonest for work that is not done). The only honest exit was `git stash` of the three changed files, which leaves the engine's red and green records pointing at code that is not in the tree until the stash is popped.
- Expected: a way to stop with work in progress that claims nothing: an explicit "paused, not proven" state the report shows, released by the user's next prompt, so a session can end for reasons outside the method (limits, time, a question the user must answer) without faking proof or hiding the diff.
- Evidence: this session, the Stop hook's message quoted above; `git stash list` entry "wip 2026-10-12-002 AC-1".
- Outcome: open. Candidate for 0.1.x: `crew await <id> user` lets the Stop hook release the turn once, with the unproven state printed, and the next prompt's hook says so again.
