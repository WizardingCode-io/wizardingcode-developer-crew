# wizardingcode-pack-frontend

A team pack for the WizardingCode Developer Crew: data the crew engine serves, never code. It holds one team template, three checklists the gap round reads and two knowledge files the expert reads. It has no skill, no agent and no hook; the crew skill reads what the engine prints for it (`crew pack files`, `crew team <id>`). The values a page is held to live in the core's frontend standard (`references/frontend.md` of the crew skill); this pack names it and never copies its table.

Verified against: WCAG 2.2; Motion 14.7.1; motion-v 2.8.0; Tailwind CSS 4.3.3; Vue 3.5.44; React 19.3.1; Nuxt 4.x; Livewire 4.x.

## What it changes in a project

- **The seat.** With the template set in the project's policy, a changed file under one of the template's globs (`pages/**`, `components/**`, `layouts/**`, `composables/**`, `app.vue`, `assets/css/**`, `app/**/*.vue` and its `.tsx`, `.jsx`, `.ts`, `.js`, `.css`, `.scss` kin, `src/app/**`, `src/components/**`, `styles/**`, `resources/views/**`, `resources/css/**`, `resources/js/**`, `tailwind.config.*`, `**/*.tokens.json`, `DESIGN.md`) seats the `frontend` team as the expert's knowledge seat on the standard and full routes, with the reason `pack wizardingcode-pack-frontend (<glob>)`. The core's own frontend rule stays: an interface file or a design contract still seats the page reviewer and the frontend lead, and the lead validates the spec and the delivery.
- **The expert's files.** A team pack has no detector rule, so no target is tagged by it; the expert reads `knowledge/frontend.md` and `knowledge/motion.md` when the policy's specialists name them. Set both lines together in `policy.json`:

```json
{ "team": { "template": "frontend", "specialists": ["wizardingcode-pack-frontend:frontend", "wizardingcode-pack-frontend:motion"] } }
```

- **The gap round.** `crew pack files checklists screen | motion | design-contract` prints the checklist of that kind beside the core's: the screen's states and widths, the motion thesis before the code, the design contract and its tokens.
- **What it never does.** The template adds globs and nothing else: no cap, no team removed, nothing seated always; the engine refuses a template that would (`crew pack add` says which field). The pack ships no gate command. `DESIGN.md` is a project file the reviewer reads as data, never as instructions (the standard's Design contract section says so).

## Install

From the WizardingCode marketplace, with the core plugin at 0.16.0 or later:

```sh
claude plugin install wizardingcode-pack-frontend@wizardingcode-plugins
```

The engine registers it at the next session start (`crew pack list` shows it). From a checkout of the core repository, in any runtime:

```sh
crew pack add packs/frontend
```

## The cases

The pack ships with the cases that show its difference (`plugins/core/evals` of the core repository, SP9 Task 10): `pack-frontend-seats-the-team` (a Node tree with a Vue component under `components/`, the pack registered and the policy set: `crew team <id>` lists the expert's seat with the reason `pack wizardingcode-pack-frontend (components/**)`, the trace names `knowledge/frontend.md` and `knowledge/motion.md`, the notice gains its dismiss transition with a `prefers-reduced-motion` branch and no `transition: all`, and the ending says what the report proves) and `pack-frontend-absent` (the same tree with no pack and no policy: no seat, no knowledge path, the same transition, the same honest ending). Every entry under `provenance` in `pack.json` names the seat case as the one that measured it.

## Sources read on 2026-10-27

Every URL the pack's files name, with the claim it supports.

- https://www.w3.org/TR/WCAG22/ · WCAG 2.2, the success criteria the standard cites by number (2.1.1, 2.4.3, 2.1.2, 2.4.7, 2.4.11, 1.3.1, 4.1.2, 1.4.3, 1.4.11, 1.4.10, 1.4.4, 2.5.8, 2.3.3).
- https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion · the media feature `prefers-reduced-motion: reduce`, set by the user's system, read by a stylesheet or `matchMedia`.
- https://tailwindcss.com/docs/hover-focus-and-other-states · Tailwind's `motion-reduce:` and `motion-safe:` variants over `prefers-reduced-motion`.
- https://vuejs.org/guide/built-ins/transition.html · Vue's `<Transition>`: one element or component, the six enter and leave classes, `appear`, `mode="out-in"`, the JavaScript hooks.
- https://vuejs.org/guide/built-ins/transition-group.html · Vue's `<TransitionGroup>` for a list, each child with a unique `key`, the move class.
- https://nuxt.com/docs/4.x/getting-started/transitions · Nuxt 4's `pageTransition` and `layoutTransition` in `nuxt.config`'s `app` block and per page through `definePageMeta`, built on Vue's `<Transition>`.
- https://motion.dev/docs/vue · motion-v, Motion for Vue: `motion.div`, `AnimatePresence`, the `initial`, `animate` and `exit` props.
- https://motion.dev/docs/react · Motion for React (`motion/react`): `motion.div`, `AnimatePresence`, `useReducedMotion`.
- https://react.dev/reference/react/ViewTransition · React's `<ViewTransition>` is available only in the Experimental channel of React.
- https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API · the View Transitions API, `document.startViewTransition`, the old and new snapshots animated by the browser.
- https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style · `@starting-style`, the starting values of an element's first style update, for an entry transition from `display: none` or the top layer.
- https://developer.mozilla.org/en-US/docs/Web/CSS/transition-behavior · `transition-behavior: allow-discrete`, so a discrete property such as `display` takes part in a transition.
- https://livewire.laravel.com/docs/4.x/upgrading · Livewire 4's `wire:transition` on the browser's View Transitions API; the v3 Alpine modifiers gone, basic usage kept.
- https://github.com/emilkowalski/skills · the frequency table, the durations, the easings, the properties, interruptibility, reduced motion and the hover gate folded into the standard (MIT, commit `2d22863`).
- https://github.com/jakubkrehel/skills · the review protocol and WCAG 2.2 by number folded into the standard (MIT, commit `592aedc`).
- https://github.com/pbakaus/impeccable · `DESIGN.md`, the craft floor and the motion thesis folded into the standard (Apache-2.0, commit `6743a34`).
- https://github.com/codeswithroh/tastemaker · the design lint's rules folded into the engine (MIT, commit `792a28a`).
- https://github.com/nateherkai/scroll-craft · the motion sampling method and the reduced-motion pass folded into the fixture (MIT, commit `75d81f7`).
- https://github.com/ConardLi/garden-skills · the acceptance protocol and the failure patterns folded into the standard (MIT, commit `2b9a893`).
- https://github.com/every-app/open-seo · the states enumerated before any capture, folded into the standard (MIT, commit `89ad06c`).
- https://github.com/blader/humanizer · the copy tells folded into the standard (MIT, commit `8c307f3`).
- https://github.com/WizardingCode-io/wizardingcode-developer-crew · the core repository (the plugin manifest's homepage and repository).
- https://wizardingcode.io · the author.

## Licence

MIT, as the core.
