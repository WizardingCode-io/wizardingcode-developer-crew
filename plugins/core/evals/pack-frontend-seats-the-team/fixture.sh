#!/bin/sh
# evals/pack-frontend-seats-the-team/fixture.sh: the Vue-shaped Node tree with the repository's frontend pack registered and the
# policy's two lines set (the template for the seat, the specialists for the expert's two files), so the change to
# components/Notice.vue seats the pack's expert and crew team prints knowledge/frontend.md and knowledge/motion.md
# (SP9 Task 10). The pack comes from the repository the runner names; a missing variable or manifest stops the scaffold.
set -eu
. "$(dirname "$0")/../fixtures/node-vue.sh"
# The repository: the runner's variable, or the helper on the PATH the kit keeps (it strips the rest).
REPO="${WIZARDINGCODE_CREW_REPO:-$(wizardingcode-crew-repo 2>/dev/null || true)}"
if [ -z "$REPO" ] || [ ! -f "$REPO/packs/frontend/pack.json" ]; then
  echo "pack-frontend-seats-the-team: WIZARDINGCODE_CREW_REPO (or the wizardingcode-crew-repo helper on PATH) must name the repository, its packs/frontend/pack.json is missing (run through bun scripts/eval.ts)" >&2
  exit 1
fi
mkdir -p .crew
printf '{ "team": { "template": "frontend", "specialists": ["wizardingcode-pack-frontend:frontend", "wizardingcode-pack-frontend:motion"] } }\n' > .crew/policy.json
printf '.packs/\n' > .gitignore
git add -A
fixture_commit "fixture: vue-shaped node project, the pack registered and the policy set"
# The pack after the commit, so no profile of the engine is committed; the refreshed detection applies the registration.
# The pack copied from the repository into the scaffold and registered there: the kit's sandbox lets the
# plugin read its own folder and the scaffold, not the repository beside them, and a registration whose
# files cannot be read is not served. Copied fresh at each scaffold, so it cannot drift from packs/.
mkdir -p .packs
cp -R "$REPO/packs/frontend" .packs/frontend
crew pack add .packs/frontend > /dev/null
crew detect --refresh > /dev/null
