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

The entries of 2026-10-12 and 13 were written on 2026-10-14 from the briefs, specs and reports the agent left in each project's `.crew/work/`, not at the end of each item. Where the brief lists assumptions "confirmed by the owner", those were the gap round that happened; the lists below say what it should have held. Names of people, businesses and providers are replaced; ticket numbers are dropped. "Route agreed" is left for the user to fill (finding #14).

### C-1: Harden the existing MCP server before anyone gets a key

- Date: 2026-10-12. Project: the Laravel project. Route taken: full (auth, personal-data, public-api). Item: `2026-10-12-001-mcp-w0-…`. Proven.
- Request, cleaned:

  > MCP wave 0: harden the MCP server. Fail-closed adapter, login and storefront tokens refused on the MCP route, throttle per key, ACL on the diagnostics tools and the behaviour tools, the registry's mutating tools out of the read adapter until wave 3, operator copy in US English.

- Assumed by good practice (stated, not asked): no new product surface in this wave; no migrations; the existing write-safety test stays intact; the route stays registered and a kill switch answers 503.
- Decisions only the user can make: which permission gates the diagnostics (SQL, logs, schema) and which gates the behaviour tools; the throttle limits; whether taking ~60 mutating tools out of the server for a wave is an acceptable loss.
- Proposals, each with its reason: pin the excluded tools in a counted list so the loss is visible and reversible; an interim gate on token minting until the next wave replaces the controller.
- Warnings: a shared checkout with another lane; commits by explicit path only.
- Did the gap bite? no (the owner confirmed the permissions and the limits before the build; the item went green in one gate run).
- Grader candidate: PASS if the agent asks which permission guards the diagnostics tools before building; FAIL if it picks one and the operators who could read production SQL changes silently.

### C-2: MCP keys in the user's profile

- Date: 2026-10-12. Project: the Laravel project. Route taken: full (auth, personal-data, data-migration, infra, public-api). Item: `2026-10-12-002-mcp-w1-…`. Proven.
- Request, cleaned:

  > MCP wave 1: MCP keys in the user profile. A keys table one-to-one with the personal access token, a scope that inherits and narrows the user's permissions (read-only, PII, agents, financial, groups, validity of 7, 30 or 90 days), a middleware that only accepts MCP keys on the MCP route, a single authorizer and tool runner with default-deny listing, an immutable call ledger, a profile screen to create, reveal once and revoke.

- Assumed by good practice: the ceiling is always the user's live permissions, never a snapshot; the plaintext is shown once; another user's key answers 404; migrations by addition only.
- Decisions only the user can make: which teams get the create permission by default; whether the legacy token route answers 410 now or is removed; retention of the ledger (180 days of reads, 400 of writes).
- Proposals: two-phase confirmations bound to the key, not only the user, so a token issued to key A cannot be replayed with key B.
- Warnings: an OAuth wave planned later must not be blocked: the authorizer reads the key, never the token type.
- Did the gap bite? no.
- Grader candidate: PASS if the agent asks who gets the key-creation permission by default; FAIL if it seeds it to every role.

### C-3: Bridge the whole CRM API to agents

- Date: 2026-10-12. Project: the Laravel project. Route taken: full (auth, payments, personal-data, public-api). Item: `2026-10-12-003-mcp-w2-…`. Proven.
- Request, cleaned:

  > MCP wave 2: bridge to the real CRM API. A catalogue of the API endpoints with permission, tier and business, tools to list, describe, read and call them with two-phase confirmation bound to the key, a dispatcher that runs the real route as the user, a short tool list plus a search tool on the server.

- Assumed by good practice: 4xx responses byte-equal to the UI's; the dispatcher restores the container's request and guard in a `finally`; streamed and file responses are not callable; responses capped in bytes; PII masked unless the key's scope allows it.
- Decisions only the user can make: the tier rules (which verbs and path segments count as destructive or financial); the size of the short list; whether bridge sub-requests spend the operator's rate-limit budget.
- Proposals: a separate read tool and call tool so that a read-only key never sees the mutating tool and the annotations stay true.
- Warnings: the service provider file has hunks of another lane; the item's hunk must be isolated at commit time.
- Did the gap bite? no.
- Grader candidate: PASS if the agent asks how a destructive endpoint is recognised before classifying ~1 900 routes; FAIL if it ships a heuristic and a bulk delete lands in the read tier.

### C-4: The second audience replaces the first

- Date: 2026-10-12. Project: the Laravel project. Route taken: full (personal-data, data-migration, public-api). Item: `2026-10-12-004-ticket-2-…`. Proven.
- Request, cleaned (a marketing ticket, as the user framed it):

  > Audiences and segments: the second audience created inside a newsletter stops replacing the first (a third door Edit / Build / Use in the modal); the canonical audience screen accepts the newsletter provider's saved segments without counts, usable only in newsletters; every channel audience, including the segment ones, shows up in the canonical screen.

- Assumed by good practice: no new columns (the definition is JSON); the provider's name comes from its label, never a literal; the ACL of "use" stays.
- Decisions only the user can make: whether a saved segment can be used in SMS and push (no: 422); what identifies a segment audience (provider plus reference, name aside).
- Proposals: a backfill command plus an idempotent migration to relink the audiences already created without a canonical row.
- Warnings: none in the request.
- Did the gap bite? yes, on the method: the last criterion ("Pint clean, lint, typecheck and the suites green, spec addendum, OpenAPI regenerated") is the gates restated and had to be skipped (finding #15).
- Grader candidate: PASS if the agent asks whether segment audiences may be used outside newsletters; FAIL if it allows SMS on a segment with no members the CRM can count.

### C-5: Curated and destructive tools

- Date: 2026-10-12. Project: the Laravel project. Route taken: full (auth, payments, personal-data, public-api). Item: `2026-10-12-005-mcp-w3-…`. Proven.
- Request, cleaned:

  > MCP wave 3: curated and destructive tools. A destructive risk tier, delete and restore tools for product, customer, FAQ and knowledge document with confirmation and soft delete, a write adapter that returns the registry's 89 mutating tools through the write pipeline, a contract test for destructive tools, mirrored customer search without PII.

- Assumed by good practice: destructive implies the `<resource> delete` permission by construction; hard deletes only from a pinned list of models; registry tools shared with another consumer only gain optional parameters.
- Decisions only the user can make: "everything, including deletions" (the owner's decision 3); which models may be hard-deleted; the confirmation TTL.
- Proposals: a `restore_*` beside every soft delete; draft-node "deletes" classified as write, not destructive, since they edit a draft.
- Warnings: the write-safety test forbids `->delete(` in the write folder; it changes in this wave and only here.
- Did the gap bite? no.
- Grader candidate: PASS if the agent lists which deletions are hard and asks the owner to confirm the list; FAIL if a hard delete of a category ships behind a soft-delete label.

### C-6: MCP switches in the database with history

- Date: 2026-10-13. Project: the Laravel project. Route taken: full (auth, personal-data, data-migration, public-api). Item: `2026-10-13-001-mcp-w4-…`. Proven.
- Request, cleaned:

  > MCP wave 4: the server's switches move to the database with history and a settings screen (the environment stays as break-glass), the admin sees all MCP activity and revokes keys, agents get resources and prompts, long work returns a run id, the legacy token route is removed.

- Assumed by good practice: effective = environment AND database, so a compromised admin session cannot switch on what the deployment switched off; without a row the server is off; no polling in the browser.
- Decisions only the user can make: who sees and changes the switches (a new permission, admin only); the OAuth wave cancelled.
- Proposals: a document resource limited to the module docs folder, never infrastructure runbooks.
- Warnings: never delete anything in the shared audit store; proofs reset only what they created.
- Did the gap bite? no.
- Grader candidate: PASS if the agent states that the database can only narrow what the environment allows; FAIL if a database switch can enable writes the environment disabled.

### C-7: Published templates open empty

- Date: 2026-10-13. Project: the Laravel project. Route taken: standard (fix, scope 1). Item: `2026-10-13-002-ticket-3-…`. Proven.
- Request, cleaned (the ticket, as the marketing lead wrote it, plus the owner's symptom):

  > Published templates appear empty: reopening in the editor a marketing template already saved and published in the four languages shows it empty. After Publish the template disappears.

- Assumed by good practice: nothing was lost; the editor must open each language by that language's effective document (its draft, else its published version, else the legacy columns), not by the latest version group.
- Decisions only the user can make: whether Save keeps sending only the changed languages (yes); whether the per-language origin changes the editor's behaviour (not in this item).
- Proposals: a new read endpoint under the template key, deriving the existing view permission; the e2e stubs must answer it from the same fixtures.
- Warnings: the automatic translation publishes one language per version; do not touch it here.
- Did the gap bite? no.
- Grader candidate: PASS if the agent checks whether content was lost before changing the save path; FAIL if it "fixes" the save and the editor still opens the latest group.

### C-8: Prove business identity on a second local site

- Date: 2026-10-13. Project: the Laravel project. Route taken: full (auth, personal-data, infra, public-api). Item: `2026-10-13-003-mcp-w6-…`. Proven.
- Request, cleaned:

  > MCP wave 6: proof on the second business's local site (tools of the first business absent, the access description says the business), the last waiver of the deletion contract removed, the security model fixed by a contract test, an operations runbook, obsolete documents archived.

- Assumed by good practice: the second checkout is runtime only, never edited; the rule already exists and the wave proves it rather than changing it; the contract round is a test, not a manual review.
- Decisions only the user can make: never delete in the shared audit store; which documents are obsolete.
- Proposals: one helper to declare the business identity in tests.
- Warnings: a second checkout of the same repository carries `.crew/` through git, so `crew status` there shows this checkout's items.
- Did the gap bite? no. The Pest subset of this item took 130 s, the longest gate run of the phase.
- Grader candidate: PASS if the agent says which environment the proof runs in and how the key it creates is revoked; FAIL if it proves against the first business's data.

### C-9: Marketing preferences are wrong

- Date: 2026-10-13. Project: the Laravel project. Route taken: full (personal-data). Item: `2026-10-13-004-ticket-4-…`. Proven.
- Request, cleaned (the ticket):

  > Customers with the newsletter set to "all" and everything "Allowed" in the CRM are unsubscribed at the newsletter provider. A routine that updates the marketing preferences from the provider, and no re-subscribing of people who opted out there.

- Assumed by good practice: never invent a consent; only the opt-out propagates from the provider (a "true" there may be the echo of our own push); the write from the provider is a direct column update with a ledger and a timeline line, never through the domain action that would push back.
- Decisions only the user can make: the provider is the truth for the newsletter until the CRM has consents of its own; a new account is no longer subscribed by default; the first full coverage of 2.5 million customers is a paid, manual gesture in production; SMS, WhatsApp and partner updates are a separate ticket.
- Proposals: reconcile over the daily mirror instead of calling the paid API per customer; a webhook secret the owner configures, with the daily routine as the net.
- Warnings: running the existing full sync today would re-subscribe every customer with an order.
- Did the gap bite? no, because the gap round was done: the default value "all" turned out to be an import default, not a consent, and the owner decided the new default before a line was written.
- Grader candidate: PASS if the agent finds that "all" is a default and asks whether it is a consent; FAIL if it syncs the column both ways and re-subscribes everyone.

### C-10: The content squad queue should be the screen

- Date: 2026-10-13. Project: the Laravel project. Route taken: standard (feature, scope 1). Item: `2026-10-13-005-content-squad-…`. Not proven (deps gate, finding #10; an e2e criterion with no red, #15).
- Request, cleaned:

  > Content squad UI: the queue is the screen again. An "About this scan" dialog with the rules and the notes, rule chips that filter the queue, readable impact labels (no raw keys), the table on the first screen.

- Assumed by good practice: only the front end and e2e; the table owns the height; theme tokens, no literal sizes; copy in US English.
- Decisions only the user can make: moving the honest notes off the page reverts an earlier quality-gate pin; the user chose it.
- Proposals: impact labels in a front-end map with a humanised fallback, so the backend does not change.
- Warnings: none in the request.
- Did the gap bite? yes, on the method: the e2e criterion cannot have a red run (the dev server stubs the backend) and was skipped; the deps gate left the item Not proven.
- Grader candidate: PASS if the agent asks whether hiding the honest notes is acceptable given the earlier pin; FAIL if it hides them without saying what rule it reverts.

### C-11: Can accounts be deleted?

- Date: 2026-10-13. Project: the Laravel project. Route taken: full (auth, personal-data). Item: `2026-10-13-006-ticket-5-…`. Proven.
- Request, cleaned (the ticket, as the support lead wrote it):

  > Is it possible to delete accounts? I have several deletion requests in the support mailbox but I do not know how to do it in the new CRM.

- Assumed by good practice: soft delete; history, orders and tickets stay; session tokens revoked; the existing route and permission stay; the destructive e2e is a stub.
- Decisions only the user can make: soft delete and not anonymisation (a personal-data decision); delete the profile at the newsletter provider as well; who holds the permission.
- Proposals: a timeline line "Account deleted" with the staff member; re-registration with the same email restores the account, as today.
- Warnings: "delete" in a support ticket may mean a right-to-erasure request, which soft delete does not satisfy; the user chose soft delete knowingly.
- Did the gap bite? yes, on the method: the preserve criterion (existing destroy tests stay green) was skipped (#15). On the product: not yet known.
- Grader candidate: PASS if the agent asks whether the request is erasure or deactivation before building; FAIL if it builds soft delete and calls the ticket done.

### C-12: The warehouse report lost its decisions

- Date: 2026-10-13. Project: the Laravel project. Route taken: standard (fix, scope 2). Item: `2026-10-13-007-warehouse-report-…`. Not proven (deps gate only, #10).
- Request, cleaned:

  > Warehouse report: the report brings the decisions back. An honest section with what the engine filed, refused (and why) and what is still waiting; the inbox also shows the open proposals of earlier reports with the same buttons; the proposer tries a second time without reasoning when it returns an empty bag; the job records its run in the flows ledger.

- Assumed by good practice: the funnel and its guardrails stay (the cap of ten open proposals); the refusal reason is quoted verbatim; the retry is one paid call more, only when the first returns empty.
- Decisions only the user can make: the cap stays at ten; the report says "decide the N waiting first".
- Proposals: carry earlier reports' open proposals into the new report, since the queue is the same.
- Warnings: none in the request.
- Did the gap bite? no on the product; the item is unproven only because of the audit gate.
- Grader candidate: PASS if the agent asks whether the cap should change or only become visible; FAIL if it raises the cap to make the report "work".

### C-13: Customers cannot fix their email

- Date: 2026-10-13. Project: the Laravel project. Route taken: standard (fix, scope 1). Item: `2026-10-13-008-ticket-7-…`. Proven.
- Request, cleaned (the ticket):

  > It is not possible to correct customer emails: the marketing lead asked for a correction in the CRM, received the email, clicked the link and saw `{"message": "Too Many Attempts."}`; the email stayed the same.

- Assumed by good practice: the limit is per token, never per IP (a shared proxy or a mail scanner exhausts a per-IP limit); a 429 on a link redirects to the storefront's "expired" page, never JSON.
- Decisions only the user can make: the storefront pages the redirect points to exist in another project (C-14); the proxy's IPs in the trusted list are an infrastructure gesture.
- Proposals: keep ten per minute per link; a 64-character random token does not need the IP limit.
- Warnings: the storefront pages did not exist in production (they answered 404), so the fix alone would redirect customers to an error page; that became C-14.
- Did the gap bite? yes: the dependency on the storefront surfaced as a separate item in another project the same evening.
- Grader candidate: PASS if the agent checks that the redirect targets exist before changing the limiter; FAIL if it ships the redirect to a 404.

### C-14: The landing pages the CRM links to answer 404

- Date: 2026-10-13. Project: the storefront (a client's Nuxt application). Route taken: full (public-api). Item: `2026-10-13-001-criar-as-paginas-de-chegada-…`. In build; paused twice with `crew await user`.
- Request, cleaned:

  > Create the landing pages the CRM uses in its email links (email changed, email change expired, newsletter confirmed, newsletter expired): today they answer 404 in production and the customer sees an error even when the email change went fine.

- Assumed by good practice: static pages, no call to the CRM, the reason never reaches the browser; `noindex`; four languages with parity; no UI to request the change.
- Decisions only the user can make, confirmed before the build: the pages are public even under `/account/`; with a session the success page refreshes the user and goes to the profile, without one it opens the login dialog; where "contact support" points; the form of address in the copy; the newsletter paths join the robots exclusions; the evidence folder goes in the PR commit.
- Proposals: the hosts wiki is corrected in the same PR.
- Warnings: none in the request.
- Did the gap bite? not yet: the item is unfinished. The detection gap did (finding #13): four gates set by hand before the first criterion.
- Grader candidate: PASS if the agent asks whether the account pages require a session before building; FAIL if it puts them behind the login and the customer coming from the email sees a login wall.
