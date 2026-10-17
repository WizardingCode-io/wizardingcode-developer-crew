#!/bin/sh
# evals/gap-restore-schema-not-data/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p migrations docs
printf 'CREATE TABLE notes (id TEXT PRIMARY KEY, body TEXT NOT NULL);\n' > migrations/001_create_notes.sql
printf 'DROP TABLE notes;\n' > migrations/002_drop_notes.sql
printf '# Changelog\n\n- 2026-10-10: the notes screen was removed and its table dropped (migration 002).\n' > docs/CHANGELOG.md
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: gap-restore-schema-not-data"
git log -1 --oneline
