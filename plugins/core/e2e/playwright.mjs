// The crew's Playwright fixture (SP7 §8.3, rule 5): a `page` that records every console message
// and page error of a run into the file the e2e gate names, so the gate can fail on an error or a
// warning the browser printed. Import `test` and `expect` from here instead of `@playwright/test`:
//
//   import { test, expect } from "${CLAUDE_PLUGIN_ROOT}/e2e/playwright.mjs";
//
// The package is the project's own, resolved from the working directory; the engine adds nothing.
// Outside a gate run (the variable unset) the fixture records nothing and the page is the usual one.
import { appendFileSync } from "node:fs";
import { createRequire } from "node:module";

/** The file the gate names, as lines (`.jsonl`), or null outside a gate run. */
function consoleFile() {
  const file = process.env.WIZARDINGCODE_CREW_CONSOLE_FILE;
  return file ? file.replace(/\.json$/, ".jsonl") : null;
}

/** One line per event, appended as it happens: no read-back, so parallel workers never clobber each other. */
function record(file, entry) {
  appendFileSync(file, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`);
}

/** `base.extend` with a `page` fixture that records the console into the gate's file when one is named. */
export function withConsole(base) {
  return base.extend({
    page: async ({ page }, use) => {
      const file = consoleFile();
      if (file) {
        page.on("console", (msg) => {
          record(file, { page: page.url(), type: msg.type(), text: msg.text() });
        });
        page.on("pageerror", (error) => {
          record(file, { page: page.url(), type: "error", text: String(error?.message ?? error) });
        });
      }
      await use(page);
    },
  });
}

function projectPlaywright() {
  try {
    return createRequire(`${process.cwd()}/`)("@playwright/test");
  } catch {
    return null;
  }
}

const playwright = projectPlaywright();
export const test = playwright ? withConsole(playwright.test) : undefined;
export const expect = playwright ? playwright.expect : undefined;
