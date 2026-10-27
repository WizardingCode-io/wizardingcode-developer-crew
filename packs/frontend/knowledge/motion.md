# Motion

How each stack animates with its own primitives, and the trap each one carries. Each line is a fact read on 2026-10-27 from the pages listed in the README's sources. The durations, easings and properties a motion is held to are the core's frontend standard (`references/frontend.md` of the crew skill), named here and not copied: this file says where the primitive is, not what value to give it.

## What the model gets wrong

- Vue's `<Transition>` wraps one element or component and applies six enter and leave classes; a `v-if` toggled on first render animates nothing without `appear`, and two elements swapped without `mode="out-in"` overlap. `<TransitionGroup>` animates a list, each child with a unique `key`, with a move class for reordering.
- Nuxt 4 animates route changes with `pageTransition` and `layoutTransition` in `nuxt.config`'s `app` block or per page through `definePageMeta`, built on Vue's `<Transition>`; a page transition set globally and again per page runs the per-page one.
- motion-v 2.8.0 (Motion for Vue) and `motion/react` 14.7.1 give `motion.div` with `initial`, `animate` and `exit`, `AnimatePresence` for an exit on unmount, and `useReducedMotion` on React; an exit animation outside `AnimatePresence` never runs, and a reduced-motion check written once in a component is missed by the next.
- React's `<ViewTransition>` is available only in React's Experimental channel (not in React 19.3's stable release); a stable React project animates a route change through the View Transitions API (`document.startViewTransition`) or a motion library.
- `@starting-style` sets the values an element transitions from on its first style update, which is how an entry transition from `display: none` or the top layer (a popover, a `<dialog>`) works; without it the entry snaps. `transition-behavior: allow-discrete` lets a discrete property such as `display` take part in the transition, so the exit can finish before the element leaves.
- Livewire 4's `wire:transition` uses the browser's View Transitions API; in v3 it wrapped Alpine's `x-transition` with modifiers such as `.opacity`, `.scale` and `.duration.200ms`, which are gone, while basic usage still works.
- Tailwind's `motion-reduce:` variant applies a class under `prefers-reduced-motion: reduce` and `motion-safe:` under its absence; a transition written without either animates for everyone.

## How work is verified

- The fixture's `captureMotion()` samples each interaction of the thesis (frames, `document.getAnimations()`, the reduced-motion pass) into `review/ui/`, and the manifest lists the samples; an animation still running under reduced motion fails the e2e gate.
- The design lint reads the changed files for the mechanical violations before any reviewer; the reviewer judges each sample against the standard's table and each animation against the thesis.
- A stack's own primitive leaves its marks in the diff (`<Transition>`, `definePageMeta`, `motion.div`, `@starting-style`, `wire:transition`), which the reviewer reads with the removed lines.

## Where the documentation is

- Vue `<Transition>`: https://vuejs.org/guide/built-ins/transition.html and `<TransitionGroup>`: https://vuejs.org/guide/built-ins/transition-group.html
- Nuxt 4 page and layout transitions: https://nuxt.com/docs/4.x/getting-started/transitions
- Motion for Vue (motion-v): https://motion.dev/docs/vue and Motion for React: https://motion.dev/docs/react
- React `<ViewTransition>` (Experimental): https://react.dev/reference/react/ViewTransition
- The View Transitions API: https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API
- `@starting-style`: https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style and `transition-behavior`: https://developer.mozilla.org/en-US/docs/Web/CSS/transition-behavior
- Livewire 4 upgrade notes on `wire:transition`: https://livewire.laravel.com/docs/4.x/upgrading
- Tailwind's motion variants: https://tailwindcss.com/docs/hover-focus-and-other-states
