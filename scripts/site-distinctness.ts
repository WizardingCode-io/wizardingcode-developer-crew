#!/usr/bin/env bun
// Compares built sites (item 2026-10-30-005): the six dimensions per pair and each site's proportion limits,
// measured by the crew's own probe in a real browser. Exit 0: every pair differs on at least 4 of 6, with its palette
// and its first screen, and no site breaks a limit. Exit 1: a pair too alike or a limit broken, each named. Exit 2: wrong usage, or no browser.
//   bun scripts/site-distinctness.ts <folder holding public/index.html> <folder> ... [--json]
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DIMENSIONS,
  differingDimensions,
  type Fingerprint,
  MIN_DIFFERENT,
} from "../packages/engine/src/design.ts";
import { gradeProbe, type PageProbe } from "../packages/engine/src/design-grade.ts";
// @ts-expect-error: the fixture's measure is plain JavaScript, with no declarations.
import { crewMotionInit, motionReading, pageProbe } from "../plugins/core/e2e/measure.mjs";

export interface SiteReading {
  dir: string;
  fingerprint: Fingerprint;
  offences: string[];
}
export interface Comparison {
  sites: SiteReading[];
  pairs: { a: string; b: string; differ: number; same: string[] }[];
  failed: boolean;
}

interface Page {
  addInitScript(fn: () => void): Promise<void>;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  goto(url: string): Promise<unknown>;
  evaluate(script: string): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  close(): Promise<void>;
}
interface Browser {
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

async function launch(): Promise<Browser> {
  const { chromium } = (await import("@playwright/test")) as unknown as {
    chromium: { launch(o: Record<string, unknown>): Promise<Browser> };
  };
  const reasons: string[] = [];
  for (const options of [{ channel: "chrome", headless: true }, { headless: true }]) {
    try {
      return await chromium.launch(options);
    } catch (error) {
      reasons.push(String((error as Error).message).split("\n")[0] ?? "");
    }
  }
  throw new Error(`no browser to launch (${reasons.join("; ")})`);
}

const inPage = (page: Page, fn: unknown) => page.evaluate(`(${String(fn)})(document, window)`);

async function read(browser: Browser, dir: string): Promise<SiteReading> {
  const offences: string[] = [];
  let fingerprint: Fingerprint | null = null;
  for (const [width, height] of [
    [1280, 800],
    [360, 800],
  ] as const) {
    const page = await browser.newPage();
    await page.addInitScript(crewMotionInit);
    await page.setViewportSize({ width, height });
    await page.goto(pathToFileURL(join(dir, "public", "index.html")).href);
    await page.waitForTimeout(1400);
    const total = (await page.evaluate("document.documentElement.scrollHeight")) as number;
    for (let y = 0; y < total && y < height * 11; y += height) {
      await page.evaluate(`window.scrollTo(0, ${y})`);
      await page.waitForTimeout(250);
    }
    await page.evaluate("window.scrollTo(0, 0)");
    await page.waitForTimeout(150);
    const probe = (await inPage(page, pageProbe)) as PageProbe;
    if (width === 1280) probe.motion = (await inPage(page, motionReading)) as PageProbe["motion"];
    offences.push(...gradeProbe(probe, "persuade", {}).map((o) => o.text));
    if (width === 1280 && probe.fingerprint)
      fingerprint = {
        ...probe.fingerprint,
        motion: (probe.motion?.kinds ?? []).sort().join(",") || "none",
      };
    await page.close();
  }
  if (!fingerprint) throw new Error(`${dir}: no reading`);
  return { dir, fingerprint, offences };
}

/** The readings of the sites and every pair's difference. */
export async function compareSites(dirs: string[]): Promise<Comparison> {
  const browser = await launch();
  const sites: SiteReading[] = [];
  try {
    for (const dir of dirs) sites.push(await read(browser, resolve(dir)));
  } finally {
    await browser.close();
  }
  const pairs: Comparison["pairs"] = [];
  sites.forEach((a, i) => {
    for (const b of sites.slice(i + 1))
      pairs.push({
        a: a.dir,
        b: b.dir,
        differ: differingDimensions(a.fingerprint, b.fingerprint),
        same: DIMENSIONS.filter(
          (d) => a.fingerprint[d].toLowerCase() === b.fingerprint[d].toLowerCase(),
        ),
      });
  });
  const failed =
    pairs.some((p) => p.differ < MIN_DIFFERENT) || sites.some((s) => s.offences.length > 0);
  return { sites, pairs, failed };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const dirs = args.filter((a) => a !== "--json");
  if (dirs.length < 2 || dirs.some((d) => !existsSync(join(d, "public", "index.html")))) {
    console.error(
      "usage: bun scripts/site-distinctness.ts <folder with public/index.html> <folder> ... [--json]",
    );
    process.exit(2);
  }
  try {
    const out = await compareSites(dirs);
    if (json) console.log(JSON.stringify(out, null, 1));
    else {
      for (const s of out.sites) {
        console.log(`${s.dir}\n  ${JSON.stringify(s.fingerprint)}`);
        for (const o of s.offences) console.log(`  ${o}`);
      }
      for (const p of out.pairs)
        console.log(
          `differ on ${p.differ} of 6 (same: ${p.same.join(", ") || "none"}): ${p.a} / ${p.b}`,
        );
    }
    process.exit(out.failed ? 1 : 0);
  } catch (error) {
    console.error((error as Error).message);
    process.exit(2);
  }
}
