---
name: wizardingcode-frontend-product-ui
description: "The playbook of a web app or a dashboard: what controlled experiments say of onboarding, of the size of real effects, of speed and of reading charts, and what nobody measured, each rule with its proof label, its source and what the source is."
---

# Product UI playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `product-ui`, before the direction and the first interface file, and again before any change to onboarding, to a dashboard or to how a change is measured.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. This kind has the strongest published experiments in method and the weakest in transfer:

- One paper of controlled experiments at Microsoft and Bing carries most rows. Its results come with their samples, and its own third rule is that results vary from site to site.
- One company's account of its growth tests gives figures with no sample sizes. A row from it says so.

Forms, their validation and their error messages are in `wizardingcode-frontend-screens`, and what loads first is in `wizardingcode-frontend-engineering`; no row repeats them.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of urgency, proof, a guarantee or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is activation; beside it time to value, feature adoption and retention, and never page conversion. An element inside the product is justified by a metric of the whole product, since clicks on one module can come from another.

## Onboarding and activation

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| People reach the product's value before they are asked for a sign-up: moving the sign-up after a first lesson gave "about a 20% increase in DAUs" | `hypothesis` | https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker | First Round Review's interview with Duolingo's then VP of Growth, 2017: one company's account, with no sample sizes or intervals; the rule is the research's inference from it |

## Experiments and their size

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Most experiments fail, and those that succeed "improve key metrics by 0.1% to 1.0%, once diluted to overall impact": a claimed large gain is doubted first | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | Kohavi, Deng, Longbotham and Xu, "Seven Rules of Thumb for Web Site Experimenters", KDD 2014, on Bing, where the success rate of ideas is about 10 to 20% and about one third at Microsoft overall; a figure of the paper's authors over their own experiments; that a large gain is doubted first is the research's inference: replication unknown |
| A module's click-through rate does not show that the page got better: in four experiments with 3 to 10 million users each, clicks moved between areas of the page while the abandonment rate did not change | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | The same paper, on Bing: the same result in each of its four experiments; replication unknown outside them |
| Negative feedback about a link shown in a new tab fell from 20% of messages on day one to 2% in weeks three and four, while clicks per user rose 8.9%: complaints on the first day are no evidence against a change | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | The same paper, on MSN UK in 2008, over 900,000 users; the gain in clicks was repeated by its authors on 2.7 million users in the United States in 2010, the fall of complaints is one case, and the conclusion is the research's inference |
| A change is tested alone and exposed in stages from 1%: a launch that changed many components at once made metrics fall, and its features were restored one by one to find the cause | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | The same paper, telling LinkedIn's search launch; one case: replication unknown |

## Speed

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| At Bing every 100 ms of speed-up improved revenue by 0.6% | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | The same paper, on Bing: 10% of users slowed by 100 ms and 10% by 250 ms for two weeks; the paper cites earlier results of the same direction at Bing, Amazon and Google; replication unknown outside them |

## Dashboards and charts

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A value people must compare is drawn as a position on a common scale: length is read worse, and angle and circular area significantly worse than position | `published-study` | https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf | Cleveland and McGill's ranking of 1984, repeated by Heer and Bostock (CHI 2010), the paper read: 50 subjects per chart on Mechanical Turk; the original paper was not read, and the rule is the research's inference from the ranking |
| A dashboard is for monitoring current conditions at a glance, on one screen; a display for exploratory analysis is designed differently | `hypothesis` | https://www.perceptualedge.com/blog/?p=2793 | Stephen Few's "There's Nothing Mere About Semantics", an expert's doctrine built on perception research, and no experiment |

## What the research did not find

- Empty states, progressive disclosure, onboarding checklists and tours, skeleton screens against spinners: no experiment or study with numbers was found; they remain usability doctrine.
- Benchmarks of activation and of time to value rest on search summaries, and none is given here.
- Individual interface experiments of other large products were not retrieved: their pages refused the reading.
- The same account's figures on notifications, streaks and badges are left out by the team's rule: the team builds no device to bring a person back more often.
- The inline validation study has 22 participants and one form, and no larger replication was found; its rule is in the Screens skill.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each other choice as a `hypothesis` with the metric of the whole product that would confirm it, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "Product UI"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
