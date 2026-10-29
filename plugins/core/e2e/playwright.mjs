// The crew's Playwright fixture (SP7 §8.3, rule 5; SP9 design §4): a `page` that records every console
// message and page error of a run into the file the e2e gate names, so the gate can fail on an error or
// a warning the browser printed, and two helpers the project's specs call to write the UI evidence the
// UI/UX gate reads: `capture()` (the screenshots per viewport and scheme, the console slice, the
// accessibility snapshot, axe, the web vitals, the reduced-motion pass) and `captureMotion()` (a motion
// sample: the frames of an interaction, one strip, the frame times, the animations, the rerun under
// reduced motion). Import `test` and `expect` from here instead of `@playwright/test`:
//
//   import { test, expect, capture, captureMotion } from "${CLAUDE_PLUGIN_ROOT}/e2e/playwright.mjs";
//
// The package is the project's own, resolved from the working directory; the engine adds nothing.
// Outside a gate run (the variables unset) the fixture records nothing, the page is the usual one, and
// the helpers return null without writing: the project's CI runs the same spec. The folder is
// `WIZARDINGCODE_CREW_UI_DIR`, else `ui/` beside `WIZARDINGCODE_CREW_E2E_DIR`; the plan of viewports and
// schemes is `WIZARDINGCODE_CREW_UI_PLAN`, validated as input before anything is written (it is the
// session's side of the engine that writes it). A helper writes files or throws: a forged or partial
// capture can fail the engine's grading and never pass it. The file names carry the page, the state and
// the interaction for a person; the engine reads them from the JSON fields of the metadata.
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import {
  appMeasures,
  brokenImages,
  fontsNotLoaded,
  hiddenText,
  measureOverflow,
  textBlocks,
} from "./measure.mjs";

const NAME = /^[a-z0-9-]+$/;
const NAME_RULE = "use [a-z0-9-]+ (the engine reads the name from the file)";
const DEFAULT_VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];
/** The width a form or a table is also captured at (`narrow: true`), the standard's 320. */
const NARROW = { name: "narrow", width: 320, height: 800 };
const SIZE_MIN = 200;
const SIZE_MAX = 4000;
const SCHEMES = ["light", "dark"];
/** The bounds per item (design §4): pages, interactions, the motion window, the frames kept, the strip. */
const PAGE_CAP = 3;
const INTERACTION_CAP = 6;
const MAX_WINDOW_MS = 3000;
const MAX_FRAMES = 48;
const STRIP_FRAMES = 8;
const STRIP_FRAME_WIDTH = 320;
/** Frames held in memory before the even choice, so a long window never grows without bound. */
const MAX_FRAMES_IN_MEMORY = 600;
const SCREENSHOT_EVERY_MS = 60;

/** The file the gate names, as lines (`.jsonl`), or null outside a gate run. */
function consoleFile() {
  const file = process.env.WIZARDINGCODE_CREW_CONSOLE_FILE;
  return file ? file.replace(/\.json$/, ".jsonl") : null;
}

/** The console of each page, kept in memory for the capture slices and written to the gate's file when named. */
const consoles = new WeakMap();

/**
 * Attaches the console listeners once per page: each event is stamped, kept for the next capture's
 * slice and, when the gate named its file, appended as one line (no read-back, so parallel workers
 * never clobber each other). A file named after the listeners exist is taken up by them.
 */
function attachConsole(page, file) {
  let state = consoles.get(page);
  if (state) {
    if (file && !state.file) state.file = file;
    return state;
  }
  state = { entries: [], cursor: 0, file };
  consoles.set(page, state);
  const push = (entry) => {
    const stamped = { ...entry, at: new Date().toISOString() };
    state.entries.push(stamped);
    if (state.file) appendFileSync(state.file, `${JSON.stringify(stamped)}\n`);
  };
  page.on("console", (msg) => push({ page: page.url(), type: msg.type(), text: msg.text() }));
  page.on("pageerror", (error) => push({ page: page.url(), type: "error", text: String(error?.message ?? error) }));
  return state;
}

/** `base.extend` with a `page` fixture that records the console into the gate's file when one is named. */
export function withConsole(base) {
  return base.extend({
    page: async ({ page }, use) => {
      const file = consoleFile();
      if (file) attachConsole(page, file);
      await use(page);
    },
  });
}

/** The project's own module, from the working directory; null when it is not installed. */
function projectModule(name) {
  try {
    return createRequire(`${process.cwd()}/`)(name);
  } catch {
    return null;
  }
}

const playwright = projectModule("@playwright/test");

/** Without the project's package the exports name what is missing when called, instead of "test is not a function" (finding 73). */
function missing() {
  throw new Error(
    "@playwright/test is not installed in this project: install it, or write the console file yourself (references/gate.md)",
  );
}

export const test = playwright ? withConsole(playwright.test) : missing;
export const expect = playwright ? playwright.expect : missing;

// The capture helpers (SP9 Task 2).

/** The evidence folder of the gate run, or null outside one. */
function uiDir() {
  const dir = process.env.WIZARDINGCODE_CREW_UI_DIR;
  if (dir) return dir;
  const e2e = process.env.WIZARDINGCODE_CREW_E2E_DIR;
  return e2e ? join(dirname(e2e), "ui") : null;
}

function checkName(which, value) {
  if (typeof value !== "string" || !NAME.test(value)) throw new Error(`${which}: ${NAME_RULE}`);
}

function planError(field, value, rule) {
  return new Error(`ui plan: ${field} ${String(value)}: ${rule}`);
}

function checkSize(field, value) {
  if (!Number.isInteger(value) || value < SIZE_MIN || value > SIZE_MAX) {
    throw planError(field, value, `an integer from ${SIZE_MIN} to ${SIZE_MAX}`);
  }
  return value;
}

/** The plan the session's side of the engine wrote, validated as input; the defaults without one. */
function readPlan() {
  const file = process.env.WIZARDINGCODE_CREW_UI_PLAN;
  if (!file) return { viewports: DEFAULT_VIEWPORTS, schemes: ["light"] };
  let raw;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw planError(file, "", `not readable as JSON (${error.message})`);
  }
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.viewports) || raw.viewports.length === 0) {
    throw planError("viewports", JSON.stringify(raw?.viewports ?? null), "a non-empty list");
  }
  const viewports = raw.viewports.map((v) => {
    if (!v || typeof v !== "object") throw planError("viewport", JSON.stringify(v), "an object");
    if (typeof v.name !== "string" || !NAME.test(v.name)) throw planError("name", v.name, "[a-z0-9-]+");
    return { name: v.name, width: checkSize("width", v.width), height: checkSize("height", v.height) };
  });
  const schemes = raw.colorSchemes === undefined ? ["light"] : raw.colorSchemes;
  if (!Array.isArray(schemes) || schemes.length === 0) {
    throw planError("colorSchemes", JSON.stringify(schemes), "light or dark");
  }
  for (const scheme of schemes) {
    if (!SCHEMES.includes(scheme)) throw planError("colorSchemes", scheme, "light or dark");
  }
  return { viewports, schemes };
}

/**
 * The viewports of one capture (design §4): the `default` state at every viewport of the plan, another
 * state at the narrowest and the widest; `narrow` adds 320; sorted by width, each width once.
 */
function viewportsFor(plan, state, narrow) {
  const sorted = [...plan.viewports].sort((a, b) => a.width - b.width);
  const chosen = state === "default" ? sorted : [sorted[0], sorted[sorted.length - 1]];
  const withNarrow = narrow ? [NARROW, ...chosen] : chosen;
  return [...new Map(withNarrow.map((v) => [v.width, v])).values()].sort((a, b) => a.width - b.width);
}

/** The JSON files of the folder that parse, with their names; what does not parse is skipped. */
function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const body = JSON.parse(readFileSync(join(dir, name), "utf8"));
      if (body && typeof body === "object") out.push({ name, body });
    } catch {
      // a foreign or half-written file: not a capture
    }
  }
  return out;
}

/** The pages already captured in the folder, read from the metadata files' fields. */
function pagesIn(dir) {
  const pages = new Set();
  for (const { name, body } of jsonFiles(dir)) {
    if (name.startsWith("console-") || name.startsWith("axe-") || name.endsWith(".motion.json")) continue;
    if (typeof body.page === "string" && typeof body.state === "string" && Array.isArray(body.viewports)) {
      pages.add(body.page);
    }
  }
  return pages;
}

/** The interactions already sampled in the folder, read from the samples' fields (`page/interaction`, never a joined name). */
function interactionsIn(dir) {
  const keys = new Set();
  for (const { name, body } of jsonFiles(dir)) {
    if (!name.endsWith(".motion.json")) continue;
    if (typeof body.page === "string" && typeof body.interaction === "string") {
      keys.add(`${body.page}/${body.interaction}`);
    }
  }
  return keys;
}

/** The pair that owns a joined name in the folder, read from its JSON file's fields; null when the name is free or unreadable. */
function ownerOf(dir, file, fields) {
  try {
    const body = JSON.parse(readFileSync(join(dir, file), "utf8"));
    if (!body || typeof body !== "object") return null;
    const owner = {};
    for (const field of fields) {
      if (typeof body[field] !== "string") return null;
      owner[field] = body[field];
    }
    return owner;
  } catch {
    return null;
  }
}

/** Refuses a joined name another pair owns (page `a-b` state `c` against page `a` state `b-c`): the files would overwrite each other. */
function checkClash(dir, name, file, pair) {
  const owner = ownerOf(dir, file, Object.keys(pair));
  if (!owner) return;
  const same = Object.keys(pair).every((field) => owner[field] === pair[field]);
  if (same) return;
  const describe = (p) =>
    Object.entries(p)
      .map(([field, value]) => `${field === "pageName" ? "page" : field} ${value}`)
      .join(" ");
  throw new Error(`name clash: ${name} is ${describe(owner)} already; ${describe(pair)} would overwrite it: rename one`);
}

async function shoot(page, selector, path) {
  const png = selector ? await page.locator(selector).screenshot() : await page.screenshot();
  writeFileSync(path, png);
}

// The scripts run in the page. Each is a named function Playwright serialises whole: nothing of the
// fixture's scope is reachable from them, and nothing of the page's input reaches the fixture's paths.

function crewVitals() {
  return new Promise((resolve) => {
    const out = { cls: 0, lcpMs: null, inpMs: null, longTasks: 0 };
    const observers = [];
    const observe = (type, onEntry) => {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) onEntry(entry);
        });
        observer.observe({ type, buffered: true });
        observers.push(observer);
      } catch {
        // the entry type is not supported here
      }
    };
    observe("layout-shift", (e) => {
      if (!e.hadRecentInput) out.cls += e.value;
    });
    observe("largest-contentful-paint", (e) => {
      out.lcpMs = Math.round(e.startTime);
    });
    observe("event", (e) => {
      if (e.interactionId && (out.inpMs === null || e.duration > out.inpMs)) out.inpMs = Math.round(e.duration);
    });
    observe("longtask", () => {
      out.longTasks += 1;
    });
    setTimeout(() => {
      for (const o of observers) o.disconnect();
      out.cls = Math.round(out.cls * 1000) / 1000;
      resolve(out);
    }, 60);
  });
}

function crewSettle() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(undefined))));
}

function crewAnimations(options) {
  const describe = (element) => {
    if (!element || !element.tagName) return String(element);
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const classes =
      typeof element.className === "string" && element.className
        ? `.${element.className.trim().split(/\s+/).join(".")}`
        : "";
    return `${tag}${id}${classes}`;
  };
  const out = [];
  for (const animation of document.getAnimations()) {
    if (options && options.onlyRunning && animation.playState !== "running") continue;
    const effect = animation.effect;
    const timing = effect && effect.getComputedTiming ? effect.getComputedTiming() : {};
    const keyframes = effect && effect.getKeyframes ? effect.getKeyframes() : [];
    const properties = new Set();
    for (const frame of keyframes) {
      for (const key of Object.keys(frame)) {
        if (!["offset", "computedOffset", "easing", "composite"].includes(key)) properties.add(key);
      }
    }
    out.push({
      target: describe(effect && effect.target),
      kind: animation.constructor ? animation.constructor.name : "Animation",
      name: animation.animationName || animation.transitionProperty || animation.id || "",
      durationMs: typeof timing.duration === "number" ? timing.duration : null,
      delayMs: typeof timing.delay === "number" ? timing.delay : 0,
      easing: typeof timing.easing === "string" ? timing.easing : "",
      iterations:
        timing.iterations === Infinity ? "Infinity" : typeof timing.iterations === "number" ? timing.iterations : 1,
      fill: typeof timing.fill === "string" ? timing.fill : "",
      properties: [...properties],
      playState: animation.playState,
    });
  }
  return out;
}

function crewRunningCount() {
  return document.getAnimations().filter((a) => a.playState === "running").length;
}

function crewFrameSamplerStart() {
  window.__crewFrames = [];
  window.__crewSampling = true;
  let last = performance.now();
  const tick = (now) => {
    window.__crewFrames.push(now - last);
    last = now;
    if (window.__crewSampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function crewFrameStats() {
  window.__crewSampling = false;
  const deltas = (window.__crewFrames || []).slice(1);
  if (deltas.length === 0) return { samples: 0, meanMs: null, p95Ms: null, maxMs: null, over50ms: 0 };
  const sorted = [...deltas].sort((a, b) => a - b);
  const round = (n) => Math.round(n * 10) / 10;
  return {
    samples: deltas.length,
    meanMs: round(deltas.reduce((a, b) => a + b, 0) / deltas.length),
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]),
    maxMs: round(sorted[sorted.length - 1]),
    over50ms: deltas.filter((d) => d > 50).length,
  };
}

function crewStrip(input) {
  const load = (src) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("frame did not load"));
      image.src = src;
    });
  return Promise.all(input.frames.map(load)).then((images) => {
    const width = input.width;
    const first = images[0];
    const height = Math.max(1, Math.round((first.naturalHeight / Math.max(1, first.naturalWidth)) * width));
    const canvas = document.createElement("canvas");
    canvas.width = width * images.length;
    canvas.height = height;
    const context = canvas.getContext("2d");
    for (const [i, image] of images.entries()) context.drawImage(image, i * width, 0, width, height);
    return canvas.toDataURL("image/png");
  });
}

/** `n` of `items`, chosen evenly from first to last; all of them when there are no more than `n`. */
function pickEvenly(items, n) {
  if (items.length <= n) return items;
  const out = [];
  for (let i = 0; i < n; i++) out.push(items[Math.round((i * (items.length - 1)) / (n - 1))]);
  return out;
}

/** The animations of the page in the sample's shape: the page's record without its play state. */
async function sampleAnimations(page, onlyRunning) {
  const list = await page.evaluate(crewAnimations, { onlyRunning });
  return (Array.isArray(list) ? list : []).map(
    ({ target, kind, name, durationMs, delayMs, easing, iterations, fill, properties }) => ({
      target,
      kind,
      name,
      durationMs,
      delayMs,
      easing,
      iterations,
      fill,
      properties,
    }),
  );
}

/** One measurement of `measure.mjs` run in the page with its `document` and `window`; null when the page cannot say. */
async function inPage(page, fn) {
  try {
    return await page.evaluate(`(${fn.toString()})(document, window)`);
  } catch {
    return null;
  }
}

/** The reduced-motion pass: what still runs under `prefers-reduced-motion: reduce`, and the text it hides (2026-10-29-001); `not captured` with the reason when the page cannot say. */
async function reducedMotionPass(page, before) {
  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(crewSettle);
    const after = await inPage(page, textBlocks);
    const hidden = Array.isArray(before) && Array.isArray(after) ? hiddenText(before, after) : null;
    const running = (await sampleAnimations(page, true)).map((a) => ({
      target: a.target,
      name: a.name,
      iterations: a.iterations,
      durationMs: a.durationMs,
      properties: a.properties,
    }));
    return { status: running.length ? "running" : "clean", running, ...(hidden ? { hidden } : {}) };
  } catch (error) {
    return { status: "not captured", reason: String(error?.message ?? error), running: [] };
  }
}

/** axe through the project's `@axe-core/playwright` when it is installed; `not captured` with the reason otherwise. */
async function runAxe(page, dir, base, wanted) {
  if (!wanted) return { status: "not captured", reason: "axe: false", file: null, violations: [] };
  const mod = projectModule("@axe-core/playwright");
  if (!mod) return { status: "not captured", reason: "@axe-core/playwright not installed", file: null, violations: [] };
  try {
    const AxeBuilder = mod.AxeBuilder ?? mod.default;
    const results = await new AxeBuilder({ page }).analyze();
    const violations = (results.violations ?? []).map((v) => ({
      id: v.id,
      impact: v.impact ?? null,
      nodes: (v.nodes ?? []).length,
      targets: (v.nodes ?? [])
        .slice(0, 3)
        .map((n) => (Array.isArray(n.target) ? n.target.join(" ") : String(n.target))),
    }));
    const file = `axe-${base}.json`;
    writeFileSync(join(dir, file), `${JSON.stringify({ violations }, null, 1)}\n`);
    return { status: violations.length ? "violations" : "clean", reason: null, file, violations };
  } catch (error) {
    return { status: "not captured", reason: String(error?.message ?? error), file: null, violations: [] };
  }
}

/**
 * One capture of a page in a state: the screenshots at the plan's viewports (the `default` state at
 * every viewport, another state at the narrowest and the widest; dark at the widest when the plan has
 * it; `narrow: true` adds 320), the console since the previous capture, the accessibility snapshot, axe
 * when the project has it, the web vitals, the reduced-motion pass, and the metadata, written last.
 * Returns the metadata, or null outside a gate run. `selector` clips the screenshots to one element.
 */
export async function capture(page, pageName, state, options = {}) {
  const dir = uiDir();
  if (!dir) return null;
  checkName("pageName", pageName);
  checkName("state", state);
  const plan = readPlan();
  const pages = pagesIn(dir);
  if (!pages.has(pageName) && pages.size >= PAGE_CAP) {
    throw new Error(
      `page cap: at most ${PAGE_CAP} pages per item (${PAGE_CAP + 1}th: ${pageName}); make a todo per page`,
    );
  }
  checkClash(dir, `${pageName}-${state}`, `${pageName}-${state}.json`, { page: pageName, state });
  const viewports = viewportsFor(plan, state, options.narrow === true);
  const widest = viewports[viewports.length - 1];
  const dark = plan.schemes.includes("dark");
  const selector = typeof options.selector === "string" && options.selector ? options.selector : null;
  mkdirSync(dir, { recursive: true });
  const base = `${pageName}-${state}`;
  const log = attachConsole(page, consoleFile());
  const original = page.viewportSize();
  const shots = [];
  let app = null;
  try {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.emulateMedia({ colorScheme: "light" });
      const light = `${base}@${viewport.width}.png`;
      await shoot(page, selector, join(dir, light));
      // The overflow at this width and, at the narrowest, the app measures (2026-10-29-001, P-1, P-3).
      const overflow = await inPage(page, measureOverflow);
      if (viewport === viewports[0]) app = await inPage(page, appMeasures);
      let darkFile = null;
      if (dark && viewport === widest) {
        await page.emulateMedia({ colorScheme: "dark" });
        darkFile = `${base}@${viewport.width}-dark.png`;
        await shoot(page, selector, join(dir, darkFile));
      }
      shots.push({
        name: viewport.name,
        width: viewport.width,
        height: viewport.height,
        light,
        dark: darkFile,
        ...(overflow ? { overflow } : {}),
      });
    }
    const entries = log.entries.slice(log.cursor);
    log.cursor = log.entries.length;
    const consoleName = `console-${base}.json`;
    writeFileSync(join(dir, consoleName), JSON.stringify(entries));
    let aria = null;
    try {
      const snapshot = await page.locator("body").ariaSnapshot();
      aria = `${base}.aria.yml`;
      writeFileSync(join(dir, aria), `${snapshot}\n`);
    } catch {
      aria = null;
    }
    const axe = await runAxe(page, dir, base, options.axe !== false);
    let vitals;
    try {
      vitals = await page.evaluate(crewVitals);
    } catch {
      vitals = { cls: null, lcpMs: null, inpMs: null, longTasks: null };
    }
    // The page's images and fonts (2026-10-29-001, P-1), then the first reading of the text blocks
    // the reduced-motion pass compares.
    const images = await inPage(page, brokenImages);
    const fonts = await inPage(page, fontsNotLoaded);
    const before = await inPage(page, textBlocks);
    const reducedMotion = await reducedMotionPass(page, before);
    const meta = {
      page: pageName,
      state,
      url: page.url(),
      at: new Date().toISOString(),
      by: "fixture",
      viewports: shots,
      console: consoleName,
      aria,
      axe,
      vitals,
      reducedMotion,
      ...(images ? { images } : {}),
      ...(fonts ? { fonts } : {}),
      ...(app ? { app } : {}),
    };
    writeFileSync(join(dir, `${base}.json`), `${JSON.stringify(meta, null, 1)}\n`);
    return meta;
  } finally {
    if (original) await page.setViewportSize(original);
    await page.emulateMedia({ colorScheme: null, reducedMotion: null });
  }
}

/**
 * The frames of an interaction: a CDP screencast on Chromium, sequential screenshots elsewhere. Frames
 * land in `frames` with their time from the first; `stop()` ends the source. The screenshots source
 * takes one frame before the trigger and one at the end, so a short window still has frames.
 */
async function frameSource(page, frames, begun) {
  let firstStamp = null;
  let session = null;
  try {
    session = await page.context().newCDPSession(page);
    session.on("Page.screencastFrame", (event) => {
      const stamp = typeof event.metadata?.timestamp === "number" ? event.metadata.timestamp * 1000 : Date.now();
      if (firstStamp === null) firstStamp = stamp;
      if (frames.length < MAX_FRAMES_IN_MEMORY) {
        frames.push({ data: Buffer.from(event.data, "base64"), t: stamp - firstStamp });
      }
      Promise.resolve(session.send("Page.screencastFrameAck", { sessionId: event.sessionId })).catch(() => {});
    });
    await session.send("Page.startScreencast", { format: "png", maxWidth: 640, maxHeight: 640, everyNthFrame: 1 });
    return {
      method: "cdp-screencast",
      stop: async () => {
        await Promise.resolve(session.send("Page.stopScreencast")).catch(() => {});
        if (typeof session.detach === "function") await Promise.resolve(session.detach()).catch(() => {});
      },
    };
  } catch {
    // not Chromium, or no CDP: sequential screenshots; a session that opened and then failed is let go
    if (session && typeof session.detach === "function") await Promise.resolve(session.detach()).catch(() => {});
    session = null;
  }
  let stopped = false;
  const shot = async () => frames.push({ data: await page.screenshot(), t: Date.now() - begun });
  await shot();
  const shooting = (async () => {
    while (!stopped && frames.length < MAX_FRAMES_IN_MEMORY) {
      await page.waitForTimeout(SCREENSHOT_EVERY_MS);
      if (stopped) break;
      await shot();
    }
  })();
  return {
    method: "screenshots",
    stop: async () => {
      stopped = true;
      await shooting.catch(() => {});
      await shot();
    },
  };
}

/** The strip of eight frames, composed on a canvas in the page; null with the reason when the page cannot compose it. */
async function writeStrip(page, dir, key, kept) {
  try {
    const chosen = pickEvenly(kept, STRIP_FRAMES).map((f) => `data:image/png;base64,${f.data.toString("base64")}`);
    const dataUrl = await page.evaluate(crewStrip, { frames: chosen, width: STRIP_FRAME_WIDTH });
    const comma = String(dataUrl).indexOf(",");
    if (comma < 0) throw new Error("the strip is not a data URL");
    const strip = `${key}.strip.png`;
    writeFileSync(join(dir, strip), Buffer.from(String(dataUrl).slice(comma + 1), "base64"));
    return { strip, stripReason: null };
  } catch (error) {
    return { strip: null, stripReason: String(error?.message ?? error) };
  }
}

/** The animations sampled at +0 and +100 ms after the trigger, merged by target, kind and name (the later sample wins). */
async function animationsAfter(page) {
  const first = await sampleAnimations(page, false);
  await page.waitForTimeout(100);
  const second = await sampleAnimations(page, false);
  const merged = new Map();
  for (const a of [...first, ...second]) merged.set(`${a.target}|${a.kind}|${a.name}`, a);
  return [...merged.values()];
}

/** Waits until the window ends or no animation runs. */
async function settleWindow(page, begun, windowMs) {
  while (Date.now() - begun < windowMs) {
    await page.waitForTimeout(100);
    let running = 1;
    try {
      running = await page.evaluate(crewRunningCount);
    } catch {
      running = 0;
    }
    if (running === 0) break;
  }
}

/** The rerun under reduced motion when `reset` is given: the page reset, the media emulated, the trigger again, the animations sampled. */
async function reducedMotionRerun(page, trigger, reset) {
  if (typeof reset !== "function") return { status: "not captured", reason: "no reset given", animations: [] };
  try {
    await reset();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await trigger();
    await page.waitForTimeout(100);
    const rerun = await sampleAnimations(page, false);
    return { status: rerun.length ? "running" : "clean", reason: null, animations: rerun };
  } catch (error) {
    return { status: "not captured", reason: String(error?.message ?? error), animations: [] };
  } finally {
    await page.emulateMedia({ reducedMotion: null });
  }
}

/**
 * One motion sample: the frames of an interaction, the frame times of the page, the animations at +0
 * and +100 ms after the trigger, one strip of eight frames among the kept ones, and the rerun under
 * reduced motion when `reset` is given. Returns the sample, or null outside a gate run; `windowMs` is
 * at most 3000; at most 48 frames are kept, chosen evenly; the sample is written last.
 */
export async function captureMotion(page, pageName, interaction, trigger, options = {}) {
  const dir = uiDir();
  if (!dir) return null;
  checkName("pageName", pageName);
  checkName("interaction", interaction);
  const windowMs = options.windowMs ?? 1000;
  if (!Number.isFinite(windowMs) || windowMs <= 0) throw new Error("windowMs: a positive number of milliseconds");
  if (windowMs > MAX_WINDOW_MS) {
    throw new Error(`windowMs: at most ${MAX_WINDOW_MS} ms (the standard's rare moment, 800 ms, with margin)`);
  }
  if (typeof trigger !== "function") throw new Error("trigger: a function that performs the interaction");
  const key = `${pageName}-${interaction}`;
  const seen = interactionsIn(dir);
  if (!seen.has(`${pageName}/${interaction}`) && seen.size >= INTERACTION_CAP) {
    throw new Error(
      `interaction cap: at most ${INTERACTION_CAP} interactions per item (${INTERACTION_CAP + 1}th: ${key})`,
    );
  }
  checkClash(dir, key, `${key}.motion.json`, { page: pageName, interaction });
  const framesDir = join(dir, "motion", key);
  mkdirSync(framesDir, { recursive: true });
  try {
    await page.evaluate(crewFrameSamplerStart);
  } catch {
    // no sampler: the stats say 0 samples
  }
  const frames = [];
  const begun = Date.now();
  const source = await frameSource(page, frames, begun);
  let animations;
  try {
    await trigger();
    animations = await animationsAfter(page);
    await settleWindow(page, begun, windowMs);
  } finally {
    await source.stop();
  }
  let frameTimes;
  try {
    frameTimes = await page.evaluate(crewFrameStats);
  } catch {
    frameTimes = { samples: 0, meanMs: null, p95Ms: null, maxMs: null, over50ms: 0 };
  }
  const kept = pickEvenly(frames, MAX_FRAMES);
  for (const [i, frame] of kept.entries()) {
    writeFileSync(join(framesDir, `${String(i).padStart(2, "0")}.png`), frame.data);
  }
  const { strip, stripReason } = await writeStrip(page, dir, key, kept);
  const reducedMotion = await reducedMotionRerun(page, trigger, options.reset);
  const sample = {
    page: pageName,
    interaction,
    at: new Date().toISOString(),
    windowMs,
    frames: {
      method: source.method,
      dir: `motion/${key}`,
      strip,
      ...(stripReason ? { stripReason } : {}),
      count: kept.length,
      times: kept.map((f) => Math.round(f.t)),
    },
    frameTimes,
    animations,
    reducedMotion,
  };
  writeFileSync(join(dir, `${key}.motion.json`), `${JSON.stringify(sample, null, 1)}\n`);
  return sample;
}
