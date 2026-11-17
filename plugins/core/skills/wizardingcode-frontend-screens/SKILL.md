---
name: wizardingcode-frontend-screens
description: "The frontend team's rules for a screen: its states, keyboard and focus, measured accessibility, responsive layout and forms, each rule with its proof label, its source and what the source is."
---

# Screens

## When

After `wizardingcode-frontend-strategy`, before the first screen of the change, and again before a change to a form, to the focus order or to a breakpoint.

## How to read a row

Each rule is a row: the rule, its label, its source and what the source is. The label is the one a design choice built on the rule is recorded with, unless this site measured it.

- `norm`: a standard or a law requires it, named by its clause or its article. It binds every project it covers.
- `platform-guidance`: the platform's owner asks for it, on the platform the rule names.
- `published-study`: one study, benchmark or test found it; the last cell says what is known of its replication.
- `hypothesis`: a practitioner's convention, a design system's value, a tool's stated fact, a vendor's figure or the crew's own rule. It is a reasoned default, and no study stands behind it.

The addresses are provenance: they are recorded with a choice and never opened by the session.

What the gate enforces of these rules is in `plugins/core/skills/crew/references/gate.md`. The values the reviewer accepts are in `plugins/core/skills/crew/references/frontend.md`, and its questions in `plugins/core/skills/crew/rubrics/ui-ux.md`.

## Screens and states

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Every control has its hover, focus-visible, active, disabled, loading, error, empty and success state where the page can reach it | `hypothesis` | `plugins/core/skills/crew/references/frontend.md` | The crew's own file, the parts "Interface floor" and "States" |
| Every state a person can reach on a screen is declared before any capture and shown in one | `hypothesis` | `plugins/core/skills/crew/rubrics/ui-ux.md` | The crew's own file, question 2 of the UI/UX rubric |
| A response has three limits, about 0.1 s, 1 s and 10 s, and a wait above about 10 seconds gets a percent-done indicator | `hypothesis` | https://www.nngroup.com/articles/response-times-3-important-limits/ | NN/g's article: guidance drawn from early research on interactive systems, and no web experiment |
| The main content loads first: a delay of 250 ms on a secondary pane had no detectable effect | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | Kohavi, Deng, Longbotham and Xu, KDD 2014, on Bing's right-hand pane with almost 20 million users; one company's experiments, and the paper's third rule says a result does not transfer between sites |
| The ten usability heuristics are expert doctrine: a choice that rests on one of them is a hypothesis | `hypothesis` | https://www.nngroup.com/articles/ten-usability-heuristics/ | Jakob Nielsen's "10 Usability Heuristics for User Interface Design", a practitioner's convention with no experiment behind it |
| A loading indicator waits about 150 to 300 ms before it shows and then stays about 300 to 500 ms | `hypothesis` | https://vercel.com/design/guidelines | Vercel's "Web Interface Guidelines", a practitioner's page; a convention |

For empty states, progressive disclosure, onboarding checklists and tours, and skeleton screens against spinners, the research found no experiment or study with numbers: a choice that rests on them is recorded as a `hypothesis`. The pack's checklist for a screen is `packs/frontend/checklists/screen.md`.

## Keyboard and focus

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A change is operable by keyboard (2.1.1), with no keyboard trap (2.1.2), in a sensible focus order (2.4.3) and with the focus visible (2.4.7) | `norm` | `plugins/core/skills/crew/references/frontend.md` | WCAG 2.2 criteria the crew's own file lists by number; not read again at the W3C's page |
| A control that has the focus is not obscured (2.4.11, level AA) | `norm` | https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ | WCAG 2.2, Focus Not Obscured (Minimum), as the W3C's "What's New in WCAG 2.2" gives it |
| Where level AAA is asked, the focus indicator is at least as large as a 2 CSS px perimeter, with 3:1 between the focused and the unfocused state (2.4.13) | `norm` | https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ | WCAG 2.2, Focus Appearance, level AAA alone, as the same page gives it |
| On iOS and on macOS a standard keyboard shortcut keeps its standard action, and Full Keyboard Access is supported | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/keyboards | Apple's guidelines, "Keyboards", a page for Apple's platforms: the definition's row names none of them for it |
| On macOS every command stands in the menu bar and the app works by keyboard alone | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/designing-for-macos | Apple's guidelines, "Designing for macOS" |
| One design system draws its focus indicator 3 px thick with an outer offset of 2 px | `hypothesis` | https://github.com/material-components/material-web/blob/main/tokens/versions/latest/sass/_md-sys-state-focus-indicator.scss | Material's token file: one design system's value and no norm |
| The focus ring is styled on `:focus-visible` and not on `:focus`, so that a click with a pointer draws no ring | `hypothesis` | https://vercel.com/design/guidelines | Vercel's "Web Interface Guidelines", a practitioner's page; a convention |
| A focus ring drawn with `box-shadow` follows the control's radius | `hypothesis` | https://interfaces.rauno.me/ | Rauno Freiberg's "Web Interface Guidelines", a practitioner's page; a convention |

The 2 px perimeter is a norm at level AAA alone, and the ring of 3 px is one design system's value. No tool judges whether a focus order is logical: that is the research's own reasoning and no cited finding. The research did not read the authoring practices for ARIA nor the practice of testing with a screen reader, and this page takes no fact from them.

## Measured accessibility

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Text has a contrast of 4.5:1 with its background, large-scale text 3:1 (1.4.3) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Contrast (Minimum); the Recommendation of 2023-10-05, updated 2024-12-12, built to at level AA |
| Non-text content has a contrast of 3:1 (1.4.11) | `norm` | https://www.w3.org/TR/WCAG22/ | WCAG 2.2, Non-text Contrast |
| A pointer target is at least 24 by 24 CSS px, with five exceptions (2.5.8) | `norm` | https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html | WCAG 2.2, Target Size (Minimum), through its Understanding document |
| A product placed on the market or a service provided to consumers after 28 June 2025, e-commerce services among them, is covered by the European Accessibility Act (Article 2) | `norm` | http://publications.europa.eu/resource/celex/32019L0882 | Directive (EU) 2019/882, at its official text; Portugal's Decreto-Lei n.º 82/2022 transposes it and excludes microenterprises that provide the services |
| EN 301 549 uses WCAG 2.2 in its 2026 version, by the W3C's own sentence | `hypothesis` | https://www.w3.org/WAI/standards-guidelines/wcag/ | The W3C's "WCAG 2 Overview"; EN 301 549 itself was not read |
| No build claims conformance to WCAG 3: its own introduction calls the draft incomplete | `hypothesis` | https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/ | The W3C's "WCAG 3 Introduction", on the Working Draft of September 2026: "an incomplete draft that will change" |
| In axe-core a result marked `incomplete` is one the tool could not decide, and its rule `target-size` is off by default | `hypothesis` | https://raw.githubusercontent.com/dequelabs/axe-core/develop/doc/rule-descriptions.md | axe-core's own rule descriptions; the tool is MPL-2.0 |
| Lighthouse's accessibility score is a weighted average of audits that each pass or fail | `hypothesis` | https://developer.chrome.com/docs/lighthouse/accessibility/scoring | Chrome's own page on the score |
| An automated tool finds a part of the barriers: axe found 29 percent of 142 planted ones | `published-study` | https://alphagov.github.io/accessibility-tool-audit/ | The UK government's "Accessibility tool audit" of 2018; replication unknown |
| That automated testing finds 57 percent of issues by volume is a vendor's figure on its own audit data | `hypothesis` | https://www.deque.com/blog/automated-testing-study-identifies-57-percent-of-digital-accessibility-issues/ | Deque's post of 10 March 2021, which does not say when the data was collected; no independent replication in the research |
| No detected error does not mean a page is accessible or conformant | `hypothesis` | https://webaim.org/projects/million/ | "The WebAIM Million", which says so of its own method |
| On iOS a touch target is 44 pt | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/accessibility | Apple's guidelines, "Accessibility", which the definition's row on spacing gives for iOS; it is not the norm of 24 CSS px |
| On Android a touch target is 48 by 48 dp | `platform-guidance` | https://support.google.com/accessibility/android/answer/7101858 | Google's help page, "Touch target size" |
| A target of 44 px on the web is a design system's convention | `hypothesis` | https://fluent2.microsoft.design/layout | Fluent 2's "Layout", a published value and no norm |

The gate enforces the automated run, and its result is a floor.

## Responsive

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Every changed page holds at 360, 768 and 1280, at 320 when it has a form or a table, and in the dark scheme when the project has one | `hypothesis` | `plugins/core/skills/crew/references/frontend.md` | The crew's own file, the part "Responsive", with question 7 of the UI/UX rubric |
| Content reflows at a width of 320 px (1.4.10) | `norm` | `plugins/core/skills/crew/references/frontend.md` | A WCAG 2.2 criterion the crew's own file names; not read again at the W3C's page |
| On the web a full-height layout on a phone takes the small, large or dynamic viewport units in place of `100vh` | `platform-guidance` | https://web.dev/blog/viewport-units | web.dev's "The large, small, and dynamic viewport units" |
| The safe-area insets are read through `env()`; the keyboard insets belong to an API of limited availability | `hypothesis` | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env | MDN's reference page, which describes the variables and marks the VirtualKeyboard API experimental |
| On the web zoom stays enabled: `user-scalable=no` harms low-vision users | `platform-guidance` | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/viewport | MDN's page on the viewport meta element, which adds that WCAG requires a minimum of 2× scaling |
| The `hover` and `pointer` media features test the primary input | `hypothesis` | https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/hover | MDN's reference page, which describes the features |
| On iOS a layout is decided by size classes, not by the device's type or orientation | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/layout | Apple's guidelines, "Layout" |
| On Android a layout follows five width classes, cut at 600, 840, 1200 and 1600 dp | `platform-guidance` | https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes | Android's "Use window size classes" |
| One design system's breakpoints are 320, 672, 1056, 1312 and 1584 px | `hypothesis` | https://carbondesignsystem.com/elements/2x-grid/overview/ | Carbon's 2x Grid; the design systems' breakpoints differ and none is a norm |
| Another's are 320, 544, 768, 1012, 1280 and 1400 px | `hypothesis` | https://primer.style/product/getting-started/foundations/layout/ | Primer's "Layout foundations", from a page read in part |
| A framework's defaults are 640, 768, 1024, 1280 and 1536 px | `hypothesis` | https://tailwindcss.com/docs/theme | Tailwind CSS 4's theme variables |

The team never disables zoom. Size container queries are Baseline widely available since 2025-08-14, by the platform's status data as the research read it on 2026-11-16.

## Forms

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A form asks for no redundant entry (3.3.7, level A) | `norm` | https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ | WCAG 2.2, Redundant Entry, as the W3C's "What's New in WCAG 2.2" gives it |
| Signing in asks no cognitive test without an alternative (3.3.8, level AA) | `norm` | https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/ | WCAG 2.2, Accessible Authentication (Minimum), as the same page gives it |
| In one small test, validating a field after the person leaves it was faster than validating while they type, and inline validation beat validation on submit | `published-study` | https://alistapart.com/article/inline-validation-in-web-forms/ | Luke Wroblewski with Etre, A List Apart, 2009: 22 users and one registration form, a success rate 22% higher and a completion time 42% lower for the best inline version; no larger replication found |
| In Baymard's usability testing the pattern that worked validates a field when the person leaves it, rechecks it on every keystroke once an error shows, and clears the error when the input is valid | `published-study` | https://baymard.com/blog/inline-form-validation | Baymard's "Usability Testing of Inline Form Validation", usability testing by a vendor of research; replication unknown |
| Baymard counts 14.88 form fields in the average US checkout and sets its own ideal at 7 to 8 | `hypothesis` | https://baymard.com/lists/cart-abandonment-rate | Baymard's "Cart Abandonment Rate Statistics": a vendor's benchmark, and the ideal is the vendor's |
| One question per page is the starting point for a form | `hypothesis` | https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/ | "One thing per page", GOV.UK Design Notes: public-sector guidance, whose author says no quantitative data can be shared |
| The count of fields is not monotonic: in one reported test a form of 15 fields beat a control of 11 | `hypothesis` | https://ventureharbour.com/how-form-length-impacts-conversion-rates/ | Venture Harbour's roundup of single tests, each reported second hand |
| Paste is never blocked in an input or a text area | `hypothesis` | https://vercel.com/design/guidelines | Vercel's "Web Interface Guidelines", a practitioner's page; a convention |
| The submit button stays enabled until the submission begins | `hypothesis` | https://vercel.com/design/guidelines | Vercel's "Web Interface Guidelines", a practitioner's page; a convention |
| An error is shown beside the field it belongs to | `hypothesis` | https://vercel.com/design/guidelines | Vercel's "Web Interface Guidelines", a practitioner's page; a convention |
| An input's font is at least 16 px on mobile | `hypothesis` | https://vercel.com/design/guidelines | Vercel's "Web Interface Guidelines", a practitioner's page; a convention |

The figures of the 2009 test are one small test's and are never promised to a client.

## Where the sources disagree

The project's `DESIGN.md` wins among conventions and defaults, never below a rule labelled `norm`, never over a gate's result, and with a value looser than the frontend standard's only with the user's decision on record.

Skill sets of third parties are parties to one disagreement below and no more: none of them is a source of a rule or of a default.

- **Touch target on the web**: 24 CSS px by the norm (2.5.8), 44 px by a design system and by most skill sets, 44 pt and 48 dp on the two mobile platforms. The floor is the norm's 24 by 24 CSS px. Default: 24 px, 44 on touch, the value of `references/frontend.md`.
- **Focus indicator**: a 2 CSS px perimeter at level AAA, a ring of 3 px in one design system. Default: a focus ring from the tokens, never removed without a replacement, the rule of `references/frontend.md`.
- **Breakpoints**: three published sets of breakpoints differ and none is a norm. Default: the project's own breakpoints; every changed page is checked at 360, 768 and 1280, the widths of `references/frontend.md`.
- **Focus after a failed submit**: the first field in error in one skill set, an error summary in another. Default: none; the project's direction decides.

## What the team never claims

- A run of the automated checks with no violation is a floor and never proof of accessibility.
- The figures of one small study of inline validation are never quoted as a promise.
- A vendor's figure for what automated testing finds is the vendor's.
- An experiment of one company on its own site does not transfer to another site.
- Fewer form fields is not always better.
- No experiment with numbers was found for empty states, progressive disclosure, onboarding tours or skeleton screens against spinners: a choice that rests on them is a hypothesis.

## Done when

Every choice the change made on a state, on focus, on a target, on a breakpoint or on a form is recorded with the label its row gives, as `wizardingcode-frontend-strategy` says, every state the change adds is declared and captured, and the gates pass.

## Provenance

The five subjects, their sources and what each source is are the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 3, the group Screens), from the research read on 2026-11-16. Each address cited here stands in `sources.md` beside this file with what was read of it. The third parties' skill sets of that definition are not distilled here.
