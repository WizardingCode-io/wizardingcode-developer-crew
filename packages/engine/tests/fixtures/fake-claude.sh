#!/bin/sh
# A stand-in for `claude` in the engine's tests: records how it was called, pretends to run, prints
# what `claude -p --output-format json` prints. FAKE_CLAUDE_RECORD names the file to write (written
# whole, then moved into place, so a reader never sees a part of it; the argv list ends with a record
# separator, since a prompt holds newlines); FAKE_CLAUDE_SLEEP makes it linger so a kill can be
# tested; FAKE_CLAUDE_TRAP makes it ignore SIGTERM, so the escalation to SIGKILL can be tested;
# FAKE_CLAUDE_ORPHAN starts a member of its process group that ignores SIGTERM and outlives it (a
# tool's child), marked by a file beside the log, so the kill of the whole group can be tested;
# FAKE_CLAUDE_SUBTYPE sets the result's subtype (success by default; any other marks the result an
# error, as `error_max_turns` does); FAKE_CLAUDE_EXIT sets the exit code.
record="${FAKE_CLAUDE_RECORD:-}"
if [ -n "$record" ]; then
  {
    printf 'cwd=%s\n' "$(pwd)"
    printf 'pid=%s\n' "$$"
    printf 'argv='
    for a in "$@"; do printf '%s\037' "$a"; done
    printf '\036\n'
    # The crew's own variables with their values; of the others only the names, so a credential the
    # parent session holds never lands in a record file.
    env | grep -E '^(CLAUDE|WIZARDINGCODE)' | sort | sed -E '/^WIZARDINGCODE_CREW_/!s/=.*$//'
  } > "$record.tmp" && mv "$record.tmp" "$record"
fi
if [ -n "${FAKE_CLAUDE_TRAP:-}" ]; then trap '' TERM; fi
if [ -n "${FAKE_CLAUDE_ORPHAN:-}" ]; then
  ( trap '' TERM; : > "${FAKE_CLAUDE_ORPHAN_MARK:-/dev/null}"; sleep 30 ) &
  sleep 30
fi
if [ -n "${FAKE_CLAUDE_SLEEP:-}" ]; then sleep "$FAKE_CLAUDE_SLEEP"; fi
subtype="${FAKE_CLAUDE_SUBTYPE:-success}"
if [ "$subtype" = success ]; then
  printf '{"type":"result","subtype":"success","is_error":false,"result":"pong","session_id":"00000000-0000-4000-8000-000000000000","num_turns":1,"total_cost_usd":0.0123}\n'
else
  printf '{"type":"result","subtype":"%s","is_error":true,"result":"","session_id":"00000000-0000-4000-8000-000000000000","num_turns":3,"total_cost_usd":0.05}\n' "$subtype"
fi
exit "${FAKE_CLAUDE_EXIT:-0}"
