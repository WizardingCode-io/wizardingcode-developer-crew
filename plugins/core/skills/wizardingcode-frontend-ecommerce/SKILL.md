---
name: wizardingcode-frontend-ecommerce
description: "The playbook of an e-commerce project: what a shop's home, lists, product page, cart and checkout are built from, each rule with its proof label, its source and what the source is."
---

# E-commerce playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `e-commerce`, before the direction and the first interface file, and again before any change to navigation, lists, the product page, the cart or the checkout.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. A row labelled `published-study` says who measured what and whether anyone repeated it. Two kinds of source carry most rows, and they answer different questions:

- Baymard's public benchmarks give the share of benchmarked shops that fail a practice, from usability testing. They say what shoppers trip on. They are not measured lifts: no row promises a conversion gain.
- Browne and Swarbrick Jones (Qubit, 2017) pooled 6,700 experiments of one vendor's clients, 2014 to 2017, on revenue per visitor, about 2,600 of them categorised, the method assured by PwC. It says what moved revenue on average when shops changed something. Nobody has repeated it.

Read together: build these parts right the first time from the usability findings, and change them on a live shop carefully and measured, since the average change to navigation, search or filters moved revenue by about zero.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this shop's own measurement earns that label.

## The metric

The primary metric is conversion rate per session; beside it revenue per visitor, add-to-cart rate, cart abandonment and average order value. Published conversion benchmarks by sector disagree with each other and none was read at a primary source, so no target rate is given here: the shop's own baseline is the reference.

## Home page and navigation

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Product categories are the first level of the mobile navigation | `published-study` | https://baymard.com/blog/ecommerce-navigation-best-practice | Baymard's benchmark of 180+ US and European shops, 2026 edition: 22% fail this. A failure rate from usability testing, not a lift; not repeated by another group |
| A product attribute is a filter, not a category | `published-study` | https://baymard.com/blog/ecommerce-navigation-best-practice | Same benchmark: 79% of shops use categories where filters belong. Not repeated by another group |
| The main navigation highlights the shopper's current scope | `published-study` | https://baymard.com/blog/ecommerce-navigation-best-practice | Same benchmark: 96% of shops do not. Not repeated by another group |
| A drop-down menu opens after a hover delay of 300 to 500 ms | `published-study` | https://baymard.com/blog/ecommerce-navigation-best-practice | Same benchmark: 62% of shops have no delay; the range is Baymard's recommendation, not a measured optimum. Not repeated by another group |
| Categories are divided so that a level shows fewer than about 10 subcategories | `published-study` | https://baymard.com/blog/ecommerce-navigation-best-practice | Same benchmark: 51% of shops fail; the figure of about 10 is where Baymard's participants felt overwhelmed. Not repeated by another group |
| Static sections carry the home page's main messages, the most important first; no auto-rotating carousel | `published-study` | https://baymard.com/blog/homepage-carousel | Baymard, updated 2025-04-03: 46% of the shops with a home page carousel have usability issues, and static sections tested as well or better. Usability testing, not a lift; not repeated by another group |
| A carousel the client insists on changes panel only on the shopper's request, or holds each slide 5 to 7 seconds, pauses on hover, stops for good on interaction and never auto-rotates on mobile | `published-study` | https://www.nngroup.com/articles/auto-forwarding/ | Nielsen Norman Group, 2013: one test session in which a shopper missed an offer that rotated every 5 seconds. The timings are Baymard's requirements in the row above. A single session; not repeated as an experiment |

## Lists, filters and search

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A product's variations are one list item | `published-study` | https://baymard.com/blog/current-state-product-list-and-filtering | Baymard's benchmark of 170+ shops, 2025 edition: 42% do not combine variations. A failure rate from usability testing; not repeated by another group |
| A list item shows at least three thumbnails; apparel may need 5 to 15 | `published-study` | https://baymard.com/blog/current-state-product-list-and-filtering | Same benchmark: 80% of shops show fewer than three. Not repeated by another group |
| Goods sold in several quantities show their price per unit | `published-study` | https://baymard.com/blog/current-state-product-list-and-filtering | Same benchmark: 67% of shops show none in the list. Not repeated by another group |
| The applied filters are shown together in one overview, on mobile too | `published-study` | https://baymard.com/blog/current-state-product-list-and-filtering | Same benchmark: 20% of shops have no overview, 66% on mobile; participants applied 5 or 6 filters. Not repeated by another group |
| Search answers a query by feature, use case, compatibility, symptom and abbreviation, and a query for returns or shipping | `published-study` | https://baymard.com/blog/ecommerce-search-query-types | Baymard's benchmark of 170+ shops and apps, 2026 edition: between 37% and 66% of shops have issues with each of those query types. Not repeated by another group |
| On mobile the search submit button sits next to the field | `published-study` | https://baymard.com/blog/mobile-ux-ecommerce | Baymard's benchmark of 150+ mobile shops, 2026 edition: 27% fail this. Not repeated by another group |
| Navigation, search and filters of a live shop are changed one at a time and measured, never restyled on the expectation of a gain | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Qubit's meta-analysis: filters 0.0%, navigation -0.2%, search -0.2%, mobile navigation -1.7% and mobile search -1.0% on revenue per visitor. One vendor's clients, 2014 to 2017; the authors grant that poor implementation may explain the negatives; not repeated |

## Product page

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Sizes are chosen with buttons, not a drop-down | `published-study` | https://baymard.com/blog/current-state-ecommerce-product-page-ux | Baymard's benchmark of 155+ shops, 2026 edition: 57% fail this. A failure rate from usability testing; not repeated by another group |
| One image shows the product in scale, and apparel is shown on a person | `published-study` | https://baymard.com/blog/current-state-ecommerce-product-page-ux | Same benchmark: 37% of shops have no in-scale image and 23% none on a human model; 42% of users try to judge size from the images. Not repeated by another group |
| The return policy is shown or linked on the product page | `published-study` | https://baymard.com/blog/current-state-ecommerce-product-page-ux | Same benchmark: 44% of shops do not; 60% of 1,032 respondents look for it there. A survey and a failure rate; not repeated by another group |
| The page estimates the total order cost, delivery included | `published-study` | https://baymard.com/blog/current-state-ecommerce-product-page-ux | Same benchmark: 67% of shops give no estimate. Not repeated by another group |
| The shop answers negative reviews, and shoppers can browse the images reviewers sent | `published-study` | https://baymard.com/blog/current-state-ecommerce-product-page-ux | Same benchmark: 89% of shops do not answer negative reviews and 63% give no way to browse reviewers' images. Not repeated by another group |

## Cart and checkout

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The total cost, with shipping, tax and fees, is shown before the checkout starts | `published-study` | https://baymard.com/lists/cart-abandonment-rate | Baymard's survey of US shoppers: 40% abandoned over extra costs and 12% because they could not see the total up front. The page gives no sample size or year for this survey; a stated reason, not a measured lift; not repeated by another group |
| Guest checkout is the most prominent option, and account creation waits for the confirmation step | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Baymard's checkout benchmark, updated 2026-11-03: 47% of shops fail the first and 56% the second. Baymard is retesting its checkout research and expects results in the second quarter of 2027; not repeated by another group |
| A password asks for no complex composition | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Same benchmark: 82% of shops ask for complex passwords. Not repeated by another group |
| The checkout shows 12 to 14 form elements, 7 to 8 of them fields | `published-study` | https://baymard.com/lists/cart-abandonment-rate | Baymard: the average US checkout shows 23.48 form elements; 12 to 14 is Baymard's ideal, a recommendation from its testing and not a measured optimum. Not repeated by another group |
| Required and optional fields are both marked | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Same benchmark: 50% of shops fail; 32% of test participants missed a required field when only the optional ones were marked. Not repeated by another group |
| A phone number is asked only with the reason beside the field | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Same benchmark: 47% of shops require it with no explanation; 68% of survey respondents were reluctant to give one. Not repeated by another group |
| Delivery is shown as a date, not a speed | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Same benchmark: 48% of shops show a speed. Not repeated by another group |
| An order cutoff is a countdown to the real deadline, never a marketing timer | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Same benchmark: 83% of shops show a static time. The countdown is to a true delivery deadline; a false one is the row under "What the law forbids". Not repeated by another group |
| The cart's quantity is changed with buttons | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Same benchmark: 95% of shops use another control. Not repeated by another group |
| An error message says what is wrong with this input and how to fix it | `published-study` | https://baymard.com/blog/current-state-of-checkout-ux | Same benchmark: 98% of shops have no adaptive error messages. Not repeated by another group |
| The address step has a lookup or a validator | `published-study` | https://baymard.com/blog/mobile-ux-ecommerce | Baymard's mobile benchmark, 2026 edition: 54% of mobile shops have none. Not repeated by another group |
| The card fields stand in their own enclosed box with one or two seals or a padlock | `published-study` | https://baymard.com/blog/perceived-security-of-payment-form | Baymard: 19% of 1,026 US respondents abandoned because they did not trust the site with their card. A survey of perceived security, never of sales; test the seal on this shop's audience; not repeated by another group |

## What moves revenue, and what does not

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A stock count, what other shoppers bought and a deadline are shown where they are true, and only then | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Qubit's meta-analysis, mean uplift on revenue per visitor: scarcity +2.9%, social proof +2.3%, urgency +1.5%. One vendor's clients, 2014 to 2017, method assured by PwC; not repeated |
| An abandonment message is weighed against the discount it carries | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Same meta-analysis: abandonment recovery +1.1% on revenue per visitor, and it tends to lower revenue per buyer because it usually carries a discount. Not repeated |
| Product recommendations are expected to add little | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Same meta-analysis: +0.4% on revenue per visitor. Not repeated |
| Colour, button shape and the wording of a call to action are chosen for the brand and the contract, never justified by conversion | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Same meta-analysis: colour 0.0%, buttons -0.2%, reworded calls to action -0.3%; 90% of the 6,700 experiments had an effect under 1.2% either way. Not repeated |
| A pop-up or a welcome message is a bet to measure, not a default | `published-study` | https://www.gwern.net/doc/economics/advertising/2017-browne.pdf | Same meta-analysis: pop-ups 0.0% with a wide spread, welcome messages +0.2% with an interval that includes zero. Not repeated |

## Reviews and speed

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Every product collects its first reviews before anything else is done to its page, and imperfect ratings stay visible | `hypothesis` | https://spiegel.medill.northwestern.edu/how-online-reviews-influence-sales/ | Spiegel Research Center's page of 2017 says purchase likelihood rises with the first five reviews and peaks at ratings of 4.0 to 4.7. The page names no sample, period or method, so its figures are not quoted as findings |
| Review volume matters most where the shopper cannot judge the product from the page | `hypothesis` | https://www.powerreviews.com/review-volume-conversion-impact/ | A review vendor's observational figures over its own clients' sites, with no control for a product's popularity. A vendor's figure: a hypothesis until this shop measures it |
| The shop holds a speed budget on its listing, product and checkout pages | `hypothesis` | https://web.dev/case-studies/vitals-business-impact | Case studies the shops themselves published through Google, mostly before and after and not controlled, and a page that collects wins. The direction is consistent; the size on this shop is unknown until measured |

## What the law forbids

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| No false statement that a product or a price is available for a limited time: no fake timer, no fake stock count | `norm` | http://publications.europa.eu/resource/celex/02005L0029-20220528 | Directive 2005/29/EC, Annex I, point 7: unfair in all circumstances |
| A review is shown as a buyer's only when the shop took reasonable steps to check it, and no review is false or commissioned | `norm` | http://publications.europa.eu/resource/celex/02005L0029-20220528 | Directive 2005/29/EC, Annex I, points 23b and 23c. The page says how reviews are checked |
| A paid placement in search results is disclosed | `norm` | http://publications.europa.eu/resource/celex/02005L0029-20220528 | Directive 2005/29/EC, Annex I, point 11a |
| An announced price reduction shows the prior price, the lowest applied in the 30 days before it | `norm` | http://publications.europa.eu/resource/celex/01998L0006-20220528 | Directive 98/6/EC, Article 6a; in Portugal, Decreto-Lei n.º 109-G/2021 |
| The shop meets the accessibility requirements for e-commerce services | `norm` | http://publications.europa.eu/resource/celex/32019L0882 | Directive (EU) 2019/882, for services provided after 28 June 2025; a microenterprise that provides services is exempt; in Portugal, Decreto-Lei n.º 82/2022. The criteria are the frontend standard's |

## By category of product

Baymard's public articles give three priorities by category, each a usability finding of the benchmarks above: apparel leans on images, size selection and returns (a list item may need 5 to 15 thumbnails); electronics on specifications and compatibility search (44% of shops handle compatibility queries badly); grocery and beauty on price per unit. A choice made on this ground is recorded as `published-study` with the benchmark's address and the same note.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each other choice as a `hypothesis` with the metric that would confirm it, and no page of the change breaks a row under "What the law forbids".

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "E-commerce"), and quote only what that research read at the page itself. No figure here comes from a search summary.
