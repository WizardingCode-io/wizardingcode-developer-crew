---
name: wizardingcode-frontend-visual-craft
description: "The frontend team's rules of visual craft: typography, spacing, colour, tokens, pixel precision, motion, copy and the signs of generic design, each rule with its proof label, its source and what the source is."
---

# Visual craft

## When

After `wizardingcode-frontend-strategy` and the kind's playbook, before the direction's tokens and the first interface file, and again before a change to type, spacing, colour, motion or copy.

## How to read a row

Each rule is a row: the rule, its label, its source and what the source is. The label is the one a design choice built on the rule is recorded with, unless this site measured it.

- `norm`: a standard requires it, named by its clause. It binds every project.
- `platform-guidance`: the platform's owner asks for it, on that platform.
- `published-study`: one study found it; the last cell says what is known of its replication.
- `hypothesis`: a practitioner's convention, a design system's published scale or the crew's own rule. It is a reasoned default, and no study stands behind it.

The addresses are provenance: they are recorded with a choice and never opened by the session.

What the gate enforces of these rules is in `plugins/core/skills/crew/references/gate.md`: the design lint reads the changed files as text, and `design-detect` reads them for the signs of generic design. The values the reviewer accepts are in `plugins/core/skills/crew/references/frontend.md`, and the steps that build a system of tokens are in `plugins/core/skills/wizardingcode-design-system/SKILL.md`.

## Typography

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Text resizes to 200 percent with no loss of content or function (1.4.4) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Resize Text |
| Content reflows at a width of 320 CSS px with no scrolling in two directions (1.4.10) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Reflow |
| A user's own text spacing is supported (1.4.12) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Text Spacing; the norms bound what a user may override, and none of the criteria read sets a minimum font size |
| A block of text is at most 80 characters wide where level AAA is asked (1.4.8) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Visual Presentation, level AAA |
| Body text holds 45 to 90 characters a line | `hypothesis` | https://practicaltypography.com/summary-of-key-rules.html | Butterick's summary of key rules, a practitioner's convention |
| 45 to 75 characters a line is a convention for a serifed face in one printed column | `hypothesis` | http://webtypography.net/2.1.2 | A site that quotes Bringhurst's book; it cites no study |
| In one test of news read on a screen, 95 characters a line was read fastest | `published-study` | https://web.archive.org/web/2006/http://psychology.wichita.edu/surl/usabilitynews/72/LineLength.htm | Shaikh, "The Effects of Line Length on Reading Online News", 20 students; no replication found |
| Fluid type is tested by a zoom to 200 percent with the rendered text measured: type sized in viewport units can fail 1.4.4 | `hypothesis` | https://adrianroselli.com/2019/12/responsive-type-and-zoom.html | Adrian Roselli's article, updated 2025-10-20, by which no fluid technique is yet sure to conform |
| A fluid type scale taken from a calculator is a convention, and its zoom is tested as the row above says | `hypothesis` | https://utopia.fyi/type/calculator/ | Utopia's calculator, a practitioner's tool and no study |
| A type scale is a closed set of sizes, as the design systems publish theirs | `hypothesis` | https://carbondesignsystem.com/elements/typography/overview/ | Carbon's typography overview, cited as one example of a published scale; none of those read cites a study |
| On iOS the default text size is 17 pt and the minimum 11 pt | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/typography | Apple's guidelines; their tracking table is for San Francisco alone |

## Spacing, proportion and grids

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A pointer target is at least 24 by 24 CSS px, with five exceptions (2.5.8) | `norm` | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | WCAG 2.2, Target Size (Minimum), level AA, through its Understanding document |
| On iOS a control is 44 by 44 pt by default and 28 pt at the least | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/accessibility | Apple's guidelines for iOS; it is not the norm above |
| On Android a touch target is 48 by 48 dp | `platform-guidance` | https://support.google.com/accessibility/android/answer/7101858 | Google's help page for Android accessibility |
| On Android a layout follows the window size classes | `platform-guidance` | https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes | Android's developer guide |
| Spacing is a closed scale, as the design systems publish theirs | `hypothesis` | https://carbondesignsystem.com/elements/spacing/overview/ | Carbon's spacing overview, cited as one example; no study, and the published scales disagree on their members |
| The 8-point grid is a convention: its page argues from screen sizes that divide by 8 | `hypothesis` | https://spec.fm/specifics/8-pt-grid | Bryn Jackson's "The 8-Point Grid", undated, with no study |
| The crew's own scale has a unit of 4, and the gap between groups is at least twice the gap inside one | `hypothesis` | `plugins/core/skills/wizardingcode-design-system/SKILL.md` | The crew's own file |
| Preferences for the proportions of simple figures differ from person to person | `published-study` | https://api.openalex.org/works/doi:10.1111/j.2044-8295.1980.tb01763.x | McManus, "The aesthetics of simple figures", 1980, by its abstract; replication unknown |
| Three repetitions of Fechner's experiments did not find the golden section preferred | `published-study` | https://api.crossref.org/works/10.2190/2PNH-8TT0-EMC5-FTW5 | Höge, 1997, by its abstract, which calls the hypothesis "a myth"; replication unknown |

No source read gives a numeric rule for a baseline grid.

## Colour

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Text has a contrast of 4.5:1 with its background, large text 3:1 (1.4.3) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Contrast (Minimum) |
| Non-text content has a contrast of 3:1 (1.4.11) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Non-text Contrast |
| Colour is never the only cue (1.4.1) | `norm` | https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html | WCAG 2.2, Use of Color, through its Understanding document |
| A build that passes APCA and fails 4.5:1 does not conform: APCA's levels are its author's own | `hypothesis` | https://git.apcacontrast.com/documentation/WhyAPCA.html | The APCA author's page; not a norm, and no table or level of it is taken |
| No build claims conformance to WCAG 3.0: its contrast algorithm is not yet decided | `hypothesis` | https://www.w3.org/TR/wcag-3.0/ | The Working Draft of 2026-09-10, a draft and not a norm |
| A palette is built in OKLCH where the browser has `oklch()` | `hypothesis` | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklch | MDN's reference page, which describes the function and asks for nothing: the practice is the crew's default |
| A scale of twelve steps gives each step one job | `hypothesis` | https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale | Radix Colors' page, a design system's convention |
| Building a colour system so that its steps hold contrast is one practitioner's method, taken as a convention | `hypothesis` | https://stripe.com/blog/accessible-color-systems | Stripe's "Designing accessible color systems", an account of its own system |
| On iOS a dark scheme follows the platform's own guidance | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/dark-mode | Apple's guidelines for iOS |
| Dark text on a light ground was the more legible, more so at small sizes | `published-study` | https://pubmed.ncbi.nlm.nih.gov/23654206/ | Piepenbrock and others, 2013, by its abstract; replication unknown |
| Preference and judged harmony both rose with the similarity of two hues | `published-study` | https://pubmed.ncbi.nlm.nih.gov/21264737/ | Schloss and Palmer, 2011, 48 participants; replication unknown |

The crew's probe grades contrast against a floor of 2.6:1, lower than the norm's 4.5:1: the norm is what a build is held to, and the probe's floor is a discrepancy the engine has yet to resolve.

## Design contract and tokens

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The project's design decisions live in `DESIGN.md` at its root, with its tokens in the frontmatter | `hypothesis` | `plugins/core/skills/crew/references/frontend.md` | The crew's own file, the part "Design contract" |
| A colour written outside the tokens is a defect the design lint names | `hypothesis` | `plugins/core/skills/crew/references/gate.md` | The crew's own file: the lint's rule `tokens/raw-colour` |
| Token files follow the community's format where the project's tools take it; it is cited as a community format, never as a norm | `hypothesis` | https://www.designtokens.org/tr/2025.10/format/ | "Design Tokens Format Module 2025.10", a Final Community Group Report that is not on the W3C Standards Track |
| The built output is tested, and not the token source alone: the tools' support of the format is uneven | `hypothesis` | https://styledictionary.com/info/dtcg/ | Style Dictionary's own page: support from version 4, the latest format a work in progress in version 5 |
| A token source in Tokens Studio's default is in that tool's legacy format, not the community's | `hypothesis` | https://docs.tokens.studio/manage-settings/token-format | Tokens Studio's own page: its default is still its legacy format |

No source read measures whether tokens reduce visual defects: that benefit is an inference and is recorded as a hypothesis.

## Retina and pixel precision

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| On the web a raster image is offered at more than one density, by `srcset` and `sizes` | `platform-guidance` | https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Responsive_images | MDN's guide to responsive images |
| On the web a CSS image is offered at more than one density by `image-set()` | `platform-guidance` | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/image/image-set | MDN's reference page |
| On the web a layout is written in CSS pixels; the device pixel ratio says how many device pixels one of them covers | `platform-guidance` | https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio | MDN's reference page |
| A raster is exported at 1.5 times the region it fills, with `srcset` | `hypothesis` | `plugins/core/skills/wizardingcode-design-build/SKILL.md` | The crew's own file |
| A visual comparison writes its threshold and its allowance of differing pixels in the test's configuration | `hypothesis` | https://playwright.dev/docs/api/class-pageassertions | The research's own conclusion; Playwright's page gives the facts behind it: `threshold` 0.2 by default, no default for the count of differing pixels |
| A threshold is never carried from one tool to another: their defaults are not comparable | `hypothesis` | https://www.chromatic.com/docs/threshold/ | Chromatic's own page, 0.063 by default, against Playwright's 0.2 |

The research names no norm for this subject. Text is rasterised differently by operating system and browser, so a comparison holds only against a baseline made on the same three.

## Motion

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Content that moves, blinks or updates by itself can be paused, stopped or hidden (2.2.2) | `norm` | https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html | WCAG 2.2, Pause, Stop, Hide, through its Understanding document |
| Nothing flashes more than three times in a second, or the flash stays below the threshold (2.3.1) | `norm` | https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html | WCAG 2.2, Three Flashes or Below Threshold, through its Understanding document |
| Motion an interaction starts can be switched off where level AAA is asked (2.3.3) | `norm` | https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html | WCAG 2.2, Animation from Interactions, level AAA |
| On the web a page honours the user's setting for reduced motion | `platform-guidance` | https://web.dev/articles/prefers-reduced-motion | Google's web.dev article on `prefers-reduced-motion` |
| On the web an animation is built to the browser vendor's guidance on performance | `platform-guidance` | https://web.dev/articles/animations-guide | Google's web.dev guide to high-performance CSS animations |
| On the web an interaction's responsiveness is named by Interaction to Next Paint, a field measure | `platform-guidance` | https://web.dev/articles/inp | Google's web.dev article on INP |
| On iOS motion follows the system's own conventions | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/motion | Apple's guidelines for iOS |
| Durations and easings are the frontend standard's, one value per rule | `hypothesis` | `plugins/core/skills/crew/references/frontend.md` | The crew's own file; durations are convention, and no design system read cites a study for its tokens |
| A design system's motion tokens are a published convention | `hypothesis` | https://carbondesignsystem.com/elements/motion/overview/ | Carbon's motion overview, one design system among several |
| The duration and the character of an interface animation are a practitioner's convention | `hypothesis` | https://www.nngroup.com/articles/animation-duration/ | NN/g's "Executing UX Animations: Duration and Motion Characteristics" |
| Not every interaction takes an animation | `hypothesis` | https://emilkowal.ski/ui/you-dont-need-animations | Emil Kowalski's "You Don't Need Animations", a practitioner's convention |
| In data graphics, an animated transition helped people track objects better than a static one | `published-study` | https://homes.cs.washington.edu/~jheer/files/2007-AnimatedTrans-InfoVis.pdf | Heer and Robertson, 2007, 24 subjects, on data graphics and not on interface components; replication unknown |
| A skeleton screen is not assumed to feel faster: in one agency's test it felt slowest | `hypothesis` | https://web.archive.org/web/2023/https://www.viget.com/articles/a-bone-to-pick-with-skeleton-screens/ | Viget's test, 136 people, 39 with the skeleton, not reviewed, no statistical test reported |
| The limits of 0.1, 1 and 10 seconds for a response are a convention | `hypothesis` | https://www.nngroup.com/articles/response-times-3-important-limits/ | NN/g's article, which credits Miller, 1968, and Card, Robertson and Mackinlay, 1991 |

## Interface copy

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Copy holds none of the four tells: the triplet filler, the contrast with a dash aside, the heading that announces, the empty state that explains the product | `hypothesis` | `plugins/core/skills/crew/references/frontend.md` | The crew's own file, the part "Copy" |
| A new site's whole page is written as text before any markup | `hypothesis` | `plugins/core/skills/wizardingcode-design-copy/SKILL.md` | The crew's own file |
| Every text the crew writes follows its writing standard | `hypothesis` | `plugins/core/skills/crew/references/writing.md` | The crew's own file |
| An error message says what is wrong with this input | `published-study` | https://baymard.com/blog/inline-form-validation | Baymard's usability testing of inline form validation, an observation of failures and not an experiment; replication unknown |
| A landing page's reading level is a bet: the figure of 11.1 percent for pages at a 5th to 7th grade level is Unbounce's | `hypothesis` | https://unbounce.com/conversion-benchmark-report/ | A vendor's observational benchmark, 2024 edition, a correlation on English pages alone, with financial services its stated exception |

An invented proof in copy (a testimonial, a count, a client) is a deceptive pattern: `wizardingcode-frontend-strategy` holds the rule and the law, and it is a blocking objection, never a choice with a label.

## Signs of generic design

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Every exclusion is paired with a stated direction: a ban alone moves a model to its next default | `hypothesis` | https://www.claude.com/blog/improving-frontend-design-through-skills | Anthropic's article of 2025-11-12, the lab's own account and no experiment |
| Layouts of about 10,000 websites grew more alike from 2010 to 2016, by over 30 percent, before generative tools | `published-study` | https://theconversation.com/yes-websites-really-are-starting-to-look-more-similar-136484 | Goree and others, through the article of one of its authors; replication unknown |
| Professional designers agree weakly on which design is better | `published-study` | https://arxiv.org/abs/2511.20513 | DesignPref, a preprint of 2025, by its abstract: 20 designers, Krippendorff's alpha 0.25; replication unknown |
| A model's critique of an interface is not taken as a person's | `published-study` | https://arxiv.org/abs/2407.08850 | UICrit, 2024, by its abstract: model critique not yet matching human evaluators; replication unknown |
| A page is judged preferred by a jury of several people, never by one score | `hypothesis` | https://www.awwwards.com/about-evaluation/ | Awwwards' own protocol: at least 18 jurors, the three scores furthest from the average dropped |
| A comparison of two builds is blind and pairwise | `hypothesis` | https://arena.ai/blog/webdev-arena | WebDev Arena's own protocol of blind pairwise votes |
| The reviewer names what makes a page generic by its question 11 | `hypothesis` | `plugins/core/skills/crew/rubrics/ui-ux.md` | The crew's own file |

No study read measures how alike generated sites are. The skill sets that list signs disagree on what a sign is, so a sign is a default and the direction decides.

## Where the sources disagree

The project's `DESIGN.md` wins among conventions and defaults, never below a rule labelled `norm`, never over a gate's result, and with a value looser than the frontend standard's only with the user's decision on record.

The third parties' skill sets are named here as the parties to a disagreement and no more: none of them is a source of a rule or of a default.

- **Line length**: 65 to 75, 45 to 75 and about 80 characters inside one set, under 80 in another. Default: 65 to 75 characters for body text, the frontend standard's measure.
- **Body size**: the sets give 14 to 15 px, a floor of 15 px and a floor of 16 px. Default: 16 to 20 px, the system skill's proportion.
- **Tracking floor**: one set's text and its own detector give two values. Default: none; the project's direction decides.
- **Display face**: the system's font is first in one set and a failure in another. Default: a face chosen for the subject and none the system skill refuses for display.
- **Touch target on the web**: 44 px in most sets, 24 CSS px in those that cite 2.5.8. The floor is the norm's 24 by 24 CSS px. Default: 24 px, 44 on touch, the value of `references/frontend.md`.
- **Spacing scale**: the closed scales disagree on whether 12, 20, 40 and 128 belong. Default: the system skill's scale with a unit of 4.
- **One-pixel adjustment**: one set allows a value one pixel off its scale where the eye disagrees with the measure, and another says to stay on the scale. Default: none; the project's direction decides.
- **Contrast floor**: 4.5:1 in most sets, 7:1 for body text in one, APCA with no ratio in another. Default: 4.5:1, the norm's 1.4.3 and the frontend standard's value.
- **Easing of an exit**: one set uses an ease-in curve where another forbids it. Default: the frontend standard's curve for enter and exit, and never `ease-in` on an interface.
- **Length of a UI animation**: under 300 ms in one set, 420 ms in another, up to about 500 ms for a large surface in a third. Default: the frontend standard's table, 300 ms at most for an occasional transition and nothing over 500 ms outside the motion thesis.
- **Bounce**: off by default, advisory, and recommended at 0.2, in three sets. Default: no bounce without the motion thesis, the frontend standard's rule.
- **Hover duration**: 300 ms, at most 200 ms and 120 to 180 ms in three sets. Default: 120 ms, the frontend standard's value.
- **Case of headings**: Title Case in one set's review prompt, with sentence case on marketing pages in the same set's own text, and sentence case in two other sets. Default: none; the project's direction decides, in the project's language and voice.
- **Gradient text**: required in the hero by one set and a sign of generic design in three. Default: refused, the frontend standard's interface floor, which the design lint names.
- **Icon set**: one named set is a default in one skill set and a sign in another. Default: icons from one set and never emoji, the frontend standard's rule; which set is the direction's.

## What the team never claims

- No colour is tied to conversion: the research found no study that does it.
- No animation is tied to conversion: the research found no study that links the two.
- Passing the detectors is a floor and never proof that a page is preferred.
- APCA is not a norm, and the WCAG ratio is measured first.
- Pixel perfect is claimed only as a visual regression against a baseline made on the same operating system, browser and device scale.
- The golden ratio is no evidence of what people prefer.
- A vendor's benchmark figure is a hypothesis and is never applied to copy in another language as measured.

## Done when

Every design choice the change made on type, spacing, colour, tokens, motion or copy is recorded with the label its row gives, as `wizardingcode-frontend-strategy` says, and the design lint and `design-detect` pass.

## Provenance

The eight subjects, their sources and what each source is are the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 3, the group Visual craft), from the research read on 2026-11-16. Each address cited here stands in `sources.md` beside this file with what was read of it. The third parties' skill sets of that definition are not distilled here.
