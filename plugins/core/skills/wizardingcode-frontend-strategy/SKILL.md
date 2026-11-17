---
name: wizardingcode-frontend-strategy
description: "Before the first interface file of any frontend change: declares the project's kind and primary metric, picks the kind's playbook, and records each design choice with one of five proof labels."
---

# Frontend strategy

## When

Before the first interface file, on every route, in every project with an interface. Once per project for the kind; at every change for the choices. On the standard and full routes the gate holds `process/no-kind` until the kind is recorded, and `process/no-choice` on a `surface` or `world` change with no choice recorded.

## Inputs

The request, the project's own description of itself (`README.md`, `PRODUCT.md`, `DESIGN.md`), and what `crew design <id> choice list` already holds.

## Steps

1. **Read what is recorded.** `.crew/design-project.json` holds the project's kind and metric when a session declared them. A recorded kind is kept; change it only on a fact (the product changed), with `--reason`.
2. **Declare the kind and the metric**, when none is recorded: `crew design <id> kind <kind> --metric "<text>"`. Say to the person which kind and metric you declared and from what you read it. The kind decides which playbook applies; the metric is what a choice is later measured against.

| Kind | Primary metric | What it is |
| :- | :- | :- |
| `info-product` | conversion rate per unique visitor | a sales page for an ebook, a course or another low-ticket digital good |
| `e-commerce` | conversion rate per session | a shop: home, listing, product page, cart, checkout |
| `saas-marketing` | visitor-to-trial, or the demo request | a SaaS marketing and pricing site |
| `product-ui` | activation | a web app or a dashboard people work in; never page conversion |
| `institutional` | task completion | an institutional or public sector site |
| `donations` | donation conversion | a non-profit's donation path |
| `brand` | the enquiry or contact | a brand, portfolio, agency or campaign site |
| `content-media` | page views per session | a publication |
| `mobile-app` | download-to-trial | a mobile app |
| `b2b-lead-gen` | the qualified lead | a B2B site that collects leads |

A project that fits none declares `other` with its own name: `crew design <id> kind other --name "<the kind>" --metric "<text>"`. The table's metric is a proposal: write the one the client is judged by, in their words, when they gave one.

3. **Read the kind's playbook** before the direction and the first file: `wizardingcode-frontend-ecommerce` for `e-commerce`. A kind with no playbook yet has only this skill: every choice that no norm and no platform's page carries is a `hypothesis`.
4. **Read `wizardingcode-frontend-visual-craft`** before the direction's tokens and the first interface file: each rule of type, spacing, colour, tokens, motion and copy stands there with the label a choice built on it carries.
5. **Read `wizardingcode-frontend-screens`** before the first screen of the change: each rule on states, keyboard and focus, measured accessibility, responsive layout and forms stands there with its label.
6. **Record each design choice** as you make it: `crew design <id> choice add "<choice>" --label <label>`. A design choice is anything a competent designer could have done otherwise and that the project's design contract does not already settle: the order of a page, what stands above the fold, a default, a pattern for a form, a persuasion device, a motion. A token taken from `DESIGN.md` is the contract's, not a new choice.

| Label | When | The command asks |
| :- | :- | :- |
| `norm` | a law or a standard requires it | `--source "<the norm and its clause>"` |
| `platform-guidance` | the platform's own page asks for it (Apple, Android, a browser vendor, a framework's team) | `--source "<the page>"` |
| `published-study` | a named study, benchmark of usability or meta-analysis found it | `--source "<the address>"` and `--replication "<who repeated it, or that nobody did>"` |
| `measured-here` | this site measured it | `--evidence <path>`: a file of the project with the date, the sample, the metric, the effect and its interval |
| `hypothesis` | everything else: a reasoned bet | nothing; say in the choice which metric would confirm it |

7. **Hold the three rules of the labels.**
   - A label never upgrades without a measurement. `crew design <id> choice relabel DC-n --label hypothesis --reason "<why>"` takes a label down; `--label measured-here --evidence <path>` records a measurement; the engine refuses every other move.
   - A vendor's benchmark or case study is a `hypothesis`, whatever its sample: say it as the vendor's figure. A page that collects wins says nothing of how often the same change gained nothing.
   - A published study is carried with what it is: a usability finding is a failure rate, not a lift; an observational figure is confounded; one test on another site is weak ground. In 1,001 A/B tests of one statistics platform's users the median lift was 0.08% and 33.5% of the tests had a significant result for the variant (https://blog.analytics-toolkit.com/2022/what-can-be-learned-from-1001-a-b-tests/).
8. **Measure only what the site's traffic can detect.** The median test of that set ran 30 days with about 60,000 users and could detect a 6% relative change. A site that cannot reach such a sample adopts the playbook's defaults, tests only large and structurally different variants, and never writes `measured-here` over a difference its sample cannot carry.
9. **Refuse what the team never builds.** The team never invokes dopamine, neuroscience or addiction, in a spec, a choice or a client's page. It uses what works and is lawful: social proof, scarcity and urgency only when true, and defaults that serve the user. It never builds a deceptive pattern: a false timer or stock claim, a review not checked to come from a buyer, a prior price that is not the lowest of the 30 days before the reduction, a paid ranking not disclosed. A request for one is a blocking objection of the gap round, never a choice with a label. The law in force:
   - Directive 2005/29/EC, Annex I, points 7, 11a, 23b and 23c: http://publications.europa.eu/resource/celex/02005L0029-20220528
   - Directive 98/6/EC, Article 6a: http://publications.europa.eu/resource/celex/01998L0006-20220528
10. **Keep the records clean.** The texts given to these commands land in files a project may commit: no credential, no token inside an address, no client's private name.

## Output

`.crew/design-project.json` (the engine's), `.crew/work/<id>/design/choices.json` (the engine's).

## Done when

`crew design <id> choice list` shows every choice the change made outside the contract, each with its label, and the design lint holds no `process/no-kind`, `process/no-choice` or `process/choice-evidence`. The UI/UX reviewer reads the same records under its question 12.

## Provenance

The ten kinds, the five labels and the three rules are the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1 and section 5, rules 10 to 12), the user's decisions of 2026-11-16. Each address cited here stands in `wizardingcode-frontend-ecommerce/sources.md` with the date it was read.
