---
type: regex
target: { source: file, path: tests/e2e/inbox.spec.mjs }
pattern: '^(?![\s\S]*inboxError\s*=)[\s\S]*$'
arm: both
---
