# Sources

How the material of `wizardingcode-frontend-motion` entered, as ADR 0017 asks: each rule restated in the crew's words, a number kept as its source's and labelled, a row in `docs/sources/ledger.json` for every rule row of the skill. The user's decision is D-1 of item 2026-11-19-001: a seventeenth skill for motion, and springs on the web, in their words of 2026-11-18. It reverses, for the web alone, the ledger's refusal of springs (D-6 of 2026-10-30). The team's definition of 2026-11-16 keeps its text: its rule 14 names the sixteen skills the user answered then, and the record of this seventeenth is ADR 0017's note of 2026-11-19.

## The sources

| Source | Licence | Read at | Read whole | Not opened, or left out |
| :- | :- | :- | :- | :- |
| `emilkowalski/skills`, Emil Kowalski's skills for interface animation | MIT, by its `LICENSE` file | commit `64eb3de` | `skills/emil-design-eng/SKILL.md`; `skills/review-animations/SKILL.md` and `STANDARDS.md`; `skills/animate/SKILL.md` and `RECIPES.md`; `skills/choreograph/SKILL.md` and `RECIPES.md`; `skills/animation-performance/SKILL.md`; `performance-cheatsheet.md`; `skills/animation-vocabulary/SKILL.md`; `skills/remove-animations/SKILL.md`; `skills/find-animation-opportunities/SKILL.md`; `skills/improve-animations/SKILL.md` and `AUDIT.md`; `skills/apple-design/SKILL.md`; `skills/pick-ui-library/SKILL.md`; `skills/gestures/SKILL.md` (item 2026-11-19-002) | Left out, and the source of no rule here: `skills/mobile-native/SKILL.md` (that set stays refused, D-6), `skills/improve-animations/PLAN-TEMPLATE.md` and `skills/animate-expo` (read in part only), and the skills that are not about motion |
| `greensock/gsap-skills`, GreenSock's skills for its library | MIT, by its `LICENSE` file | commit `aed9cfd` | `skills/gsap-performance/SKILL.md`, as one party to the disagreement on `will-change`; no rule of it is taken | Left out: `gsap-core` and `gsap-plugins` (read in part only), and the rest of the set |
| MDN Web Docs: the pages on the `linear()` easing function, on `animation-timeline` and "Using the View Transition API" | Prose under CC-BY-SA 2.5 or later, code samples under CC0, by MDN's own page on attribution and licensing, read on 2026-11-19 | their pages | cited as facts of the platform; no sentence and no sample taken | Their compatibility tables |
| web.dev: the guide to high-performance CSS animations and the article on `prefers-reduced-motion` | Content under the Creative Commons Attribution 4.0 License and code samples under the Apache 2.0 License, by the footer of the first page, read on 2026-11-19 | their pages | cited as the platform owner's guidance, as visual craft cites them; no sentence and no sample taken | none |
| W3C, the Understanding documents of WCAG 2.2 | "W3C liability, trademark and permissive license rules apply", by the page's footer, read on 2026-11-19 | their pages | cited by reference to visual craft's rows, and one norm stated here: success criterion 2.5.7, Dragging Movements, opened on 2026-11-19 and asked what it requires | none |

Left out of this item altogether, and the source of no rule, term or line of code: `freshtechbro/claudedesignskills` (read without its code blocks) and every file read in part.

Motion's kit (`motiondivision/ai-kit`) gave nothing. It holds no licence file, it was not opened beyond its root README, and no tool of its server was called for this item, though one is connected to the session that wrote the skill. The spring's function in `references/recipes.md` is written from the mathematics of a damped spring; the two `linear()` values in the text are that function's own output, which a row of the test holds.

## What is whose

The practitioner's set is MIT, and its lists may be followed. What this section owes is to say which are, so that nobody takes the skill's structure for the crew's own where it is the source's. Each list of the skill was set beside its source's list, by membership and by order, on 2026-11-19, after a first text of this section said less than the two texts show.

Lists that follow a source's order, restated:

- **The gate's five questions** follow the first three steps of the practitioner's sequence for building an animation (`animate/SKILL.md`: whether it animates at all, which holds frequency and the keyboard; the purpose; the cheapest tool), in that order. The crew split the keyboard into a question of its own and added the question on the task.
- **The six purposes**: four have their ground in the practitioner's closed list (`feedback`, `orientation`, `continuity`, `attention`), under names of the crew's; `material` and `signature` are the crew's.
- **Choreography**: its first three steps (cast, relate, the timeline written) are the practitioner's first steps for choreography in their order (`choreograph/SKILL.md`), and the fourth, interrupt, is that skill's section on interruption. The four roles of the cast (lead, support, decoration, still) are the source's table in its order. The four relations (together, overlapping, in sequence, carried) are the source's four in its order.
- **The order of remedies** in "Review" follows the practitioner's review skill (`review-animations/SKILL.md`), restated.
- **The ten questions of `references/review.md`** follow that skill's ten standards in the source's order, restated: purpose, frequency and the keyboard, curve, length, origin and path, interruption, cost, reduced motion, and belonging stand where the source's stand. The source's ninth, unequal timing, is folded into the question on length, and the ninth here, a page readable with no script, is the crew's own.
- **The order of findings** in `references/review.md` (what blocks or misleads; what should not exist; cost; interruption and timing; origin and belonging; reduced motion) is the source's order of its verdict, one for one.
- **"How to look"** in `references/review.md` (slowed down and by frames; on a recording; again a day later) follows the source's advice in its order.
- **The order of diagnosis** in "Performance" follows the practitioner's performance skill (`animation-performance/SKILL.md`), restated and shortened.

Lists and forms that are the crew's:

- **The thesis's five parts.** The practitioner's timeline is a table of six other columns.
- **"Made by hand"**, eight points drawn from rules of five files; the selection and the order are the crew's.
- **The form of a finding** (where, question, now, instead, why). The practitioner's is a table of three columns.
- **"What the skill refuses"**, "What the team never claims" and "Done when".

The vocabulary's forty-four terms: eighteen are the design library's ids. Of the other twenty-six:

- nineteen name a move the practitioner's glossary also names, under the glossary's name or one near it: `rubber-band` (its own term), `drag-dismiss` (its "swipe to dismiss"), `press-feedback`, `hover-answer`, `hold-to-confirm`, `number-tick`, `origin-menu`, `accordion-height`, `fade`, `rise` (its "slide in"), `stagger`, `reveal-once`, `cross-fade`, `layout-move`, `shared-element`, `view-transition`, `scroll-drift`, `spring-settle` (its "spring") and `idle-loop`;
- two are techniques of the practitioner's other files, with a name of the crew's: `blur-bridge` and `clipped-tabs` (`emil-design-eng/SKILL.md`, and `animate/RECIPES.md` for the second);
- three name things those files give rules for and the glossary does not name: `centred-modal`, `sheet-rise`, `toast-slide`;
- two are the crew's: `focus-ring` and `role-entrance`, the second being the crew's name for an entrance cast by the source's roles.

The glossary holds over ninety terms; its grouping and its order were not followed, and the six headings of the vocabulary are the crew's. Every definition is the crew's own sentence.

A move between two layouts (`flip` in the recipes) is the trade's common technique, written here against the Web Animations API with no source's code beside it.

### The gestures' reference (item 2026-11-19-002)

Written from `skills/gestures/SKILL.md` set beside `references/gestures.md`, section by section, on 2026-11-19. The item stands inside D-1, by the session's reading: the user spoke of a motion skill and springs on the web, and a drag's release is where such a spring is used.

- **The two phases** are the source's frame: its file is built on the same split, and the reference says it in the crew's words.
- **The reference's sections follow the source's file in its order**: whether to build at all, the two phases, the pointer down, the release, values linked to the drag, code, reduced motion, checking. Three of the source's sections have none here (a sheet's curve with no spring, hold gestures, and its closing advice), one became a rule row of `SKILL.md` (a thing dismissed along the axis it entered on), and one is the crew's ("What the code does not do").
- **While the pointer is down**: seven points. Three are the source's rules for that phase, in the source's order among themselves (the transform on the element, no state per event, resistance at a limit; its first, one to one, stands in "The two phases"). The threshold and the capture are rules of `apple-design/SKILL.md`. The control that is no handle restates the source's mark for its own component under another name, `[data-no-drag]`. `touch-action` is from the source's checklist. One pointer is the crew's.
- **On release**: five points. Three are the source's (distance or speed, a quick return, bounce at a release alone), in an order of the crew's; its first, the spring from the hand's speed, stands in "The two phases". That a release can be caught is the source's section on interruption. A cancel as a return is the crew's.
- **A pointer let go where the element cannot hear it.** That a move of the drag's pointer with no button down ends the drag, and that a press takes the drag whatever came before it, are the crew's own rules, written after the item's code reviewer found the fault. Neither source file speaks of a button's state. `destroy()` and the platform's controller it uses to take the listeners off are the crew's too.
- **Reduced motion** restates the source's paragraph: following stays, the fling and the bounce go.
- **Checking a gesture**: the trial on a real phone is the first line of the source's checklist. What a test holds is the crew's. The checklist's figure for a hit target did not enter: the frontend standard holds the norm's own.
- **The twelve rule rows** of `SKILL.md`'s section are drawn from those rules, in an order of the crew's; the first is the W3C's norm and the last restates the source's advice to take a component that exists, which the source gives for its author's own and the crew gives for the project's.
- The source's advice to use its author's drawer, its two lines of that component's CSS and its block of a library's props did not enter.

**The two formulas** of the drag are the source's, term for term, since a formula cannot be restated: the landing of a release (`apple-design/SKILL.md`, its function for a projection) and the band of resistance (the same file). The source gives both as a third party's sample code; that code and the talks behind it were not opened, and their licence was not read. They are reached through an MIT file. The functions' names (`carry`, `band`) and all the code round them are this session's: the source's block for a drag is a component of a library with seven props, and no line of it is here.

**The figures the drag keeps**: 0.998 and 0.55, with the two formulas; the threshold of 10 px (`apple-design/SKILL.md`); the share of 0.4, the lower end of the range `gestures/SKILL.md` gives. Each is labelled `hypothesis`. The settle's spring, no bounce and a duration of 0.4 s, is the recipes' first output and is also the pair the source's own sample line gives. The window of 100 ms the speed is read over is in no file of the closed list and is the skill's own.

## Figures not read at their origin

The allowance of a bounce after a gesture with momentum, and its size, reach this skill through one practitioner's summary of talks that were not opened. They are labelled `hypothesis`, and the skill says they were not read at their origin. The same holds for the drag's two formulas and its four figures, above.

## How the text was compared

The sentence "no sentence, code, prompt or form of a source is copied" was tested by the session before the delivery, against the two checkouts at their commits: the prose and the code by runs of five words; each list beside its source's list by membership and order, which is how the section above was written the second time, after the security lead set the two texts side by side and found the first text of it wrong in three places; the forms slot by slot; the vocabulary term by term against the glossary's list of terms. The code's structure was compared by the run of five words and by the blocks' names, and not by a reading of both recipe files line by line. The counts and what remains are in the item's delivery notes.

For the gestures' reference the code was read line by line beside the source's three blocks: its component's props, its function for the projection and its function for the band.

What was not compared: Motion's kit (not opened), the talks behind the practitioner's summary, and Chrome's article on `linear()`, which this item did not open and cites nowhere.
