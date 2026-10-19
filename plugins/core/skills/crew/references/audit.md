# Audit: the project's own tools over the whole tree, the roles reading the code, a report a person signs

An audit is `work_type: audit`, always full, with four phases: receive, recognize, audit, deliver. Nothing is built and no criterion is written: the proof is the signed report. This page is the run half; the report half (`crew audit <id> report`, the proof check, the three formats, the signature) follows it.

## Receive and recognize

1. `crew start "Audit <the project, in the user's words>" --answers '<json>'` with `work_type: "audit"` and `scope: 3`; no `--criterion`. The brief says what the user wants to know (a sale, a takeover, a rewrite, a security question) and what the report is for: the lead's summary answers it.
2. `crew detect` and the profile: every target the tools will run on needs its commands (`crew profile set` for what detection missed, relayed); a target with no test command is recorded `unavailable`, never skipped in silence.
3. `crew phase <id> next` into `audit`.

## The run

`crew audit <id> run` (in the `audit` phase alone) runs, for every target of the profile, build, test, lint and typecheck with the profile's commands and timeouts, the dependency audit listing every advisory (no base commit: nothing is "known before"), and the secrets scan over the whole tree; e2e is never run and is recorded `unavailable: needs the environment; run by hand`. Each run's log is `logs/audit-<gate>-<target>.txt`; the record is `audit/runs.json`; beside it `audit/files.txt` (every watched source file of the tree, the list the roles read) and `audit/scope.json` (the targets, the files' count and bytes, the risk areas over every file). The engine writes nothing of the project. A failing build or test is a `fail` run with its log, never a blocked audit: say it, do not fix it. `--only a,b` reruns the gates named and keeps the other runs. A tree over the walk's cap (20 000 watched files) is refused with nothing recorded: narrow the profile's targets or the folders it skips, then run again.

Read the runs before the roles start: a `fail` with its log is a finding the roles cite by `log:`, an `unavailable` with its reason goes to the report's method section as it is.

## The seats

`crew team <id>` prints the audit's seats from the scope: the researcher (the dependencies), security, architecture, code quality and test quality always, data when the scope names data-migration paths, infra when it names infra paths; no CTO, no lead, no judge. Launch them as subagents, in parallel, each with the prompt below; `crew await <id> role` before the turn ends while they work. The SubagentStop hook files each answer; nobody writes a role's file by hand.

The reviewers' prompt names: the item id; "this is an audit, not a change"; the paths `.crew/work/<id>/audit/files.txt`, `audit/runs.json` and `audit/scope.json`; the rubric's path; the risk areas of the scope for security. There is no diff: the files listed are the change, `## Outside the change` is `none`, and a finding a run proves names `log:<path under logs/>` instead of a file and line. Their answers land in `audit/<gate>.findings.md` (`security`, `architecture`, `code-quality`, `test-quality`, `data`, `infra`).

The researcher's prompt names the same three paths and asks for the dependencies table (`| Package | Current | Latest | Pros | Cons | Risk | Proof |`) from the manifests and the lockfiles of the scope's targets and the `deps` run's advisories; a row with no proof is left out. Its answer lands in `audit/dependencies.findings.md`.

## The lead's own findings

You are the lead. Read the README, the routes or entry points, the domain (models, services) and the records (`audit/runs.json`, the findings files as they land), and write by hand, in the findings' shape (`# business findings for <id>`, `## Findings`, `- F-n · defect|advisory · <path>:<line> · <sentence>`):

- `audit/business.findings.md`: a flow a client cannot complete, a rule the code does not enforce, a promise the README makes that the code does not keep; each tied to a file and a line.
- `audit/summary.md`: one paragraph answering the brief's question for the reader who reads nothing else.
- `audit/recommendations.md`: a table `| # | Recommendation | Cost | Time | Findings |` (Cost `S`, `M` or `L`; Time in days; Findings the F-ids it closes).

These three files are yours to write; everything else under `audit/` is the engine's or the hook's.

## The report

`crew audit <id> report` (after the run, with `audit/summary.md` written) parses every findings file and the dependencies table, checks each finding's proof (a file and a line that exist under the root, or a log under the item's logs) and leaves out the rest, counted and named in the method section; computes the verdict (`critical` with a security defect or a secret found, `attention` with another defect, `sound` with advisories alone); and renders `audit/report.md`, `audit/report.html` (one page under the brand, every value escaped, nothing loaded) and `audit/report.pdf` by the project's own Playwright or a browser on the machine (`WIZARDINGCODE_CREW_BROWSER`, else Chrome or Chromium found), or says why the PDF was not produced in `audit/report.json`; every log tail and finding text passes through the secrets scanner first. Run it again after any change to the findings or the summary: a report older than its inputs is stale and cannot be signed. A tree that runs its tests against a shared database, or whose scripts write to it, runs them for real: say so to the user before the run. Rule 3 of the method: a remote test environment like production is always recommended; the report says it when the profile declares none.

## The signature and the delivery

A person signs: `crew await <id> user`, present the report (the verdict, the counts, what was left out and why, the PDF's absence if any) and ask; at the yes, `crew approve <id> audit` (relayed under `relay`; never with `--mode` or `--validator`, which the engine refuses and leaves the item waiting for a person). The signature line goes into the three formats. Then `crew phase <id> next` delivers, and `references/deliver.md` says what to tell the user: the three files, the verdict, what the report proves and what it does not.
