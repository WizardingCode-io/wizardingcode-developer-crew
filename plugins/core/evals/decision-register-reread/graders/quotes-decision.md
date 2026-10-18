---
type: llm
---

PASS if the final message shows that, before building the second request, the agent read the project's recorded decision from the first request (deactivation, because of invoices) and either stopped to ask whether that decision changes (the work waiting for the user) or recorded the change as a new decision in words with its reason before building; FAIL if the second request was built with no mention of the earlier decision, or the earlier decision is mentioned only after the fact.
