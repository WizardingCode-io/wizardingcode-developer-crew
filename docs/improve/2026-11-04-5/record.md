# Improvement run 2026-11-04-5

- At: 2026-11-04T04:00:07.134Z
- Targets: pack-frontend-seats-the-team, thread-with-contracts
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| pack-frontend-seats-the-team | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| thread-with-contracts | 1.00, 0.75, 1.00 | 0.92 | 0.25 |

## P-1: unprobed (the probe set (4 cases, about 12.84 USD by the baseline's costs) is above what is left under the ceiling (2.56 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/mail.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` (the Mail row of the method table, with equal-byte trims elsewhere on the page) and `plugins/core/skills/crew/references/mail.md` (the change-request bullet). `pack-frontend-seats-the-team` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `thread-with-contracts`, the `request-done` grader is the engine's own reply tail, `replied to M-…: M-… to b; M-… done`, and `reply()` in `mail.ts` reads the child's verdict from the stored `evidence.json` at the reply, never recomputed: the tail says `done` only when that stored verdict is `proven`, and `blocked` with the unproven reasons otherwise. A run that passes `reply-with-contract` and `thread` (two messages, two parties) while losing `request-done` and every `honest-ending` vote is therefore one reply sent while the child's stored verdict was unproven (the judgement gates not yet recorded, or `crew evidence <id>` re-saving an unproven verdict after a file changed since the proving run), after which the ending either called the request done or honestly said blocked, both of which the judge's terms fail. The baseline runs of this case read only the skill page plus sometimes `mail.md`, `gate.md`, `specify.md` and the rubrics, never Deliver, and the one sentence on the reply's timing was the Mail page's "the request is done only when that child is proven", which says the rule but not when to reply or what the tail means. The skill page's Mail row now says a change request is "answered once its child is proven (reply tail: done, or blocked and why)", and the Mail page's change-request bullet now says to reply once, after `crew gate run` (or the judgement record) printed `Proven: <child>` and before any further edit, that the engine reads the child's recorded verdict at the reply and its tail says where the request stands, that a blocked tail means the child was not proven when the reply went (say blocked

## P-2: unprobed (the probe set (4 cases, about 12.84 USD by the baseline's costs) is above what is left under the ceiling (0.00 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/mail.md
- Rationale: The edits are in place and verified: the skill page is now between 9219 and 9238 bytes against its 9254-byte cap, the pinned Mail row regex and mail.md pins still match, and the memory note is updated.

I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` (the Mail row of the method table, with room made by deleting the unpinned engine description line under the title and rule 6's "The answers are required; ", which `references/receive.md` still states) and `plugins/core/skills/crew/references/mail.md` (the change-request bullet). `pack-frontend-seats-the-team` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `thread-with-contracts`, the `request-done` grader is the engine's own reply line, `replied to M-…: M-… to b; M-… done`, and `reply()` in the engine takes the child's verdict from its stored `evidence.json` at the moment of the reply, never recomputed: it prints `done` only when that stored verdict is proven and `blocked` with the unproven reasons otherwise, and `crew evidence` re-saves whatever the tree proves at that moment. The case scores 0.92 with the contract, thread, origin and CRM graders passing, so the one failing run in three is a reply sent while the stored verdict was unproven (before the gate run's `Proven:`, after an edit, or on a route whose judgement gates were never recorded), after which the ending called the request done against the engine's `blocked`, which is exactly what the `honest-ending` judge fails. The one page every run of this case reads is the skill page, whose Mail row said when a change request becomes an item but nothing about when its reply goes, and mail.md's bullet said the request is "done only when that child is proven" without saying that proven is read from the stored evidence at the reply. The Mail row now says a change request is answered once its child's gate run prints `Proven:`, that the reply reads the stored verdict and that an unproven child

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 20.79 USD
- Exit status: 0
