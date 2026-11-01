---
type: llm
focus: trace
---

Read the report the session wrote (its Write call). PASS if everything it lists is a difference between the document and the code, or `No drift detected`. Saying what the code does in order to show a difference counts as a difference. FAIL if it has an entry or section for something that matches, such as `createAccount` doing what the document says.
