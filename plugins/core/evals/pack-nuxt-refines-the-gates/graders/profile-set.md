---
type: regex
target: { source: file, path: .crew/profile.json }
pattern: '"command":\s*"node node_modules/vitest/vitest\.mjs run",\s*"source":\s*"confirmed"'
arm: with-only
---
