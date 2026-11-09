# Improvement run 2026-11-09-6

- At: 2026-11-09T22:00:07.155Z
- Targets: env-observed-proof, gap-redirect-target
- Provider: runtime (agent claude-sonnet-5-5, judge claude-opus-5-5)

## Baseline

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| env-observed-proof | 1.00, 1.00, 0.60 | 0.87 | 0.40 |
| gap-redirect-target | 1.00, 1.00, 1.00 | 1.00 | 0.00 |

## P-1: unprobed (the probe set (13 cases, about 145.01 USD by the baseline's costs) is above what is left under the ceiling (15.93 USD); not probed)

- Diff: M plugins/core/skills/crew/SKILL.md, M plugins/core/skills/crew/references/gate.md
- Rationale: I changed two harness pages and nothing else: `plugins/core/skills/crew/SKILL.md` and `plugins/core/skills/crew/references/gate.md`. Nothing was run in this session (no shell), so there is no test run and no eval rerun, and whether the score moves is unmeasured. `gap-redirect-target` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `env-observed-proof`, a mean of 0.87 with spread 0.40 is one run of three losing `lifecycle` and `honest-ending` while `e2e (.): pass`, the footer and `Proven:` all held. I had no trace of that run, so the cause is inferred from the engine: the e2e gate checks health before it starts anything, and an environment already up is taken as the user's and never stopped. A lead that started the environment before the gate run (with `crew env start` or `node scripts/env.mjs start`) therefore leaves `var/log.txt` with a `start` and no `stop`, and the judge fails the ending for a start by hand. The one earlier record that lists this case's reads (2026-11-02-5) shows the two reviewer rubrics and never the Gate page, so the skill page is the text the lead works from, and nothing on it said who starts the environment. Its Gate row now reads "fix what fails; the e2e gate starts and stops the environment: never start it yourself;". The page sits 3 bytes under its 9254-byte cap, so those 72 bytes are paid for exactly by five trims no test pins:
- "The `crew` command is the engine" became "`crew` is the engine".
- "; they go to `crew start` as `--answers`" became ", for `crew start --answers`".
- "is on this page" became "is here".
- "the command runs with no prompt" became "no prompt appears".
- Rule 6's "The answers are required; " was removed.

A regex probe puts the page at exactly 9247 characters, 9251 bytes, as before. The Gate page's "The environment" paragraph now gives the reason and the way back: the gate would take a pre-started environment as the user's, leave it running and print `environment: the u

## P-2: lose

- Diff: M plugins/core/skills/crew/SKILL.md
- Rationale: I changed one harness page and nothing else: `plugins/core/skills/crew/SKILL.md`. Nothing was run in this session (no shell), so there are no tests and no eval rerun, and whether the score moves is unmeasured. `gap-redirect-target` is listed at mean 1.00 with no evidence, so it is passing and nothing was edited for it. For `env-observed-proof`, `lifecycle` wants `start` then `stop` in `var/log.txt`, and only the engine's own e2e gate writes that pair. I had no trace of the failing run, so the cause is inferred from `packages/engine/src/e2e.ts`: the gate checks health first, and an environment already up is taken as the user's and never stopped. A lead told to "prove the change end to end" that starts the environment itself therefore leaves `start` with no `stop`, which would also explain the judge failing the ending. Earlier records of this case show the lead reading only the skill page and two rubrics, never `references/gate.md`, so the skill page is the lever. Fast-route step 3 now ends with: "Its e2e gate starts and stops the environment: never start it, and stop one you started." The page sits at its byte cap, so the 89 bytes were paid for with six wording trims, none of which matched a test in my search:

- "The `crew` command is the engine" became "`crew` is the engine".
- "; they go to `crew start` as `--answers`" became ", for `crew start --answers`".
- "is on this page" became "is here".
- "the command runs with no prompt" became "no prompt appears".
- Rule 6 lost "The answers are required; ".
- The fast-route heading lost ", in three calls".

The page now probes at exactly 9248 characters, 9252 bytes, against the 9254 cap.
- Probe set: env-observed-proof, gap-redirect-target
- Gain: -0.03

| Case | Scores | Mean | Spread |
| :- | :- | -: | -: |
| env-observed-proof | 1.00, 1.00, 1.00 | 1.00 | 0.00 |
| gap-redirect-target | 1.00, 1.00, 0.50 | 0.83 | 0.50 |

## Outcome

- Composition: none
- Kept: nothing
- Lessons: K-342
- Cases no run has measured (never probed): none
- Cost: 7.55 USD
- Exit status: 0
