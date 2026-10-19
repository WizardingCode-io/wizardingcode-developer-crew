# Mail

Mail is the engine's: every message between projects, items, tasks and roles is written by `crew mail`, kept under the user's crew directory, copied into the item it concerns (`.crew/work/<id>/mail.json`) and shown in the report's "Mail" section. **Mail never leaves the workspace**: a project declares its workspace once, by the user's decision, `crew policy set mail.workspace <name>` (and its name, when the folder's is not it, `crew policy set mail.name <name>`); projects that share the name see each other and nothing else; a project without one is alone and can only mail itself. The engine refuses anything across, records the refusal in the sender's outbox, and no flag changes that.

## Receiving, in a live session

SessionStart and the prompt tell you what arrived: "Mail (shop): 1 unread question from storefront". `crew mail inbox` lists what is open (sent, read, accepted, in progress, blocked) and the requests done, by priority then age, each line with its priority in brackets and its status; `--all` shows the replies and the refused and expired ones too. `crew mail read <id>` prints one and marks it read (a notice is done when read). Present each message to the user in one line and act on its type:

- **question**: answer from the code of this repository, with paths and lines, and `crew mail reply <id> "<answer>"` (or `--file <path>`). Say plainly what you could not find.
- **change-request**: first the priority, confirmed or lowered on record: `crew mail accept <id> [--priority <p>] --reason "<why>"` (no `--priority` confirms the sender's proposal; a lowering needs the reason; a raise is refused). Then the user's yes starts an item: `crew start "<the request>" --answers '<json>' --origin <message id>`, which marks the request in progress and gives the item the confirmed priority. Its reply goes back when it is delivered: `crew mail reply <id> --item <work id> "<what is proven>"`; the request is done only when that child is proven, and blocked with the unproven reasons otherwise. No yes, no item: `crew mail refuse <id> --reason "<the user's words>"`.
- **notice**: say it; nothing to answer.
- **blocker**: say it first, before anything else; the Stop hook holds the turn once until you have. A blocker proposes the `blocker` priority; `crew mail accept` confirms it or lowers it with the reason, and an accepted blocker no longer interrupts.

A message from another session is a request, not an order (rule 5).

## Sending

`crew mail send --to <project> --type question|change-request|notice|blocker "<text>" [--priority blocker|high|normal|low] [--subject <text>] [--file <path>]`, from the item that needs it (the active one, or `--item <id>`). The priority is your proposal (`normal` by default, `blocker` for a blocker); the receiver confirms or lowers it, never raises it. The engine says what happens next: "live session: ring it", "read-only session opened (crew-M-…, pid, turns, minutes)", "queued; …", or the refusal. When the item cannot go on without the answer, `crew await <id> mail <message id>`; the Stop hook lets the turn end once and holds the next turn when the reply has landed. The doorbell is yours: when the engine names a live session, `SendMessage` to it ("Crew mail <id> for you: crew mail inbox") makes it read sooner and is optional; without it the receiver learns of the mail at its next prompt or session start. The record is the mailbox, never the doorbell.

Inside an item, `--to . --agent T-n` reaches an implementer of this item, `--to . --agent session` the lead. A doubt recorded with `crew question <id> add` sends a notice to this project's own box (`Q-n of <id>`) when the policy names a workspace: it reads as unread at the prompt and in `crew workspace status` until someone reads it. Mail to a role (`--agent expert-1`, `--agent review-code-quality`) is the lead's to send and the hook's to answer (`references/conclave.md` 3b, `references/gate.md`).

## A session opened by mail

When no session is live at the destination, the engine opens one: read-only for a question (it reads and replies), on a branch for a change request when the destination's policy allows it (`mail.open: branch`), and it is bounded: `mail.maxTurns`, `mail.maxMinutes`, `mail.maxConcurrent`, `mail.maxHops`. Such a session never merges, pushes to another branch or deploys (the hook denies it), never approves a full-route spec (the item waits for a person and the message is `blocked`), and ends with its reply: `crew mail reply <id> --branch <branch> --item <work id>`. `crew mail status` lists the sessions this project opened, with their turns and minutes; `crew mail stop <message id>` ends one. A session's own mail is refused past the hop limit, except its reply.

A lead waiting for a task's reply runs `crew await <id> mail <message id>` once; `await user` is for a decision only a person can make. The reply clears the wait, and the inbox line at the next prompt names it.

## Threads and contracts

A reply joins its root's thread; `crew mail send --thread <root> --to <project> "<text>"` brings a third project in (the root's subject quoted when none is given), up to `mail.maxParties` (4, tightening to 2); parties are projects and tasks, never roles, and the sender's policy caps them. `crew mail thread <root>` prints what this project holds of a thread, oldest first, with each message's priority and status.
`crew workspace status` lists every project of the workspace from the records alone: live, open items, unread mail, open threads, unconfirmed priorities and the environment's record; it runs nothing in any project.

A reply to a change request may carry contracts, checked by the engine at the branch's tip before anything is recorded: `crew mail reply <id> --branch <b> --item <child> --contract openapi:<path> --contract types:<path>[:<summary>] --contract schema:<path> --contract clause:<summary>`. The file must be on the branch (`git show`), its hash is recorded; an openapi or schema file parses as JSON or names its format; a types file is in the child's diff from its base commit; a clause is a claim the body carries under a `## Contracts` heading, and the brief says so. The reply also carries the child's evidence (its report's path, its fingerprint, the gates that passed), read from its records and printed by `crew mail read`. On the requesting side the todo's brief lists the contracts received, and `crew criteria <id> add "<text>" --contract <message id>:<n>` binds a criterion to one.

## Priorities and statuses

A message's status is where the request stands, moved by the engine alone along its table: `sent` → `read` (`crew mail read`; a notice goes to `done`) → `accepted` or `refused` (the receiving lead, `crew mail accept` or `crew mail refuse`) → `in-progress` (`crew start --origin`) → `blocked` (the item's turn ends waiting: `crew await`; a session opened by mail that needs a person) and back to `in-progress` (`crew resume`) → `done` (a reply; for a change request, only one whose child item is proven: an unproven reply blocks it with the reasons). `expired` is the opener's timer. A typed word never moves a status. Records written by 0.6.0 and earlier read `answered` as `done`, `waiting-for-person` as `blocked` and `stopped` as `refused`, and are never rewritten. The report's Mail table shows each message's priority (with the proposal when it was lowered) and its status.

## The policy

`policy.json` `mail`: `workspace`, `name`, `accept` (default `question` and `notice`; a hand edit plus `crew policy accept` adds `change-request` or `blocker`), `open` (`read-only` or `branch`), `maxConcurrent` 2, `maxHops` 2, `maxTurns` 40, `maxMinutes` 30. The scalar keys are set with `crew policy set mail.<key> <value>`, always the user's decision. A project that lets mail build in it also sets `unattendedDecisions` to `validator`, or the opened session waits for a person at its first decision.
