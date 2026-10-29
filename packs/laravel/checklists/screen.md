# Screen

A Blade view, a Livewire component, a layout: what a person sees in a Laravel application. The core's screen checklist sets the states, the widths and the captures; this one adds what Blade and Livewire 4 get wrong.

## Assumed by good practice
- A Blade component for what repeats across views, with `@props` typed and defaulted, `$attributes->merge` or `$attributes->class` on the root element, and its view under `resources/views/components`.
- Output escaped with `{{ }}`; `@js` for the data Alpine reads; `{!! !!}` only on HTML the application built itself.
- One root element per Livewire component; `:wire:key` on every element rendered in a loop; `wire:model` deferred unless the screen needs `.live`, and `.live.debounce` on a search field.
- `wire:loading` or `data-loading` on every action that waits for the server; `wire:transition` leaves reduced motion to Livewire, which turns its transitions off under `prefers-reduced-motion: reduce`, and an animation of the project's own beside it gets its own reduced-motion branch.
- `@vite` in the layout alone; the `dusk` attribute on what a browser test clicks, read by `@` selectors.

## Decisions only the user can make
- A Livewire component against a Blade component with Alpine for an interaction that stays in the browser.
- A full page through `Route::livewire` with `#[Layout]` against a Blade view with a controller.
- `.live` on an input, which sends a request per keystroke, against an update on blur or on submit.
- Where a flash message lives (the session's `status`, a Livewire event, both) and which screens show it.

## Proposals
- A Livewire test per component with `Livewire::test()`, `set`, `call` and `assertSee`, beside the feature test of the page.
- A browser test of the flow with Dusk or Pest's browser plugin, and the `DuskTestCase` override the pack's README gives, so the e2e gate reads the browser console.
- A `@pushOnce` for a script a component needs once per page.

## Warnings
- Every public method of a Livewire component is callable from the browser: authorise on the server, keep helpers `protected`, never trust a public property's value.
- A model in a public property is reloaded on every request and its hidden attributes may reach the browser.
- `@entangle` is deprecated in 4; `$wire.entangle` is discouraged; `wire:transition.opacity`, `.scale`, `.duration` and `.origin` are gone.
- `wire:model.live` on every field, a missing `wire:key` in a loop, a second root element: the component re-renders wrong.
- `{!! !!}` on user input.
