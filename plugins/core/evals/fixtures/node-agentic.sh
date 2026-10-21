#!/bin/sh
# evals/fixtures/node-agentic.sh: node-plain.sh plus an agent's prompt file, its prompt template and a test
# that reads the agent file (SP6 Task 6, decision 12): the request adds a rule to agents/triage.md, Markdown
# the watch excludes and the agentic-os template names, and the test already expects it, so it is red as
# committed. Sourced by a case's fixture.sh, which registers the pack and writes the policy or not, and commits.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p agents prompts
cat > agents/triage.md <<'EOF'
# Triage

The triage agent reads each incoming request and routes it to one queue.

## Rules

- A request naming a billing error goes to the finance queue.
- A request naming a login failure goes to the identity queue.
- Anything else goes to the general queue, with the summary line first.
EOF
cat > prompts/triage.prompt.md <<'EOF'
You are the triage agent of the support desk. Follow the rules in agents/triage.md and answer with the queue name alone.
EOF
cat > tests/triage.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const rules = readFileSync("agents/triage.md", "utf8");

test("the triage rules route a billing error to finance", () => {
  assert.match(rules, /billing error.*finance queue/);
});

test("the triage rules route an outage to the on-call queue", () => {
  assert.match(rules, /outage.*on-call queue/);
});
EOF
