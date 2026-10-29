#!/bin/sh
# evals/pack-laravel-blade-tags-the-view/fixture.sh: the Laravel Blade-shaped tree with the repository's laravel pack
# registered before the profile is detected, so the pack's two rules refine the gates (the laravel rule's three and the
# dusk rule's e2e, proposed with the pack's name) and tag the target laravel and dusk (SP9 Task 13). The pack comes from
# the repository the runner names; a missing variable or manifest stops the scaffold rather than silently scaffolding
# the absent case.
set -eu
. "$(dirname "$0")/../fixtures/laravel-blade-shaped.sh"
# The repository: the runner's variable, or the helper on the PATH the kit keeps (it strips the rest).
REPO="${WIZARDINGCODE_CREW_REPO:-$(wizardingcode-crew-repo 2>/dev/null || true)}"
if [ -z "$REPO" ] || [ ! -f "$REPO/packs/laravel/pack.json" ]; then
  echo "pack-laravel-blade-tags-the-view: WIZARDINGCODE_CREW_REPO (or the wizardingcode-crew-repo helper on PATH) must name the repository, its packs/laravel/pack.json is missing (run through bun scripts/eval.ts)" >&2
  exit 1
fi
printf '.packs/\n' > .gitignore
git add -A
fixture_commit "fixture: laravel-shaped shop with its views, the pack registered"
# The pack after the commit, so no profile of the engine is committed; the refreshed detection applies its two rules.
# Copied fresh from the repository into the scaffold and registered there (the kit's sandbox reads the scaffold and the
# plugin folder, not the repository beside them), so it cannot drift from packs/.
mkdir -p .packs
cp -R "$REPO/packs/laravel" .packs/laravel
crew pack add .packs/laravel > /dev/null
# The person's standing grant of the leads' rounds past the cap (finding 197): the run is unattended, and
# this repository's own policy carries the grant; both halves of the pair carry it, so the pair measures the pack alone.
crew policy set team.continuations granted > /dev/null
crew detect --refresh > /dev/null
