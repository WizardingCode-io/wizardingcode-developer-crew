# Gate

```
crew gate run <id>
```

The engine runs what the route requires: the project's build, tests, lint and type checks, a secret scan of the change, and a dependency audit. Each run has a log in `.crew/work/<id>/logs/`; the last lines are in the output.

- **A gate fails:** read the log, fix the cause, run again. Never change the gate command, delete a test or edit the profile to make a gate pass.
- **A gate is unavailable** (no command, no tool): say so. The user can give a command (`crew profile set <gate> "<cmd>"`, then `crew profile confirm <gate>`; replacing a detected command needs `--force`) or skip the gate (`crew skip <id> gate:<name> --reason "<why>"`). Both ask the user through the permission prompt.
- **The route was raised:** the diff touched a risk path. The engine says which. The guards of the new route now apply; `crew phase <id> next` lists what is missing.
- **Unconfirmed command:** a proposed command ran. Ask the user to confirm it with `crew profile confirm`; until then the work is not proven.

`crew gate run <id> --only test` runs a subset while you iterate; the verdict still needs every gate. When the verdict is proven: `crew phase <id> next` to deliver.
