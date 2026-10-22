# wizardingcode-pack-laravel

A stack pack for the WizardingCode Developer Crew: data the crew engine serves, never code. It holds one detector rule, three checklists the gap round reads and one knowledge file the expert reads. It has no skill, no agent and no hook; the crew skill reads what the engine prints for it (`crew pack files`), and the engine refuses it whole when a check fails (ADR 0010 of the core repository).

Verified against: Laravel 13.x, Pest 4.x, Pint 1.32.1, Larastan 3.13.0 (the documentation read on 2026-10-20; the day's latest tag was v13.38.0).

## What it changes in a project

- **The profile.** In a project whose folder holds `artisan` and `composer.json`, the rule refines the core's PHP target: the test gate `php artisan test`, the lint gate `vendor/bin/pint --test`, the type-check gate `vendor/bin/phpstan analyse --no-progress` and the scoped test template `php artisan test {files}`, and the target is tagged `laravel`. Each command enters the profile as proposed and runs only once a person confirmed it in that project (`crew profile confirm <gate>`; `crew profile confirm test` confirms the scoped template with the test gate); until then the gate says `unavailable: pack wizardingcode-pack-laravel's command is not confirmed`, and `crew tdd` without `--` refuses it with the same text. A project without Larastan or without a `phpstan.neon` unsets the type-check gate (`crew profile unset typecheck`) or sets its own.
- **The scoped template.** A todo's gate passes the todo's files to `php artisan test {files}`. Laravel passes the arguments through to Pest or PHPUnit; the Pest and PHPUnit documentation show one file path per run and do not say that several paths run together, so confirm the template in a project where you saw several paths run, or set `crew profile set testScoped "<cmd>"` to what your runner accepts.
- **The test gate and the skeleton's script.** The core detector proposes `composer run test` where `composer.json` has a `test` script; the 13.x skeleton's script runs `php artisan config:clear` before `php artisan test`. The pack's `php artisan test` does not clear the configuration cache: in a project that caches its configuration, clear it before the gate or set the gate to `composer run test`.
- **The expert.** When the item's changed files sit in the tagged target, `crew pack files knowledge --item <id>` prints `knowledge/laravel.md` and the expert reads it before proposing.
- **The gap round.** `crew pack files checklists eloquent-model | job-or-listener | artisan-command` prints the checklist of that kind beside the core's.

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

The pack ships with the cases that show its difference (`plugins/core/evals` of the core repository, SP6 Task 6): `pack-laravel-refines-the-gates` (a Laravel-shaped tree with the pack registered: the profile's test gate `php artisan test (pack wizardingcode-pack-laravel)`, the knowledge path printed by `crew team`) beside `pack-laravel-absent` (the same tree without the pack: the core's PHP gates and no knowledge path). Their figures are in the SP6 evals record, `docs/evals/2026-10-21-sp6-results.md` of the core repository: on 2026-10-21, one run each with the plugin, the with case passed every grader at its last run (the pack's test gate in the profile with the pack's name, the person's confirmation relayed, the engine's gate red then green through `php artisan test`, the knowledge path in the report, the scope added, an honest ending) and the absent case passed its own at its first (the scope added, no pack gate, no pack in the profile, no knowledge path, an honest ending), so the pair's difference is the pack's three commands and its knowledge file alone, as the pack claims.

## Sources read on 2026-10-20

Every URL the pack's files name, with the claim it supports.

- https://laravel.com/docs/13.x/releases · Laravel 13 is the current major (PHP 8.3 to 8.5; bug fixes until Q3 2027, security fixes until 2028-03-17; Laravel 12 in security fixes alone, 11 out of support); majors yearly, minors weekly; the constraint `^13.0`; the first-party attributes.
- https://github.com/laravel/framework/releases · the latest tag on the day, v13.38.0.
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
- https://packagist.org/packages/larastan/larastan · Larastan 3.13.0 (2026-10-07), PHPStan ^2.3.
- https://packagist.org/packages/pestphp/pest · Pest 5.3.3 (2026-10-18) requires PHP ^8.4; the latest 4.x is 4.7.8.
- https://github.com/WizardingCode-io/wizardingcode-developer-crew · the core repository (the plugin manifest's homepage and repository).
- https://wizardingcode.io · the author.

## Licence

MIT, as the core.
