# Gate

```
crew gate run <id>
```

The engine runs what the route requires: the project's build, tests, lint and type checks, a secret scan of the change, and, when the change touches a manifest or a lockfile, a dependency audit. Each run has a log in `.crew/work/<id>/logs/`; the last lines are in the output.

- **A gate fails:** read the log, fix the cause, run again. Never change the gate command, delete a test or edit the profile to make a gate pass.
- **A gate is unavailable** (no command, no tool): say so. The user can give a command (`crew profile set <gate> "<cmd>"`, then `crew profile confirm <gate>`; replacing a detected command needs `--force`) or skip the gate (`crew skip <id> gate:<name> --reason "<why>"`). Both ask the user through the permission prompt, which you trigger by running the command; only in a headless session, or in bypassPermissions or dontAsk mode, the hook asks for `--mode <mode>` and the skip is recorded as the agent's (it counts only if the policy says so).
- **The route was raised:** the diff touched a risk path. The engine says which. The guards of the new route now apply; `crew phase <id> next` lists what is missing.
- **Unconfirmed command:** a proposed command ran. Ask the user to confirm it with `crew profile confirm`; until then the work is not proven.

`crew gate run <id> --only test` runs a subset while you iterate; the verdict still needs every gate. A gate run that proves the work writes the report and moves the item to the deliver phase.

- **A blocking objection is open or bound to an unproven criterion:** the verdict says "blocking objection O-n open" or "bound". Prove the criterion it is bound to, bind it (`crew objection <id> resolve O-n --criterion AC-k`), or let the user waive it (`crew objection <id> waive O-n --reason "<why>"`, which asks them). The verdict line of the report then says how many were waived.
