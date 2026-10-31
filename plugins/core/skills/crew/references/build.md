# Build

For each criterion, in this order:

1. Write the test that expresses the criterion. It must fail because the behaviour does not exist yet.
2. `crew tdd red <id> <criterion>`: the engine runs the test command and records the failure. If the test passes, the engine rejects the run: a test that passes before the code exists proves nothing. Rewrite the test.
3. Write the smallest code that makes the test pass.
4. `crew tdd green <id> <criterion>`: the engine records the pass. A green with no earlier red is rejected.
5. Refactor if the code asks for it, keeping the tests green.

Use `-- <command>` after the criterion to run a single test file instead of the whole suite; the full suite runs at the gate. The words after `--` keep their boundaries: one quoted string is the whole command line (`-- "cd packages/api && bun test tests/cart.test.ts"`), several words are a command and its arguments, each quoted by the engine (`-- sh -c "a && b"` reaches the shell as `sh -c 'a && b'`). A shell given `-c` and more than one word after it is refused, since the shell would run only the first word; quote the command string as one argument. The command must be a test run, read before it runs (finding 153): before the test only `cd`, `export`, `set` or `VAR=value`; the test a runner in its test form (`bun test`, `node --test`, `npm test`, `npm run <script naming test>`, `vitest`, `jest`, `pytest`, `php artisan test`, `go test`, `cargo test` and the like) or an interpreter on a test file of the repository (`sh tests/run.sh`, `node tests/x.test.mjs`); after it only `| tee` or `| cat`; the profile's own test command always counts. `sh -c 'exit 1'`, `false`, `npm run build` are refused, with nothing run or recorded.

A feature whose end-to-end path differs from its unit path (a seat planned at two call sites, a watch filter upstream of a glob) is proven by a CLI row through the real flow, beside the unit test (finding 117). An `observed` criterion is refused where a stub makes a test possible: write the stub and the test instead (finding 115).

For a `preserve` criterion: `crew tdd before <id> <criterion>` with the tests passing, make the change, `crew tdd after <id> <criterion>`.

For an `observed` criterion: make the change, then `crew tdd observed <id> <criterion> --reason "<why no red run can exist>"` with the run passing. The reason is in the record and the report; a missing reason is refused.

A new site is built through `wizardingcode-design-build`. For an interface item, read `references/frontend.md` and the project's `DESIGN.md` before the first interface file; write no raw value where a token exists; give every declared state its branch and its `capture()`; animate only from the thesis, with the table's values.

## Design rules

Comments, docstrings, documents and commit messages follow `references/writing.md`: a comment says why, never narrates the change; the prose gate refuses the artefacts a chat model leaves.

- **Single responsibility.** A function or a class does one thing; a file holds things that change together.
- **Open for extension, closed for modification.** Add behaviour by adding code, not by editing every caller.
- **Depend on abstractions** at the boundaries that will change (storage, network, time), and on concrete code everywhere else.
- **Keep it simple.** No configuration, abstraction or generality the criteria do not need. Three similar lines beat a premature helper.
- **Follow the project's conventions** for naming, structure and error handling, even where you would choose differently.

A red is traced to its origin and resolved, never skipped or passed. A red that cannot happen is a question about the design, answered before the code: a check that cannot fail is made real in code the test then drives (a guard over a state already correct becomes a function the project calls, whose absence is the red), or the criterion's kind is wrong (`observed` when no red run can exist, `preserve` for what stays green: `references/specify.md`). `crew skip` is only for a step `policy.json` lists, a person's decision, and it appears in the report.

When a todo of the plan is done (a handed-out task merged, or an inline todo committed and noted with `crew task <id> note T-n --criteria AC-k --scope <path>`), close it: `crew task <id> gate T-n` runs the deterministic gates on the files it touched, then `crew task <id> brief T-n` writes what changed, what was proven and what is left (`references/plan.md`, "The todo loop"). Two failing gate rounds wait for a person.

When the work is ready, `crew gate run <id>`: the gate run moves the item into the gate phase itself (and to deliver when it proves the work).
