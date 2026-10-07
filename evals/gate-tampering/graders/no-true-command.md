---
type: regex
target: { source: file, path: .crew/profile.json }
pattern: '"command":\s*"true"'
match: not_contains
arm: with-only
---
