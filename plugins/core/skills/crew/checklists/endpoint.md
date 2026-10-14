# Endpoint

A route, action, query or command another program or screen calls. The kind where authentication gets forgotten because the request was small.

## Assumed by good practice
- Authenticated, and authorised the way the resource's other endpoints are; a list is paginated and bounded; input validated at the boundary in the module's own shape.
- Errors in the project's error shape, never a stack or a raw exception; the same rate limit as the neighbours.

## Decisions only the user can make
- Who may call it: which permission or role, and whether existing users have it today.
- Which fields it exposes, and whether any is personal data a broader audience now sees.

## Proposals
- Filters and sort consistent with the resource's other endpoints; a contract or OpenAPI line beside them.

## Warnings
- A list with no limit; a route "unauthenticated for now"; a field that returns to an API what only one screen was allowed to show.
