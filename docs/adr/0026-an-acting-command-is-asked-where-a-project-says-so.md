# 0026. An acting command is asked where a project says so

- Status: accepted (the crew, 2026-11-25, on the user's answer of 2026-11-24 to the one question put: with a person present the hook asks for every such command, apply and destroy included; the user may replace it).
- Date: 2026-11-25

## Context

Three team definitions say that a command which changes something outside the machine is a person's decision.

- `docs/specs/2026-11-15-devops-team-design.md:91`: "A deploy to production and any command that deletes or changes a real resource are a person's decision, never the team's own".
- `docs/specs/2026-11-16-agentic-os-team-design.md:224`: "Publishing a server (`wrangler deploy`) or creating a managed agent on an account is a deploy, a person's decision, never the agent's".
- `docs/specs/2026-11-16-frontend-team-design.md:177`: "when one of them is used, the rule applies that a deploy to production, and any command that deletes or changes a real resource, is a person's decision."

The DevOps definition leaves open how that is held (its line 328: "by the session's permissions, a hook, or the credentials").

Before this decision the PreToolUse hook read such commands only in a session opened by mail or by a journey, from a list of regular expressions, `OPENED_VERBS` in `packages/engine/src/hooks/pre-tool-use.ts`, and denied them there. In any other session the hook said nothing of them and Claude Code's own permissions decided. Two cases then leave no prompt for the person: a broad allow rule (`Bash(terraform *)`), and a narrower rule written by prefix where the command has a form the prefix does not match (`kubectl -n prod apply`, `npx wrangler deploy`). Of auto mode one thing was read, on Claude Code's hooks page on 2026-11-24: there a PreToolUse hook's `ask` sends the call to the permission prompt. What auto mode's own classifier does with a deploy when no hook speaks was not read.

The standing list had holes an opened session inherited: no `terraform destroy`, no `tofu`, `pulumi`, `helm`, `cdk`, `wrangler` or `flyctl`, and an option before a verb, or a runner, escaped it.

## Decision

A project turns the rule on. The policy has a key, `actingCommands`, `off` by default and `ask` by `crew policy set actingCommands ask`. The hook asks for a policy command by a prompt in every policy, relay included, and denies it where nobody is present, and the validator that decides for an absent person may not change this key (ADR 0012). Each change of the key, on and off, is written to the project's decision register as the user's before the file changes. A session cannot turn the rule off by itself.

One table, `ACTING_TOOLS` in `packages/engine/src/hooks/acting.ts`, holds a row of data per tool: its names, its options that take a value, and what acts, as paths of subcommand words, a word at any position, a list of reads for a tool that acts with no subcommand, every use, or a path with the flags that make it act. One function, `actingOf`, reads the words of one simple command against it, each word once. It reads through a runner to the tool it runs (`npx`, `bunx`, `pnpx`, `pnpm dlx`, `pnpm exec`, `yarn dlx`, `npm exec`, `npm x`, `bun x`), skips an option before the verb with its value where the row lists it, and returns a text made of the table's own words (`kubectl apply`, `vercel`, `wrangler deploy`). A verb that is an expansion or a pattern at a position the row reads, words that would come through `xargs` there, and a runner given its command as a line the hook's walk does not hand on, are answered as a command the guard cannot read. The runner's option reader and the characters that make a word unreadable are the hook's own, moved to `packages/engine/src/shell-words.ts` and read by both.

Which verbs were read on the tool's own page, by the item's research on 2026-11-24: `terraform` and `tofu` `apply` and `destroy`; `pulumi up` and `destroy`; `aws cloudformation deploy`; `cdk deploy`; `az deployment group create` and `delete`; `helm install`, `upgrade`, `uninstall`, `rollback` and `push`; `kubectl apply` and `delete`; `docker image push`; `vercel` with no subcommand and its reads; `netlify deploy`; `wrangler deploy`, `versions deploy`, `rollback` and `delete`; `fly deploy`; the five verbs of `kamal`; `gh release create` and `workflow run`; the publishing of `npm`, `pnpm`, `yarn`, `bun`, `cargo`, `twine`, `uv` and `poetry`, and `gem push` and `yank`; `eas submit` and `update` and `--auto-submit`; promptfoo's sharing. Every other verb of the table, the whole `gcloud` row, the scopes of `az deployment` other than `group`, and every valued option were not read on a page: they are the session's and the DevOps lead's own knowledge of the tools.

In a session that is not opened, and only with the key at `ask`: where a person is present the hook answers `ask`, once for a line, naming every acting command of the line, carried to the end of its rules so that every deny the line earns is given first. Where nobody is present (a headless session, `bypassPermissions`, `dontAsk`) it denies, and the reason tells the session to stop and not to run the command in another form. `attendedDecisions: relay` does not silence the ask: the person's yes in the prompt is the only decision there is. A line the hook could not read is answered by its own rule, the table not consulted.

In a session opened by mail or by a journey, every command of the table is denied whatever the key, after the standing list has denied nothing, with the sentence such a session already has. Nothing it was denied before passes.

A throw of the new function is contained: it loses the answer for one command and no standing rule.

## What the rule does not hold

- It is a reminder and no security boundary. A deploy behind `npm run deploy`, `make deploy`, a script written and then run, an interpreter's one-liner, `ssh host '<command>'`, `docker run <image> <command>`, a secrets wrapper (`op run --`, `aws-vault exec`, `doppler run`), `bundle exec`, `python -m twine`, `uvx` and `pipx run`, a program word that is a variable or an alias, or a push to a branch a platform deploys from is not read.
- A binary run as `yarn <bin>`, `pnpm <bin>` or `bun run <bin>`, a runner inside a runner, and `yarn workspace <name> npm publish` are not read. A flag of a flagged row that comes from a variable (`docker build $FLAGS .`) is not read.
- The rows hold the verbs that deploy, apply, destroy, delete, publish or push, and a tool's other changing verbs pass: of `terraform` and `tofu`, `import`, `state rm`, `taint`, `workspace delete`; of `pulumi`, `refresh`, `import`, `stack rm`; of `kubectl`, `edit`, `label`, `annotate`, `drain`, `cordon`, `exec`, `run`, `expose`; of `cdk`, `bootstrap`, `watch`; of `wrangler`, `versions upload`, `secret put`, `d1 execute`, the kv and r2 writes; of `fly`, `launch`, `apps destroy`, `secrets set`, `scale`; of `kamal`, `app`, `accessory`, `prune`; of `gh`, `release upload` and `edit`, `secret set`; of `npm`, `deprecate`, `dist-tag`; of `eas`, a secret written and a build in the cloud; of `docker`, a command against a remote host by `--context` or `-H`, `buildx bake --push`, `buildx imagetools create` and `--output type=registry`; of `promptfoo`, `--remote` on a command other than `eval` and sharing turned on by its configuration. So do the mutating calls of `aws`, `gcloud` and `az` beyond their rows, `curl` against an API, and a database client on a production address.
- An unknown subcommand of a listed tool passes, and a tool's new acting verb is not in the table until it is edited.
- The rule asks on reads in these cases, and no other is known: `gcloud` on any use that holds the word `deploy` and on a read with a variable among its first six words; `vercel` on every subcommand outside its reads (`vercel env ls`); `ansible-playbook` on every use, its check mode and its listing flags included; `kubectl set` on its listing forms; a listed tool whose verb is a variable that holds a reading verb; an acting verb given a flag that makes it a rehearsal (`--dry-run`). `vercel link` passes though it can create a project.
- An option that takes a value and is not in a row's valued list has its value read as a positional word, which can hide the verb or show one that is not there: `npm --otp 123456 publish` and `aws --cli-binary-format raw-in-base64-out cloudformation deploy` are not read. Compose's own options are not in docker's row: `docker compose -f prod.yml push` is not read, and `docker compose -f $F up` is answered as a verb the guard cannot read. `cargo +nightly publish` is not read.
- The hook does not run outside an activated project and answers nothing past its time bound; a bug in the table lets a command pass with no trace, since the hook keeps no record of what it decided.
- A person in `bypassPermissions` or `dontAsk` is denied, with no prompt to answer: Claude Code documents no prompt for a hook's ask in either mode. A `claude -p` run the engine does not see as unattended is asked, and Claude Code denies the ask.
- An ask can reach a program and not a person (an SDK's `canUseTool`, a permission-prompt tool, another mod). On a runtime other than Claude Code the engine turns an ask into a deny.
- A person's allow rule for one of these tools stops sparing them the question in a project that turns the key on. Whether the prompt shows the hook's reason, and whether it offers a lasting yes, no page read says.
- In an opened session `serverless deploy`, `sam deploy`, `cap deploy` and `heroku` are denied by the standing list, and with the key on they are never asked: they have no row.
- This repository's own release runs as `bun scripts/release.ts` and is not read.

## Consequences

- No project changes at the update for a session that is not opened: the key is off until a person turns it on.
- A session opened by mail or by a journey is denied more, in every project, from the update on: every row of the table. A journey that works on a local cluster is denied `kubectl create` and `helm install` there, since the guard cannot tell a test cluster from a real one; `crew journey part <id> wait P-n` records that the part waits for a person. No policy key reaches such a session, so for it the way back is the revert of the commit and a release of it.
- `OPENED_VERBS` and the table overlap on the commands the standing list reads first, which it names in its own words. The two are to become one table, in an item of its own.
- A row is read on its tool's own page when it is next touched, and a new row is added by an item with the page read on the day. The tools the definitions name and this decision gives no row are a later item's: Terragrunt, Podman, Buildah, `glab`, `bk`, semantic-release, Changesets, GoReleaser, SST, Serverless Framework, Render, Railway and Heroku.
- Read-only credentials for each platform's CLI, the other means the DevOps definition names, are not this decision's.
