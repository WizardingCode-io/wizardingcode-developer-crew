// The capture helpers against a real page in a real browser (SP9 Task 2, AC-4): the repository's
// @playwright/test (a devDependency, tooling like Biome) drives the machine's Chrome, or Playwright's
// headless shell when the registry holds it; without either the test skips and says why.
import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tempDir } from "./helpers.ts";

const MODULE = new URL("../../../plugins/core/e2e/playwright.mjs", import.meta.url).href;

type Browser = { newPage(): Promise<Page>; close(): Promise<void> };
type Page = {
  goto(url: string): Promise<unknown>;
  click(selector: string): Promise<void>;
  close(): Promise<void>;
};

/** The browser the test can launch, or the reason it cannot: Chrome by channel first, then the registry's shell. */
async function launch(): Promise<{ browser: Browser; how: string } | { skip: string }> {
  let chromium: { launch(options: Record<string, unknown>): Promise<Browser> };
  try {
    chromium = ((await import("@playwright/test")) as { chromium: typeof chromium }).chromium;
  } catch (error) {
    return { skip: `@playwright/test is not installed at the root: ${(error as Error).message}` };
  }
  const reasons: string[] = [];
  for (const [how, options] of [
    ["the machine's Chrome", { channel: "chrome", headless: true }],
    ["Playwright's headless shell", { headless: true }],
  ] as const) {
    try {
      return { browser: await chromium.launch(options), how };
    } catch (error) {
      reasons.push(`${how}: ${String((error as Error).message).split("\n")[0]}`);
    }
  }
  return { skip: `no browser to launch (${reasons.join("; ")})` };
}

const found = await launch();
if ("skip" in found) console.log(`e2e-browser.test.ts skipped: ${found.skip}`);

const PAGE = (honours: boolean) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Demo</title>
<style>
  body { font-family: sans-serif; margin: 0; padding: 24px; }
  .spinner { width: 24px; height: 24px; border: 3px solid #999; border-top-color: #333; border-radius: 50%; animation: spin 1s linear infinite; }
  ${honours ? "@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }" : ""}
  @keyframes spin { to { transform: rotate(360deg); } }
  aside { transform: translateX(100%); opacity: 0; transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1), opacity 250ms cubic-bezier(0.16, 1, 0.3, 1); width: 200px; height: 120px; background: #eee; }
  aside.open { transform: translateX(0); opacity: 1; }
</style>
</head>
<body>
<h1>Demo</h1>
<div class="spinner" aria-hidden="true"></div>
<button id="open" type="button" onclick="document.querySelector('aside').classList.add('open')">Open summary</button>
<aside aria-label="Summary">Totals</aside>
</body>
</html>
`;

function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

test.skipIf("skip" in found)(
  "SP9-T2 AC-4: against a real page the helpers write captures, the aria snapshot, the vitals, the reduced-motion pass, a motion sample with its strip",
  async () => {
    if ("skip" in found) return;
    const { capture, captureMotion } = (await import(MODULE)) as {
      capture: (
        page: unknown,
        p: string,
        s: string,
        o?: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
      captureMotion: (
        page: unknown,
        p: string,
        i: string,
        t: () => Promise<void>,
        o?: Record<string, unknown>,
      ) => Promise<Record<string, unknown>>;
    };
    const root = tempDir();
    const site = join(root, "site");
    mkdirSync(site);
    writeFileSync(join(site, "ignores.html"), PAGE(false));
    writeFileSync(join(site, "honours.html"), PAGE(true));
    const ui = join(root, "review", "ui");
    const previous = {
      dir: process.env.WIZARDINGCODE_CREW_UI_DIR,
      plan: process.env.WIZARDINGCODE_CREW_UI_PLAN,
    };
    process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
    delete process.env.WIZARDINGCODE_CREW_UI_PLAN;
    const page = await found.browser.newPage();
    try {
      await page.goto(pathToFileURL(join(site, "ignores.html")).href);
      const meta = await capture(page, "demo", "default");
      for (const file of [
        "demo-default@360.png",
        "demo-default@768.png",
        "demo-default@1280.png",
      ]) {
        const bytes = readFileSync(join(ui, file));
        expect(bytes.subarray(0, 4)).toEqual(PNG_SIGNATURE);
        expect(bytes.length).toBeGreaterThan(1000);
      }
      expect(readFileSync(join(ui, "demo-default.aria.yml"), "utf8")).toContain("Demo");
      const vitals = meta.vitals as Record<string, unknown>;
      expect(typeof vitals.cls).toBe("number");
      expect(typeof vitals.longTasks).toBe("number");
      const reduced = meta.reducedMotion as {
        status: string;
        running: { name: string; iterations: string | number }[];
      };
      expect(reduced.status).toBe("running");
      expect(reduced.running.some((a) => a.name === "spin" && a.iterations === "Infinity")).toBe(
        true,
      );
      expect((meta.axe as { status: string }).status).toBe("not captured");

      await page.goto(pathToFileURL(join(site, "honours.html")).href);
      const honours = await capture(page, "demo", "honours");
      expect((honours.reducedMotion as { status: string }).status).toBe("clean");

      const sample = await captureMotion(page, "demo", "open", () => page.click("#open"));
      const animations = sample.animations as {
        name: string;
        durationMs: number;
        easing: string;
        kind: string;
      }[];
      const slide = animations.find((a) => a.name === "transform");
      expect(slide).toBeDefined();
      expect(slide?.durationMs).toBe(250);
      expect(slide?.easing).toBe("cubic-bezier(0.16, 1, 0.3, 1)");
      expect(slide?.kind).toBe("CSSTransition");
      const frames = sample.frames as { method: string; count: number; strip: string; dir: string };
      expect(["cdp-screencast", "screenshots"]).toContain(frames.method);
      expect(frames.count).toBeGreaterThan(0);
      expect(readdirSync(join(ui, frames.dir)).length).toBe(frames.count);
      const strip = readFileSync(join(ui, frames.strip));
      expect(strip.subarray(0, 4)).toEqual(PNG_SIGNATURE);
      const size = pngSize(strip);
      expect(size.width).toBeGreaterThan(size.height);
      const times = sample.frameTimes as { samples: number; meanMs: number };
      expect(times.samples).toBeGreaterThan(0);
      expect(times.meanMs).toBeGreaterThan(0);
      expect(existsSync(join(ui, "demo-open.motion.json"))).toBe(true);
    } finally {
      await page.close();
      await found.browser.close();
      if (previous.dir === undefined) delete process.env.WIZARDINGCODE_CREW_UI_DIR;
      else process.env.WIZARDINGCODE_CREW_UI_DIR = previous.dir;
      if (previous.plan !== undefined) process.env.WIZARDINGCODE_CREW_UI_PLAN = previous.plan;
    }
  },
  60_000,
);
