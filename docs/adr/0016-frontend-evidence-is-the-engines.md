# 0016. Frontend evidence is the engine's

- Status: accepted (the user, 2026-10-26). Extends the SP7 design §6.2 and §8.3; ADR 0002's gate table stands.
- Date: 2026-10-26

## Context

Until 0.15.2 the UI/UX judgement gate read captures the session took by hand in a browser it drove itself; without a browser the gate was recorded not run, an interface change could never end proven in the eval sandbox or in the harness-improvement loop, and the reviewer judged a screenshot alone: nothing of motion, measured accessibility, performance or a design contract. The user's direction of 2026-10-26: frontend work by the crew has to be proven and dynamic, with the proof produced with nobody present, and the chrome-devtools CLI as a deep audit beside it (the decisions of the SP9 design §2).

## Decision

1. **The e2e gate produces the UI evidence.** The crew's Playwright fixture (`plugins/core/e2e/playwright.mjs`, one ESM file resolving the project's own `@playwright/test`) gains `capture()` and `captureMotion()`; the project's e2e specs call them, and the e2e gate names the folder (`WIZARDINGCODE_CREW_UI_DIR`) and the plan (`WIZARDINGCODE_CREW_UI_PLAN`). The evidence per page and state is the screenshots per viewport and scheme, the console, the accessibility snapshot, axe when the project has it, web vitals and a reduced-motion pass; per interaction, a motion sample with the animations, the frame times and one strip of frames. Outside a gate run the helpers write nothing.
2. **Screens are declared, so a missing capture is named.** A criterion carries its screens (`--screen page:state`); the engine derives what is expected, writes `review/ui-plan.json` before the run and `review/ui-evidence.json` after it (declared, captured, missing, with the summaries), and prints what is missing. The evidence is the e2e run's third measurement after the console and the logs, not a new gate; a project with no fixture and no declared screen behaves as before.
3. **What text can decide is a deterministic gate.** `design-lint`, built in like `secrets`, planned when the diff touches an interface or a design-contract path, carries the motion and design rules a linter can hold (the rules of the SP9 design §5), each hit with its rule id; a policy may disable a rule by id, an inline comment may allow one occurrence with its reason, both named in the report.
4. **The deep audit is optional and confirmed.** The engine runs the `chrome-devtools` CLI once per item, after the e2e command and before the environment stops, only when the command is on PATH or set in the profile and a person confirmed it, with Google's usage statistics and the CrUX lookups off. Without it the report says `audit: not captured` with the reason; the audit never passes anything by default.
5. **Captures by hand remain a fallback with a person present.** A project without Playwright keeps the session-driven browser (`by: "session"`), and without either the gate is recorded not run with the reason `no evidence`.
6. **The frontend team validates.** `review-ui-ux` and the `ui-ux` gate are the frontend team's; the team is seated by an interface change and its lead validates the spec's screens and the delivery's evidence; the session stays the primary lead and the read-only seat validates it as a stranger, as QA's does.

## Consequences

- An interface change can end `Proven:` with nobody present: in the loop, in the sandbox (with a browser shipped in the scaffold), in CI.
- The fixture is the one place the evidence's shapes live; the reviewer, the lead, the judge and the report read the same files, and a forged file can fail a gate and never pass it.
- A project pays for the proof in its own e2e run: more captures, more time; the fixture bounds the images per item and the method splits more than three pages into todos.
- The engine stays dependency-free: Playwright is the project's, the chrome-devtools CLI is the machine's, axe is the project's; what is absent is said, never assumed.
- ADR 0002 stands: no gate joins the table per route; `design-lint` is a built-in like `secrets`, and the UI evidence is a measurement of the e2e gate.
