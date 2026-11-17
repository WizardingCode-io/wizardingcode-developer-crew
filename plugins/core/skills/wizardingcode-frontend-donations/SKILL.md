---
name: wizardingcode-frontend-donations
description: "The playbook of a donation page: what an experiment library and one benchmark of non-profits measured on the appeal, the monthly gift and the device, and what stays true of a gift, each rule with its proof label, its source and what the source is."
---

# Donations and non-profit playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `donations`, before the direction and the first interface file, and again before any change to the donation page, its form or how a gift is charged.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. Two kinds of source carry the rows:

- One library of experiments on donation pages. A row from one experiment gives its sample and its confidence; a result read at the library's listing has neither and says so.
- One observational benchmark of non-profits. It says what their sites did in one year, with no control.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of proof, a goal, a prompt or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is donation conversion; beside it the average gift and recurring donor conversion, which the experiments and the benchmark report. A benchmark's rate is a typical range and never a target.

## The appeal

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The evidence of this kind is an experiment library that held 3,934 experiments on 2026-11-16, each with its rates, its sample against the sample required and a confidence level | `hypothesis` | https://www.nextafter.com/research/ | NextAfter's research library of experiments on donation pages, read at its listing: a count, and no finding |
| A text page that transcribed a three-minute video converted 4.1% against 0.65% for the video page: the appeal stands in text, and a video is an addition to it | `published-study` | https://www.nextafter.com/?p=19235 | NextAfter experiment #61736, 2021, on one organisation's donation page: n=3,351, 68 gifts against 11; an experiment on this kind of page, where the playbook of info-product pages carries it as adjacent and a `hypothesis`; the conclusion is the research's inference; replication unknown |
| A long-form appeal cut conversion by 37.8% and raised the average gift by 61.3%, revenue differing by -0.6%: conversion is read with the average gift and revenue | `hypothesis` | https://www.nextafter.com/?p=16052 | NextAfter experiment #12712, 2019, on a donation page: n=472, 94.8% confidence, marked not valid by NextAfter, so it carries no study's label; the conclusion is the research's inference |

## The form and the gift

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A prompt shown after the decision to give, offering to turn the gift into a monthly gift at 60% of the amount, raised recurring donor conversion from 0.50% to 0.62% and left the overall likelihood of giving unchanged | `published-study` | https://www.nextafter.com/experiments/how-rolling-out-a-recurring-gift-pop-out-on-all-donation-pages-impacts-donor-conversion/ | NextAfter experiment #6147, 2018, on one organisation's donation pages: n=86,181, 98.3% confidence; 16% of all recurring gifts came through the prompt; what bounds such a prompt is under "What stays true"; replication unknown |
| Two headline results of the library are leads to test and no rule: an amount field left free on the form (+125.9%) and a simplified decision with a contextual landing page (+14.4%) | `hypothesis` | https://www.nextafter.com/research/ | The same library, on donation pages, read at its listing alone: the metric, the sample and the confidence of these two results were not read |

A donation form asks for personal data and takes a payment: what a form asks follows the paragraph in `wizardingcode-frontend-b2b-lead-gen`, and what stays true of the gift is below.

## Device and traffic

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Mobile was 52% of traffic and 28% of revenue, and desktop 48% of traffic and 72% of revenue | `hypothesis` | https://mrbenchmarks.com/website-performance/ | "M+R Benchmarks 2026: Website performance", an observational benchmark of 180 non-profits on data of 2025, with no control; its editions are not mixed |
| The main donation page converted 11% on desktop and 8% on mobile, with an average gift of 168 USD on desktop and 88 USD on mobile: the mobile path is where the gap stands | `hypothesis` | https://mrbenchmarks.com/website-performance/ | The same report, an observational benchmark; the conclusion is the research's inference |
| 1.6% of website visitors donated, and revenue per visitor was 1.33 USD; for hunger and poverty groups the figures were 3.3% and 5.58 USD | `hypothesis` | https://mrbenchmarks.com/website-performance/ | The same report, an observational benchmark: a typical range that one sector doubles, and never a target |

## What stays true

On a donation page a goal, a deadline, a matching period and a count of donors shown are real ones; the prompt for a monthly gift is asked once, declining it is as easy as accepting it, and the one-off gift then goes through as the donor chose it; nothing that adds to what the donor pays is selected for them, a monthly gift, a larger amount or a sum to cover fees; before the donor confirms a monthly gift the page shows its amount, how often it is charged and how to stop it; a change to how a gift is charged is a payments change the security review reads; a request for the opposite of any of these is a blocking objection, as `wizardingcode-frontend-strategy` says, and never a choice with a label.

## What the research did not find

- Experiments on trust marks and on the count of a form's fields were not located in the library.
- The library's headline results were read at its listing alone, without their samples.
- The benchmark's editions differ in their figures, and the 2026 edition alone was read.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each other choice as a `hypothesis` with the metric that would confirm it, everything under "What stays true" holds, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "Donations and non-profit"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
