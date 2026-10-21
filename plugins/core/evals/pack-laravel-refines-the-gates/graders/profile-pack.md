---
type: regex
target: { source: file, path: .crew/profile.json }
pattern: '"command":\s*"php artisan test",\s*"source":\s*"confirmed",\s*"pack":\s*"wizardingcode-pack-laravel"'
arm: with-only
---
