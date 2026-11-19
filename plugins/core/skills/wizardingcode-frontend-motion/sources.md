# Sources

How the material of `wizardingcode-frontend-motion` entered, as ADR 0017 asks: each rule restated in the crew's words, a number kept as its source's and labelled, a row in `docs/sources/ledger.json` for every rule row of the skill. The user's decision is D-1 of item 2026-11-19-001: a seventeenth skill for motion, and springs on the web, in their words of 2026-11-18. It reverses, for the web alone, the ledger's refusal of springs (D-6 of 2026-10-30). The team's definition of 2026-11-16 keeps its text: its rule 14 names the sixteen skills the user answered then, and the record of this seventeenth is ADR 0017's note of 2026-11-19.

## The sources

| Source | Licence | Read at | Read whole | Not opened, or left out |
| :- | :- | :- | :- | :- |
| `emilkowalski/skills`, Emil Kowalski's skills for interface animation | MIT, by its `LICENSE` file | commit `64eb3de` | `skills/emil-design-eng/SKILL.md`; `skills/review-animations/SKILL.md` and `STANDARDS.md`; `skills/animate/SKILL.md` and `RECIPES.md`; `skills/choreograph/SKILL.md` and `RECIPES.md`; `skills/animation-performance/SKILL.md`; `performance-cheatsheet.md`; `skills/animation-vocabulary/SKILL.md`; `skills/remove-animations/SKILL.md`; `skills/find-animation-opportunities/SKILL.md`; `skills/improve-animations/SKILL.md` and `AUDIT.md`; `skills/apple-design/SKILL.md`; `skills/pick-ui-library/SKILL.md` | Left out, and the source of no rule here: `skills/gestures/SKILL.md` and `skills/mobile-native/SKILL.md` (gestures are a later item; the second set stays refused), `skills/improve-animations/PLAN-TEMPLATE.md` and `skills/animate-expo` (read in part only), and the skills that are not about motion |
| `greensock/gsap-skills`, GreenSock's skills for its library | MIT, by its `LICENSE` file | commit `aed9cfd` | `skills/gsap-performance/SKILL.md`, as one party to the disagreement on `will-change`; no rule of it is taken | Left out: `gsap-core` and `gsap-plugins` (read in part only), and the rest of the set |
| MDN Web Docs: the pages on the `linear()` easing function, on `animation-timeline` and "Using the View Transition API" | Prose under CC-BY-SA 2.5 or later, code samples under CC0, by MDN's own page on attribution and licensing, read on 2026-11-19 | their pages | cited as facts of the platform; no sentence and no sample taken | Their compatibility tables |
| web.dev: the guide to high-performance CSS animations and the article on `prefers-reduced-motion` | The fetched text of the first page carried no licence line; the site's licence was not read for this item [source?] | their pages | cited as the platform owner's guidance, as visual craft cites them; no sentence and no sample taken | none |
| W3C, the Understanding documents of WCAG 2.2 | "W3C liability, trademark and permissive license rules apply", by the page's footer, read on 2026-11-19 | their pages | cited by reference to visual craft's rows; this skill states no norm of its own | Success criterion 2.5.7, which belongs to the later item on gestures |

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

The vocabulary's forty-two terms: eighteen are the design library's ids. Of the other twenty-four:

- seventeen name a move the practitioner's glossary also names, under the glossary's name or one near it: `press-feedback`, `hover-answer`, `hold-to-confirm`, `number-tick`, `origin-menu`, `accordion-height`, `fade`, `rise` (its "slide in"), `stagger`, `reveal-once`, `cross-fade`, `layout-move`, `shared-element`, `view-transition`, `scroll-drift`, `spring-settle` (its "spring") and `idle-loop`;
- two are techniques of the practitioner's other files, with a name of the crew's: `blur-bridge` and `clipped-tabs` (`emil-design-eng/SKILL.md`, and `animate/RECIPES.md` for the second);
- three name things those files give rules for and the glossary does not name: `centred-modal`, `sheet-rise`, `toast-slide`;
- two are the crew's: `focus-ring` and `role-entrance`, the second being the crew's name for an entrance cast by the source's roles.

The glossary holds over ninety terms; its grouping and its order were not followed, and the six headings of the vocabulary are the crew's. Every definition is the crew's own sentence.

A move between two layouts (`flip` in the recipes) is the trade's common technique, written here against the Web Animations API with no source's code beside it.

## Figures not read at their origin

The allowance of a bounce after a gesture with momentum, and its size, reach this skill through one practitioner's summary of talks that were not opened. They are labelled `hypothesis`, and the skill says they were not read at their origin.

## How the text was compared

The sentence "no sentence, code, prompt or form of a source is copied" was tested by the session before the delivery, against the two checkouts at their commits: the prose and the code by runs of five words; each list beside its source's list by membership and order, which is how the section above was written the second time, after the security lead set the two texts side by side and found the first text of it wrong in three places; the forms slot by slot; the vocabulary term by term against the glossary's list of terms. The code's structure was compared by the run of five words and by the blocks' names, and not by a reading of both recipe files line by line. The counts and what remains are in the item's delivery notes.

What was not compared: Motion's kit (not opened), the talks behind the practitioner's summary, and Chrome's article on `linear()`, which this item did not open and cites nowhere.
