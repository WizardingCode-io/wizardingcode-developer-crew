---
type: regex
target: { source: file, path: src/accounts.mjs }
pattern: 'const accounts = new Map\(\);[\s\S]*export function createAccount\(id, email\)[\s\S]*export function listAccounts\(\)'
arm: both
---
