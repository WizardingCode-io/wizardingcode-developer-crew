import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findBrowser, NO_PDF, printPdf } from "../src/pdf.ts";
import { tempDir, testEnv } from "./helpers.ts";

/** A browser stand-in: a script in a folder with a space in its name, so the quoting is proven with it. */
function fakeBrowser(body: string): string {
  const dir = tempDir("crew pdf ");
  const script = join(dir, "chrome stand-in.sh");
  writeFileSync(script, `#!/bin/sh\n${body}\n`);
  chmodSync(script, 0o755);
  return script;
}

function page(): { html: string; out: string; root: string; log: string } {
  const root = tempDir("crew-pdf-root-");
  const html = join(root, "report page.html");
  writeFileSync(html, "<!doctype html><html><body>audit</body></html>\n");
  return { html, out: join(root, "report out.pdf"), root, log: join(root, "pdf.log") };
}

test("SP8-T5 AC-2: the browser named by WIZARDINGCODE_CREW_BROWSER prints the PDF, its words quoted, under the timeout", async () => {
  const script = fakeBrowser(
    'for a in "$@"; do case "$a" in --print-to-pdf=*) printf "%%PDF-1.4\\n" > "${a#--print-to-pdf=}";; esac; done; echo "$@" > "$(dirname "$0")/args.txt"',
  );
  const { html, out, root, log } = page();
  const env = { ...testEnv(), WIZARDINGCODE_CREW_BROWSER: script };
  const result = await printPdf(html, out, env, root, { timeoutMs: 10_000, logPath: log });
  expect(result).toEqual({ ok: true, by: script });
  expect(readFileSync(out, "utf8").startsWith("%PDF-1.4")).toBe(true);
  const args = readFileSync(join(script, "..", "args.txt"), "utf8");
  expect(args).toContain("--headless=new --disable-gpu --no-pdf-header-footer");
  expect(args).toContain(`--print-to-pdf=${out}`);
  expect(args).toContain(`file://${html}`);
});

test("SP8-T5 AC-2: a browser that hangs or exits non-zero leaves no PDF and says why; no Playwright and no browser is the sentence", async () => {
  const slow = fakeBrowser("sleep 5");
  const { html, out, root, log } = page();
  const timedOut = await printPdf(
    html,
    out,
    { ...testEnv(), WIZARDINGCODE_CREW_BROWSER: slow },
    root,
    { timeoutMs: 300, logPath: log },
  );
  expect(timedOut).toEqual({
    ok: false,
    reason: "PDF not produced: the browser timed out after 0.3 s",
  });
  expect(existsSync(out)).toBe(false);
  const failing = fakeBrowser('echo "boom: no display" >&2; exit 2');
  const exited = await printPdf(
    html,
    out,
    { ...testEnv(), WIZARDINGCODE_CREW_BROWSER: failing },
    root,
    { timeoutMs: 10_000, logPath: log },
  );
  expect(exited).toEqual({
    ok: false,
    reason: "PDF not produced: the browser exited 2: boom: no display",
  });
  const none = await printPdf(html, out, { ...testEnv(), PATH: "" }, root, {
    timeoutMs: 1_000,
    logPath: log,
    candidates: [],
  });
  expect(none).toEqual({ ok: false, reason: NO_PDF });
  expect(NO_PDF).toBe(
    "PDF not produced: no Playwright in the project and no browser found (set WIZARDINGCODE_CREW_BROWSER)",
  );
  expect(findBrowser({ ...testEnv(), PATH: "" }, [])).toBeNull();
  expect(findBrowser({ ...testEnv(), WIZARDINGCODE_CREW_BROWSER: slow }, [])).toBe(slow);
});

/** A Playwright stand-in under the project's own node_modules: what `createRequire(root)` resolves. */
function fakePlaywright(root: string, body: string): void {
  const dir = join(root, "node_modules", "playwright");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "playwright", main: "index.js" }),
  );
  writeFileSync(join(dir, "index.js"), body);
}

test("SP8-T5 AC-2: the project's own Playwright, resolved from the root alone, prints the PDF before any browser; a hang is the timeout, a failure its message; a root without one falls to the browser", async () => {
  const printing = page();
  fakePlaywright(
    printing.root,
    'const fs = require("node:fs");\nmodule.exports = { chromium: { launch: async () => ({ newPage: async () => ({ goto: async () => {}, pdf: async ({ path }) => fs.writeFileSync(path, "%PDF-1.4\\n") }), close: async () => {} }) } };\n',
  );
  // The browser stand-in would fail: Playwright comes first and it is never run.
  const env = { ...testEnv(), WIZARDINGCODE_CREW_BROWSER: fakeBrowser("exit 3") };
  expect(
    await printPdf(printing.html, printing.out, env, printing.root, {
      timeoutMs: 10_000,
      logPath: printing.log,
    }),
  ).toEqual({ ok: true, by: "playwright" });
  expect(readFileSync(printing.out, "utf8").startsWith("%PDF-1.4")).toBe(true);
  const hanging = page();
  fakePlaywright(
    hanging.root,
    "module.exports = { chromium: { launch: async () => ({ newPage: async () => ({ goto: async () => {}, pdf: () => new Promise(() => {}) }), close: async () => {} }) } };\n",
  );
  expect(
    await printPdf(hanging.html, hanging.out, env, hanging.root, {
      timeoutMs: 300,
      logPath: hanging.log,
    }),
  ).toEqual({ ok: false, reason: "PDF not produced: Playwright timed out after 0.3 s" });
  const failing = page();
  fakePlaywright(
    failing.root,
    'module.exports = { chromium: { launch: async () => { throw new Error("no chromium here"); } } };\n',
  );
  expect(
    await printPdf(failing.html, failing.out, env, failing.root, {
      timeoutMs: 1_000,
      logPath: failing.log,
    }),
  ).toEqual({ ok: false, reason: "PDF not produced: Playwright failed: no chromium here" });
  // The engine's own timeout is told by its type, not by the words: a Playwright failure that
  // begins "timed out" is a failure (finding 102).
  const wordy = page();
  fakePlaywright(
    wordy.root,
    'module.exports = { chromium: { launch: async () => { throw new Error("timed out early: no display"); } } };\n',
  );
  expect(
    await printPdf(wordy.html, wordy.out, env, wordy.root, {
      timeoutMs: 1_000,
      logPath: wordy.log,
    }),
  ).toEqual({
    ok: false,
    reason: "PDF not produced: Playwright failed: timed out early: no display",
  });
  // The engine's own tree and the current directory hold no Playwright for the audited project: a bare root falls to the browser.
  const bare = page();
  expect(
    await printPdf(bare.html, bare.out, { ...testEnv(), PATH: "" }, bare.root, {
      timeoutMs: 1_000,
      logPath: bare.log,
      candidates: [],
    }),
  ).toEqual({ ok: false, reason: NO_PDF });
});
