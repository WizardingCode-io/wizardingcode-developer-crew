# Security rubric

The security gate asks what the change lets a caller do, see or break, scaled to the risk areas the engine found in the diff's paths and the request's answers. Where the profile has static analysis (Semgrep, PHPStan with security rules; `npm audit` is already the `deps` gate), its findings on the item's files are an input.

## What the reviewer receives

The item's diff (`review/diff.patch`), the files it touches (`review/files.txt`), the risk areas with the paths that raised each (`auth`, `personal-data`, `payments`, `public-api`, `data-migration`, `infra`) and the path of a static-analysis report when one ran.

## Questions

1. Boundary, every change: is input the diff accepts (request, message, file, environment) validated where it enters, in the module's own way?
2. Secrets, every change: is there a credential the secrets gate would miss (in a fixture, a comment, a URL)?
3. `auth`: who can call what the diff adds or changes; is every new route, action or query behind the permission its neighbours use; is a session or token revoked where the state it vouches for changes (password, permission, deletion); do error messages let a caller enumerate users?
4. `personal-data`: what personal data the change returns, logs, exports or sends; to whom, compared with the screen it serves; what the retention is; is the right to erasure still satisfiable?
5. `payments`: is every write idempotent; do amounts and currency come from the server; is a webhook's signature verified before it is processed; what does a retry do?
6. `public-api`: what changes for a caller (a field removed, a meaning or a default changed, an error shape); is it versioned or announced; does the contract test say so?
7. `data-migration`: is it reversible, or is the reason stated; is data copied before a destructive step; does the run order matter?
8. `infra`: is a permission widened; does a secret move into configuration or an image; what runs under which identity?

Questions 3 to 8 are answered only for the risk areas named.

## Defect or advisory

A **defect**: a path a caller can take that the risk area forbids, named as who, with what, gets what: an unauthenticated or under-authorised call; an amount or currency from the client; personal data in a log line or in a response for a broader audience than before; a payment write with no idempotency; a webhook processed before verification; a public field removed or changed with no version; a destructive migration with no reversal and no reason; a credential in the diff. An **advisory**: hardening beyond the risk areas named; a limit where none existed; a validation stricter than the module's own.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. An existing route with no permission check that the diff did not touch is debt; a new route beside it with no check is a defect, even though it matches its neighbour.
