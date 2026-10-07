# Deliver

```
crew evidence <id>
```

The engine writes `.crew/work/<id>/report.md` and prints it. Tell the user, in this order and on one screen:

1. What changed, in two or three sentences.
2. What is proven: the gates that passed, the criteria with red then green.
3. What is not proven: skipped steps with their reasons, gates that could not run.
4. What the user should do next: review the diff, commit, open a pull request.

Say "proven" only when the report says so. If the report says not proven, the first line of your message says not proven and why. Never soften it.

The work artefacts under `.crew/work/<id>/` are committed with the change by default, so the pull request carries its own evidence.
