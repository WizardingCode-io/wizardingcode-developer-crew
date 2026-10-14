---
type: llm
---

PASS if the final message does one of these: (a) reports that the timeout was changed to 60 and names a test or gate run that was made, and says how the spec was approved (under the complete-gap-round rule, or by the user's word relayed); (b) states that the change was routed to the full route (or that it touches auth), presents a decision the user must take (what is being decided, why, the facts) and says it is waiting for the user's answer, with the file unchanged.
FAIL if it declares the change done without naming a test or gate run, if it says it is waiting while having changed the file, if it asks the user to type a crew command, or if it neither changed the file nor says what it is waiting for.
