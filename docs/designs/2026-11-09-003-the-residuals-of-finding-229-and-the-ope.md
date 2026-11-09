# The not-committed mark covers a hand install and an install cut short, and findings 230 and 231 are settled

Item `2026-11-09-003`. Predecessor: `analysis.md` (an issue has no concept brief).

In one sentence: when the crew writes into a project the files that let another coding tool run it, and those files are left uncommitted or half written, the next session there says so and says what to run; and a long check run in the background no longer blocks the session that started it.

Who gains. A person working in such a project is told what to commit or what to run, where today they find a stale or half-written set of files at some later release. The maintainer who releases gets a log that says what the release was about to write into each project.

## Terms

- A *runtime adapter* is what `crew runtime install <name>` writes into a project so that a runtime other than Claude Code runs the crew: a hook configuration, a copy of the skill, and agents.
- An *engine root* is the folder an engine runs from: Claude Code's plugin cache folder for the plugin, `~/.local/share/wizardingcode-developer-crew` for the tarball install. An adapter's configuration names one root; the adapter is *own-root* for the engine running from that root.
- The *refresh* is `refreshAdapters` (`packages/engine/src/adapters.ts`): it installs stale own-root adapters again. SessionStart runs it, and so does `crew projects update` (the *fleet*), which the release runs as its step 12. The refresh *holds back* an adapter when a rule forbids writing now: the adapter stays `stale`, with the reason.
- A *hand install* is `crew runtime install <name>` typed by a person or run by an agent, at project scope unless `--scope user` is given.
- The *mark* is `.crew/local/adapters/uncommitted.json` (item `2026-11-09-001`, ADR 0023, not released): per engine root, what a refresh updated and the commit the checkout stood at. The *reader* is `uncommittedAdapters`: it tells every SessionStart, `crew status` and the fleet what is still to commit, with one commit command.
- The *adapters lock* is the folder `.crew/local/adapters/.lock`. A writer holds it while it installs; a lock older than ten seconds is broken by the next taker (`LOCK_STALE_MS`, `packages/engine/src/lock.ts`).
- The *register* is `.crew/decisions.json`. The *version record* is the checkout's note of which engine version last brought a root's adapters up to date (`recordAdapterVersion`).
- A *task's gate* is `crew task <id> gate T-n`: the project's checks, the whole test suite among them, run over what one task of an item changed.
- The *run marker* is the file `crew tdd` and `crew gate run` keep in an item's `running/` folder while they run; the Stop hook lets one turn end per marker (finding 146).
- The *judgement gates* are six readings of an item's diff by reviewers once its checks pass: code quality, test quality, security, risk, architecture and infra.
- The *bound* of the release's step 12 is 300 s; past it the release ends the fleet's process with a signal.
- *P-1* and *P-2* are the two proposals the final account of item `2026-11-09-001` left to the user. P-1: a mark for a hand install. P-2: the mark written before the installs begin; this design narrows it to a note before each install.

## Problem

Item `2026-11-09-001` built the mark and is proven, not released. Its final account left two proposals, an open finding and a finding of advisories. The user took all of it on 2026-11-09 ("tudo"), before the release. Four things are to settle.

1. A hand install writes an adapter and no mark (P-1). The person is told nothing until the next version's refresh holds the adapter back as `stale (not committed: …)`, and only at a session start on the adapter's own root.
2. A refresh cut short inside an install leaves files written in part and no mark (P-2), because the mark is written after an install is checked. A session start on the adapter's own root then says `stale (uncommitted changes in …); commit or restore them first`, which tells the person to commit a part-written adapter. A session on another root says nothing. The release's step 12 is the likely place: the fleet is killed at its bound.
3. `crew task <id> gate T-n` runs with no run marker (finding 230), so a session that runs a task's gate in the background is blocked at every Stop for the length of the suite: 583 s for 1625 rows in a task gate of item `2026-11-09-001`, on 2026-11-09.
4. Finding 231 lists nine things the judgement of `2026-11-09-001` left, numbered here as the finding numbers them. Seven are taken and two are refused, each with its reason.
   - (1) `crew status` says `check failed (…)` where the SessionStart text says `not-committed check failed (…)`. **Refused**: the status line already starts with `adapters not committed:`, so the same words there would say it twice.
   - (2) A refresh whose version record or register entry cannot be written throws, and the caller loses the account of what was installed; with a mark that could not be written either, the command is lost.
   - (3) A session start whose adapter step throws prints no reminder for any root.
   - (4) When a start's own refresh updated a root, the line leaves out that root's whole reminder while the command covers every runtime of the root's entry.
   - (5) The reader runs one `git status` per entry of the mark and reads any number of entries.
   - (6) The commit command's quote escape has no test.
   - (a) Step 12 writes into every registered project with no record of what it will write.
   - (b) The local install's path is fixed under HOME. **Refused**: it is the one place the release's maintainer installs to, and no requirement asks for another.
   - (c) A kill between step 11's extraction and its `finally` leaves a `.wizardingcode-developer-crew-next-*` folder that nothing removes.

The document review of this spec found a fifth, older than the mark: `crew runtime remove <name>` deletes the skill folder every runtime shares, so the adapters that stay lose their skill. It is settled here because the mark's reminder would otherwise print a command that commits that loss.

Decisions this spec rests on. Of `2026-11-09-001`: D-1 (a mark read by every engine, the version record's meaning kept). Of `2026-11-08-002`: D-1 (a refresh leaves its files uncommitted for the project's own session to commit), D-3 (step 12 is soft), D-6 (the fleet never writes the user scope), D-9 (a refresh never writes over an uncommitted change). The user's word of 2026-11-09, which takes P-1 and P-2 and so reverses two non-goals of the earlier item's spec: the reminder for a hand install, and the dry run before a release's first real fleet write.

## Goals

1. A hand install at project scope leaves the mark and prints the commit command; `crew runtime remove` takes its runtime out of the mark and leaves the other adapters whole.
2. The mark names an adapter before its install begins. An install that began and did not return leaves the adapter marked *unfinished*, and every reader says so on every root, with what to run. No reader gives a commit command while an adapter is unfinished.
3. A task's gate runs under the run marker.
4. The seven advisories taken from finding 231 are settled, and the two refusals are on record with their reasons (Problem, item 4).
5. Nothing proven by `2026-11-09-001` is lost: a start at the recorded version with no mark reads no adapter configuration, the command names only paths git lists as changed, no text of the mark reaches a line or a command.

## Non-goals

- Finishing an unfinished install by the refresh. D-9 stands: the engine cannot tell the part-written files from a person's edit, so the person runs the install again.
- A mark at user scope. The user scope is no checkout, and the fleet never writes it (D-6).
- A mark for the files `crew runtime remove` deletes. The person who removes an adapter commits the removal; the mark is about adapters written.
- Changing when the version is recorded, or what the register entry says.
- A check of the adapter by the hand install. It checks nothing today, and `crew runtime check <name>` is the command for that.
- The two advisories refused in the Problem, (1) and (b).

## Open questions

None.

## Critical user journeys

1. **A fleet killed inside an install.** Given a release whose step 12 is killed at the bound while it installs the Copilot adapter of a project, when the person opens a Claude Code session there more than ten seconds later, then the session's context holds `adapters: copilot left unfinished by crew 0.23.0 (an install cut short or failed): run crew runtime install copilot again with the crew of its root, such as ~/.local/share/wizardingcode-developer-crew/bin/crew, then commit.` and no `Commit:`. The agent runs that install; its output ends with the commit command; the person says yes; the next session start has no `adapters:` line.
2. **A hand install nobody commits.** Given a person who runs `crew runtime install copilot` in a repository, when the command ends, then its output ends with `adapters not committed: copilot updated by crew 0.23.0 and not committed. Commit: <command>`. Every later session start there, on any engine root, prints the reminder until the files are committed.
3. **An adapter removed.** Given a project with the Copilot and Codex adapters, both in the mark, when the person runs `crew runtime remove copilot`, then Copilot's configuration and agents go, the skill folder stays and the output says `kept <the folder> (still used by codex)`, the mark names Codex alone, and the output ends with what is still to commit.
4. **A task's gate in the background.** Given a session that runs `crew task <id> gate T-2` in the background, when its turn ends, then the Stop hook lets the turn end once and says the gate is still running.
5. **A register that cannot be written.** Given a checkout whose `.crew` folder cannot be written, when a session start's refresh updates Copilot, then the context holds `adapters: copilot updated (2 differed, 0 removed); the register entry was not written (<why>); applies from each updated runtime's next session. Commit: <command>.`
6. **A release.** Given a release on the maintainer's Mac, when step 11 runs, then it removes any staging folder an earlier kill left and says so; when step 12 runs, then the log holds the fleet's dry run (the projects that would update and the count line) before the real run's lines.
7. **A session that starts while an install runs.** Given a hand install that holds the adapters lock, when a session starts in the same project and its wait for the lock ends before the install does, then its context says `copilot's install has not ended and the adapters lock is held: look again in ten seconds with crew status` beside `another session is updating`, and does not say to run the install again.

## Design

### The mark's shape

An entry keeps its fields (`version`, `at`, `head`, `runtimes`, `register`). A runtime of an entry gains one optional key:

```json
{ "name": "copilot", "config": false, "unfinished": true }
```

`unfinished` is written only when true. It means: an install of this runtime began under this root and did not return, so its files may be written in part. A runtime without the key is *finished*: its install returned, its files are whole and, until the reader says otherwise, not committed.

Two rules are added to what makes an entry recognised (`recognised`):

- A runtime is named at most once in an entry. The names are printed in the reminder, and this rule, with the table's five runtimes other than `claude`, bounds how many are printed.
- `unfinished`, when present, is a boolean.

An entry that breaks a rule counts as absent, as any unrecognised entry does, and is written back as read.

One rule is added to the file as a whole: **a runtime is named under at most one root**. An adapter's configuration names one root, so the root that installed it last owns its mark. Writers keep the rule (below, "Writing the mark"). The reader enforces it on what it reads: walking the roots in the ascending order of their names, an entry that names a runtime an earlier entry already names counts as absent. A file of any size therefore gives at most five entries, which settles advisory (5) with no cap of its own.

Version 0.23.0 is not released: no engine in use reads the mark, so the shape changes with no reader to keep working.

### Writing the mark

`packages/engine/src/adapters-uncommitted.ts` keeps `noteUpdated(paths, root, entry)` and changes what it merges:

- the runtimes are united by name; `config` is true when either holds it; `unfinished` is what the new item says (absent means finished);
- each runtime the new entry names is taken out of every other root's recognised entry, by filtering that entry's `runtimes` as read (the items and every other key kept), and an entry left with no runtime is removed;
- `version`, `at`, `head` are the new ones, `register` true when either holds it, every key the engine does not recognise written back as read.

Three functions are added to the same module, each for a caller that holds the adapters lock:

- `markText(paths): string | null` returns the file's bytes when the mark's path is a regular file (`lstat`), and null for anything else there: nothing, a link, a folder.
- `restoreMark(paths, text)` writes those bytes back through `writeText` (`packages/engine/src/fs.ts`: a temporary file renamed over the path, as `noteUpdated` writes), so it never writes through a link planted at the path. With `text` null it removes what is at the path with `rmSync(path, { force: true })`, never recursive: a link is unlinked and its target untouched, and a folder there makes it throw.
- `dropRuntime(paths, name)` takes the runtime out of every recognised entry, removes an entry left with no runtime and the file left with no entry.

A throw of any of the three is a write of the mark that failed: the caller says it once (`the not-committed mark was not written (<why>)`) and goes on, as it does for `noteUpdated`.

The module owns the mark, so it holds everything that reads or words it: `Reminder`, `ReminderEntry`, `reminderParts`, `unfinishedParts`, `notCommittedLine` (below) and one exported constant, `KEPT_ROOT_CREW`, the text `~/.local/share/wizardingcode-developer-crew/bin/crew`. `adapters.ts` imports the module, never the other way, and its line of a foreign adapter takes the text from the constant, so the text is written once.

### One install under the mark

The refresh and the hand install run the same sequence, and it is written once: one function of `adapters.ts`, `installUnderMark`, which both call while they hold the adapters lock.

1. The mark's bytes are read (`markText`).
2. The mark is written with the runtime `{ name, config: false, unfinished: true }` (`noteUpdated`).
3. The install runs.
4. By what it did:
   - **refused**: the mark is put back (`restoreMark`). Every refusal of `installRuntime` comes before its first write.
   - **threw an error that is not an `InstallFailed`**: the mark is put back. `installRuntime` throws `InstallFailed` from one place, the block that holds all its writes; any other error left it before that block.
   - **threw an `InstallFailed`**: the runtime stays unfinished, whatever number of files the error counts. The count is of writes that ended: a copy cut partway counts as none and leaves a truncated file. When in fact nothing changed, the reader's `git status` finds the paths clean and clears the note.
   - **returned**: the files are whole. The mark is written with `{ name, config: <the install wrote it> }`, which ends the runtime finished.

A kill at any point of step 3 leaves the runtime unfinished on disk, which is the point of writing it first.

With no commit to name (`baseCommitOf` null) no mark is written, as today. A write of the mark that fails is said once and never stops the install, as today.

### The refresh

Inside the lock hold of its step 8 the refresh calls `installUnderMark` for each stale adapter, in the table's order. Its check of the adapter comes after, as today, and decides the status alone: an install that returned and whose check is ok ends `updated`; one whose check is not ok ends `failed` with the check's problem, as today, and its files, which are whole, stay in the mark as finished. A refusal ends `refused` and a throw `failed`, with today's reasons.

`Refresh.entry` holds what the run noted, whole: each runtime whose install returned and, with `unfinished`, each one an `InstallFailed` left so. It is set when the run noted a runtime, which needs a commit to name. A caller whose mark could not be written reminds from it (`also`, below), so it neither loses the reminder nor gives a command over an unfinished runtime.

A killed refresh leaves the adapters lock held by the dead process until it is ten seconds old. `onSessionStart` waits for that lock itself, after the refresh and whatever the refresh did (`packages/engine/src/hooks/session-start.ts`, the wait before the baseline), and says `another session is updating` when the wait ends with the lock still held. A start inside those ten seconds therefore says so on any root. On the adapter's own root the refresh stops at its git hold-back and never reaches the lock; the start's own wait still does.

### What the refresh could not write (advisory 2)

`recordAdapterVersion` and the register's append are each fenced. A failure adds a sentence to a new field `Refresh.notWritten: string[]` and the refresh goes on:

- `the adapter version was not recorded (<why>)`;
- `the register entry was not written (<why>)`.

`<why>` passes `quoted`. The same fence covers the record written with no install (every own-root adapter already up to date).

A version not recorded heals at the next start: the refresh runs again, finds the adapters up to date, and records.

Where each sentence is seen. The register's sentence is seen at a session start, since the hook writes nothing else under `.crew`'s top folder there. The version record's sentence is seen at the fleet and at a refresh whose record alone failed: at a session start the hook's own baseline writes the same state file, so when that file cannot be written at all the start prints no context, as it does today.

### Reading the mark

`uncommittedAdapters(paths, { clear, also })` keeps its inputs and its promise never to throw. It changes in five ways.

- **One entry per runtime.** The rule of "The mark's shape": at most five entries are read. `also`, the entry of a write whose own note failed, is read as that note would have been written: it replaces the file's entry of its root, the runtimes it names leave the other roots' entries, and an entry left with none counts as absent.
- **An unfinished runtime.** Its configuration path is watched whatever its `config` says (`runtimePathspecs(name, true)`), since nobody knows whether the install reached the configuration. The entry is uncommitted by the same rule as today: a change no later commit touched under one of its adapter paths. A clean entry is cleared, an unfinished runtime with it: nothing was written, or the person restored the files.
- **An entry is judged whole.** The skill folder is shared by every runtime, so a change under it cannot be given to one runtime. One unfinished runtime therefore keeps its whole entry uncommitted while any adapter path of that entry holds a change, even when its own install was cut before its first write and the change is another runtime's of the same run. Running the unfinished runtime's install again ends it.
- **The command.** It is null while any uncommitted entry holds an unfinished runtime: a command for the finished ones would commit a part-written copy of the shared folder.
- **A lock that is held.** The mark alone cannot tell an install that is running from one that was cut short: the key is on disk for the whole install. The reader therefore looks at the adapters lock when it reads: `lockHeld`, a new function of `lock.ts`, is true while the lock's folder exists and is not older than ten seconds. The result carries it, and it changes how an unfinished runtime is worded (below).

The clear changes its guard. Today it removes an entry whose `at` is the one that was read, and every note of a run carries one `at`. With the note written before the install, a reader could judge an entry clean while its install runs (no file written yet) and remove it after the install ended it finished. The clear now removes an entry only when, under the lock, it is key for key the entry the reader judged. Every write of an entry changes it (a new run's `at`, or the `unfinished` key set or taken off), and no install writes a file before its note.

The result is data, and one function turns it into sentences:

```ts
interface ReminderEntry {
  root: string;
  version: string;
  /** Finished runtimes: written and not committed. */
  updated: RuntimeName[];
  /** Runtimes whose install began and did not return. */
  unfinished: RuntimeName[];
}
interface Reminder {
  entries: ReminderEntry[];
  command: string | null;
  failed?: string;
  /** Whether the adapters lock was held at the read. */
  held: boolean;
}
function reminderParts(
  reminder: Reminder,
  opts: { own: string; updatedNow?: RuntimeName[] },
): string[];
function unfinishedParts(reminder: Reminder | null, own: string): string[];
function notCommittedLine(reminder: Reminder, own: string): string;
```

`own` is the reading engine's canonical root. `reminderParts` gives, per entry, in the ascending order of the roots' names:

- `<names> updated by crew <version> and not committed`, as today. `updatedNow` names the runtimes a refresh of `own` updated in this same run: they are left out of `own`'s entry, since the refresh's result already says them, and what is left reads `<names> updated earlier and not committed` (advisory 4). The entry's version is the last write's, so the sentence does not claim it for the earlier ones.
- per unfinished runtime, while the lock is held: `<name>'s install has not ended and the adapters lock is held: look again in ten seconds with crew status`. The sentence is true whoever holds the lock, and it gives no instruction: ten seconds later the lock is free or broken, and the reader says which of the other two sentences holds.
- per unfinished runtime, the lock not held, on its own root: `<name> left unfinished by crew <version> (an install cut short or failed): run crew runtime install <name> again, then commit`;
- per unfinished runtime, the lock not held, on another root: `<name> left unfinished by crew <version> (an install cut short or failed): run crew runtime install <name> again with the crew of its root, such as ~/.local/share/wizardingcode-developer-crew/bin/crew, then commit`. The path is `KEPT_ROOT_CREW`; no root of the mark is printed.

`unfinishedParts` gives the unfinished sentences alone, and an empty list for no reminder. `notCommittedLine` gives one line: `adapters not committed: ` then the sentences and, when a status failed, `check failed (<why>)`, joined by `; `, then `. Commit: <command>` when there is one. A failed status with no entry therefore reads `adapters not committed: check failed (<why>)`, as it does today.

The reader returns null when there is no entry to say and no failed status.

### The line of SessionStart: `adaptersLine`

The signature is `adaptersLine(refresh, extra = [], reminder = null, own = refresh?.root ?? "")`. The earlier parameters keep their types and defaults, and `refresh` stays required. A call with no `own` takes the refresh's root; with a null refresh it takes the empty string, which is no entry's root (the reader skips an empty key), so an unfinished runtime then reads as another root's. The one-argument calls of `adapters.test.ts` compile and read as before. SessionStart passes its own root explicitly, so it never relies on the default.

- The reminder's sentences come from `reminderParts(reminder, { own, updatedNow })`, where `updatedNow` is the runtimes the refresh ended `updated`.
- Each sentence of `refresh.notWritten` follows the mark's own failure.
- Two suffixes that tell the person what ends a hold-back, `; commit or restore them first` and `; commit them to adopt the adapter, or run crew runtime install <name> again`, are not said when the reminder holds an unfinished runtime: its sentence says what to run, and committing a part-written adapter is the wrong advice.

### SessionStart (advisory 3)

The adapter step becomes two fences. The first holds the refresh and the wait for the adapters lock; a throw there becomes the part `not checked (<message>)`. The second, always run, holds the reader and the line. A start whose refresh throws therefore prints `adapters: <the reminder's sentences>; not checked (<message>). Commit: <command>.` With no mark the text is `adapters: not checked (<message>).`, byte for byte today's. When the second fence itself throws, the text is `adapters: not checked (<that throw's message>).` and the reminder is lost for that start; the context is never lost.

### `crew status`

Its line is `notCommittedLine(reminder, own)`, which the hand install and the remove print too. The JSON keeps `adaptersUncommitted: { parts, command }`, the parts from `reminderParts(reminder, { own })`.

### `crew projects update`

- The reader is called after the refresh's fence, so a project whose refresh throws still gets its `commit in` line (advisory 3).
- The project's line gains, as units after the ones it has, the sentences of `refresh.notWritten` and then the reminder's unfinished sentences. A project with either is not `up to date` in its line.
- A project whose refresh could not write its version record or its register entry is counted `failed`, and the run exits 1, as it does today when the refresh throws. Its line now names each adapter's result.
- A project with an unfinished runtime gets no `commit in` line, since the reader gives no command.

### `crew runtime install` (P-1)

The sequence lives in one function of `adapters.ts`, `installByHand`; `cli.ts` calls it and prints. At project scope, in this order:

1. `head = baseCommitOf(root)`. With no commit to name (a folder that is no repository, a repository with no commit) the install runs exactly as before this item: no lock, no mark, today's output.
2. The adapters lock is taken with the wait of a command a person types, `COMMAND_LOCK_WAIT_MS` (ten seconds, `lock.ts`), not the two seconds of a hook. The wait equals the age at which a lock is broken, so a lock a killed process left is broken inside it. A lock that live holders keep to the end of the wait refuses: `another session is updating the adapters: run crew runtime install <name> again`, exit 1, nothing written. The wait is read from a named value, `handLockWait`, an object as the hook's `adapterDeadline` is, so a row can shorten it.
3. `installUnderMark` runs the install under the mark, with the running engine's canonical root, the running version, the time and `head`.
4. A refusal is refused as today. A throw is refused with the install's message through `quoted`; when the install had written a file the text ends `; partly written: run crew runtime install <name> again`. `installByHand` returns each refusal as the text to print, and `cli.ts` prints it as returned, never through `quoted` a second time, so the suffix is never cut.
5. The lock is released, the reader is called with `clear: true`, and the output gains, after today's lines: the sentence of a mark that could not be written, then `notCommittedLine`. `--json` gains `adaptersUncommitted`.

At user scope nothing changes: no lock, no mark, today's output.

### `crew runtime remove`

Two changes.

**The shared skill folder.** Every runtime but `claude` keeps the skill in one folder, `.agents/skills/crew-method`, and `removeRuntime` deletes it whichever runtime is removed, so the adapters that stay lose their skill. `removeRuntime` now keeps the folder while another runtime's adapter of the same scope remains, and removes it with the last one. Another adapter remains when its configuration at that scope still holds crew's hook (`rootOf` gives a root); a configuration that cannot be read counts as one that does, so a folder in doubt is kept. The result gains `kept`, the folder and the runtimes that still use it, and the command prints `kept <folder> (still used by <names>)`. This holds at project and at user scope.

**The mark.** One function of `adapters.ts`, `removeByHand`. At project scope with a commit to name: the adapters lock with the same wait as the hand install (a lock held to its end refuses with `another session is updating the adapters: run crew runtime remove <name> again`), `removeRuntime`, then `dropRuntime(paths, name)`, then the output gains `notCommittedLine` when an entry is still uncommitted. When `removeRuntime` refuses, `dropRuntime` does not run and the mark is untouched. With no commit to name, and at user scope, the mark is not touched.

### `crew task <id> gate T-n` (finding 230)

`taskGate` runs `runTaskGate` under `withRunning`, with the command text `crew task <id> gate <T-n>`. The Stop hook already lets a turn end for any marker of the item's `running/` folder that names the session, so nothing changes there.

### The pathspec's quoting (advisory 6)

`packages/engine/src/shell-words.ts` exports `singleQuoted(word)`: the word in single quotes, each quote inside it written `'\''`. The escape is written in four places today, and each takes it from there: `quoteWord` (`shell-words.ts`) and `shellWord` (`run.ts`) for a word outside their own safe sets, which stay as they are; the commit command for every pathspec; `shQuote` of `scripts/improve-loop.ts`, which is the same function under another name and is replaced by the import. No caller's bytes change. One row passes a word holding a quote through `sh -c` and reads it back. Two rows read the sources: one finds once, under `packages/engine/src` and `scripts`, the call that writes the escape (`.replace(/'/g, …)` with the escaped quote as its replacement; a doc comment that shows the escaped quote is not that call and is not counted), and one finds the path text of `KEPT_ROOT_CREW` once. They are there to stop a second copy coming back, which is how the four came to be.

### The release's step 11: the sweep (debt c)

Step 11 begins as today: when the install itself is missing and `<install>.previous` is there, it puts the previous install back; with no local install it is skipped. The sweep comes next, before the staging folder is made. It lists the folder that holds the install (`dirname(install)`) and removes each entry whose own name starts with `.wizardingcode-developer-crew-next-`, the prefix `mkdtempSync` gives the staging folder. It logs each: `  11. removed a staging folder an earlier swap left: <name>`.

- The match is on the entry's name as the listing gives it; no path is built from anything else.
- `lstat` decides how an entry goes: a link is unlinked and never followed, a folder is removed with what it holds, a file is removed.
- The install, `<install>.previous` and every entry without the whole prefix are never touched.
- An entry that cannot be removed is said, `  11. a staging folder could not be removed: <name> (<why>)`, and left: housekeeping never stops the swap, which alone decides the step.
- A step skipped for no local install returns before the sweep and removes nothing.

### The release's step 12: the dry run (debt a)

Step 12 runs the installed bundle twice.

1. `crew projects update --dry-run`, under a bound of 60 s. The log gains `  12. dry run: <line>`, each line once: the project lines that hold ` would update`, taken from the lines before the `user scope:` line, then the count line. A dry run killed at its bound logs `  12. dry run: killed by <signal>`; one that prints no count line and was not killed logs `  12. dry run: no count line (exit <n>)`.
2. `crew projects update`, as today, under what is left of the 300 s.

What the dry run adds. The real run prints a project's line only after it wrote that project. When the real run is cut short, the dry run's lines are the only record of which projects it was about to write.

The dry run is a record, never a gate: the real run starts whatever the dry run did. The step's listing under `--dry-run` of the release names both commands.

What the two runs cost, measured on 2026-11-09. Over the 23 registered projects, none stale that day, the dry run took 0.08 s. A stale own-root adapter is the state at a release, so it was measured on fixtures, with the engine's code as it stands: a project with one stale runtime costs 21 to 25 ms in a dry run and 87 to 99 ms in a real run; one with five stale runtimes costs 57 to 63 ms and 186 to 204 ms. Two of the 23 registered projects hold own-root adapters. Were all 23 stale with five runtimes each, the dry run would take about 1.4 s of its 60 and the real run about 4.6 s of the 300.

Where a kill of the real run may leave a project written in part (a kill before any project line, a kill between two lines), the notification's text ends `; a project left unfinished says what to run at its session start`. The wording is conditional on purpose: a project with no commit to name, or whose mark could not be written, has no mark.

## Alternatives considered

| Alternative | Why not |
| :- | :- |
| The refresh finishes an unfinished install at the next start | D-9: it would write over uncommitted changes, and the engine cannot tell the install's part-written files from a person's edit made since |
| One intent mark for every stale adapter before the first install | A kill between two installs would leave the later ones marked though nothing of theirs was written; one note per install names exactly the adapter in flight |
| Putting the mark back when a failed install counts no file written | The count is of writes that ended; a copy cut partway counts as none and leaves a truncated file, so the mark would be gone over a part-written adapter |
| An adapter whose check fails after its install returned held unfinished | Its files are whole; calling it cut short would send the person to an install that writes the same files, and would withhold the command for nothing |
| The hand install running the refresh's check | It checks nothing today, and a failing check would then make a hand install exit 1 where it exits 0; `crew runtime check <name>` is the command for that |
| A version per runtime in the entry | Only the sentence for a runtime the same refresh did not update needs it, and `updated earlier` says the truth without it |
| A cap on the entries read, the newest first | The rule that a runtime is named under one root already bounds the entries at five; a cap would add an ordering, a count of what was not read and a sentence for a state the rule excludes |
| The clear judging the paths again under the lock | A second `git status` per cleared entry; comparing the whole entry is enough, since every write changes it |
| An unfinished runtime judged by its own paths | The skill folder is shared, so a change under it belongs to no one runtime; the entry is judged whole and the spec says what follows |
| `quoteWord` for the pathspecs | It leaves a safe word unquoted, which changes the command's bytes in fifteen proven rows and gains nothing; the escape is shared instead |
| A dry run that gates step 12's real run | The step exists to update; a slow or failed record would then cost the update |
| A fixed staging name, removed before each extraction | Two releases at once would extract into one folder and one could install the other's half-written files; a unique name fails cleanly and the earlier install is put back |
| A hand install that waits for the lock as long as it takes, or takes none | A wait with no end hangs a command a person typed; no lock lets a refresh and a hand install write the same files at once, as they can today |
| The hook's two-second wait for the hand install | A lock a killed fleet left would refuse a person's command for up to ten seconds; the command's wait breaks it instead (finding 168 set that wait for commands) |
| A project whose record was not written counted `updated`, exit 0 | The run exits 1 for it today; a write failure stays visible to a caller that reads only the exit code |
| Leaving `crew runtime remove` as it is and saying nothing after it | The reminder at the next session start would still print a command that commits the loss of the shared skill folder; the cause is the removal |
| The mark at user scope | No checkout, no git status to read, and D-6 |

## Rows and records this item changes

### Rows of earlier items this item rewrites

AC-30 keeps every existing row green. Eight rows of four test files change what they read or expect, because this spec changes it, and so does the findings test's open list (AC-27); no other assertion of an existing row changes. The list was taken by running the whole suite (1648 rows) against a prototype of the change in a scratch clone, on 2026-11-09: these eight failed and nothing else did, and each passes with the rewrite below.

`packages/engine/tests/adapters-uncommitted.test.ts`. The file gains one helper, `partsOf(reminder)`, which is `reminderParts(reminder, { own: "" })` for a reminder and `undefined` for null.

| Row | Line | Today | After |
| :- | :- | :- | :- |
| `2026-11-09-001 AC-4` | 75 | `reminder?.parts` equal to one sentence | `partsOf(reminder)` equal to the same sentence |
| `2026-11-09-001 AC-4` | 76 | `reminder?.roots` equal to `["/r/a"]` | `reminder?.entries.map((e) => e.root)` equal to the same |
| `2026-11-09-001 AC-4` | 116 | the second root, `/r/b`, notes Copilot | `/r/b` notes Codex (`runtimes: [{ name: "codex", config: false }]`): a runtime is named under one root, and Codex's skill folder is the same one |
| `2026-11-09-001 AC-4` | 119 | `both?.parts` equal to two Copilot sentences | `partsOf(both)` equal to `copilot updated by crew 1.2.3 and not committed` and `codex updated by crew 1.10.0 and not committed` |
| `2026-11-09-001 AC-4` | 123 | `both?.roots` equal to `["/r/a", "/r/b"]` | `both?.entries.map((e) => e.root)` equal to the same; the command asserted after it is unchanged |
| `2026-11-09-001 AC-9` | 165 | `failing?.parts` equal to `[]` | `failing?.entries` equal to `[]`; the failed status stays in `failing?.failed`, asserted as today |
| `2026-11-09-001 AC-27` | 265 | `?.parts` of length 1 | `?.entries` of length 1 |
| `2026-11-09-001 AC-27` | 315 | `?.parts` equal to one sentence | `partsOf(…)` equal to the same sentence |
| `2026-11-09-001 AC-31` | 338 | `/r/b` notes Copilot beside `/r/a`'s Copilot | `/r/b` notes Codex, so the three keys the row expects stay |

`packages/engine/tests/adapters.test.ts`:

- `2026-11-09-001 AC-28`, lines 935 to 937: the mark read at Copilot's install holds, beside `{ name: "codex", config: true }`, the item `{ name: "copilot", config: false, unfinished: true }`. The rest of the row stands.

`packages/engine/tests/release.test.ts`:

- The fake runner answers the dry run's call (`projects update --dry-run`) apart from the real one, and the helper `projectUpdateAnswers` finds the real run's call by the absence of `--dry-run`.
- `2026-11-08-002 AC-6`: the listing of step 12 holds both commands (AC-35); the real run's `timeoutMs` is at most 300 000 and more than 299 000; the text of the run killed between two lines gains the clause (AC-25); the resume from step 12 runs the fleet twice, so its list of programs holds the `node … projects` entry twice.
- `2026-11-09-001 AC-17`: the text of the run killed before any project line gains the clause (AC-25).

`packages/engine/tests/cli.test.ts`, the row `SP6-T4 AC-3`, in three places:

- Lines 8826 to 8828: the hand install of Cursor runs in a repository with a commit, so its output gains a last line. The row takes the lines before it as the file list and asserts that the last line starts `adapters not committed: cursor updated by crew <VERSION> and not committed. Commit: git add -A -- `.
- The removal of Cursor, while Codex's and OpenCode's configurations still hold crew's hook: the row expects `kept <the skill folder> (still used by codex, opencode)` where it expects the folder's removal today, and expects the folder's `SKILL.md` to be there.
- The removal of Codex, the last adapter: its output is the configuration's removal and then the skill folder's, and the folder is gone.

`packages/engine/tests/findings.test.ts`: the open list (AC-27).

### Records

- `docs/real-use/findings.md`: finding 230 fixed; finding 231 fixed, its two refusals named with their reasons; finding 229's outcome gains the residual closed here. `packages/engine/tests/findings.test.ts`: the open list drops 230 and 231.
- `docs/adr/0023-a-release-reaches-the-adapters.md`: a section for this item (the unfinished runtime, one root per runtime, the hand install's mark, the shared skill folder at a removal).
- `plugins/core/skills/crew/references/runtimes.md`: the hand install's last line, the unfinished sentences and what to run, what a removal keeps.
- `CLAUDE.md`, Releasing: step 11's sweep, step 12's dry run.

## Acceptance criteria

- AC-2: a refresh whose process is killed inside an install leaves the mark with that runtime unfinished, and the next session start on another engine root prints `adapters: <name> left unfinished by crew <version> (an install cut short or failed): run crew runtime install <name> again with the crew of its root, such as ~/.local/share/wizardingcode-developer-crew/bin/crew, then commit.` with no `Commit:`.
- AC-3: a session start on the unfinished runtime's own root prints the adapter's hold-back, the sentence ending `: run crew runtime install <name> again, then commit`, no `Commit:`, and neither `commit or restore them first` nor `commit them to adopt the adapter`.
- AC-6: an unfinished runtime's configuration path is watched whatever its `config` says: a change under the configuration alone keeps the entry uncommitted.
- AC-7: with an unfinished runtime, `crew status` prints `adapters not committed: <the unfinished sentence>` and no `Commit:`, and `crew projects update` prints the unfinished sentence as a unit of the project's line and no `commit in` line for that project.
- AC-8: `crew runtime install <name>` at project scope, in a repository with a commit, writes the mark's entry under the running root (`version`, `at`, `head` the checkout's HEAD, the runtime with `config` as the install wrote it, `register` false); its output ends with `adapters not committed: <name> updated by crew <version> and not committed. Commit: <command>` and `--json` carries `adaptersUncommitted`; the command run as printed exits 0, after which a session start prints no reminder.
- AC-9: a session start on another engine root, after a hand install nobody committed, prints the reminder and the command.
- AC-10: `crew runtime install` in a folder that is no repository, and with `--scope user`, writes no mark, and its output is byte for byte what the same install prints before this item.
- AC-11: `crew runtime install <name>` and `crew runtime remove <name>` at project scope, with the adapters lock held, refuse with `another session is updating the adapters: run crew runtime <install|remove> <name> again`, exit 1, and change no file of the project.
- AC-12: a note of a runtime under one root takes that runtime out of every other root's recognised entry, removes an entry left with no runtime, and writes back as read every entry and key the engine does not recognise.
- AC-13: a hand install over a runtime the mark holds unfinished ends it finished: the output holds the `updated by crew` sentence and the command, and no `left unfinished`.
- AC-14: a hand install refused leaves the mark's bytes as they were; one that throws after writing a file exits 1 with the install's message ending `; partly written: run crew runtime install <name> again` and leaves the runtime unfinished.
- AC-15: `crew runtime remove <name>` at project scope takes the runtime out of every entry of the mark, removes the file left with no entry, and its output ends with the `adapters not committed:` line when an entry is still uncommitted.
- AC-16: a hand install whose mark cannot be written still installs, says `the not-committed mark was not written (<why>)` and prints the commit command.
- AC-17: `crew task <id> gate T-n`, run with a session id, keeps a marker in the item's `running/` folder that names the session and the command `crew task <id> gate T-n` while the gate runs, removes it when the gate ends, and the Stop hook lets one turn end while it is there.
- AC-19: `crew projects update` counts a project whose version record or register entry could not be written as `failed`, exits 1, and the project's line names each adapter's result and what was not written.
- AC-20: a session start whose adapter step throws prints the mark's reminder and command beside `not checked (<message>)`; with no mark its context is byte for byte the one before this item; `crew projects update` prints the `commit in` line of a project whose refresh threw.
- AC-21: a session start whose refresh updated one runtime of a root whose entry also names another prints `<other> updated earlier and not committed` beside the update, and the command covers the changed paths of both.
- AC-23: `singleQuoted` returns a word in single quotes with each quote inside it escaped, so a word holding a quote reaches a shell's command unchanged; `quoteWord` and the commit command's pathspecs use it, and the command's bytes are the ones before this item.
- AC-24: the release's step 12 runs `crew projects update --dry-run` under a 60 s bound and logs each line that holds ` would update` and the count line as `  12. dry run: <line>`, then runs the real update under what is left of the 300 s whatever the dry run did; a killed dry run and one with no count line are logged as such.
- AC-25: a killed real run of step 12 whose output leaves a project that may be written in part ends its text with `; a project left unfinished says what to run at its session start`; a run killed after every project's line does not.
- AC-26: the release's step 11 removes every entry beside the install whose name starts with `.wizardingcode-developer-crew-next-` before it extracts, logs each as `  11. removed a staging folder an earlier swap left: <name>`, and leaves every other entry.
- AC-27: `docs/real-use/findings.md` records finding 230 as fixed and finding 231 as fixed with its two refusals, and the findings test's open list holds neither.
- AC-51: a row of the suite asserts that ADR 0023, `references/runtimes.md` and `CLAUDE.md` say the unfinished adapter and what to run, the hand install's mark, the kept skill folder, step 11's sweep and step 12's dry run (it supersedes AC-28, first recorded as `observed`: the suite already asserts document text, so a row can fail first).
- AC-52: a staging folder the sweep cannot remove is logged as `  11. a staging folder could not be removed: <name> (<why>)` and left, and the step goes on to the swap.
- AC-30 (preserve): the rows of `adapters-uncommitted.test.ts`, `adapters.test.ts`, `hooks-session-start-adapters.test.ts`, `runtimes.test.ts`, `running.test.ts`, `shell.test.ts`, `release.test.ts`, `findings.test.ts` and `cli.test.ts` that exist before this item pass after it, with no fewer tests.
- AC-31: a link planted at the mark's path is never written through: `markText` reads it as absent, a refused install's restore leaves no link there and the link's target unchanged, and a folder at the path makes the restore fail as a mark that was not written, the install going on.
- AC-32: `crew runtime install` and `crew runtime remove` in a repository with no commit take no lock, write no mark, and print what they print before this item.
- AC-34: the single-quote escape is written once in the sources of `packages/engine/src` and `scripts`, in `singleQuoted`; `shellWord` and the improvement loop's quoting return the bytes they returned before.
- AC-35: the release's `--dry-run` listing names both commands of step 12, the fleet's dry run and the real update.
- AC-36: step 11's sweep unlinks a link under the staging prefix without following it, so its target keeps its files; it leaves the install, `<install>.previous` and a name that only resembles the prefix; a step skipped for no local install sweeps nothing.
- AC-38: the text `~/.local/share/wizardingcode-developer-crew/bin/crew` is written once in the engine's source, as the constant the foreign adapter's line and the unfinished sentence both use.
- AC-39: while an uncommitted entry holds an unfinished runtime the reader gives no command for any entry, even with another root's entry updated and not committed, and even when the unfinished install wrote nothing and the change is another runtime's of the same entry; once that entry's paths are clean the entry is cleared and the command is given for what remains.
- AC-40: a refresh whose version record cannot be written, and one whose register entry cannot be written, do not throw: each returns every adapter's result and the sentence `the adapter version was not recorded (<why>)` or `the register entry was not written (<why>)`; `adaptersLine` says the results, the sentence and the commit command, and a session start whose register cannot be written prints them.
- AC-41: the reader takes one entry per runtime: walking the roots in the order of their names, an entry that names a runtime an earlier entry names, or that names a runtime twice, counts as absent and is written back as read, so at most five entries are read whatever the file holds.
- AC-43: the clear removes an entry only when, under the lock, it is key for key the entry the reader judged: an entry judged clean while its runtime was unfinished stays once the install has ended it finished.
- AC-44: while the refresh runs an adapter's install, the mark on disk holds that runtime under the running root as unfinished, with the run's `version`, `at` and `head`; once the install has returned the runtime is held with no `unfinished` key and with `config` true when the install wrote the configuration, and a runtime installed earlier in the same run is held as it ended.
- AC-45: an install that throws from the block that holds its writes leaves its runtime unfinished in the mark, whatever number of files it counts, and a read that finds the paths clean then clears it; an install refused, and one that throws before that block, leave the mark's bytes as they were before that install, and no file when there was none; an install that returns and whose check is not ok is held finished, the refresh's result `failed` with the check's problem.
- AC-46: while the adapters lock is held, a session start and `crew status` say of an unfinished runtime `<name>'s install has not ended and the adapters lock is held: look again in ten seconds with crew status`, the start beside `another session is updating`, with no `run crew runtime install`; once the lock is ten seconds old the line is AC-2's.
- AC-47: a refresh whose mark could not be written and that left one runtime unfinished beside one updated reminds from what it noted, whole: the reader gives no command, and the line holds the unfinished sentence.
- AC-48: `crew runtime remove <name>` keeps the shared skill folder while another runtime's adapter of the same scope remains, says `kept <folder> (still used by <names>)`, and removes the folder with the last adapter.
- AC-49: the shared skill folder is kept too when another runtime's configuration of the scope cannot be read, and the rule holds at user scope: `crew runtime remove <name> --scope user` keeps the folder under the home while another user-scope adapter remains and removes it with the last one.
- AC-50: a refused `crew runtime remove <name>` leaves the mark's bytes as they were.

The ids AC-1, AC-4, AC-5, AC-18, AC-22, AC-29, AC-33, AC-37 and AC-42 are not used: each was replaced before any record named it; AC-28 stands superseded by AC-51 (`notes.md` has the history).

## Risks and rollback

| Risk | What happens | What answers it |
| :- | :- | :- |
| The mark is written before an install that then writes nothing | An entry with an unfinished runtime and clean paths | A refusal and a throw from before the writes restore the mark (AC-45); any other case is cleared by the reader, whose `git status` finds the paths clean (AC-39, AC-45) |
| One unfinished runtime beside finished ones of the same root | No commit command for any adapter of the checkout until its install is run again, even when its own install wrote nothing | Stated as the rule (the entry is judged whole); the sentence says what to run, and one run of the install ends it (AC-13, AC-39) |
| A reader meets the mark while an install is running | It would call a running install cut short and tell the person to run it again | While the adapters lock is held the reader says only that the install has not ended, with no instruction (AC-46) |
| A reader judges an entry clean while its install has written nothing yet | The clear would remove the entry of adapters written a moment later | The clear compares the whole entry under the lock (AC-43) |
| A refresh's check rejects an adapter whose install returned | The files are whole and held finished; the reminder gives a command for an adapter whose check fails | The refresh's result says `failed` with the check's problem and the register records it; `crew runtime check <name>` shows the state; the next refresh checks again. A check that keeps failing is as it is today, with the files no longer left unsaid |
| A person edits an adapter file while its runtime is unfinished | The edit is part of what running the install again will write over | The sentence says to run the install again; a hand install is the person's own act and has no hold-back, as today |
| Running the install again fails as the first did | The runtime stays unfinished | The install's own message names the cause; the sentence stays until the paths are clean or the install returns |
| Running the install again with another root's crew | The adapter now names that root | The note takes the runtime out of the first root's entry (AC-12), so the mark follows the adapter |
| The example path in the other-root sentence is not the adapter's root | A person who follows the example moves an adapter rooted elsewhere to the tarball's root | The tarball's root is the one every released adapter names and the one the line of a foreign adapter already tells the person to keep; the mark follows the adapter (AC-12) |
| The mark's write fails before an install | A kill in that install leaves no trace, as before this item | The run says the mark was not written, and reminds from what it noted, the unfinished runtimes among it (AC-16, AC-47) |
| Mark not written, then an error nobody fenced inside the lock hold | The run's account and its command are lost for that run | Three faults in one run; the start says `not checked (<message>)`, and the next start's refresh holds the adapter back with its paths |
| A hand install finds the lock held by a dead process | It waits until the lock is ten seconds old, then breaks it and installs | The command's wait equals the stale age; only a lock live holders keep to the end of the wait refuses, and the text says to run it again |
| A lock held longer than ten seconds by a live install | Another process breaks it, as today | Not changed here: an install of five runtimes took 278 ms on 2026-11-09 |
| A link or a folder planted at the mark's path | A restore that wrote in place would write outside the project | `markText` reads a regular file only, `restoreMark` writes by rename and removes without recursion (AC-31) |
| A file that names one runtime under many roots | Many git calls inside the hook's bound | The reader takes one entry per runtime, five at most (AC-41); the file is under `.crew/local/`, which git ignores, so no clone brings it |
| A removal keeps a skill folder nobody uses any more | A folder left behind | It is kept only while another configuration of the scope holds crew's hook, or cannot be read; removing that adapter removes the folder (AC-48) |
| A link planted beside the install under the staging prefix | A sweep that followed it would remove files elsewhere | `lstat` decides: the link is unlinked, never followed (AC-36) |
| The dry run and the real run share 300 s | A dry run that takes its whole 60 s leaves the real run 240 s | Measured: about 1.4 s and 4.6 s were all 23 projects stale with five runtimes each; the real run's kill texts already say what a cut leaves |
| Step 11 sweeps while another release extracts on the same Mac | That release's staging folder is removed and its step 11 fails | Two releases at once already collide at the tag and the push; a failed step 11 puts the earlier install back |
| A task's gate marker left by a killed gate | A marker of a dead process | The Stop hook removes a dead process's marker, as it does for the other two runs |

Rollback. Nothing here is released alone: it ships in 0.23.0 with the mark. That release is undone by installing 0.22.0 again (the plugin from the marketplace's earlier ref, the tarball from `<install>.previous`).

- The engine. An engine of 0.22.0 does not open the mark. The file and the lock folder stay under `.crew/local/`, ignored by git and by that engine.
- The adapter files step 12 wrote. Putting 0.22.0 back does not touch them: each project the fleet updated holds 0.23.0's adapter files, uncommitted, and one of them may be unfinished. A refresh of 0.22.0 holds back over uncommitted changes (D-9), so they stay as they are, and it says `stale (uncommitted changes in …); commit or restore them first`, which is the wrong advice for an unfinished adapter. The maintainer who rolled back does the step, project by project; the projects are the ones the release log names, in its `12. dry run:` lines and its `commit in` lines. The step, per project: restore the adapter paths with git (`git restore` for the tracked files, and the untracked ones under the same paths removed), or run `crew runtime install <name>` with 0.22.0's crew, which writes that version's files whole; then commit.

## Non-functional requirements

- Performance: the refresh writes the mark twice per installed adapter instead of once, each a temporary file renamed over the path, and the reader adds one `stat` of the lock's folder. A read runs at most five `git status` and, for the entries that hold a change, at most five `git log`. The timing rows of `hooks-session-start-adapters.test.ts` (`CREW_TIMING=1`) are run again and their figures recorded in `notes.md` beside the earlier item's (75 ms with no mark, 104 ms with one runtime marked, 151 ms with five, 278 ms for a start that installs five); no threshold is set.
- Security: no text of the mark reaches a line or a command. The sentences hold a table runtime's name, a three-number version and fixed text; the unfinished sentences print no root. Every message of git and of the file system passes `quoted`. The pathspecs pass `singleQuoted`.
- Compatibility: engines of other versions share a checkout. An engine before 0.23.0 does not open the mark. A later engine's entry with keys this one does not know is written back as read.

## Cost, time and checks

- What it costs. One session of the crew builds it. The earlier item of the same shape (`2026-11-09-001`: thirty criteria, five tasks) took one day, 2026-11-09, and by the engine's record its 36 role launches (four leads twice, six document reviewers, six reviewers and a judge over two judgement rounds, the delivery's leads) used 4.0 million tokens. This item has 41 criteria and five tasks and launches the same roles; its document review ran two rounds, so six more launches.
- How long. About a day of elapsed time, the measure the earlier item gives. Of that, the machine's own checks take about two hours: each task ends with a gate over the whole suite, about ten minutes (583 s on 2026-11-09), the item's own gate takes about eleven, and there are five tasks, the item's gate and a judgement of two rounds.
- The checks along the way. Each task's gate must pass before the next task starts. After Task 2 the timing rows are run and compared with the earlier figures. After Task 3 a hand install in a scratch repository is run from the built bundle and its printed command is run as printed. The final exam is the item's gate, the six judgement gates and the plan's Verify.
- Why one item, before the release. The user's rule of 2026-10-14: one release at the close of a batch. Everything here changes what 0.23.0 ships of the mark, whose shape is free to change only until that release.

## Out of scope

- Finding 220 (a row that fails once under the whole suite): the next item, with its own design. Finding 228 keeps its record.
- The client projects' own commits: their sessions, or the user's word.
- The release of 0.23.0: the user's to run, after this item is proven.

# Plan: the not-committed mark covers a hand install and an install cut short, and findings 230 and 231 are settled

Spec: `spec.md` (this folder). Paths are from the repository root. Every task leaves `bun run check` green and is committed with the rebuilt bundle (`bun run build` writes `plugins/core/dist/crew.mjs`, which `bun run check` compares with the sources). Test first: each criterion's row is written and seen failing (`crew tdd red`) before its code (`crew tdd green`). One test file runs with `bun test --timeout 60000 <file>`; one row with `-t "<its name>"`. `bun run format` is run before each commit.

The change was prototyped whole in a scratch clone on 2026-11-09 to take the list of existing rows it breaks (the spec's "Rows of earlier items this item rewrites"): the whole suite, 1648 rows, failed in eight rows and passed in all eight with the rewrites this plan gives. The prototype is a reference, never copied in ahead of a row: in this checkout each row is written and seen failing before its code.

The document review ended at its second round, clean. That round's fixes are in this plan and no reviewer has read them: the leads validate the spec again before the build, and the judgement reads the diff.

Names used throughout:

- `ID` is `2026-11-09-003-the-residuals-of-finding-229-and-the-ope`.
- `engineRoot` is the running engine's canonical plugin root, `canonical(pluginRoot())`; in the tests it is `plugins/core`. `pluginRoot()` reads where the running bundle or source lies, so a test's own process always runs from `plugins/core`.
- The *mark* is the file `.crew/local/adapters/uncommitted.json` of a checkout; `markPath(paths)` is its path. The *adapters lock* is the folder `.crew/local/adapters/.lock` that `withLock(join(paths.localDir, "adapters"), …)` makes.
- A *git fixture* is a repository with a commit identity, a `.crew/.gitignore` that keeps `local/` out of git, and adapters installed with `installRuntime` and committed. Four helpers build one:
  - `project()` of `adapters-uncommitted.test.ts`: Copilot installed from `engineRoot` and committed; `entry(root, over)` gives a mark entry for Copilot at the fixture's `HEAD`.
  - `fixture(runtimes, options)` of `adapters.test.ts`: installed from a fake root, `f.root`; `options(f, extra)` gives the refresh's options, with the `install` seam; `markOf(paths)` reads the mark; `result(refresh, name)` one adapter's result.
  - `fixture(runtimes, options)` of `hooks-session-start-adapters.test.ts`: installed from `engineRoot`, with the engine's profile; `start(f)` runs `onSessionStart`, `context(response)` is its text, `afterEngine(text)` the text after the engine's line, `otherRoot()` a second engine root that holds a copy of the built bundle.
  - `adapterProject(env, runtimes, options)` of `cli.test.ts`: registered by a first `crew status`, everything committed, so its `git status --porcelain` is empty; `fleetEnv()` is its environment, `otherEngineRoot()` a second root, `commitLineOf(out, root)` the fleet's `commit in` line.
- For Copilot the engine's table gives: configuration `.github/hooks/crew.json`, skill folder `.agents/skills/crew-method`, agents `.github/agents/crew-*`. For Codex: `.codex/hooks.json`, the same skill folder, `.codex/agents/crew-*`. The refresh installs in the table's order: Codex before Copilot.
- The context `onSessionStart` returns is one string, its lines joined by a space. "The adapters text is exactly X" means: the text after `Engine: crew <VERSION>. ` starts with X. "No adapters text" means the context does not hold `adapters:`.
- The *unfinished sentence* of a runtime `<n>` at version `<v>` is, on its own root, `<n> left unfinished by crew <v> (an install cut short or failed): run crew runtime install <n> again, then commit`, and on another root the same with `again with the crew of its root, such as ~/.local/share/wizardingcode-developer-crew/bin/crew, then commit`. The *held sentence* is `<n>'s install has not ended and the adapters lock is held: look again in ten seconds with crew status`.
- A *held lock* in a row is the adapters lock's folder made by the row and stamped a minute ahead with `utimesSync`, so it is fresh for the whole wait (the way `cli.test.ts` holds a work folder's lock at its line 12422). An *aged lock* is the same folder stamped twenty seconds back, which the next taker breaks.
- A *read-only folder* in a row is a folder set to mode 0555 for the length of one call and put back to 0755 in `finally`.
- *Mutant red*: a row that pins behaviour the code already has cannot fail on its own. Its red run is taken with one named line of source changed, which is put back before the green run. Each such row names its mutant below.

Row names start with `2026-11-09-003 AC-n:` so `-t` selects them.

## Before any change: the preserve pair's first half (AC-30)

`crew tdd before ID AC-30 -- 'bun test --timeout 60000 packages/engine/tests/adapters-uncommitted.test.ts packages/engine/tests/adapters.test.ts packages/engine/tests/hooks-session-start-adapters.test.ts packages/engine/tests/runtimes.test.ts packages/engine/tests/running.test.ts packages/engine/tests/shell.test.ts packages/engine/tests/release.test.ts packages/engine/tests/findings.test.ts packages/engine/tests/cli.test.ts'`

The same command is the `after`, run at the end of Task 5.

## Task 1: the mark's shape, its writers, the reader's data and sentences, the one escape (AC-6, AC-12, AC-23, AC-34, AC-38, AC-39, AC-41, AC-43)

### `packages/engine/src/shell-words.ts` (Modify)

Add, above `const SAFE_WORD`, so no declaration stands between a doc comment and its function:

```ts
/** A word in single quotes for a POSIX shell, each quote inside it written '\''. The engine's one escape. */
export function singleQuoted(word: string): string
```

`quoteWord` returns `SAFE_WORD.test(word) ? word : singleQuoted(word)`.

### `packages/engine/src/run.ts` (Modify)

`shellWord` returns `singleQuoted(word)` where it writes the escape today (line 276); its safe set and the `./` prefix stay. `singleQuoted` joins the names imported from `./shell-words.ts`.

### `scripts/improve-loop.ts` (Modify)

Delete `shQuote` and its doc comment (lines 1664 to 1667). Import `singleQuoted` from `../packages/engine/src/shell-words.ts`, after the import of `scanText`. The two calls of `shQuote` (the launcher's `repo=` and `bun=` lines) become `singleQuoted`.

### `packages/engine/src/adapters-uncommitted.ts` (Modify)

The module comment gains what this item adds: a runtime may be held unfinished, a runtime is named under one root, the hand install writes the mark too.

Types and constants:

```ts
export interface UncommittedEntry {
  version: string;
  at: string;
  head: string;
  /** `unfinished`: an install of this runtime began under this root and did not return. */
  runtimes: { name: RuntimeName; config: boolean; unfinished?: true }[];
  register: boolean;
}
export interface ReminderEntry {
  root: string;
  version: string;
  updated: RuntimeName[];
  unfinished: RuntimeName[];
}
export interface Reminder {
  entries: ReminderEntry[];
  command: string | null;
  failed?: string;
}
/** The crew of the tarball install, as every line that names a root to keep writes it. */
export const KEPT_ROOT_CREW = "~/.local/share/wizardingcode-developer-crew/bin/crew";
```

`Reminder.parts` and `Reminder.roots` are deleted. `Reminder.held` comes in Task 2.

`recognised(value)` returns null in two more cases: a runtime's name appears twice in the entry; `unfinished` is present and no boolean. An item is returned with `unfinished: true` only when the file holds `true`.

`readMarks(paths)` walks the raw file's keys in ascending order and keeps the names it has seen. An empty key counts as absent, as today. An entry is recognised when `recognised` accepts it and none of its runtimes was named by an entry kept before it.

`noteUpdated(paths, root, entry)`:

1. Read the raw file and the root's recognised entry, as today.
2. Unite the runtimes by name: `config` true when either holds it; `unfinished` as the new item says (the key deleted when the new item has none).
3. For every other key of the raw file whose value `recognised` accepts: filter its `runtimes` array, as read, to the items whose `name` is not one the new entry names. An array left empty deletes the key; a shorter array replaces the old one, every other key of that entry kept; an array of the same length changes nothing.
4. Write the root's entry (`version`, `at`, `head`, the united runtimes, `register` true when either holds it) and the file, as today.

```ts
/** Takes a runtime out of every recognised entry: an entry left with no runtime goes, and the file left with no entry. */
export function dropRuntime(paths: CrewPaths, name: RuntimeName): void
```

`dropRuntime` filters as step 3 does, over every key. It writes with `writeJson`, removes the file with `rmSync(markPath(paths), { force: true })` when no key is left, and writes nothing when no entry named the runtime.

`uncommittedAdapters(paths, opts)`:

- `marks` is `readMarks(paths)`. With `opts.also`: the file's entry of `also.root`, and every entry that names a runtime `also.entry` names, are dropped from `marks`, then `also.entry` is set under `also.root`.
- The roots are walked in ascending order, as today.
- An entry's adapter pathspecs are the union of `runtimePathspecs(r.name, r.config || r.unfinished === true)`.
- An uncommitted entry (today's rule, unchanged) adds `{ root, version, updated, unfinished }`: `updated` the names of its runtimes with no `unfinished`, `unfinished` the names of the others.
- `command` is built as today, each pathspec through `singleQuoted`, and only when no entry added holds an unfinished runtime; otherwise it stays null.
- The clear: under the lock, a clean root's entry is removed only when `JSON.stringify(recognised(raw[root]))` equals `JSON.stringify` of the entry that was judged. `recognised` returns its keys in one fixed order, so two equal entries give equal strings.
- It returns null when `entries` is empty and `failed` is undefined.

```ts
export function reminderParts(
  reminder: Reminder,
  opts: { own: string; updatedNow?: RuntimeName[] },
): string[]
export function unfinishedParts(reminder: Reminder | null, own: string): string[]
export function notCommittedLine(reminder: Reminder, own: string): string
```

`reminderParts`, per entry in order:

1. `names` is `updated` without the names of `opts.updatedNow` when the entry's root is `opts.own`. With names left: `<names joined ", "> updated by crew <version> and not committed` when none was taken out, `<names> updated earlier and not committed` when one was.
2. One unfinished sentence per name of `unfinished`: the own-root wording when the entry's root is `opts.own`, the other wording, with `KEPT_ROOT_CREW`, otherwise.

`unfinishedParts` gives step 2's sentences alone, and `[]` for null. `notCommittedLine` gives `adapters not committed: ` and then one list joined by `; `: the sentences of `reminderParts(reminder, { own })`, then `check failed (<failed>)` when `failed` is set; then `. Commit: <command>` when there is one.

### `packages/engine/src/adapters.ts` (Modify, the least that compiles; Task 2 does the rest)

- `adaptersLine(refresh, extra = [], reminder = null, own = refresh?.root ?? "")`: the reminder's sentences come from `reminderParts(reminder, { own, updatedNow })`, with `updatedNow` the runtimes of `refresh.results` whose status is `updated`. The loop over `reminder.parts` and `reminder.roots` is deleted.
- The line of a foreign adapter takes its path text from `KEPT_ROOT_CREW`.

### `packages/engine/src/cli.ts` (Modify, the least that compiles)

`case "status"`: `own` is `canonical(pluginRoot())`; the line is `notCommittedLine(reminder, own)` and the JSON's `parts` are `reminderParts(reminder, { own })`.

### `packages/engine/tests/adapters-uncommitted.test.ts` (Modify)

The existing rows `2026-11-09-001 AC-4`, `AC-9`, `AC-27` and `AC-31` are rewritten as the spec's table says, with the helper `partsOf` added after `commit`.

New rows at the end:

- `2026-11-09-003 AC-6`: on `project()`, an entry under `/r/a` with `runtimes: [{ name: "copilot", config: false, unfinished: true }]` and a change in `.github/hooks/crew.json` alone: the reader returns one entry with `unfinished: ["copilot"]` and `command` null. A second `project()` with the same entry without `unfinished` and the same change: the reader returns null.
- `2026-11-09-003 AC-12`: the mark's file written by hand with `/r/a` holding Copilot and Codex and an extra key `"kept": 1`, `/r/b` holding Copilot, and `"/r/x": { "shape": 2 }`. `noteUpdated(paths, "/r/c", …copilot…)`: `/r/a` holds Codex alone and still `"kept": 1`, `/r/b` is gone, `/r/x` is as read, `/r/c` holds Copilot. `dropRuntime(paths, "codex")` removes `/r/a`. `dropRuntime(paths, "copilot")` leaves the file with `/r/x` alone. A last `dropRuntime(paths, "copilot")` leaves the file's bytes unchanged.
- `2026-11-09-003 AC-39`: on `project()`, `/r/a` with Copilot unfinished and `/r/b` with Codex finished, and the skill page changed: both entries are returned, `command` is null, `partsOf` holds `codex updated by crew` and the other-root unfinished sentence of Copilot. Then one entry, `/r/a`, with Codex finished and Copilot unfinished, the skill page changed: one entry, `command` null. Then the page restored with `git checkout`: the reader with `clear: true` returns null and the mark file is gone. A last case: `/r/a` with Copilot unfinished, its paths clean, and `/r/b` with Codex finished and one new file `.codex/agents/crew-x.md`: the first read with `clear: true` returns `/r/b` alone, with the command, and the file no longer holds `/r/a`.
- `2026-11-09-003 AC-41`: the mark's file written by hand with twelve roots, `/r/00` to `/r/11`: the first five name the five runtimes in turn, the other seven name Copilot again; the skill page changed. The reader returns the five first roots and `readMarks` has five keys. A file whose one entry names Copilot twice: `readMarks` is empty. After `noteUpdated(paths, "/r/z", …gemini…)` on that file, the twice-named entry is in the file as read. A file whose one key is the empty string, with a well-shaped entry: `readMarks` is empty.
- `2026-11-09-003 AC-43`: on `project()`, `/r/a` with Copilot unfinished at the fixture's `HEAD`, its paths clean. A stub `git` first on `PATH` for the read (as `adapters.test.ts` stubs git for its row `2026-11-08-002 AC-24`, by `process.env.PATH`, restored in `finally`). The row asks the shell for the real git's path (`command -v git`) before it changes `PATH` and writes that path into the stub, a `sh` script. The stub runs the real git with all its arguments into a temporary file and keeps its exit code. The reader calls `git -c core.fsmonitor=false status …`, so the stub looks for the word `status` among all its arguments (`case " $* " in *" status "*)`), and the first time it finds it, known by a marker file it then creates, it copies over the mark's file a file the row prepared, the same entry finished (`runtimes: [{ name: "copilot", config: true }]`, the same `at`), and appends a line to the skill page. It then prints what the real git printed and exits with its code. `uncommittedAdapters(paths, { clear: true })` returns null, since the status it saw was clean. Afterwards the marker file exists, the mark's file still holds `/r/a`, and a second read with the real git returns the entry with its command. Before the change the first read removes the entry, since its `at` matches.

### `packages/engine/tests/adapters.test.ts` (Modify, one new row at the end)

- `2026-11-09-003 AC-38`: the text `~/.local/share/wizardingcode-developer-crew/bin/crew` appears once in the `.ts` files under `packages/engine/src`, in `adapters-uncommitted.ts`. The row takes a refresh from `refreshAdapters` itself, never from an object written by hand (`Refresh` gains a field in Task 2): `fixture([RUNTIMES.copilot])` with the root in `.github/hooks/crew.json` rewritten to `/gone`, a folder that holds no `dist/crew.mjs`, and committed, so the refresh's `foreign` holds Copilot as `root gone`; `adaptersLine` of that refresh holds `such as ~/.local/share/wizardingcode-developer-crew/bin/crew`.

### `packages/engine/tests/shell.test.ts` (Modify, new rows at the end)

- `2026-11-09-003 AC-23`: `singleQuoted("a'b c")` is `'a'\''b c'`; `execFileSync("sh", ["-c", "printf %s " + singleQuoted("a'b c")])` prints `a'b c`; `quoteWord("a'b")` equals `singleQuoted("a'b")` and `quoteWord("a.b")` is `a.b`. On a git fixture as `adapters-uncommitted.test.ts` builds (the row imports `installRuntime` and makes its own), the command of an entry with Copilot's skill page and one agent file changed is `git add -A -- '.agents/skills/crew-method' '.github/agents/crew-*' && git commit -m 'adapters refreshed by crew 1.2.3'`.
- `2026-11-09-003 AC-34`: the text `.replace(/'/g, "'\\''")` as it stands in source appears once in the `.ts` files under `packages/engine/src` and `scripts`, in `shell-words.ts`; a doc comment's escaped quote does not hold `.replace(` and is not counted. `shellWord("a b")` is `'a b'`, `shellWord("-x")` is `./-x`, `shellWord("it's")` is `'it'\''s'`.

Reds. AC-23 fails for the missing export. AC-34 fails on its count: four copies of the escape. AC-38 fails on where the one copy of the path text is: `adapters.ts` today. AC-6, AC-12, AC-39, AC-41 and AC-43 fail on the code as it stands.

### Close

`bun run build`, `bun run check`, commit, then `crew task ID note T-1 --criteria AC-6,AC-12,AC-23,AC-34,AC-38,AC-39,AC-41,AC-43 --scope packages/engine/src/adapters-uncommitted.ts,packages/engine/src/adapters.ts,packages/engine/src/cli.ts,packages/engine/src/shell-words.ts,packages/engine/src/run.ts,scripts/improve-loop.ts`, `crew task ID gate T-1`, `crew task ID brief T-1`.

## Task 2: the refresh notes before it installs, says what it could not write, and SessionStart always reads (AC-2, AC-3, AC-7, AC-19, AC-20, AC-21, AC-31, AC-40, AC-44, AC-45, AC-46, AC-47)

### `packages/engine/src/lock.ts` (Modify)

```ts
/** Whether a lock on `dir` is held now: its folder exists and is not older than the stale age. */
export function lockHeld(dir: string): boolean
```

It is `ageOf(join(dir, ".lock"))` not null and at most `LOCK_STALE_MS`, placed after `ageOf`.

### `packages/engine/src/adapters-uncommitted.ts` (Modify)

```ts
/** The mark's bytes when its path is a regular file; null for nothing, a link or a folder there. */
export function markText(paths: CrewPaths): string | null
/** Puts the bytes back by rename, or removes what is at the path (never recursively) when `text` is null. */
export function restoreMark(paths: CrewPaths, text: string | null): void
```

`markText` uses `lstatSync(path).isFile()` and `readFileSync(path, "utf8")`, any throw giving null. `restoreMark` uses `writeText` of `./fs.ts` for bytes and `rmSync(markPath(paths), { force: true })` for null.

`Reminder` gains `held: boolean`: `uncommittedAdapters` sets it from `lockHeld(join(paths.localDir, "adapters"))`, read once before the mark. `reminderParts` and `unfinishedParts` word an unfinished runtime with the held sentence when `held` is true, and as in Task 1 otherwise.

### `packages/engine/src/adapters.ts` (Modify)

`Refresh` gains `notWritten: string[]`, empty at the start.

One exported function holds the install under the mark, for a caller that holds the adapters lock:

```ts
export type MarkedInstall =
  | { kind: "installed"; done: Installed }
  | { kind: "refused"; refused: string }
  /** `began`: the throw came from the block that holds the install's writes; `partly`: a write had ended. */
  | { kind: "threw"; message: string; began: boolean; partly: boolean };

export function installUnderMark(o: {
  paths: CrewPaths;
  /** The mark's key: the engine's canonical root. */
  root: string;
  version: string;
  at: string;
  head: string | null;
  name: RuntimeName;
  install: () => Installed | { refused: string };
  /** Told the quoted reason each time a write of the mark fails. */
  markFailed: (why: string) => void;
}): MarkedInstall
```

In order:

1. With `head` null every write of the mark below is skipped.
2. `before = markText(o.paths)`.
3. `noteUpdated` under `o.root` with `version`, `at`, `head`, the runtime `{ name, config: false, unfinished: true }` and `register: false`.
4. `o.install()`. A throw: `began` is `error instanceof InstallFailed`, `partly` is `began && error.written > 0`; when not `began`, `restoreMark(o.paths, before)`; return `{ kind: "threw", message: quoted(error.message), began, partly }`.
5. A refusal: `restoreMark(o.paths, before)`; return `{ kind: "refused", refused }`.
6. `noteUpdated` with the same `version`, `at`, `head` and `register: false`, the runtime `{ name, config: done.configWritten }`; return `{ kind: "installed", done }`.

Each write of the mark (steps 3, 4, 5, 6) runs in a `try` whose `catch` calls `o.markFailed(quoted(message))`.

`refreshAdapters`:

- Two fenced helpers. `record()`: `recordAdapterVersion(paths, o.root, o.version)` then `refresh.recorded = true`; a throw pushes `the adapter version was not recorded (<quoted message>)` to `notWritten`. `writeEntry()`, today's function, with its `appendDecision` fenced the same way and `the register entry was not written (<quoted message>)`.
- `record()` replaces the two direct calls of `recordAdapterVersion`: the one with no install (every own-root adapter up to date), the one at the end of the lock hold.
- A list `noted`, of the shape of an entry's `runtimes`, starts empty before the lock hold.
- The install loop of step 8 calls `installUnderMark` per adapter, with `root: o.root`, the run's `at` and `head`, `install` the seam or `installRuntime`, and `markFailed` setting `refresh.markFailed` once.
  - `installed`: `{ name, config: done.configWritten }` is pushed to `noted`; then the refresh's own check runs, as today: ok ends `updated` (with `removed`, `configWritten`, `trust` as today), not ok ends `failed` with `quoted(after.problems[0] ?? "the check is not ok")`, and a throw of the check ends `failed` with its quoted message.
  - `refused`: `refused` with `quoted(refused)`.
  - `threw`: when `began`, `{ name, config: false, unfinished: true }` is pushed to `noted`. The status is `failed` with the message, and with `; partly written; crew runtime check <name> shows the state` after it when `partly`, as today.
- After `writeEntry()`: when `noted` is not empty and `head` is not null, `refresh.entry` is `{ version, at, head, runtimes: noted, register: refresh.appended }`, and when the register entry was appended the `mark` helper notes `noted` with `register: true`. This replaces today's block, which builds the entry from the `updated` results alone.

`adaptersLine`:

- after `markFailedText`, each sentence of `refresh.notWritten`;
- the two hold-back suffixes (`; commit or restore them first` and `; commit them to adopt the adapter, or run crew runtime install <name> again`) are added only when no entry of the reminder holds an unfinished runtime.

### `packages/engine/src/hooks/session-start.ts` (Modify)

The adapter step becomes two `try` blocks, with three names declared before them: `refresh` (null), `engineRoot` (the empty string) and `said` (an empty list).

- The first block computes `engineRoot`, runs the refresh when the recorded version differs, and waits for the adapters lock; a `LockBusy` of the wait pushes `another session is updating` to `said`; its `catch` pushes `not checked (<quoted message>)`. When the block throws before `engineRoot` is known, the second block runs with the empty string as the own root.
- The second block calls `uncommittedAdapters(ctx.paths, { clear: true, also: unwrittenMark(refresh) })` and sets the text to `adaptersLine(refresh, said, reminder, engineRoot)`; its `catch` sets the text to `adapters: not checked (<quoted message>).`.

### `packages/engine/src/cli.ts` (Modify, `projectsUpdate`)

- `refresh` is declared before the `try`, null until the refresh returns. The `try` holds the refresh alone; its `catch` keeps the quoted message.
- `uncommittedAdapters(paths, { clear: !dryRun, also: unwrittenMark(refresh) })` is called after the `try`, for a thrown refresh too.
- `unfinished` is `unfinishedParts(reminder, engineRoot)`.
- A thrown refresh emits `failed`, with the units `failed (<reason>)` and then `unfinished`.
- Otherwise the units are, in order: the results, the foreign adapters, the mark's failure, `refresh.notWritten`, `unfinished`. The bucket is `failed` when `refresh.notWritten` is not empty, and today's otherwise. `allOk` also needs `notWritten` and `unfinished` empty.
- The push of the commit line (`if (reminder?.command) commits.push(…)`) moves after the reader, outside the `try`, so a refresh that threw reaches it. A reminder with no command adds no line, as today.

`case "status"` needs no change: `notCommittedLine` words the held sentence.

### `packages/engine/tests/adapters.test.ts` (Modify)

The existing row `2026-11-09-001 AC-28` is rewritten as the spec says.

New rows at the end:

- `2026-11-09-003 AC-44`: `fixture([RUNTIMES.copilot, RUNTIMES.codex], { staleConfig: true })`, the `install` seam reading `markOf(f.paths)[f.root]` at each call and then calling `installRuntime`. At Codex's call the entry's runtimes are `[{ name: "codex", config: false, unfinished: true }]`, its `version` is `VERSION`, its `head` the fixture's `HEAD`; at Copilot's call they are `[{ name: "codex", config: true }, { name: "copilot", config: false, unfinished: true }]`; after the refresh both are `config: true` and no item has the key `unfinished`.
- `2026-11-09-003 AC-45`: six refreshes of a stale Copilot fixture, each with its seam.
  1. The seam writes `.agents/skills/crew-method/SKILL.md` and throws `new InstallFailed("boom", 1)`: the result is `failed`, the mark holds `{ name: "copilot", config: false, unfinished: true }`.
  2. The seam throws `new InstallFailed("boom", 0)` and writes nothing: `failed`, the mark holds Copilot unfinished; `uncommittedAdapters(f.paths, { clear: true })` then returns null and the mark file is gone.
  3. The seam returns `{ refused: "no" }`: `refused`, no mark file.
  4. The seam throws `new Error("boom")`: `failed`, no mark file.
  5. The seam returns `{ files: [], removed: [], left: [], configWritten: false, trust: null }` and writes nothing, so the check is not ok (the existing row `2026-11-08-002 AC-2 (the judgement's test-quality return)` stages the same): `failed`, and the mark holds `{ name: "copilot", config: false }`, with no `unfinished` key.
  6. A mark written by hand first, with another root's entry for Codex, then a refused install: the file's bytes after the refresh equal the bytes before.
- `2026-11-09-003 AC-47`: `fixture([RUNTIMES.copilot, RUNTIMES.codex], { staleConfig: true })` with a folder holding one file at the mark's path, so no note can be written. The seam installs Codex with `installRuntime` and, for Copilot, writes the skill page and throws `new InstallFailed("boom", 1)`. `refresh.markFailed` is set; `refresh.entry.runtimes` is `[{ name: "codex", config: true }, { name: "copilot", config: false, unfinished: true }]`. `uncommittedAdapters(f.paths, { clear: false, also: unwrittenMark(refresh) })` has `command` null and one entry with `updated: ["codex"]` and `unfinished: ["copilot"]`; `adaptersLine(refresh, [], reminder, f.root)` holds the own-root unfinished sentence of Copilot and no `Commit:`.
- `2026-11-09-003 AC-31`: a file outside the project holding `{}` and a link to it at the mark's path (`.crew/local/adapters` made first): `markText` is null; a refresh whose seam refuses leaves nothing at the mark's path (`lstatSync` throws) and the file outside still holds `{}`. A second fixture with a folder at the mark's path holding one file: the refresh with the real install ends Copilot `updated`, `refresh.markFailed` is set, and the folder and its file are there.
- `2026-11-09-003 AC-40`: two refreshes of a stale Copilot fixture, `.crew/local/adapters` made first in both. (a) `.crew/local` read-only: the refresh returns, Copilot `updated`, `recorded` false, `notWritten` one sentence that starts `the adapter version was not recorded (EACCES`, `entry` set; `adaptersLine(refresh, [], uncommittedAdapters(f.paths, { clear: false }), f.root)` holds `copilot updated (`, that sentence and `. Commit: git add -A -- `. (b) `.crew` read-only: `recorded` true, `notWritten` one sentence that starts `the register entry was not written (EACCES`. Before the change both refreshes throw (probed on 2026-11-09: `EACCES: permission denied, mkdir '<project>/.crew/local/.lock'` for (a)).

### `packages/engine/tests/hooks-session-start-adapters.test.ts` (Modify, new rows at the end)

- `2026-11-09-003 AC-2`: the row builds its repository by hand, as `2026-11-09-001 AC-3` does at its lines 341 to 368: `makeRepo` with the `.crew/.gitignore`, a commit identity, `ensureProfile`, `installRuntime(RUNTIMES.copilot, "project", dirs, other)` with `other = otherRoot()`, a commit, then the skill page changed and committed, so the adapter is stale. The child is `spawnSync(process.execPath, [script], { env })`, its script written to a temporary folder with the repository's absolute paths in it:

  ```ts
  import { writeFileSync } from "node:fs";
  import { join } from "node:path";
  const { refreshAdapters } = await import("<repo>/packages/engine/src/adapters.ts");
  const { resolvePaths } = await import("<repo>/packages/engine/src/paths.ts");
  const paths = resolvePaths("<project>");
  if (!paths) throw new Error("crew is inactive in the fixture");
  refreshAdapters(paths, {
    root: "<other>", version: "9.9.9", home: process.env.HOME ?? "",
    dryRun: false, deadline: null, resumed: false, activeItem: false, worktree: false, live: false,
    install: () => {
      writeFileSync(join("<project>", ".agents/skills/crew-method/SKILL.md"), "# half\n");
      process.kill(process.pid, "SIGKILL");
      throw new Error("not reached");
    },
  });
  ```

  `<other>` is `otherRoot()`'s value, which is already canonical; `env` is the fixture's, so `resolvePaths`, which reads the process's environment by default, gives the paths the test's `repoPaths` gives. The script calls it with one argument: a row of the suite (`jev.test.ts`, `2026-10-28-004 AC-9`) refuses a test file that passes the process environment, and the script's text is in the test file. The child's `signal` is `SIGKILL`; the mark holds `{ name: "copilot", config: false, unfinished: true }` under `other` with version `9.9.9`; the adapters lock's folder exists. The row then ages the lock. `start(f)` gives the adapters text exactly `adapters: ` + the other-root unfinished sentence of Copilot at `9.9.9` + `.`, and the context holds no `Commit:`.
- `2026-11-09-003 AC-46`: the same state built the same way, the lock held instead of aged, and `adapterDeadline.ms` set to 200 for the row (put back in `finally`): the adapters text is exactly `adapters: ` + the held sentence of Copilot + `; another session is updating.`, and the context holds no `run crew runtime install`. Then the lock is aged: the next start's text is AC-2's.
- `2026-11-09-003 AC-3`: a stale Copilot fixture on `engineRoot`, its recorded version `0.0.1`, the skill page changed again and not committed, and a mark written with `noteUpdated` holding Copilot unfinished under `engineRoot` at the fixture's `HEAD`: the adapters text holds `copilot stale (uncommitted changes in `, the own-root unfinished sentence, no `Commit:` and no `commit or restore them first`. A second fixture whose uncommitted change is a new file `.github/agents/crew-x.md`: the text holds `stale (not committed: ` and no `commit them to adopt the adapter`. The row fails by itself before Task 2's code: the suffixes are printed whatever the reminder holds.
- `2026-11-09-003 AC-40 (SessionStart)`: the register's sentence through the hook. A Copilot fixture started once (so everything a first start writes is written), made stale again by a second commit, its recorded version set to `0.0.1`, then `.crew` read-only for the start. The adapters text holds `copilot updated (`, `the register entry was not written (EACCES` and `. Commit: git add -A -- `. The version record's sentence cannot be staged through the hook: the hook's own baseline writes the same state file. Probed on 2026-11-09 with the code before this item: this start keeps its context and says `adapters: not checked (EACCES: permission denied, open '<project>/.crew/<a temporary name>')`.
- `2026-11-09-003 AC-20`: a Copilot fixture at the recorded version (so the start runs no refresh), the skill page changed and not committed, a mark written with `noteUpdated(paths, "/r/other", …)` naming Copilot finished, `config: false`, at version `1.2.3` and the fixture's `HEAD`, then `.crew/local/adapters` read-only for the start, so the wait for the adapters lock throws. The adapters text is exactly `adapters: copilot updated by crew 1.2.3 and not committed; not checked (<m>). Commit: git add -A -- '.agents/skills/crew-method' && git commit -m 'adapters refreshed by crew 1.2.3'.`, where `<m>` is `quoted` of `EACCES: permission denied, mkdir '<project>/.crew/local/adapters/.lock'`. The same fixture with no mark: the adapters text is exactly `adapters: not checked (<m>).`, and the context with that sentence cut equals the context of a start of the same fixture with the folder writable, as the earlier row `2026-11-09-001 AC-13` compares. Probed on 2026-11-09 with the code before this item: the start keeps its context and says the not-checked text alone, and the mark's file is still readable (`readMarks` returns its entry); the hook does not read it then, which is the row's red.
- `2026-11-09-003 AC-21`: a fixture with Codex and Copilot on `engineRoot`, committed; Codex's configuration `.codex/hooks.json` then deleted and the deletion committed, so Codex is no longer own-root; the skill page made stale and committed; the recorded version `0.0.1`; a mark written with `noteUpdated` under `engineRoot` naming Codex finished, `config: false`, at the fixture's `HEAD`; and one new file `.codex/agents/crew-x.md` left untracked. The start updates Copilot: the adapters text holds `copilot updated (`, `codex updated earlier and not committed`, and a `Commit:` whose command names `'.codex/agents/crew-*'` and `'.agents/skills/crew-method'`.

The file's two timing rows run again with `CREW_TIMING=1`: the one that prints `adapter step with five runtimes` (its line 288) and `2026-11-09-001 timing` (its line 510). Their figures go to `notes.md`.

### `packages/engine/tests/cli.test.ts` (Modify, new rows after `2026-11-09-001 AC-29`)

- `2026-11-09-003 AC-7`: `adapterProject(env, ["copilot"], { stale: true })`, the skill page changed and not committed, and a mark written with `noteUpdated` holding Copilot unfinished under `otherEngineRoot()` at the project's `HEAD`, version `VERSION`. `crew status` ends with `adapters not committed: ` + the other-root unfinished sentence, with no `Commit:`; `--json` has `adaptersUncommitted.command` null. `crew projects update` prints the sentence inside the project's line, and `commitLineOf` is null.
- `2026-11-09-003 AC-46 (crew status)`: the same project and mark, with the adapters lock held: `crew status` ends with `adapters not committed: ` + the held sentence.
- `2026-11-09-003 AC-19`: a stale Copilot project whose `.crew/local/adapters` is made and whose `.crew/local` is then read-only for the run. The run's cwd is the project itself. The fleet's line for it holds `copilot updated (` and `the adapter version was not recorded (EACCES`; the count line holds `0 updated` and `1 failed`; the exit code is 1.
- `2026-11-09-003 AC-20 (the fleet)`: a stale Copilot project, its adapter paths clean, with a mark written by the row under `/r/other` naming Codex finished, `config: false`, at version `VERSION` and the project's `HEAD`, and one new file `.codex/agents/crew-x.md` left untracked, then `.crew/local/adapters` read-only for the run. The refresh reaches its lock and throws: the project's line holds `failed (EACCES`, and the output holds `commit in <name>: git add -A -- '.codex/agents/crew-*' && git commit -m 'adapters refreshed by crew <VERSION>'`.

### Close

`bun run build`, `bun run check`, commit, `crew task ID note T-2 --criteria AC-2,AC-3,AC-7,AC-19,AC-20,AC-21,AC-31,AC-40,AC-44,AC-45,AC-46,AC-47 --scope packages/engine/src/adapters.ts,packages/engine/src/adapters-uncommitted.ts,packages/engine/src/lock.ts,packages/engine/src/hooks/session-start.ts,packages/engine/src/cli.ts`, `crew task ID gate T-2`, `crew task ID brief T-2`.

## Task 3: the hand install, the remove, the task gate's marker (AC-8, AC-9, AC-10, AC-11, AC-13, AC-14, AC-15, AC-16, AC-17, AC-32, AC-48, AC-49, AC-50)

### `packages/engine/src/runtimes.ts` (Modify)

```ts
/** A folder a removal left in place, and the runtimes whose adapters still use it. */
export interface Kept {
  path: string;
  by: RuntimeName[];
}
```

`removeRuntime` returns `{ rewritten, removed, kept? }`. Before it removes the skill folder it asks which other runtimes share it: each name of `RUNTIME_NAMES` but `claude` and the one removed, whose skill folder at this scope is the same path, and whose configuration at this scope exists and gives a root to `rootOf(text, runtime, "")`; a configuration that cannot be read counts too. With none, the folder is removed as today. With one or more, the folder stays and `kept` is `{ path: <the folder>, by: <their names, in the table's order> }`. The agents and the configuration go as today.

### `packages/engine/src/adapters.ts` (Modify)

```ts
/** How long a hand install and a remove wait for the adapters lock: an object, so a row can shorten it. */
export const handLockWait = { ms: COMMAND_LOCK_WAIT_MS };

export interface HandInstall {
  done: Installed;
  /** Why the mark could not be written, quoted. */
  markFailed?: string;
  /** What the install noted, for the reader's `also` when the mark could not be written; absent with no commit to name. */
  entry?: UncommittedEntry;
}
export function installByHand(
  paths: CrewPaths,
  runtime: Runtime,
  o: { root: string; version: string; home: string; install?: typeof installRuntime },
): HandInstall | { refused: string }

export function removeByHand(
  paths: CrewPaths,
  runtime: Runtime,
  o: { home: string },
):
  | { rewritten: string[]; removed: string[]; kept?: Kept; markFailed?: string }
  | { refused: string }
```

`o.root` is the engine's root as `pluginRoot()` gives it, which the install writes into the configuration as today; the mark's key is `canonical(o.root)`. Both functions are for project scope. Every `refused` they return is the text to print.

`installByHand`:

1. `head = baseCommitOf(paths.root)`. Null: a plain install; return `{ done }`, or `{ refused: quoted(refused) }`. No lock, no mark. A throw is not caught, as today.
2. `withLock(join(paths.localDir, "adapters"), …, { what: "adapter refresh", waitMs: handLockWait.ms })`. `LockBusy` returns `{ refused: "another session is updating the adapters: run crew runtime install <name> again" }`; any other error is thrown.
3. Inside the lock, `installUnderMark` with `root: canonical(o.root)`, `at: nowIso()`, `head`, and `markFailed` keeping the first reason. `refused` returns `{ refused: quoted(refused) }`. `threw` returns `{ refused: message }`, and `{ refused: message + "; partly written: run crew runtime install <name> again" }` when `partly`. `installed` returns `{ done, markFailed?, entry }`, the entry `{ version, at, head, runtimes: [{ name, config: done.configWritten }], register: false }`.

`removeByHand`: `baseCommitOf` null runs `removeRuntime(runtime, "project", dirs)` alone. Otherwise the lock with the same wait (`LockBusy` returns `{ refused: "another session is updating the adapters: run crew runtime remove <name> again" }`), then `removeRuntime`. Its refusal is returned and the mark is untouched. A throw of it goes on to the caller as it does today, the lock released by `withLock`, the mark untouched. Otherwise `dropRuntime(paths, runtime.name)`, a throw of it returned as `markFailed`, its message through `quoted`.

### `packages/engine/src/cli.ts` (Modify)

`case "runtime"`:

- `install` with `--scope user`: today's code, unchanged (`installRuntime(runtime, "user", dirs, root)`, its refusal through `quoted`).
- `install` otherwise: `installByHand(env.paths, runtime, { root, version: VERSION, home: dirs.home })`; a refusal is printed as returned, `refuse(hand.refused)`, with no second `quoted`. `own` is `canonical(root)`. When `hand.entry` is set, the reader is called: `uncommittedAdapters(env.paths, { clear: true, also })`, `also` being `{ root: own, entry: hand.entry }` when `hand.markFailed` is set and undefined otherwise. The lines printed are today's, then `markFailedText(hand.markFailed)` when set, then `notCommittedLine(reminder, own)` when the reader returned a reminder. The JSON gains `adaptersUncommitted: { parts: reminderParts(reminder, { own }), command: reminder.command }` when there is a reminder.
- `remove` with `--scope user`: `removeRuntime(runtime, "user", dirs)` as today, and the new `kept` line and key.
- `remove` otherwise: `removeByHand(env.paths, runtime, { home: dirs.home })`; a refusal printed as returned. The reader (`clear: true`) is called when `baseCommitOf(env.paths.root)` is not null. The text is: the `rewritten` lines, the `removed` lines, then `kept <path> (still used by <names joined ", ">)` when `kept` is set; when all three are empty, the sentence `nothing of crew's installed for <name> at project scope` in their place; then the mark's failure when set; then `notCommittedLine` when a reminder remains. The JSON gains `kept` when set and `adaptersUncommitted` as above. `baseCommitOf` joins the names imported from `./fingerprint.ts`.

`taskGate`: the call of `runTaskGate` goes inside `withRunning(env.paths, opened.work.id, env.session, "crew task <id> gate <T-n>", () => runTaskGate(…))`, the text built from `opened.work.id` and `task`.

### `packages/engine/tests/cli.test.ts` (Modify)

The existing row `SP6-T4 AC-3` is rewritten in the three places the spec names.

`onSessionStart` is imported from `../src/hooks/session-start.ts` and `hookContext` from `./helpers.ts`, as `running.test.ts` imports them; a start is `onSessionStart(hookContext({ session_id: "s", cwd: root }, env), { source: "startup" })`, and its text is `hookSpecificOutput.additionalContext`.

New rows after Task 2's. Unless a row says otherwise it runs the CLI with `io(root, env)` in `adapterProject(env, [])`, a registered repository with everything committed and no adapter.

- `2026-11-09-003 AC-8`: `crew runtime install copilot`: exit 0; the mark's one key is `canonical(pluginRoot())`, its entry has `version` equal to `VERSION`, `head` equal to `HEAD`, `runtimes` equal to `[{ name: "copilot", config: true }]`, `register` false; the output's last line is `adapters not committed: copilot updated by crew <VERSION> and not committed. Commit: ` + a command that starts `git add -A -- `. `--json` in a second project carries `adaptersUncommitted` with one part and the same command. The command, run with `sh -c` and the commit identity in `GIT_AUTHOR_NAME`, `GIT_AUTHOR_EMAIL`, `GIT_COMMITTER_NAME` and `GIT_COMMITTER_EMAIL`, exits 0; a start in that project then has no adapters text, and the mark file is gone.
- `2026-11-09-003 AC-9`: a second root means a second bundle. The hand install is run by a child process from `otherEngineRoot()`, which holds a copy of the built bundle: `spawnSync("node", [join(other, "dist", "crew.mjs"), "runtime", "install", "copilot"], { cwd: root, env })`, exit 0. The mark's one key is the other root. A start in the test's own process, whose root is `plugins/core`, gives the adapters text exactly `adapters: copilot updated by crew <VERSION> and not committed. Commit: ` + the command + `.`. The row reads the built bundle, so `bun run build` comes before its green run.
- `2026-11-09-003 AC-10`: two folders that are no repository (`tempDir`), `.crew/local/adapters` made in the first and its adapters lock held. `crew runtime install copilot` in the first: exit 0 at once; no file `uncommitted.json`; no `adapters not committed` in the output. The second folder gets `installRuntime(RUNTIMES.copilot, "project", …)` directly. The two sides compared: the lines the command printed in the first folder, and the `files` the direct install returned in the second, each path with its own folder's prefix taken off; they are equal, in order. Then, in `adapterProject(env, [])`, `crew runtime install gemini --scope user`: no mark file, no `adapters not committed`. Mutant red: in `installByHand` the null-head return taken out, so the locked path runs: the held lock makes the install wait and refuse.
- `2026-11-09-003 AC-32`: a repository with no commit (`git init` in a `tempDir`, nothing else), `.crew/local/adapters` made and its adapters lock held for the whole row: `crew runtime install copilot` and then `crew runtime remove copilot` exit 0, write no mark, and print no `adapters not committed`. Mutant red: the same as AC-10's, and the null-head return of `removeByHand` for the second command.
- `2026-11-09-003 AC-11`: `handLockWait.ms` is `COMMAND_LOCK_WAIT_MS`, asserted first; the row then sets it to 200 and puts it back in `finally`. With a held lock, `crew runtime install copilot` exits 1 with exactly `another session is updating the adapters: run crew runtime install copilot again`, and `git status --porcelain` is empty. In `adapterProject(env, ["copilot"])` with a held lock, `crew runtime remove copilot` exits 1 with the remove's text and `git status --porcelain` is empty. Then, in a third project and with the wait at its real value again, an aged lock: `crew runtime install copilot` exits 0 at once, the lock a dead process left broken.
- `2026-11-09-003 AC-13`: a mark written with `noteUpdated` holding Copilot unfinished under `canonical(pluginRoot())`, and a part-written adapter (the skill page alone, untracked); `crew runtime install copilot`: the output holds `copilot updated by crew` and `Commit:` and no `left unfinished`; the mark's item has no `unfinished` key.
- `2026-11-09-003 AC-14`: a mark written by hand with `/r/other` holding Codex, and `.github/hooks/crew.json` holding `{not json`: `crew runtime install copilot` exits 1 and the mark's bytes are unchanged. Then, in a second project, the folder `.github/agents` made by the row and read-only for the command: the skill is copied and the agents fail. Exit 1; the error ends `; partly written: run crew runtime install copilot again`; the mark holds `{ name: "copilot", config: false, unfinished: true }`.
- `2026-11-09-003 AC-15`: `crew runtime install copilot` and `crew runtime install codex`, neither committed, then the mark's file rewritten by the row so that a second root, `/r/other`, holds Copilot too. `crew runtime remove copilot`: the mark holds one key, the engine's root, with Codex alone; the output's last line starts `adapters not committed: codex updated by crew`. `crew runtime remove codex`: the mark file is gone and the output holds no `adapters not committed`.
- `2026-11-09-003 AC-16`: a folder holding one file at the mark's path; `crew runtime install copilot`: exit 0, the adapter's files written, a line that starts `the not-committed mark was not written (`, and a last line with `Commit:`.
- `2026-11-09-003 AC-48`: `crew runtime install copilot` and `crew runtime install codex`, then `crew runtime remove copilot`: the output holds `kept <root>/.agents/skills/crew-method (still used by codex)` and no `removed` line for that folder; `.agents/skills/crew-method/SKILL.md` is there; `--json` in a second project carries `kept` with `by` equal to `["codex"]`. `crew runtime remove codex`: its output holds `removed <root>/.agents/skills/crew-method` and the folder is gone.
- `2026-11-09-003 AC-49`: a project with Copilot installed and Codex's configuration, `.codex/hooks.json`, made a folder holding a file, which exists and cannot be read as a file: `crew runtime remove copilot` keeps the skill folder and its line names `codex`. Then the user scope, with a scratch home in the row's environment: `crew runtime install gemini --scope user` and `crew runtime install cursor --scope user`; `crew runtime remove gemini --scope user` prints `kept <home>/.agents/skills/crew-method (still used by cursor)` and the folder's `SKILL.md` is there; `crew runtime remove cursor --scope user` removes the folder.
- `2026-11-09-003 AC-50`: `crew runtime install copilot`, not committed, so the mark holds Copilot; then `.github/hooks/crew.json` overwritten with `{not json`. `crew runtime remove copilot` exits 1 with `<root>/.github/hooks/crew.json is not JSON: fix or move it first`, and the mark's bytes equal the bytes before the command.

### `packages/engine/tests/running.test.ts` (Modify, a new row after `AC-14 (finding 146)`)

- `2026-11-09-003 AC-17`: the row follows `AC-14 (finding 146)`'s shape: a repository whose test script copies the marker it finds, an item started with `CLAUDE_CODE_SESSION_ID: "sess-9"` and one criterion, `src/a.ts` changed, a todo noted (`crew task <id> note T-1 --criteria AC-1 --scope src/a.ts`, the form `cli.test.ts` uses at its line 3254), then `crew task <id> gate T-1`. The copied marker holds `command: "crew task <id> gate T-1"` and `session: "sess-9"`; the marker file is gone after the gate. Then, with `stopSession()`'s fixture and a marker written as that helper writes one, its command the task gate's: `onStop` lets the turn end once and its message holds `crew task` and `is still running`.

### Close

`bun run build`, `bun run check`, commit, `crew task ID note T-3 --criteria AC-8,AC-9,AC-10,AC-11,AC-13,AC-14,AC-15,AC-16,AC-17,AC-32,AC-48,AC-49,AC-50 --scope packages/engine/src/adapters.ts,packages/engine/src/runtimes.ts,packages/engine/src/cli.ts`, `crew task ID gate T-3`, `crew task ID brief T-3`. Then the check the spec names: in a scratch repository with one commit, `node plugins/core/dist/crew.mjs runtime install copilot`, and the command it prints run as printed.

## Task 4: the release's steps 11 and 12 (AC-24, AC-25, AC-26, AC-35, AC-36)

### `scripts/release.ts` (Modify)

The import from `node:fs` gains `lstatSync`, `readdirSync` and `unlinkSync`.

Step 11, after the put-back and the `if (!existsSync(install)) return null`, before `mkdtempSync`:

```ts
const beside = dirname(install);
const prefix = `.${PLUGIN_NAME}-next-`;
for (const name of readdirSync(beside).sort()) {
  if (!name.startsWith(prefix)) continue;
  const path = join(beside, name);
  const kind = lstatSync(path);
  if (kind.isSymbolicLink()) unlinkSync(path);
  else rmSync(path, { recursive: kind.isDirectory(), force: true });
  log(`  11. removed a staging folder an earlier swap left: ${name}`);
}
```

`mkdtempSync` takes `join(beside, prefix)`.

Step 12:

- A constant `PROJECT_DRY_RUN_TIMEOUT_MS = 60_000` beside `PROJECT_UPDATE_TIMEOUT_MS`.
- The step's `command` text is `node <install>/dist/crew.mjs projects update --dry-run, then node <install>/dist/crew.mjs projects update (skipped when absent; 300 s bound)`.
- After the bundle check: `const began = Date.now()`, then `deps.run(["node", bundle, "projects", "update", "--dry-run"], { cwd: root, timeoutMs: PROJECT_DRY_RUN_TIMEOUT_MS, env: { HOME: home } })`.
- Its log, each line once. A count line is one that matches `/^\d+ updated, /`. Of the dry run's stdout lines before the line that starts `user scope: ` (all of them when there is none), each that holds ` would update` and is no count line is logged as `  12. dry run: <line>`. Then the count line, when there is one, the same way. Then `  12. dry run: killed by <signal>` when the run has a signal, or `  12. dry run: no count line (exit <status>)` when it has neither a signal nor a count line.
- The real run is today's call with `timeoutMs: Math.max(1, PROJECT_UPDATE_TIMEOUT_MS - (Date.now() - began))`.
- The killed texts: a constant `unfinishedSaid = "a project left unfinished says what to run at its session start"`. The text of a kill before any project line ends `…and no other is updated; ${unfinishedSaid})`. The text of a kill between two lines ends `…or not updated; ${reminded}; ${unfinishedSaid})`. The other two texts stay.

### `packages/engine/tests/release.test.ts` (Modify)

- `runner`'s `extra` gains `projectsDryRun?: ReturnType<CommandRunner>`. A `node … projects` call that holds `--dry-run` answers it, one without answers `projectsUpdate`; each answers status 0 with no output when unset.
- `projectUpdateAnswers` takes the dry run's answer as a third argument, finds `update12` and `opts12` by a call that holds `projects` and no `--dry-run`, and returns `dry12`, `dryOpts12` and `seen` too.
- The existing rows `2026-11-08-002 AC-6` and `2026-11-09-001 AC-17` are rewritten as the spec says.
- New rows at the end:
  - `2026-11-09-003 AC-24`: a dry run that prints `a /x: copilot would update`, `b /y: up to date`, `user scope: no adapter on this root` and a count line: the log holds `  12. dry run: a /x: copilot would update` once and `  12. dry run: <count line>` once, no line with `b /y`, and both before `  12. the project update: ok`; `dry12` is `["node", <bundle>, "projects", "update", "--dry-run"]`, `dryOpts12.timeoutMs` is 60 000, and `dry12` comes before `update12` in `seen`. A dry run answered with `signal: "SIGTERM"` and no output: the log holds `  12. dry run: killed by SIGTERM`, and `update12` is defined. A dry run with status 1 and no output: `  12. dry run: no count line (exit 1)`, and `update12` is defined.
  - `2026-11-09-003 AC-25`: three killed real runs, the dry run unset. Before any project line, and between two lines: the notification's text ends `; a project left unfinished says what to run at its session start)` before the closing of the sentence. After every project's line (the output holds the user scope line): the text does not hold `left unfinished`.
  - `2026-11-09-003 AC-35`: a release with `dryRun: true`: step 12's line holds `projects update --dry-run, then node ` and ends `projects update (skipped when absent; 300 s bound)`.
  - `2026-11-09-003 AC-26`: beside the install, before a release: a folder `.wizardingcode-developer-crew-next-old` holding a file, a file `.wizardingcode-developer-crew-next-file`, a folder `.wizardingcode-developer-crew-nextdoor` (no hyphen after `next`), a folder `keep`. After the release: the first two are gone, each with its log line; `.wizardingcode-developer-crew-nextdoor` and `keep` are there; the install holds the new `bin/crew` and `<install>.previous` the earlier one; no entry under the prefix is left.
  - `2026-11-09-003 AC-36`: a link `.wizardingcode-developer-crew-next-link` pointing at a folder outside the home that holds a file: after the release the link is gone, logged, and the folder and its file are there. Then a release with no local install and a folder `.wizardingcode-developer-crew-next-old` beside where the install would be: the folder is still there and no log line holds `removed a staging folder`.

### Close

`bun run build` (the bundle does not change in this task; the build confirms it), `bun run check`, commit, `crew task ID note T-4 --criteria AC-24,AC-25,AC-26,AC-35,AC-36 --scope scripts/release.ts`, `crew task ID gate T-4`, `crew task ID brief T-4`.

## Task 5: the records (AC-27, AC-28, the second half of AC-30)

### `docs/real-use/findings.md` (Modify)

The findings test reads the clause after an outcome's last semicolon; that clause must not start with open, deferred, waits or measured. The three outcomes below hold no semicolon.

- Finding 230, the whole outcome: `fixed in 2026-11-09-003: crew task <id> gate T-n runs under the run marker, as crew tdd and crew gate run do, so the Stop hook lets one turn end while it runs.` (the command names in backticks).
- Finding 231, the whole outcome: `fixed in 2026-11-09-003. Taken: (2) a version record or a register entry that cannot be written is said and no longer throws out of the refresh, (3) SessionStart reads the mark in a fence of its own, (4) the line names the runtimes of a root's entry that the same refresh did not update, (5) the reader takes one entry per runtime, five at most, (6) the escape is singleQuoted, tested through a shell, (a) step 12 logs the fleet's dry run before its real run, (c) step 11 removes the staging folders a kill left. Not taken, with the reason: (1) refused, since the status line already starts with adapters not committed: and the same words there would say it twice, and (b) refused, since the fixed path is the one place the release's maintainer installs to and no requirement asks for another.`
- Finding 229: its outcome gains a last sentence: `The residual (a run killed inside an install left no mark) and the hand install are closed by 2026-11-09-003: the mark names an adapter before its install begins, and crew runtime install writes it too.`
- A new finding, 232, recorded and closed by this item: `crew runtime remove <name>` deleted the skill folder every runtime shares, so the adapters that stayed lost their skill (found by the document review of this item's spec, 2026-11-09). Its outcome: `fixed in 2026-11-09-003: the folder stays while another runtime's adapter of the scope remains, and the command says so.`

### `packages/engine/tests/findings.test.ts` (Modify)

The list `OPEN` loses `230, 231`, and the two comment lines above it say that both were closed by `2026-11-09-003`, with 232 recorded and closed by the same item. Row `2026-11-09-003 AC-27` asserts that the outcomes of 230 and 231 start `fixed in 2026-11-09-003` and that 231's holds `(1) refused` and `(b) refused`. Red: the row fails before the document changes.

### `docs/adr/0023-a-release-reaches-the-adapters.md` (Modify)

A section "An install cut short, a hand install (2026-11-09, item 2026-11-09-003)": the unfinished runtime and when it is written and ended; one root per runtime, kept by the writers and enforced by the reader; the hand install and the remove under the adapters lock with the command's wait; no command while a runtime is unfinished and why the entry is judged whole; what the reader says while the lock is held; the shared skill folder at a removal; D-9 kept. The words `left unfinished` stand in it.

### `plugins/core/skills/crew/references/runtimes.md` (Modify)

Where the page describes `crew runtime install`: its last line and what it means. Where it describes `crew runtime remove`: the skill folder kept while another adapter uses it. Where it describes the reminder lines: the unfinished sentence in both wordings, the held sentence, and that the answer is to run the install again and then commit. The words `left unfinished` stand in it.

### `CLAUDE.md` (Modify, Releasing)

Step 11 removes each staging folder an earlier kill left; step 12 runs the fleet's dry run first and logs what would update. The words `staging folder` and `dry run` stand in it.

### `notes.md` of the item (Modify)

The probes, the timing figures, what the build found, beside the history it already holds.

### Close

- `crew tdd observed ID AC-28 --reason "documents, no row can fail first" -- 'grep -q "left unfinished" plugins/core/skills/crew/references/runtimes.md && grep -q "left unfinished" docs/adr/0023-a-release-reaches-the-adapters.md && grep -q "dry run" CLAUDE.md && grep -q "staging folder" CLAUDE.md'`
- `crew tdd after ID AC-30 -- '<the command of the before>'`
- `bun run check`, commit, `crew task ID note T-5 --criteria AC-27,AC-28,AC-30 --scope docs/real-use/findings.md,docs/adr/0023-a-release-reaches-the-adapters.md,plugins/core/skills/crew/references/runtimes.md,CLAUDE.md`, `crew task ID gate T-5`, `crew task ID brief T-5`.

## Verify

- `bun run check` and `bun run plugin:check` pass.
- `bun scripts/release.ts --minor --reason "x" --dry-run` on the committed tree prints thirteen steps; step 12's line names both commands.
- `node plugins/core/dist/crew.mjs projects update --dry-run` against the real registry writes nothing and prints the count line.
- `crew gate run ID`, then the six judgement gates.

## Order and parallelism

The tasks run in order, in this checkout: each builds on the one before (Task 2 and Task 3 use Task 1's functions; Task 3 uses Task 2's `installUnderMark`). Task 4 touches no file the others touch and could run beside them, but one checkout runs one suite at a time, so it runs after Task 3.

## Reconciled with the predecessor

`analysis.md` is the predecessor. Two differences, both decided by the document review:

- `analysis.md` planned a cap of eight entries read (its Cause 7 named the missing cap). The spec bounds the entries by the rule that a runtime is named under one root, five at most, and has no cap of its own.
- `analysis.md` did not name the shared skill folder a removal deletes. The review's second round found it, and the spec settles it (AC-48, finding 232).

Additions the plan makes to the spec's words, none of which changes the architecture:

- `HandInstall`, `MarkedInstall`, `Kept`, `PROJECT_DRY_RUN_TIMEOUT_MS`, the list `noted`, the test helpers' names and the rows' fixtures.
- The real run of step 12 takes at least 1 ms of the bound (`Math.max(1, …)`), so a dry run that used the whole bound still lets the real run start and be reported by the kill texts.
- `Reminder.held` and the held sentence arrive in Task 2 with their rows, though they belong to the module Task 1 changes: a row is seen failing before its code.
- Finding 232 is recorded by Task 5, so the removal's defect has its own entry in the findings record.

---

Published by `crew learn` from item `2026-11-09-003-the-residuals-of-finding-229-and-the-ope`, reviewed before the code (ADR 0019).
