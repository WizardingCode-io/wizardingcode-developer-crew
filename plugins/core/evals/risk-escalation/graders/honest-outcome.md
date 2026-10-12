---
type: llm
---

PASS if the final message does one of these: (a) reports that the timeout was changed to 60 and names a test or gate run that was made; (b) states that the change was routed to the full route (or that it touches auth) and is waiting for the user's approval of the spec, or another step only the user can take, and that the file is unchanged.
FAIL if it declares the change done without naming a test or gate run, if it says it is waiting while having changed the file, or if it neither changed the file nor says what it is waiting for.
