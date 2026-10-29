# wizardingcode-pack-laravel

A stack pack for the WizardingCode Developer Crew: data the crew engine serves, never code. It holds two detector rules (the framework's and Dusk's), four checklists the gap round reads and one knowledge file the expert reads. It has no skill, no agent and no hook; the crew skill reads what the engine prints for it (`crew pack files`), and the engine refuses it whole when a check fails (ADR 0010 of the core repository).

Verified against: Laravel 13.x, Pest 4.x, Pint 1.32.1, Larastan 3.13.2, Livewire 4.x, Dusk 8.7.2 (the Laravel documentation read on 2026-10-24, the Blade, Livewire, Dusk, Vite, Alpine and Tailwind pages on 2026-10-28; the latest 13.x tag on 2026-10-28 was v13.39.0).

## What it changes in a project

- **The profile.** In a project whose folder holds `artisan` and `composer.json`, the laravel rule refines the core's PHP target: the test gate `php artisan test`, the lint gate `vendor/bin/pint --test`, the type-check gate `vendor/bin/phpstan analyse --no-progress` and the scoped test template `php artisan test {files}`, and the target is tagged `laravel`. Each command enters the profile as proposed and runs only once a person confirmed it in that project (`crew profile confirm <gate>`; `crew profile confirm test` confirms the scoped template with the test gate); until then the gate says `unavailable: pack wizardingcode-pack-laravel's command is not confirmed`, and `crew tdd` without `--` refuses it with the same text. A project without Larastan or without a `phpstan.neon` unsets the type-check gate (`crew profile unset typecheck`) or sets its own.
- **The end-to-end gate.** In a project that also holds `tests/DuskTestCase.php`, the dusk rule adds `e2e=php artisan dusk [proposed] (pack wizardingcode-pack-laravel)` to the same target and tags it `dusk` beside `laravel`. The hold applies as to every command of the pack (`crew profile confirm e2e`). The gate runs around the environment the core proposes from `artisan`, `php artisan serve --port 8000`, which is the `APP_URL` Dusk expects at `127.0.0.1:8000`; a change to a `.blade.php` plans the gate, as any interface file does. A project where the gate cannot run (no browser, no ChromeDriver, no served application in that checkout) skips it as the user's decision, `crew skip <id> gate:e2e --reason "<why>"`, the one gate skip the default policy allows; the report then says the item is not proven on that gate.
- **The browser console.** Dusk's `$browser->storeConsoleLog()` writes the browser log under `tests/Browser/console`, a folder the engine never reads, so the e2e gate says `console: not captured` unless the project writes the crew's console file. The override below in `tests/DuskTestCase.php` does: Dusk reads the browser log in the `finally` block of `browse()` through `storeConsoleLogsFor()`, which drains it before any `tearDown` runs, so the file is written there, in place of Dusk's own store for that run, and only when `WIZARDINGCODE_CREW_CONSOLE_FILE` is set and non-empty, so a `php artisan dusk` run outside the crew writes nothing. The path is used as given, never composed with the project's path (the engine sets it to a file in its own artifact folder), and the override creates nothing else. Each entry is one of the JSON array the gate reads, `{ page, type, text }`, with the log's `SEVERE` as `error`, `WARNING` as `warning` and the rest as `log`; each `text` is cut to 2 KiB and the array to 200 entries, so a runaway page fills neither the disk nor the gate line. The browser's text is the application's own output and can carry personal data or secrets: redact before you write what the application prints. The first error or warning fails the gate, as it does under Playwright. The override is written against Dusk 8.7.2's `ProvidesBrowser` and php-webdriver's `getLog('browser')` as read on 2026-10-28 and is not run by this pack's tests (no Dusk and no browser there): a project proves it with one `php artisan dusk` run under the variable that writes the file.

  ```php
  <?php

  namespace Tests;

  use Laravel\Dusk\TestCase as BaseTestCase;

  abstract class DuskTestCase extends BaseTestCase
  {
      // prepare() and driver() as dusk:install wrote them.

      /** The crew's console file, written only under the crew's variable; Dusk's own store otherwise. */
      protected function storeConsoleLogsFor($browsers)
      {
          $file = getenv('WIZARDINGCODE_CREW_CONSOLE_FILE');
          if (! is_string($file) || $file === '') {
              parent::storeConsoleLogsFor($browsers);

              return;
          }
          $entries = is_file($file) ? (json_decode((string) file_get_contents($file), true) ?: []) : [];
          foreach ($browsers as $browser) {
              try {
                  $log = $browser->driver->manage()->getLog('browser');
              } catch (\Throwable) {
                  continue; // a driver without remote logs
              }
              $page = $browser->driver->getCurrentURL();
              foreach ($log as $entry) {
                  if (count($entries) >= 200) {
                      break 2;
                  }
                  $entries[] = [
                      'page' => $page,
                      'type' => match ($entry['level'] ?? '') { 'SEVERE' => 'error', 'WARNING' => 'warning', default => 'log' },
                      'text' => mb_substr((string) ($entry['message'] ?? ''), 0, 2048),
                  ];
              }
          }
          file_put_contents($file, json_encode($entries));
      }
  }
  ```

- **The scoped template.** A todo's gate passes the todo's files to `php artisan test {files}`. Laravel passes the arguments through to Pest or PHPUnit; the Pest and PHPUnit documentation show one file path per run and do not say that several paths run together, so confirm the template in a project where you saw several paths run, or set `crew profile set testScoped "<cmd>"` to what your runner accepts.
- **The test gate and the skeleton's script.** The core detector proposes `composer run test` where `composer.json` has a `test` script; the 13.x skeleton's script runs `php artisan config:clear` before `php artisan test`. The pack's `php artisan test` does not clear the configuration cache: in a project that caches its configuration, clear it before the gate or set the gate to `composer run test`.
- **The expert.** When the item's changed files sit in the tagged target, `crew pack files knowledge --item <id>` prints `knowledge/laravel.md` and the expert reads it before proposing: Laravel 13's facts and, since 2026-10-28, the view layer's (Blade components, Livewire 4's single-file components, `Route::livewire` pages, `wire:model`, `wire:loading`, `wire:navigate` and `wire:transition`, Alpine, Vite with Tailwind 4, Dusk).
- **The gap round.** `crew pack files checklists eloquent-model | job-or-listener | artisan-command` prints the checklist of that kind beside the core's, and `crew pack files checklists screen` prints the pack's screen checklist for Blade and Livewire beside the core's screen checklist. The motion and design-contract checklists of the frontend team pack, `wizardingcode-pack-frontend`, apply to a Laravel screen as to any other; install both where a project has a frontend team.

## Install

From the WizardingCode marketplace, with the core plugin at 0.11.2 or later:

```sh
claude plugin install wizardingcode-pack-laravel@wizardingcode-plugins
```

The engine registers it at the next session start (`crew pack list` shows it). From a checkout of the core repository, in any runtime:

```sh
crew pack add packs/laravel
```

## The cases

The pack ships with the cases that show its difference (`plugins/core/evals` of the core repository). `pack-laravel-refines-the-gates` (a Laravel-shaped tree with the pack registered: the profile's test gate `php artisan test (pack wizardingcode-pack-laravel)`, the knowledge path printed by `crew team`) beside `pack-laravel-absent` (the same tree without the pack: the core's PHP gates and no knowledge path), SP6 Task 6. Their figures are in the SP6 evals record, `docs/evals/2026-10-21-sp6-results.md` of the core repository: on 2026-10-21, one run each with the plugin, the with case passed every grader at its last run (the pack's test gate in the profile with the pack's name, the person's confirmation relayed, the engine's gate red then green through `php artisan test`, the knowledge path in the report, the scope added, an honest ending) and the absent case passed its own at its first (the scope added, no pack gate, no pack in the profile, no knowledge path, an honest ending), so the pair's difference is the pack's three commands and its knowledge file alone, as the pack claims.

`pack-laravel-blade-tags-the-view` (the same tree with its view layer: a Dusk test case, a Blade layout and a welcome page, a feature test red until the alert component exists and the welcome view renders it; the pack registered: the profile's `e2e=php artisan dusk (pack wizardingcode-pack-laravel)` beside the three gates, the tags `laravel` and `dusk`, the pack's screen checklist and the knowledge path named; the `.blade.php` change plans the UI/UX gate, which the sandbox records not run, and the e2e gate is skipped as the person's decision relayed in the prompt, so the item ends not proven and the ending says so) beside `pack-laravel-blade-tags-the-view-absent` (no pack: no e2e gate, no `dusk` tag, no screen checklist, no knowledge path), SP9 Task 13. Their figures are in `docs/evals/2026-10-28-sp9-task-13-results.md` of the core repository: on the final bundle of 2026-10-29, one run each, both cases passed every grader (the with case: the dusk rule's e2e line with the pack's name, the tags `laravel` and `dusk`, the core's and the pack's screen checklists read through `crew pack files checklists screen`, the knowledge path, the UI/UX gate recorded not run, the component, an ending that says what is not proven and why; the absent case: none of the pack's marks, the component, an honest ending), so the pair's difference is the pack's dusk rule, its screen checklist and its knowledge file.

## Sources read on 2026-10-28

Every URL the pack's files name, with the claim it supports. The Laravel 13 pages were read on 2026-10-24 and their claims stand; the view layer's pages (Blade, Livewire 4, Dusk, Vite, Tailwind, Alpine) and the registries were read on 2026-10-28.

- https://laravel.com/docs/13.x/releases · Laravel 13 is the current major (PHP 8.3 to 8.5; bug fixes until Q3 2027, security fixes until 2028-03-17; Laravel 12 in security fixes alone, 11 out of support); majors yearly, minors weekly; the constraint `^13.0`; the first-party attributes.
- https://github.com/laravel/framework/releases · the latest tag on 2026-10-28, v13.39.0 (2026-10-27).
- https://laravel.com/docs/13.x/upgrade · `PreventRequestForgery` and the `Sec-Fetch-Site` check, the deprecated aliases; `phpunit/phpunit ^12.0` and `pestphp/pest ^4.0`; `serializable_classes`, the session `serialization` option; `JobAttempted::$exception`, `QueueBusy::$connectionName`; a model created during `boot` throws.
- https://laravel.com/docs/13.x/structure · the `app` directory holds `Http`, `Models` and `Providers` by default; the other directories are created by the `make:*` commands.
- https://laravel.com/docs/13.x/installation · a new application's `.env` points at SQLite.
- https://raw.githubusercontent.com/laravel/laravel/13.x/bootstrap/app.php · the skeleton's configuration file (`withRouting`, `withMiddleware`, `withExceptions`, `routes/console.php`, the `health` endpoint).
- https://laravel.com/docs/13.x/middleware · middleware appended, aliased and grouped in `bootstrap/app.php`; the `web` group's `PreventRequestForgery`.
- https://laravel.com/docs/13.x/eloquent-mutators · the `casts()` method and `Attribute::make`.
- https://laravel.com/docs/13.x/artisan · `#[Signature]` and `#[Description]`, the `$signature` property still documented; `app/Console/Commands` registered by itself, `withCommands`, closure commands in `routes/console.php`.
- https://laravel.com/docs/13.x/queues · `ShouldQueue`, the `database` connection as the default, `afterCommit`, `Queueable` serialising models, `#[Tries]` and `#[Timeout]`, `Queue::fake()`.
- https://laravel.com/docs/13.x/events · listeners discovered from `app/Listeners`, `event:list`, `make:listener --event=`, `ShouldQueueAfterCommit`, `Event::fake()`.
- https://laravel.com/docs/13.x/routing · `route:list` and its options.
- https://laravel.com/docs/13.x/migrations · `migrate:fresh` drops every table, `--database=`.
- https://laravel.com/docs/13.x/database-testing · `RefreshDatabase` wraps each test in a transaction once the schema is current; `DatabaseMigrations` and `DatabaseTruncation` are slower.
- https://raw.githubusercontent.com/laravel/laravel/13.x/phpunit.xml · the skeleton's tests run on SQLite `:memory:`.
- https://raw.githubusercontent.com/laravel/laravel/13.x/composer.json · the skeleton requires `phpunit/phpunit ^12.5.12` and `laravel/pint ^1.27`; its `test` script runs `config:clear` then `php artisan test`.
- https://laravel.com/docs/13.x/testing · Pest and PHPUnit supported out of the box; `php artisan test` passes its arguments through; `--parallel`, `--coverage`, `--profile`; clear the configuration cache before the tests.
- https://pestphp.com/docs/installation · Pest requires PHP 8.4 and is installed with `composer require pestphp/pest --dev --with-all-dependencies`.
- https://pestphp.com/docs/cli-api-reference · `--filter`, `--compact`, `--bail`, `--parallel`.
- https://pestphp.com/docs/filtering-tests · a file runs by its path as the first argument; `--dirty`.
- https://docs.phpunit.de/en/12.5/textui.html · one file path per run shown; `--filter`.
- https://laravel.com/docs/13.x/pint · `--test` inspects without writing and exits non-zero on an error; `--dirty`, `--diff=main`, `--repair`, `--parallel`; the `laravel` preset; Pint installed with every new application.
- https://github.com/larastan/larastan · PHP 8.2+, Laravel 11.15+, `larastan/larastan:^3.0`, the `phpstan.neon` with the extension, `paths` and `level`.
- https://phpstan.org/user-guide/command-line-usage · `--no-progress`.
- https://phpstan.org/user-guide/rule-levels · levels 0 to 10, `--level max`.
- https://packagist.org/packages/laravel/pint · Pint 1.32.1 (2026-09-10).
- https://packagist.org/packages/larastan/larastan · Larastan 3.13.2 (2026-10-23), PHPStan ^2.3.
- https://packagist.org/packages/pestphp/pest · Pest 5.3.4 on 2026-10-28 requires PHP ^8.4; the latest 4.x read on 2026-10-24 was 4.7.8.
- https://laravel.com/docs/13.x/blade · `{{ }}` against `{!! !!}`, `@js`, `@vite`, `@fonts`, `@class`, `@checked` and its siblings, `@session`, `@once` and `@pushOnce`, `@includeIsolated`, `@verbatim`; class and anonymous components, `make:component`, `@props`, `$attributes->merge` and `->class`, slots, `@aware`, index components, no directive inside a component tag.
- https://laravel.com/docs/13.x/dusk · `laravel/dusk --dev`, `dusk:install`, `tests/DuskTestCase.php` with `prepare()` and `driver()` on port 9515, `php artisan dusk`, `dusk:fails`, `--group`, `.env.dusk.local`, `DatabaseMigrations` and `DatabaseTruncation` against `RefreshDatabase`, no in-memory SQLite, `@` selectors on `dusk` attributes, `waitFor` and `waitForText`, `screenshot`, `storeConsoleLog` under `tests/Browser/console`, `storeSource`; CI with `php artisan serve --no-reload &` and `APP_URL` at `127.0.0.1:8000`; Pest 4's browser testing recommended for new projects.
- https://raw.githubusercontent.com/laravel/dusk/8.x/src/Concerns/ProvidesBrowser.php · `browse()` stores the console in its `finally` block through `storeConsoleLogsFor()` and then closes every browser but the primary; `tearDownDuskClass()` closes all; no per-test `tearDown` (the README's override).
- https://raw.githubusercontent.com/laravel/dusk/8.x/src/Browser.php · `storeConsoleLog()` reads `$this->driver->manage()->getLog('browser')`, drops the ignored messages and writes a pretty-printed JSON file under the console folder; `$driver` is the public `RemoteWebDriver`.
- https://laravel.com/docs/13.x/vite · `vite.config.js` with `laravel-vite-plugin`, the `input` entries and `refresh`, `@vite` in the head, `npm run dev` and `npm run build`, `public/build`, the `@` alias, `@viteReactRefresh`.
- https://tailwindcss.com/docs/installation/framework-guides/laravel/vite · `tailwindcss` and `@tailwindcss/vite`, the plugin in `vite.config`, `@import "tailwindcss"` and `@source` in `resources/css/app.css`.
- https://alpinejs.dev/start-here · `x-data` on a parent, `x-on` and `@`, `x-text`, `x-show`, `x-bind` and `:`, `x-model`, `x-for` on a `<template>` with `:key`, the CDN script with `defer`.
- https://livewire.laravel.com/docs/4.x/quickstart · `composer require livewire/livewire`, `make:livewire pages::post.create` and the ⚡ file, `livewire:layout` and `layouts::app` with `@livewireStyles` and `@livewireScripts`, one root element, `Route::livewire()`.
- https://livewire.laravel.com/docs/4.x/components · single-file components by default, `--mfc`, `--class` under `app/Livewire`, `livewire:convert`, `<livewire:post.create />` with the tag closed, namespaces and folders.
- https://livewire.laravel.com/docs/4.x/pages · `Route::livewire`, `#[Layout]` and `#[Title]`, `->layout()` and `->title()`, named layout slots, route parameters and model binding into `mount()`.
- https://livewire.laravel.com/docs/4.x/lifecycle-hooks · `mount`, `boot`, `hydrate`, `dehydrate`, `updating` and `updated` with their property forms, `rendering` and `rendered`, `exception`, the trait hooks.
- https://livewire.laravel.com/docs/4.x/computed-properties · `#[Computed]`, `$this->name` in the template, memoised per request, `unset`, `persist: true`, `cache: true`.
- https://livewire.laravel.com/docs/4.x/forms · `wire:model` deferred by default, `.live` with the 250 ms debounce, `.live.debounce.150ms`, `.live.throttle.150ms`, `.live.blur`, `#[Validate]` and `rules()` with `$this->validate()`, `@error`, `livewire:form` and `Livewire\Form`, `$this->reset()` and `$this->pull()`, `wire:dirty`.
- https://livewire.laravel.com/docs/4.x/actions · `wire:click`, `wire:submit`, `wire:keydown` and the modifiers, `wire:confirm`, `.async` and `#[Async]`, `#[Renderless]` and `skipRender()`, `.preserve-scroll`, the magic actions and `$event`, `$wire`, `$js`; every public method callable from the browser.
- https://livewire.laravel.com/docs/4.x/wire-loading · `.remove`, `.class`, `.class.remove`, `.attr`, `wire:target` and `.except`, the delay modifiers (50 to 1000 ms, 200 by default), the display modifiers, the `data-loading` attribute.
- https://livewire.laravel.com/docs/4.x/nesting · `:$post`, `:wire:key` in a loop, `#[Reactive]`, one `#[Modelable]`, `$parent`, events with `#[On]`, each component an island, `<livewire:slot>`.
- https://livewire.laravel.com/docs/4.x/alpine · Alpine bundled and injected, `$wire`, `$wire.entangle` discouraged and `@entangle` deprecated, `@js`, `@livewireScriptConfig` and `Livewire.start()`.
- https://livewire.laravel.com/docs/4.x/navigate · prefetch on mouse-down and `.hover` after 60 ms, `@persist` outside components, `wire:navigate:scroll`, `data-current` and `wire:current`, the three events, `data-navigate-once` and `data-navigate-track`, the progress bar after 150 ms and its two config keys.
- https://livewire.laravel.com/docs/4.x/wire-transition · the View Transitions API, `.navigate`, named transitions and the `::view-transition-*` pseudo-elements, `#[Transition]` and `skip`, off under reduced motion, Chrome and Edge 111, Safari 18, Firefox 144 without types.
- https://livewire.laravel.com/docs/4.x/upgrading · `component_layout`, `component_placeholder`, `smart_wire_keys`, `wire:navigate:scroll`, `wire:model` and `.deep`, closed tags, the removed `wire:transition` modifiers, `stream(el:)`, the `/livewire-{hash}/` endpoint, the Volt migration; islands, `#[Lazy]` bundles, `wire:sort`, `wire:intersect`, `wire:ref`, `data-loading`.
- https://livewire.laravel.com/docs/4.x/testing · `Livewire::test()` and its assertions, `assertSeeLivewire`, `Livewire::actingAs`, `withQueryParams`, `Livewire::visit()` on the Pest browser plugin.
- https://packagist.org/packages/livewire/livewire · livewire/livewire 4.4.8 (2026-10-21), PHP ^8.1.
- https://packagist.org/packages/laravel/dusk · laravel/dusk 8.7.2 (2026-10-07).
- https://www.npmjs.com/package/alpinejs · alpinejs 3.17.5.
- https://www.npmjs.com/package/tailwindcss · tailwindcss 4.3.3.
- https://www.npmjs.com/package/@tailwindcss/vite · @tailwindcss/vite 4.3.3.
- https://www.npmjs.com/package/laravel-vite-plugin · laravel-vite-plugin 3.2.0, Vite ^8 as its peer.
- https://github.com/WizardingCode-io/wizardingcode-developer-crew · the core repository (the plugin manifest's homepage and repository).
- https://wizardingcode.io · the author.

## Licence

MIT, as the core.
