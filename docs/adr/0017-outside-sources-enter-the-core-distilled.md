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
