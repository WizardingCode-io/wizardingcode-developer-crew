#!/bin/sh
# evals/fixtures/playwright-page.sh: a browser inside the kit's sandbox, as the spike of 2026-10-26 proved (SP9
# design §9, run 3). Sourced by a case's fixture.sh after node-plain.sh, in the scaffold.
# The repository's @playwright/test, playwright and playwright-core (1.64.1) and Playwright's headless shell
# (build 1248) are copied into the scaffold's node_modules: the sandbox reads neither the repository's
# node_modules nor ~/Library. The shell runs single-process, since the sandbox denies the Mach port a
# multi-process Chromium registers (run 2); never Chrome's channel (run 1) and never npx. Pages open by file://.
# The case writes its page under public/ and its specs under tests/e2e/, importing the crew's fixture from
# ./crew.mjs, which this script points at the plugin under test.
PW_VERSION=1.64.1
PW_SHELL=chromium_headless_shell-1248
PW_INSTALL="PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright bunx playwright install chromium-headless-shell"
PW_REPO="${WIZARDINGCODE_CREW_REPO:-$(wizardingcode-crew-repo 2>/dev/null || true)}"
if [ -z "$PW_REPO" ]; then
  echo "playwright-page.sh: WIZARDINGCODE_CREW_REPO (or the wizardingcode-crew-repo helper on PATH) must name the repository (run through bun scripts/eval.ts)" >&2
  exit 1
fi
# The packages: the tree's own, or the main checkout's when the tree is a git worktree with no install, as the
# improvement loop's probe is (scripts/improve.ts). The plugin under test stays the tree's.
PW_MODULES="$PW_REPO/node_modules"
if [ ! -d "$PW_MODULES" ]; then
  pw_common="$(git -C "$PW_REPO" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
  if [ -n "$pw_common" ] && [ -d "$(dirname "$pw_common")/node_modules" ]; then
    PW_MODULES="$(dirname "$pw_common")/node_modules"
  fi
fi

# An APFS clone where the volume allows it (near zero disk for the 203 MB shell), a plain copy elsewhere.
pw_copy() {
  mkdir -p "$(dirname "$2")"
  cp -Rc "$1" "$2" 2>/dev/null || {
    rm -rf "$2"
    cp -R "$1" "$2"
  }
}

for pw_pkg in @playwright/test playwright playwright-core; do
  pw_store="$(printf '%s' "$pw_pkg" | sed 's#/#+#')@$PW_VERSION"
  pw_src="$PW_MODULES/.bun/$pw_store/node_modules/$pw_pkg"
  if [ ! -f "$pw_src/package.json" ]; then
    echo "playwright-page.sh: $pw_pkg $PW_VERSION not found ($PW_MODULES/.bun/$pw_store); run bun install in the repository, then $PW_INSTALL" >&2
    exit 1
  fi
  pw_copy "$pw_src" "node_modules/$pw_pkg"
done

# The shell is looked for under PLAYWRIGHT_BROWSERS_PATH, then the repository's own folder, then $HOME's cache, then the
# cache of the account's home as the system gives it: the kit gives the scaffold a home of its own and passes it PATH
# alone. The own folder comes first of those since the shared cache is not this repository's to keep: an install in
# another project deletes a build no live package links (2026-10-30, build 1248). WIZARDINGCODE_CREW_ACCOUNT_HOME names
# the account's home in its place (the rows).
pw_own="$PW_MODULES/.cache/ms-playwright"
pw_cache="$HOME/Library/Caches/ms-playwright"
pw_account="${WIZARDINGCODE_CREW_ACCOUNT_HOME:-$(node -p 'require("node:os").userInfo().homedir')}/Library/Caches/ms-playwright"
pw_shell=""
for pw_dir in "${PLAYWRIGHT_BROWSERS_PATH:-}" "$pw_own" "$pw_cache" "$pw_account"; do
  if [ -n "$pw_dir" ] && [ -f "$pw_dir/$PW_SHELL/INSTALLATION_COMPLETE" ]; then
    pw_shell="$pw_dir/$PW_SHELL"
    break
  fi
done
if [ -z "$pw_shell" ]; then
  echo "playwright-page.sh: $PW_SHELL not found (PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-unset}, $pw_own, $pw_cache, $pw_account; this script knows macOS's cache): run $PW_INSTALL in the repository" >&2
  exit 1
fi
pw_copy "$pw_shell" "node_modules/.cache/ms-playwright/$PW_SHELL"

cat > playwright.config.mjs <<'EOF'
// The browser of this checkout: Playwright's headless shell, single-process (the sandbox denies a multi-process
// Chromium its Mach port), one worker, pages by file://, no server.
export default {
  testDir: "tests/e2e",
  workers: 1,
  reporter: "line",
  use: { headless: true, launchOptions: { args: ["--single-process", "--no-zygote"] } },
};
EOF
mkdir -p scripts tests/e2e
cat > scripts/e2e.mjs <<'EOF'
// The end-to-end run: Playwright's runner with the browser this checkout carries under node_modules/.cache.
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: resolve("node_modules/.cache/ms-playwright") };
const run = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], { stdio: "inherit", env });
process.exit(run.status ?? 1);
EOF
cat > tests/e2e/crew.mjs <<EOF
// The crew's Playwright fixture, from the plugin under test, with a browser of its own per test: the
// single-process headless shell (the sandbox's only browser) ends with its first context.
import { test as base } from "@playwright/test";
import { withConsole } from "$PW_REPO/plugins/core/e2e/playwright.mjs";

export * from "$PW_REPO/plugins/core/e2e/playwright.mjs";
export const test = withConsole(
  base.extend({
    context: async ({ playwright, launchOptions }, use) => {
      const browser = await playwright.chromium.launch({ ...launchOptions, headless: true });
      const context = await browser.newContext();
      await use(context);
      await browser.close();
    },
  }),
);
EOF
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.scripts = { ...pkg.scripts, "test:e2e": "node scripts/e2e.mjs" };
writeFileSync("package.json", `${JSON.stringify(pkg)}\n`);
'
printf 'node_modules/\ntest-results/\nvar/\n' >> .gitignore
