---
name: wizardingcode-frontend-saas-marketing
description: "The playbook of a SaaS marketing and pricing site: the few findings the research read on showing a price, a subscription checkout and landing pages, and what it did not find on pricing-page layout, each rule with its proof label, its source and what the source is."
---

# SaaS marketing and pricing site playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `saas-marketing`, before the direction and the first interface file, and again before any change to the pricing page, the sign-up or the checkout.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. This playbook is short because the evidence is: in two rounds the research found surveys of what pricing pages do and no measurement of what a layout changes. A common practice of the kind (three plans, a highlighted middle plan, annual billing shown first) is something a visitor may recognise and nothing a source measured.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of urgency, proof, a guarantee or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is visitor-to-trial, or the demo request; beside it trial-to-paid and visitor-to-paid. The published figures on trials disagree with each other and none was read at its source, so the project's own baseline is the reference.

## Price and the pricing page

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| One Office Online page that showed the price with a strong call to action cut clicks per user by 64%, and the users who clicked converted at a much higher rate: a click on a pricing button is the wrong measure of a pricing page | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | Kohavi, Deng, Longbotham and Xu, "Seven Rules of Thumb for Web Site Experimenters", KDD 2014, on Microsoft Office Online: one company's controlled experiment on one page that showed a price, adjacent evidence and no test of a SaaS pricing page; the rule is the research's inference: replication unknown |

## Checkout

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Of 217 subscription sites 35% did not confirm the card type, 30% did not verify the card number as it was typed and 39% required an address typed by hand | `hypothesis` | https://stripe.com/guides/state-of-european-checkouts-2022 | Stripe with Edgar, Dunn & Company, "The state of European checkouts in 2022", a vendor's benchmark of sites against 26 criteria: error rates and stated intent, and no measured conversion effect |

A form this site builds, for a trial or a demo request, follows the paragraph on what a form asks in `wizardingcode-frontend-b2b-lead-gen`.

## Landing pages

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| On landing pages SaaS is one of two industries where desktop does not beat mobile in the usual way | `hypothesis` | https://unbounce.com/conversion-benchmark-report/ | Unbounce's "Conversion Benchmark Report", 2024, a vendor's observational benchmark of its own customers' landing pages: more than 57 million conversions on more than 41,000 pages |

## What the research did not find

- No published experiment or meta-analysis on pricing-page layout was found in two rounds (the number of plans, a decoy, a default annual toggle): such a layout is a hypothesis, recorded with the metric that would confirm it, plan mix and revenue per visitor.
- No trial figure is given here: the ones the research holds rest on search summaries that disagree with each other.
- A free trial against freemium: the surveys that compare them were not readable at their source.
- A demo request against self-serve sign-up: nothing with a method was found.
- Anchoring and a decoy on a real pricing page: no field experiment was found.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each choice on the pricing page's layout as a `hypothesis` with the metric that would confirm it, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "SaaS marketing and pricing site"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
