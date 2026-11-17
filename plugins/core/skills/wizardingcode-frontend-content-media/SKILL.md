---
name: wizardingcode-frontend-content-media
description: "The playbook of a publication: the one source the research read, a vendor's page of publishers' own cases on loading and layout stability, and what the research knows only by a search result, each rule with its proof label, its source and what the source is."
---

# Content and media playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `content-media`, before the direction and the first interface file, and again before any change to what a page loads first, to its advertising slots or to a registration.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. This playbook rests on one page: a browser vendor's collection of publishers' own case studies. Each case is one publisher's account. By the research's note the page gives no dates, its e-commerce cases are comparisons of before and after, mostly not controlled, and its cases are selected successes: they say nothing of how often the same work gained nothing. The media cases of the same page are read the same way here. Every row is a `hypothesis`.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of proof, a goal, a prompt or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is page views per session; beside it ad revenue, registration and paid subscription. No rate of registration or of subscription is given here: the research holds none it read at its source.

## Loading and layout stability

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Publishers reported more ad revenue after work on speed and layout stability: one reported CLS improved by 15% with +10% ad revenue, another +18% ad revenue with no figure of the change behind it | `hypothesis` | https://web.dev/case-studies/vitals-business-impact | Google's "The business impact of Core Web Vitals", a vendor's page that collects publishers' own cases; the research's note says the page gives no dates, and gives the page's e-commerce cases as before and after, mostly not controlled; the same page's media cases are read the same way (iCook, Netzwelt) |
| Publishers that improved loading or stability reported more page views per session: +9% after LCP improved by 18%, and +15% after a fix of CLS | `hypothesis` | https://web.dev/case-studies/vitals-business-impact | The same page, a vendor's collection of publishers' own cases (NIKKEI STYLE, Yahoo! Japan) |
| Two publishers reported lower bounce rates: one halved LCP and reports a 50% better bounce rate, with other product changes at the same time; the other reports CLS 77% lower and bounce 8% lower | `hypothesis` | https://web.dev/case-studies/vitals-business-impact | The same page, a vendor's collection of publishers' own cases (NDTV, GEDI) |

A registration form asks only what has a use the reader sees: the paragraph on what a form asks is in `wizardingcode-frontend-b2b-lead-gen`.

A subscription shows its price, how often it is charged and how to stop it before the person confirms, and stopping is no harder than starting.

The rules on what loads first and on the web vitals are in `wizardingcode-frontend-engineering`; no row repeats them.

## What the research did not find

- The subscription benchmark is known to the research by a search result alone, so no figure of it is given: that registered readers convert to paid more often than anonymous ones is unread at its source.
- The share of readers a paywall or a meter stops is known by a search result alone.
- No source that measures INP against a publisher's outcome was found.
- No experiment on article layout, on recommendation modules or on the density of advertising was read.

## Done when

Each choice of the change that a row carries is recorded as a `hypothesis` with the row's source, each other choice as a `hypothesis` with the metric that would confirm it, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "Content and media"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
