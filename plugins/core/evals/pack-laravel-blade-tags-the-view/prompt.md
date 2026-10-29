---
max_turns: 80
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill]
---

This is a Laravel application with Blade views. Add an anonymous Blade component `resources/views/components/alert.blade.php` (a `type` prop, `success` or `error`; a `<div role="alert">` that renders the slot with the type as a class) and show the session's `status` with it on `resources/views/welcome.blade.php`; the feature test is `tests/Feature/WelcomeTest.php`. Work it in this checkout as one feature. The project's commands come from the laravel pack: show me them with `crew profile`, then confirm the test, lint and type-check commands: they are mine. The end-to-end gate's `php artisan dusk` cannot run in this checkout (no browser, no ChromeDriver, no served app): skip that gate with this reason, as my decision. The UI/UX gate has no evidence here: record it not run with that reason and say so. I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
