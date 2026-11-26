# An acting command is a person's decision where a project says so

The predecessor is `concepts_brief.md` in this item's folder: the account of six reviewers with no context who read the first concept (`concept.md`) against the code and the research (`conclave/researcher.md`). This spec holds what the brief's Goals and Key Decisions kept, and what the four leads' reading of the spec changed after it.

Size: one task for one session. One new source file, `packages/engine/src/hooks/acting.ts`. Five changed: `packages/engine/src/hooks/pre-tool-use.ts`, `packages/engine/src/shell-words.ts`, `packages/engine/src/policy.ts`, `packages/engine/src/types.ts` and `packages/engine/src/cli.ts`. One new ADR, one sentence in a reference, one new test file and one expected value of a standing test.

## Problem

A session that runs `terraform apply -auto-approve`, `npm publish` or `vercel --prod` changes something outside the machine, and a person may learn of it after the fact. The DevOps, agentic-os and frontend definitions say such a command is a person's decision: "A deploy to production and any command that deletes or changes a real resource are a person's decision, never the team's own" (`docs/specs/2026-11-15-devops-team-design.md:91`), and the DevOps definition leaves open how that is held (line 328). Today the PreToolUse hook reads these commands only in a session opened by mail or by a journey, where it denies them (`OPENED_VERBS`, `packages/engine/src/hooks/pre-tool-use.ts:918-995`, read through `openedSessionDenial` at line 2200). In any other session the hook says nothing of them, and Claude Code's own permissions decide. In two cases no prompt then reaches the person: where the person gave a broad allow rule (`Bash(terraform *)`), and where a narrower rule is written by prefix and the command has a form the prefix does not match (`kubectl -n prod apply`, `npx wrangler deploy`). Of auto mode the research read one thing, on Claude Code's hooks page on 2026-11-24: there "a PreToolUse hook's `ask` normally sends the tool call to the permission prompt, and the classifier doesn't decide it" (`conclave/researcher.md`). What auto mode's own classifier does with a deploy when no hook speaks was not read.

The standing list has holes of its own, which an opened session inherits: no `terraform destroy`, no `tofu`, `pulumi`, `helm`, `cdk`, `wrangler`, `flyctl`; an option before a verb escapes it, and so does a runner.

## Goals and Non-Goals

Goals:

- A project turns the rule on: a policy key `actingCommands`, `off` by default, `ask` by `crew policy set actingCommands ask`. Off, a session that is not opened is answered as today.
- One table, `ACTING_TOOLS`, names what acts for each of its tools, and one function reads a command against it.
- On, with a person present: the hook asks once for a line, naming every acting command in it. With nobody present: it denies, and says what to do.
- A session opened by mail or by a journey is denied every command of the table, whatever the key, beside everything it is denied today.
- An ADR says what the rule is and what it does not hold.

Non-Goals:

- A security boundary. The rule is a reminder: the Design's last part lists what goes around it.
- A pass by flag: `npm publish --dry-run` and `kubectl apply --dry-run=server` are asked. A reading subcommand of a row held by its acting verbs (`terraform plan`, `kubectl diff`, `helm template`) is not in the table and is never asked.
- Telling production from a preview, or a test cluster from a real one. A grant that lasts beyond one line. A record of what the hook decided. A list a pack or a project adds to.
- Tools the definitions name and this item gives no row, left to a later item: Terragrunt (the DevOps definition's line 89), Podman and Buildah (line 88), `glab` and `bk` (line 86), semantic-release, Changesets and GoReleaser (line 91), SST, Serverless Framework, Render, Railway and Heroku (lines 42 and 45); and the rest of the research's list (firebase, supabase, fastlane).
- `OPENED_VERBS`: not changed and not merged into the table; the ADR says the two are to become one.
- MCP tool calls, which the hook's matcher does not reach.

## Open Questions

None.

## Critical User Journeys

- Given a project whose policy has `actingCommands: ask` and a person at the keyboard in auto mode, when the session runs `kubectl -n prod apply -f k8s/ && npm publish`, then the hook answers `ask` with a reason that names `kubectl apply` and `npm publish`, which makes Claude Code put its prompt to the person; whether that prompt shows the hook's reason no page read says.
- Given the same project and a headless session, when the session runs `npx wrangler@latest deploy`, then the call is denied, the reason names `wrangler deploy` and the mode, and tells the session to stop and not to run it in another form.
- Given a project that never set the key, when a session runs `terraform apply`, then the hook answers nothing, as today.
- Given a session opened by mail in any project, when it runs `tofu destroy`, then it is denied with the opened session's sentence and its ending.

## Design

### The policy key

`Policy` gains `actingCommands: "off" | "ask"`, `off` in the default policy and for any other value read from the file. It is the last of the scalar keys `crew policy set` writes (`SETTABLE_POLICY_KEYS`), after `riskPathExclusions`: a message that lists the keys then gains one name at its end and changes nowhere else.

A policy command is the person's alone. The hook asks for `crew policy set` by a prompt in every policy, `relay` included, and denies it where nobody is present (`packages/engine/src/hooks/pre-tool-use.ts:1194-1198, 1232`). The validator that decides for an absent person may change only the keys its own list names (ADR 0012), and this key is not among them. So turning the key on, and turning it back to `off`, are each asked of the person, and a session cannot silence the rule by itself.

Each change of the key is recorded in the project's decision register as the user's, on and off, with the value: `crew policy set` records today only one key's change (`setScalarKey`, `packages/engine/src/cli.ts:2757-2767`), and turning a guard off is a decision the register must hold.

### The table

A new module, `packages/engine/src/hooks/acting.ts`, exports `ACTING_TOOLS`, a list of rows of data, and `actingOf`. A row has: `names`, the command words that are the tool; `valued`, its options that take the next word as their value; and what acts, in one of these forms:

- `acts`: paths of subcommand words, each matched against the command's first positional words, `*` standing for any one word (`["deployment", "*", "create"]`).
- `anyWord`: words that act at any position among the positional words read (`gcloud … deploy`).
- `reads`: for a tool that acts with no subcommand, the first words that do not act; any other first word, and none, acts.
- `whole`: every use acts.
- `flagged`, alone or beside `acts`: a path and the flags that make it act (`promptfoo eval --share`).

The rows:

| Names | Valued options | Form | What acts |
| :- | :- | :- | :- |
| `terraform`, `tofu` | none | acts | `apply`, `destroy` |
| `pulumi` | `-s`, `--stack`, `-C`, `--cwd`, `--color`, `-v` | acts | `up`, `update`, `destroy` |
| `kubectl` | `-n`, `--namespace`, `--context`, `--kubeconfig`, `--cluster`, `--user`, `-s`, `--server`, `--as`, `--as-group`, `--as-uid`, `--token`, `--request-timeout`, `--certificate-authority`, `--client-certificate`, `--client-key`, `--tls-server-name`, `--cache-dir`, `-v` | acts | `apply`, `delete`, `replace`, `patch`, `scale`, `create`, `set`, `rollout restart`, `rollout undo` |
| `helm` | `-n`, `--namespace`, `--kube-context`, `--kubeconfig`, `--kube-apiserver`, `--kube-token`, `--kube-as-user`, `--registry-config`, `--repository-config` | acts | `install`, `upgrade`, `uninstall`, `delete`, `rollback`, `push` |
| `aws` | `--profile`, `--region`, `--endpoint-url`, `--output`, `--query`, `--color`, `--ca-bundle`, `--cli-read-timeout`, `--cli-connect-timeout` | acts | `cloudformation deploy`, `cloudformation create-stack`, `cloudformation update-stack`, `cloudformation delete-stack`, `cloudformation execute-change-set`, `deploy create-deployment`, `deploy stop-deployment` |
| `cdk` | `--profile`, `-a`, `--app`, `-c`, `--context`, `-o`, `--output` | acts | `deploy`, `destroy` |
| `az` | `--subscription`, `-o`, `--output`, `--query` | acts | `deployment * create`, `deployment * delete` |
| `gcloud` | `--project`, `--account`, `--configuration`, `--region`, `--zone`, `--format`, `--impersonate-service-account`, `--verbosity`, `--billing-project` | anyWord | any word `deploy` |
| `ansible-playbook` | none | whole | whole |
| `wrangler` | `-c`, `--config`, `-e`, `--env`, `--cwd` | acts | `deploy`, `publish`, `rollback`, `delete`, `versions deploy`, `pages deploy` |
| `vercel`, `vc` | `--cwd`, `-t`, `--token`, `-S`, `--scope`, `-T`, `--team`, `-A`, `--local-config`, `-Q`, `--global-config` | reads | everything but the reads `dev`, `build`, `pull`, `link`, `login`, `logout`, `whoami`, `list`, `ls`, `inspect`, `logs`, `help`, `switch` |
| `netlify`, `ntl` | `--auth`, `--filter` | acts | `deploy` |
| `fly`, `flyctl` | `-a`, `--app`, `-c`, `--config`, `-t`, `--access-token` | acts | `deploy` |
| `kamal` | `-c`, `--config-file`, `-d`, `--destination`, `-h`, `--hosts`, `-r`, `--roles` | acts | `deploy`, `redeploy`, `rollback`, `remove`, `setup` |
| `docker` | `--context`, `-c`, `--config`, `-H`, `--host`, `-l`, `--log-level` | acts, flagged | `push`, `image push`, `compose push`, `manifest push`; `build` and `buildx build` with `--push` |
| `npm` | `-w`, `--workspace`, `--prefix`, `--registry`, `--userconfig` | acts | `publish`, `unpublish` |
| `pnpm` | `-C`, `--dir`, `--filter`, `-F` | acts | `publish` |
| `yarn` | `--cwd` | acts | `publish`, `npm publish` |
| `bun` | `--cwd` | acts | `publish` |
| `cargo` | `--manifest-path`, `--color`, `--config`, `-Z` | acts | `publish`, `yank` |
| `twine` | none | acts | `upload` |
| `uv` | `--directory`, `--project` | acts | `publish` |
| `poetry` | `-C`, `--directory`, `-P`, `--project` | acts | `publish` |
| `gem` | none | acts | `push`, `yank` |
| `gh` | `-R`, `--repo` | acts | `release create`, `release delete`, `workflow run`, `run rerun` |
| `eas` | none | acts, flagged | `submit`, `update`, `deploy`; `build` with `--auto-submit` |
| `promptfoo` | none | acts, flagged | `share`; `eval` with `--share` or `--remote` |

The rows answer the DevOps definition's lines 86 (a pipeline triggered), 88 (a push to a registry) and 89 to 91 (infrastructure and platforms), and parts of two others: of the agentic-os definition, `wrangler deploy` (line 224) and promptfoo's `share` and its two flags on `eval` (line 222; limit 3 says what of that line is not read); of the frontend definition's line 259, a store submission and an over-the-air update.

Read by the research on the tool's own page, on 2026-11-24 (`conclave/researcher.md`):

- `terraform` and `tofu`: `apply`, `destroy`. `pulumi`: `up`, `destroy`. `aws cloudformation deploy`. `cdk deploy`. `az deployment group create` and `delete`.
- `helm`: `install`, `upgrade`, `uninstall`, `rollback`, `push`. `kubectl`: `apply`, `delete`. `docker image push`.
- `vercel` with no subcommand, and its reads. `netlify deploy`. `wrangler`: `deploy`, `versions deploy`, `rollback`, `delete`. `fly deploy`. The five verbs of `kamal`.
- `gh release create` and `workflow run`. The publishing of `npm`, `pnpm`, `yarn`, `bun`, `cargo`, `twine`, `uv` and `poetry`; `gem push` and `yank`.
- `eas submit` and `update`, and `--auto-submit`. Promptfoo's sharing.

Not read on a page for this item, the session's and the DevOps lead's own knowledge of the tools: every other verb of the table, the whole `gcloud` row, the scopes of `az deployment` other than `group`, and every valued option. The ADR says so, and that a row is read on its tool's page when it is next touched.

### Reading a command

`actingOf(words, viaXargs)` takes the words of one simple command as the hook's walk gives them, the lead already gone (assignments, `sudo`, `env`, the other wrappers), and returns what acts as a short text, or null. In order:

1. The first word, lower-cased and with its folder and a trailing `.exe` or `.cmd` gone, is the program.
2. A runner is read through, once.
   - The one-word runners `npx`, `bunx` and `pnpx`: their options are skipped by the hook's own `runnerOptions`, which moves with its tables to `packages/engine/src/shell-words.ts` and takes the index it starts at, so that the hook and this module call one function; one `--` is skipped.
   - The two-word runners `pnpm dlx`, `pnpm exec`, `yarn dlx`, `npm exec`, `npm x` and `bun x`: the runner word is the manager's first positional word, the manager's own row giving its valued options (`pnpm --filter web exec …`); after it, options are skipped by the same function and one `--` is skipped (`npm exec --yes -- wrangler deploy`).
   - The package word that follows, with its scope and its `@version` gone (`@scope/wrangler@latest` reads `wrangler`), is the program, and the words after it are its words. A runner with no package word gives null.
   - A runner given its command as a line (`-c`, `--call`): for `npx` and `bunx` the hook's walk already hands that line on and reads it as commands of its own, so the runner itself gives null. For `pnpx` and the two-word runners the walk hands nothing on, and the answer is `<runner> with a command the guard cannot read`. The same answer is given where a runner's package word would come through `xargs`.
3. A program that is no name of the table gives null.
4. The positional words are the words that do not open with `-`, the word after a valued option left out, an option that carries its value (`-chdir=infra`, `--namespace=prod`) being one word. At most the first six are read.
5. The row decides, by its form, and says which positional words it reads:
   - `acts` and `flagged`: the words are matched one by one against the row's paths. The word at position i is read only while the words before it are the start of at least one longer path. The command acts where a path is met whole (for a `flagged` path, only where one of the command's words is one of its flags, alone or followed by `=`); a word that continues no path ends the reading with null. A word at a `*` position is taken whatever it holds.
   - `reads`: the first positional word alone is read. With none, the command acts, unless its words hold `--version`, `-v`, `--help` or `-h`.
   - `anyWord`: each of the six is read.
   - `whole`: none is read; every use acts.
6. A word that is read and holds an expansion or a pattern cannot be compared: the answer is then `<program> with a verb the guard cannot read`. The characters are the hook's own two sets, `EXPANSION_CHARS` and `PATTERN_CHARS` (`$`, a backtick, `{`, `[`, `(`, `*`, `?`), which move to `shell-words.ts` so that the standing list and this module read one copy. Words that come through `xargs` stand after the last word the command gives: where the row would read a word at that position, the answer is that same unreadable text. So `kubectl rollout $V`, `terraform $CMD` and `echo apply | xargs terraform` cannot be read; `kubectl get pods $POD`, `docker build -t app:$TAG .`, `terraform plan -var x=$Y` and `find . | xargs terraform fmt` give null; `twine upload dist/*` gives `twine upload`.

The text returned is the program as step 1 or 2 read it (`tofu`, `flyctl`, `wrangler`), followed for `acts` by the path's words with `*` left out (`az deployment create`), for `anyWord` by the word (`gcloud deploy`), for `flagged` by the path and the flag (`eas build --auto-submit`), and by nothing for `reads` and `whole` (`vercel`, `ansible-playbook`). No other word of the command enters it.

The function reads each word once: no regular expression runs over the line, so its time grows with the number of words.

### A throw of the new function is contained

The hook answers nothing where it throws (`packages/engine/src/hooks/index.ts:79-81`), and the two new calls stand before rules that deny today. Each call of `actingOf` in the hook is therefore contained, as the call of `writesWatched` is (`packages/engine/src/hooks/pre-tool-use.ts:2401-2405`): a throw gives no acting text for that command, and every standing rule still runs. The module exports the function through an object the hook's helper calls, so that a test can put a function that throws in its place and see that it was called.

### The answer, in a session that is not opened

Only where the policy's `actingCommands` is `ask`, and only for a line the hook could read: a line the shell reader could not close and a PowerShell line the hook cannot read are answered as today, the table not consulted. The hook collects what `actingOf` gives for every simple command of the walk, each text once, in the line's order. With none, nothing changes. Otherwise, with `<list>` the texts joined by ", " and "and":

- Nobody present, as the hook already decides it (`unwatched`: a headless session, `bypassPermissions`, `dontAsk`): the hook denies, with

      Crew: <list> is a person's decision in this project (policy actingCommands) and nobody is here to give it (<what unwatched said>): stop, and do not run it in another form (a script, a package's script, another runner); say so to the user, who runs it themselves or asks again from a session that can be asked

- A person present: the hook carries an ask to the end of its rules, where the asks of the crew's own commands are returned, so that every deny the line earns is given first. Its reason:

      Crew: <list> is a person's decision in this project (policy actingCommands): it can deploy, apply, destroy or publish outside this machine, and the guard cannot tell an act from a read for it, nor production from a preview. A yes here is that decision, for the whole line. Where nobody answers, stop, and do not run it in another form.

  Where the line also earned an ask of a crew command, the one ask returned holds both reasons, the crew command's first.

Where nobody is present the acting deny is given before the denies on the engine's files, the lanes and the phases: a line that earns both is denied either way, and the reason given can be the acting one.

`attendedDecisions: relay` does not silence this ask: relay is about the crew's own decision commands, which the session runs once the person has spoken, and here the person's yes in the prompt is the only decision there is.

### The answer, in an opened session

After the opened session's own rules have denied nothing (`openedSessionDenial`), every simple command of the walk is read against the table, whatever the policy's key, and the first match is denied with the sentence the opened session already has: `<opener> and never merges, pushes to another branch, releases or deploys: <what> is denied; <ending>`. Nothing an opened session is denied today passes. The new deny stands before the opened session's rules on its checkout and on the crew's own verbs, so a line that earns one of those and holds an acting command is denied with the acting reason. The standing list reads ten of the table's commands first (`terraform apply`, `npm publish`, `vercel`, `netlify deploy`, `fly deploy`, `kubectl apply`, `gcloud … deploy`, `ansible-playbook`, `gh workflow run`, `docker push`) and names them in its own words; the two lists overlap on those until the merge the ADR names.

### What the rule does not hold

The ADR says each of these, one bullet each, and the reason's own words say the first:

1. It is a reminder and no security boundary. A deploy behind `npm run deploy`, `make deploy`, a script written and then run, an interpreter's one-liner, `ssh host '<command>'`, `docker run <image> <command>`, a secrets wrapper (`op run --`, `aws-vault exec`, `doppler run`), `bundle exec`, `python -m twine`, `uvx` and `pipx run`, a program word that is a variable or an alias, or a push to a branch a platform deploys from is not read.
2. A binary run as `yarn <bin>`, `pnpm <bin>` or `bun run <bin>`, a runner inside a runner, and `yarn workspace <name> npm publish` are not read. A flag of a `flagged` row that comes from a variable (`docker build $FLAGS .`) is not read.
3. The rows hold the verbs that deploy, apply, destroy, delete, publish or push. A tool's other changing verbs pass: of `terraform` and `tofu`, `import`, `state rm`, `taint`, `workspace delete`; of `pulumi`, `refresh`, `import`, `stack rm`; of `kubectl`, `edit`, `label`, `annotate`, `drain`, `cordon`, `exec`, `run`, `expose`; of `cdk`, `bootstrap`, `watch`; of `wrangler`, `versions upload`, `secret put`, `d1 execute`, the kv and r2 writes; of `fly`, `launch`, `apps destroy`, `secrets set`, `scale`; of `kamal`, `app`, `accessory`, `prune`; of `gh`, `release upload` and `edit`, `secret set`; of `npm`, `deprecate`, `dist-tag`; of `eas`, a secret written and a build in the cloud; of `docker`, a command against a remote host by `--context` or `-H`, `buildx bake --push`, `buildx imagetools create` and `--output type=registry`; of `promptfoo`, `--remote` on a command other than `eval` and sharing turned on by its configuration. So do the mutating calls of `aws`, `gcloud` and `az` beyond their rows, `curl` against an API, and a database client on a production address.
4. An unknown subcommand of a listed tool passes, and a tool's new acting verb is not in the table until it is edited.
5. The rule asks on reads in these cases, and no other is known: `gcloud` on any use that holds the word `deploy` (`gcloud deploy releases list`) and on a read with a variable among its first six words; `vercel` on every subcommand outside its reads (`vercel env ls`, `domains ls`); `ansible-playbook` on every use, its check mode, `--syntax-check`, `--list-tasks` and `--list-hosts` included; `kubectl set` on its listing forms; a listed tool whose verb is a variable that holds a reading verb (`terraform $CMD`); and an acting verb given a flag that makes it a rehearsal (`--dry-run`). `vercel link` passes though it can create a project.
6. An option that takes a value and is not in a row's `valued` list: its value is read as a positional word, which can hide the verb or show one that is not there. `cargo +nightly publish` is not read.
7. The hook does not run outside an activated project, and answers nothing past its time bound; a bug in the table lets a command pass with no trace, since the hook keeps no record of what it decided.
8. A person in `bypassPermissions` or `dontAsk` is denied, with no prompt to answer: Claude Code documents no prompt for a hook's ask in either mode. A `claude -p` run the engine does not see as unattended is asked, and Claude Code denies the ask.
9. An ask can reach a program and not a person (an SDK's `canUseTool`, a permission-prompt tool, another mod). On a runtime other than Claude Code the engine turns an ask into a deny.
10. A person's allow rule for one of these tools stops sparing them the question in a project that turns the key on. Whether the prompt shows the hook's reason, and whether it offers a lasting yes, no page read says.
11. In an opened session `serverless deploy`, `sam deploy`, `cap deploy` and `heroku` are denied by the standing list, and with the key on they are never asked: they have no row.
12. This repository's own release runs as `bun scripts/release.ts` and is not read.

### Alternatives

From `concepts_brief.md` in this item's folder, but the last two, which the leads' reading added.

- On for every project. Rejected: it denies unattended deploys that work today, overrides a person's allow rules and stops a person in `bypassPermissions`, in every project that updates, at one release.
- A second list of regular expressions beside `OPENED_VERBS`. Rejected for its form: hand-written patterns are hard to review for the options before a verb, and a lazy group over options backtracks on a long line. A second list there is all the same, as data, and the Design says where the two overlap.
- Merging `OPENED_VERBS` into the table now. Rejected for this item: its git, gh and settings entries and the push rule are not commands of this kind, and its tests pin its reasons word for word.
- An allow-list of reads for every tool. Rejected but for `vercel`: it asks on each new reading subcommand, and the noise teaches a person to say yes unread.
- Passing a dry run by its flag. Rejected: `--dry-run=none` acts, and the rule for the value differs by tool.
- Shipping Claude Code `permissions.ask` rules in place of the hook. Rejected: a rule matches by prefix, so an option before the verb or a runner escapes it. For auto mode the one thing read is that a hook's ask sends the call to the prompt there (the hooks page, 2026-11-24); whether an ask rule does the same in auto mode was not read.
- Deny in every session, apply and destroy included (option B of the question to the user). Rejected by the user's choice of 2026-11-24.
- Reading the runners inside the shared walk. Rejected: it changes what the crew-command rules judge in existing projects.
- An unreadable word anywhere among the first six words making the verb unreadable. Rejected: it asks on `docker build -t app:$TAG .` and `npm install $PKG`, and denies them in every opened session.
- Naming a `reads` row by its first positional word. Rejected: that word is any word of the command, a folder or the value of an option the row does not list, and it would stand in the reason a person decides on.

## Acceptance criteria

The numbers are the engine's, and a number not listed is a criterion that was replaced.

- AC-10: `actingOf` gives the Design's text for every row of the table, each of its acting forms, and null for the row's reading forms: with an option before the verb, plain and valued, attached and apart; through the three one-word runners and the six two-word ones, with a manager's option before the runner word, with options and a `--` after it, and with a package word that has a scope and a version; for a `reads` row with no word, with each of `--version`, `-v`, `--help` and `-h`, and with a reading word; for a `flagged` row with and without its flag; for a path with `*`; at the sixth positional word and not at the seventh. A program not in the table, an unknown subcommand of a listed tool, and a verb that stands only as the value of a listed valued option give null. A flag of an acting verb (`--dry-run`) does not change the answer. The text of a `reads` row is the program alone, whatever the command's other words.
- AC-19: `actingCommands` is `off` in the default policy and for a value the file holds that is neither word; `crew policy set actingCommands ask` writes it and a third value is refused; setting it to `ask` and to `off` each adds an entry of the user's to the project's decision register, with the value; the hook asks for `crew policy set actingCommands off` where a person is present, under `attendedDecisions: relay` as well, and denies it where nobody is. With the key off, a session that is not opened is answered `{}` for an acting command, a person present or not.
- AC-12: with the key at `ask` and a person present (the modes `default`, `acceptEdits`, `plan` and `auto`), a Bash call whose line holds acting commands is answered `ask` with the Design's reason, each acting command named once in the line's order, behind a wrapper, in a substitution and in a compound line; with `attendedDecisions: relay` as well. A line with none is answered as before. A line that also earns a deny is denied. A line that also earns an ask of a crew command is answered with one ask that holds both reasons. A line the shell reader could not close is answered as it is with the key off.
- AC-13: with the key at `ask` and nobody present (a headless session; `bypassPermissions`; `dontAsk`), the call is denied with the Design's reason, which holds the list and what `unwatched` said. A line the shell reader could not close is answered as it is with the key off.
- AC-14: a listed tool whose verb is an expansion or a pattern at a position its row reads, or whose words come through `xargs` where its row would still read a word, is asked where a person is present and denied where nobody is, named `<program> with a verb the guard cannot read`; an expansion or a pattern at a position the row does not read changes nothing.
- AC-20: in a session opened by mail and in one of a journey, with the key off and with it at `ask`, every acting line of AC-10's list is denied, with the opened session's sentence and its ending, and every reading line of that list that the opened session's own list does not deny passes. With the function the hook calls made to throw, and seen to have been called, the opened session's standing denies and the deny of a write to the engine's files are still given.
- AC-16: a command of 20,000 plain option words before its verb is read by `actingOf` in under one second, and its verb is found.
- AC-21: `docs/adr/0026-an-acting-command-is-asked-where-a-project-says-so.md` exists with Context, Decision, What the rule does not hold (the Design's twelve limits, one bullet each) and Consequences, and rule 2 of `plugins/core/skills/crew/references/rules.md` holds one sentence that names the key, what the hook does with it and that it is a reminder.
- AC-18 (preserve): the tests that stood before this item pass with no `test(` removed and no assertion made to accept more, and with one expected value changed: in `packages/engine/tests/policy-config-state.test.ts`, the refusal that lists the settable keys gains `, actingCommands` at the end of its list and nothing else. Run before and after, the after on a built bundle: `hooks-pre-tool-use`, `shell`, `policy-config-state`, `cli`, `skill`.

## Risks and rollback

- A project that turns the key on meets a question where an allow rule spared it, and a denial in `bypassPermissions`, `dontAsk` and headless runs. It is the project's choice, and `crew policy set actingCommands off`, asked of the person, undoes it.
- An opened session is denied more than before, in every project, from the update on: every row of the table. That is `tofu`, `pulumi`, `helm`, `cdk`, `wrangler`, `flyctl`, `kamal`, `eas`, `az deployment`, `aws cloudformation`, the registries' publishing, `terraform destroy`, `kubectl delete`, `replace`, `patch`, `scale`, `create` and `set`, `docker image push`, the forms with an option before the verb or behind a runner, and a listed tool whose verb cannot be read. A journey that works on a local cluster (kind, k3d) is denied `kubectl create` and `helm install` there, since the guard cannot tell a test cluster from a real one; its way out is the journey's own: `crew journey part <id> wait P-n` records that the part waits for a person, who then does it. No policy key reaches an opened session: for it the way back is the revert of the commit and a release of it.
- A wrong row asks where it should not or passes what acts; the table is data in one file and a test per row holds it.
- A throw in the new function loses the acting answer for that command and nothing else.
- Rollback is the revert of the one commit. A `policy.json` that holds the key is read by an older engine, which ignores a key it does not know.

## Non-Functional Requirements

- Cost: one pass over a command's words per simple command, no regular expression over the line; AC-16 bounds the function. The hook's time bound is five seconds (`plugins/core/hooks/hooks.json`); the walk and the standing list over the same line are not changed by this item.
- Security: the reasons hold the engine's own words and the table's own words (a tool's name, a path's words, a flag), never another word of the command.

## Out of scope

- Read-only credentials for each platform's CLI (the DevOps definition's open point at line 327).
- The definitions' text: their open points stay as written; the ADR answers them.
- The line of `crew help` that lists the settable keys by hand.

# Plan: an acting command is a person's decision where a project says so

One task, in this checkout. It builds `spec.md` of this folder.

## Files

- Modify `packages/engine/src/shell-words.ts`: these move here from `packages/engine/src/hooks/pre-tool-use.ts`, exported, with their comments and their values unchanged: `NPX_CALL`, `NPX_VALUED`, `JS_RUNNER_VALUED`, `RUNNER_VALUED`, the type `RunnerKind`, and `EXPANSION_CHARS` and `PATTERN_CHARS`. `runnerOptions` moves with them and gains a third parameter, `from = 1`, the index it starts at; with the default it answers as today.
- Create `packages/engine/src/hooks/acting.ts`:
  - the type `ActingTool`: `names: string[]`, `valued: string[]`, and the optional `acts?: string[][]`, `anyWord?: string[]`, `reads?: string[]`, `whole?: true`, `flagged?: { path: string[]; flags: string[] }[]`.
  - `ACTING_TOOLS: readonly ActingTool[]`, the spec's 27 rows as written there, each verb of one word a path of one word, `rollout restart` the path `["rollout", "restart"]`, `deployment * create` the path `["deployment", "*", "create"]`.
  - `ONE_WORD_RUNNERS = ["npx", "bunx", "pnpx"]` and `TWO_WORD_RUNNERS`, as data: `pnpm` with `dlx` and `exec`, `yarn` with `dlx`, `npm` with `exec` and `x`, `bun` with `x`.
  - `actingOf(words: readonly string[], viaXargs = false): string | null`, the spec's six steps. Helpers of the file:
    - `programOf(word)`: the text after the last `/` or `\`, lower-cased, a trailing `.exe` or `.cmd` gone.
    - `packageOf(word)`: the text after the last `/`, then before the first `@` that is not its first character, lower-cased.
    - `packageAt(words, from)`: `runnerOptions(words, "npx", from)` gives the index after the runner's options and the line a call option carries; one `--` at that index is skipped. It returns the index of the package word, or that there is none, and whether a call line was given.
    - `positionals(words, valued)`: one pass that keeps at most six words, each with its index in `words`: a word that opens with `-` is dropped, and with it the next word where the word is in `valued`.
    - `cannotBeRead(word)`: whether the word holds one of the characters of `EXPANSION_CHARS` and `PATTERN_CHARS`, the two sets imported from `shell-words.ts`.
    - The runner step: for a one-word runner, the package word is at `packageAt(words, 1)`. For a manager of `TWO_WORD_RUNNERS`, the first positional word of the manager's own row (its `valued` list applied) is looked at; where it is one of the manager's runner words, the package word is at `packageAt(words, <the index after that word>)`; otherwise the manager is read as the tool it is. The words from the package word on, the program replaced by `packageOf`, are read again from step 3, and no runner is looked for a second time. With no package word the answer is null, but in two cases, where it is `<runner> with a command the guard cannot read` (the runner named as the command wrote it: `pnpx`, `npm exec`, `pnpm dlx`): a call line was given and the runner is not `npx` or `bunx`; or `viaXargs` is true.
    - The text: the program, then by the row's form what the spec says.
  - `actingList(texts: string[]): string`: one text alone; two joined by " and "; more joined by ", " with ", and " before the last.
  - `actingDeny(list, nobody)` and `actingAsk(list)`, each returning the spec's sentence.
  - `acting`, an exported object with one property, `of: actingOf`: what the hook's helper calls, so that a test can replace the property.
  - `actingIn(found: readonly { words: string[]; viaXargs: boolean }[]): string[]`: the texts of `acting.of` over the commands, each once, in order; a throw of `acting.of` for a command is caught and gives no text for it.
- Modify `packages/engine/src/types.ts`: `Policy` gains `actingCommands: "off" | "ask"`, with a comment that says what the hook does with it and that it is the person's to turn on and off.
- Modify `packages/engine/src/cli.ts`, in `setScalarKey`: after a write that was not refused, where the key is `actingCommands`, `decide(env, "policy", { kind: "decision", text: <the text>, by: "the user" })`, the text `actingCommands set to ask: the hook asks the person before a command that deploys, applies, destroys or publishes, and denies it where nobody is present (ADR 0026)` or `actingCommands set to off: the hook no longer asks before a command that deploys, applies, destroys or publishes`.
- Modify `packages/engine/src/policy.ts`: `actingCommands: "off"` in the default policy; where the file is read, `raw.actingCommands === "ask" ? "ask" : "off"`; `SETTABLE_POLICY_KEYS` gains, as its last key after `riskPathExclusions`, `actingCommands: { values: ["off", "ask"] }`.
- Modify `packages/engine/src/hooks/pre-tool-use.ts`:
  - what moved to `shell-words.ts` is imported from there; no other line of the hook's readers changes.
  - in `onPreToolUse`'s Bash branch, inside `if (ctx.openedBy)`, right after `const denied = openedSessionDenial(...)` and its return: `const [acting] = actingIn(found); if (acting) return answer("deny", \`${never}: ${acting} is denied; ${ending}\`);`.
  - after the loop over `crewCommands` that sets `asked`: where `ctx.policy.actingCommands === "ask"`, the session is not opened, and neither `unreadable` (the PowerShell line the hook cannot read) nor `walked.unreadable` (the line the reader could not close) is set: `const acting = actingIn(found)`. With at least one text: `const nobody = unwatched(ctx.headless, payload.permission_mode)`; where `nobody` is not null, `return answer("deny", actingDeny(actingList(acting), nobody))`; otherwise `asked = ["ask", asked ? \`${asked[1]} ${actingAsk(actingList(acting))}\` : actingAsk(actingList(acting))]`.
  - nothing else of the function moves: the ask is returned where `asked` is returned today, after the denies on the engine's files, the lanes and the phases.
- Modify `packages/engine/tests/policy-config-state.test.ts`: the one expected string of the refusal `unknown policy key: mail.accept (crew policy set writes …)` gains `, actingCommands` before its closing parenthesis. Nothing else of the file changes.
- Create `docs/adr/0026-an-acting-command-is-asked-where-a-project-says-so.md`, opened as ADRs 0013 to 0025 are: `# 0026. An acting command is asked where a project says so`, then `- Status: accepted` and `- Date: 2026-11-25`; `## Context` (the sentence of `docs/specs/2026-11-15-devops-team-design.md:91`, of `docs/specs/2026-11-16-agentic-os-team-design.md:224` and of `docs/specs/2026-11-16-frontend-team-design.md:177`, each quoted with its file and line, and what the hook did before), `## Decision` (the key and who changes it, the table and where it lives, how a command is read, the two answers, the opened session, and which verbs were read on a page and which were not), `## What the rule does not hold` (the spec's twelve limits, one bullet each, in its order), `## Consequences` (off by default; `OPENED_VERBS` and the table to become one; a row is read on its tool's page when it is next touched, and a new row is added by an item with the page read on the day; the rollback for an opened session is a release).
- Modify `plugins/core/skills/crew/references/rules.md`: in rule 2's "Enforced by", after "and rule 20 today" and before "; the e2e gate", the text `; where a project's policy sets \`actingCommands\` to \`ask\`, the hook asks the person before a command that deploys, applies, destroys or publishes, and denies it where nobody is present, a reminder and not a boundary (ADR 0026)`.
- Create `packages/engine/tests/acting-commands.test.ts`.
- Create, in the item's folder and not in the repository's tree: `probes/expect-counts-before.txt`, `probes/expect-counts-after.txt`, `probes/mutants.py` and `probes/mutants-run1.txt`.
- Modify `plugins/core/dist/crew.mjs`: by `bun run build`.

## Phases

Each phase is held to the command named in it. The typecheck and the lint are green at every phase: at phase 1 `acting.ts` is created holding the type `ActingTool` alone, the new test file reaches what the module does not export yet through a namespace import cast `as unknown as` a type of the file, and it reads and sets the policy's key through a cast of the policy `as unknown as { actingCommands?: string }`, since `Policy` gains the key at phase 3. `bun run check` whole is green from phase 4 on.

0. Before any change: `crew tdd before` for AC-18 with the second command of Verify. Record in the item's `probes/expect-counts-before.txt` the count of `test(` and of `expect(` in each of the five files.
1. Tests first: the new file, each case asserting the hook's decision before its reason so that the recorded red is the missing answer; each criterion's tests named with its id first (`AC-10: ...`), run with `bun test packages/engine/tests/acting-commands.test.ts -t "AC-10"` and the like. Each red is recorded with `crew tdd red`: AC-10 and AC-16 `actingOf is not a function`; AC-19 the key `undefined` in the default policy; AC-12 `{}` where an ask is expected; AC-13 `{}` where a deny is expected; AC-14 the same; AC-20 `{}` for `tofu destroy` in an opened session; AC-21 the file not found.
2. The move of the two sets, and `acting.ts` whole. Held to: AC-10 and AC-16 green.
3. The policy key and its record, the standing test's one string, and the hook's two places. Held to: AC-19 to AC-20 green.
4. The ADR and the reference's sentence. Held to: the new file green whole, and `bun run check`.
5. `bun run build`; `crew tdd after` for AC-18 on the built bundle and the same counts taken again; the mutants; `bun run plugin:check`; the gates. The mutants are `probes/mutants.py`, which for each mutant replaces one exact piece of a source file's text by another, runs the new file and `hooks-pre-tool-use.test.ts`, and puts the file back: a verb dropped from each of six rows; a valued option dropped from `kubectl` and from `aws`; each runner step dropped (one-word, two-word, the manager's options, the `--`); the version and the scope left on a package word; a valued option's value read as a positional; the unreadable step dropped; an unreadable word counted at a position the row does not read; the xargs case dropped; a `reads` row acting on a read, not acting bare, acting on `--version`, and named with its first word; a `flagged` row acting without its flag; the six-word bound at five and at seven; the policy's default `ask`; the hook asking with the key off; the ask returned at once where it is found; the table read on an unclosed line; the deny dropped where nobody is present; the opened session's new deny dropped, and made to depend on the key; the containment dropped; the register's entry dropped for `off`; a call line of `pnpx` giving null; the character `(` dropped from what cannot be read; the two reasons joined in the other order; a text named twice.

## Test cases

The hook's cases use the standing kit of `hooks-pre-tool-use.test.ts`: a repository made by `makeRepo`, `hookContext({ session_id, cwd }, testEnv())`, and `onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode })`; the key is set by `ctx.policy.actingCommands = "ask"` where the test needs the hook's answer, and by a written `.crew/policy.json` where it tests the loading. A session opened by mail is made as the standing test at lines 900-946 makes one. A journey's session is the same context with the three fields the hook reads set on it: `openedBy` to `journey J-1`, `journeyId` to `J-1` and `openedBranch` to the checkout's branch. No standing test file is touched for it.

The file holds two lists that several criteria read: `ACTING`, pairs of a command line and the text expected, and `READING`, command lines that give null.

- AC-10, `actingOf` over each line split at spaces:
  - `ACTING`, every acting form of every row, one line each at least: `terraform apply` → `terraform apply`; `tofu destroy` → `tofu destroy`; `pulumi up`, `pulumi update`, `pulumi destroy`; `kubectl apply -f x`, `kubectl delete pod x`, `kubectl replace -f x`, `kubectl patch deploy x`, `kubectl scale deploy x`, `kubectl create ns x`, `kubectl set image deploy/x a=b` → `kubectl set`, `kubectl rollout restart deploy/x` → `kubectl rollout restart`, `kubectl rollout undo deploy/x`; the six of `helm`; `aws cloudformation deploy --stack-name x`, the other four of cloudformation, `aws deploy create-deployment` → `aws deploy create-deployment`, `aws deploy stop-deployment`; `cdk deploy`, `cdk destroy`; `az deployment group create -g x` → `az deployment create`, `az deployment sub delete`; `gcloud run deploy svc` → `gcloud deploy`, `gcloud a b c d e deploy` → `gcloud deploy`; `ansible-playbook site.yml` → `ansible-playbook`, `ansible-playbook --check site.yml` → `ansible-playbook`; the six of `wrangler` (`wrangler pages deploy dist` → `wrangler pages deploy`); `vercel` → `vercel`, `vercel --prod` → `vercel`, `vc --prod` → `vc`, `vercel promote x` → `vercel`, `vercel ./dist --prod` → `vercel`, `vercel -e API_KEY=secret-of-the-test --prod` → `vercel`, `vercel env ls` → `vercel`; `netlify deploy`, `ntl deploy` → `ntl deploy`; `fly deploy`, `flyctl deploy` → `flyctl deploy`; the five of `kamal`; `docker push x`, `docker image push x`, `docker compose push`, `docker manifest push x`, `docker build --push .` → `docker build --push`, `docker buildx build --push .` → `docker buildx build --push`; `npm publish`, `npm unpublish x`; `pnpm publish`; `yarn publish`, `yarn npm publish`; `bun publish`; `cargo publish`, `cargo yank`; `twine upload dist/*` → `twine upload`; `uv publish`; `poetry publish`; `gem push x`, `gem yank x`; `gh release create v1`, `gh release delete v1`, `gh workflow run x`, `gh run rerun 1`; `eas submit`, `eas update`, `eas deploy`, `eas build --auto-submit` → `eas build --auto-submit`; `promptfoo share`, `promptfoo eval --share` → `promptfoo eval --share`, `promptfoo eval --remote`, `promptfoo eval --share=true` → `promptfoo eval --share`; `az deployment $S create -g x` → `az deployment create`.
  - options: `terraform -chdir=infra apply`; `kubectl -n prod apply -f x`; `kubectl --context=prod apply`; `kubectl --context prod --namespace x delete pod y`; `kubectl --insecure-skip-tls-verify apply -f x`; `aws --profile p --region r cloudformation deploy`; `npm --workspace web publish`; `npm --silent publish`; `helm --kube-context prod upgrade x y`: each gives its text.
  - runners: `npx vercel --prod` → `vercel`; `npx -y wrangler@latest deploy`, `npx --package wrangler wrangler deploy`, `npx -- wrangler deploy`, `bunx wrangler deploy`, `pnpx wrangler deploy`, `pnpm dlx wrangler deploy`, `pnpm exec wrangler deploy`, `pnpm --filter web exec wrangler deploy`, `pnpm -C app dlx wrangler deploy`, `yarn dlx wrangler deploy`, `npm exec wrangler deploy`, `npm exec -- wrangler deploy`, `npm exec --yes -- wrangler deploy`, `npm exec --package=wrangler -- wrangler deploy`, `npm x wrangler deploy`, `bun x wrangler deploy`, `npx @scope/wrangler@4 deploy`: each `wrangler deploy`.
  - a path and a suffix: `/usr/local/bin/terraform apply` → `terraform apply`, `TERRAFORM.EXE apply` → `terraform apply`, `npx.cmd wrangler deploy` → `wrangler deploy`.
  - a runner with no package word, null: `npx`, `npm exec`, `npx -c "wrangler deploy"` (the walk reads that line). The unreadable text: `pnpx -c "wrangler deploy"` → `pnpx with a command the guard cannot read`, `npm exec -c "npm publish"` → `npm exec with a command the guard cannot read`, `pnpm dlx --call "x"` → `pnpm dlx with a command the guard cannot read`, and `npx` with `viaXargs` true → `npx with a command the guard cannot read`.
  - `READING`, null: `terraform plan`, `terraform -chdir=infra plan`, `terraform plan -var x=$Y`, `terraform frobnicate`, `tofu validate`, `pulumi preview`, `kubectl get pods`, `kubectl get pods $POD`, `kubectl diff -f x`, `kubectl logs -l app=deploy`, `kubectl -n apply get pods`, `kubectl rollout status deploy/x`, `helm template x`, `helm lint charts/*`, `aws s3 ls`, `aws deploy get-deployment`, `aws s3 cp ./dist/* s3://b`, `cdk diff`, `az deployment group what-if`, `gcloud run services list`, `gcloud a b c d e f deploy`, `wrangler dev`, `wrangler pages dev`, `vercel dev`, `vercel --version`, `vercel -v`, `vercel --help`, `vercel -h`, `vercel logs x`, `netlify build`, `fly status`, `docker build .`, `docker build -t app:$TAG .`, `docker buildx build .`, `npm install`, `npm install $PKG`, `npm run deploy`, `pnpm install`, `pnpm exec eslint .`, `yarn install`, `bun test tests/*.test.ts`, `cargo build`, `uv run pytest tests/test_*.py`, `gh release list`, `gh pr merge 1`, `gh pr view $N`, `gh api repos/{owner}/{repo}/pulls`, `eas build`, `promptfoo eval`, `git push origin main`, `ls`, an empty list of words.
  - a flag changes nothing: `npm publish --dry-run`, `kubectl apply --dry-run=server -f x`, `terraform apply -auto-approve`.
  - every row of `ACTING_TOOLS` has at least one name and one of `acts`, `anyWord`, `reads`, `whole`, `flagged`, and no more than one of the first four; no name stands in two rows; every name of the table has a line in `ACTING`.
- AC-19: `DEFAULT_POLICY.actingCommands` is `"off"`; a `policy.json` holding `"actingCommands": "always"` loads as `"off"` and one holding `"ask"` as `"ask"`; `setPolicyValue(paths, "actingCommands", "ask")` writes it and the file then loads as `"ask"`; `setPolicyValue(paths, "actingCommands", "always")` is refused. Through the CLI (`cliIo`): `policy set actingCommands ask` and then `policy set actingCommands off` each exit 0, and `crew decisions --grep actingCommands` then lists two entries by the user, one holding `set to ask` and one `set to off`; `policy set actingCommands always` exits 1 and adds none. The hook, for `crew policy set actingCommands off`: `ask` in mode `default` with `attendedDecisions: prompt` and with `relay`; `deny` in mode `dontAsk`. With the key off: `terraform apply` and `npm publish` are answered `{}` in mode `default` and in mode `dontAsk`.
- AC-12: key `ask`; for each of the modes `default`, `acceptEdits`, `plan`, `auto`: `terraform apply -auto-approve` is answered `ask` with the reason equal to the spec's sentence for `terraform apply`, written whole in the test once and compared with `actingAsk("terraform apply")` too. `kubectl -n prod apply -f k8s/ && npm publish` names `kubectl apply and npm publish`; `terraform apply; npm publish; gh release create v1` names `terraform apply, npm publish, and gh release create`. `sudo terraform apply`, `out=$(npm publish)`, `sh -c "npm publish"` and `npm publish; npm publish` each name their command once. With `attendedDecisions: relay`: asked the same. `ls && terraform plan`: `{}`. `terraform apply > .crew/work/x/work.json` with an item open: denied, with the reason the same line gets with the key off. `crew approve <id> spec && npm publish` under `attendedDecisions: prompt` with an item open: one ask whose reason is the crew command's reason, a space, and `actingAsk("npm publish")`. `terraform apply 'x` (an unclosed quote): the answer equals the one the same context gives with the key off.
- AC-13: key `ask`; a headless context (`CLAUDE_CODE_SESSION_ATTENDED=0` in the env given to `hookContext`), and the modes `bypassPermissions` and `dontAsk`: `npx wrangler@latest deploy` is answered `deny` with the reason equal to the spec's sentence, written whole once, with `wrangler deploy` and what `unwatched` returns for the case. `terraform apply 'x` in `dontAsk`: the answer equals the one with the key off.
- AC-14: `terraform $CMD`, `kubectl {apply,get} -f x`, `kubectl @(apply|get) -f x`, `kubectl rollout $V`, `aws cloudformation $V`, `az deployment group $V`, `gcloud run $X`, `vercel $X`, `echo apply | xargs terraform`, `echo restart | xargs kubectl rollout`: each named `<program> with a verb the guard cannot read`, asked in mode `default` and denied in mode `dontAsk`. `find . | xargs terraform fmt`, `echo x | xargs npm install`, and the lines of `READING` that hold a character of the two shared sets, patterns included: `{}` in both modes. `echo x | xargs npm publish` names `npm publish`.
- AC-20: a session opened by mail and one of a journey, the key off and at `ask`: every line of `ACTING` is denied, the reason holding `never merges, pushes to another branch, releases or deploys: ` and the session's ending; for the lines the standing list does not read first, those for which `openedSessionDenial(line, branch)` is null, the reason holds the pair's expected text followed by ` is denied`. Every line of `READING` is answered what it is answered before this item, taken as: `{}` for those the standing list does not deny, checked against `openedSessionDenial(line, branch) === null`. `echo apply | xargs tofu` is denied. With `acting.of` replaced by a function that throws and counts its calls, and put back in a `finally`: `cd ..`, `git push origin main` and a write to the engine's own file of an item are still denied in the opened session; `tofu destroy` there is answered `{}` and the count is above zero; with the key at `ask` outside an opened session, the write is still denied and `terraform apply` is answered `{}`, the count having grown.
- AC-16: `["kubectl", ...20,000 times "--insecure-skip-tls-verify", "apply"]`: `kubectl apply`, measured with `performance.now()` under 1,000 ms.
- AC-21: the ADR's file exists; its headings are the four of Files in that order; its third section holds twelve bullets, each holding the words the test lists for it (`reminder`; `yarn <bin>`; `other changing verbs`; `unknown subcommand`; `asks on reads`; `valued`; `no record`; `bypassPermissions`; `program`; `allow rule`; `serverless deploy`; `scripts/release.ts`); its first line is `# 0026. An acting command is asked where a project says so`; its Decision holds `not read on a page`; rule 2 of `plugins/core/skills/crew/references/rules.md` holds the plan's text whole, and `and rule 20 today` stands before it.

## Verify

- `bun test packages/engine/tests/acting-commands.test.ts`
- `bun test packages/engine/tests/hooks-pre-tool-use.test.ts packages/engine/tests/shell.test.ts packages/engine/tests/policy-config-state.test.ts packages/engine/tests/cli.test.ts packages/engine/tests/skill.test.ts`
- `bun run check`, `bun run build`, `bun run plugin:check`

---

Published by `crew learn` from item `2026-11-24-004-the-teams-build-sixteenth-part-the-users`, reviewed before the code (ADR 0019).
