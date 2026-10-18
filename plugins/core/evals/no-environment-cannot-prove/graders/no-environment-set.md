---
type: regex
target: { source: file, path: .crew/profile.json }
pattern: '^(?![\s\S]*"environment")'
arm: with-only
---
