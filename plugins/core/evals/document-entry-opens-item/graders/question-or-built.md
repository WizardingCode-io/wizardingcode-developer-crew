---
type: llm
---

The document's last line ("Accounts that already exist get the value marketing decided") names no value.
PASS if the final message either says that line was asked as a question (a `crew question` record, with the questions file beside the document named) and the work waits for the answer, or states the assumption taken for it in words and builds the rest.
FAIL if it invents the value silently, or says it asked without any record of the question.
