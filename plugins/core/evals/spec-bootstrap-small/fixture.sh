#!/bin/sh
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p lib/queue
cat > lib/queue/queue.mjs <<'DOC'
export const MAX = 3;
export function enqueue(items, item) {
  if (items.length >= MAX) throw new Error("full");
  return [...items, item];
}
DOC
cat > lib/queue/BUILD.bazel <<'DOC'
js_library(name = "queue", srcs = ["queue.mjs"])
DOC
touch WORKSPACE
git add -A
fixture_commit "fixture: a small tree with Bazel"
crew detect > /dev/null
