# Test quality rubric

The test-quality gate asks whether the tests prove the criteria: for each behaviour, a test that would fail if the behaviour broke, and nothing that passes by construction. Where the stack has a mutation tool, its score is the deterministic input; otherwise the reviewer reads.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the criteria with their kinds (`behavior`, `preserve`, `observed`), the recorded reason of each `observed` criterion and, when the profile has Stryker or Infection, the path of its report on the item's files.

## Questions

1. Per `behavior` criterion: which test fails if the behaviour is reverted? Read the assertion against the code: a test that would still pass with the change undone proves nothing.
2. True by construction: does any test assert its own mock's return, its own fixture's content, only that nothing threw, or a snapshot taken from the code under test with no expectation stated?
3. Per `preserve` criterion: does it name the tests it relies on, and do those tests exercise the preserved behaviour rather than only compile?
4. Per `observed` criterion: does the recorded reason hold? Could the test have been made to fail first (a stub answering wrong, a route removed)? If so, the reason is false.
5. Behaviour, not implementation: where the criterion is a behaviour, does the test assert what a caller sees rather than private names, call counts or the order of internal calls?
6. Readable as the criterion: do the test's name and failure message say which criterion broke?
7. Mutation: when a report exists, a survived mutant on a line of the diff is a test that does not fail when the code changes; name the mutant and the line.
8. Fixtures: does any fixture name a client, a customer or a real workspace? Fixtures use neutral names (a, b, storefront, crm, shop); a real name is a defect.
9. Strategy and levels, when the diff adds a test for a path that differs end to end (a route, a command, a job): is there a test through the real flow beside the unit test, at the level the project's suite already uses for that kind of code? The rule: `wizardingcode-qa-test-design`.
10. Flaky tests and determinism, when the diff adds or changes a retry, a skip, a raised timeout, a sleep, or a test that reads the clock, randomness, the run order or the network: does the change hide a red rather than trace it to its origin, and does the test use the framework's fake clock or seed where it has one? The rule: `wizardingcode-qa-proof`.
11. Test doubles and boundaries, when the diff adds a mock, a stub, a fake or a fake HTTP server: does it replace only what crosses the boundary (the network, the clock, mail, a queue, storage), by the framework's own fake where the framework has one, and never the code under test? The row: `${CLAUDE_PLUGIN_ROOT}/teams/qa.md`, "Test doubles and boundaries".
12. Test data and state, when the diff adds a factory, a seeder, a fixture or a test that writes to a database or a file: does each test set up the state it reads and leave none for the next, by the project's own refresh or transaction mechanism? The row: `${CLAUDE_PLUGIN_ROOT}/teams/qa.md`, "Test data and state".
13. Property-based testing and fuzzing, when the diff adds a property test or a fuzz target: does a property hold for every generated input rather than restate the implementation, and is a fuzz run bounded in time and pointed at the project's local or test environment only? The row: `${CLAUDE_PLUGIN_ROOT}/teams/qa.md`, "Property-based testing and fuzzing".
14. The suite in CI, when the diff changes the CI's test job, its matrix, its sharding, its parallel settings or a coverage threshold: does every test the suite ran before still run, and is coverage read as a measure on the diff's lines rather than set as the goal? The row: `${CLAUDE_PLUGIN_ROOT}/teams/qa.md`, "The suite in CI".
15. Testing systems with AI, when the diff adds or changes an eval case, a grader or a prompt the product sends to a model: is a model's grade scored against a baseline arm, is the judge no weaker than the model it grades, and is what must have run read by a pattern over the trace? The rule: `wizardingcode-qa-evals`.

Questions 9 to 15 are answered only when the diff touches their subject, by the trigger each names.

## Defect or advisory

A **defect**: a `behavior` criterion with no test that fails on reversion (1); a test true by construction (2); an `observed` reason that is false (4); a `preserve` criterion whose named tests do not touch the preserved behaviour (3); a survived mutant on a line of the diff that one reasonable assertion would kill (7); a path that differs end to end with a unit test and no test through the real flow (9); a retry, a skip or a raised timeout that makes a red pass without its cause traced (10); a model's grade with no baseline arm, or a judge weaker than the model it grades (15). An **advisory**: an implementation-coupled test that still fails on reversion (5); a weak name or message (6); a mutant survived in error handling the criteria do not cover; a test that reads the real clock or randomness where the framework has a fake; a double of the change's own where the framework has its fake, or one that replaces more than the boundary; a test that depends on state another test left; a property that restates the implementation; a fuzz run with no time bound or aimed outside the local or test environment; a CI change that leaves tests of the suite out of the run with no stated reason; a coverage threshold set as the goal.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A weak test the diff did not touch, a suite that was already true by construction, the mutation score of the whole tree: debt, under "Outside the change". The gate is about what this item added or changed and what its criteria promised.
