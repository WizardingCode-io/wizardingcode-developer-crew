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
