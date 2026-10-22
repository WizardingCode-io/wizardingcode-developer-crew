#!/bin/sh
# evals/task-implementer-worktree/fixture.sh: two projects in workspace w (A at the root, B at peer/b), B accepting ["question", "notice"].
set -eu
B_ACCEPT='["question", "notice"]'
B_OPEN="${B_OPEN:-read-only}"
export B_ACCEPT B_OPEN
. "$(dirname "$0")/../fixtures/two-projects.sh"
# The lead's item, built to its plan phase with two tasks, so the prompt can hand one out.
id=$(crew start "Two modules: a greeting and a farewell" --answers '{"work_type":"feature","is_vague":0.05,"scope":1,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}' --criterion "src/greet.mjs exports greet(name) returning Hello, <name>" --criterion "src/farewell.mjs exports farewell(name) returning Goodbye, <name>" | head -1 | awk '{print $2}')
item=".crew/work/$id"
cat > "$item/spec.md" <<EOF
# Two modules: a greeting and a farewell

## Problem
The project has no greeting and no farewell.

## Acceptance criteria
- AC-1: src/greet.mjs exports greet(name) returning Hello, <name>
- AC-2: src/farewell.mjs exports farewell(name) returning Goodbye, <name>

## Design
Two modules, two tests; T-2 (the farewell) is disjoint from T-1 and goes to an implementer.

## Risks and rollback
None: two pure functions.

## Out of scope
Everything else.
EOF
cat > "$item/conclave.md" <<EOF
# Conclave: gap round

## Assumed by good practice
- Pure functions with a test each.

## Decisions only the user can make
- none

## Proposals
- none

## Warnings
- none
EOF
crew approve "$id" spec --validator complete-gap-round > /dev/null
crew phase "$id" next > /dev/null
crew phase "$id" next > /dev/null
crew phase "$id" next > /dev/null
# SP7a: the mandatory leads validate the spec before the plan opens.
mkdir -p "$item/conclave"
for lead in lead-qa lead-security; do
  printf "# %s lead's validation of %s: spec\nverdict: validated\n## Returns\n- none\n## Notes\n- the criteria are observable\n" "${lead#lead-}" "$id" > "$item/conclave/$lead.md"
  crew validation "$id" record --what spec --by "$lead" --file "$item/conclave/$lead.md" > /dev/null
done
crew phase "$id" next > /dev/null
cat > "$item/plan.md" <<EOF
# Plan

1. AC-1: src/greet.mjs and tests/greet.test.mjs; red then green.
2. AC-2: src/farewell.mjs and tests/farewell.test.mjs; red then green.
EOF
git add -A
git -c user.name=Fixture -c user.email=fixture@example.invalid commit -q -m "lead: spec, conclave, plan"
echo "ITEM=$id"
git log -1 --oneline
