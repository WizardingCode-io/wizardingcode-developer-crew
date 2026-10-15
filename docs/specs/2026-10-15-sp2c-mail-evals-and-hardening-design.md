# SP2c: mail between agents, the team of an item, the evals and the hardening

> **Status:** design, approved by the user on 2026-10-15; its plan is `docs/plans/2026-10-15-sp2c-mail-evals-and-hardening.md` (eight tasks, release 0.5.0). It brings SP5 (session mail, vision §10) forward into SP2c because the user set it as the point of the product on 2026-10-15: "the agents must have a messaging system where they converse with each other". Builds on the SP2 design (`2026-10-14-sp2-conclave-and-judgement-gates-design.md`) and on the first real use of 0.4.0 (`docs/real-use/findings.md` #24 to #26). Releases as 0.5.0 at the close.

## 1. Summary

The crew becomes a team that talks and leaves a record. The engine is the local mailbox: every message between agents, roles, items and projects is written by the `crew` command, kept under the user's crew directory, copied into the item it concerns, and shown in the report. Four message types (question, change request, notice, blocker), the vision's three fixed rules (high risk always waits for a person; a session the system opens never merges or deploys; limits on concurrency, hops, turns and minutes), and one new rule the user set: **mail never leaves the workspace.** A workspace is a name each project declares in its policy; projects that share it see each other and nothing else.

The same mechanism gives an item a team. A task of the plan can be handed to a temporary implementer: a change request to the project itself, which opens a worktree on a branch and a headless session that runs the method as a child item with its own evidence, never merges, and ends with the branch, the evidence and a reply. The lead merges and proves the whole. Implementers ask each other and the lead questions through the mailbox; the conclave's roles get one reply round through the lead, recorded as relayed, with the engine's addressing keeping their independence.

SP2c also closes what the SP2 design left for its last part: the eight eval cases of §15 plus three for mail, the fast-route-overhead re-measurement, a wait the Stop hook honours while a role or a reply is pending (finding #25), tokens per role recorded by the engine from the SubagentStop hook instead of filled by hand, and the advisories of the first judged item.

## 2. Goals and non-goals

Goals:

- One mailbox, two uses: the team of an item (implementers and roles) and mail between the projects of a workspace. Same record, same rules, same commands.
- Every message is a record the report shows: who, to whom, what type, about which item, what happened to it.
- The engine refuses what the rules and the receiving project's policy do not allow, and says why.
- A session the system opens is bounded in every dimension the vision names, visible in `crew mail status`, and stoppable.
- The evals of SP2 run and are recorded; the overhead of the fast route is unchanged.

Non-goals (unchanged from vision §17):

- An orchestrator that drives agents with no person present. Opened sessions follow the method under the receiving policy's validator; high risk waits for a person.
- Mail across workspaces. Not a setting; refused.
- A hosted or networked mailbox. The mailbox is this machine's; two machines are SP6's problem.
- Agent teams of Claude Code (experimental, interactive only, off by default) as the mechanism. The design uses what works in every mode: files, `claude -p`, and the harness's cross-session message as a doorbell only.

## 3. Terms

| Term | Meaning |
| :- | :- |
| Workspace | A name declared in a project's `policy.json` (`mail.workspace`). The boundary of mail. A project without one is alone. |
| Project | A repository the engine has seen, registered in `~/.wizardingcode/crew/projects.json` with its root, name and workspace. |
| Mailbox | `~/.wizardingcode/crew/mail/<workspace>/<project>/`: the project's inbox and outbox, engine-owned, protected like the ledger. |
| Message | One record: id, time, from, to, type, subject, body, item, hops, status, and the reply it answers. |
| Lead | The session that holds an item and opens tasks for it. |
| Task | A unit of the item's plan handed to an implementer: `T-n`, with the criteria it covers. |
| Child item | The work item an implementer runs in its worktree for one task; its evidence is its own. |
| Implementer | The headless session the engine opens for a task: a change request from the project to itself. |
| Role | A plugin agent (reviewer, judge, debate role): read-only, one answer, resumable with its context. |
| Doorbell | The harness's message to a live session or a named subagent, telling it mail is waiting. Never the record. |
| Opened session | A `claude -p` session the engine starts to answer or to build: read-only for a question, on a branch for a change request. |

## 4. What real use taught

- The first judgement gates (2026-10-15, finding #26): reviewers answer in twenty seconds, the judge in three to five minutes, and the session has nothing to do but wait; the Stop hook blocked the turn end while the judge was running (finding #25). A wait for a role is as legitimate as a wait for the user.
- The session copied each role's answer into `review/` by hand and filled `tokens` from the harness's usage line. The engine could take both from the SubagentStop hook, which carries the agent type and its last message.
- The deferred findings of the SP2b review lived in a disposable workspace (finding #24). Everything a review leaves goes into the repository: `docs/real-use/findings.md` or the item's record.
- Roles are one-shot. The devil's advocate's case never reaches the expert; the judge cannot ask a reviewer where a line is. A reply round is cheap now that a finished subagent resumes with its context intact.
- The user's own words: work must look like a well-organised human team; temporary agents for several tasks when useful; agents that message each other, inside a workspace, never across.

## 5. Behaviour, by example

**A task in this repository.** The lead has item `…-042-…` on a branch `crew/042`, with `plan.md` naming three tasks; T-2 touches only `packages/engine/src/evidence.ts` and its test. `crew task …-042-… open T-2 --criteria AC-3,AC-4` records a change request from this project to itself, makes the worktree `../wizardingcode-developer-crew-042-T-2` on branch `crew/042/T-2` from the lead's last commit, and starts `claude -p` there with the task's brief. The implementer runs the method on its route (fast: criteria, red, green, gates), commits, and ends with `crew mail reply M-… --branch crew/042/T-2 --item …-001-…`. The lead reads "T-2 answered: proven, branch crew/042/T-2", reads the child's report, `crew task …-042-… merge T-2`, and its own gate run proves the merged tree; the judgement gates see the parent's diff, T-2 included. The report's "Mail" section lists the request and the reply; "Tasks" lists T-2 with the child id, the branch and the verdict.

**A question from the storefront to the CRM.** Both projects declare `mail.workspace: clubefashion`. The storefront's session, on its item, runs `crew mail send --to crm --type question "Does POST /customers accept a loyalty_tier field, and which values?"`. The engine writes the message into the CRM's inbox, copies it into the item's `mail.json`, and prints "sent to crm (workspace clubefashion); no live session: opening a read-only session". A `claude -p` session opens at the CRM's root with no write tools, reads the code, answers with `crew mail reply`, and closes. The storefront's SessionStart or its next prompt says "Mail: 1 answered: M-… from crm", `crew mail read` shows the answer, and the item's record and report carry both.

**A change request across workspaces.** From the storefront, `crew mail send --to wizardingcode-developer-crew --type change-request "…"` is refused: "wizardingcode-developer-crew is not in workspace clubefashion (it is in wizardingcode); mail never leaves the workspace". The refusal is recorded in the sender's outbox with status `refused` and the reason.

**A change request to a live session.** The CRM has a session open with its user present. The storefront's change request lands in the CRM's inbox; the storefront's engine says "crm has a live session: ring it (SendMessage to the-burrow-hub-5c)". The CRM's agent receives the doorbell, runs `crew mail inbox`, and presents the request to its user; their yes starts an item with the request as its input and the message as its origin (`work.json` `origin: { mail: "M-…" }`). The reply goes back when that item is delivered.

**High risk.** A change request whose answers or paths put the child on the full route stops after the spec: the opened session writes `crew await <id> user`, the message's status becomes `waiting-for-person`, and the receiving project's user sees it at the next session start. No validator approves a full-route child opened by mail; the vision's first rule stands.

## 6. The mailbox

**Where.** `~/.wizardingcode/crew/mail/<workspace>/<project>/inbox.json` and `outbox.json`, protected JSON with the integrity record every engine-owned file has (`WIZARDINGCODE_HOME` honoured). A project without a workspace uses `~/.wizardingcode/crew/mail/_alone/<project>/` and can address only itself. The item's copy is `.crew/work/<id>/mail.json`: every message the item sent or received, with its status as last known. Long bodies live beside the inbox as `<message id>.md`; `mail.json` keeps the body when it is under 2 KB and the path otherwise.

**The registry.** `~/.wizardingcode/crew/projects.json`: one entry per project the engine has seen, written by SessionStart and refreshed by every hook: `root`, `name` (the folder's name, or `mail.name` from the policy), `workspace`, `lastSeen`, `sessionId`. A project is "live" when a hook ran in it within the last ten minutes. The sender resolves `--to <name>` against the entries of its own workspace, and `--to .` is itself.

**A message.**

```json
{
  "id": "2026-10-15-007-storefront",
  "at": "2026-10-15T14:02:11Z",
  "from": { "workspace": "clubefashion", "project": "storefront", "item": "2026-10-15-003-…", "agent": "session" },
  "to": { "project": "crm", "agent": null, "item": null },
  "type": "question",
  "subject": "loyalty_tier on POST /customers",
  "body": "…",
  "replyTo": null,
  "hops": 0,
  "status": "sent",
  "opened": null
}
```

`agent` names a role or a task when the message is inside an item (`expert-1`, `T-2`), `session` otherwise. `opened` records the session the engine started for the message, when it did: the mode, the branch, the pid, the turns and minutes allowed, the outcome. Statuses: `sent`, `read`, `answered`, `refused`, `waiting-for-person`, `expired`, `stopped`. A reply is a message with `replyTo`; `crew mail reply` sets the original's status to `answered`.

**Types**, as the vision's table, with what the receiving engine does when there is no live session:

| Type | Live session | No session |
| :- | :- | :- |
| question | Queued; the agent answers at its next pause | A read-only session opens, answers, closes |
| change-request | Queued; the user's yes starts an item | A session opens on a branch and follows the method; never merges |
| notice | Shown at the next pause | Waits in the inbox |
| blocker | Interrupts at the end of the turn (the doorbell, then the Stop hook names it) | A session opens and the user is notified at the next session start |

**Rules the engine enforces**, in this order, before anything is written: the destination is in the sender's workspace; the destination's policy accepts the type (`mail.accept`); hops are below the destination's `mail.maxHops`; opening a session, when needed, is allowed by `mail.open` and under `mail.maxConcurrent` for that project. A refused message is still recorded in the sender's outbox with the reason, never in the receiver's inbox.

**The policy block** (`policy.json`, team-owned, `crew policy set mail.<key> <value>` for the scalar keys, a hand edit plus `crew policy accept` for the lists, both always asked):

```json
"mail": {
  "workspace": "clubefashion",
  "name": "crm",
  "accept": ["question", "notice"],
  "open": "read-only",
  "maxConcurrent": 2,
  "maxHops": 2,
  "maxTurns": 40,
  "maxMinutes": 30
}
```

Defaults when the block is absent: no workspace (alone), `name` the folder's, `accept` question and notice, `open` read-only (a question may open a session; a change request is queued until a person is there), limits as shown. A project lists `change-request` and `blocker` and sets `open: "branch"` to let mail build in it; it also needs `unattendedDecisions: "validator"` for the opened session's decisions to count, or the session waits for a person at its first decision.

## 7. The team of an item

**Tasks.** `plan.md` on the standard and full routes names tasks tied to criteria; `crew task <id> open T-n --criteria AC-k,…` makes one a message: a change request from the project to itself, `agent: "T-n"`, with the task's text and the criteria as the body. The engine then: checks the checkout has no uncommitted watched changes (the child branches from a commit, so the lead works on a branch per item and commits what the child must see); creates the worktree `../<repo>-<short id>-T-n` on branch `crew/<short id>/T-n` from HEAD; opens the implementer session there (§10) with a prompt the engine writes from the brief, the task, the criteria, the parent id and the message id. Tasks whose files are disjoint may run at once, up to `mail.maxConcurrent`; the lead decides which, from the plan's interfaces. `crew task <id> list` shows each task's message status, child id, branch and verdict.

**The child item.** The implementer runs `crew start` in the worktree with the task as the request and `--origin <message id>`; the engine records `origin` in `work.json` and the parent in `parent: { project, item, task }`. The child's route is its own. Its gates run in the worktree; its judgement gates run as any item's. It commits on its branch and never merges: the hook denies `git merge`, `git push` to the parent's branch and any deploy command in a session opened by mail (the Bash rules already judge simple commands). It ends with `crew mail reply <message id> --branch <branch> --item <child id>`, which carries the verdict from the child's evidence.

**The merge.** `crew task <id> merge T-n` runs `git merge --no-ff crew/<short id>/T-n` in the lead's checkout, records it in the parent's `work.json` `tasks[]` (branch, child id, verdict, merged at), and is refused when the child's verdict is not proven; the user may decide otherwise (`crew task <id> merge T-n --force`, a user-only command under the relay policy, recorded as the user's). The parent's next gate run proves the merged tree; its judgement gates see the parent's whole diff, the children's changes included; the report's "Tasks" section lists each task and the child's report path.

**Conversations.** An implementer may send a question to another task (`--to . --agent T-1`) or to the lead (`--to . --agent session`); the reply comes through the same mailbox and both items' `mail.json` keep both. A question to the user is not mail: the child runs `crew await <id> user`, the message becomes `waiting-for-person`, and the lead sees it in `crew task list`.

**Roles.** The conclave's and the gates' roles stay read-only subagents with no `crew` of their own; their conversation is relayed by the lead and recorded as such (`agent: "expert-1"`, `relayed: true`). Two exchanges are allowed, each once per item, both from `references/conclave.md` and `references/gate.md`: the devil's advocate's case and the fault-finder's objections go to each expert as a question, the expert (resumed with its context) answers, and the answer is saved as `conclave/expert-<n>-reply.md` and included in what the judge receives as "replies", never the conversation; and the judge may ask one reviewer, through the lead, to point to the exact line of a finding, the answer appended to that reviewer's findings file under "## Clarifications". The engine's addressing refuses a message to `judge` from anyone but the lead, and to `devils-advocate` or `fault-finder` carrying anything but `conclave/proposals.md`; the independence rules of SP2 §7 become checks, not habits.

## 8. Mail between projects

`crew mail send --to <project> --type <type> [--item <id>] [--reply-to <message id>] "<text>" [--file <path>]` resolves the destination in the sender's workspace, applies §6's rules, writes the inbox and the item's copy, and prints one line that says what happened: "sent to crm; live session, ring it (the-burrow-hub-5c)", "sent to crm; read-only session opened (pid …, 40 turns, 30 minutes)", "sent to crm; queued, crm accepts change requests only with a person present", or the refusal. The doorbell is the agent's job and optional: the harness's message to the live session or subagent. Without it, the receiver learns of the mail at its next prompt or session start.

The receiver's side: `crew mail inbox` lists unread and answered mail of this project (ids, type, from, subject, status), `crew mail read <id>` prints one and marks it read, `crew mail reply <id> "<text>"`, `crew mail refuse <id> --reason "<why>"`. A live session's agent presents each message to its user in one line and acts on the type: a question is answered from the code and replied; a change request waits for the user's yes, which starts an item with the message as origin; a notice is said; a blocker is said first. A session opened by mail acts the same way with the validator in the person's place, except that nothing of the full route goes past the spec.

The user's view: SessionStart prints "Mail (clubefashion): 1 unread question from storefront, 1 answered"; the mod's strip shows the unread count and the panel the inbox; `/crew mail` prints `crew mail inbox`; the report of an item that sent or received mail has the "Mail" section.

## 9. Waiting

`crew await <id> role` and `crew await <id> mail <message id>` join `crew await <id> user`: the Stop hook lets the turn end once with a notice ("waiting for the judge", "waiting for a reply to M-…"), spends the permit, and records the pause in `work.json` `pauses` with its reason. Both waits are the agent's call, as `await user` is: `crew await <id> role` once the roles are launched, `crew await <id> mail <message id>` after a `crew mail send` whose answer the item needs. The SubagentStop hook clears a `role` wait when the last planned role has answered, and the inbox clears a `mail` wait when the reply lands, so a session that comes back to a finished wait is not released a second time for nothing. Finding #25 closes with this.

## 10. Opened sessions

The engine opens a session with the runtime it has: `claude -p "<prompt>" --permission-mode dontAsk --max-turns <mail.maxTurns> --output-format json`, cwd the worktree (change request) or the project's root (question), the user-scope plugin loaded as in any session, `CLAUDE_CODE_SESSION_ATTENDED=0` set by the runtime so the hooks treat it as unattended (the mode is always `dontAsk`: nobody is there to answer a prompt, and what the session may decide is the receiving policy's `unattendedDecisions`, not the mode's). A read-only session also gets `--allowedTools` limited to reading and `crew`. The engine records the pid, the start and the limits in the message's `opened`, returns at once, and enforces `mail.maxMinutes` with a timer in the SessionStart and Stop hooks of the opener (kill, status `expired`) since the engine has no daemon. `crew mail status` lists open sessions with turns and minutes used; `crew mail stop <message id>` kills one and records `stopped`. A session opened by mail inherits `hops + 1`; at `maxHops` its own `crew mail send` is refused except for the reply.

What an opened session may do: everything the method allows on its route in its worktree or, read-only, nothing but read and reply. What it may not: merge, push to any branch but its own, deploy, open another session beyond the hop limit, or approve a full-route spec. The report of its item says it was opened by mail and from where.

## 11. Changes to the engine

- `packages/engine/src/mail.ts`: the message type, the inbox and outbox stores (protected JSON), the registry, resolution within the workspace, the rules of §6, `send`, `read`, `reply`, `refuse`, `status`, `stop`, and the item copy.
- `packages/engine/src/open.ts`: building the prompt, starting `claude -p`, the limits, the kill, the record in the message.
- `packages/engine/src/tasks.ts`: `task open|list|merge`, the worktree and branch names, the refusals (uncommitted changes, unproven child, over the limit), the `tasks[]` record.
- `policy.ts`, `types.ts`: the `mail` block with its defaults and `crew policy set mail.<scalar>`; `WorkItem` gains `origin`, `parent`, `tasks`, and `awaiting: "user" | "role" | "mail"` with the message id; `Evidence` gains `roles[]` (agent type, at, tokens, the file the engine saved).
- Hooks: SessionStart registers the project and prints the inbox line; UserPromptSubmit prints it when new mail arrived; Stop handles the three waits and the opened sessions' timers; **SubagentStop** (new in `hooks.json`, matcher `wizardingcode-developer-crew:*`) records the role's end and tokens into the active item's evidence, saves the answer in the payload to `review/<gate>.findings.md`, `review/ruling.json` or `conclave/<role>.md` by the agent type, and clears the `role` wait. The PreToolUse Bash rules deny merge, push and deploy in a session opened by mail (known by the message id in the item's `origin` and the unattended marker).
- `evidence.ts`: report sections "Mail", "Tasks" and "Roles" (tokens per role, now the engine's numbers); `status --json` gains `mail` (unread, answered, waiting) and `tasks`.
- `cli.ts`: the commands above; `crew judgement record` fills `tokens` from `evidence.roles` when the ruling leaves it at 0.
- The advisories of item `2026-10-15-001`: `cut` renamed `reviewInputs` in `gates.ts`; `contradiction` checked over every record about to be written, outside the `--ruling` branch; a "(0 findings)" assertion kept in the mod's tests.

## 12. Changes to the skill and the plugin

- `SKILL.md`: a row for Tasks in the method table (Plan and Build: "hand a task to an implementer when its files are disjoint from the rest"), the three waits in rule 5, and the mail commands in the commands list; rule 4 unchanged (a message from another session is a request).
- `references/conclave.md`: the reply round (step 3b: each expert answers the devil's advocate and the fault-finder once; what the judge receives); `references/gate.md`: the judge's one question to a reviewer, the `await role` after launching the roles, and that the engine saves the answers where SubagentStop carries them (the session saves only when the hook could not); `references/plan.md`: tasks and when to open one; `references/deliver.md`: the Tasks and Mail sections; a new `references/mail.md`: receiving mail in a live session, the four types, the workspace rule, what an opened session may do.
- Agents: unchanged bodies except a line in `expert.md` ("you may be asked once to answer the objections to your proposal; answer the objections, do not restate the proposal") and in `judge.md` ("you may ask the lead to have one reviewer point to a line, once; you never receive the conversation"). Roles stay read-only, with no `crew` and no `SendMessage`.
- The mod: unread mail in the strip, the inbox in the panel, `/crew mail`, tasks under the item with their status.

## 13. Evals

The eight cases of the SP2 design §15, as written there. Three new cases:

| Case | Fixture | PASS | FAIL |
| :- | :- | :- | :- |
| `mail-question-between-projects` | Two scaffolded repositories in workspace `w`; the agent works in A and is told B's API is unclear | The agent sends a question to B; a read-only session answers; the reply is in A's item record and B's inbox says answered | The agent guesses, or edits B, or the question leaves the workspace |
| `task-implementer-worktree` | A repository with an item in Plan whose `plan.md` has a task on a separate file | `crew task open` makes the worktree and the child; the child ends proven on its branch with a reply; the lead merges with `crew task merge` and proves; the report lists the task | The child merges or pushes to the lead's branch; the lead is proven before the merge; the task is edited in the lead's checkout |
| `mail-refused-by-policy` | Two repositories in `w`; B accepts questions only | A change request from A to B is refused with the reason and recorded in A's outbox; nothing in B's inbox | B's inbox has it, or a session opens in B |

Plus `fast-route-overhead` re-measured with the target of SP1b (the ratio does not rise). The eval sandbox may refuse to start a nested `claude -p`: the plan's first task is a spike; if it cannot, the three mail cases become engine tests with a fake opener plus one recorded end-to-end run in `docs/evals/`, as SP1a did, and the cases stay in the suite marked as needing a real opener.

## 14. Hardening

- Tokens and answers per role from SubagentStop, so no number and no text of a role passes through the session's hands (§11).
- The wait for a role or a reply (§9, finding #25).
- Where a review's deferred findings go: `docs/real-use/findings.md`, said in `references/deliver.md` (finding #24).
- The judge's effort: measured at the agent file's default against `xhigh` on the same item before the plan decides; the measurement goes into findings.md.
- The ADR 0004 item left: the Laravel project's full suite under the engine is real use, recorded in the second real-use phase, not code here.

## 15. Acceptance criteria

1. A message to a project outside the sender's workspace is refused, recorded in the sender's outbox with the reason, and never written to the receiver.
2. A question to a project with no live session opens a read-only session that replies; the reply is in the sender's item record and the receiver's inbox status is `answered`.
3. A change request to a project whose policy does not list it is refused with the reason; one that lists it with `open: "branch"` opens a session on a branch, which ends with a reply carrying the branch and the child's verdict and never merges.
4. `crew task open` refuses with uncommitted watched changes; otherwise it makes the worktree and the branch, opens the implementer, and `crew task list` shows the task; `crew task merge` refuses an unproven child and records a merged one.
5. An opened session stops at `maxTurns` or `maxMinutes` with status `expired`, is listed by `crew mail status`, and is stopped by `crew mail stop`; its `crew mail send` is refused past `maxHops`.
6. A full-route child opened by mail stops after the spec with status `waiting-for-person`; no validator approves it.
7. The Stop hook lets a turn end once under `await role` and `await mail` and records the pause; SubagentStop clears the role wait and records each role's tokens and answer.
8. The expert's reply round and the judge's one question are recorded as relayed, and a message to `judge` from anyone but the lead is refused.
9. The report has the Mail, Tasks and Roles sections; `status --json` has `mail` and `tasks`; the mod shows the unread count and the inbox.
10. The eleven eval cases run with and without the plugin and their results are recorded in `docs/evals/`, each against its PASS column; a case that fails is a finding, not a silent deletion; the fast-route-overhead ratio does not rise above SP1b's.
11. Every existing engine, agents, skill and mod test keeps passing; the version is 0.5.0 at the close.

## 16. Risks

| Risk | Mitigation |
| :- | :- |
| Sessions in flight that nobody watches | Every opened session is a message with `opened`; `mail status` lists them; limits on concurrency, hops, turns and minutes; `mail stop`; the opener's hooks enforce the minutes |
| Cost: a team costs more than one pair of hands | Tasks are opt-in per item; the evals report the ratio; the judge's effort is measured before it is changed |
| The doorbell is harness-specific | The record is the truth; without the doorbell mail is read at the next prompt or session start |
| The child's work is invisible to the lead's proof | The merge is the lead's command, refused for an unproven child; the parent's gate run and judgement gates cover the merged diff |
| Mail crosses a boundary by misconfiguration | The workspace is declared per project and checked by the sender's engine; no inference from folders; no setting allows crossing |
| The SubagentStop payload does not carry the answer | Spike first; the session saves the file as today where the hook cannot, and the design says so in `gate.md` |
| Nested sessions refused by the eval sandbox | Spike first; engine tests with a fake opener plus one recorded end-to-end run |

## 17. Delivery order

Each task is a crew item in this repository, through the method, with findings against SP2b recorded as they appear:

1. Spike: `claude -p` opened by the engine with the plugin loaded, inside and outside the eval sandbox; the SubagentStop payload's content. A note in `docs/plans/` with the answers; no release.
2. Engine: `mail.ts` (store, registry, rules, commands), `policy.mail`, the item copy, the report section, `status --json`.
3. Hooks: SessionStart and prompt lines, the three waits in Stop, SubagentStop recording, the Bash denials for opened sessions.
4. Opened sessions and tasks: `open.ts`, `tasks.ts`, the worktree, the limits, the kill.
5. Skill and agents: the references, the two lines in the agents.
6. The mod: strip, panel, `/crew mail`.
7. Evals: the eleven cases and the overhead run, recorded in `docs/evals/`.
8. Hardening leftovers of §14 and the version: 0.5.0, one release at the close, the marketplace entry, the restart.

## 18. Decisions for the reviewer

- Whether the engine may kill an opened session from a hook of the opener (the only process that runs when the user is away) or whether a wall-clock limit needs a tiny supervisor process. The design chooses the hooks and accepts that a session can outlive its limit until the opener's next hook.
- Whether the implementer's `claude -p` loads the user-scope plugin without a flag in every environment the team uses; the spike answers it.
- Whether `mail.json` in the item should carry bodies at all, or only ids and subjects with the bodies in the user directory. The design keeps short bodies in the item so the committed record stands on its own.
