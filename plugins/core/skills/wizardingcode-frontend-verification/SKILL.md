---
name: wizardingcode-frontend-verification
description: "The frontend team's verification rules: what the gate measures and what stays a reviewer's or a jury's judgement, the tools' own defaults, a new site's chain of design skills, critique, the jury and the galleries' terms, each rule with its proof label, its source and what the source is."
---

# Verification

## When

After `wizardingcode-frontend-strategy`, before the first gate run of the change, and again before a comparison of pictures, a review of a new site or a claim that people prefer a page.

## How to read a row

Each rule is a row: the rule, its label, its source and what the source is. The label is the one a design choice built on the rule is recorded with, unless this site measured it.

- `published-study`: one study found it; the last cell says what is known of its replication.
- `hypothesis`: a testing tool's own statement of its default, a team's published process, a jury's own protocol, a gallery's terms as the research read them, a vendor's eval, one person's measurement, or the crew's own rule. A tool's default is a fact about the tool and no value to take.

This group has no norm and no platform's guidance: a testing tool is no platform the product runs on.

The addresses are provenance: they are recorded with a choice and never opened by the session.

How each gate behaves is in `plugins/core/skills/crew/references/gate.md`.

## Component library, visual tests and enforcement

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Accessibility and visual regression are this team's subjects: the QA team's definition leaves them to the frontend team | `hypothesis` | `docs/specs/2026-11-15-qa-team-design.md` | The crew's own file, its section 3 |
| Chromatic's server enters only where the project already uses Chromatic, and always in read-only mode | `hypothesis` | `docs/specs/2026-11-15-qa-team-design.md` | The crew's own file, its section 5, rule 3; its row on Chromatic says the server has no read-only mode of its own, reading alone being obtained when an owner, on a Team or an Enterprise plan, sets the one tool that writes to "Blocked" |
| Storybook's server stands among what the QA team's definition left out, named there as the frontend team's subject | `hypothesis` | `docs/specs/2026-11-15-qa-team-design.md` | The crew's own file, its section 5, under "Left out" |
| What can be measured is enforced by a gate, and taste is judged against the client's direction | `hypothesis` | `docs/specs/2026-11-16-frontend-team-design.md` | The crew's own file, the team's definition, section 5, rule 9 |
| The detector of generic design is the built-in gate `design-detect`, planned right after the design lint when the change holds an interface file that exists | `hypothesis` | `plugins/core/skills/crew/references/gate.md` | The crew's own file, its section on that gate |
| The design lint decides from text alone, in the changed interface files, as a built-in gate; what needs a browser, a computed value or a design judgement is the reviewer's | `hypothesis` | `packages/engine/src/design-lint.ts` | The crew's own file |
| A new site's page is held to limits read from the numbers of the crew's Playwright fixture, each offence with its rule id | `hypothesis` | `packages/engine/src/design-grade.ts` | The crew's own file; the in-page measurements are `plugins/core/e2e/measure.mjs` |
| A site must differ from every earlier one on at least four of six dimensions: display, body, palette, sections, hero and motion | `hypothesis` | `packages/engine/src/design.ts` | The crew's own file |
| A region of a built page more than 8 percent from the approved comp is an offence | `hypothesis` | `packages/engine/src/design.ts` | The crew's own file, the comp path's tolerance |
| Built sites are compared pair by pair on the six dimensions and each against its proportion limits, measured in a real browser | `hypothesis` | `scripts/site-distinctness.ts` | The crew's own file |
| Playwright's screenshot assertion has a `threshold` of 0.2 by default, a colour difference in the YIQ space, and states no value for `maxDiffPixels` or `maxDiffPixelRatio` | `hypothesis` | https://playwright.dev/docs/api/class-pageassertions | Playwright's API page for page assertions, the tool's own statement of its defaults, which says the two are "configurable with `TestConfig.expect`" |
| Rendering varies with the host's system, version, settings and hardware, and the `maxDiffPixels: 100` on that page is an example | `hypothesis` | https://playwright.dev/docs/test-snapshots | Playwright's "Visual comparisons", the tool's own page |
| pixelmatch's `threshold` is 0.1 by default, and its README now says it compares in the OKLab space and does not mention YIQ, while Playwright, which uses pixelmatch, still describes YIQ | `hypothesis` | https://raw.githubusercontent.com/mapbox/pixelmatch/main/README.md | pixelmatch's README on its main branch, the tool's own page; which pixelmatch version changed the measure and which one Playwright bundles is to be checked |
| Chromatic's default threshold for changes is .063 | `hypothesis` | https://www.chromatic.com/docs/threshold/ | Chromatic's "Threshold for changes", the tool's own page |
| That a skill was never invoked in 56 percent of eval cases, and that every test passed with a documentation index in `AGENTS.md`, is a vendor's eval | `hypothesis` | https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals | Vercel's "AGENTS.md outperforms skills in our agent evals", of 2026-01-27: a vendor's eval on Next.js APIs and not on design, which gives no count of cases and no model |
| Skill activation of 50 to 55 percent with no hook and 100 percent with a hook that forces an evaluation step is one person's measurement | `hypothesis` | https://scottspence.com/posts/measuring-claude-code-skill-activation-with-sandboxed-evals | Scott Spence's "Measuring Claude Code Skill Activation With Sandboxed Evals": 22 prompts and two runs with Sonnet 4.5 and four Svelte skills, and 75 percent with that hook on 24 harder prompts |

The three tools' defaults are not comparable, and no page read recommends a value: the team compares a picture with an approved one at a fixed tolerance, whose value the item that builds the comparison sets. The crew's own values in the rows above are rules of the crew's files and stay as they are.

## New sites

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A new site has a creation process the engine requires: six skills of the crew's own | `hypothesis` | `docs/adr/0018-a-new-site-has-a-creation-process-the-engine-requires.md` | The crew's own file, ADR 0018 |
| The brief decides the surface and how much to invent, and writes each section as a claim with its proof | `hypothesis` | `plugins/core/skills/wizardingcode-design-brief/SKILL.md` | The crew's own file |
| The direction excludes the category's obvious page and deals directions from the library | `hypothesis` | `plugins/core/skills/wizardingcode-design-direction/SKILL.md` | The crew's own file |
| The copy is the whole page as plain text, written before any markup | `hypothesis` | `plugins/core/skills/wizardingcode-design-copy/SKILL.md` | The crew's own file |
| The system turns the direction into tokens | `hypothesis` | `plugins/core/skills/wizardingcode-design-system/SKILL.md` | The crew's own file |
| The build is made from the contract, with captures that prove it | `hypothesis` | `plugins/core/skills/wizardingcode-design-build/SKILL.md` | The crew's own file |
| The review reads the captures with no inherited context, in fourteen passes and a score, and a site under its bar is not proven: the references' level on each dimension where the user approved references for it, 8.5 overall where there are none | `hypothesis` | `plugins/core/skills/wizardingcode-design-review/SKILL.md` | The crew's own file |
| The finish review of a new site judges only the captures and holds the change to its contract, promise by promise | `hypothesis` | `plugins/core/skills/crew/rubrics/design-finish.md` | The crew's own file, the finish rubric |
| One model's verdict counts as one juror's | `hypothesis` | `docs/specs/2026-11-16-frontend-team-design.md` | The crew's own file, the team's definition, section 5, rule 9, where it is the session's reading from the research |
| A single evaluator found about 35 percent of the usability problems, over six projects, and three to five evaluators are recommended | `published-study` | https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/theory-heuristic-evaluations/ | Jakob Nielsen's "Theory behind heuristic evaluations"; that the figures are the author's own measurements is this page's reading of the row, and replication is unknown, the research naming none |
| A single evaluator's severity ratings are "too unreliable to be trusted" | `hypothesis` | https://www.nngroup.com/articles/how-to-rate-the-severity-of-usability-problems/ | NN/g's "Severity Ratings for Usability Problems", a practitioner's page |
| Evaluators work apart until each is done | `hypothesis` | https://www.nngroup.com/articles/how-to-conduct-a-heuristic-evaluation/ | NN/g's "How to Conduct a Heuristic Evaluation", a procedure |
| Twenty professional designers agreed at Krippendorff's alpha 0.25 on binary preference | `published-study` | https://arxiv.org/abs/2511.20513 | "DesignPref: Capturing Personal Preferences in Visual Design Generation", a preprint, read by its abstract; replication unknown, the research naming none |
| One jury's published form weighs design 40, usability 30, creativity 20 and content 10, with at least 18 jurors and the 3 scores furthest from the average dropped | `hypothesis` | https://www.awwwards.com/about-evaluation/ | Awwwards' "About evaluation", a jury's own protocol |
| Refero's terms allow design research and internal reference and forbid scraping and model training, evaluation and dataset creation | `hypothesis` | https://doc.refero.design/legal/terms-of-use | Refero's "Terms of Use", as the research read them on 2026-11-16 |
| Mobbin's terms forbid the unauthorised use of scrapers and, without permission, the use of AI or machine-learning tools to make derivative works or to train or improve models | `hypothesis` | https://mobbin.com/terms.md | Mobbin's "Terms of Service", as the research read them on 2026-11-16, through a summary and not at the page itself |
| Behance stands under Adobe's general terms, which forbid data mining and use to "create, train, test, or otherwise improve" a model | `hypothesis` | https://www.adobe.com/legal/terms.html | Adobe's "General Terms of Use", as the research read them on 2026-11-16 |
| For Godly no terms page was found; its robots file carries `ai-train=no` and `use=reference` and reserves rights under Article 4 of Directive (EU) 2019/790 | `hypothesis` | https://godly.website/robots.txt | Godly's robots file, as the research read it on 2026-11-16; a robots file and no terms page |
| Of three whole sites built on the design skills none reached 8.5: the scores were 7.5 and 7.8 at best, with one run per case and one site timing out before its review | `hypothesis` | `docs/evals/2026-10-31-site-results.md` | The crew's own file, the record of finding 210 |

Critique as teams publish it, each a published process: Figma's design team on its design critiques (https://www.figma.com/blog/design-critiques-at-figma/) and Linear's "Manage design projects" (https://linear.app/method/manage-design-projects).

UIClip's designers, by the research's reading, reached alpha 0.37 on 10 shared pairs [source?]: the research gives no address for it.

The session opens no gallery and drives no browser against one: the study of a gallery is a person's, through the gallery's own interface; what reaches the session is a written observation of the crew's own with the original site's link; no capture is copied, nothing is scraped, and nothing is used to train or score a model; and a gallery's terms as they stand on the day win over what this page says of them. The crew's design library (`plugins/core/design/library/`) has not been checked against this rule: the definition leaves that check to the building item, and it is still owed.

## What is not decided

- The tolerance of the screenshot comparison and where the project writes it are fixed by the item that builds the comparison, and no value stands on this page.
- The jury's protocol (how many jurors, the blind pairing, how outliers are treated) is the user's to say.
- Whether the QA team's definition takes Storybook's server is not decided here.
- Which measure pixelmatch uses in the version Playwright bundles is to be checked before a value is carried from one tool to another.
- A session that meets one of these fixes none of them: it asks the user or leaves the value to the item its line names, records the answer it is given and no choice of its own, and until there is an answer writes no value and claims nothing that rests on it; a tool's default is no answer.

## What the team never claims

- One model's verdict counts as one juror's and is never called a jury's.
- The review's 8.5 is one model's reading of the captures and no proof that a person prefers the page. The figures set against references are the same one reader's, of the references and of the site.
- The defaults of Playwright, pixelmatch and Chromatic are never compared as one scale, and no page read recommends a value.
- A figure on how often a skill is invoked is a vendor's eval or one person's measurement and is never quoted as the crew's rate.
- The chain of the six design skills is not proven on a whole site until the run on a real project with a blind jury: no site of three reached 8.5.

## Done when

The gates ran on the change, every claim the session makes of the page says who judged it (a gate, a reviewer, one model or people), no value this page leaves open was fixed by the session, and each choice is recorded with the label its row gives, as `wizardingcode-frontend-strategy` says.

## Provenance

The two subjects, their sources and what each source is are the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 3, the group Verification), from the research read on 2026-11-16. Each address cited here stands in `sources.md` beside this file. The third parties' skill sets of that definition are not distilled here.
