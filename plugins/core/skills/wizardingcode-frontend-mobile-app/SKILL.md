---
name: wizardingcode-frontend-mobile-app
description: "The playbook of a mobile app: what one vendor's observational benchmark of subscription apps saw of paywalls, trials and cancellations, and what stays true of a paywall and a subscription, each rule with its proof label, its source and what the source is."
---

# Mobile app playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `mobile-app`, before the direction and the first interface file, and again before any change to the paywall, the trial, onboarding or how a subscription is charged. The platforms' and the stores' own rules, the paywall's among them, are in `wizardingcode-frontend-platforms`.

The mobile phase is not yet proven on a real project. The definition builds the team web first, then mobile, then desktop, each phase proven on a real project (`docs/specs/2026-11-16-frontend-team-design.md`, section 1): until the mobile phase is proven, the project this playbook serves is its first proof, and a choice made on these rows carries the row's label and no more.

Signing keys and store credentials never reach the model, and a build, a store submission or an update is a person's decision, by the definition's row "Mobile and desktop toolchains" (section 4): the session prepares the change, and the person submits it.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. One kind of source carries the rows: one vendor's observational benchmark of subscription apps. It says what apps that chose their own model did in one year, with no control: its figures are a typical range and never a target, and every row is a `hypothesis`.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of a paywall, a trial or a plan says what was observed where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is download-to-trial; beside it trial-to-paid, download-to-paid by day 35, revenue per installation, renewal and retention, the metrics the definition names for the kind. A benchmark's rate is a typical range and never a target.

## The paywall and the trial

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A hard paywall converted 10.7% to paid by day 35 against 2.1% for freemium, and after one year on yearly plans it retained 27% against 28%: the gap at the start did not last into retention | `hypothesis` | https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 | RevenueCat's "The State of Subscription Apps in 10 minutes", 2026-03-19: a vendor's observational benchmark of more than 115,000 apps, with no control; apps chose their model, so the gap is a correlation, and the conclusion is the research's inference |
| Revenue per installation at day 60 was 3.09 USD behind a hard paywall against 0.38 USD for freemium | `hypothesis` | https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 | The same article, a vendor's observational benchmark: a typical range and never a target |
| Trials of 17 to 32 days had a median trial-to-paid of 42.5% against 25.5% for trials under 4 days, while 46.5% of apps used trials of 4 days or less | `hypothesis` | https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 | The same article, a vendor's observational benchmark; the length of a trial is a lead to test and no rule |
| Of the cancellations of a 3-day trial, 55.4% came on day 0 and 84% on day 0 or day 1: a trial's terms are read at its start | `hypothesis` | https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 | The same article, a vendor's observational benchmark; the conclusion is the research's inference |
| About 72% of yearly subscribers cancelled within the first year, and 35% of yearly cancellations came in the first month | `hypothesis` | https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 | The same article, a vendor's observational benchmark: a typical range and never a target |
| Failed billing was 31% of cancellations on Google Play and 14% on the App Store | `hypothesis` | https://www.revenuecat.com/blog/growth/subscription-app-trends-benchmarks-2026 | The same article, a vendor's observational benchmark of the two stores |

The article names the metric of the first row "download-to-paid" in a chart caption and "trial-to-paid" in its text: the row says conversion to paid by day 35 and claims neither name. The article's editions differ in their figures (12.1% for the hard paywall in 2025), and the 2026 edition alone is cited.

A sign-up or account form in the app asks for personal data, and what such a form asks follows the paragraph in `wizardingcode-frontend-b2b-lead-gen`.

## What stays true

In a mobile app the amount billed is the most prominent pricing element on the paywall, and a monthly breakdown of a yearly price never outweighs it; declining the paywall is as easy as accepting it; cancelling is as reachable as subscribing, and how to cancel is said before the person subscribes; a trial says when it charges and how much; no plan, trial or add-on that adds to what the person pays is selected for them; no deceptive pattern is built, as `wizardingcode-frontend-strategy` says; a change to how a subscription is charged is a payments change the security review reads; a request for the opposite of any of these is a blocking objection, as `wizardingcode-frontend-strategy` says, and never a choice with a label.

## What the research did not find

- A download-to-paid figure by platform is known to the research only from a search summary: no figure of it is given.
- The vendor's full report is known by a search result alone, and its guidance on a paywall's layout, its count of plans and its toggle of periods was not read, so no row says how a paywall is laid out.
- No published experiment with a control on a paywall, a trial's length or onboarding of a mobile app was found: every row is one vendor's observation.
- No first-party experiment on the acceptance of a permission's request after a priming screen was found.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each other choice as a `hypothesis` with the metric that would confirm it, everything under "What stays true" holds, no step of the change needs a signing key or a store credential from the model, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "Mobile app"), and quote only what that research read at the page itself, from its note on the kinds. No figure here comes from a search summary.
