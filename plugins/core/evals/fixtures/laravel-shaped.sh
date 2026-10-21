#!/bin/sh
# evals/fixtures/laravel-shaped.sh: a Laravel-shaped tree with no framework (SP6 Task 6, decision 12):
# composer.json names laravel/framework and no scripts, so the core's detector gives no test gate and finds pint
# and phpstan; pint and phpstan are shell scripts, artisan a PHP script run by the machine's php, and `artisan
# test` fails until app/Models/Account.php holds the scope the request asks (a real red-then-green gate).
# Sourced by a case's fixture.sh, which registers the pack or not, commits once and detects the profile.
set -eu
# One commit of the fixture's own, with a name no project has (finding 96).
fixture_commit() {
  git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "$1"
}
git init -q -b main
cat > composer.json <<'EOF'
{
  "name": "fixture/shop",
  "type": "project",
  "require": { "php": "^8.3", "laravel/framework": "^13.0" },
  "autoload": { "psr-4": { "App\\": "app/" } }
}
EOF
cat > phpunit.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<phpunit bootstrap="vendor/autoload.php" colors="true">
  <testsuites>
    <testsuite name="Unit">
      <directory>tests/Unit</directory>
    </testsuite>
  </testsuites>
</phpunit>
EOF
mkdir -p app/Models tests/Unit vendor/bin
cat > app/Models/Account.php <<'EOF'
<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Account extends Model
{
    protected $fillable = ['email', 'active'];
}
EOF
cat > tests/Unit/AccountTest.php <<'EOF'
<?php

namespace Tests\Unit;

use App\Models\Account;
use PHPUnit\Framework\TestCase;

class AccountTest extends TestCase
{
    public function test_an_account_is_fillable(): void
    {
        $this->assertContains('email', (new Account())->getFillable());
    }
}
EOF
cat > artisan <<'EOF'
#!/usr/bin/env php
<?php
// The fixture's artisan, a PHP script with no framework: `test` passes once the model holds the active
// scope the request asks, fails before. It runs through the machine's php: a session's PATH is Claude
// Code's, never the runner's, so no shim on the runner's PATH can stand in for php inside a run.
$command = $argv[1] ?? '';
if ($command === 'test') {
    $model = file_get_contents(__DIR__ . '/app/Models/Account.php');
    if (preg_match('/scopeActive|#\[Scope\]/', $model)) {
        echo "   PASS  Tests\\Unit\\AccountTest\n";
        echo "  \u{2713} an account is fillable\n";
        echo "  \u{2713} active accounts are scoped\n";
        echo "  Tests:    2 passed (2 assertions)\n";
        exit(0);
    }
    echo "   FAIL  Tests\\Unit\\AccountTest\n";
    echo "  \u{2a2f} active accounts are scoped: Call to undefined method App\\Models\\Account::active()\n";
    echo "  Tests:    1 failed, 1 passed (2 assertions)\n";
    exit(1);
}
echo 'artisan: ' . implode(' ', array_slice($argv, 1)) . "\n";
exit(0);
EOF
printf '#!/bin/sh\necho "  PASS  ........ 3 files"\nexit 0\n' > vendor/bin/pint
printf '#!/bin/sh\necho " [OK] No errors"\nexit 0\n' > vendor/bin/phpstan
chmod +x artisan vendor/bin/pint vendor/bin/phpstan
