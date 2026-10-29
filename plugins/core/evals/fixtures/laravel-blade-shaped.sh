#!/bin/sh
# evals/fixtures/laravel-blade-shaped.sh: the Laravel-shaped tree of laravel-shaped.sh with its view layer (SP9 Task 13):
# a Dusk test case (the laravel pack's dusk rule then proposes `php artisan dusk` as the e2e gate and tags the target
# `dusk`), a Blade layout and a welcome page under resources/views, the Vite entries, and a feature test red until the
# alert component the request asks exists and the welcome view renders it. artisan is rewritten: `test` reads three files
# by literal path and calls nothing else (the inert rule of the pairs, in PHP's shapes: eval-runner.test.ts); `dusk`,
# `serve` and the rest print one line. The pint and phpstan shell stubs are laravel-shaped.sh's, unchanged. Sourced by a
# case's fixture.sh, which registers the pack or not, commits once and detects the profile.
. "$(dirname "$0")/../fixtures/laravel-shaped.sh"
mkdir -p tests/Feature resources/views/components/layouts resources/css resources/js
cat > phpunit.xml <<'XML'
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="vendor/autoload.php" colors="true">
  <testsuites>
    <testsuite name="Unit">
      <directory>tests/Unit</directory>
    </testsuite>
    <testsuite name="Feature">
      <directory>tests/Feature</directory>
    </testsuite>
  </testsuites>
</phpunit>
XML
cat > tests/DuskTestCase.php <<'PHP'
<?php

namespace Tests;

// The browser test case `php artisan dusk:install` writes: it extends Laravel\Dusk\TestCase, prepare() starts
// ChromeDriver and driver() connects on port 9515. This fixture has no framework: the file marks the tree for
// the laravel pack's dusk rule, and nothing in it runs.
abstract class DuskTestCase
{
}
PHP
cat > tests/Feature/WelcomeTest.php <<'PHP'
<?php

namespace Tests\Feature;

use Tests\TestCase;

class WelcomeTest extends TestCase
{
    public function test_the_welcome_page_shows_the_status_in_an_alert(): void
    {
        $response = $this->withSession(['status' => 'Order placed'])->get('/');

        $response->assertOk();
        $response->assertSee('role="alert"', false);
        $response->assertSee('Order placed');
    }
}
PHP
# The layout as an anonymous component, where <x-layouts.app> resolves.
cat > resources/views/components/layouts/app.blade.php <<'BLADE'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title ?? 'Shop' }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body>
    {{ $slot }}
</body>
</html>
BLADE
cat > resources/views/welcome.blade.php <<'BLADE'
<x-layouts.app>
    <h1>Shop</h1>
</x-layouts.app>
BLADE
printf '@import "tailwindcss";\n' > resources/css/app.css
printf "// The application's entry, built by Vite.\n" > resources/js/app.js
cat > artisan <<'PHP'
#!/usr/bin/env php
<?php
// The fixture's artisan, a PHP script with no framework (SP9 Task 13): `test` passes once the alert component
// the request asks exists with role="alert", the welcome view renders it and the shipped feature test asserts
// it, and fails naming the first missing part. It reads the three files by literal path beside __DIR__ and
// calls nothing else; `dusk`, `serve` and the rest print one line. It runs through the machine's php.
$command = $argv[1] ?? '';
if ($command === 'test') {
    $failure = '';
    if (!file_exists(__DIR__ . '/resources/views/components/alert.blade.php')) {
        $failure = 'View [components.alert] not found.';
    } elseif (!str_contains(file_get_contents(__DIR__ . '/resources/views/components/alert.blade.php'), 'role="alert"')) {
        $failure = 'the alert component has no role="alert"';
    } elseif (!str_contains(file_get_contents(__DIR__ . '/resources/views/welcome.blade.php'), '<x-alert')) {
        $failure = 'the welcome view does not render <x-alert>';
    } elseif (!file_exists(__DIR__ . '/tests/Feature/WelcomeTest.php') || !str_contains(file_get_contents(__DIR__ . '/tests/Feature/WelcomeTest.php'), 'role="alert"')) {
        $failure = 'tests/Feature/WelcomeTest.php does not assert the alert';
    }
    if ($failure === '') {
        echo "   PASS  Tests\\Feature\\WelcomeTest\n";
        echo "  \u{2713} the welcome page shows the status in an alert\n";
        echo "  Tests:    1 passed (3 assertions)\n";
        exit(0);
    }
    echo "   FAIL  Tests\\Feature\\WelcomeTest\n";
    echo "  \u{2a2f} the welcome page shows the status in an alert: " . $failure . "\n";
    echo "  Tests:    1 failed (1 assertions)\n";
    exit(1);
}
echo 'artisan: ' . implode(' ', array_slice($argv, 1)) . "\n";
exit(0);
PHP
chmod +x artisan
