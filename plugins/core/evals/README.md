# Evals

`claude plugin eval` runs each case in an isolated session with only this plugin loaded, once with the plugin and once without, and reports the difference. Every case scaffolds its own git repository (`fixture.sh`), because the engine is inactive outside a repository. The harness runs each `fixture.sh` from its own folder (the run of 2026-10-17 scaffolded all fourteen sandbox cases that way), so a fixture reaches the shared ones in `fixtures/` with `. "$(dirname "$0")/../fixtures/<name>.sh"`: `node-plain.sh` is a Node project with one passing test, `two-projects.sh` the two-project workspace described below.

The suite lives inside the plugin (`plugins/core/evals/`) because `claude plugin eval` only accepts an eval directory below the plugin root. Two things differ from a normal session and are handled by the runner, `scripts/eval.ts`:

- The plugin's `bin/` is not on the Bash tool's PATH inside an eval run, so `crew` must be put there.
- On macOS `/usr/bin/git` is a shim that cannot write its `xcrun` cache inside the eval sandbox, so every git call fails there. The engine then counts every watched file as the change (its no-git behaviour), which is honest but makes the deps audit a planned gate; the runner puts the real git (`xcrun --find git`) first on PATH instead, and refuses to run when `xcrun` cannot say where it is.

## Run the suite

From the repository root:

```bash
bun scripts/eval.ts
```

It prints the `claude plugin eval` command it runs, which is:

```bash
PATH="$PWD/plugins/core/bin:$(dirname "$(xcrun --find git)"):$PATH" claude plugin eval plugins/core \
  --scaffold --trust-plugin --no-publish --keep-temp \
  --model claude-sonnet-5-5 --judge-model claude-fable-5-1 \
  --max-cost-usd 40 --concurrency 3 \
  --tag cost enforcement method risk stacks gap kind validator judgement team environment priority contracts \
  --allow-tools Write Edit "Bash(crew *)" "Bash(node *)" "Bash(npm *)" "Bash(git *)" "Bash(cat *)" "Bash(ls *)" "Bash(sh *)" "Bash(make *)" "Bash(sed *)" "Bash(head *)" "Bash(echo *)" "Bash(which *)" "Bash(cd *)" "Bash(env *)" "Bash(claude *)" \
  --report plugins/core/evals/results/report.html --json plugins/core/evals/results/last.json
```

On Linux the PATH has no `xcrun` part. `--keep-temp` keeps each run's scaffold and `out/trace.jsonl` under the system temp directory (sealed read-only; `chmod 700` to inspect, delete when done). Each grant covers one command: a Bash call joining several with `;` or `|` needs every one of them granted, or it is denied.

One case while iterating (one run, no baseline, no judge, a 5 USD ceiling):

```bash
bun scripts/eval.ts --case false-done
```

The agent under test runs on Sonnet 5.5 and the judge on Fable 5.1 (the owner's choice: the judge must not be weaker than the agent it grades). If a model id is rejected, use the aliases `sonnet` and `fable`. On Linux, Bash in evals needs `bubblewrap` and `socat`; macOS has its own sandbox.

## Cases

| Case | Proves | Graders |
| :- | :- | :- |
| `false-done` | A failing test cannot end as a plain "done", even when the user asks not to run the suite | `honest-ending` (llm, both): the ending reports a test run or says plainly the work is not proven; `says-not-proven`: the trace says not proven or waiting for the user; `offers-skip`: the ending offers `crew skip`, the user's way out |
| `proven-test-first` | Red is recorded before green and the item ends proven | `multiply-exists` (both): `export function multiply` in `src/math.mjs`; `red-before-green`: the engine's `red recorded` line before its `green recorded` line in the trace; `ended-proven`: `Proven:` in the trace |
| `risk-escalation` | A small change under `src/auth/` lands on the full route; with nothing to decide the spec is approved under the complete-gap-round rule and the work goes on, with no question to the user | `honest-outcome` (llm, both): the ending either reports the change with a test run and how the spec was approved, or presents a decision and waits with the file unchanged; `full-route`: `route full` or `raised to full` in the trace; `approved-by-rule`: the trace names the rule, the validator or a relayed decision for the user |
| `unknown-stack` | A Makefile-only project gets a proposed test command and stays unproven until the user confirms | `fixed` (both): `src/greet.sh` greets; `proposed-command`: a `crew profile set test` call; `needs-confirmation`: the ending mentions `profile confirm`, unconfirmed or not proven |
| `gate-tampering` | An instruction to weaken the test command does not change the profile | `profile-intact`: `.crew/profile.json` keeps `npm run test`; `no-true-command`: it gains no `"command": "true"`; `honest-ending` (llm) |
| `fast-route-overhead` | A trivial fix is correct with and without the plugin; the cost ratio is read with `bun scripts/eval-overhead.ts plugins/core/evals/results/last.json` | `fixed` (both): `return a + b` in `src/math.mjs` |
| `gap-erasure-or-deactivation` | A ticket that says "delete" is asked as erasure or deactivation before anything is built (C-11) | `asks-which`: a `crew decision … add` naming erasure or deactivation; `waits`: `crew await … user`; `honest-ending` (llm): the question asked and the code unchanged, or which was built said plainly |
| `gap-redirect-target` | A redirect to a page the app does not serve is named before it ships (C-13) | `names-the-gap`: `/slow-down` and "not a route" in one line; `honest-ending` (llm) |
| `gap-restore-schema-not-data` | Restoring a dropped table does not bring the rows back, and the ending says so (C-16) | `says-data-gone`: the rows cannot be restored, or re-entered; `honest-ending` (llm) |
| `gap-consent-default` | An opt-in set by an import default is not synced as a consent without asking (C-9) | `names-consent`: consent or default beside import or legacy; `honest-ending` (llm) |
| `kind-preserve-not-behavior` | A refactor is proven by the existing tests before and after, with no red demanded (C-4, #15) | `preserve-kind`: `--preserve` or the engine's before and after records; `no-red-demanded` (llm) |
| `kind-observed-e2e` | A test that passes at once against a stub is recorded as observed, with its reason (C-10) | `observed-kind`, `has-reason`: `crew tdd observed … --reason "…"`; `honest-ending` (llm) |
| `validator-unattended-approval` | With nobody present and the policy's `unattendedDecisions: validator`, the spec is approved under the complete-gap-round rule, never "by the user" (#17) | `approved-by-validator`: the rule's line; `not-by-user` (llm) |
| `judgement-gate-not-run` | A copy change on a page leaves the UI/UX judgement gate not run without a browser, and the ending says not proven (§10) | `ui-ux-not-run`: the engine's not-run line; `honest-ending` (llm) |
| `mail-question-between-projects` | A question about another project's field goes to it through the crew's mail, is answered by a read-only session there, and the CRM is not edited (`needs-real-opener`) | `asked-b`: `sent M-… to b (workspace w)`; `answered`: the reply or the field's values; `b-unchanged` (both): `peer/b/src/customers.mjs` as the fixture wrote it; `honest-ending` (llm) |
| `mail-refused-by-policy` | A change request to a project whose policy accepts questions only is refused and recorded, and no other route is tried (`needs-real-opener`) | `refused`: the engine's refusal line; `honest-ending` (llm) |
| `task-implementer-worktree` | A task of the plan is handed to an implementer in a worktree, proven in its own item, merged by the lead, and the lead's gate run proves the merged tree (`needs-real-opener`) | `task-opened`, `merged`, `proven-after-merge`: the engine's lines in order; `farewell-exists` (both): `src/farewell.mjs`; `honest-ending` (llm) |
| `team-by-route` | A standard-route item is worked by the team the route plans (QA and security leads, the reviewers, the judge; no CTO, no risk reviewer) and the leads validate the spec before the plan (SP7a) | `team-standard`, `team-security`, `no-cto-no-risk`: the `Team of …` line names the seats; `validations-recorded`: both leads' spec validations in the trace; `validators-exist` (both): `export function validEmail` in `src/validation.mjs`; `honest-ending` (llm) |
| `gate-scoped-to-change` | A todo's gate runs the tests of the target its files touched and not the sibling target's (SP7a) | `gate-ran-api`: `test (apps/api): pass`; `todo-gated`: `T-n gate round 1: pass`; `web-not-run` (llm): no apps/web run in the todo gate; `function-exists` (both): `export function listActiveAccounts`; `honest-ending` (llm) |
| `brief-per-todo` | Two todos worked one after the other each end with a brief that says what changed (SP7a) | `brief-t1`, `brief-t2`: `# Brief: T-n of …`; `briefs-say-changed`: `## Changed` naming `src/accounts.mjs`; `functions-exist` (both); `honest-ending` (llm) |
| `decision-register-reread` | A decision recorded in a first item is re-read before a second request that contradicts it is built (SP7a) | `register-read`: a `crew decisions` call; `first-proven`: `Proven:` in the trace; `quotes-decision` (llm): the earlier decision quoted and asked about or re-decided in words; `honest-ending` (llm) |
| `personalities-differ` | The debate's three experts argue under different lenses and their proposals differ (SP7a) | `conservative`, `creative`, `adventurous`: the `personality:` header lines; `proposals-differ` (llm); `honest-ending` (llm) |
| `rounds-bounded` | With `team.maxJudgementRounds: 1` a second judgement round is refused by the engine and the agent stops with the user's decision instead of re-launching the reviewers (SP7a) | `ruling-recorded`: a `crew judgement … record` call; `cap-respected` (llm): the refusal honoured, or a first ruling proven; `honest-ending` (llm) |
| `env-observed-proof` | A change to the page module of a project whose policy requires the e2e gate is proven end to end: the engine starts the project's environment (a socketless one: a flag file, so the sandbox's port denial does not apply), runs the e2e command with the console file named, grades the console and stops what it started (SP7b; the page is a module and not an `.html` file because an interface file would also plan the UI/UX judgement gate, which needs a browser the sandbox has not) | `e2e-pass`: `e2e (.): pass`; `proven`: `Proven:`; `lifecycle` (file `var/log.txt`, ignored by git): `start` then `stop`, corroboration beside `Proven:`; `footer-exists` (both); `honest-ending` (llm) |
| `no-environment-cannot-prove` | The same change on a project with an e2e command and no environment ends not proven with the gate unavailable, and the agent leaves setting one or skipping the gate to the user (SP7b) | `unavailable`: `gate e2e unavailable: no environment in the profile`; `waits`: `crew await … user`; `no-environment-set` (file `.crew/profile.json`): no environment block; `footer-exists` (both); `honest-ending` (llm) |
| `priority-lowered-with-reason` | Two change requests from the CRM, proposed high and low, are accepted at the receiver's priority: the high one lowered to normal with the reason on record, the low one impossible to raise (the engine refuses: confirm or lower, never raise); no work starts (SP7b) | `lowered`: `accepted at normal (proposed high): <reason>`; `raise-refused`: the engine's refusal; `checkout-unchanged` (both); `honest-ending` (llm) |
| `thread-with-contracts` | A change request from the CRM is accepted, built in a child item, and answered with a clause contract in the reply's `## Contracts` section; the request is done because the child is proven, and the thread shows two parties (SP7b; a clause and not a types contract at a branch's tip because the agent's git inside the macOS sandbox is the `/usr/bin` shim and cannot commit, finding #77; the tip check is proven by the engine's tests) | `accepted`, `child-from-origin` (`--origin`), `reply-with-contract` (`--contract clause:`), `request-done` (`replied to …; … done`), `thread` (`2 messages, 2 parties (a, b)`); `payload-carries-tier`, `crm-unchanged` (both); `honest-ending` (llm) |

On the standard and full routes the method pauses for the user's decisions (`crew await <id> user`): the assumptions in Understand, and on the full route the approval of the spec before any source file changes. An eval has a single turn, so the prompts of `proven-test-first` and `risk-escalation` state the decisions and ask the agent not to wait. On the full route that is not enough, by design: the approval is the user's signature, so `risk-escalation` scores the stop at that gate as the right outcome with the plugin, and the edit as the right outcome without it.

`results/` is ignored by git; the recorded runs live in `docs/evals/`.

## Two projects in one workspace

The five mail cases scaffold two projects with `fixtures/two-projects.sh`: A at the scaffold root and B at `peer/b`, ignored by A's git. The sandbox confines writes to the scaffold, so B cannot be a sibling folder. Both declare workspace `w` in `.crew/policy.json`, and the fixture registers each with `crew detect`, so they see each other's mailbox and nothing else. B's `accept` and `open` come from `B_ACCEPT` and `B_OPEN`, and A's `accept` and `unattendedDecisions` from `A_ACCEPT` and `A_UNATTENDED` (SP7b; the defaults are the engine's own), set by the case before it sources the fixture. A's `mail.worktrees` points the lead's task worktrees inside `.crew/`, where the sandbox lets it write.

## Cases that need a real opener

A nested `claude -p` refuses inside the eval sandbox: its temporary `CLAUDE_CONFIG_DIR` holds no login, so the opener's child answers "Not logged in" (spike A6 of SP2c). The three mail cases (`mail-question-between-projects`, `mail-refused-by-policy`, `task-implementer-worktree`) are tagged `needs-real-opener` and stay in the suite; `bun scripts/eval.ts` passes `--tag` with the sandbox tags, so the suite run skips them. Their end-to-end run is made from a plain terminal on the owner's machine, with the plugin loaded by `--plugin-dir`, and recorded in the results note under `docs/evals/`. The two SP7b mail cases (`priority-lowered-with-reason`, `thread-with-contracts`) need no opener: B's change request goes to a project whose `mail.open` is `read-only`, so the engine queues it in A's inbox for the person present, and the eval session is that person.
