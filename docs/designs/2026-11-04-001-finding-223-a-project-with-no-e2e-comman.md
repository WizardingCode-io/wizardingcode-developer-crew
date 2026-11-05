# Spec: a standing e2e decision per project, the texts that sent sessions to the person, and skipped runs with no decision

## Problem

In one sentence: a project with no browser tests is asked the same question on every change, and this makes the answer stick.

An item is one piece of work the crew carries under `.crew/work/<id>/`. Before it calls an item proven, the crew runs its gates, checks such as the tests, the lint and the end-to-end tests (tests that drive the application from the outside, through a browser or its public interface). A project with no end-to-end suite stops on every item that touches an interface or a public-api path: the crew cannot run the e2e gate, and asks the person whether to skip it. The answer is kept on that item alone, so the next item asks again, in every such project, and no command settles it for all of them at once.

Of the projects registered on this machine on 2026-11-04 (`~/.wizardingcode/crew/projects.json`), 20 have a `.crew` folder; 6 have an e2e command in `.crew/profile.json` (cf-ecommerce-v3, wizarding-cms, wizardingcode-website, wizarding-ecommerce, the-burrow-hub, the-burrow-hub-rockport) and 14 have none.

Finding 223 (`docs/real-use/findings.md`), in the user's words on 2026-11-04: "isto não pode acontecer: este comando e2e e os update de cada release já deviam estar mais que consolidados. Está a acontecer em todos os projetos" ("this cannot happen: this e2e command and each release's updates should have been consolidated long ago. It is happening in every project"). Finding 224, the same day, from gba-web: the ui-ux judgement gate had no captures, and the session asked the person to loosen `allowSkips` by hand; the user: "eu não tenho que andar a fazer skips, as coisas têm que funcionar" ("I should not have to keep making skips; things have to work").

## Terms

- **Standing e2e skip:** a project's decision, taken once by the person and kept in `.crew/policy.json` under `standingE2eSkip`, that the e2e gate is skipped on every item while the project is eligible. It is the person's decision exactly as a per-item `crew skip` is.
- **Unavailable:** a gate the engine could not run, recorded with the reason it names. For e2e the engine checks the environment first: `no environment in the profile (crew profile set environment.start "<cmd>")` (`NO_ENVIRONMENT_REASON`, `packages/engine/src/e2e.ts:41,150`), then `no e2e command (crew profile set e2e "<cmd>")` (`NO_E2E_REASON`, `e2e.ts:43,152`).
- **An e2e command:** a target of the profile with an `e2e` entry in its `gates` map, whatever its source; the gate runs on the first such target (`plannedGates`, `gates.ts:359-369`). A command a pack (a set of stack rules the engine registers per user) proposed and nobody confirmed counts too: the gate then runs, and the gate run prints `pack <p>'s command is not confirmed (crew profile confirm e2e)` (`gates.ts:528-537`), so the person confirms it.
- **Eligible:** `allowSkips` lists e2e (`skipAllowed`, `policy.ts:614-619`), `requiredGates` does not list e2e, and the profile has no e2e command. When one fails, its reason is one of three texts: `allowSkips does not list e2e`, `the policy requires e2e`, `the profile has an e2e command`.
- **The standing e2e skip holds:** the project is eligible and the policy holds `standingE2eSkip`. When it does not hold, its reason is the first that applies: the eligibility reason, else `no standing e2e skip is held`.
- **Judgement gate:** a gate a reviewer rules and the judge (the crew's reviewer of the reviewers) confirms; ui-ux is one, the review of the pages an item changed, read from the captures under the item's `review/ui/`.
- **Decision register:** `.crew/decisions.json`, append-only, one entry per decision with its date, text and who took it.
- **Relay:** `attendedDecisions: relay`, the default, under which the agent runs a person's decision once the person has said yes in the conversation. A policy command is the exception: it always shows a permission prompt, and the person's yes at that prompt is recorded as the person's decision (ADR 0005, `docs/adr/0005-attended-decisions-by-relay.md`).
- **A decision that counts:** one `decisionCounts` (`policy.ts:468-475`) accepts: a person's always; an agent's only under `unattendedDecisions: count`; the validator's under its own rule. A skip is written only by `addSkip` (`work.ts:710-717`), called by `crew skip`.
- **Tampered:** a protected file (`policy.json`, `profile.json`, `decisions.json`, `work.json`) whose content no longer matches the hash the engine recorded for it in the integrity file (`~/.wizardingcode/crew/integrity/<repo>.json`), one per repository.
- **Registered project:** an entry of `~/.wizardingcode/crew/projects.json`, written by `registerProject` (`mail.ts:362-394`) whenever a crew command or a hook runs in a project.

## Decisions

The user's answers of 2026-11-04, recorded in [conclave.md](conclave.md):

- **D-1:** the standing skip lives in `policy.json` and applies only while the project cannot run the gate (option A; B applied it always, C left the gate out of the plan).
- **D-2:** one command for every project (option A; B was the command alone run after each release, C SessionStart alone).
- **D-3:** one yes from the person writes the standing e2e skip into every registered project that is eligible.
- **D-4:** the runtime adapters' refresh moves to its own item.
- **D-5:** the engine version record and a release step move there too; this item keeps the standing e2e skip, the texts that sent sessions to the person, and the bulk command.

## Goals

- G-1. A project decides once that the e2e gate is skipped, and the person is not asked again about it while the project stays eligible.
- G-2. The standing e2e skip never hides a gate that can run: once the project stops being eligible or the decision is removed, an item proven through it is not proven, and its next gate run runs the gate.
- G-3. A standing e2e skip is the person's decision, recorded as one: in the project's decision register when it is taken, and in each item's report with its date and reason.
- G-4. One command writes the standing e2e skip into every eligible registered project from one decision of the person, and one command removes it from all of them the same way.
- G-5. No text the engine shows a session about the ui-ux gate sends it to the person for a skip; with no captures, it sends the session to capture the pages itself.
- G-6. A gate's run recorded skipped with no decision that counts is never read as passing.

Why this works: the decision is recorded once per project, and the engine checks on every verdict that the project is still eligible, so the decision stops counting as soon as the profile has an e2e command or the policy stops allowing it. The payoff: no per-item e2e question in at most 14 projects (the dry run gives the real count before the D-3 run).

## Non-goals

- No standing skip of any other step: test-first steps, the other gates and the judgement gates keep their per-item decision (knowledge-base entry K-126, the root cause of finding 164: a red is traced to its origin, never skipped; ADR 0014, `docs/adr/0014-a-red-is-traced-never-skipped.md`). The key names e2e alone, so no other gate can take one by a loader change.
- No change to `allowSkips`, and a per-item `crew skip` keeps its meaning.
- No profile refresh, runtime adapter refresh, engine version record or release step (D-4, D-5): their own item, next.
- No change to SessionStart.
- The crew's own browser capture, for a session with no browser to drive and no Playwright in the project, is finding 224's next item.
- Writing the standing e2e skip into the eligible projects is the step after the release that carries this item (D-3; CUJ-4), not a criterion: until that release is installed, the engine the user's sessions run does not read `standingE2eSkip`.

## Open questions

None.

## Critical user journeys

- **CUJ-1, a project with no e2e suite.** Given gba-web, eligible and with no standing e2e skip, when the person says once "skip e2e here, there is no suite" and the agent runs `crew policy set standingE2eSkip --reason "<their words>"` (the person answers the permission prompt), then every later item that touches an interface or a public-api path runs its gates, the e2e run is recorded skipped with the person's reason and the decision's date, the report names the standing decision, and the person is not asked.
- **CUJ-2, the suite arrives.** Given that project with its standing e2e skip and an item proven through it, when the person sets the e2e command and the environment, then the item is no longer proven (the verdict says why) until its next gate run, which runs the e2e command and fails the gate if the suite fails. With the command set and no environment, the run says the environment is missing, which the person then sets.
- **CUJ-3, the first item that would have asked.** Given an eligible project with no standing e2e skip, when an item's e2e gate is unavailable, then the unproven line offers the standing decision, so the agent asks the person once for the project instead of once per item.
- **CUJ-4, every project (after the release).** Given the person's one yes (D-3), when the agent runs `crew projects standingE2eSkip --reason "no e2e suite in this project; the gate runs once a command is set" --dry-run`, reads its lines with the person, and runs it again without `--dry-run`, then the permission prompt asks the person once, and after the yes each eligible project gets the standing e2e skip and a register entry, and the output names every project left out and why.
- **CUJ-5, a page change with no captures.** Given an item whose ui-ux judgement gate is recorded not run while its `review/ui/` holds no capture, when the session reads the unproven line, or tries `crew skip <id> gate:ui-ux` where `allowSkips` does not list it, then the text tells it to capture the changed pages with a browser it drives and launch the reviewer, or, with no browser, that the gate stays not run; neither tells it to edit the policy.

## Design

### The standing e2e skip (D-1; `policy.ts`, `cli.ts`)

`policy.json` gains one key:

```json
{
  "standingE2eSkip": {
    "reason": "no e2e suite in this project; the gate runs once a command is set",
    "at": "2026-11-04T18:00:00.000Z",
    "by": "user"
  }
}
```

`at` is an ISO 8601 timestamp (`nowIso()`). The loader (`loadPolicyFile`, `policy.ts:570-611`) keeps the key only when its `reason` is non-empty, its `at` a date and its `by` `user`. `loadPolicy`'s doc comment ("a policy can only tighten, with two exceptions", `policy.ts:550-555`) names this third exception, and ADR 0022, which this item creates (`docs/adr/0022-a-standing-e2e-skip.md`), records it.

`crew policy set standingE2eSkip --reason "<words>"` writes the key with a fresh `at`, and `crew policy set standingE2eSkip --remove` takes it out. It refuses, writing nothing:

- adding while `allowSkips` does not list e2e, or `requiredGates` lists it: `cannot take a standing e2e skip: <the eligibility reason>`;
- adding with no reason, an empty one, or a bare `--reason`: `a standing e2e skip needs the person's reason (--reason "<their words>")`;
- `--reason` with `--remove`, and `--reason` on any other `crew policy` command: `--reason goes with crew policy set standingE2eSkip`;
- `--mode` or `--validator`: `a standing e2e skip is a person's decision: crew policy set standingE2eSkip takes no --mode or --validator`;
- a tampered policy file, as every policy writer refuses;
- removing when none is held: `no standing e2e skip is held`.

Removing works whatever `allowSkips` and `requiredGates` hold, since it loosens nothing. A project with an e2e command can still take one; it does not hold until the project is eligible.

The PreToolUse hook shows a permission prompt for it even under relay, as for every `crew policy set` (`policyCommand`, `hooks/pre-tool-use.ts:697-700`), so the key and its register entry say `by: "user"` with no `relayed` marker, as `setListKey` records (`cli.ts:1929-1936`). The register entry is written before the file, so a loosening never exists without its record (finding 120); a write that then fails appends `standingE2eSkip not written, <message>`, as `lowerByValidator` does (`cli.ts:1990-1996`). The texts, which are also the output:

- `standingE2eSkip added (<reason>): the e2e gate is skipped on every item while the project cannot run it`;
- `standingE2eSkip replaced (<reason>): the e2e gate is skipped on every item while the project cannot run it`, for one held with another reason, with a new `at`;
- `standingE2eSkip removed: the e2e gate runs again on every item`;
- `standingE2eSkip already set (<reason>)`, for the same reason again: nothing is written and no entry appended.

### At the gate run (`gates.ts`)

At the top of `runGates`, the standing state is computed once from the policy and the profile: the entry when the standing e2e skip holds, else its reason (Terms). For the e2e gate when it is planned, in the gate loop (`gates.ts:762-790`):

1. The item holds a skip of `gate:e2e` that counts: the run is recorded skipped with that skip's reason, as today.
2. Else, when the standing e2e skip holds: the run is recorded skipped through case 1's skipped branch, at the root target (`.`, where `plannedGates` puts e2e while no target has a command), its `reason` the person's reason and a new field `standing` holding the decision's `at`. Nothing is added to the item's skips.
3. Else the gate runs. When the item's previous e2e run, read before the gate run drops the item's earlier run of the same gate (`gates.ts:765`), had `standing`: the gate run's output and its `--json` data add `standing e2e skip no longer holds: <reason>`, and when the real run is recorded on another target, the standing run at `.` is removed from the evidence.

### In the verdict (`evidence.ts`)

`computeVerdict` (`evidence.ts:247-313`) takes the standing state as a required input, computed by its callers from the policy and the profile they hold: `assess` (`gates.ts:937`) and `reassess` (`gates.ts:999`) through `Assessment` (`gates.ts:899`), the caller that spreads an assessment (`cli.ts:5201`), and the gate run's `verdictOf` (`gates.ts:852`).

In the deterministic gates' loop, a new arm after the `not run on the current code` arm (`evidence.ts:290-292`), for a run recorded `skipped`:

- an e2e run with `standing`: it counts as passing while the standing e2e skip holds; otherwise the line `gate e2e: the standing e2e skip no longer holds (<reason>): run crew gate run <work.id> again`;
- any gate's run with no `standing` and no skip of its step on the item that counts (the check at `evidence.ts:287` already passes every counted one over): `gate <label> skipped with no decision on record: run crew gate run <work.id> again`.

The second arm reaches beyond e2e. Today such a run passes silently. It exists only where an agent's skip counted under `unattendedDecisions: count` and the policy then moved to `wait`: every such item in every project becomes unproven at its next verdict once the release is installed, and the verdict says why. The plan's verify phase counts the projects where it can occur on this machine (each registered project's `decisions.json`, searched for a change of `unattendedDecisions` away from `count`), and the count goes into the item's report (`notes.md` beside this spec) before the release.

The report's Decisions section (`renderReport`, `evidence.ts:942`) opens for a standing e2e run too: the e2e run with `standing` recorded skipped, listed after the per-item skips as ``- `gate:e2e` skipped by the user (standing decision of <date of at>): <reason>``. It stays listed when the skip no longer holds, since the decision was taken; the verdict's line says it no longer holds.

### The texts that sent the session to the person (`evidence.ts`, `cli.ts`)

- An unavailable e2e gate, when the project is eligible and holds no standing e2e skip: its line gains `; this project has no e2e suite: skip it for the project with crew policy set standingE2eSkip --reason "<why>"`. The text before is unchanged, so the existing tests that match it still pass. The agent reads the line and asks the person for one standing decision.
- A ui-ux judgement gate recorded not run (`crew judgement <id> record ui-ux --not-run --reason "<why>"`) while the item's `review/ui/` holds no capture (`listCaptures`, `judgement.ts:147`): the record's reason is written as `no captures; capture the changed pages with a browser the session drives and launch the reviewer (references/gate.md, "UI/UX needs evidence"); with no browser, the gate stays not run (<why>)`, so the verdict's existing line, `judgement gate ui-ux not run: <reason>` (`evidence.ts:312`), carries it. It asks nothing of the person.
- `crew skip <id> gate:ui-ux` refused because `allowSkips` does not list it (`skipRefusal`, `cli.ts:768-775`): `the ui-ux gate is ruled from the pages' captures, not skipped: capture the changed pages with a browser the session drives and launch the reviewer (references/gate.md, "UI/UX needs evidence")`, in place of the advice to have a person list the gate in `allowSkips`.

### `crew projects standingE2eSkip` (D-2, D-3; `cli.ts`)

`crew projects standingE2eSkip --reason "<words>" [--dry-run]` and `crew projects standingE2eSkip --remove [--dry-run]` take the per-project command's arguments and refusals (a missing or bare `--reason` when adding, `--reason` with `--remove`) and apply the per-project rules to every registered project. `--dry-run` is a boolean flag. `--mode` and `--validator` are unknown flags to this command and are refused as such (`cli.ts:590-599`). The command stays in the CLI after the D-3 run, for the next project that joins with no suite and for the removal. It is one command because the user chose one (D-2, D-3).

The projects are every registry entry, whatever its workspace (`loadRegistry`, `mail.ts:315`), in name order, then by canonical root. For each, the first rule that applies decides:

1. A worktree entry (`worktreeOf` set): not listed, not counted.
2. The root no longer exists: `gone`.
3. The root lies under the machine's temporary folder (`TMPDIR` when it resolves, else `os.tmpdir()`; both sides resolved with `realpath`): `left out: a scratch checkout under the temporary folder`.
4. No `.git` at the root: `left out: not a git checkout`.
5. No `.crew` folder: `left out: no .crew folder`.
6. The root, `.crew`, or `.crew/policy.json` when it exists, is a symbolic link: `left out: <the root|.crew|policy.json> is a symbolic link`.
7. No `profile.json`, or one that does not load: `left out: no profile yet`.
8. A tampered `policy.json`, `profile.json` or `decisions.json`: `left out: <file> changed outside the engine`.
9. Adding, and the project is not eligible: `left out: <the eligibility reason>`, the profile's case naming the command, `left out: the profile has an e2e command (<command>)`.
10. Adding, and the project holds a standing e2e skip with another reason: `left out: already holds a standing e2e skip (<reason>)`. A person's own decision in a project is never replaced.
11. Removing, and none is held: `left out: no standing e2e skip is held`.

For the rest: adding with the same reason held is `already set`. Otherwise, under `--dry-run`, `would write` or `would remove (<the held reason>)`, so the person sees any project's own decision before the prompt. For real, the command reads `policy.json` and its integrity state again, and a project whose policy changed since the first read is `left out: policy.json changed since read`; otherwise the register entry `standingE2eSkip added from the session in <root of the project running the command> (<reason>)`, or `standingE2eSkip removed from the session in <root>`, is appended in that project, by the user, and the key is written or deleted: `written` or `removed`. A write that throws appends `standingE2eSkip not written, <message>` and is `failed: <message>`; the next project runs. The project running the command is registered by its own crew command's load and processed like any other.

The output, one line per listed project, `<name> (<canonical root>): <status>[: <reason>]`; then `<n> projects: <a> written, <b> removed, <c> already set, <d> left out, <e> gone, <f> failed` (under `--dry-run`, `would write` counts as written and `would remove` as removed); then, when any project was written or removed, `commit in each project: <name>: .crew/policy.json .crew/decisions.json; …`. `--json`: `{ projects: [{ name, root, status, reason? }], counts: { written, removed, alreadySet, leftOut, gone, failed } }`. Exit 1 when any project failed.

### The guard (`hooks/pre-tool-use.ts`)

The command writes a person's policy decision into every registered project, so the PreToolUse guard treats it as a policy command:

- `userOnlyCommand` (`hooks/pre-tool-use.ts:645-700`) gains `projects` followed by `standingE2eSkip` without `--dry-run`, and `projects` followed by any word after it that the hook cannot read (an expansion, a pattern, a word with a space or a comma: `UNREADABLE_VERB`, `hooks/pre-tool-use.ts:635`), so `crew projects standingE2eSkip $FLAGS` is caught; `policyCommand` is true for both. The guard reads `--dry-run` as the command does, a boolean, so `--dry-run no` is no dry run.
- It is then asked even under relay.
- Where nobody watches (a headless session, `bypassPermissions` or `dontAsk`, the hook's `<where>`) it is denied: `Crew: no person is watching this session (<where>) and crew projects standingE2eSkip writes the person's decision into every registered project: run it in a session a person watches`.
- `--dry-run` writes nothing and takes no decision, so it is let through unasked.

## Alternatives

- **D-1 B, a standing skip that applies always**, even after a command exists: rejected; a suite set later would never run (G-2).
- **D-1 C, the profile marks the gate as not applicable** and the plan leaves it out: rejected; the report would stop naming a gate the item did not run.
- **A standing skip for any gate:** rejected; the finding is about e2e, and a standing skip of `test` would let items be proven with no test run (finding 36's guard, `gates.ts:351-353`).
- **Copy the standing skip onto each item's `work.skips`:** rejected; the gate run and the verdict are where a skip decides anything, and the readers that only display `work.skips` (the report, the metrics) would show a copy of a decision that may no longer hold.
- **Un-prove items when the decision's wording is replaced:** rejected; nothing can run while the project is eligible, so a new wording protects nothing and would only force a gate run per item.
- **Write the standing skip only on each checkout's default branch:** rejected; the integrity hash is per repository (`store.ts`), so every `crew policy set` already reads as changed on a branch without it (Risks), and a branch rule would leave out every project checked out on another branch.
- **A profile refresh in the same command:** not taken; SessionStart (`session-start.ts:61`) and every gate run (`cli.ts:4539, 4995`) refresh the profile already, and D-4/D-5 put each release's updates in their own item.
- **Remove only the entries the bulk command wrote:** not taken; removal only tightens, and the dry run names each project's reason before the prompt.

## Acceptance criteria

Criterion numbers are never reused.

- AC-8 (preserve): the engine's existing test rows stay green (`cli.test.ts`, `gates.test.ts`, `evidence.test.ts`, `policy-config-state.test.ts`, `hooks-pre-tool-use.test.ts`, `workspace.test.ts` and the rest of the suite).
- AC-34 (behavior): `crew policy set standingE2eSkip --reason "<words>"` writes the key and a register entry by the user, says `replaced` or `already set` when one is held, and `--remove` takes it out with its own entry whatever `allowSkips` holds; it refuses, writing nothing, an empty or bare reason, `--reason` with `--remove` or on another policy command, `--mode` or `--validator`, a tampered policy, removing when none is held, and adding while `allowSkips` does not list e2e or `requiredGates` lists it.
- AC-35 (behavior): at a gate run, while the standing e2e skip holds and the item has no counted skip of `gate:e2e`, the e2e run is recorded skipped with the person's reason and the decision's date, the item's skips are unchanged, the report's Decisions section names the standing decision, and the item is proven with no per-item `crew skip`.
- AC-36 (behavior): once the profile has an e2e command, the decision is removed, `allowSkips` drops e2e or `requiredGates` lists it, the verdict leaves an item proven through the standing e2e skip unproven and names the reason.
- AC-37 (behavior): the next gate run after the standing e2e skip stops holding runs the e2e gate, says why in its output, and its failure fails the item; a replaced decision leaves the item proven.
- AC-38 (behavior): a gate's run recorded skipped with no decision on record that counts is unproven, with `gate <label> skipped with no decision on record`.
- AC-39 (behavior): the unproven line of an unavailable e2e gate offers `crew policy set standingE2eSkip --reason "<why>"` when the project is eligible and holds none, and not when the profile has an e2e command and no environment, `allowSkips` does not list e2e, or `requiredGates` lists it.
- AC-40 (behavior): a ui-ux judgement gate recorded not run while the item's `review/ui/` holds no capture carries the capture path in its unproven line and no skip; `crew skip <id> gate:ui-ux` refused by `allowSkips` names the capture path and not an edit of the policy.
- AC-41 (behavior): `crew projects standingE2eSkip --reason "<words>"` writes the key and a register entry into each eligible registered project, never replaces a standing e2e skip a project holds, and `--remove` takes it out of each project holding one; every registered project that is not a worktree gets one line with its status and reason, a count line and a commit line follow; scratch checkouts, non-git folders, symbolic links, projects with no `.crew` or no profile, and tampered policy, profile or register files are left out with their reasons; `--dry-run` prints the same lines with `would` and writes nothing in any registered project.
- AC-42 (behavior): the PreToolUse guard asks for `crew projects standingE2eSkip` without `--dry-run` under relay, denies it where nobody watches, asks for `crew projects` followed by a word it cannot read, lets `--dry-run` through unasked, and treats `--dry-run no` as no dry run.

## Risks and rollback

- **Writes into many checkouts, on their current branch.** The command writes `.crew/policy.json` and `.crew/decisions.json` through the engine's writers, leaves out a project with a tampered policy, profile or register, re-reads the policy just before it writes, and names both files to commit. The dry run shows the effect as of its own run; a session that writes a project's policy between the re-read and the write can still leave that project's policy reading as changed outside the engine, which `crew policy accept` clears; the real run's lines say what it did.
- **A policy written on one branch.** The integrity hash is per repository, so a checkout switched to a branch whose `policy.json` lacks the key reads the policy as changed outside the engine, as for any `crew policy set` today; the commit line names the file so the person commits it on the branch the project works from.
- **The registry decides where a person's decision lands.** Any crew run anywhere can add an entry (`registerProject`). The command refuses symbolic links, leaves scratch checkouts and non-git folders out, and the dry run names every project before the prompt. Each project's own `attendedDecisions` is not consulted: the yes at the prompt in the session running the command is recorded as the person's decision for all of them.
- **The skipped-run line reaches every project.** Items whose skipped run has no counting decision become unproven at their next verdict once the release is installed (G-6); the count of projects where that can occur goes into the item's `notes.md` before the release.
- **A project whose session has no browser and no Playwright.** Its ui-ux gate stays not run, and the item unproven, until finding 224's item gives the crew a browser of its own; the text says so rather than offering a skip.
- **Rollback:** `crew projects standingE2eSkip --remove`, one yes for every project, or `crew policy set standingE2eSkip --remove` in one; the verdict stops counting it on every item at once. Reverting the release brings back the per-item question.

## Non-functional requirements

- The gate run and the verdict add one `listCaptures` read per assessment and no other file read: the standing state comes from the policy and the profile their callers hold.
- The bulk command's dry-run time over this machine's registry is measured once in the plan's verify phase and written into the item's `notes.md` as an observation; no bound is set.

## Cost and checks

- What is built (new): the `standingE2eSkip` key, its loader rule and command; `e2eTarget` (`profile.ts`), `standingEligible` and the standing state (`policy.ts`), `planStandingE2eSkip` and its writer (`policy.ts`); a `standing` field on the e2e run; two verdict arms; one hint line, one not-run reason and one refusal text; a report line; the bulk command; one guard branch; ADR 0022.
- How long: about one person's working day of build after this review: about thirty test rows over six test files, each part a change beside code that exists (the skipped branch, the policy writers, the guard's policy commands); then the gates and the judgement gates (about six reviewer runs); the release the same day; the D-3 run right after it.
- Midway check: AC-34 to AC-40 proven before the bulk command's work starts; then AC-41, then AC-42.
- Final check: every criterion proven and the gates passing, then the D-3 dry run read with the person.

# Plan: a standing e2e decision per project, the texts that sent sessions to the person, and skipped runs with no decision

The spec is [spec.md](spec.md); every text in quotes below is the spec's, word for word. Paths are relative to the repository root; the engine's sources are under `packages/engine/src/`, its tests under `packages/engine/tests/`. Every phase leaves `bun run check` green. Each behaviour criterion is built test-first: the test is written, `crew tdd red <id> AC-n -- "<cmd>"` records it failing, the code is written, `crew tdd green <id> AC-n -- "<cmd>"` records it passing, with the same command. `<id>` is `2026-11-04-001-finding-223-a-project-with-no-e2e-comman`.

The criteria are AC-8 and AC-34 to AC-42. Every test row's name starts `2026-11-04-001 AC-<n>`, so a red and a green select it with `-t`. Fixtures set every command with the source `"confirmed"` (`CommandSource`, `types.ts:137`), which a profile refresh keeps (`detect/index.ts:190-192`), and save the profile with `saveProfile`. A fixture that needs a policy file the engine trusts writes it through `crew policy set` first; a hand edit after that is tampered until `crew policy accept` (a policy the engine never wrote is trusted as hand-written, `store.ts:8,105-109`).

## Phase 0: the preserve criterion's before

- `crew tdd before <id> AC-8 -- "cd packages/engine && bun test"`, before any source edit. AC-8 takes its `after` in phase 6 with the same command and no fewer tests.

## Phase 1: the standing e2e skip in the policy (AC-34)

**Modify `packages/engine/src/types.ts`.**
- `export interface StandingE2eSkip { reason: string; at: string; by: "user" }`.
- `Policy` (near `allowSkips`, line 1047) gains `standingE2eSkip: StandingE2eSkip | null`, doc comment: the project's standing decision to skip the e2e gate while it cannot run it (finding 223, ADR 0022).
- `GateRun` (line 882) gains `standing?: string`: on an e2e run skipped by the standing decision, the decision's `at`.

**Modify `packages/engine/src/profile.ts`.** `export function e2eTarget(profile: Profile): Target | undefined`: `profile.targets.find((t) => t.gates.e2e)`. `plannedGates` (`gates.ts:362`) calls it in place of its own lookup.

**Modify `packages/engine/src/policy.ts`.**
- `DEFAULT_POLICY.standingE2eSkip = null`.
- `export function standingE2eSkipOf(raw: unknown): StandingE2eSkip | null`: the value when its `reason` trims to non-empty, its `at` parses as a date and its `by` is `"user"`; else `null`. `loadPolicyFile` (lines 570-611) sets `standingE2eSkip: standingE2eSkipOf(raw.standingE2eSkip)`.
- `loadPolicy`'s doc comment (lines 550-555) names the third exception, ADR 0022.
- `export type IneligibleReason = "allowSkips does not list e2e" | "the policy requires e2e" | "the profile has an e2e command"`.
- `export function standingEligible(policy: Policy, profile: Profile): IneligibleReason | null`: in that order, `!skipAllowed(policy, "gate:e2e")`, `policy.requiredGates.includes("e2e")`, `e2eTarget(profile) !== undefined`; else `null`.
- `export type StandingState = { holds: StandingE2eSkip } | { eligible: true; held: null } | { eligible: false; why: IneligibleReason }`; `export function standingState(policy: Policy, profile: Profile): StandingState`: `why = standingEligible(policy, profile)`; `why` → `{ eligible: false, why }`; else `policy.standingE2eSkip` → `{ holds }`; else `{ eligible: true, held: null }`. `export function standingWhy(state: StandingState): string`: `why`, or `no standing e2e skip is held` for `{ eligible: true, held: null }`.
- `export type StandingChange = { action: "added" | "replaced" | "removed" | "already set"; raw: Record<string, unknown>; entry: StandingE2eSkip | null }`, `entry` the new one (null for `removed`).
- `export function planStandingE2eSkip(paths: CrewPaths, policy: Policy, reason: string | null, remove: boolean): StandingChange | { refused: "tampered" | "none held" | "ineligible" | "no reason"; text: string }`: `readPolicyFile(paths)` (`tampered`, its text `TAMPERED_POLICY`); `held = standingE2eSkipOf(file.raw.standingE2eSkip)`. With `remove`: no `held` → `none held`, `no standing e2e skip is held`; else `removed`. Without: the policy part of `standingEligible` (`allowSkips`, `requiredGates`) → `ineligible`, `cannot take a standing e2e skip: <reason>`; `reason === null || reason.trim() === ""` → `no reason`, the spec's text; `held.reason === reason.trim()` → `already set`; `held` → `replaced`; else `added`. A new entry is `{ reason: reason.trim(), at: nowIso(), by: "user" }`.
- `export function writeStandingE2eSkip(paths: CrewPaths, change: StandingChange): void`: for `added` and `replaced`, `writeProtectedJson(paths, policyPath(paths), { ...change.raw, standingE2eSkip: change.entry })`; for `removed`, the same without the key; `already set` writes nothing.
- `export function standingText(change: StandingChange): string`: the spec's four texts.

**Modify `packages/engine/src/cli.ts`.**
- `KNOWN_FLAGS.policy` (line 523) gains `"reason"`. In `case "policy"` (line 3938), before anything else: `--reason` given while the words are not `set standingE2eSkip`, or with `--remove` → `--reason goes with crew policy set standingE2eSkip`.
- `args[0] === "set"`, before the usage refusal at lines 3950-3954, when `args[1] === "standingE2eSkip"`: `--mode` or `--validator` → the spec's refusal; `reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : null`; `plan = planStandingE2eSkip(env.paths, env.policy, reason, remove)`; a refusal returns its `text`. `already set`: its text, exit 0. Otherwise `decide(env, "policy", { kind: "decision", text: standingText(plan), by: "the user" })`, then `writeStandingE2eSkip` in a `try`; a throw appends `standingE2eSkip not written, <message>` the same way and is refused with the message. Output `standingText(plan)`; `--json` `{ action, entry }`.
- The usage line at lines 3950-3954 names `standingE2eSkip`; the help (lines 6520-6528) gains `policy set standingE2eSkip --reason "<why>" | --remove   the e2e gate skipped on every item while the project cannot run it (asks the user)`.

**Tests.**
- `packages/engine/tests/cli.test.ts` (Modify), row `2026-11-04-001 AC-34: crew policy set standingE2eSkip`, modelled on the row at line 1072 (`ADR 0005: crew policy set writes …`), through `main` and `cliIo`:
  - `policy set standingE2eSkip --reason "no suite"`: exit 0; `standingE2eSkip` is `{ reason: "no suite", at, by: "user" }`, no `relayed`; the register's last entry is the added text.
  - The same reason again: `already set`, no new entry, `policy.json` byte-equal. Another reason: `replaced`, a new `at`.
  - `--remove`: the key gone, the removed entry. A key written, then `allowSkips: []` set by hand and accepted with `crew policy accept`: adding is refused with `cannot take a standing e2e skip: allowSkips does not list e2e`, `--remove` works.
  - Refusals, each exit 1 with its text, `policy.json` byte-equal, no new register entry: `--reason ""`, a bare `--reason`, `--remove --reason x`, `policy set attendedDecisions relay --reason x`, `--mode auto`, `--validator x`, `requiredGates: ["e2e"]` (by hand, accepted), a tampered policy (written by the engine, then edited by hand), `--remove` with none held.
- `packages/engine/tests/policy-config-state.test.ts` (Modify), row `2026-11-04-001 AC-34: the loader keeps a well-formed standingE2eSkip`: no reason, a bad date and `by: "agent"` each load as `null`.

Red and green: `crew tdd red <id> AC-34 -- "cd packages/engine && bun test tests/cli.test.ts tests/policy-config-state.test.ts -t '2026-11-04-001 AC-34'"`.

## Phase 2: the gate run and the verdict (AC-35 to AC-38)

**Modify `packages/engine/src/gates.ts`.**
- `GateOutcome` (lines 645-661) gains `standingNotes: string[]` (empty by default).
- `Assessment` (line 899) gains `standing: StandingState`; `AssessmentInputs` (line 992, `Omit<Assessment, …>`) inherits it. `assess` (line 937) sets it with `standingState(policy, profile)`; `reassess` (line 999) passes it into `computeVerdict`.
- At the top of `runGates`, `const state = standingState(policy, profile)`; `verdictOf` (lines 852-867) passes it.
- In the gate loop (line 762), for `gate === "e2e"`, before the filter at line 765: `const previous = evidence.runs.find((r) => r.gate === "e2e")`. Then, in place of the `isSkipped` branch's lookup:
  1. `const own = work.skips.find((s) => s.step === "gate:e2e" && decisionCounts(policy, s))`: when found, the skipped run is recorded with `own.reason`, as today.
  2. Else, when `"holds" in state`: the skipped run is recorded through the push at lines 766-784 with `target: "."`, `reason: state.holds.reason`, `standing: state.holds.at`.
  3. Else the gate runs as today. When `previous?.standing`: `standingNotes` gets `standing e2e skip no longer holds: <standingWhy(state)>`, and after the run is recorded, when its target is not `.`, the run with `gate === "e2e" && target === "." && standing` is removed from `evidence.runs`.

**Modify `packages/engine/src/cli.ts`, `case "gate"` (lines 4984-5091).** The `standingNotes` lines go between `gateSummary(…)` and `judgementNote` (line 5073); `--json` data gains `standing: outcome.standingNotes`. The caller of `reassess` at line 5201 spreads `before`, which carries `standing`.

**Modify `packages/engine/src/evidence.ts`.**
- `VerdictInput` gains `standing: StandingState` (required; every caller in `src/` passes it, and the existing test rows that call `computeVerdict` pass `{ eligible: false, why: "allowSkips does not list e2e" }` through a shared fixture helper so their behaviour is today's).
- In `computeVerdict`'s deterministic loop (lines 287-298), a new `else if (run.status === "skipped")` arm after the `not run on the current code` arm (lines 291-292):
  - `run.standing` set: `"holds" in input.standing` → the gate counts as passing; otherwise the line `gate e2e: the standing e2e skip no longer holds (<standingWhy(input.standing)>): run crew gate run ${work.id} again`.
  - `run.standing` unset (every counted skip of the step was passed over by the check at line 287): `gate ${label} skipped with no decision on record: run crew gate run ${work.id} again`.
- The report's Decisions section (`renderReport`, line 942): `const standingRun = evidence.runs.find((r) => r.gate === "e2e" && r.standing && r.status === "skipped")`; the opening condition gains `|| standingRun`; after the per-item skip lines, ``- `gate:e2e` skipped by the user (standing decision of ${standingRun.standing.slice(0, 10)}): ${standingRun.reason}``.

**Tests, `packages/engine/tests/gates.test.ts` (Modify).** A fixture helper `standingFixture(changes)`: a fresh `makeRepo` on the fast route with a changed `src/App.vue` (an interface path by `isFrontendPath`, so e2e, design-lint and the ui-ux seat are planned); one criterion with a recorded green (`addCriterion` and `crew tdd red`/`green` through `main`, as the gates rows that assert proven do); the root target with `test: { command: "exit 0", source: "confirmed" }` and no `e2e`, saved; a judge role on record and the ui-ux gate recorded proven through `crew judgement <id> record --ruling <file>`, the file written with `filedRuling` (`tests/helpers.ts:264`), as the judgement rows of `cli.test.ts` do; and `crew policy set standingE2eSkip --reason "no suite"` through `main`. Each case's change is made through the engine: `crew policy set standingE2eSkip --remove`; a hand edit of `allowSkips` or `requiredGates` after the key's engine write, then `crew policy accept`; `saveProfile` with an e2e command.
- `2026-11-04-001 AC-35: a standing e2e skip records the run and proves the item`: `runGates`; the e2e run is `skipped` at `.` with the person's reason and `standing` the decision's `at`; `work.skips` holds no `gate:e2e` skip and is unchanged; `assess(...).verdict === "proven"`; the report holds the Decisions line.
- `2026-11-04-001 AC-35: a counted per-item skip wins`: a person's `crew skip` of `gate:e2e` before the run: the run's reason is that skip's, with no `standing`.
- `2026-11-04-001 AC-36: each way the standing e2e skip stops holding`: after the AC-35 run, four fixtures: the target gains `e2e: { command: "exit 1", source: "confirmed" }` and the environment of `devtools.test.ts:51` (`start` and `health` `confirmed("true")`, `timeoutMs`); the decision removed; `allowSkips: []`; `requiredGates: ["e2e"]`. In each, `assess` before a gate run names `the standing e2e skip no longer holds (<the case's reason>)`.
- `2026-11-04-001 AC-37: the next gate run runs the gate`: on the first fixture of AC-36, `runGates` runs the gate and records it `fail`; `standingNotes` holds `standing e2e skip no longer holds: the profile has an e2e command`; through `main`, `crew gate run` prints it. With the command on a `web` target, the run is recorded on `web` and the standing run at `.` is removed. With the decision replaced (`crew policy set standingE2eSkip --reason "other"`), `assess` stays proven.
- `2026-11-04-001 AC-38: a skipped run with no decision on record`: an evidence file whose `lint` run is `skipped` with no skip on the item: `computeVerdict` names `gate lint skipped with no decision on record`.

Red and green: `crew tdd red <id> AC-35 -- "cd packages/engine && bun test tests/gates.test.ts -t '2026-11-04-001 AC-35'"`, and the same for AC-36, AC-37 and AC-38.

## Phase 3: the texts that sent the session to the person (AC-39, AC-40)

**Modify `packages/engine/src/evidence.ts`.** Line 295-296: when `gate === "e2e"`, `run.status === "unavailable"`, `run.reason` is `NO_ENVIRONMENT_REASON` or `NO_E2E_REASON` (`e2e.ts:41,43`), and `input.standing` is `{ eligible: true, held: null }`: the line gains the spec's hint.

**Modify `packages/engine/src/cli.ts`.**
- `crew judgement <id> record ui-ux --not-run --reason "<why>"`: when `listCaptures(env.paths, id).length === 0` (`judgement.ts:147`), the reason handed to `notRunRecord` (`judgement.ts:585`) is the spec's capture text with `(<why>)` at its end.
- `skipRefusal` (lines 768-775): for `gate:ui-ux`, the spec's text.

**Tests.**
- `packages/engine/tests/evidence.test.ts` (Modify), `2026-11-04-001 AC-39`: the states built with `standingState` from fixture policies and profiles: eligible with none held → an unavailable e2e run with `NO_ENVIRONMENT_REASON` and one with `NO_E2E_REASON` carry the hint; `allowSkips: []`, `requiredGates: ["e2e"]`, a profile with an e2e command (a run with `NO_ENVIRONMENT_REASON`), and a held key → none; the text before the hint is unchanged.
- `packages/engine/tests/cli.test.ts` (Modify), `2026-11-04-001 AC-40`: `crew judgement <id> record ui-ux --not-run --reason "no browser here"` with no `review/ui/` captures: `crew evidence` names the capture path and holds no `skip`; with a capture saved under `review/ui/`, the reason is the one given. `crew skip <id> gate:ui-ux` with the default `allowSkips` is refused with the spec's text, which holds no `allowSkips`.

Red and green: `crew tdd red <id> AC-39 -- "cd packages/engine && bun test tests/evidence.test.ts -t '2026-11-04-001 AC-39'"`; `crew tdd red <id> AC-40 -- "cd packages/engine && bun test tests/cli.test.ts -t '2026-11-04-001 AC-40'"`.

The midway check: AC-34 to AC-40 green before phase 4 starts.

## Phase 4: `crew projects standingE2eSkip` (AC-41)

**Modify `packages/engine/src/argv.ts`.** `BOOLEAN_FLAGS` (line 18) gains `"dry-run"`.

**Modify `packages/engine/src/cli.ts`.**
- `KNOWN_FLAGS` gains `projects: ["dry-run", "reason", "remove", "json"]`, so `--mode` and `--validator` are refused as unknown flags (lines 590-599).
- A new `case "projects"` beside `case "workspace"` (line 6334). `args[0] !== "standingE2eSkip"` → usage `crew projects standingE2eSkip --reason "<why>" | --remove [--dry-run]`. Then the argument refusals of `crew policy set standingE2eSkip`: `--reason` with `--remove`; adding with `reason` null or empty.
- `scratch`: `realpathSync(io.env.TMPDIR)` when it resolves, else `realpathSync(tmpdir())`.
- `loadRegistry(env.paths.userDir).projects`, sorted by name then by `canonical(entry.root)`. For each, the spec's rules 1-11 in order: `entry.worktreeOf`; `existsSync(entry.root)`; `canonical(entry.root)` starting with `scratch` and the path separator; `existsSync(join(root, ".git"))`; `existsSync(join(root, ".crew"))` and `statSync(...).isDirectory()`; `lstatSync` of `entry.root`, of `.crew` and, when it exists, of `.crew/policy.json`; then `paths = pathsFor(root, env.paths.userDir)`, `loaded = loadProfile(paths)` (`null` profile → rule 7); `loadPolicy(paths).tampered`, `loaded.tampered` and `registerTampered(paths)` (`decisions.ts:77`) → rule 8 with the file's name; when adding, `standingEligible(policy, loaded.profile)` → rule 9, the profile's case naming `e2eTarget(profile).gates.e2e.command`; when adding, a held key with another reason → rule 10; when removing, none held → rule 11.
- For the rest: `planned = planStandingE2eSkip(paths, policy, reason, remove)`; its refusals map by kind (`tampered` → rule 8's policy line, `none held` → rule 11's line, `ineligible` → rule 9's line, `no reason` cannot reach here); `already set` → `already set`; under `--dry-run`, `would write` or `would remove (<held reason>)`. Otherwise: `fresh = readPolicyFile(paths)` and `loadPolicy(paths).tampered` again; a raw policy that differs from the first read (compared as JSON) or now tampered → `left out: policy.json changed since read`; else, in a `try`, `appendDecision(paths, { at: nowIso(), item: "policy", kind: "decision", text: <the spec's added or removed text with env.paths.root>, by: "the user" })`, then `writeStandingE2eSkip(paths, planned)` → `written` or `removed`; a throw appends `standingE2eSkip not written, <message>` in that project and is `failed: <message>`.
- Output, count line, commit line and `--json`: the spec's. Exit 1 when any project failed.
- The help line under `workspace status`: `projects standingE2eSkip --reason "<why>" | --remove [--dry-run]   the person's standing e2e skip written into, or removed from, every registered project (asks the user)`.

**Tests, `packages/engine/tests/cli.test.ts` (Modify).** The registry at `registryPath(join(WIZARDINGCODE_HOME, "crew"))`, written with `writeJson`. The command runs from project A through `main`, with `io.env.TMPDIR` set to a fresh folder that holds none of the projects but S. Each project is made with `makeRepo` and initialised by a crew command run in it before the row, so its `.crew` files are the engine's: A (eligible), B (eligible), C (an `e2e` command), D (`allowSkips: []`, written by the engine then edited and accepted), E (its own key with another reason), F (`requiredGates: ["e2e"]`, likewise), a worktree entry (`worktreeOf` by hand), a root deleted after registering, a root that is a symbolic link to B, a project whose `.crew` is a link, a project with `.crew` and no `profile.json`, a folder with `.crew` and no `.git`, a project whose policy is written by the engine and then edited by hand, a project whose `decisions.json` is edited by hand, and S, made with `git init` inside the `TMPDIR` folder.
- `2026-11-04-001 AC-41`: `projects standingE2eSkip --reason "no e2e suite in this project; the gate runs once a command is set" --dry-run` first: a sha256 of every file under every registered project's `.crew`, A's included, before and after is equal; A and B read `would write`. Then without `--dry-run`: A and B `written`, each holding the key and its register entry; C, D, E, F, the linked root, the linked `.crew`, no profile, no git, the tampered policy, the tampered register and S each `left out` with the spec's reason; the deleted root `gone`; the worktree absent and uncounted; the count line; the commit line names A and B. A second run reads `already set` for A and B. `projects standingE2eSkip --remove --dry-run` reads `would remove (<reason>)` for A, B and E; without `--dry-run` all three are `removed`. `projects standingE2eSkip` with no reason, `projects standingE2eSkip --remove --reason x`, `projects standingE2eSkip --reason x --mode auto` and a bare `projects` are refused before any project.

Red and green: `crew tdd red <id> AC-41 -- "cd packages/engine && bun test tests/cli.test.ts -t '2026-11-04-001 AC-41'"`.

## Phase 5: the guard (AC-42)

**Modify `packages/engine/src/hooks/pre-tool-use.ts`.**
- `userOnlyCommand` (lines 645-700): `userOnly` and `policyCommand` gain `(verb === "projects" && (parsed.positional.slice(1).some(unreadable) || (second === "standingE2eSkip" && parsed.flags["dry-run"] !== true)))`. The doc comment names it: the one command that writes a person's policy decision into every registered project. The hook's `parse` shares `BOOLEAN_FLAGS` with the CLI (`argv.ts`), so `--dry-run no` reads as `true` followed by a positional, and the guard and the command agree on it.
- The unattended denial (lines 1132-1137): for verb `projects`, the spec's text; for `policy`, as today.

**Tests, `packages/engine/tests/hooks-pre-tool-use.test.ts` (Modify)**, row `2026-11-04-001 AC-42`, modelled on `SP7a AC-5` (line 55) with `setup(null)` (relay): `crew projects standingE2eSkip --reason x` is asked under `auto` and `default`; denied under `bypassPermissions` and `dontAsk` with the spec's text; `crew projects $X` and `crew projects standingE2eSkip $FLAGS` are asked; `crew projects standingE2eSkip --reason x --dry-run` returns `{}`; `crew projects standingE2eSkip --dry-run no --reason x` returns `{}` and the command, run with it, writes nothing (the positional `no` is refused as a stray word by the command's usage check).

Red and green: `crew tdd red <id> AC-42 -- "cd packages/engine && bun test tests/hooks-pre-tool-use.test.ts -t '2026-11-04-001 AC-42'"`.

## Phase 6: the documents and verify

- Create `docs/adr/0022-a-standing-e2e-skip.md`: the decision (D-1, D-3), the third exception to "a policy can only tighten", its bounds (e2e alone, while the project is eligible, signed by a prompt), the bulk command and the skipped-run line (G-6).
- `plugins/core/skills/crew/references/gate.md` (Modify): under the "A gate is unavailable" bullet (line 10), a paragraph: an eligible project decides once with `crew policy set standingE2eSkip --reason "<the person's words>"` (asked even under relay); each e2e run records it while it holds, and the verdict counts it only while it holds; `crew projects standingE2eSkip` writes it into every registered project from one yes. The e2e gate's "Unavailable" bullet (line 29) points to it. In "UI/UX needs evidence" (line 71): with no captures, the session takes the manual path itself and never asks the person for a skip of ui-ux.
- `plugins/core/skills/crew/SKILL.md` (Modify), the method table's Gate row: `crew policy set standingE2eSkip` beside `crew gate run`.
- `docs/real-use/findings.md` (Modify): finding 223's Outcome `fixed in 2026-11-04-001; the runtime adapters' refresh, the engine version record and the release step are their own item (D-4, D-5)`; finding 224's Outcome `the texts fixed in 2026-11-04-001; open, the crew's own browser capture, for its own item`, whose last clause starts with `open`, as `openFindings` reads it (`findings.test.ts:13-25`). `packages/engine/tests/findings.test.ts` (Modify) takes 223 out of `OPEN` and keeps 224.
- `plugins/core/dist/crew.mjs` (Modify): `bun run build`.
- The skipped-run reach: each registered project's `.crew/decisions.json` searched by hand for a change of `unattendedDecisions` away from `count`; the count of such projects written into `.crew/work/<id>/notes.md` (Create).
- `crew tdd after <id> AC-8 -- "cd packages/engine && bun test"`.
- `bun run check`, `bun run plugin:check`, then `crew gate run <id>` and the judgement gates as `references/gate.md` says.
- `time node plugins/core/dist/crew.mjs projects standingE2eSkip --reason "no e2e suite in this project; the gate runs once a command is set" --dry-run` on this machine's registry: the lines read, the time written into `notes.md` as an observation, nothing written in any project.

## After the release that carries it (D-3)

Not a criterion (spec, Non-goals): once the release is installed, the dry run above is read with the user, then run without `--dry-run`; the person answers the guard's prompt.

---

Published by `crew learn` from item `2026-11-04-001-finding-223-a-project-with-no-e2e-comman`, reviewed before the code (ADR 0019).
