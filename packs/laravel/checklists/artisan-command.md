# Artisan command

A console command. The kind where the exit code, the options' defaults and the schedule get forgotten because it ran by hand once.

## Assumed by good practice
- The signature and the description as `#[Signature]` and `#[Description]` attributes (the `$signature` property is still documented), with every option's default stated.
- It returns an explicit exit code and never a bare return.
- Output goes through the command's console methods, so it reads the same on a terminal and in a log.
- It lives in `app/Console/Commands`, which registers it by itself; another directory is added with `withCommands`; a closure command sits in `routes/console.php` through `Artisan::command`.
- It is tested through the console, with its output and exit code asserted.

## Decisions only the user can make
- Whether it runs on a schedule, and on which environment.
- Whether two runs may overlap, or the second must refuse.

## Proposals
- A dry-run option for a command that writes, printing what it would change.
- Progress output for a run longer than a few seconds.

## Warnings
- A destructive command without a guard in production.
- A command that reads the environment directly instead of the configuration, which a cached configuration would ignore.
- A scheduled command whose runs can overlap.
