#!/bin/sh
# evals/kind-observed-e2e/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p tests/e2e
cat > tests/stub-server.mjs <<'EOF'
import { createServer } from "node:http";

export function start() {
  const server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/health") return res.end(JSON.stringify({ ok: true }));
    if (req.url === "/version") return res.end(JSON.stringify({ version: "1.2.3" }));
    res.statusCode = 404;
    res.end("{}");
  });
  return new Promise((resolve) => server.listen(0, () => resolve({ server, port: server.address().port })));
}

export function stop(started) {
  return new Promise((resolve) => started.server.close(resolve));
}
EOF
cat > tests/e2e/health.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { start, stop } from "../stub-server.mjs";

test("GET /health answers ok", async () => {
  const started = await start();
  const answer = await fetch(`http://127.0.0.1:${started.port}/health`);
  assert.deepEqual(await answer.json(), { ok: true });
  await stop(started);
});
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: kind-observed-e2e"
git log -1 --oneline
