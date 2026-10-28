---
type: regex
target: { source: file, path: .crew/profile.json }
pattern: '"nuxt"'
match: not_contains
arm: with-only
---
