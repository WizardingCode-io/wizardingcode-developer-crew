---
type: regex
target: { source: file, path: .crew/profile.json }
pattern: '"next"'
match: not_contains
arm: with-only
---
