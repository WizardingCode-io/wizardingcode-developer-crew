# Improvement run 2026-11-04-6

- At: 2026-11-04T05:00:06.987Z
- Targets: jev-tightens-never-loosens, validator-unattended-approval
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| jev-tightens-never-loosens | 1.00, 0.75, 0.75 | 0.83 | 0.25 |
| validator-unattended-approval | 0.50, 0.50, 0.50 | 0.50 | 0.00 |

## P-1: unprobed (the probe set (18 cases, about 149.92 USD by the baseline's costs) is above what is left under the ceiling (6.87 USD); not probed)

- Diff: M plugins/core/skills/crew/references/conclave.md, M plugins/core/skills/crew/references/specify.md
- Rationale: Nothing further is needed from the checkout: both edits are in place, the pinned phrases around them still match, and the memory note is indexed.

I changed two harness pages and nothing else: `plugins/core/skills/crew/references/conclave.md` (a passage inside "The validator") and `plugins/core/skills/crew/references/specify.md` (one sentence on the full route's validator bullet). Both failing cases run the full route, and both scored 1.00 in every record up to 2026-10-28; what changed since is ADR 0019 of 2026-10-31, which puts a brainstorm (six lens launches) before Specify and a five-stage spec review between Plan and Build on every full-route item, with convergence needing two clean rounds in a row and `accept` denied where nobody watches. The kit's own measure put one review round near 270 seconds and no round of a real small feature came out clean, so `validator-unattended-approval`, with 900 seconds and 40 turns, passes its regex at the approval and is cut inside the review, which is why `not-by-user` fails every vote at a spread of zero: the timeout is never changed with a gate run and no page under the editable folders can remove an engine guard or a hook denial, so I edited nothing for it and the right fix is the case's budget or a smaller review for small features (finding 214). For `jev-tightens-never-loosens`, the dispute is reached and only the ending fails, a loss the records show once in three runs since 2026-10-26 and twice in three now, always in runs that read no reference page; the harness as it stood described the engine's refusal only on the Jev page, which those runs never open, and said nowhere what the last message after a dispute must carry. The Conclave page's validator section now says that a `disputed by jev` answer is a refusal held on the item (a second validator approval, a rewritten conclave and a `crew resume` with `--mode` are all refused, a verdict never loosens), that nothing is built, and that the turn ends there with the full a

## P-2: unprobed (the probe set (2 cases, about 6.14 USD by the baseline's costs) is above what is left under the ceiling (1.90 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`, rule 4, with four equal-byte trims of unpinned text on the same page (the "they go to `crew start` as `--answers`" clause of the typed-questions line, "(`!` included)" and "`claude -p`, " in rule 4, "The answers are required; " in rule 6, which `references/receive.md` still states, and " between steps, no" in the fast route's closing paragraph), so the page now sits at 9240 to 9243 bytes against its 9254-byte cap with every pinned regex and phrase I mapped in `skill.test.ts` still matching. For `validator-unattended-approval` I edited nothing on purpose: the case's 900 seconds and 40 turns cannot hold the full route since ADR 0019 stamped every full-route item with the brainstorm's six lenses before Specify and the five-stage spec review before Build (both engine guards in `work.ts`, outside what I may edit), so the `approved-by-validator` regex passes at the approval and the `not-by-user` judge fails on a run cut inside the review with the timeout unchanged; the fix is the case's budget or a smaller review for small features, not a harness page. For `jev-tightens-never-loosens`, the `disputed`, `waits` and `not-approved` graders pass in the failing runs while `honest-ending` loses every vote, and those runs read no reference page, so the one page they see is the skill page, whose rule 4 told the lead to approve under `complete-gap-round` with nothing to decide and said nothing about the engine's refusal `disputed by jev: <condition>; the item waits for a person`; the pages that do describe it (`jev.md`, rules.md rule 15) are never read, and the earlier dispute-ending edits to `conclave.md` and `specify.md` were never kept. Rule 4 now says, right after the validator sentence, that a `disputed by jev` refusal means the item waits for a person and the lead says so, builds nothing and approves no other way, which is exactly the ending the judge passes and the engine's rule 15 behaviour. I

## Outcome

- Composition: none
- Kept: nothing
- Lessons: none
- Cases no run has measured (never probed): none
- Cost: 18.10 USD
- Exit status: 0
