---
type: regex
target: { source: file, path: .crew/profile.json }
pattern: '"pack":'
match: not_contains
arm: with-only
---
