---
max_turns: 60
timeout_seconds: 1200
allowed_tools: [Read, Glob, Grep, Skill]
---

In src/checkout.mjs, make customerPayload also send the customer's loyalty tier to the CRM's POST /customers. The CRM is project b of this workspace (peer/b); I do not know which field it takes or which values are allowed, and I am not here to answer. Do not change the CRM.
