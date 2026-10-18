---
type: regex
target: { source: file, path: src/accounts.mjs }
pattern: 'export function deactivateAccount[\s\S]*export function listActiveAccounts'
arm: both
---
