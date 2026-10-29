# SP9: Frontend proven and with craft. Implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in this session, through the crew method (each task is a crew work item in this repository, as SP6, SP7, SP3, SP8 and SP4 were). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Written on 2026-10-26**, from the SP9 design (`docs/specs/2026-10-26-sp9-frontend-proven-and-craft-design.md`), the user's decisions of that day (§2 of the design), ADR 0016 (the frontend evidence is the engine's) and ADR 0017 (outside sources enter the core distilled), on top of the SP7 design §6.2 and §8.3 (the UI/UX and e2e gates) and ADR 0010 (packs are data). The sixteen outside sources were read on 2026-10-26 (the design's §3); the commits recorded in the packs' provenance are those of that day, and each pack's README lists the documentation URLs read on the day the pack is written.

**Goal:** A frontend change by the crew is proven with nobody present and built with craft. The project's own e2e run, through the crew's Playwright fixture, writes the evidence the UI/UX reviewer reads: captures per declared state, viewport and scheme, the console, the accessibility snapshot, axe, web vitals, a motion sample per interaction and the reduced-motion pass; the engine names what is missing from the screens the criteria declare, grades what text and numbers can decide (a design lint, the evidence thresholds) and runs the chrome-devtools CLI as a confirmed deep audit. One standard of ours (motion, the interface floor, accessibility, states, copy, responsive, the design contract), distilled from the sources with one value per rule, is what the implementer follows, the reviewer judges against and the frontend lead validates. The knowledge per stack ships as packs: `frontend` (team), `nuxt`, `next` and Blade/Livewire/Dusk in `laravel`. Fifteen eval cases measure it, and the whole lands as 0.16.0.

**Architecture:** The engine stays dependency-free; Playwright is the project's, the chrome-devtools CLI is the machine's, axe is the project's, each said when absent. The evidence's shapes live in one file (`plugins/core/e2e/playwright.mjs`) and the engine protects what it owns beside the session's `review/ui/` (`review/ui-plan.json`, `review/ui-evidence.json`, `review/design-lint.json`). The UI evidence is the e2e gate's third measurement (console, logs, UI), `design-lint` is a built-in gate like `secrets`, and the gate table of ADR 0002 does not change. The frontend team owns `review-ui-ux` and the `ui-ux` gate, is seated by an interface change and validates. The standard is one reference the session, the reviewer and the lead read; the rubric carries what the judge needs. A pack adds globs, checklists, knowledge and detector rules, and nothing that runs.

**Tech Stack:** TypeScript (dependency-free engine, Bun for tests, Biome), Node 20+ at run time, `@playwright/test` as a root devDependency for the fixture's browser test and the evals' scaffolds (the engine imports nothing of it), Playwright's headless shell shipped inside an eval scaffold, `claude plugin eval` for the cases, the mods API of `plugins/core/hooks/register.js`, the `wizardingcode-plugins` marketplace (`git-subdir` entries, three new).

**Spec:** the design's §4 to §9. The rules the engine enforces in this release: 5 (a gate that cannot run is said, never passed: `not captured` lines for axe, the audit and the console; `all · no evidence` for the reviewer), 10 (process follows risk: a declared screen without its capture fails the run), 13 (the evidence of an item is the item's: `review/ui/` and the manifests never leave `.crew/work/<id>/`), 18 (measure everything: the thresholds in code, the figures from the files).

## Global Constraints

- The engine stays dependency-free; the fixture resolves `@playwright/test` from the working directory as `withConsole` does today and is one ESM file.
- The files the engine owns are written only by the `crew` command: `review/ui-plan.json`, `review/ui-evidence.json` and `review/design-lint.json` sit under `REVIEW_OWNED`; `review/ui/` stays the session's and the fixture's (`REVIEW_OPEN_SEGMENT`).
- Hooks fail open; a malformed evidence file is `unreadable` in the manifest and a reason in the tail, never a crash.
- No new agent (every description costs every session, finding 60): `review-ui-ux` widens, no `review-motion`; `tech-lead.md` is one agent for six teams.
- The skill page `plugins/core/skills/crew/SKILL.md` stays under its byte ceiling (read the pinned size in `skill-content.test.ts` or its equivalent before adding the Frontend row); the reference `frontend.md` stays near 6 KB.
- Biome; imports with an explicit `.ts` extension; TDD (the test fails first); repository documents in English; captures never enter a commit (`state.ts` keeps `work/*/review/ui/` ignored).
- One release at the close: 0.16.0 through `bun scripts/release.ts --minor`, with the three marketplace entries created by hand before it (`scripts/release.ts` updates existing entries only).
- Evals one case at a time with `--case` while building (0.3 to 1.4 USD each); the `ui` and `packs` tags whole once at the close, recorded under `docs/evals/`.

## Review Focus

1. A forged or partial evidence file never passes a gate: `gradeUi` on a metadata file with `axe.status: "clean"` and no axe file, on a motion sample with no strip, on a capture with no console file, each a named offence or `not captured`, never a pass. Pinned in Task 4.
2. A declared screen with no capture is named by page and state and fails the e2e run; an undeclared capture counts and is listed; a criterion superseded no longer expects its screens. Pinned in Task 3 (`expectedScreens`) and Task 4.
3. The lint judges only what text decides: a `var(--duration)` is `unresolved`, never a defect; a disabled rule and an inline allowance are counted and named in the tail; the inventory lists every animated declaration of the changed files. Pinned in Task 6.
4. The audit runs only confirmed: proposed, absent, no URL and a timeout each give their `not captured` line; `stop` runs in a `finally` even when a tool call hangs; telemetry is off in the command line and the environment. Pinned in Task 7.
5. The frontend lead is seated by an interface change on standard and full and never on fast; QA keeps test quality; the report's primary team line says the lead validates. Pinned in Task 5.
6. A pack rule with `extends` and `packageManager: ""` keeps the core's manager; a brace marker matches any expansion; a pack's `frontend` template only adds globs. Pinned in Task 9.

**Decisions taken while writing this plan** (readings of the design where it left a detail open; the leads may return any):

1. **The viewports' defaults are the standard's.** `DEFAULT_VIEWPORTS = [360x800 mobile, 768x1024 tablet, 1280x800 desktop]`; `320` is added by the fixture when the capture call passes `options.narrow: true` (the session does so for a page with a form or a table, as the standard says). The dark scheme is on when `profile.ui.dark` is true (set by detection when a stylesheet has `prefers-color-scheme` or a `dark` class, confirmable) or when `DESIGN.md`'s frontmatter has `themes`.
2. **The strip is composed in the page.** Eight frames chosen evenly from the sample are drawn on a canvas in the page (`page.evaluate`) from data URLs and written as one PNG; no image library, no ffmpeg.
3. **The manifest's shape.** `review/ui-evidence.json`: `{ "id", "at", "plan": { "viewports", "schemes" }, "screens": [{ "page", "state", "criteria", "declared": true, "captured": { "light": [360, 768, 1280], "dark": [1280] }, "missing": [], "console": "clean|error|not captured", "axe": "clean|violations|not captured", "vitals": { "cls", "lcpMs", "inpMs" }, "reducedMotion": "clean|running|not captured", "by": "fixture|session" }], "interactions": [{ "page", "interaction", "strip", "animations", "over50ms", "reducedMotion" }], "audit": { "status", "reason", "pages" }, "summary": { "captures", "expected", "missing": [] } }`.
4. **The lint's inventory.** `review/design-lint.json`: `{ "at", "files", "hits": [{ "rule", "file", "line", "text", "verdict": "defect|advisory", "allowed": null | "<why>" }], "unresolved": [...], "inventory": [{ "file", "line", "kind": "transition|animation|vue-transition|motion|waapi", "property", "durationMs", "easing" }], "disabled": [] }`.
5. **The criteria's screens travel in `spec.md` and in the record.** `--screen page:state[,page:state]` on `crew criteria add` writes `screens` on the criterion; `references/specify.md` says the spec's three lines under the criterion; the engine reads the record, never the prose.
6. **The chrome-devtools CLI's exact flags** are verified at Task 7 against `chrome-devtools --help` and `start --help` of the installed version; the design's command lines are the README's of 2026-10-26.
7. **The sandbox browser.** The spike of 2026-10-26 (design §9) decides Task 14's shape: a headless shell copied into the scaffold under `node_modules/.cache/ms-playwright` with `PLAYWRIGHT_BROWSERS_PATH` set by the e2e script and `launchOptions.args: ["--single-process", "--no-zygote"]` (the sandbox denies Mach port registration to a multi-process Chromium: the spike's run 2), Google Chrome's `channel` never (the ProcessSingleton aborts in the sandbox: run 1), `npx` never (unusable there).

### Task 1: The design, this plan and the two ADRs

**Files:** `docs/specs/2026-10-26-sp9-frontend-proven-and-craft-design.md`, `docs/plans/2026-10-26-sp9-frontend-proven-and-craft.md`, `docs/adr/0016-frontend-evidence-is-the-engines.md`, `docs/adr/0017-outside-sources-enter-the-core-distilled.md`, `docs/vision.md` (§7, §16).

- [ ] The spike: a temporary eval case (never committed) runs the fixture's shape in the sandbox; its result (Chrome's ProcessSingleton abort, `npx` unusable, the headless shell's outcome) is written into the design's §9.
- [ ] The documents written in the house shape; the vision's UI/UX row and subproject 9.
- [ ] `crew tdd observed` per criterion, `crew gate run`.

### Task 2: The capture fixture

**Files:** `plugins/core/e2e/playwright.mjs`; tests `packages/engine/tests/e2e-module.test.ts` (the `fakePage` pattern), `packages/engine/tests/e2e-browser.test.ts` (new, real browser, `test.skipIf` without `@playwright/test` at the root or a Chrome); `package.json` (`@playwright/test` as a devDependency).

- [ ] Tests first: `capture()` writes the files and the metadata of the design §4 for a fake page (viewports from a plan file, light and dark, console slice, aria, axe absent → `not captured`, vitals, reduced motion); no-op without `WIZARDINGCODE_CREW_UI_DIR`; names outside `[a-z0-9-]+` refused with the rule in the message; `captureMotion()` writes the sample, the frames, the strip and the reduced-motion rerun only with `reset`.
- [ ] The browser test: the same against a `file://` page in the machine's Chrome, the shapes asserted once per `bun run check`.
- [ ] Code: `uiDir()`, `uiPlan()`, the console buffer per page, `capture`, `captureMotion`, the strip on a canvas, the bounds per item (decision 1), `by: "fixture"`.

### Task 3: Screens on the criteria, the plan and `listCaptures`

**Files:** `packages/engine/src/types.ts` (`Criterion.screens`, `Profile.ui`), `work.ts` (`addCriterion`), `cli.ts` (`--screen`, `crew profile set ui.viewports|ui.dark`, the `captures:` line of `gate run`, `status --json`), `ui.ts` (new: `DEFAULT_VIEWPORTS`, `expectedScreens`, `writeUiPlan`), `e2e.ts` (the two variables; stale fixture files removed before a run, the session's kept), `judgement.ts` (`listCaptures` with widths, schemes, metadata, `by`), `plugins/core/hooks/register.js` (the panel's `captures 3/5 · missing …`); tests `judgement.test.ts`, `gates.test.ts` (`e2eRepo`), `cli.test.ts`, `work.test.ts`.

- [ ] Tests first: a criterion with `--screen` stores `screens`; a superseded criterion expects nothing; `writeUiPlan` from the profile's viewports and the default; `listCaptures` parses `<page>-<state>@<w>[-dark].png` and the old `<page>-<state>.png`; the gate-run line names the missing screens.
- [ ] Code as the design §4; `inputs.json` stays readable by the old shape.

### Task 4: The UI evidence as the e2e run's third measurement and the report's section

**Files:** `ui.ts` (`gradeUi`), `e2e.ts`, `types.ts` (`GateRun.artifacts.ui`), `evidence.ts` ("UI evidence" section from the manifest), `verify.ts` (the one-line summary); tests `gates.test.ts`, `evidence.test.ts`.

- [ ] Tests first: an e2e command that writes the evidence files; the order of offences (exit, console, logs, missing screen, reduced motion, axe, CLS); the tail lines (`captures:`, `axe:`, `vitals:`, `reduced motion:`, `motion:`, `audit:`); review focus 1; the manifest `review/ui-evidence.json` (decision 3); the report section.
- [ ] The sweep's hardening the security lead left at Task 3's delivery: `review/ui/motion` itself checked with `lstat` (a symlinked intermediate folder is skipped, as its leaves are), with its test beside the sweep's.
- [ ] Code; the thresholds as constants with the module header saying a forged file fails and never passes.

### Task 5: The frontend team and the paths

**Files:** `team.ts` (`frontend` with `review-ui-ux`, `ui-ux`, `interface: true`, `validates: true`; QA without them; `seated(changed)`), `paths-kind.ts` (`isInterfacePath` widened, `isDesignContractPath`), `gates.ts` and `judgement.ts` where the contract paths plan `design-lint`, `e2e` and the seats, `evidence.ts:649` (`the session; its lead validates`), `agents/tech-lead.md` (the team list); tests `team.test.ts`, `judgement.test.ts`, `paths-kind.test.ts`.

- [ ] Tests first: review focus 5; the new interface and contract paths, the exclusions (`pages/api/`, `server/`, `hooks/`, tests).
- [ ] Code.

### Task 6: The `design-lint` gate

**Files:** `packages/engine/src/design-lint.ts` (new), `gates.ts` (built in like `secrets`, planned on interface or contract paths, per todo too), `policy.ts` (`ui.lint.disabled`), `detect/node.ts` and `cli.ts` (the settable list excludes it), `types.ts` (`GateName`, `GateRun.lint`); tests `design-lint.test.ts` (one test per rule with its fixture file, `unresolved`, the policy and the inline allowance, the inventory), `gates.test.ts`.

- [ ] Tests first: the nine rules of the design §5, review focus 3, the verdict and tail lines, `review/design-lint.json` (decision 4).
- [ ] Code; `references/gate.md` names the gate in the deterministic list.

### Task 7: The deep audit through the chrome-devtools CLI

**Files:** `packages/engine/src/devtools.ts` (new), `types.ts` (`Profile.browser.devtools`), `detect/` (the proposal when on PATH and a Chrome is found), `cli.ts` (`profile set browser.devtools`, `profile confirm browser`), `run.ts` (`onPath` exported), `e2e.ts` (after the command, before the stop), `pdf.ts` (`findBrowser` reused); tests `devtools.test.ts` (a fake `chrome-devtools` on a test PATH as `pdf.test.ts` does: canned JSON, a hang, an exit 3), `gates.test.ts`.

- [ ] Verify the installed CLI's flags (`--help`, decision 6) and record them in the module header.
- [ ] Tests first: review focus 4; the files and `audit.json`; the verdict contribution (an accessibility audit at 0 with items; CLS over 0.1 when the fixture measured none); the 5-minute cap.
- [ ] Code.

### Task 8: The standard, the rubric, the reviewer, the judge, the lead and the method

**Files:** `plugins/core/skills/crew/references/frontend.md` (new), `rubrics/ui-ux.md`, `agents/review-ui-ux.md`, `agents/judge.md`, `agents/tech-lead.md`, `references/specify.md`, `plan.md`, `build.md`, `gate.md`, `deliver.md`, `conclave.md` (the kinds `motion` and `design-contract`), `rules.md`, `checklists/screen.md`, `SKILL.md`; the content tests of the skill and the agents (`skill-content.test.ts` or the file that pins them: the rows, the byte ceiling, the agents' descriptions' length).

- [ ] Tests first: the content pins (the ten questions by number, the `all · no evidence` line, the `Frontend` row, the provenance footer's sources, the ceiling).
- [ ] The texts as the design §6, with the provenance footer (source, licence, what entered, commit).

### Task 9: The engine's prerequisites for the packs

**Files:** `packages/engine/src/detect/index.ts` (brace-expanded markers; `packageManager: ""` on an `extends` rule keeps the core's), `packs.ts` (refuse `""` without `extends`), `packages/engine/tests/packs-content.test.ts` (`VERSIONED_DOCS` with `nuxt` and `livewire`; the sources heading per pack), `docs/adr/0010-…` (a dated note); tests `detect.test.ts`, `packs.test.ts`.

- [ ] Tests first: review focus 6.
- [ ] Code and the ADR note.

### Task 10: `packs/frontend` and its eval pair

**Files:** `packs/frontend/{pack.json,.claude-plugin/plugin.json,README.md,checklists/screen.md,checklists/motion.md,checklists/design-contract.md,knowledge/frontend.md,knowledge/motion.md}`, `packs-content.test.ts` (the manifest pinned, the seat per glob), `plugins/core/evals/pack-frontend-seats-the-team/`, `pack-frontend-absent/`, `plugins/core/evals/README.md`.

- [ ] Tests first: the content test rows; the two cases written with their graders (the seat line, the knowledge paths, `prefers-reduced-motion` in the `.vue`, no `transition: all`, honest ending).
- [ ] The pack as the design §8 with the eight provenance entries; the cases run once each.

### Task 11: `packs/nuxt` and its eval pair

**Files:** `packs/nuxt/{pack.json,.claude-plugin/plugin.json,README.md,knowledge/nuxt.md}`, `plugins/core/evals/fixtures/nuxt-shaped.sh` (faked local packages committed, no `npx`: decision 7), `pack-nuxt-refines-the-gates/`, `pack-nuxt-absent/`, `packs-content.test.ts`.

- [ ] The knowledge read from `nuxt.com/docs/4.x/…` on the day; the URLs in the README.
- [ ] Tests first: the content rows; the cases (the proposed commands with the pack's name, the confirmation relayed, the tag, the knowledge path; the gate proven through a `node …` command the prompt relays, since the sandbox has no `npx`).
- [ ] The pack; the cases run once each.

### Task 12: `packs/next` and its eval pair

**Files:** `packs/next/{…}`, `fixtures/next-shaped.sh`, `pack-next-refines-the-gates/`, `pack-next-absent/`, `packs-content.test.ts`.

- [ ] As Task 11 for Next 16 (`next lint` gone; `tsc --noEmit` the core's).

### Task 13: `packs/laravel`: Blade, Livewire and Dusk, and its eval pair

**Files:** `packs/laravel/{pack.json,README.md,knowledge/laravel.md,checklists/screen.md}`, `plugins/core/evals/pack-laravel-blade-tags-the-view/`, `pack-laravel-blade-tags-the-view-absent/`, `packs-content.test.ts` (the two-rule list, the checklists, the README literal).

- [ ] Tests first; the second rule (`dusk`), the knowledge (Livewire 4 read from `livewire.laravel.com/docs/4.x/…` on the day), Dusk's console said honestly.
- [ ] The cases: the `e2e=php artisan dusk (pack …)` line, the tags, the checklist read; the `.blade.php` plans ui-ux, which the sandbox records not run: the case ends honest.

### Task 14: The evals' sandbox browser and the core's cases

**Files:** `plugins/core/evals/fixtures/playwright-page.sh` (new: the packages copied from the root's `node_modules`, the headless shell under `node_modules/.cache/ms-playwright` from `PLAYWRIGHT_BROWSERS_PATH` of the repository or `~/Library/Caches/ms-playwright`, the config, the `file://` page, the socketless environment extracted into `fixtures/flag-env.sh`, the spec importing the crew's fixture by the plugin folder's absolute path), `scripts/eval.ts` (`SANDBOX_TAGS` + `ui`; `eval-runner.test.ts`), the eight cases of the design §9 (the seven, and `ui-ux-generic-tells`, which measures the UI/UX rubric's question 11 of item 2026-10-29-001 by the user's decision D-3, red with that rubric's base text and green with the current one), `judgement-gate-not-run/graders/*` ("no evidence"), `plugins/core/evals/README.md`.

- [ ] Tests first: the runner's tag list pinned; each case's graders written before its fixture.
- [ ] The fixture and the cases; each run once with `--case`.

### Task 15: Plumbing, the whole-tag run and the release 0.16.0

**Files:** `CLAUDE.md` (the six JSON paths in Releasing; the commands), `package.json` (`plugin:check` with the three packs), `references/packs.md`, `README.md` (five packs), `plugins/core/evals/README.md`, `docs/evals/2026-10-<dd>-sp9-results.md`, the marketplace's three entries (contents API, `git-subdir`, `path: packs/<x>`, `ref: v0.16.0`).

- [ ] `packs-content.test.ts` asserts the release section and `plugin:check`; `bun run check`, `bun run build`, `bun run plugin:check` green.
- [ ] The `ui` and `packs` tags run whole once; the record written with the figures from the aggregate.
- [ ] The marketplace entries created; `bun scripts/release.ts --minor --reason "SP9: frontend proven and with craft: the capture fixture, the design lint, the deep audit, the frontend standard and team, packs frontend, nuxt, next and Blade in laravel"`; the restart; `crew status` says 0.16.0.

## After the last task

Real use in a Nuxt project of the user's with the `frontend` and `nuxt` packs installed (the design's §12); the findings go to `docs/real-use/findings.md` from the next number; Expo/React Native, visual regression against a baseline and `template: string[]` are the next subprojects' candidates (the design's §11).
