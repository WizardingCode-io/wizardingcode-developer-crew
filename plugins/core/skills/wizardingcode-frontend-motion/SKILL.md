---
name: wizardingcode-frontend-motion
description: "The frontend team's rules for motion: the gate a move passes before it is built, the thesis, roles and origin, springs, interruption, reduced motion and review, with code that needs the browser alone."
---

# Motion

## When

After `wizardingcode-design-direction` has written the contract and before the first animated line; and again before a review of a page's motion. `wizardingcode-frontend-visual-craft` holds the norms a page's motion is bound by. This skill holds how a move is chosen and made.

Read `references/vocabulary.md` before the thesis is written, `references/recipes.md` before any code, `references/gestures.md` before anything a hand drags, and `references/review.md` before a review. `sources.md` says where each rule came from.

## How to read a row

Each rule is a row: the rule, its label, its source and what the source is. The labels are the four of `wizardingcode-frontend-visual-craft` (`norm`, `platform-guidance`, `published-study`, `hypothesis`) and mean what they mean there. A source written as a path is a file of a repository read whole at the commit `sources.md` names. An address is provenance: it is recorded with a choice and never opened by the session.

A value lives in the frontend standard and nowhere else. This table repeats the standard's values for motion as the standard holds them; where a project's `DESIGN.md` sets a value on record, that value stands in its place.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Feedback on a control takes 120 ms | `hypothesis` | `crew/references/frontend.md` | The crew's standard, its row for a move met a hundred times a day |
| Tens of uses a day: 200 ms at most | `hypothesis` | `crew/references/frontend.md` | The crew's standard, a menu, a tooltip, a dropdown, an accordion |
| An occasional move takes 300 ms at most | `hypothesis` | `crew/references/frontend.md` | The crew's standard, a modal, a drawer, a change of view |
| The signature takes 800 ms at most, once, named in the thesis | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard for a new site, its one authored moment |
| A press is `scale(0.97)` | `hypothesis` | `crew/references/frontend.md` | The crew's standard, with its reason for that figure |
| The enter and exit curve is `cubic-bezier(0.16, 1, 0.3, 1)` | `hypothesis` | `crew/references/frontend.md` | The crew's standard, one curve where five sources differ by a hair |
| A stagger inside an entrance ends within 240 ms | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard for a new site |
| An entrance rises 16 to 24 px with opacity, over up to 700 ms | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard for a new site |
| The floor of a new site is at least eight moving elements | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard, the user's decision of 2026-10-30 |
| A literal's limit is 900 ms on a site and 500 ms elsewhere | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard, what the design lint reads |
| A frame takes 16.7 ms in the sample | `hypothesis` | `crew/references/frontend.md` | The crew's standard, what the capture measures against |

## The gate

Every candidate move is asked five questions, in this order. The gate may answer "no move", and that is a result: say so, and say what stands in its place.

1. **How often is it met?** A thing met a hundred times a day takes feedback and nothing more. A thing met once may take the page's one authored moment.
2. **Did a key start it?** An action started from the keyboard takes no animation, whatever it opens. A control's own key is the exception the frontend standard names.
3. **Which purpose?** One of six, and no other:
   - `feedback`: the control answers the hand.
   - `orientation`: it shows where a thing came from or where it went.
   - `continuity`: it joins two states of one thing, so the change is not a jump.
   - `attention`: it points at the one change the person must not miss.
   - `material`: under a gesture, the thing behaves as a thing with weight.
   - `signature`: the page's one authored moment, named in the direction's contract.

   A move that names none is not built.
4. **What does it do for the task?** Data a person reads or acts on does not move for style. If the move holds content back from a person who scrolls fast, it fails here.
5. **Which tool?** The cheapest that works, in this order: a CSS transition, `@starting-style`, a CSS animation, the Web Animations API. A library enters only where the project already has it.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| How often a move is met decides first what it may be | `hypothesis` | `emilkowalski/skills`, `animate/SKILL.md` | A practitioner's skill, MIT; the crew's standard holds the same four rows |
| An action started from the keyboard takes no animation | `hypothesis` | `emilkowalski/skills`, `remove-animations/SKILL.md` | A practitioner's skill, MIT; the crew's standard keeps a control's own key |
| A move names its purpose from a closed list, or it is not built | `hypothesis` | `emilkowalski/skills`, `find-animation-opportunities/SKILL.md` | A practitioner's skill, MIT; four of the six purposes have their ground there, `material` and `signature` are the crew's |
| Data a person reads or acts on does not move for style | `hypothesis` | `emilkowalski/skills`, `remove-animations/SKILL.md` | A practitioner's skill, MIT |
| The gate may answer with no move, and says what stands in its place | `hypothesis` | `emilkowalski/skills`, `animate/SKILL.md` | A practitioner's skill, MIT |
| The cheapest tool that works: the browser before a library | `hypothesis` | `emilkowalski/skills`, `pick-ui-library/SKILL.md` | A practitioner's skill, MIT; the team's definition holds the same order |
| A project's tokens are extended, and no curve is typed from memory | `hypothesis` | `emilkowalski/skills`, `improve-animations/SKILL.md` | A practitioner's skill, MIT |

## The thesis

Before any motion code an item writes its thesis: one line for each move the gate let through, and under it the list of what was left still on purpose. A line has five parts.

- `device`: the move's name in `references/vocabulary.md`. A move with no name there is described in a sentence and then given one.
- `purpose`: one of the gate's six.
- `value`: the standard's row the move takes its length and its curve from. A value outside the standard is the project's `DESIGN.md`, on record.
- `rejected`: the candidate that was weighed and not built, and why.
- `reduced`: the move's form under reduced motion.

Three lines of a thesis, as an example of the form:

- `device` `press-feedback`, `purpose` `feedback`, `value` the standard's feedback time and press, `rejected` a colour change alone, which a hand does not feel, `reduced` the colour change alone.
- `device` `origin-menu`, `purpose` `orientation`, `value` the standard's row for tens of uses a day, `rejected` a fade from the centre, which says nothing of where the menu came from, `reduced` opacity only.
- `device` `role-entrance`, `purpose` `signature`, `value` the standard's entrance and its stagger's total, `rejected` the same rise on every section, `reduced` the parts fade together with no delay.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The timeline is written before the code, one line a moving element | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT; the five parts of the line are the crew's |
| What was left still on purpose is listed with the moves | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |

## Made by hand

Motion reads as made by hand when each move could only be where it is. Eight things make it so.

1. **Roles.** Each part of an entrance has a role, and the role sets its start, its distance and its length. One part leads; two leads is a fault of the layout that motion cannot mend.
2. **The same path out.** A thing leaves by the path it came: a sheet that came up from below goes back down.
3. **An origin.** A move starts at the thing that caused it: a menu grows from its control, and nothing appears from nothing.
4. **Unequal timing.** Entering is slower than leaving, and a deliberate hold is slow where the release is quick.
5. **A spring after a gesture.** What a hand threw settles as a thing with weight; what a button closed does not bounce.
6. **The pointer or the scroll, not a clock.** Where a move can follow the hand or the scroll, it does, and the reader sets its pace.
7. **One thing carried.** Where two states show the same element, that element travels between them and the rest cross-fades.
8. **One signature.** A page has one authored moment. A second one halves the first.

And what does not: a rise repeated. The same rise on every section counts once toward the floor of eight, however many sections repeat it. The floor is filled in the order the frontend standard gives, each kind before the next, and a reviewer counts kinds before elements.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Each part of an entrance is cast in a role before any timing is set | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |
| A thing leaves by the path it came | `hypothesis` | `emilkowalski/skills`, `animate/SKILL.md` | A practitioner's skill, MIT |
| A menu, a popover or a tooltip grows from its control, and a modal stays centred | `hypothesis` | `emilkowalski/skills`, `emil-design-eng/SKILL.md` | A practitioner's skill, MIT; the crew's standard holds the same |
| Nothing appears from nothing: an entrance starts near full size, never at none | `hypothesis` | `emilkowalski/skills`, `review-animations/STANDARDS.md` | A practitioner's standards file, MIT |
| An exit is shorter than its entrance | `hypothesis` | `crew/references/frontend.md` | The crew's standard; the practitioner's set agrees |
| A deliberate hold is slow and its release is quick | `hypothesis` | `emilkowalski/skills`, `emil-design-eng/SKILL.md` | A practitioner's skill, MIT |
| Forward brings the new from one side and back from the other | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |
| A reveal on entering view is made once, and never on every section | `hypothesis` | `emilkowalski/skills`, `remove-animations/SKILL.md` | A practitioner's skill, MIT; the ledger refuses a reveal on every section |

## Choreography

A group of moves is one gesture or it is a queue. Four steps, in this order.

1. **Cast.** Name the lead, the support, the decoration and what stays still. Decoration fades or does nothing.
2. **Relate.** Each pair of moving parts is together, overlapping, in sequence, or carried by a parent. An order with no meaning is a delay.
3. **Time.** Write the timeline: each part's start, length and travel. Gaps between starts are unequal and shrink; the whole ends within the standard's total. A support is tied to an event of the lead's move, when it starts or when it lands, and never to a delay chosen by eye.
4. **Interrupt.** Fire it twice, fast. A running move is taken from where it is on screen, never restarted from its origin, and never stacked on.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| One entrance a container: a container that enters does not also stagger its children | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |
| No stagger on a thing a person opens many times in a day, or opens from the keyboard | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |
| A stagger's gaps are unequal and get shorter towards the end of the group | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT; the totals are the crew's standard |
| Order follows importance and not the order of the markup | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |
| Things that leave, leave together | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |
| A choreography never blocks a control: what is visible can be pressed | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT; the crew's build skill holds the same |
| What a person can trigger twice within a second is a transition, never a keyframe animation | `hypothesis` | `emilkowalski/skills`, `emil-design-eng/SKILL.md` | A practitioner's skill, MIT; the crew's standard holds the same |
| A new move starts from what is on screen, and input is never locked while one runs | `hypothesis` | `emilkowalski/skills`, `apple-design/SKILL.md` | A practitioner's summary of talks, MIT; the talks were not read at their origin |

## Springs

A spring is for a thing a hand moved, or a thing that may be moved again before it rests. It is not for a state a button changed, and never for data.

- A spring is stated as a duration and a bounce. A triple of mass, stiffness and damping copied from an example gives a far bouncier spring than the same example's bounce, so it is never copied.
- Bounce is none by default. A bounce of up to two tenths is allowed only on the release of a gesture that carried momentum, and only where the thesis names it. Colour and opacity never pass their target.
- In CSS a spring is a `linear()` easing, behind a curve that every browser reads, inside `@supports`. `references/recipes.md` gives the function and two outputs.
- A spring's run is longer than the duration it is named by. The run passes the standard's limit for a literal, so the thesis names the spring and its value lives in a token.
- A `linear()` spring is for a move nothing interrupts. A thing dragged or retargeted in flight takes a spring computed in script.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A spring follows a gesture, or a thing that may be moved again before it rests | `hypothesis` | `emilkowalski/skills`, `emil-design-eng/SKILL.md` | A practitioner's skill, MIT |
| A spring is stated as a duration and a bounce, never as a copied triple of physics | `hypothesis` | `emilkowalski/skills`, `apple-design/SKILL.md` | A practitioner's summary of talks, MIT; the comparison of the two forms is the crew's own arithmetic |
| Bounce only where the gesture carried momentum | `hypothesis` | `emilkowalski/skills`, `apple-design/SKILL.md` | A practitioner's summary of talks, MIT; the talks were not read at their origin |
| In CSS a spring is a `linear()` easing, whose values may pass their target | `platform-guidance` | MDN, the page on the `linear()` easing function | The browser vendors' shared documentation of the platform |
| A spring in CSS stands behind a curve inside a feature test | `hypothesis` | `crew/references/frontend.md` | The crew's own rule, from the standard's "the browser before a library" |

## Gestures

A gesture has two phases. While the pointer is down the element follows it one to one, with no curve, no length and no spring. On release a spring finishes the move from the place the element stands at and the speed the hand gave it. `references/gestures.md` holds the rules of each phase and a drag to dismiss, whole. A drag is built only where the project's own component and the browser's own scrolling do not cover the need, and whatever it does, a button beside it does the same.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Whatever a drag does, a single pointer can do without dragging (2.5.7) | `norm` | https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html | WCAG 2.2, Dragging Movements, level AA, through its Understanding document |
| While the pointer is down the element follows it one to one, with no curve and no spring | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT; the split of a gesture in two phases is the source's frame |
| A release is finished by a spring that starts from the hand's speed, never by a keyframe animation | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| A release dismisses by distance or by speed, never by distance alone | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| A thing on its way out can be caught and dragged back | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| Past its limit a drag meets resistance and not a wall | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| What moves with a drag is computed from the drag's progress, one source | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| A thing is dismissed along the axis it entered on | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| The dragged element's own transform is written at each event, and no component state is set | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| The element's `touch-action` names the axis the drag owns | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| Under reduced motion following the pointer stays, and the fling and the bounce go | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT |
| A drag built for the page comes after the project's own component and the browser's own scrolling | `hypothesis` | `emilkowalski/skills`, `gestures/SKILL.md` | A practitioner's skill, MIT, which names its author's component; the crew's rule names the project's |

## Page, view and scroll-linked motion

The browser makes three kinds of move by itself. Each stands behind its feature test, and each is still where the test fails or the person asked for less motion.

- **A view transition** cross-fades two states of a page and carries a named element between them. Inside a surface a person works in, a change of route or of tab takes none by default: it is met too often. The thesis may name one for the steps of a flow, where direction is the purpose.
- **A scroll-driven move** takes the scroll's position as its clock. It is linear, it is small, and the reader sets the pace.
- **A reveal on entering view** plays in time, once.

A held stage uses the page's own scrolling. Nothing takes the scroll from the person.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A move that runs while the page is loading or working is CSS or the Web Animations API | `hypothesis` | `emilkowalski/skills`, `animation-performance/SKILL.md` | A practitioner's skill, MIT |
| Each element carried by a view transition has a name no other rendered element has | `platform-guidance` | MDN, "Using the View Transition API" | The browser vendors' shared documentation of the platform |
| A view transition is not the answer to a gesture: its old state takes no input | `platform-guidance` | MDN, "Using the View Transition API" | The browser vendors' shared documentation of the platform |
| The scroll's timeline is declared after the animation shorthand, which resets it | `platform-guidance` | MDN, the page on `animation-timeline` | The browser vendors' shared documentation of the platform |
| What the scroll drives is linear | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard and its film reference |
| No route or tab transition inside a surface a person works in, unless the thesis names its purpose | `hypothesis` | `emilkowalski/skills`, `remove-animations/SKILL.md` | A practitioner's skill, MIT; the default is the crew's |

## Performance

A move changes `transform` and `opacity` first. Anything else is named in the thesis and measured, as the frontend standard says. The frame time of the standard is a floor: the capture runs at sixty frames a second, and a screen that draws twice as often has half the time.

Diagnose a move that drops frames in this order: which properties it changes; whether the page is busy when it plays; whether a script sets state on every frame; whether it worsens as content grows; a custom property written on a parent every frame; a large blur. `will-change` comes last.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A move changes transform and opacity, and avoids what triggers layout or paint | `platform-guidance` | https://web.dev/articles/animations-guide | Google's web.dev guide to high-performance CSS animations |
| `will-change` is added last, on evidence, on the element that moves | `platform-guidance` | https://web.dev/articles/animations-guide | Google's web.dev guide; one set of skills asks for it on every moving element |
| A custom property written on a parent every frame restyles every descendant | `hypothesis` | `emilkowalski/skills`, `animation-performance/SKILL.md` | A practitioner's skill, MIT |
| A script sets no component state on every frame | `hypothesis` | `emilkowalski/skills`, `animation-performance/SKILL.md` | A practitioner's skill, MIT |
| A loop stops off screen and on a hidden tab | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard and its film reference |

## Reduced motion and the norms

Under reduced motion a move keeps its opacity at the same length and loses its travel, its scale and its bounce. Blur goes too. A move tied to the scroll, a pinned stage and parallax are removed, and the element stands in its final place. A group that entered in turn enters together. The setting is read while the page is open, in both directions.

The norms are the rows of `wizardingcode-frontend-visual-craft`: Pause, Stop, Hide; Three Flashes; Animation from Interactions. This skill adds no norm and repeats none.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Reduced motion is gentler, not empty: opacity and colour stay, travel goes | `hypothesis` | `emilkowalski/skills`, `emil-design-eng/SKILL.md` | A practitioner's skill, MIT; the crew's standard holds the same length |
| A choreography collapses under reduced motion: no delays, no travel | `hypothesis` | `emilkowalski/skills`, `choreograph/SKILL.md` | A practitioner's skill, MIT |
| The setting is honoured while the page is open, in both directions | `hypothesis` | `crew/references/frontend-site.md` | The crew's standard and its film reference |
| A page honours the person's setting for reduced motion | `platform-guidance` | https://web.dev/articles/prefers-reduced-motion | Google's web.dev article on `prefers-reduced-motion` |

## Review

A reviewer reads a page's motion in the order of `references/review.md` and fixes in this order: delete it; reduce it; fix its curve; fix its origin; make it interruptible; move it to the compositor; make its two phases unequal; polish; then reduced motion and whether it belongs with the rest.

Look at a move slowed down, frame by frame, and on a recording: a group that seemed fluid in the head often shows on a recording as items waiting in line. Say what code cannot judge, and name the moment to look at: whether a cross-fade reads as one thing, whether a spring's settle feels right, whether a stagger reads as one gesture.

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The first remedy is to delete the move, and the second to reduce it | `hypothesis` | `emilkowalski/skills`, `review-animations/SKILL.md` | A practitioner's skill, MIT; the order of remedies follows the source's |
| A review says what code cannot judge, and names the moment to look at | `hypothesis` | `emilkowalski/skills`, `improve-animations/SKILL.md` | A practitioner's skill, MIT |
| A move is looked at slowed down and frame by frame before it is judged | `hypothesis` | `emilkowalski/skills`, `review-animations/SKILL.md` | A practitioner's skill, MIT |

## Where the sources disagree

The crew's order holds: a norm first, then the project's `DESIGN.md`, then the frontend standard.

- **What fills the floor of eight.** One set would delete a fade on every section; the crew's grade fails a page with fewer than eight moving elements. Default: the floor stays, and the standard's order of kinds fills it; a repeated rise counts once.
- **The first row.** One set gives a press to the second row of frequency; the crew gives it to the first, with feedback. Default: the crew's table, with the rule on the keyboard beside it.
- **A route or tab change inside an app.** The standard's table allows one; one set deletes it. Default: none inside a surface a person works in, unless the thesis names its purpose.
- **The entrance curve.** Two curves that differ by a hair. Default: the standard's, one value.
- **A stronger curve for a move on screen.** One set argues that the keyword is too weak. Default: the standard's keyword, until an item on the standard changes it.
- **An exit's curve.** Two design systems and one platform example accelerate an exit; one set and the crew never do. Default: unchanged, never the accelerating keyword.
- **Length.** One set keeps interface motion under the standard's occasional row with named exceptions; the design library holds three devices longer than a site's own limits. Default: the standard's tables; a longer device is the signature, named in the thesis.
- **A drawer.** One set gives a full-width sheet a longer run on a curve of its own. Default: the standard's value, and the longer run only as a project's `DESIGN.md` override on record.
- **Bounce.** One file of one set recommends a bounce everywhere; another file of the same set allows it only after a flick. Default: none, and up to two tenths after a gesture with momentum, named in the thesis.
- **A stagger's numbers.** Four sources, four ranges. Default: the standard's two totals, with unequal gaps that shrink.
- **Reduced motion.** Opacity at the same length, a shorter fade, or no time at all. Default: the standard's, opacity at the same length; no time at all only for what the scroll drove.
- **`will-change`.** Last and on evidence, or on every moving element. Default: last and on evidence, which is the platform's own page.
- **The frame budget.** The standard's frame time, or half of it for a faster screen. Default: the standard's as the gate, said as a floor.
- **Motion built last, or with the pixels.** The build skill adds a site's reveals last; one set says motion is no layer. Default: the thesis, the signature and every gesture are decided at the direction; only their code comes last.
- **A library.** Two sets recommend their own. Default: the browser, and a library only where the project has it.

## What the team never claims

- That a move makes a page convert, feel premium or win an award. No source of this skill measured any of the three.
- That a length or a curve is right because a design system publishes it. Each is a convention, and the label says so.
- That a spring's values are physical truths. They are a practitioner's summary of talks, and the figures for a bounce after a flick were not read at their origin.
- That a move a test passed reads well. A row holds that a move is interruptible, still under reduced motion and inside the standard's lengths; whether it reads as made by hand is a person's judgement of the built page.

## What the skill refuses

- a library by default: the code of `references/recipes.md` needs the browser alone, and a dependency no project asked for stays refused.
- a reveal on every section: one entrance for the first screen, and a reveal only where the thesis names the arrival.
- parallax under reduced motion, and any move the scroll drives there.
- bounce without the thesis, and bounce on a thing no hand threw.
- hijacked scroll: a held stage uses the page's own scrolling.
- an animation on a keyboard action, a control's own key excepted.
- a count that rolls up on load, a chart that redraws from nothing, rows that animate in: data does not perform.

This skill reopens none of the ledger's refusals: a motion library by default, a reveal on every section, and scroll engines as shipped code stay refused.

## Done when

- The thesis is written: a line for each move with its five parts, and the list of what stays still.
- Every move passed the gate, and none repeats another's shape to fill the floor.
- The code comes from `references/recipes.md` or says why it does not, and every value is a token.
- Each move was fired twice fast, and seen under reduced motion and with scripts blocked.
- The review of `references/review.md` was made on the built page, and what code cannot judge was named for a person to look at.

## Provenance

`sources.md` names each source with its commit or page and its licence, the files read whole and the files not opened, which lists of this skill follow a source's order, and how the text was compared with its sources. The user's decision that brought the skill and springs on the web is D-1 of item 2026-11-19-001.
