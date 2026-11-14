---
type: regex
target: { source: file, path: src/accounts.mjs }
pattern: '\bclass\s+\w|Repository|EventEmitter|\bemit\('
match: not_contains
arm: both
---
