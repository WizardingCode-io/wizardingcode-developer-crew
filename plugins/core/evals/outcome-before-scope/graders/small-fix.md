---
type: regex
target: { source: file, path: src/accounts.mjs }
pattern: 'toLowerCase\(\)|toLocaleLowerCase\(|toUpperCase\(\)|localeCompare\('
arm: both
---
