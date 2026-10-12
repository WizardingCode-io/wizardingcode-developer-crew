# Build

For each criterion, in this order:

1. Write the test that expresses the criterion. It must fail because the behaviour does not exist yet.
2. `crew tdd red <id> <criterion>`: the engine runs the test command and records the failure. If the test passes, the engine rejects the run: a test that passes before the code exists proves nothing. Rewrite the test.
3. Write the smallest code that makes the test pass.
4. `crew tdd green <id> <criterion>`: the engine records the pass. A green with no earlier red is rejected.
5. Refactor if the code asks for it, keeping the tests green.

Use `-- <command>` after the criterion to run a single test file instead of the whole suite; the full suite runs at the gate.

For a `preserve` criterion: `crew tdd before <id> <criterion>` with the tests passing, make the change, `crew tdd after <id> <criterion>`.

## Design rules

- **Single responsibility.** A function or a class does one thing; a file holds things that change together.
- **Open for extension, closed for modification.** Add behaviour by adding code, not by editing every caller.
- **Depend on abstractions** at the boundaries that will change (storage, network, time), and on concrete code everywhere else.
- **Keep it simple.** No configuration, abstraction or generality the criteria do not need. Three similar lines beat a premature helper.
- **Follow the project's conventions** for naming, structure and error handling, even where you would choose differently.

When a criterion cannot be tested automatically, say so and let the user decide: `crew skip <id> tdd:<criterion> --reason "<why>"`. The skip appears in the report.

When the work is ready, `crew gate run <id>`: the gate run moves the item into the gate phase itself (and to deliver when it proves the work).
