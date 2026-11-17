---
name: wizardingcode-frontend-institutional
description: "The playbook of an institutional or public-sector site: the principles three institutions publish, one government's own tests of two pages, and two usability studies of corporate pages, each rule with its proof label, its source and what the source is."
---

# Institutional and public sector playbook

## When

After `wizardingcode-frontend-strategy`, in a project whose kind is `institutional`, before the direction and the first interface file, and again before any change to a service's journey, to a page about the organisation or to an investor page.

## How to read a row

Each rule is one row: the rule, its label, the address it stands on, and what that source is. The evidence of this kind is standards built on qualitative research, with no measured lift, and the rows say so:

- An institution's design principles say what it asks of its own services. They are no measurement, and no row gives one as a gain.
- One government published two tests of its own pages, as relative figures with no counts: a `hypothesis`, as one company's own account is elsewhere.
- Two usability studies say what readers of a company's pages looked for. They report no success rates.

When a choice of the change follows a row, record it with the row's label and source (`crew design <id> choice add`). A choice no row carries is a `hypothesis`. No row is `measured-here`: only this project's own measurement earns that label. No row is leave to build what `wizardingcode-frontend-strategy` refuses: a row that speaks of proof, a goal, a prompt or an offer says what was measured where it was true.

The addresses are provenance: they are recorded with a choice and never opened by the session.

## The metric

The primary metric is task completion: finding the information, completing the service. It is never a sale, and no published rate is given here as a target.

## Public services

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A public service starts from the principles its government publishes, among them: start with user needs, do less, design with data, do the hard work to make it simple, iterate | `hypothesis` | https://www.gov.uk/guidance/government-design-principles | GOV.UK's "Government Design Principles", last updated 2025-04-02, eleven in all: an institution's own principles, and no measurement |
| Renaming a button from "Start now" to "find contact details" raised its clicks by 30% on mobile and 14% on desktop: a button's label says what happens next | `hypothesis` | https://insidegovuk.blog.gov.uk/2017/11/14/using-ab-testing-to-measurably-improve-common-user-journeys/ | Inside GOV.UK, "Using A/B testing to measurably improve common user journeys", 2017: a government's own tests of its pages, given as relative figures with no counts of control and variant published, so it carries no study's label; not every test won, and its authors say testing is no replacement for user research; the conclusion is the research's inference |
| Removing a distracting link beside a calculator raised clicks on its start button by 6%; people who took the link completed at 62% against 85% for those who used the button | `hypothesis` | https://insidegovuk.blog.gov.uk/2017/11/14/using-ab-testing-to-measurably-improve-common-user-journeys/ | Inside GOV.UK, "Using A/B testing to measurably improve common user journeys", 2017: a government's own tests of its pages, given as relative figures with no counts of control and variant published, so it carries no study's label |
| The design system of the United States' government gives five principles: start with real user needs, earn trust, embrace accessibility, promote continuity, listen | `hypothesis` | https://designsystem.digital.gov/design-principles/ | The U.S. Web Design System's "Design principles", an institution's own principles, and no measurement |
| The main task is finished on the first attempt, and extra content comes only on request | `hypothesis` | https://commission.europa.eu/resources/europa-web-guide/design-content-and-development/design/web-design-principles_en | The European Commission's "Web design principles of Europa websites", an institution's own principles; no study is published with them |
| A site in several languages is designed for their alphabets, line lengths, reading directions, colours and symbols | `hypothesis` | https://commission.europa.eu/resources/europa-web-guide/design-content-and-development/design/web-design-principles_en | The same page, an institution's own principles |

A service's form asks only what has a use the person sees: the paragraph on what a form asks is in `wizardingcode-frontend-b2b-lead-gen`, and a form's steps and validation are in `wizardingcode-frontend-screens`.

## Corporate and investor pages

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| The study's authors recommend that a company's site say what the company does at four levels: a tagline on the home page, a summary, subpages and footer links | `hypothesis` | https://www.nngroup.com/articles/about-us-information-on-websites/ | NN/g's "'About Us' Information on Websites", 2019: three rounds, over 70 users, 100 sites tested and 65 reviewed; a usability finding, with no success rates reported; this is the authors' recommendation from the study, and no finding of it |
| Ten things lowered satisfaction, among them stock photography, walls of text, missing trust indicators and aggressive sales tactics; readers wanted real photographs of staff and products and contact details in several channels | `published-study` | https://www.nngroup.com/articles/about-us-information-on-websites/ | The same study; replication unknown outside the group's own rounds |
| Individual investors found detailed data intimidating and wanted one page of highlights; professionals took the data elsewhere and came for management's view; both wanted the company's own account without hype | `published-study` | https://www.nngroup.com/articles/investor-relations-ir/ | NN/g's "Investor Relations (IR) on Corporate Websites", 2009: two rounds in five cities, 63 participants, 52 sites tested and 42 reviewed, with eye tracking; replication unknown, and nothing newer was found |
| PDFs and slide decks work badly online, and a long webcast needs labelled segments | `published-study` | https://www.nngroup.com/articles/investor-relations-ir/ | The same study; replication unknown |

## What the research did not find

- No published measurement of what a design system changed in completion rates was found.
- Case studies of plain language with measured results were not found.
- The effect of accessibility on completion was not measured in any experiment the research found; its case is a norm and reach.
- The two studies of corporate pages are of 2009 and 2019, and nothing newer was found.

## Done when

Each choice of the change that a row carries is recorded with the row's label and source, each other choice as a `hypothesis` with the task whose completion would confirm it, and no page of the change holds a deceptive pattern.

## Provenance

Every address above stands in `sources.md` beside this file, with what it is and the date it was read. The rows come from the research of 2026-11-16 for the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 1, "Institutional and public sector"), and quote only what that research read at the page itself, from its two notes on the kinds. No figure here comes from a search summary.
