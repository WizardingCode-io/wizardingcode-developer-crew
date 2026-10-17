#!/bin/sh
# evals/gap-redirect-target/fixture.sh: the green Node project of node-plain.sh, plus what this case needs.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
cat > src/limiter.mjs <<'EOF'
// src/limiter.mjs
const hits = new Map();
export function limit(ip, max = 60) {
  const n = (hits.get(ip) ?? 0) + 1;
  hits.set(ip, n);
  return n > max ? { status: 429, body: "Too many requests" } : null;
}
EOF
cat > src/routes.mjs <<'EOF'
// src/routes.mjs: every page the app serves.
export const routes = ["/", "/login", "/account", "/help"];
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "fixture: gap-redirect-target"
git log -1 --oneline
