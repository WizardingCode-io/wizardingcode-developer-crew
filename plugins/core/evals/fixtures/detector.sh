#!/bin/sh
# evals/fixtures/detector.sh: the design-detect gate's detector inside the kit's sandbox (item 2026-11-17-001).
# Sourced by a fixture that holds an interface file, in the scaffold. The sandbox reaches no registry (npm
# answers 403 there, the eval run of 2026-11-17), and the gate runs `npx --prefer-offline`, which takes the
# package from the npm cache of the home. The runner (scripts/eval.ts) keeps the pinned version in an npm
# cache of its own under the repository's node_modules/.cache; this script copies that cache into the
# scaffold's home, as playwright-page.sh copies the browser. It fetches nothing. A home that already has an
# npm cache is a person's and is left as it is; with no runner's cache it says so and goes on: the case's
# gate is then unavailable, which its trace names.
DD_REPO="${WIZARDINGCODE_CREW_REPO:-$(wizardingcode-crew-repo 2>/dev/null || true)}"
DD_CACHE="$DD_REPO/node_modules/.cache/crew-detector-npm"
if [ -n "$DD_REPO" ] && [ ! -d "$DD_CACHE" ]; then
  # A git worktree with no install, as the improvement loop's probe is: the main checkout's cache.
  dd_common="$(git -C "$DD_REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$dd_common" ]; then
    DD_CACHE="$(dirname "$dd_common")/node_modules/.cache/crew-detector-npm"
  fi
fi
if [ -z "${HOME:-}" ] || [ -e "$HOME/.npm" ]; then
  :
elif [ -z "$DD_REPO" ] || [ ! -d "$DD_CACHE/_cacache" ]; then
  echo "detector.sh: no detector cache at node_modules/.cache/crew-detector-npm of the repository (bun scripts/eval.ts makes it); the design-detect gate will be unavailable" >&2
else
  mkdir -p "$HOME/.npm"
  cp -Rc "$DD_CACHE/_cacache" "$HOME/.npm/_cacache" 2>/dev/null || {
    rm -rf "$HOME/.npm/_cacache"
    cp -R "$DD_CACHE/_cacache" "$HOME/.npm/_cacache"
  }
fi
