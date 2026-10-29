// The capture helpers of the crew's Playwright fixture (SP9 Task 2, design §4), against a page stub
// that records what the fixture asks of it: the viewports, the media, the screenshots, the scripts.
// The stub answers each in-page script by the name the fixture gives it (crewVitals, crewAnimations,
// crewStrip, ...): a rename of one of those private functions fails here without a behaviour change,
// a coupling accepted because the scripts have no caller-visible name of their own.
import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./helpers.ts";

const MODULE = new URL("../../../plugins/core/e2e/playwright.mjs", import.meta.url).href;

/** A 1x1 PNG, the bytes every fake screenshot returns; a screencast frame appends its index, so each differs. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PNG_DATA_URL = `data:image/png;base64,${PNG.toString("base64")}`;

function frameBytes(i: number): Buffer {
  return Buffer.concat([PNG, Buffer.from([i & 0xff, (i >> 8) & 0xff])]);
}

type Handler = (arg: unknown) => void;

interface Animation {
  target: string;
  kind: string;
  name: string;
  durationMs: number;
  delayMs: number;
  easing: string;
  iterations: number | "Infinity";
  fill: string;
  properties: string[];
}

interface Running {
  target: string;
  name: string;
  iterations: number | "Infinity";
  durationMs: number;
  properties: string[];
}

interface Options {
  /** The animations `document.getAnimations()` reports with the media as the page has it. */
  animations?: Animation[];
  /** One answer per call of the animations script with the media as the page has it, in order; `animations` after the last. */
  animationSamples?: Animation[][];
  /** The animations still running under `prefers-reduced-motion: reduce`. */
  runningUnderReduce?: Running[];
  /** A CDP session that emits this many screencast frames; absent, `newCDPSession` throws. */
  cdpFrames?: number;
  /** The screenshot that throws, by index of the call (0-based); -1 for none. */
  screenshotThrowsAt?: number;
  /** The strip composition fails in the page. */
  stripFails?: boolean;
  /** The answers of `measure.mjs`'s functions by name (2026-10-29-001); absent, each throws and its field is absent. */
  measures?: {
    overflow?: unknown[];
    images?: unknown;
    fonts?: unknown;
    app?: unknown;
    blocks?: unknown[];
  };
}

interface Shot {
  width: number;
  height: number;
  scheme: string | null;
  reduced: string | null;
  selector: string | null;
}

/** The page as the fixture sees it: viewports, media, screenshots, scripts, the console handlers. */
function fakePage(options: Options = {}) {
  const handlers = new Map<string, Handler>();
  const shots: Shot[] = [];
  const media: Record<string, string | null>[] = [];
  const viewports: { width: number; height: number }[] = [];
  const stripArgs: string[][] = [];
  const waits: number[] = [];
  let viewport = { width: 1024, height: 768 };
  let scheme: string | null = null;
  let reduced: string | null = null;
  let screenshotCalls = 0;
  let animationCalls = 0;
  const evaluated: string[] = [];
  const screenshot = async (selector: string | null) => {
    if (screenshotCalls++ === (options.screenshotThrowsAt ?? -1))
      throw new Error("screenshot failed");
    shots.push({ ...viewport, scheme, reduced, selector });
    return PNG;
  };
  const session = {
    handlers: new Map<string, Handler>(),
    on(event: string, h: Handler) {
      this.handlers.set(event, h);
    },
    async send(method: string) {
      if (method === "Page.startScreencast") {
        const h = this.handlers.get("Page.screencastFrame");
        for (let i = 0; i < (options.cdpFrames ?? 0); i++) {
          h?.({
            data: frameBytes(i).toString("base64"),
            metadata: { timestamp: 1000 + i * 0.016 },
            sessionId: i,
          });
        }
      }
      return {};
    },
    async detach() {},
  };
  const page = {
    on: (event: string, h: Handler) => handlers.set(event, h),
    url: () => "http://localhost:3000/checkout",
    viewportSize: () => viewport,
    setViewportSize: async (v: { width: number; height: number }) => {
      viewport = v;
      viewports.push(v);
    },
    emulateMedia: async (o: { colorScheme?: string | null; reducedMotion?: string | null }) => {
      if ("colorScheme" in o) scheme = o.colorScheme ?? null;
      if ("reducedMotion" in o) reduced = o.reducedMotion ?? null;
      media.push({ ...o });
    },
    screenshot: async () => screenshot(null),
    locator: (selector: string) => ({
      ariaSnapshot: async () => '- heading "Checkout" [level=1]\n- button "Pay"',
      screenshot: async () => screenshot(selector),
    }),
    context: () => ({
      newCDPSession: async () => {
        if (options.cdpFrames === undefined) throw new Error("Protocol error: CDP unavailable");
        return session;
      },
    }),
    waitForTimeout: async (ms: number) => {
      waits.push(ms);
    },
    evaluate: async (fn: unknown, arg?: unknown) => {
      const src = String(fn);
      evaluated.push(src.slice(0, 40));
      if (src.includes("crewVitals")) return { cls: 0.02, lcpMs: 820, inpMs: null, longTasks: 0 };
      if (src.includes("crewAnimations")) {
        if (reduced === "reduce") return options.runningUnderReduce ?? [];
        const sample = options.animationSamples?.[animationCalls++];
        return sample ?? options.animations ?? [];
      }
      if (src.includes("crewRunningCount")) return 0;
      if (src.includes("crewFrameSamplerStart")) return undefined;
      if (src.includes("crewFrameStats"))
        return { samples: 36, meanMs: 16.8, p95Ms: 21, maxMs: 48, over50ms: 0 };
      if (src.includes("crewStrip")) {
        if (options.stripFails) throw new Error("canvas unavailable");
        stripArgs.push([...((arg as { frames: string[] }).frames ?? [])]);
        return PNG_DATA_URL;
      }
      if (src.includes("crewSettle")) return undefined;
      // The measurements of measure.mjs, by their function's name, in the order the fixture asks.
      const m = options.measures;
      if (m && src.includes("function measureOverflow")) return m.overflow?.shift() ?? null;
      if (m && src.includes("function brokenImages")) return m.images;
      if (m && src.includes("function fontsNotLoaded")) return m.fonts;
      if (m && src.includes("function appMeasures")) return m.app;
      if (m && src.includes("function textBlocks")) return m.blocks?.shift() ?? null;
      throw new Error(`unexpected evaluate: ${src.slice(0, 60)}`);
    },
  };
  return { page, handlers, shots, media, viewports, evaluated, stripArgs, waits };
}

interface Helpers {
  capture: (
    page: unknown,
    pageName: string,
    state: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
  captureMotion: (
    page: unknown,
    pageName: string,
    interaction: string,
    trigger: () => Promise<void> | void,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
}

const VARIABLES = [
  "WIZARDINGCODE_CREW_UI_DIR",
  "WIZARDINGCODE_CREW_UI_PLAN",
  "WIZARDINGCODE_CREW_E2E_DIR",
] as const;
const saved: Partial<Record<(typeof VARIABLES)[number], string | undefined>> = {};

beforeEach(() => {
  for (const name of VARIABLES) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});

afterEach(() => {
  for (const name of VARIABLES) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

async function helpers(): Promise<Helpers> {
  return (await import(MODULE)) as unknown as Helpers;
}

function plan(dir: string, body: unknown): string {
  const file = join(dir, "ui-plan.json");
  writeFileSync(file, JSON.stringify(body));
  return file;
}

const THREE = {
  viewports: [
    { name: "mobile", width: 360, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
  ],
  colorSchemes: ["light", "dark"],
  screens: [],
};

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

const SLIDE: Animation = {
  target: "aside.summary",
  kind: "CSSTransition",
  name: "transform",
  durationMs: 250,
  delayMs: 0,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
  iterations: 1,
  fill: "none",
  properties: ["transform", "opacity"],
};

const FADE: Animation = {
  ...SLIDE,
  target: "div.backdrop",
  name: "opacity",
  durationMs: 200,
  properties: ["opacity"],
};

test("SP9-T2 AC-1: capture() writes the screenshots per viewport and scheme, the console since the previous capture, the aria snapshot, axe or not captured, the vitals, the reduced-motion pass and the metadata last", async () => {
  const { capture } = await helpers();
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  process.env.WIZARDINGCODE_CREW_UI_PLAN = plan(root, THREE);
  const fake = fakePage({
    runningUnderReduce: [
      {
        target: "div.spinner",
        name: "spin",
        iterations: "Infinity",
        durationMs: 1000,
        properties: ["transform"],
      },
    ],
  });
  const meta = (await capture(fake.page, "checkout", "default")) as Record<string, unknown>;
  // Two console entries after the first capture: the next capture's slice, whatever its state.
  fake.handlers.get("console")?.({ type: () => "log", text: () => "loaded" });
  fake.handlers.get("pageerror")?.(new Error("boom"));
  await capture(fake.page, "checkout", "error");
  const files = readdirSync(ui).sort();
  expect(files).toEqual(
    [
      "checkout-default.aria.yml",
      "checkout-default.json",
      "checkout-default@1280-dark.png",
      "checkout-default@1280.png",
      "checkout-default@360.png",
      "checkout-default@768.png",
      "console-checkout-default.json",
      "checkout-error.aria.yml",
      "checkout-error.json",
      "checkout-error@1280-dark.png",
      "checkout-error@1280.png",
      "checkout-error@360.png",
      "console-checkout-error.json",
    ].sort(),
  );
  expect(readFileSync(join(ui, "checkout-default@360.png")).subarray(0, 4)).toEqual(
    PNG.subarray(0, 4),
  );
  expect(readFileSync(join(ui, "checkout-default.aria.yml"), "utf8")).toContain(
    'heading "Checkout"',
  );
  expect(JSON.parse(readFileSync(join(ui, "console-checkout-default.json"), "utf8"))).toEqual([]);
  const slice = JSON.parse(readFileSync(join(ui, "console-checkout-error.json"), "utf8")) as Record<
    string,
    unknown
  >[];
  expect(slice).toMatchObject([
    { page: "http://localhost:3000/checkout", type: "log", text: "loaded" },
    { page: "http://localhost:3000/checkout", type: "error", text: "boom" },
  ]);
  expect(typeof slice[0]?.at).toBe("string");
  const written = readJson(join(ui, "checkout-default.json"));
  expect(written).toEqual(meta);
  expect(written).toMatchObject({
    page: "checkout",
    state: "default",
    url: "http://localhost:3000/checkout",
    by: "fixture",
    console: "console-checkout-default.json",
    aria: "checkout-default.aria.yml",
    viewports: [
      { name: "mobile", width: 360, height: 800, light: "checkout-default@360.png", dark: null },
      { name: "tablet", width: 768, height: 1024, light: "checkout-default@768.png", dark: null },
      {
        name: "desktop",
        width: 1280,
        height: 800,
        light: "checkout-default@1280.png",
        dark: "checkout-default@1280-dark.png",
      },
    ],
    axe: {
      status: "not captured",
      reason: "@axe-core/playwright not installed",
      file: null,
      violations: [],
    },
    vitals: { cls: 0.02, lcpMs: 820, inpMs: null, longTasks: 0 },
    reducedMotion: {
      status: "running",
      running: [
        {
          target: "div.spinner",
          name: "spin",
          iterations: "Infinity",
          durationMs: 1000,
          properties: ["transform"],
        },
      ],
    },
  });
  expect(typeof written.at).toBe("string");
  // The light shots at the three widths, the dark one at the widest only; the media and the viewport restored after.
  expect(
    fake.shots.slice(0, 4).map((s) => `${s.width}${s.scheme === "dark" ? "-dark" : ""}`),
  ).toEqual(["360", "768", "1280", "1280-dark"]);
  expect(fake.media.at(-1)).toMatchObject({ colorScheme: null, reducedMotion: null });
  expect(fake.page.viewportSize()).toEqual({ width: 1024, height: 768 });
  // The metadata is written last: a screenshot that fails leaves no metadata behind.
  const failing = fakePage({ screenshotThrowsAt: 2 });
  const ui2 = join(root, "review2", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui2;
  await expect(capture(failing.page, "checkout", "error")).rejects.toThrow("screenshot failed");
  expect(existsSync(join(ui2, "checkout-error.json"))).toBe(false);
  expect(existsSync(join(ui2, "checkout-error@360.png"))).toBe(true);
});

test("SP9-T2 AC-1: with the project's @axe-core/playwright the violations are written to axe-<page>-<state>.json and summarised in the metadata", async () => {
  const { capture } = await helpers();
  const root = tempDir();
  const project = join(root, "project");
  const pkg = join(project, "node_modules", "@axe-core", "playwright");
  mkdirSync(pkg, { recursive: true });
  writeFileSync(
    join(pkg, "package.json"),
    JSON.stringify({ name: "@axe-core/playwright", version: "0.0.0", main: "index.js" }),
  );
  writeFileSync(
    join(pkg, "index.js"),
    [
      "class AxeBuilder {",
      "  constructor(options) { this.page = options.page; }",
      "  async analyze() {",
      "    if (!this.page) throw new Error('no page');",
      "    return { violations: [",
      "      { id: 'color-contrast', impact: 'serious', nodes: [{ target: ['button.pay'] }, { target: ['a.help'] }] },",
      "      { id: 'label', impact: 'critical', nodes: [{ target: ['input#email'] }] },",
      "    ] };",
      "  }",
      "}",
      "module.exports = { AxeBuilder };",
    ].join("\n"),
  );
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  const fake = fakePage();
  const cwd = process.cwd();
  let meta: Record<string, unknown>;
  try {
    process.chdir(project);
    meta = (await capture(fake.page, "checkout", "default")) as Record<string, unknown>;
  } finally {
    process.chdir(cwd);
  }
  const expected = [
    { id: "color-contrast", impact: "serious", nodes: 2, targets: ["button.pay", "a.help"] },
    { id: "label", impact: "critical", nodes: 1, targets: ["input#email"] },
  ];
  expect(meta.axe).toEqual({
    status: "violations",
    reason: null,
    file: "axe-checkout-default.json",
    violations: expected,
  });
  expect(readJson(join(ui, "axe-checkout-default.json"))).toEqual({ violations: expected });
});

test("SP9-T2 AC-1: without a plan the defaults are three viewports in light, and the ui folder beside the e2e folder is taken, with what it already holds", async () => {
  const { capture } = await helpers();
  const root = tempDir();
  const e2e = join(root, "review", "e2e");
  const ui = join(root, "review", "ui");
  mkdirSync(e2e, { recursive: true });
  mkdirSync(ui, { recursive: true });
  // Another page's capture already there, as a session's own or an earlier spec's, stays and counts.
  writeFileSync(
    join(ui, "other-default.json"),
    JSON.stringify({ page: "other", state: "default", viewports: [], by: "session" }),
  );
  process.env.WIZARDINGCODE_CREW_E2E_DIR = e2e;
  const fake = fakePage();
  const meta = (await capture(fake.page, "inbox", "default")) as Record<string, unknown>;
  expect(
    readdirSync(ui)
      .filter((f) => f.endsWith(".png"))
      .sort(),
  ).toEqual(["inbox-default@1280.png", "inbox-default@360.png", "inbox-default@768.png"]);
  expect(existsSync(join(ui, "other-default.json"))).toBe(true);
  // The pre-seeded page counts toward the cap: two more pages fill it, a fourth is refused.
  await capture(fake.page, "checkout", "default");
  await expect(capture(fake.page, "profile", "default")).rejects.toThrow(
    "page cap: at most 3 pages per item (4th: profile)",
  );
  expect(meta.viewports).toMatchObject([
    { name: "mobile", width: 360, height: 800, dark: null },
    { name: "tablet", width: 768, height: 1024, dark: null },
    { name: "desktop", width: 1280, height: 800, dark: null },
  ]);
  expect((meta.reducedMotion as Record<string, unknown>).status).toBe("clean");
});

test("SP9-T2 AC-2: captureMotion() writes the sample with the frames, the frame times, the animations of both samples merged, the strip and the reduced-motion rerun only with reset", async () => {
  const { captureMotion } = await helpers();
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  // The first sample sees the slide alone, the second the slide and a fade that started later: both are kept.
  const fake = fakePage({
    cdpFrames: 10,
    animationSamples: [[SLIDE], [SLIDE, FADE]],
    runningUnderReduce: [],
  });
  let triggered = 0;
  const sample = (await captureMotion(fake.page, "checkout", "open-summary", async () => {
    triggered++;
  })) as Record<string, unknown>;
  expect(triggered).toBe(1);
  // The second sample is taken 100 ms after the first.
  expect(fake.waits).toContain(100);
  const frames = readdirSync(join(ui, "motion", "checkout-open-summary")).sort();
  expect(frames).toEqual(Array.from({ length: 10 }, (_, i) => `${String(i).padStart(2, "0")}.png`));
  expect(existsSync(join(ui, "checkout-open-summary.strip.png"))).toBe(true);
  const written = readJson(join(ui, "checkout-open-summary.motion.json"));
  expect(written).toEqual(sample);
  expect(written).toMatchObject({
    page: "checkout",
    interaction: "open-summary",
    windowMs: 1000,
    frames: {
      method: "cdp-screencast",
      dir: "motion/checkout-open-summary",
      strip: "checkout-open-summary.strip.png",
      count: 10,
    },
    frameTimes: { samples: 36, meanMs: 16.8, p95Ms: 21, maxMs: 48, over50ms: 0 },
    animations: [SLIDE, FADE],
    reducedMotion: { status: "not captured", reason: "no reset given", animations: [] },
  });
  const times = (written.frames as { times: number[] }).times;
  expect(times.length).toBe(10);
  expect(times[0]).toBe(0);
  expect([...times].sort((a, b) => a - b)).toEqual(times);
  expect(typeof written.at).toBe("string");
  // With reset: the rerun under reduced motion, clean here, and the media restored after.
  let resets = 0;
  const withReset = (await captureMotion(
    fake.page,
    "checkout",
    "close-summary",
    async () => {
      triggered++;
    },
    {
      reset: async () => {
        resets++;
      },
    },
  )) as Record<string, unknown>;
  expect(resets).toBe(1);
  expect(triggered).toBe(3);
  expect(withReset.reducedMotion).toEqual({ status: "clean", reason: null, animations: [] });
  expect(fake.media.at(-1)).toMatchObject({ reducedMotion: null });
  // Without CDP the frames are sequential screenshots.
  const plain = fakePage({ animations: [SLIDE] });
  const shots = (await captureMotion(plain.page, "checkout", "hover-row", async () => {}, {
    windowMs: 200,
  })) as Record<string, unknown>;
  expect((shots.frames as { method: string; count: number }).method).toBe("screenshots");
  expect((shots.frames as { count: number }).count).toBeGreaterThan(0);
  // The sample is written last: a trigger that throws leaves no sample.
  const broken = fakePage({ cdpFrames: 3 });
  await expect(
    captureMotion(broken.page, "checkout", "broken", async () => {
      throw new Error("trigger failed");
    }),
  ).rejects.toThrow("trigger failed");
  expect(existsSync(join(ui, "checkout-broken.motion.json"))).toBe(false);
});

test("SP9-T2 AC-3: outside a gate run the helpers return null and write nothing; a bad name is refused naming the rule; the matrix bounds the images per state", async () => {
  const { capture, captureMotion } = await helpers();
  const fake = fakePage({ cdpFrames: 2 });
  expect(await capture(fake.page, "checkout", "default")).toBeNull();
  expect(await captureMotion(fake.page, "checkout", "open", async () => {})).toBeNull();
  expect(fake.shots.length).toBe(0);
  expect(fake.evaluated.length).toBe(0);
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  process.env.WIZARDINGCODE_CREW_UI_PLAN = plan(root, THREE);
  const rule = "use [a-z0-9-]+ (the engine reads the name from the file)";
  await expect(capture(fake.page, "Checkout", "default")).rejects.toThrow(`pageName: ${rule}`);
  await expect(capture(fake.page, "checkout", "../x")).rejects.toThrow(`state: ${rule}`);
  await expect(
    captureMotion(fake.page, "checkout", "open summary", async () => {}),
  ).rejects.toThrow(`interaction: ${rule}`);
  expect(existsSync(ui)).toBe(false);
  // The default state at every viewport (dark at the widest); another state at the narrowest and the widest.
  await capture(fake.page, "checkout", "default");
  await capture(fake.page, "checkout", "error");
  const pngs = readdirSync(ui)
    .filter((f) => f.endsWith(".png"))
    .sort();
  expect(pngs).toEqual(
    [
      "checkout-default@360.png",
      "checkout-default@768.png",
      "checkout-default@1280.png",
      "checkout-default@1280-dark.png",
      "checkout-error@360.png",
      "checkout-error@1280.png",
      "checkout-error@1280-dark.png",
    ].sort(),
  );
  // narrow adds 320 to that capture's viewports.
  await capture(fake.page, "checkout", "empty", { narrow: true });
  expect(
    readdirSync(ui)
      .filter((f) => f.startsWith("checkout-empty@"))
      .sort(),
  ).toEqual(
    [
      "checkout-empty@320.png",
      "checkout-empty@360.png",
      "checkout-empty@1280.png",
      "checkout-empty@1280-dark.png",
    ].sort(),
  );
  const meta = readJson(join(ui, "checkout-empty.json"));
  expect((meta.viewports as { width: number }[]).map((v) => v.width)).toEqual([320, 360, 1280]);
});

test("SP9-T2 AC-6: selector clips every screenshot of the capture; windowMs above 3000 is refused before anything is written; at most 48 frames are kept, chosen evenly, the strip's eight among them", async () => {
  const { capture, captureMotion } = await helpers();
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  process.env.WIZARDINGCODE_CREW_UI_PLAN = plan(root, THREE);
  const fake = fakePage({ cdpFrames: 200 });
  await capture(fake.page, "checkout", "default", { selector: "dialog.summary" });
  expect(fake.shots.length).toBe(4);
  expect(fake.shots.every((s) => s.selector === "dialog.summary")).toBe(true);
  expect(existsSync(join(ui, "checkout-default@1280-dark.png"))).toBe(true);
  await expect(
    captureMotion(fake.page, "checkout", "long", async () => {}, { windowMs: 3001 }),
  ).rejects.toThrow("windowMs: at most 3000 ms (the standard's rare moment, 800 ms, with margin)");
  expect(existsSync(join(ui, "motion", "checkout-long"))).toBe(false);
  expect(existsSync(join(ui, "checkout-long.motion.json"))).toBe(false);
  const sample = (await captureMotion(fake.page, "checkout", "open", async () => {}, {
    windowMs: 3000,
  })) as Record<string, unknown>;
  const frames = sample.frames as { count: number; times: number[] };
  expect(frames.count).toBe(48);
  const dir = join(ui, "motion", "checkout-open");
  const names = readdirSync(dir).sort();
  expect(names.length).toBe(48);
  // Chosen evenly across the 200 that arrived: the first and the last are kept, and the gaps are four or five frames of 16 ms.
  expect(frames.times[0]).toBe(0);
  expect(frames.times.at(-1)).toBe(199 * 16);
  const gaps = frames.times.slice(1).map((t, i) => t - (frames.times[i] ?? 0));
  expect(gaps.every((g) => g === 64 || g === 80)).toBe(true);
  expect(readFileSync(join(dir, "00.png")).toString("base64")).toBe(
    frameBytes(0).toString("base64"),
  );
  expect(readFileSync(join(dir, "47.png")).toString("base64")).toBe(
    frameBytes(199).toString("base64"),
  );
  // The strip's eight frames are among the 48 written, from the first to the last.
  const written = new Set(names.map((n) => readFileSync(join(dir, n)).toString("base64")));
  const strip = fake.stripArgs.at(-1) ?? [];
  expect(strip.length).toBe(8);
  const payloads = strip.map((url) => url.slice(url.indexOf(",") + 1));
  expect(payloads.every((p) => written.has(p))).toBe(true);
  expect(payloads[0]).toBe(frameBytes(0).toString("base64"));
  expect(payloads[7]).toBe(frameBytes(199).toString("base64"));
});

test("SP9-T2 AC-7: the plan file is validated before anything is written, and every output path is built from validated segments under the ui folder", async () => {
  const { capture } = await helpers();
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  const fake = fakePage();
  const hostile: [unknown, string][] = [
    [
      { viewports: [{ name: "mobile", width: "../../x", height: 800 }], colorSchemes: ["light"] },
      "ui plan: width ../../x: an integer from 200 to 4000",
    ],
    [
      { viewports: [{ name: "a/b", width: 360, height: 800 }], colorSchemes: ["light"] },
      "ui plan: name a/b: [a-z0-9-]+",
    ],
    [
      { viewports: [{ name: "mobile", width: 360, height: 10 }], colorSchemes: ["light"] },
      "ui plan: height 10: an integer from 200 to 4000",
    ],
    [
      { viewports: [{ name: "mobile", width: 360, height: 800 }], colorSchemes: ["blue"] },
      "ui plan: colorSchemes blue: light or dark",
    ],
  ];
  for (const [body, message] of hostile) {
    process.env.WIZARDINGCODE_CREW_UI_PLAN = plan(root, body);
    await expect(capture(fake.page, "checkout", "default")).rejects.toThrow(message);
  }
  expect(existsSync(ui)).toBe(false);
  expect(readdirSync(root).sort()).toEqual(["ui-plan.json"]);
  // A plan that parses as nothing usable is refused too.
  writeFileSync(join(root, "ui-plan.json"), "not json");
  await expect(capture(fake.page, "checkout", "default")).rejects.toThrow("ui plan: ");
  // A good plan: the missing folder is created, recursively.
  process.env.WIZARDINGCODE_CREW_UI_PLAN = plan(root, THREE);
  const deep = join(root, "a", "b", "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = deep;
  await capture(fake.page, "checkout", "default");
  expect(existsSync(join(deep, "checkout-default.json"))).toBe(true);
  expect(fake.shots.length).toBe(4);
});

test("SP9-T2 AC-8: the fourth page or the seventh interaction of an item is refused naming the cap, with nothing written; foreign files in the folder are skipped", async () => {
  const { capture, captureMotion } = await helpers();
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  const fake = fakePage({ cdpFrames: 2 });
  mkdirSync(ui, { recursive: true });
  writeFileSync(join(ui, "junk.json"), "{not json");
  writeFileSync(join(ui, "notes.json"), JSON.stringify({ unrelated: true }));
  for (const page of ["inbox", "checkout", "profile"]) await capture(fake.page, page, "default");
  const before = readdirSync(ui).length;
  await expect(capture(fake.page, "settings", "default")).rejects.toThrow(
    "page cap: at most 3 pages per item (4th: settings); make a todo per page",
  );
  expect(readdirSync(ui).length).toBe(before);
  // A second state of a page already captured still writes.
  await capture(fake.page, "inbox", "empty");
  expect(existsSync(join(ui, "inbox-empty.json"))).toBe(true);
  for (const name of ["a", "b", "c", "d", "e", "f"])
    await captureMotion(fake.page, "inbox", name, async () => {});
  const count = readdirSync(ui).length;
  await expect(captureMotion(fake.page, "inbox", "g", async () => {})).rejects.toThrow(
    "interaction cap: at most 6 interactions per item (7th: inbox-g)",
  );
  expect(readdirSync(ui).length).toBe(count);
  expect(existsSync(join(ui, "motion", "inbox-g"))).toBe(false);
});

test("SP9-T2 AC-9: a joined name another pair already owns is refused before anything is written, naming both pairs", async () => {
  const { capture, captureMotion } = await helpers();
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  const fake = fakePage({ cdpFrames: 2 });
  await capture(fake.page, "a-b", "c");
  await captureMotion(fake.page, "a-b", "c", async () => {});
  const before = readdirSync(ui).length;
  const shots = fake.shots.length;
  await expect(capture(fake.page, "a", "b-c")).rejects.toThrow(
    "name clash: a-b-c is page a-b state c already; page a state b-c would overwrite it: rename one",
  );
  await expect(captureMotion(fake.page, "a", "b-c", async () => {})).rejects.toThrow(
    "name clash: a-b-c is page a-b interaction c already; page a interaction b-c would overwrite it: rename one",
  );
  expect(readdirSync(ui).length).toBe(before);
  expect(fake.shots.length).toBe(shots);
  // The same pair again is not a clash: a capture may be retaken.
  await capture(fake.page, "a-b", "c");
  await captureMotion(fake.page, "a-b", "c", async () => {});
});

test("2026-10-29-001 AC-6: capture() carries the page's measurements into the metadata: the overflow per viewport, the broken images, the fonts not loaded, the app measures and the text the reduced-motion pass hides", async () => {
  const { capture } = await helpers();
  const root = tempDir();
  const ui = join(root, "review", "ui");
  process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
  process.env.WIZARDINGCODE_CREW_UI_PLAN = plan(root, THREE);
  const block = (visible: boolean) => ({ target: "p.lead", text: "Your order", visible });
  const fake = fakePage({
    measures: {
      overflow: [
        { overflowPx: 40, offenders: [{ target: "div.row", right: 400 }] },
        { overflowPx: 0, offenders: [] },
        { overflowPx: 0, offenders: [] },
      ],
      images: ["https://cdn.example/a.png"],
      fonts: ["Brand Sans"],
      app: {
        width: 360,
        numericCells: 0,
        rightAlignedShare: 0,
        tabularShare: 0,
        chartHues: [],
        sidebarShare: 0,
      },
      blocks: [[block(true)], [block(false)]],
    },
  });
  const meta = (await capture(fake.page, "checkout", "default")) as {
    viewports: { width: number; overflow?: unknown }[];
    images?: unknown;
    fonts?: unknown;
    app?: unknown;
    reducedMotion: { hidden?: unknown };
  };
  expect(meta.viewports.map((v) => [v.width, v.overflow])).toEqual([
    [360, { overflowPx: 40, offenders: [{ target: "div.row", right: 400 }] }],
    [768, { overflowPx: 0, offenders: [] }],
    [1280, { overflowPx: 0, offenders: [] }],
  ]);
  expect(meta.images).toEqual(["https://cdn.example/a.png"]);
  expect(meta.fonts).toEqual(["Brand Sans"]);
  expect(meta.app).toMatchObject({ width: 360 });
  expect(meta.reducedMotion.hidden).toEqual([{ target: "p.lead", text: "Your order" }]);
  // A page that cannot answer leaves the fields absent, never empty: the engine reads them as not captured.
  const quiet = (await capture(fakePage().page, "checkout", "empty")) as Record<string, unknown>;
  expect("images" in quiet || "fonts" in quiet || "app" in quiet).toBe(false);
});
