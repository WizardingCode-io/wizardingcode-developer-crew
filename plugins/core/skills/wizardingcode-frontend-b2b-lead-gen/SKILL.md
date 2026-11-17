---
name: wizardingcode-frontend-b2b-lead-gen
description: "The playbook of a B2B site that collects leads: the base rate of form tests, what a form asks and why, and what the research did not find, each rule with its proof label, its source and what the source is."
---

# B2B lead generation playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `b2b-lead-gen`, before the direction and the first interface file, and again before any change to a lead form or to the page that carries it.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. The evidence of this kind is single tests and one base rate, all from vendors or from a roundup, so every row is a `hypothesis` said for what it is. What the rows agree on is the measure: a form is judged by the leads that qualify, and a rate of submissions does not show that.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of urgency, proof, a guarantee or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is the qualified lead; beside it visitor-to-lead, lead-to-opportunity and opportunity-to-close. Published rates by sector differ in their definitions and were read through roundups alone, so no target rate is given here.

## Forms

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A form test starts from this base rate: 12% won, 70% showed no measurable change and 17% lost, at a median of 1,420 visitors per variant, so only large effects could be seen | `hypothesis` | https://www.mida.so/change-types/form | Mida's "Do form A/B tests work? 50+ tests measured", a vendor's count of the tests on its own platform |
| A shorter form can lower the quality of the leads, which a conversion goal does not show | `hypothesis` | https://www.mida.so/change-types/form | The same page's own warning, a vendor's |
| A test judged on a proxy goal, a click or a scroll, wins more often than one judged on a business outcome: 13% against 9% | `hypothesis` | https://www.mida.so/change-types/form | The same page, a vendor's |
| Fewer fields do not always convert better: removing fields cost one client 14%, and in one case a form of 15 fields beat a control of 11 by 109% | `hypothesis` | https://ventureharbour.com/how-form-length-impacts-conversion-rates/ | Venture Harbour's "How form length impacts conversion rates", a secondary roundup of single tests; the tests themselves were not read |

The row on the quality of leads is a caution on what a test's goal shows and no leave to add a field: every field a lead form asks has a use the project names, and the person sees why it is asked; nothing about the person is collected that the form does not show them; a change that adds a personal datum to a form is a personal-data change the security review reads.

A form's steps, its labels and its validation are in `wizardingcode-frontend-screens`; no row repeats them.

## Traffic

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| On landing pages LinkedIn traffic converted 4 to 5 times worse than Facebook and Instagram traffic | `hypothesis` | https://unbounce.com/conversion-benchmark-report/ | Unbounce's "Conversion Benchmark Report", 2024, a vendor's observational benchmark of its own customers' landing pages: more than 57 million conversions on more than 41,000 pages |

## What the research did not find

- A form in several steps against one page: the figures that circulate have no stated method, and no experiment was found.
- The large dataset on which types of field lower conversion was not read at its source.
- Rates of visitor-to-lead by sector rest on roundups whose definitions differ, and none is given here.
- A demo request form against self-serve sign-up: nothing with a method was found.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each other choice as a `hypothesis` with the metric that would confirm it, every field of a form has its use and its reason shown, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "B2B lead generation"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
