# Ruling of 2026-11-02-4 (kept-harness-adoption)

does not hold

does not hold
Missing: rule 3, "Test first, recorded", has been weakened on the fast route. Step 2 of the fast route in `plugins/core/skills/crew/SKILL.md` (diff line 23) used to require a failing test before any code. It now says "A test that passes as written has no red to force", and lets the agent drop the behaviour criterion (`crew criteria <id> remove AC-1`) and prove it with `tdd observed` instead. That applies to any test that passes, not only to end-to-end tests a stub already answers, which is the case `references/build.md` limits it to (diff line 47). It also contradicts build.md's own rule that a test passing before the code exists proves nothing and must be rewritten. So the red step becomes optional, and the agent, alone, can downgrade a criterion to dodge it. A second, smaller weakening is at `references/build.md` (diff line 56): finding 115 refused an `observed` criterion wherever a stub makes a test possible. The diff adds an exception that lets a stub-backed test that already passes become an observed criterion with no red ever recorded.
