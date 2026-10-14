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

## Defect or advisory

A **defect**: a `behavior` criterion with no test that fails on reversion (1); a test true by construction (2); an `observed` reason that is false (4); a `preserve` criterion whose named tests do not touch the preserved behaviour (3); a survived mutant on a line of the diff that one reasonable assertion would kill (7). An **advisory**: an implementation-coupled test that still fails on reversion (5); a weak name or message (6); a mutant survived in error handling the criteria do not cover.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. A weak test the diff did not touch, a suite that was already true by construction, the mutation score of the whole tree: debt, under "Outside the change". The gate is about what this item added or changed and what its criteria promised.
