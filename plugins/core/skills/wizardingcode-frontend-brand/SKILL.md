---
name: wizardingcode-frontend-brand
description: "The playbook of a brand, portfolio, agency or campaign site: three adjacent findings, each said as adjacent, and what the research did not find for this kind, each rule with its proof label, its source and what the source is."
---

# Brand, portfolio, agency and campaign playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `brand`, before the direction and the first interface file.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. This playbook is short because the evidence is: after two rounds the research found no experiment on a site of this kind. Its three rows come from neighbouring kinds of site, and each says which. Every design claim about a site of this kind is a `hypothesis`, recorded with what would confirm it.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of proof, a goal, a prompt or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is the enquiry or contact, for an agency or a portfolio; for a brand or a campaign it is recall and engagement. An award, time on site and scroll depth are activity and no outcome.

## What transfers from neighbouring kinds

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A redesign of a page moved revenue per visitor by +0.2% on average, a change of colour by 0.0% and a change of images by -0.2%: by that evidence a visual redesign is close to neutral on sales | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Browne and Swarbrick Jones (Qubit, 2017): 83 treatments of redesign, with a 59% probability of any positive effect, in retail and travel, adjacent evidence and no test of a brand site; one vendor's clients, the method assured by PwC; the conclusion is the research's inference, and it is no proof that a redesign is safe; replication unknown |
| A visitor of a company's site looks for what the firm does, who the people are, proof from third parties and how to get in touch; stock photography and vague copy lower trust | `published-study` | https://www.nngroup.com/articles/about-us-information-on-websites/ | NN/g's "'About Us' Information on Websites", 2019: three rounds, over 70 users, 100 sites tested and 65 reviewed; a usability finding, with no success rates reported; adjacent evidence, of company pages in general; replication unknown outside the group's own rounds |
| On one university's home page about 1% of visitors clicked a feature in the carousel, and 84% of those clicks were on the first slide | `hypothesis` | https://erikrunyon.com/2013/01/carousel-stats/ | Erik Runyon's "Carousel Interaction Stats", 2013: one site's own count, adjacent evidence; the rules of a carousel are in the e-commerce playbook |

A contact form asks only what has a use the person sees: the paragraph on what a form asks is in `wizardingcode-frontend-b2b-lead-gen`.

## What the research did not find

- No published experiment and no independent benchmark was found for this kind in two rounds.
- By the research's reading, awards, time on site and scroll depth are not outcomes, and no source ties them to sales.
- The one study of a brand site's effect on brand measures that the research met is a vendor's single case, known by a search result alone.
- No benchmark of enquiry rates for portfolio or agency sites was read.

## Done when

Each choice of the change is recorded as a `hypothesis` with what would confirm it (enquiries per visit and their quality, or a brand measure taken with a group that saw the site and one that did not), unless a row carries it, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "Brand, portfolio, agency and campaign"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
