---
name: wizardingcode-frontend-info-product
description: "The playbook of a sales page for an info product: what was measured on copy length, video, added offers, proof and traffic, and what was not, each rule with its proof label, its source and what the source is."
---

# Info-product sales page playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `info-product`, before the direction and the first interface file, and again before any change to the page's length, its video, its offer or its proof.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. The evidence of this kind is thin, and the rows say so:

- The published experiments on sales pages are three small tests of 2004. Two more experiments are from donation pages, a neighbouring kind, and each row from one says so. On video the two results read point opposite ways.
- A vendor's benchmark or case study says what its own customers' pages did, with no control group. It is a typical range and never a predicted lift.

Read together: the page's length, its video and its offer are choices to test on this product, with revenue and refunds beside conversion.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of urgency, proof, a guarantee or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is conversion rate per unique visitor, then revenue per visitor and refund rate. A benchmark of landing pages gives a typical range and never a target: the traffic channel dominates the one benchmark read, so the project's own baseline is the reference.

## Copy length

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| In the three tests of 2004 the longer page led for one paid health product; the authors themselves say the periods were too short to rule out noise, and in the third test both versions lost money: the length of the copy is tested per product | `published-study` | https://marketingexperiments.com/?p=22175 | MarketingExperiments, "Long Copy vs. Short Copy", 2004: one health-retail product on AdWords traffic, three tests of 5 to 8 days, conversion between 0.18% and 0.69%; by the research's own arithmetic each arm had roughly 3 to 12 orders; that length is tested per product is the research's inference; replication unknown |
| Conversion is read with revenue and the average order: a long-form appeal cut conversion by 37.8% and raised the average gift by 61.3%, revenue differing by -0.6% | `hypothesis` | https://www.nextafter.com/?p=16052 | NextAfter experiment #12712, 2019, on a donation page, a neighbouring kind: n=472, 94.8% confidence, marked not valid by NextAfter, so it carries no study's label; the rule is the research's inference |

## Video

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A short video in the place of a long sales letter is one seller's result on clicks to the next step and not on sales: +46.15%, and the letter put back under the video cut those clicks by 35% | `hypothesis` | https://wingify.com/resources/case-studies/sixpackabsexercises-used-videos-increased-conversions/ | Wingify's case study, a vendor's page with no visitor counts, durations or confidence levels |
| The offer's argument stands in text, and a video is an addition to it: a text page that transcribed a three-minute video converted 4.1% against 0.65% for the video page | `hypothesis` | https://www.nextafter.com/?p=19235 | The research's inference from one experiment on a donation page, a neighbouring kind: NextAfter #61736, 2021, n=3,351, 68 gifts against 11 |

## Offers at the checkout

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| One platform reports about 8% higher average order value for the creators who add an offer at the checkout | `hypothesis` | https://teachable.com/blog/order-bumps-drive-sales | Teachable's own article, 2021, a vendor's figure with no period or counts; the take rate it advises is advice and no measurement |
| An upsell moved revenue per visitor by -0.1% on average and conversion by -0.3%, while raising revenue per buyer | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Browne and Swarbrick Jones (Qubit, 2017), 99 treatments in retail and travel, not digital goods: 95% interval of -0.5 to +0.3 on revenue per visitor; one vendor's clients, the method assured by PwC: a meta-analysis of experiments and no benchmark, which the e-commerce playbook carries the same way; replication unknown |

## Proof and guarantees

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A result on the wording of a guarantee or of a trial is not expected to hold on another site | `published-study` | https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf | Kohavi, Deng, Longbotham and Xu, "Seven Rules of Thumb for Web Site Experimenters", KDD 2014, which names "30-day free trial" against "30-day money back guarantee" among the results its authors do not expect to replicate across sites; a statement of the paper and no experiment on guarantees: replication unknown |
| Readers doubt a company's own testimonials as curated and check third-party review sites | `published-study` | https://www.nngroup.com/articles/about-us-information-on-websites/ | NN/g's study of "About Us" information, 2019: 20 users in the latest round and over 70 across three rounds; a usability finding and no measured lift; replication unknown outside the group's own rounds |

## Traffic and reading

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The traffic channel dominates the benchmark of landing pages: email traffic converted at 19.3% on average, paid social at 12% and paid search at 10.9% | `hypothesis` | https://unbounce.com/conversion-benchmark-report/ | Unbounce's "Conversion Benchmark Report", 2024, a vendor's observational benchmark of its own customers' landing pages: more than 57 million conversions on more than 41,000 pages |
| Pages written at a 5th to 7th grade reading level converted at a median of 11.1%, 56% higher than pages at an 8th to 9th grade level, financial services being the stated exception | `hypothesis` | https://unbounce.com/conversion-benchmark-report/ | The same report, a vendor's: a correlation across pages in English, with no control, and never carried to copy in another language as measured |
| Mobile was 83% of the visits, and desktop converted 8% better on average | `hypothesis` | https://unbounce.com/conversion-benchmark-report/ | The same report, a vendor's |

## What stays true

On a sales page a deadline shown is a real deadline and a count a real count; a testimonial, a figure of buyers, a client or a result is a real one the seller can show, and none is written by the session; a guarantee is one the seller honours as written; an added offer at the checkout is never selected for the buyer; a request for the opposite of any of these is a blocking objection, as `wizardingcode-frontend-strategy` says, and never a choice with a label.

## What the research did not find

- No platform that sells courses or digital goods was found to publish conversion benchmarks with a method.
- One-page against multi-step checkout for digital goods: no experiment was found.
- The framing of a guarantee and the placement of testimonials: no experiment with a sample size was found.
- Every take rate quoted for an added offer at the checkout is advice or a figure with no dataset.
- The conversion formula the genre quotes could not be read at its source, and no dataset behind its weights was found.
- The long-copy result of 2013 that the genre quotes gives no sample, rates or confidence level on its page.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each other choice as a `hypothesis` with the metric that would confirm it, everything under "What stays true" holds, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "Info-product sales page"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
