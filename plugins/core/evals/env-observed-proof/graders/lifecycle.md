---
type: regex
target: { source: file, path: var/log.txt }
pattern: 'start[\s\S]*stop'
arm: with-only
---
