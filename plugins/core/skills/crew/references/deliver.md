# Deliver

The gate run that proved the work already wrote `.crew/work/<id>/report.md`; `crew evidence <id>` prints it (and rewrites it from the evidence as it stands). Tell the user, in this order and on one screen:

1. What changed, in two or three sentences.
2. What is proven: the gates that passed, the criteria with red then green.
3. What is not proven: skipped steps with their reasons, gates that could not run.
   The report's "Gap round" section lists each decision and who took it; its "Objections" section lists each objection with its status, and a waiver is named in the verdict line ("Proven, with 1 objection waived by the user"). Say both to the user: a waiver is a decision they made, and the report never hides it.
   The report's "Tasks" section lists each task handed out with its child and verdict, and its "Mail" section every message the item sent or received with its status: say what was asked of other projects and what they answered.
4. What the user should do next: review the diff, commit, open a pull request.
5. Findings the judge left as advisory, and anything a review deferred, go to `docs/real-use/findings.md` (one row each, outcome `deferred`) or into the next item's scope, never into a scratch file: a record that lives outside the repository is lost with it.

Say "proven" only when the report says so. If the report says not proven, the first line of your message says not proven and why. Never soften it.

The work artefacts under `.crew/work/<id>/` are committed with the change by default, so the pull request carries its own evidence.
