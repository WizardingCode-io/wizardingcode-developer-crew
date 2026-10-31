// What the page itself is held to on a new site (item 2026-10-30-005, D-1, D-2, D-5): the fixture's
// measure against real pages in a real browser, the grading on the numbers it returns.
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { type Fingerprint, historyPath, recordSurface } from "../src/design.ts";
import {
  gradeDesign,
  gradeProbe,
  type PageProbe,
  readLimits,
  recordDesignHistory,
} from "../src/design-grade.ts";
import { userDirOf } from "../src/paths.ts";
import { createWork } from "../src/work.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const MODULE = new URL("../../../plugins/core/e2e/measure.mjs", import.meta.url).href;
const { pageProbe } = (await import(MODULE)) as {
  pageProbe: (d: unknown, w: unknown) => PageProbe;
};

type Page = {
  setContent(html: string): Promise<void>;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  evaluate(script: string): Promise<unknown>;
  close(): Promise<void>;
};
type Browser = { newPage(): Promise<Page>; close(): Promise<void> };

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = (await import("@playwright/test")) as unknown as {
      chromium: { launch(o: Record<string, unknown>): Promise<Browser> };
    };
    for (const options of [{ channel: "chrome", headless: true }, { headless: true }]) {
      try {
        return await chromium.launch(options);
      } catch {}
    }
  } catch {}
  return null;
}
const browser = await launch();
if (!browser) console.log("design-grade.test.ts: no browser, the browser rows skip");

const BASE = `*{margin:0;box-sizing:border-box} body{font:18px/1.5 Georgia,serif;color:#1a1a1a;background:#fff;padding:0 32px}
section{padding:90px 0;min-height:300px} h1{font-size:64px;line-height:1.05} h2{font-size:32px}
a.b{display:inline-block;height:48px;padding:12px 20px;background:#a02020;color:#fff}
img{display:block;width:300px;height:200px;background:#ccc}`;
const pics = (n: number) =>
  Array.from(
    { length: n },
    () =>
      `<img alt="x" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==">`,
  ).join("");
const GOOD = (
  extra = "",
  body = "",
) => `<!doctype html><html><head><style>${BASE}${extra}</style></head><body>
<main><section><h1>Baked once a month</h1><p>Every loaf comes from one oven, lit at five.</p><a class="b" href="/menu">See the menu</a>${pics(2)}</section>
<section><h2>The menu</h2><p>${"Three loaves and a long list of words to read through. ".repeat(4)}</p>${pics(2)}</section>${body}</main></body></html>`;

async function probe(html: string, width = 1280, height = 800): Promise<PageProbe> {
  const page = await (browser as Browser).newPage();
  await page.setViewportSize({ width, height });
  await page.setContent(html);
  const out = (await page.evaluate(`(${pageProbe.toString()})(document, window)`)) as PageProbe;
  await page.close();
  return out;
}
const ids = (p: PageProbe, surface: "persuade" | "operate" = "persuade") =>
  gradeProbe(p, surface, {}).map((o) => o.id);

const live = browser ? test : test.skip;

live("AC-8: a clean page breaks no proportion limit at either width", async () => {
  const wide = await probe(GOOD());
  expect(ids(wide).filter((i) => i.startsWith("proportion/"))).toEqual([]);
  const phone = await probe(
    GOOD("body{font-size:16px} h1{font-size:40px} section{padding:45px 0}"),
    360,
    800,
  );
  expect(ids(phone).filter((i) => i.startsWith("proportion/"))).toEqual([]);
});

const PROPORTION: [string, string, string?, number?][] = [
  ["proportion/display-size", "h1{font-size:140px}"],
  ["proportion/display-ratio", "h1{font-size:20px}"],
  ["proportion/title-box", "h1{font-size:90px;line-height:4}"],
  ["proportion/body-size", "body{font-size:13px}"],
  ["proportion/control-height", "a.b{height:90px}"],
  ["proportion/section-gap", "section{padding:220px 0}"],
  ["proportion/nav-share", "", '<nav style="height:200px;position:absolute;top:0">x</nav>'],
  [
    "proportion/icon-size",
    "",
    '<svg viewBox="0 0 24 24" style="width:160px;height:160px"><path d="M0 0h24v24H0z"/></svg>',
  ],
  ["proportion/display-size", "h1{font-size:64px}", undefined, 360],
];
for (const [id, css, body, width] of PROPORTION) {
  live(`AC-8: ${id} fails its planted page${width ? ` at ${width}` : ""}`, async () => {
    expect(ids(await probe(GOOD(css, body ?? ""), width ?? 1280))).toContain(id);
  });
}

live(
  "AC-8: an Operate page is not held to the page-level limits, and a declared value with its decision is honoured",
  async () => {
    const big = await probe(GOOD("h1{font-size:140px}"));
    expect(ids(big, "operate").filter((i) => i.startsWith("proportion/"))).toEqual([]);
    const limits = readLimits(
      "---\nproportion-display-max-px: 150\nproportion-decision: D-3\n---\n# Design\n",
      new Set(["D-3"]),
    );
    expect(gradeProbe(big, "persuade", limits).map((o) => o.id)).not.toContain(
      "proportion/display-size",
    );
    const undecided = readLimits(
      "---\nproportion-display-max-px: 150\nproportion-decision: D-9\n---\n",
      new Set(["D-3"]),
    );
    expect(gradeProbe(big, "persuade", undecided).map((o) => o.id)).toContain(
      "proportion/display-size",
    );
  },
);

const MEASURES: [string, string, string][] = [
  [
    "frame/same-layout",
    "section.s{display:flex;justify-content:space-between;gap:40px;min-height:300px;padding:20px 0} section.s>div{width:30%} section.s img{width:400px;height:220px}",
    `${'<section class="s"><div><h2>Part</h2><p>Words to read in this column here</p></div><img alt="x" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></section>'.repeat(4)}`,
  ],
  ["colour/ai-look", "body{background:#f5efe6}", ""],
  ["page/no-title", "h1{display:none}", ""],
  ["page/headline-lines", "h1{width:300px}", ""],
  [
    "page/covered-text",
    "",
    '<div style="position:absolute;top:60px;left:0;width:100%;height:120px;background:#000"></div>',
  ],
  ["frame/off-centre", "body{padding:0 600px 0 32px}", ""],
  [
    "frame/blank-gap",
    "",
    '<div style="height:900px"></div><section><h2>After</h2><p>words here to close the page</p></section>',
  ],
  [
    "frame/untitled-section",
    "",
    `<section><p>${"Words without any heading on top of them at all. ".repeat(10)}</p></section><section><p>${"And more words with no heading to name them here. ".repeat(10)}</p></section>`,
  ],
  [
    "craft/icon-cards",
    ".c{display:inline-block;width:280px;height:160px;border:1px solid #ddd;padding:16px;vertical-align:top} .c svg{width:32px;height:32px}",
    `<section><h2>Why</h2>${'<div class="c"><svg viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg><p>Some card text</p></div>'.repeat(3)}</section>`,
  ],
  [
    "type/font-count",
    ".a{font-family:Arial}.b2{font-family:Verdana}.c2{font-family:Courier}.d{font-family:Times}",
    `<section><h2>T</h2><p class="a">${"word ".repeat(30)}</p><p class="b2">${"word ".repeat(30)}</p><p class="c2">${"word ".repeat(30)}</p><p class="d">${"word ".repeat(30)}</p></section>`,
  ],
  ["colour/contrast", "p{color:#ddd}", ""],
  [
    "label/eyebrow",
    ".e{font-size:12px;letter-spacing:.1em;text-transform:uppercase}",
    '<section><div class="e">Our approach</div><h2>The way we bake it</h2><p>words to read here in a line</p></section>',
  ],
];
for (const [id, css, body] of MEASURES) {
  live(`AC-11: ${id} fails its planted page and a clean page does not`, async () => {
    expect(ids(await probe(GOOD(css, body)))).toContain(id);
    expect(ids(await probe(GOOD()))).not.toContain(id);
  });
}

live(
  "AC-12: a Persuade page under four pictures or eight moving elements fails, and an Operate page does not",
  async () => {
    const few = await probe(GOOD("img{display:none}"));
    expect(ids(few)).toContain("picture/few");
    const rich = await probe(GOOD());
    expect(ids(rich)).not.toContain("picture/few");
    expect(ids(few, "operate")).not.toContain("picture/few");
    const still = { ...rich, motion: { count: 2, kinds: ["entrance"] } };
    expect(ids(still)).toContain("motion/still");
    expect(ids({ ...rich, motion: { count: 8, kinds: ["entrance"] } })).not.toContain(
      "motion/still",
    );
    expect(gradeProbe(still, "operate", {}).map((o) => o.id)).not.toContain("motion/still");
  },
);

live("AC-25: the fingerprint and the contrast read oklch colours", async () => {
  const dark = await probe(
    GOOD(
      "body{background:oklch(0.2 0.02 250);color:oklch(0.95 0 0)} a.b{background:oklch(0.7 0.15 180);color:oklch(0.15 0 0)}",
    ),
  );
  expect(dark.fingerprint?.palette).toMatch(/^dark-/);
  expect(dark.fingerprint?.palette).not.toContain("none");
  const low = await probe(GOOD("body{background:oklch(0.97 0 0);color:oklch(0.9 0 0)}"));
  expect(gradeProbe(low, "persuade", {}).map((o) => o.id)).toContain("colour/contrast");
});

live(
  "AC-25: the fingerprint reads a dark ground on a wrapper and a colour with no button",
  async () => {
    const dark = await probe(
      GOOD(
        "html{background:#101820} body{background:transparent;color:#eee} a.b{background:#fff;color:#000} h2{color:#2a9d8f}",
      ),
    );
    expect(dark.fingerprint?.palette).toMatch(/^dark-/);
    expect(dark.fingerprint?.palette).toMatch(/-teal$/);
  },
);

live("AC-25: the probe gives a fingerprint whose values fit the history's patterns", async () => {
  const p = await probe(GOOD());
  expect(p.fingerprint?.display).toMatch(/^[A-Za-z0-9 -]{1,60}$/);
  expect(p.fingerprint?.palette).toMatch(/^[a-z0-9-]+$/);
  expect(p.fingerprint?.sections).toMatch(/^[a-z0-9-]+(,[a-z0-9-]+)*$/);
  expect(p.fingerprint?.hero).toMatch(/^[a-z0-9-]+$/);
});

test("AC-11: the probe runs on a DOM-shaped fake and survives what a fake lacks", () => {
  const h1 = {
    tagName: "H1",
    childNodes: [{ nodeType: 3, textContent: "Hello" }],
    getBoundingClientRect: () => ({
      top: 10,
      bottom: 80,
      left: 30,
      right: 500,
      width: 470,
      height: 70,
    }),
    getClientRects: () => [{ top: 10, bottom: 80, left: 30, right: 500, width: 470, height: 70 }],
    children: [],
    closest: () => null,
    matches: () => false,
    querySelectorAll: () => [],
    parentElement: null,
    textContent: "Hello",
  };
  const style = {
    fontSize: "64px",
    fontFamily: "Georgia",
    opacity: "1",
    visibility: "visible",
    display: "block",
    color: "rgb(0,0,0)",
    backgroundColor: "rgba(0,0,0,0)",
    textTransform: "none",
    letterSpacing: "normal",
    lineHeight: "70px",
    overflowX: "visible",
    position: "static",
  };
  const doc = {
    body: { querySelectorAll: () => [h1], children: [h1] },
    documentElement: { scrollHeight: 800, clientWidth: 1280 },
    querySelectorAll: (s: string) => (s === "h1" ? [h1] : s === "*" ? [h1] : []),
    elementFromPoint: () => h1,
  };
  const win = { innerWidth: 1280, innerHeight: 800, scrollY: 0, getComputedStyle: () => style };
  const out = pageProbe(doc, win);
  expect(out.title?.count).toBe(1);
  expect(out.title?.sizePx).toBe(64);
});

test("AC-25: the e2e grade writes the fingerprint, fails a site too like an earlier one and adds one that differs", () => {
  const env = testEnv();
  const site = (hero: string, display: string, body: string, palette: string) => {
    const root = makeRepo({ "package.json": '{"name":"t"}\n' });
    const paths = repoPaths(root, env);
    const work = createWork(paths, "a site");
    recordSurface(paths, work.id, "persuade", "world", "2026-10-30");
    const probe = {
      width: 1280,
      height: 800,
      title: { count: 1, sizePx: 64, lines: 1, boxShare: 0.1, inView: true },
      displayPx: 64,
      bodyPx: 18,
      controls: [48],
      icons: [],
      sectionGaps: [160],
      navShare: 0.05,
      margins: { left: 32, right: 32 },
      blankGaps: [],
      emptyScreens: 0,
      untitled: 0,
      lopsided: 0,
      iconCards: 0,
      families: 2,
      sizes: 5,
      lowContrast: 0,
      eyebrows: 0,
      microLabels: 0,
      covered: 0,
      clipped: 0,
      pictures: 5,
      motion: { count: 9, kinds: ["entrance"] },
      fingerprint: { display, body, palette, sections: "media,split,list", hero },
    };
    write(
      root,
      `.crew/work/${work.id}/review/ui/home-default.json`,
      JSON.stringify({ page: "home", state: "default", viewports: [{ width: 1280, page: probe }] }),
    );
    return { paths, work };
  };
  const first = site("media-full", "Canela", "Soehne", "light-warm-red");
  const one = gradeDesign(first.paths, first.work);
  expect(one.offences).toEqual([]);
  expect(one.fingerprint?.motion).toBe("entrance");
  expect(
    existsSync(
      join(first.paths.root, ".crew", "work", first.work.id, "design", "fingerprint.json"),
    ),
  ).toBe(true);
  expect(recordDesignHistory(first.paths, first.work, one.fingerprint as Fingerprint)).toBeNull();
  const raw = readFileSync(historyPath(first.paths.userDir), "utf8");
  expect(raw).not.toContain("Canela");
  expect(raw).not.toContain(first.work.id);
  const near = site("media-full", "Tiempos", "Graphik", "dark-cold-blue");
  expect(gradeDesign(near.paths, near.work).offences.join()).toContain("design/too-alike");
  const samePalette = site("text-only", "Tiempos", "Graphik", "light-warm-red");
  expect(gradeDesign(samePalette.paths, samePalette.work).offences.join()).toContain(
    "design/palette-repeat",
  );
  const sameHero = site("media-full", "Tiempos", "Graphik", "dark-cold-blue");
  expect(gradeDesign(sameHero.paths, sameHero.work).offences.join()).toContain(
    "design/hero-repeat",
  );
  const far = site("text-only", "Tiempos", "Graphik", "dark-cold-blue");
  const farGrade = gradeDesign(far.paths, far.work);
  expect(farGrade.offences.join()).not.toContain("too-alike");
  expect(gradeDesign(first.paths, first.work).offences.join()).not.toContain("too-alike");
});

live(
  "AC-20: site-distinctness fails a pair alike and passes a pair that differs",
  async () => {
    const { compareSites } = (await import(
      "../../../scripts/site-distinctness.ts"
    )) as typeof import("../../../scripts/site-distinctness.ts");
    const site = (html: string) => {
      const dir = tempDir();
      write(dir, "public/index.html", html);
      return dir;
    };
    const a = site(GOOD());
    const same = site(GOOD());
    const other = site(
      `<!doctype html><html><head><style>*{margin:0} body{background:#101820;color:#eee;font:18px/1.5 Verdana;padding:0 32px} h1{font:64px/1.05 'Courier New'} a{display:inline-block;height:48px;background:#0a8;color:#000;padding:12px} img{display:block;width:90%;height:500px;background:#333}</style></head><body><main><section style="text-align:center;min-height:300px"><h1>The filter</h1><a href="/w">Join</a><img alt="x" src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="></section></main></body></html>`,
    );
    const alike = await compareSites([a, same]);
    expect(alike.pairs[0]?.differ).toBe(0);
    expect(alike.failed).toBe(true);
    const apart = await compareSites([a, other]);
    expect(apart.pairs[0]?.differ).toBeGreaterThanOrEqual(4);
    expect(apart.pairs[0]?.same).not.toContain("palette");
    const oversized = site(GOOD("h1{font-size:150px}"));
    const broke = await compareSites([oversized, other]);
    expect(broke.sites[0]?.offences.join()).toContain("proportion/display-size");
    expect(broke.failed).toBe(true);
    const script = join(import.meta.dir, "..", "..", "..", "scripts", "site-distinctness.ts");
    expect(spawnSync("bun", [script, a, same]).status).toBe(1);
    expect(spawnSync("bun", [script, a]).status).toBe(2);
  },
  60000,
);

test("AC-25: a forged reading cannot throw out of the grade", () => {
  const root = makeRepo({ "package.json": '{"name":"t"}\n' });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "a site");
  recordSurface(paths, work.id, "persuade", "world", "2026-10-30");
  write(
    root,
    `.crew/work/${work.id}/review/ui/home-default.json`,
    JSON.stringify({ viewports: [{ page: { width: 1 } }] }),
  );
  expect(gradeDesign(paths, work).offences).toEqual([]);
  const forged = {
    width: 1280,
    height: 800,
    title: { count: 1, sizePx: 64, lines: 1, boxShare: 0.1, inView: true },
    displayPx: 64,
    bodyPx: 18,
    controls: [],
    icons: [],
    sectionGaps: [],
    blankGaps: [],
    margins: { left: 32, right: 32 },
  };
  for (const extra of [{ motion: { count: 1, kinds: "x" } }, { fingerprint: { display: 1 } }]) {
    write(
      root,
      `.crew/work/${work.id}/review/ui/home-default.json`,
      JSON.stringify({ viewports: [{ page: { ...forged, ...extra } }] }),
    );
    expect(gradeDesign(paths, work).offences).toEqual([]);
  }
});

test("AC-25: a gate run's e2e writes the fingerprint and adds the site to the history", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const env = testEnv();
  const lines: string[] = [];
  const io: CliIo = {
    cwd: root,
    env,
    stdout: (t) => void lines.push(t),
    stderr: (t) => void lines.push(t),
    stdin: async () => "",
  };
  const run = (...args: string[]) => main(args, io);
  await run("detect");
  const answers = JSON.stringify({
    work_type: "feature",
    is_vague: 0,
    scope: 1,
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra: 0,
    touches_public_api: 0,
  });
  await run("start", "a site", "--answers", answers);
  const id = /(\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)/.exec(lines.join(" "))?.[1] ?? "";
  await run("design", id, "surface", "persuade", "--invention", "world");
  const probe = {
    width: 1280,
    height: 800,
    title: { count: 1, sizePx: 64, lines: 1, boxShare: 0.1, inView: true },
    displayPx: 64,
    bodyPx: 18,
    controls: [48],
    icons: [],
    sectionGaps: [160],
    navShare: 0.05,
    margins: { left: 32, right: 32 },
    blankGaps: [],
    emptyScreens: 0,
    untitled: 0,
    lopsided: 0,
    iconCards: 0,
    families: 2,
    sizes: 5,
    lowContrast: 0,
    eyebrows: 0,
    microLabels: 0,
    covered: 0,
    clipped: 0,
    pictures: 5,
    motion: { count: 9, kinds: ["entrance"] },
    fingerprint: {
      display: "Canela",
      body: "Soehne",
      palette: "light-warm-red",
      sections: "media,split,list",
      hero: "media-full",
    },
  };
  const meta = { page: "home", state: "default", viewports: [{ width: 1280, page: probe }] };
  write(
    root,
    "capture.mjs",
    `import { mkdirSync, writeFileSync } from "node:fs";
const dir = process.env.WIZARDINGCODE_CREW_UI_DIR;
mkdirSync(dir, { recursive: true });
writeFileSync(dir + "/home-default.json", ${JSON.stringify(JSON.stringify(meta))});
`,
  );
  await run("profile", "set", "e2e", "node capture.mjs");
  await run("profile", "set", "environment.start", "sh -c 'touch up.flag; exec sleep 300'");
  await run("profile", "set", "environment.health", "test -f up.flag");
  write(root, "public/index.html", "<!doctype html><title>x</title>\n");
  await run("gate", "run", id);
  expect(existsSync(join(root, ".crew", "work", id, "design", "fingerprint.json"))).toBe(true);
  expect(existsSync(historyPath(userDirOf(env)))).toBe(true);
}, 60000);
