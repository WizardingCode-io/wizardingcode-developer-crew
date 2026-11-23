# 0017. Outside sources enter the core distilled, with their provenance

- Status: accepted (the user, 2026-10-26). Extends ADR 0010's provenance rule from the packs to the core.
- Date: 2026-10-26

## Context

SP9 takes the best of sixteen outside sources (design and motion skills, linters, browser tools) into the crew's frontend work. ADR 0010 says how an outside skill enters a pack: as data, with the case that measured its claim listed under `provenance`. It says nothing of the core: the rubric, the reviewer, the method's references and the engine's gates, where most of what SP9 adopts has to live (a rubric and a gate cannot be a pack's). The user's direction of 2026-10-26: take the best of everything into our own agents, skills and workflows, never invoke somebody else's plugin.

Three shapes were on the table: invoke the installed plugins (impeccable, taste, Emil Kowalski's skills) from the crew skill when the machine has them; vendor their files into the plugin; distil their rules into the crew's own words.

## Decision

1. **An outside source enters the core only distilled**: rewritten in the crew's own words, in the shape the crew's readers already have (a rubric question, a row of a standard's table, a rule of a gate with an id, a sentence of a reference), one value per rule where the sources disagree, with the reason for the choice written beside it.
2. **The provenance is recorded where the rule lives**: a footer of the reference or the rubric names the source, its licence, what entered and the commit read on the day; the pack that folds the same source lists it under `provenance` with the measuring case, as ADR 0010 asks.
3. **A source's claim is measured before it changes an agent**: the eval case that shows the difference is named with the record (the SP9 design §9 lists them), as the vision's publishing rule asks of a pack.
4. **No outside plugin is invoked and no closed binary runs**: a hook, a command or an agent of another plugin is never called by the skill or the engine; a tool the engine runs (Playwright, the chrome-devtools CLI, axe) is open source, installed by the user or the project, found on the machine and said when absent.
5. **Licences**: only sources under a licence that allows the distillation (MIT, Apache-2.0) enter; the licence is named in the footer.

## Consequences

- Shape 1 is rejected: it would depend on what each user's machine holds, the loop could not measure it, and a second method would run beside the crew's. Shape 2 is rejected for the same reason ADR 0010 rejected a second copy of the method: two texts to keep in step, and a tone that is not the house's.
- The standard (`references/frontend.md`) is the crew's text with a provenance footer; a reader who wants the sources finds them there.
- A later source enters the same way: distilled, footnoted, measured. The CTO's review and the harness-improvement loop can change the distilled text as any other text of the method; the footer keeps where it came from.

## Note of 2026-10-29 (item 2026-10-29-001, the user's decision D-3)

Item 2026-10-29-001 (no AI slop) measured P-4 (the writing standard) and P-6 (the code-quality rubric's questions 7 to 11) before the change, each with a kit case red on the base text and green on the item's (`docs/evals/2026-10-29-no-slop-results.md`). Question 11 of the UI/UX rubric (taste-skill's squint, edge and sameness passes) entered before its case, by the user's decision D-3: the ui-ux gate needs a browser's captures, which the kit's sandbox has not. SP9 Task 14's `ui-ux-generic-tells` measures it. That is the one departure from rule 3 here, and it is said on the record.

## Note of 2026-10-30 (item 2026-10-30-005)

The art-direction dealer, the Awwwards-weighted score and the image search that item 2026-10-29-001 listed as "not taken" enter by the user's decisions D-1 to D-5, and ADR 0018 says how. What a source holds now leaves it only by a decision on record in `docs/sources/ledger.json`.

## Note of 2026-11-18 (item 2026-11-18-001, the user's decision D-1)

Decision 5 lets in only sources under MIT or Apache-2.0. The user gave two files on 2026-11-18, a skill for a site that opens on a film driven by the scroll and its one-page checklist, a third party's material that carries no licence, and decided as D-1 of item 2026-11-18-001 that it enters distilled as an exception: ideas and techniques restated in the crew's own words and code, no sentence, code, prompt or form copied, and its numbers kept as starting points said to be the material's. The skill `wizardingcode-design-film` is what entered, and its `sources.md` says what was read. The exception is to decision 5, for this one source with no licence. Whether the material is one its maker sells was not established, so this is no ruling that a paid source's numbers may enter. The ledger's list of sources stays held to the two licences, so the material is named by its rows there and by this note.

The same decision's other side: on 2026-10-30 the user's D-6 refused scroll-craft's engine, its attributes and `ffmpeg` as "code and tools no project asked for". The user's word of 2026-11-18 is that a film driven by the scroll is what a site of the crew lacks. The film skill gives a session an engine and the encode's commands as text to adapt; the engine still ships no code of its own for it.

## Note of 2026-11-18 (item 2026-11-18-017, the user's decision D-1)

A second file with no licence, a third party's project instructions for a site that opens on an object in three dimensions, given by the user on 2026-11-18, enters distilled as `wizardingcode-design-stage`, by D-1 of item 2026-11-18-017 and on the terms of the note above: ideas and techniques restated in the crew's own words and code, no sentence, code, prompt or form copied, its numbers kept as starting points said to be the material's. The skill's `sources.md` says what was read and how the copying was tested. The exception is to decision 5, for this one source with no licence. Whether the material is one its maker sells was not established, so this is no ruling that a paid source's numbers may enter. The ledger's list of sources stays held to the two licences, so the material is named by its rows there and by this note.

Two things are new with it. The skill gives code that needs three.js in a project: a dependency the session puts to the user in that project and records, never one the skill installs. And three.js stands in this repository's development dependencies at a fixed version, by the user's yes of 2026-11-18 (Q-1 of the item), so that a row of the engine's tests runs the skill's code in a browser; the published plugin carries none of it. `freshtechbro/claudedesignskills` (MIT) was read for the item and is the origin of nothing, as the skill's `sources.md` says.

## Note of 2026-11-19 (item 2026-11-19-001, the user's decision D-1)

The frontend team's seventeenth skill, `wizardingcode-frontend-motion`, enters by D-1 of item 2026-11-19-001, the user's words of 2026-11-18. Its sources are a closed list of files, each read whole at its commit, and a rule whose only source is a file read in part does not enter. The refusal of springs (D-6 of 2026-10-30) is reversed for the web alone: the ledger's one refused row became three, springs on the web in, native springs and gestures refused, and the web-on-phone set refused, since the user's words name neither. A source with no licence file gave nothing, and no tool of its server was called. The team's definition is not changed: its rule 14 keeps its text of 2026-11-16, the sixteen skills the user answered then, since each rule's line there is held to the request of that date; this note is the record of the seventeenth, and when the definition next goes to the user with a new request the seventeenth skill goes in it.

## Note of 2026-11-22 (item 2026-11-22-001, rule 6 of the architects team's definition)

The architects team's five skills, `wizardingcode-architecture` and the four it sends to, take rules from three of the four links the user gave on 2026-11-15. Two of the three stand outside decision 5. dandgabr's repository, `dandgabr/skills`, is under GPL-3.0. davila7's file stands in a repository under MIT, and its text first appeared on 2025-11-14 in `NeoLabHQ/context-engineering-kit`, under GPL-3.0, and reached davila7's repository on 2026-01-25, as the team's definition gives it. The exception is read from rule 6 of that definition and from the two rows of its table of the four links, the user's of 2026-11-15, whose words name the GPL and not decision 5: the rules of both enter in the crew's own words. What may enter is ideas restated: no sentence, table, example or list copied, and a translation counts as a copy, dandgabr's files being in Brazilian Portuguese. Two things looked for a copy, and neither is a proof. A probe of the item fetched the links' files at the ledger's commits and compared them with the five skills, the ledger's new rows and this note for any run of six words shared: it sees a copy in the same language and cannot see an English rendering of a Portuguese sentence. For that there is only reading: the code-quality reviewer and the judge read each row written from dandgabr's files beside the passage it was written from, and the security lead reads the delivery. The first reading returned eleven rows as renderings of a sentence or of a list in its order; they were rewritten as fewer rows, or removed, and the judge's ruling names the rows it still found nearest to a file's order. The exception is to decision 5, for these two sources as read at their commits, `b23ec7f` and `1deb97c`, and is no ruling that another source under the GPL may enter: the ledger's test lets in the one source named `dandgabr-architect` under that licence and refuses every other. Apart from the exception stands decision 3. No eval case measures a session that uses a skill of a team, so no claim of these three sources was measured before the skills entered. By D-1 of the item, the user's of 2026-11-22, the skills enter now and the measuring case is owed as an item of its own: a departure from decision 3, said here.
