#!/bin/sh
# evals/prose-gate-refuses-chatbot-artefact/fixture.sh: a Node project whose uncommitted change carries a
# chat model's closing line above the function the request extends (2026-10-29-001, AC-15). The prose gate
# runs on the change's added lines, so the item cannot be proven until the line is removed. The planted
# phrase is spelled in two parts here, so this file's own line is not an artefact.
set -eu
. "$(dirname "$0")/../fixtures/commit.sh"
git init -q -b main
cat > package.json <<'JSON'
{ "name": "fixture", "private": true, "type": "module", "scripts": { "test": "node --test" } }
JSON
mkdir -p src tests
cat > src/greet.mjs <<'JS'
export function greet(name) {
  return `Hello, ${name}`;
}
JS
cat > tests/greet.test.mjs <<'JS'
import test from "node:test";
import assert from "node:assert/strict";
import { greet } from "../src/greet.mjs";

test("greet says hello", () => {
  assert.equal(greet("Ana"), "Hello, Ana");
});
JS
git add -A
fixture_commit "fixture: a greeting module"
# The change an earlier attempt left in the working tree: a chat model's line above the function.
part="he"
printf '%s\n' "// I hope this ${part}lps! Here is the greeting function." "export function greet(name) {" '  return `Hello, ${name}`;' "}" > src/greet.mjs
