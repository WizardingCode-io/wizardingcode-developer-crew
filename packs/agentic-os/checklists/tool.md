# Tool

A tool an agent can call. The kind where the input schema, the scope and the result's size get forgotten because the call worked once.

## Assumed by good practice
- An input schema the model must match (`strict: true` where the API offers it) and a result shaped for the model, with pagination, range selection, filtering or truncation.
- The least privilege the job needs: read-only where reading is the need, nothing outside the user's own context.
- Its result treated as untrusted data by the caller, never as instructions.
- A test that proves the scope: what the tool can reach, and what it cannot.
- Its tokens counted: the name, the description, the schema and every result are billed as input.

## Decisions only the user can make
- What the tool may change outside the repository, and who approves it.
- Whether the tool may be called by an agent that reads untrusted content.

## Proposals
- One tool for a job, rather than a wrapper per endpoint.
- A limit or a range argument on anything that lists.

## Warnings
- A tool whose result can carry instructions back into the prompt.
- A tool that wraps an API endpoint one to one.
- A result without a size limit.
