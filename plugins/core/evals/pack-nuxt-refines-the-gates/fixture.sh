#!/bin/sh
# evals/pack-nuxt-refines-the-gates/fixture.sh: the Nuxt-shaped tree with the repository's nuxt pack registered before
# the profile is detected, so the pack's rule refines the gates (proposed, with the pack's name) and tags the
# target nuxt (SP9 Task 11). The pack comes from the repository the runner names; a missing variable or manifest
# stops the scaffold rather than silently scaffolding the absent case.
set -eu
. "$(dirname "$0")/../fixtures/nuxt-shaped.sh"
# The repository: the runner's variable, or the helper on the PATH the kit keeps (it strips the rest).
REPO="${WIZARDINGCODE_CREW_REPO:-$(wizardingcode-crew-repo 2>/dev/null || true)}"
if [ -z "$REPO" ] || [ ! -f "$REPO/packs/nuxt/pack.json" ]; then
  echo "pack-nuxt-refines-the-gates: WIZARDINGCODE_CREW_REPO (or the wizardingcode-crew-repo helper on PATH) must name the repository, its packs/nuxt/pack.json is missing (run through bun scripts/eval.ts)" >&2
  exit 1
fi
printf '.packs/\n' > .gitignore
git add -A
fixture_commit "fixture: nuxt-shaped site, the pack registered"
# The pack after the commit, so no profile of the engine is committed; the refreshed detection applies its rule.
# The pack copied from the repository into the scaffold and registered there: the kit's sandbox lets the
# plugin read its own folder and the scaffold, not the repository beside them, and a registration whose
# files cannot be read is not served. Copied fresh at each scaffold, so it cannot drift from packs/.
mkdir -p .packs
cp -R "$REPO/packs/nuxt" .packs/nuxt
crew pack add .packs/nuxt > /dev/null
crew detect --refresh > /dev/null
