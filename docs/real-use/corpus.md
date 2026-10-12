# Real use: the corpus of requests

One entry per real request made during the phase, written when the item is delivered or abandoned. The entries are the raw material of the SP2 evals (`docs/vision.md` §15: "a corpus of vague requests, each lists the gaps a good engineer would raise"), so each is shaped like an eval case: a prompt (`plugins/core/evals/<case>/prompt.md`) and a grader line.

Rules:

- The request is quoted as the user wrote it, cleaned of anything that identifies the client: names, domains, paths, data. Keep its shape, its vagueness and its tone.
- The four lists are filled **in hindsight**, after the item: what the gap round should have said before a line was written.
- "Did the gap bite?" is the field that matters most. An entry where a gap cost rework, a second item or a bug is a strong eval case; one where nothing bit is still a case for the "assumed by good practice" list.

## Entry format

```markdown
### C-<n>: <short title>

- Date: <YYYY-MM-DD>. Project: ai-mem | the Laravel project. Route taken: fast | standard | full. Item: <id>.
- Request, cleaned:

  > <the request as written>

- Assumed by good practice (stated, not asked): …
- Decisions only the user can make: …
- Proposals, each with its reason: …
- Warnings (what the request asks for that goes against good practice): …
- Did the gap bite? no | yes: <what it cost, when it surfaced, which item or commit fixed it>
- Grader candidate: PASS if the agent <asks about X | states Y | refuses Z> before building; FAIL if it builds as asked and <the consequence>.
```

## Entries

_None yet. The first entry is written at the end of the first item in ai-mem._
