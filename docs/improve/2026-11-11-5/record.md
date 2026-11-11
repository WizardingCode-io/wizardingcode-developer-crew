# Improvement run 2026-11-11-5

- At: 2026-11-11T05:00:09.700Z
- Targets: pack-frontend-seats-the-team, thread-with-contracts
- Provider: runtime (agent claude-sonnet-5-5, judge claude-fable-5-2)
- Judge: claude-fable-5-2

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-frontend-seats-the-team | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| thread-with-contracts | 0.75, 1.00, 0.75 | 0.83 | 0.25 |

## P-1: unprobed (the probe set (2 cases, about 17.24 USD by the baseline's costs) is above what is left under the ceiling (1.52 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured. `pack-frontend-seats-the-team` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `thread-with-contracts`, `request-done` is the engine's own reply line, `replied to M-…: M-… to b; M-… done`. The engine's `replyMail` in `mail.ts` takes the child's verdict from its stored evidence at the moment of the reply: `done` only when that verdict is proven, otherwise `blocked` with the unproven reasons. I had no trace of the failing runs, so the cause is inferred: with the contract and thread graders passing, the lead sent its one reply while the child was still unproven (most likely before the judgement gates were recorded), and the ending could not honestly say the request was done. The only recorded runs of this case (2026-11-04-5) read `checklists/endpoint.md` and the rubrics, never `references/mail.md`, so the skill page is the lever, and its Mail row said nothing about when the reply goes. That row now ends: "A change request is answered once, after its child's `Proven:` line (`crew mail reply <id> --item <child>` reads the stored verdict: unproven, the request is blocked)". To stay under the page's 9254-byte cap I deleted the sentence under the title ("The `crew` command is the engine: …"), which I found no test pinning. The page now sits between 9244 and 9254 bytes by regex probe, and the pinned Mail-row pattern ("inside the workspace" plus the command cell) still matches.

## P-2: unprobed (the probe set (2 cases, about 17.24 USD by the baseline's costs) is above what is left under the ceiling (1.00 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page, `plugins/core/skills/crew/SKILL.md`, and nothing else; this session has no shell, so no tests and no eval rerun were run and whether the score moves is unmeasured. `pack-frontend-seats-the-team` is at 1.00 with no evidence, so it is passing and I left it alone. For `thread-with-contracts`, `request-done` is a regex for the engine's `replied to M-…: M-… to b; M-… done` tail. The engine prints `done` only when the child item's stored verdict is proven at the moment of the reply; otherwise the request is blocked, and the `honest-ending` judge then fails an ending that calls it done. I had no trace of the failing run, so the cause is inferred: the lead most likely replied before the child's gate run printed `Proven:`, or after re-saving an unproven verdict. Earlier records show this case never reads `references/mail.md`, which already carries the rule, so the skill page is the only text that reaches it. The Mail row now ends "a change request is answered once, after its child's `Proven:` line (`crew mail reply <id> --item <child>` reads the stored verdict: unproven blocks it)". To stay under the page's 9254-byte cap I deleted the intro sentence "The `crew` command is the engine: …", which no test pins. The page is 16 characters shorter than before, and the Mail row's pinned text ("inside the workspace" and the command cell) is intact.

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 19.00 USD
- Exit status: 0
