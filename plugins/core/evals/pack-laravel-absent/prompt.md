---
max_turns: 80
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill]
---

This is a Laravel application with no test runner the engine knows. Add a query scope `scopeActive` to `app/Models/Account.php` (the accounts whose `active` is true) with a test in `tests/Unit/AccountTest.php`, and work it in this checkout as one feature. The tests run with `php artisan test`: pass it to `crew tdd` after `--`, or propose it as the project's test command, and say plainly what is proven. I will not be here to answer questions; take these as my decisions and carry the work through to the end without waiting for me.
