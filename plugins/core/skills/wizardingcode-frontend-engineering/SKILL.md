---
name: wizardingcode-frontend-engineering
description: "The frontend team's engineering rules: frameworks per stack, CSS and Tailwind, components and state, data and rendering, performance, and internationalisation, SEO and security in the browser, each rule with its proof label, its source and what the source is."
---

# Engineering

## When

After `wizardingcode-frontend-strategy`, before the first component of the change, and again before a change to how a page gets its data, to a dependency or to what a page loads first.

## How to read a row

Each rule is a row: the rule, its label, its source and what the source is. The label is the one a design choice built on the rule is recorded with, unless this site measured it.

- `platform-guidance`: what a framework's team or a browser vendor tells its developers in its own documentation, a practice it asks for or how its own platform behaves. The rule begins with whose guidance it is.
- `hypothesis`: a registry's record, the platform's status record, the research's own inference, a vendor's study or figure, or the crew's own rule. A record is a fact of the day it was read, and the row says the day.

This group has no norm and no study with a replication note.

The addresses are provenance: they are recorded with a choice and never opened by the session.

The stack's own rules are the packs' knowledge pages, named in the rows. The values the reviewer accepts are in `plugins/core/skills/crew/references/frontend.md`, and its questions in `plugins/core/skills/crew/rubrics/ui-ux.md`.

## Frameworks per stack

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| In Next.js the documentation that matches the installed version ships inside the package, from 16.2 | `platform-guidance` | https://nextjs.org/docs/app/guides/ai-agents | Next.js's "How Next.js supports AI coding agents" |
| That bundled documentation passed every case of one comparison, where skill-based approaches reached up to 79 percent, is a vendor's figure | `hypothesis` | https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals | Vercel's own article on its own framework, which the Next.js page quotes |
| In Livewire 4 the upgrade guide tells Volt's users to remove the package | `platform-guidance` | https://livewire.laravel.com/docs/4.x/upgrading | Livewire's "Upgrade guide, Livewire 4.x"; that new Laravel work does not start on Volt is the research's inference from it |
| Laravel Boost's documentation search may answer with material for Inertia's second major on a project that has the third | `hypothesis` | https://laravel.com/docs/13.x/boost | "Laravel Boost", in the Laravel 13.x documentation: its documentation API lists Inertia 1.x and 2.x and not 3.x, though its guidelines cover 3.x; the conclusion is the research's inference |
| Laravel's thirteenth major was current and its twelfth still released, as of 2026-11-16 | `hypothesis` | https://repo.packagist.org/p2/laravel/framework.json | Packagist's record of the framework |
| Livewire's fourth major was current and its third still released, as of 2026-11-16 | `hypothesis` | https://repo.packagist.org/p2/livewire/livewire.json | Packagist's record of the package |
| Inertia's adapter for Laravel was at its third major with the second still released, as of 2026-11-16 | `hypothesis` | https://repo.packagist.org/p2/inertiajs/inertia-laravel.json | Packagist's record of the package |
| Vue 3.6 was a release candidate and not a stable release, as of 2026-11-16 | `hypothesis` | https://registry.npmjs.org/vue | The package's registry record |
| A Nuxt project's rules are the pack's knowledge page for Nuxt 4 | `hypothesis` | `packs/nuxt/knowledge/nuxt.md` | The crew's own file; of Nuxt's own documentation the research read one page, and for no practice |
| A Next.js project's rules are the pack's knowledge page for Next.js 16 | `hypothesis` | `packs/next/knowledge/next.md` | The crew's own file |
| Blade and Livewire 4 rest on the Laravel pack's knowledge page: no page of Blade's own documentation was read | `hypothesis` | `packs/laravel/knowledge/laravel.md` | The crew's own file; the same holds for Vue's and React's own documentation |

The first rule of this page is the research's own inference, from two generations of each stack being live at once in the registries: the framework is the one the project already has, at its installed major, read from the lock file before any code is written. The frontend pack's own knowledge page is `packs/frontend/knowledge/frontend.md`. The stacks are those the user named on 2026-11-16 in the first list of twenty subjects: Vue and Nuxt, React and Next, Blade, Livewire and Inertia. The twenty-eight subjects that replaced that list say "frameworks per stack" and name none.

## CSS and Tailwind

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Anchor positioning was limited, with no Firefox, as of 2026-11-16 | `hypothesis` | https://api.webstatus.dev/v1/features/anchor-positioning | The platform's status record, a record of what browsers ship and no usage guidance; its per-browser versions were not checked against MDN |
| In Tailwind CSS 4 the browser floor is Safari 16.4, Chrome 111 and Firefox 128, and a project that needs older browsers stays on v3.4 | `platform-guidance` | https://tailwindcss.com/docs/upgrade-guide | Tailwind's "Upgrade guide" |
| In Tailwind CSS 4 the setup is written in CSS (`@import "tailwindcss"`, `@theme`, `@utility`, `@custom-variant`, `@reference`, `@source inline()`), and a JavaScript config is read only through `@config` | `platform-guidance` | https://tailwindcss.com/docs/upgrade-guide | Tailwind's "Upgrade guide" |
| In Tailwind CSS 4 Sass, Less and Stylus are not supported | `platform-guidance` | https://tailwindcss.com/docs/upgrade-guide | Tailwind's "Upgrade guide" |
| In Tailwind CSS 4 utilities were renamed: `shadow-sm` is `shadow-xs`, `outline-none` is `outline-hidden`, `ring` is `ring-3`, opacity takes the slash syntax and the important modifier goes at the end | `platform-guidance` | https://tailwindcss.com/docs/upgrade-guide | Tailwind's "Upgrade guide"; the research names these as what a model trained on the third major gets wrong |

By the platform's status records, read feature by feature, as of 2026-11-16: nesting, size container queries, `:has()`, cascade layers, subgrid, Oklab and OkLCh, `color-mix()`, logical properties and `<dialog>` were Baseline widely available; container style queries, relative colours, `light-dark()`, `@property`, same-document view transitions, popover, `@starting-style`, `@scope` and scroll-driven animations were newly available; anchor positioning, cross-document view transitions, `text-wrap: pretty`, `interpolate-size` and the customizable `<select>` were limited. The research read no page on how to use each of these features. The team's convention, which is the research's own inference from those records: a widely available feature is used with no fallback, a newly available one where the project's browser floor allows, behind `@supports` where its loss would break layout, and a limited one as progressive enhancement only.

## Components and state

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| A screen's components follow the frontend pack's screen checklist | `hypothesis` | `packs/frontend/checklists/screen.md` | The crew's own file; for these stacks the research read no first-party page of practice on components or on state |
| A Blade or Livewire screen follows the Laravel pack's screen checklist | `hypothesis` | `packs/laravel/checklists/screen.md` | The crew's own file |
| Base UI is published as `@base-ui/react`, as of 2026-11-16 | `hypothesis` | https://registry.npmjs.org/@base-ui/react | The package's registry record |
| Base UI's old package name, `@base-ui-components/react`, stopped at a release candidate in December 2025, so the old name gives a frozen release candidate, as of 2026-11-16 | `hypothesis` | https://registry.npmjs.org/@base-ui-components/react | The old name's registry record |
| Headless UI had no release in seven months, as of 2026-11-16: the weakest choice of the headless set for new work | `hypothesis` | https://registry.npmjs.org/@headlessui/react | The package's registry record; the judgement is the research's inference |
| Radix UI was maintained and slower, as of 2026-11-16 | `hypothesis` | https://registry.npmjs.org/radix-ui | The package's registry record |
| React Aria Components was licensed Apache-2.0 where the other headless primitives the definition lists were MIT, as of 2026-11-16 | `hypothesis` | https://registry.npmjs.org/react-aria-components | The package's registry record |
| Flux, Livewire's library, is proprietary and is used only where the project already holds it | `hypothesis` | https://repo.packagist.org/p2/livewire/flux.json | Its Packagist record, as of 2026-11-16, which says `proprietary`, with no licence on GitHub; the definition leaves its licence to settle |
| Pinia was MIT, as of 2026-11-16, and the research read nothing more of it than its registry record | `hypothesis` | https://registry.npmjs.org/pinia | The package's registry record; the definition's row says the same of TanStack Query, TanStack Router and React Router, each by its own record |
| In Livewire 4 components are single-file by default, with slots and `{{ $attributes }}`, and a component tag left unclosed captures what follows as its slot | `platform-guidance` | https://livewire.laravel.com/docs/4.x/upgrading | Livewire's "Upgrade guide, Livewire 4.x" |

Which of Nuxt UI and shadcn/ui sits on Reka UI, Radix or Base UI was not read from their documentation.

## Data and rendering

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| In Next.js Cache Components is enabled with `cacheComponents: true` and is already on in a new App Router app made with the recommended defaults | `platform-guidance` | https://nextjs.org/docs/app/getting-started/caching | Next.js's "Caching", last updated 2026-10-06 |
| In Next.js `"use cache"` caches an async function or a component, paired with `cacheLife` and tagged with `cacheTag` | `platform-guidance` | https://nextjs.org/docs/app/getting-started/caching | Next.js's "Caching", last updated 2026-10-06 |
| In Next.js request-time work goes behind `<Suspense>`, whose fallback ships in the static shell | `platform-guidance` | https://nextjs.org/docs/app/getting-started/caching | Next.js's "Caching", last updated 2026-10-06, which calls it Partial Prerendering |
| In Next.js `cookies`, `headers`, `searchParams` and `params` are awaited promises, and `Math.random()`, `Date.now()` and `crypto.randomUUID()` are handled explicitly | `platform-guidance` | https://nextjs.org/docs/app/getting-started/caching | Next.js's "Caching", last updated 2026-10-06; the caching model before it is still documented for apps without Cache Components |
| In Next.js a bot that cannot handle streamed metadata is served a dynamic render by user agent, and a data source missing at request time then gives that bot a 500 | `platform-guidance` | https://nextjs.org/docs/app/getting-started/caching | Next.js's "Caching", last updated 2026-10-06 |
| In Next.js the rendering decision is made per component: SSR, SSG and ISR name outcomes of that one model | `hypothesis` | https://nextjs.org/docs/app/getting-started/caching | The research's inference from Next.js's "Caching", last updated 2026-10-06 |
| Route rules, hybrid rendering and `useFetch` in a Nuxt project rest on the pack's knowledge page | `hypothesis` | `packs/nuxt/knowledge/nuxt.md` | The crew's own file, which lists Nuxt's pages on data fetching, rendering and hydration; Nuxt's own guidance on rendering modes was not read |
| In Livewire 4 a part of a page is an island (`@island`), loading can be deferred, and the `.blur` and `.change` modifiers of `wire:model` also control when the client syncs | `platform-guidance` | https://livewire.laravel.com/docs/4.x/upgrading | Livewire's "Upgrade guide, Livewire 4.x" |
| In Inertia 3 server rendering works during development, `Inertia::optional()` takes the place of `Inertia::lazy()`, updates can be optimistic with rollback, and the first page's data stands in a `<script type="application/json">` element | `platform-guidance` | https://inertiajs.com/docs/v3/getting-started/upgrade-guide | Inertia's "Upgrade guide for v3.0" |
| Same-document view transitions were Baseline newly available since 2025-10-14, as of 2026-11-16 | `hypothesis` | https://api.webstatus.dev/v1/features/view-transitions | The platform's status record |
| Cross-document view transitions were limited, with no Firefox, as of 2026-11-16 | `hypothesis` | https://api.webstatus.dev/v1/features/cross-document-view-transitions | The platform's status record |

No source on the cost of hydration was read.

## Performance and web vitals

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| On the web the thresholds stand at the 75th percentile of page loads, split by mobile and desktop: LCP good at or under 2.5 s and poor over 4 s, INP good at or under 200 ms and poor over 500 ms, CLS good at or under 0.1 and poor over 0.25 | `platform-guidance` | https://web.dev/articles/vitals | Google's "Web Vitals", last updated 2024-10-31; guidance and no norm |
| On the web hovering, zooming and scrolling are not observed by INP | `platform-guidance` | https://web.dev/articles/inp | Google's "Interaction to Next Paint (INP)", last updated 2025-09-02 |
| By the research's inference a gate checks lab LCP, CLS and Total Blocking Time: a lab tool has no user input, so Total Blocking Time stands in for INP there | `hypothesis` | https://web.dev/articles/inp | The research's inference, on the metric that Google's "Interaction to Next Paint (INP)" defines |
| The reviewer holds CLS at 0.1, its one limit | `hypothesis` | `plugins/core/skills/crew/rubrics/ui-ux.md` | The crew's own file, question 10 |
| On the web the likely LCP image carries `fetchpriority="high"`, on no more than one or two images, and never `loading="lazy"` | `platform-guidance` | https://web.dev/articles/optimize-lcp | Google's "Optimize Largest Contentful Paint", last updated 2025-03-31 |
| On the web the LCP image is discoverable in the first HTML and is served as AVIF or WebP | `platform-guidance` | https://web.dev/articles/optimize-lcp | Google's "Optimize Largest Contentful Paint", last updated 2025-03-31 |
| On the web `font-display` has a value other than `auto` or `block`, and no synchronous script stands in `<head>` | `platform-guidance` | https://web.dev/articles/optimize-lcp | Google's "Optimize Largest Contentful Paint", last updated 2025-03-31 |
| On the web the four shares of LCP are not turned into fixed budgets in milliseconds | `platform-guidance` | https://web.dev/articles/optimize-lcp | Google's "Optimize Largest Contentful Paint", last updated 2025-03-31, which warns against it |
| AVIF was Baseline widely available since 2026-07-25, as of 2026-11-16 | `hypothesis` | https://api.webstatus.dev/v1/features/avif | The platform's status record |
| Speculation rules were Chromium only, as of 2026-11-16, so they never carry correctness | `hypothesis` | https://api.webstatus.dev/v1/features/speculation-rules | The platform's status record; the conclusion is the research's |
| On the web speculation rules leave out the URLs that change state | `platform-guidance` | https://developer.chrome.com/docs/web-platform/implementing-speculation-rules | Chrome's "Guide to implementing speculation rules for more complex sites" |
| That speed raises conversion is a vendor's observational study of 37 brands and 30 million sessions | `hypothesis` | https://web.dev/case-studies/milliseconds-make-millions | A summary of "Milliseconds Make Millions", Deloitte Digital for Google, 2020; the research's register confirms what it says and not that it holds today |

The thresholds are a browser vendor's guidance and no norm.

## Internationalisation, SEO and security in the browser

| Rule | Label | Source | What the source is |
| :- | :- | :- | :- |
| Right-to-left layout rests on logical properties (`margin-inline`, `padding-block`, `inset-inline`) with no fallback: they were Baseline widely available since 2024-03-20, as of 2026-11-16 | `hypothesis` | https://api.webstatus.dev/v1/features/logical-properties | The platform's status record |
| On Apple's platforms system components are preferred, since they adapt to each language's reading order | `platform-guidance` | https://developer.apple.com/design/human-interface-guidelines/layout | Apple's guidelines, "Layout" |
| i18next was MIT, as of 2026-11-16, and the research read nothing more of it than its registry record | `hypothesis` | https://registry.npmjs.org/i18next | The package's registry record; the definition's row says the same of FormatJS, next-intl and @nuxtjs/i18n, each by its own record |
| Trusted Types was Baseline newly available since 2026-02-24, as of 2026-11-16 | `hypothesis` | https://api.webstatus.dev/v1/features/trusted-types | The platform's status record |
| DOMPurify was licensed MPL-2.0 or Apache-2.0, as of 2026-11-16 | `hypothesis` | https://registry.npmjs.org/dompurify | The package's registry record |
| In Livewire 4 there is a `csp_safe` option, and the endpoint path is derived from `APP_KEY`, which firewall and CDN rules follow | `platform-guidance` | https://livewire.laravel.com/docs/4.x/upgrading | Livewire's "Upgrade guide, Livewire 4.x" |
| `{!! !!}` is kept to HTML the application built itself | `hypothesis` | `packs/laravel/checklists/screen.md` | The crew's own file, a rule the crew already holds |

On what search engines and link previews read, the one fact the research holds is the row of Next.js on streamed metadata, under Data and rendering. The rules on cross-site scripting and Content Security Policy are the security team's: neither `plugins/core/skills/crew/rubrics/security.md` nor the security team's definition yet has a rule that names them, the rubric's nearest being its question on the boundary, so until the security team writes them a change that writes markup from data it did not build, or that touches a Content Security Policy, is raised to the security review and is not decided from this page.

## Dated facts and named packages

- The releases and Baseline statuses on this page are facts as of 2026-11-16, the day the research read them.
- The project's lock file says which major is installed, and it is read before any code is written.
- The framework's own documentation at the installed major wins over this page.
- A session that finds the page and the project disagree follows the project and says so.
- A package named on this page is a fact about it and no recommendation to add it.
- The project's own dependencies come first.
- A new dependency is a choice the session records, taken at the version its registry gives on the day it is added and never from this page.

## What the team never claims

- A figure that ties speed to conversion is a vendor's observational study of 2016 to 2020 and is never quoted as a promise.
- INP is unproven until field data exists; a lab run stands in with Total Blocking Time.
- The four shares of LCP are never turned into fixed budgets in milliseconds.
- There is no number here for JavaScript budgets, `srcset` and `sizes`, font subsetting, caching headers or third-party scripts: the research read no source on them.
- Nothing was read on SEO guidance or structured data, on internationalisation practice beyond two facts or on the cost of hydration: a choice that rests on them is a hypothesis.
- The team writes no rule of its own on cross-site scripting or Content Security Policy: they are the security team's to write.

## Done when

The framework's major was read from the lock file before the first line, every choice the change made on rendering, on a dependency or on what loads first is recorded with the label its row gives, as `wizardingcode-frontend-strategy` says, and the gates pass.

## Provenance

The six subjects, their sources and what each source is are the frontend team's definition (`docs/specs/2026-11-16-frontend-team-design.md`, section 3, the group Engineering), from the research read on 2026-11-16. The versions the registries gave that day stand there and not here. Each address cited here stands in `sources.md` beside this file. The third parties' skill sets of that definition are not distilled here.
