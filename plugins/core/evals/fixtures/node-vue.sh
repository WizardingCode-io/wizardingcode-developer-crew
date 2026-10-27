#!/bin/sh
# evals/fixtures/node-vue.sh: node-plain.sh plus a Vue single-file component under components/ and a test
# that reads the component (SP9 Task 10): the request gives the notice its dismiss motion, and the test
# already expects a transition on transform or opacity, so it is red as committed. The component has no
# transition and no reduced-motion branch, so the pack's craft (or the core's lint) shows in the diff.
# Sourced by a case's fixture.sh, which registers the pack and writes the policy or not, and commits.
set -eu
. "$(dirname "$0")/../fixtures/node-plain.sh"
mkdir -p components
cat > components/Notice.vue <<'EOF'
<template>
  <div v-if="open" class="notice" role="status">
    <slot />
    <button type="button" class="notice__dismiss" aria-label="Dismiss" @click="open = false">×</button>
  </div>
</template>

<script setup>
import { ref } from "vue";

const open = ref(true);
</script>

<style scoped>
.notice {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  background: var(--color-surface, #f4f4f5);
  color: var(--color-text, #18181b);
}

.notice__dismiss {
  margin-left: auto;
  border: 0;
  background: none;
  font: inherit;
  cursor: pointer;
}
</style>
EOF
cat > tests/notice.test.mjs <<'EOF'
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const notice = readFileSync("components/Notice.vue", "utf8");

test("the notice has a dismiss button", () => {
  assert.match(notice, /aria-label="Dismiss"/);
});

test("the notice animates its dismiss with a transition on transform or opacity", () => {
  assert.match(notice, /transition/);
  assert.match(notice, /transform|opacity/);
});
EOF
