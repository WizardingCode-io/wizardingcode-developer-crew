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
- Outcome: fixed in 0.1.3 by work item `2026-10-12-003-the-pretooluse-bash-rules-judge-each-sim`: each Bash rule judges one simple command at a time (`simpleCommands` in `packages/engine/src/hooks/shell.ts`: lines, then `;`, `&` and `|` outside quotes), so the engine file and the write verb must share a simple command. An opaque redirect target (`$F`, `$(…)`, a backtick) still fails closed over the whole command, since the variable may carry the path. The rule would have matched a third time while opening that very item: the `crew start` line, whose criteria name `.crew/profile.json` and `rm`, was run from a script file to get past the 0.1.2 hook.

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
- Cause, found in the session transcript on 2026-10-12: the Stop hook has honoured `awaiting` since 0.1.0 (case 3 of the Stop rule). What ended the wait was the prompt hook. The user typed a message while the agent was still working (17:59:26 UTC); Claude Code queued it and ran the UserPromptSubmit hooks at once, and `onPrompt` cleared the mark, five seconds after `crew await` set it and sixteen before the Stop ran. The rule "the user's next prompt ends the wait" assumed the prompt comes after the stop. The title of this finding names the symptom: the `await` was honoured in every other case that day.
- Outcome: fixed in 0.1.4 by work item `2026-10-12-005-the-wait-for-the-user-survives-a-prompt`: the wait is a permit for one turn to end, and the Stop that lets the turn end spends it (on any allow path, so one `await` buys one released turn and no more); the prompt hook only re-arms the block counter; a release of unproven work is kept in `work.json` (`pauses`) and listed in the report under Decisions, so a build paused half-way says so in its record.

### 5. A read-only probe of the hook was denied because `--mode` appeared in another simple command

- Date: 2026-10-12. Project: this repository. Item: none (a probe of the installed 0.1.2 bundle, in plan mode). Category: `blocks`. Severity: low.
- What happened: same cause as #2, on the other Bash rule. A command of the form `echo "… --mode in auto …"; printf '<a payload naming crew.mjs approve <id> spec>' | node …/crew.mjs hook pre-tool-use` was denied: "a person is present (plan mode); run the command without --mode so they are asked". `USER_ONLY` matched `crew.mjs approve … spec` inside the quoted JSON payload (quotes are stripped before matching, on purpose) and `MODE_FLAG` matched `--mode in` inside the `echo`, another simple command. Nothing in the command recorded a decision.
- Expected: the user-only rule and the `--mode` flag are read from the same simple command. With a person present the probe may still be asked, since its text does name the command; it must not be denied for a flag it does not carry.
- Evidence: this session (2026-10-12), the hook's message quoted above, with the 0.1.2 bundle installed at user scope.
- Outcome: fixed in 0.1.3, same item as #2. The fix also closes a hole the probe exposed: in an unattended mode, `echo --mode auto; crew approve w1 spec` satisfied the rule with a flag that was not on the crew command.

### 6. A criterion added to the wrong item cannot be removed

- Date: 2026-10-12. Project: this repository. Item: `2026-10-12-003-the-pretooluse-bash-rules-judge-each-sim` (the mistake landed on `2026-10-12-002-record-user-only-decisions-honestly-when`). Category: `friction`. Severity: low.
- What happened: a script opened item 003 and added its `preserve` criterion with `crew criteria <id> add`, taking the id from the first match in the `start` output; the first match was the previous item's id, in the warning "… is not proven and is no longer the active work item". The criterion `AC-6` landed on the delivered item 002. `crew criteria` has `add` only, and the agent may not edit `work.json` (the hook denies it, by design).
- Expected: `crew criteria <id> remove <criterion>` while the criterion has no test-first record, or at least before the item is proven. Until then the user removes the entry by hand and runs `crew accept <id>`.
- Evidence: `.crew/work/2026-10-12-002-record-user-only-decisions-honestly-when/work.json`, the sixth entry of `criteria`. The agent's own mistake caused it (`--json` and its `id` field would have been unambiguous); the finding is that the engine cannot repair the record.
- Outcome: fixed in 0.1.4 by work item `2026-10-12-004-crew-criteria-id-remove-ac-n-removes-an`: `crew criteria <id> remove <AC-n>` takes out a criterion that no test-first record or skip names (with either, or an unknown id, it refuses and the record is unchanged), keeps the removal in `work.json` (`removedCriteria`) and in the report under Decisions, and never reuses a number. Its first use took `AC-6` off item 002 with no hand edit and no `crew accept`; its second took a mis-kinded criterion off item 004 itself (#7).

### 7. `crew start --criterion` cannot add a preserve criterion, and an unknown flag is ignored in silence

- Date: 2026-10-12. Project: this repository. Item: `2026-10-12-004-crew-criteria-id-remove-ac-n-removes-an`. Category: `friction`. Severity: low.
- What happened: `crew start … --criterion "The existing criteria tests keep passing" --kind preserve` created four `behavior` criteria. `--kind` is read only by `crew criteria <id> add`; `start` ignored it without a word, and the criterion then demanded a red run that cannot honestly exist for "existing tests keep passing". The agent took it out with the new `remove` command and relied on the `test` gate, which is what the criterion restated.
- Expected: `start` takes the kind per criterion (for example a repeatable `--preserve "<text>"`), or refuses a flag it does not know. The fast route's "start with the criteria" cannot express a preserve criterion today.
- Evidence: `.crew/work/2026-10-12-004-crew-criteria-id-remove-ac-n-removes-an/report.md`, Decisions.
- Outcome: open. Workaround: `crew criteria <id> add "<text>" --kind preserve` after `start`, before the `before` run.
