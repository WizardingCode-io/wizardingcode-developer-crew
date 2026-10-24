# Build

For each criterion, in this order:

1. Write the test that expresses the criterion. It must fail because the behaviour does not exist yet.
2. `crew tdd red <id> <criterion>`: the engine runs the test command and records the failure. If the test passes, the engine rejects the run: a test that passes before the code exists proves nothing. Rewrite the test.
3. Write the smallest code that makes the test pass.
4. `crew tdd green <id> <criterion>`: the engine records the pass. A green with no earlier red is rejected.
5. Refactor if the code asks for it, keeping the tests green.

Use `-- <command>` after the criterion to run a single test file instead of the whole suite; the full suite runs at the gate. The words after `--` keep their boundaries: one quoted string is the whole command line (`-- "bun run check && bun run plugin:check"`), several words are a command and its arguments, each quoted by the engine (`-- sh -c "a && b"` reaches the shell as `sh -c 'a && b'`). A shell given `-c` and more than one word after it is refused, since the shell would run only the first word; quote the command string as one argument.

A feature whose end-to-end path differs from its unit path (a seat planned at two call sites, a watch filter upstream of a glob) is proven by a CLI row through the real flow, beside the unit test (finding 117). An `observed` criterion is refused where a stub makes a test possible: write the stub and the test instead (finding 115).

For a `preserve` criterion: `crew tdd before <id> <criterion>` with the tests passing, make the change, `crew tdd after <id> <criterion>`.

For an `observed` criterion: make the change, then `crew tdd observed <id> <criterion> --reason "<why no red run can exist>"` with the run passing. The reason is in the record and the report; a missing reason is refused.

## Design rules

- **Single responsibility.** A function or a class does one thing; a file holds things that change together.
- **Open for extension, closed for modification.** Add behaviour by adding code, not by editing every caller.
- **Depend on abstractions** at the boundaries that will change (storage, network, time), and on concrete code everywhere else.
- **Keep it simple.** No configuration, abstraction or generality the criteria do not need. Three similar lines beat a premature helper.
- **Follow the project's conventions** for naming, structure and error handling, even where you would choose differently.

When a criterion cannot be tested automatically, say so and let the user decide: `crew skip <id> tdd:<criterion> --reason "<why>"`. The skip appears in the report.

When a todo of the plan is done (a handed-out task merged, or an inline todo committed and noted with `crew task <id> note T-n --criteria AC-k --scope <path>`), close it: `crew task <id> gate T-n` runs the deterministic gates on the files it touched, then `crew task <id> brief T-n` writes what changed, what was proven and what is left (`references/plan.md`, "The todo loop"). Two failing gate rounds wait for a person.

When the work is ready, `crew gate run <id>`: the gate run moves the item into the gate phase itself (and to deliver when it proves the work).
