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
9. Dependencies and supply chain, when the diff changes a manifest or a lock file (`composer.json`, `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` and their locks): does the lock file change with the manifest, at a pinned version where the project pins, and does the change add a registry the project does not use? The row: `${CLAUDE_PLUGIN_ROOT}/teams/security.md`, "Dependencies and supply chain".
10. Secrets, when the diff reads a credential (an environment variable, a vault lookup, a key file): is the credential named in the project's example environment file without its value, written by its variable's name in every command and document the diff adds, and kept out of every log line, error message and response? The rule: `wizardingcode-devops-secrets-identities`.
11. Cryptography, when the diff calls a hashing, encryption, signing, random-number or TLS interface: does it use the framework's or the platform's own primitive rather than a construction of its own, a hash made for passwords for a password, a secure generator for a token, and TLS with its verification on? The row: `${CLAUDE_PLUGIN_ROOT}/teams/security.md`, "Cryptography".
12. AI and agents, when the diff adds or changes a prompt, a call to a model, an agent or a tool an agent calls: is text from outside (a page, a file, a user's message, a tool's result) kept apart from the instructions as data, and does an agent that reads such text hold write tools only under a permission rule? The rule: `wizardingcode-agentic-agents-tools-prompts`.

Questions 9 to 12 are answered only when the diff touches their subject, by the trigger each names; the engine raises none of the four as a risk area.

Questions 3 to 8 are answered only for the risk areas named.

## Defect or advisory

A **defect**: a path a caller can take that the risk area forbids, named as who, with what, gets what: an unauthenticated or under-authorised call; an amount or currency from the client; personal data in a log line or in a response for a broader audience than before; a payment write with no idempotency; a webhook processed before verification; a public field removed or changed with no version; a destructive migration with no reversal and no reason; a credential in the diff; a secret's value written to a log line, an error message or a response; outside text or a tool's result passed into a prompt as instructions. An **advisory**: hardening beyond the risk areas named; a limit where none existed; a validation stricter than the module's own; a manifest changed without its lock file where the project commits one; a dependency at an unpinned range where the project pins; a new secret missing from the example environment file; a cryptographic construction of the change's own, a general-purpose hash for a password, or TLS verification turned off outside a test; an agent that reads outside text holding write tools with no permission rule.

## Only the change

The reviewer judges only the change, never the repository: a finding outside the changed files is advisory and marked debt. An existing route with no permission check that the diff did not touch is debt; a new route beside it with no check is a defect, even though it matches its neighbour.
