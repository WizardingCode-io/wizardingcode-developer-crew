# 0025. The session installs a row of a team's declaration at the person's yes

- Status: accepted (the crew, 2026-11-21, under the user's standing rules; the user may replace it).
- Date: 2026-11-21

## Context

Each of the nine team definitions in `docs/specs/` lists servers and skills that a framework's or a tool's own team publishes, with the install line its page gave. The backend definition's rule 1 says such a server is "installed at once, in the project and on our side", and rule 3 says the same of skills. Every definition then leaves open, in its section "What the code needs, not decided here", how that is carried out and by whom (the engine, a pack or the session), and asks for an ADR beside ADR 0010, under which a pack ships no skill, and ADR 0017, under which an outside source enters the core only distilled.

The definitions' own words say what an install is: "an install command runs its publisher's code in the project and on our side". Some lines take a credential, some add a hosted server that receives what a session asks, some need a release that is not stable. `crew sources backend --project` printed every row of a project with its line and the sentence "who runs it is not decided yet", so a session shown a line could run it or not, with nothing to say which.

The standing rules this decision is taken under: the rules of section 5 of the backend definition; "decide by the standing rules and the recommended options, say what was taken, ask only what is truly the user's" (2026-11-16); the directive to build every team definition without stopping (2026-11-21); and the rule that a decision of the user's is a yes or a no they give in words.

## Decision

1. The session installs, in the project's own session and with a person present: one row at a time, only a row the engine calls ready, after the person's own yes given in that session. The yes is asked once for the ready rows together, in one message that gives for each row what it installs, its page, its line and the notes the engine prints under `ready`: where the install lands and what the line downloads and runs first.
2. Before a row's line is run its page is read again. The line is run only where the page still gives that same line. A line that differs, or a page that cannot be read, is not run, and the session says so to the person.
3. With nobody present no row is installed. The yes is a person's own words in that session: no validator, no default, no agent's message and no earlier session's answer is the yes.
4. The engine installs nothing and runs no line of a declaration. A pack ships no skill and no server (ADR 0010 stands).
5. A publisher's skill or server installed this way stays the publisher's, in the project or in the person's Claude Code. It does not enter the core, so ADR 0017 is not touched: what enters the core is still distilled. A session that runs a publisher's install line after a yes is not the skill invoking another plugin: the line is the person's choice for their project, and nothing of the crew's method calls what it installs.
6. A held row is never run by the session, nor is a line of a row the command did not print. The engine says why a row is held: its row gives no command; it is not stable by its own row; it is hosted; its line takes a value of the machine, a token or a key; its line is typed at Claude Code's prompt; its line is not one of the engine's install forms; or it is a row of an error service, which reaches production data with a credential. What lifts a hold is a later decision: where a credential is held and with what scope, whether a hosted server may receive a project's data, a stable release of a server.
7. An install changes the project. It is made as an item of its own, never inside another item's change.
8. Not decided by it, and said: the record of what was installed or declined in a project; the credentials; the other eight teams' rows; the version. The definitions ask that "the version and the page are checked again at the install": the page is, by point 2, and no version is.

The engine's list of install forms is closed and holds no form that takes a command to run. A form fixes how a line opens; what follows it is the publisher's own names (a package, a repository, a skill).

## Consequences

- A session knows which rows it may propose and which it may never run, and a person is asked once, with where each install lands and what it downloads in view.
- The yes and the page read again are instructions to the session, enforced by no hook and by no record. Until the record exists a project is asked again in each session that reads its rows, and nothing shows that a session asked, read the page again or declined the part of Boost's installer that adds Laravel Herd's server.
- `ready` means the engine found no reason to hold a row, and nothing more. It is no judgement that a publisher's code is safe.
- A ready line pins no version: it fetches and runs what its publisher serves on the day.
- Four of the backend's ready rows run a carrier first (`skills` on npm, `library-skills` on PyPI) that their row does not say is the publisher's own. They stay ready because the publisher's own page gives the line; the engine prints the carrier under `ready`. Rule 2 of the definition says "nothing from the community is installed", and the user may hold these rows.
- Rule 1's "installed at once" is read as "proposed at once", with the person's yes before the first line run, and that reading is the crew's. The user's own text says "installed at once"; the user may replace this decision with it.
- The state of a row is read from the row's own words. A definition that calls a server unstable in other words than "experimental" and "release candidate" leaves its row ready until its team's rows are held to their states by a test, as the backend's are.
- Only the backend's declaration has a project form, so only its rows have a state.

## Amendment: the record (2026-11-21)

Point 8 left the record undecided. Item 2026-11-21-007 adds it.

- The file is `.crew/local/sources.json`: this machine's and this checkout's, under the folder git ignores and only the engine writes. It is not committed, since the yes of point 1 is each person's own: a colleague is asked on their own machine, and so are another machine and another worktree of the same checkout.
- Two forms write it: `crew sources backend --installed <page>` once a ready row's lines ran, and `crew sources backend --declined <page>` after a no. Only a row the engine calls ready is recorded; a held row and a row in the project already are refused.
- `crew sources backend --project` prints a recorded row's decision and day in place of `ready`, so a session does not present it again. A held row prints held whatever the record holds, and a row whose line changed since it was recorded is ready again and says so.
- What a record is not: a record says what a session recorded and not that a line ran. Under `attendedDecisions: relay` the hook does not ask, so a record is no proof the person was asked. A record is not a yes: an `installed` entry lets no session run a line, since point 3 says no earlier session's answer is the yes.
- With nobody watching the hook denies the record whatever its flags, and the command refuses --mode and `--validator`, so nothing is recorded. The hook fails open, and the command cannot tell whether a person is present: that nothing is recorded with nobody present rests on those two.
- The file is under no hash. It is read as a regular file under a cap and against a strict shape, and never behind a folder that is a link; a file a person or a program changed reads as a record wherever it fits the shape, and the engine cannot tell it from its own. Such a record can only stop a ready row from being presented: it never shows a held row as installed and is never a yes.

## Amendment of 2026-11-24 (item 2026-11-24-001)

The Decision's last sentence says only the backend's declaration has a project form. This amendment replaces it; the Decision's text stays as it was written.

- Every team's declaration has a project form: `crew sources <team> --project`. The backend's form is unchanged but for its last line, which names `<team>` where it named the backend.
- For a team other than the backend the form prints every row of the declaration's tables whose header's last cell is `How it is installed`, under the heading of its section, each with its state, then the counts of ready and held rows.
- What that form does not tell: whether the project uses the tool or the service of a row. Nothing detects it for these teams, the form says so in a line of its own, and the heading over a row says when the row applies. So a ready row is ready by its line alone, and a session presents it only where the project has the tool.
- A row of these teams is held, in this order, by: its section's heading, where it opens `### Left out` or `### Held` (`its table is left out or held by the definition`); a cell that names `still owed` or `to be checked` (`its row says what is still owed or to be checked before it enters`); its own cells, as the backend's rows are read; and, where those leave it ready, a held row of another team's declaration at the same page (`another team's declaration holds a row at its page`), since an install is the project's and not a team's.
- That last hold reads the other seven of these eight declarations and not the backend's: the backend's rows are keyed by stack and their state depends on the project, and its form is the one this ADR decided first. A declaration of the other seven that cannot be read refuses the command, so the hold never passes over a missing file. A row with no page equals no other row.
- Two holds are added for every team, the backend's among them. A cell that names `beta`, `preview`, `pre-release` or `alpha` as a whole word makes the row not stable, beside the two phrases that stood. A row whose last cell holds a word beside its lines other than `then`, `and` and `or` is held: `its last cell says more than its lines`. No row of the backend's table changes state by either.
- One row is ready by its line alone and by nothing the engine checked of its publisher: the researchers' row for the crew's own memory, `wizardingcode-mem`. Which memory the engine reaches is not decided by this item.
- The record is one file for every team: `--installed <page>` and `--declined <page>` take any team, the entry holds the team's name, and one team's entry is not shown for another team's row at the same page. For a team other than the backend the record asks the form's own function for the row's state, so a row the form prints as held is refused; a page that two rows of the team share is refused, since a record by its page would not say which.
- Not covered: other words by which a row says it is not stable (`pre-1.0`, `early development`, `Early Access`, `MVP`), which stand today only in rows held for another reason; and a ready row that installs more than its second cell asks for, where the person's yes of point 1 stands.

## Amendment of 2026-11-24 (item 2026-11-24-002)

The amendment of item 2026-11-24-001 says the form of a team other than the backend does not tell whether the project uses a row's tool. This one changes that for the rows a session may install.

- The form prints one line under a ready row, `project:`, that says whether the project's own manifests and files show the row's tool: `shows`, `does not show`, or `not told`; a held row is not marked, since no session installs it.
- The line is read from a closed table keyed by the row's page (`packages/engine/src/detect/row-tools.ts`), ten entries for the twelve ready rows. Each sign is a dependency a manifest declares or a file of a fixed name in a target's folder, read on the tool's own page on 2026-11-24, by the readers and bounds of the backend's tools: a manifest under its cap, a file seen and never opened, no link followed, no environment file, no network. The line names the tool and the stacks, and no name of the project's.
- Two ready rows have no entry and say `not told`: the crew's own memory and Matt Pocock's skills. Nothing of a project shows what they are for.
- `shows` is not a yes. A database driver in a manifest shows a database, not that the person wants a set of skills for it. Point 1 stands: the person's own yes in the session, before any line runs.
- `does not show` is no proof that the project does not use the tool. The engine's readers do not read Python's optional or group dependencies nor Cargo's dev-dependencies; they do not see a tool installed outside the manifests, a file in a subfolder that is no target, nor a folder that is no target of a stack, so `manifest.lkml` and `atlas.hcl` are seen only beside a stack's manifest. No Composer package shows a PHP project's database, and the line says `not told` for php there.
- The build reference tells a session to present a ready row the project does not show only where the person asked for it. That narrows point 1, which has the ready rows presented together, and it can leave unpresented a row the project needs, for the reasons above. It hides a proposal and never a hold, and the form prints the row and its line whatever a session presents.
- The table is fixed on the day it was read. A tool that renames its package is shown or not by the names of 2026-11-24 until the table is read again.

## Amendment of 2026-11-26 (item 2026-11-26-001)

Point 6 left to a later decision whether a hosted server may receive a project's data. The user's answer of 2026-11-26 to the one question put: a person consents row by row, and the consent is recorded with the row. A consent for a whole project by a policy key was the other option.

- **What a consent is.** A person's word, for one row of one team's form in one project, that the row's hosted server may receive what a session asks. It is no yes to the install: the row's line is still run only after the person's own yes in that session, where its page read again still gives the same line.
- **How it is recorded.** `crew sources <team> --consented <page>` writes an entry with the decision `consented` and the row's lines to the project's record of installs, one entry a team and a page, a later decision replacing the earlier. The command judges the row as the declaration alone gives it. It refuses a row whose first hold is not the hosted one, and a row that another hold would still hold with the hosted one lifted (a token or a key in its line, words beside its lines, a line that is no install form).
- **How it is read.** A row's hosted hold is lifted where the record holds an entry of the row's own team at the row's page with the row's lines and the decision `consented`. Every other hold is read as before, and the backend's error services stay held. A changed line holds the row again. A page two teams' declarations hold as hosted takes a consent in each team's form, and with one, that team's row is held by the other team's row.
- **How it is withdrawn.** `--declined` withdraws a consent: its entry replaces the consent's, and a `declined` entry lifts nothing.
- **Who gives it.** The command is asked in every policy, `attendedDecisions: relay` included, and denied where nobody is present or with `--mode`. A `crew sources` command with a word the hook cannot read is asked the same way, since the word may be the flag, save where the one such word is the value of a readable `--installed` or `--declined`.
- **An install lifts too.** An `installed` entry lifts as well, where its lines are the row's: those lines already ran in this project at a person's yes, and it is the entry `--installed` leaves when it replaces a consent. It is relayed under `relay`, not asked. It can stand with no consent before it where a row's second cell gained the word "hosted" after it was recorded.
- **What no longer holds.** The record's amendment says of a record changed outside the engine: "it never shows a held row as installed and is never a yes". That sentence no longer holds for the hosted hold: an entry written outside the engine with a row's lines and one of the two decisions lifts it. The record is under no hash. What stands between such an entry and an install is the hook's guard of the engine's local folder, which fails open, and the person's yes to the install itself.
- **What it does not say.** A consent does not bound what a session then asks of the server, and the engine does not see the server's calls. The hosted test is the row's own cells: a URL in a line, or the word "hosted" in its second cell. A hosted server whose row says neither was never held.
- **An older engine.** A consent is on this machine alone, in a folder git ignores. An engine before this amendment reads such a record as none: it takes a record that holds a `consented` entry for one it cannot read, says so in its form, and shows no decision until the record is written again.
