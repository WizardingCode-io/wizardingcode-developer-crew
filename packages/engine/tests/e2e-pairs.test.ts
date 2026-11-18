// The pair of a reference and its capture (item 2026-11-18-006), against a real browser: the picture
// the helper writes is read back by its pixels, and every way a row has no pair is planted. The
// browser is the one `e2e-browser.test.ts` uses; without one every row here skips and says why.
import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tempDir } from "./helpers.ts";

const MODULE = new URL("../../../plugins/core/e2e/playwright.mjs", import.meta.url).href;
const HEADER = "| Shot | Ref | Whose and from where | Shows | Take from it | Leave | Width |";
const RED = [200, 30, 30];
const BLUE = [30, 30, 200];
const GREEN = [30, 160, 30];
const GROUND = [128, 128, 128];
const RECORD_KEYS = ["at", "by", "context", "pairs", "reason"];
const ENTRY_KEYS = ["capture", "cut", "pair", "reason", "ref", "shot", "width"];

type Context = {
  pages(): unknown[];
  on(event: "page", listener: () => void): void;
};
type Page = {
  goto(url: string): Promise<unknown>;
  setContent(html: string): Promise<void>;
  evaluate<T>(expression: string): Promise<T>;
  context(): Context;
  close(): Promise<void>;
};
type Browser = {
  newPage(): Promise<Page>;
  newContext(): Promise<{ newPage(): Promise<Page>; close(): Promise<void> }>;
  contexts(): unknown[];
  close(): Promise<void>;
};
type Entry = {
  shot: string | null;
  width: number | null;
  ref: string | null;
  capture: string | null;
  pair: string | null;
  cut: string | null;
  reason: string | null;
};
type Shots = {
  by?: string;
  at?: string;
  reason?: string | null;
  context?: string | null;
  pairs: Entry[];
};
type Fixture = {
  pairShots: (page: unknown) => Promise<Shots | null>;
  capture: (page: unknown, p: string, s: string) => Promise<Record<string, unknown> | null>;
};

/** The browser the test can launch, or the reason it cannot: Chrome by channel first, then the registry's shell. */
type Persistent = { pages(): Page[]; newPage(): Promise<Page>; close(): Promise<void> };
type Chromium = {
  launch(options: Record<string, unknown>): Promise<Browser>;
  launchPersistentContext(folder: string, options: Record<string, unknown>): Promise<Persistent>;
};
async function launch(): Promise<
  { browser: Browser; chromium: Chromium; options: Record<string, unknown> } | { skip: string }
> {
  let chromium: Chromium;
  try {
    chromium = ((await import("@playwright/test")) as { chromium: typeof chromium }).chromium;
  } catch (error) {
    return { skip: `@playwright/test is not installed at the root: ${(error as Error).message}` };
  }
  const reasons: string[] = [];
  for (const options of [{ channel: "chrome", headless: true }, { headless: true }]) {
    try {
      return { browser: await chromium.launch(options), chromium, options };
    } catch (error) {
      reasons.push(String((error as Error).message).split("\n")[0] ?? "");
    }
  }
  return { skip: `no browser to launch (${reasons.join("; ")})` };
}

const found = await launch();
if ("skip" in found) console.log(`e2e-pairs.test.ts skipped: ${found.skip}`);
afterAll(async () => {
  if ("browser" in found) await found.browser.close();
});
const browserTest = test.skipIf("skip" in found);

/** A page under test that records every image it is asked to load and every drawing on a canvas. */
const WATCHED = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Under test</title>
<script>
  window.__seen = [];
  const note = (what) => window.__seen.push(what);
  const NativeImage = window.Image;
  window.Image = function (...args) { note("Image"); return new NativeImage(...args); };
  const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", {
    get() { return src.get.call(this); },
    set(value) { note("src"); src.set.call(this, value); },
  });
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (...args) { note("drawImage"); return draw.apply(this, args); };
  const create = document.createElement.bind(document);
  document.createElement = (name, ...rest) => { if (String(name).toLowerCase() === "canvas") note("canvas"); return create(name, ...rest); };
</script></head><body><h1>Under test</h1></body></html>`;

/** A picture made on a canvas of a page of the test's own: one colour, or two, the second filling its lower half. */
async function picture(
  page: Page,
  width: number,
  height: number,
  rgb: number[],
  lower: number[] = rgb,
): Promise<Buffer> {
  const url = await page.evaluate<string>(`(() => {
    const input = ${JSON.stringify({ width, height, rgb, lower })};
    const canvas = document.createElement("canvas");
    canvas.width = input.width;
    canvas.height = input.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "rgb(" + input.rgb.join(",") + ")";
    context.fillRect(0, 0, input.width, input.height);
    context.fillStyle = "rgb(" + input.lower.join(",") + ")";
    context.fillRect(0, input.height / 2, input.width, input.height / 2);
    return canvas.toDataURL("image/png");
  })()`);
  return Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
}

/** The colours of a PNG at the points given, read on a canvas of a page of the test's own. */
async function colours(page: Page, png: Buffer, points: [number, number][]): Promise<number[][]> {
  const input = { url: `data:image/png;base64,${png.toString("base64")}`, points };
  return page.evaluate<number[][]>(`(() => {
    const input = ${JSON.stringify(input)};
    return new Promise((done, fail) => {
      const image = new Image();
      image.onerror = () => fail(new Error("the pair does not decode"));
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        done(input.points.map(([x, y]) => Array.from(context.getImageData(x, y, 1, 1).data.slice(0, 3))));
      };
      image.src = input.url;
    });
  })()`);
}

function pngSize(buffer: Buffer): { width: number; height: number } {
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const near = (got: number[] | undefined, want: number[]): boolean =>
  !!got && got.every((value, i) => Math.abs(value - (want[i] ?? 0)) <= 3);

/** An item's folder with its evidence folder and its references, and the environment pointed at it. */
function item(): { root: string; folder: string; ui: string; design: string; refs: string } {
  const root = tempDir();
  const folder = join(root, "work", "item");
  const ui = join(folder, "review", "ui");
  const design = join(folder, "design");
  const refs = join(design, "refs");
  mkdirSync(ui, { recursive: true });
  mkdirSync(refs, { recursive: true });
  return { root, folder, ui, design, refs };
}

const row = (shot: string, ref: string, width: string | number): string =>
  `| ${shot} | ${ref} | the client's | the first screen | the proportions | the colours | ${width} |`;
const table = (...rows: string[]): string =>
  `# Shots\n\n${HEADER}\n| :- | :- | :- | :- | :- | :- | :- |\n${rows.join("\n")}\n`;

/** Runs the body with the evidence folder in the environment and two pages: one under test, one of the test's own. */
async function withPages<T>(
  ui: string | null,
  body: (fixture: Fixture, underTest: Page, own: Page) => Promise<T>,
): Promise<T> {
  if ("skip" in found) throw new Error(found.skip);
  const names = [
    "WIZARDINGCODE_CREW_UI_DIR",
    "WIZARDINGCODE_CREW_E2E_DIR",
    "WIZARDINGCODE_CREW_UI_PLAN",
  ] as const;
  const previous = names.map((name) => process.env[name]);
  const context = await found.browser.newContext();
  const own = await found.browser.newPage();
  try {
    const underTest = await context.newPage();
    await underTest.setContent(WATCHED);
    for (const name of names) delete process.env[name];
    if (ui !== null) process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
    return await body((await import(MODULE)) as Fixture, underTest, own);
  } finally {
    // The environment first: a browser that died must not leave it changed for the rows after this one.
    for (const [i, name] of names.entries()) {
      const value = previous[i];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await context.close().catch(() => {});
    await own.close().catch(() => {});
  }
}

browserTest(
  "pairs AC-11, AC-12: one row gives a pair of 1464 by 1080 with the reference left, the capture right and the ground between, and a record of it",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      // The reference's upper half is red and its lower half green: scaled to 720 by 360, the halves
      // meet at 180, which a squeezed, cropped or shifted picture would move.
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED, GREEN));
      writeFileSync(join(at.ui, "home-default@1280.png"), await picture(own, 800, 1200, BLUE));
      writeFileSync(join(at.design, "shots.md"), table(row("home-default", "home.png", 1280)));
      const record = await fixture.pairShots(underTest);
      const pair = readFileSync(join(at.ui, "home-default@1280.pair.png"));
      expect(pngSize(pair)).toEqual({ width: 1464, height: 1080 });
      const points: [number, number, number[], string][] = [
        [360, 90, RED, "the reference's upper half"],
        [8, 8, RED, "the reference's top left"],
        [712, 165, RED, "the reference's upper half at its right, just above the middle"],
        [360, 195, GREEN, "the reference's lower half, just below the middle"],
        [360, 345, GREEN, "the reference's lower half, just above its end"],
        [712, 345, GREEN, "the reference's bottom right"],
        [360, 375, GROUND, "the ground just below the reference"],
        [360, 1040, GROUND, "the ground at the foot of the left cell"],
        [724, 180, GROUND, "the gap at its left"],
        [740, 180, GROUND, "the gap at its right"],
        [732, 900, GROUND, "the gap lower down"],
        [748, 180, BLUE, "the capture at its left"],
        [1104, 40, BLUE, "the capture near its top"],
        [1104, 1040, BLUE, "the capture near its foot"],
        [1460, 720, BLUE, "the capture at its right"],
      ];
      const read = await colours(
        own,
        pair,
        points.map(([px, py]) => [px, py]),
      );
      for (const [i, [px, py, want, what]] of points.entries())
        expect(near(read[i], want), `${what} (${px},${py}): ${read[i]}`).toBe(true);
      const entry: Entry = {
        shot: "home-default",
        width: 1280,
        ref: "home.png",
        capture: "home-default@1280.png",
        pair: "home-default@1280.pair.png",
        cut: null,
        reason: null,
      };
      expect(record?.by).toBe("fixture");
      expect(record?.reason).toBeNull();
      expect(record?.context).toBe("own");
      expect(record?.pairs).toEqual([entry]);
      expect(typeof record?.at).toBe("string");
      // The record holds these keys and no other: a `page`, a `state` or `viewports` in it would make
      // the engine take it for a capture's metadata.
      expect(Object.keys(record ?? {}).sort()).toEqual(RECORD_KEYS);
      expect(Object.keys(record?.pairs[0] ?? {}).sort()).toEqual(ENTRY_KEYS);
      expect(JSON.parse(readFileSync(join(at.ui, "shots.json"), "utf8"))).toEqual(record);
    });
  },
  60_000,
);

browserTest(
  "pairs AC-13: a picture that scales past 2880 px is cut there and not squeezed, and the entry names which was cut",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      // 400 by 1700 scales to 3060: its halves meet at 1530, where a squeeze to 2880 would put them at 1440.
      writeFileSync(join(at.refs, "long.png"), await picture(own, 400, 1700, RED, GREEN));
      writeFileSync(join(at.refs, "exact.png"), await picture(own, 400, 1600, RED));
      writeFileSync(join(at.refs, "short.png"), await picture(own, 400, 200, RED));
      const short = await picture(own, 800, 1200, BLUE);
      const long = await picture(own, 800, 3400, BLUE);
      writeFileSync(join(at.ui, "home-default@1280.png"), short);
      writeFileSync(join(at.ui, "exact-default@1280.png"), short);
      writeFileSync(join(at.ui, "tall-default@1280.png"), long);
      writeFileSync(join(at.ui, "both-default@1280.png"), long);
      writeFileSync(
        join(at.design, "shots.md"),
        table(
          row("home-default", "long.png", 1280),
          row("exact-default", "exact.png", 1280),
          row("tall-default", "short.png", 1280),
          row("both-default", "long.png", 1280),
        ),
      );
      const record = await fixture.pairShots(underTest);
      expect(record?.pairs.map((entry) => entry.cut)).toEqual([
        "reference",
        null,
        "capture",
        "both",
      ]);
      for (const name of ["home-default", "exact-default", "tall-default", "both-default"])
        expect(pngSize(readFileSync(join(at.ui, `${name}@1280.pair.png`))).height).toBe(2880);
      const read = await colours(own, readFileSync(join(at.ui, "home-default@1280.pair.png")), [
        [360, 1500],
        [360, 1560],
        [360, 2860],
        [1104, 1040],
        [1104, 1400],
      ]);
      expect(near(read[0], RED), `above where the halves meet: ${read[0]}`).toBe(true);
      expect(near(read[1], GREEN), `below where the halves meet: ${read[1]}`).toBe(true);
      expect(near(read[2], GREEN), `at the cut: ${read[2]}`).toBe(true);
      expect(near(read[3], BLUE)).toBe(true);
      expect(near(read[4], GROUND)).toBe(true);
    });
  },
  120_000,
);

browserTest(
  "pairs AC-14: the pair is composed away from the page under test and from its context, and the helper's own page and context are closed on every path",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED));
      writeFileSync(join(at.refs, "broken.png"), "this is no picture");
      writeFileSync(join(at.ui, "home-default@1280.png"), await picture(own, 800, 1200, BLUE));
      const seen = (): Promise<string[]> => underTest.evaluate<string[]>("window.__seen");
      const pages = underTest.context().pages().length;
      // The helper's blank page lives in a context of its own, which the count of the project's pages
      // cannot see: the browser's count of contexts is what shows it closed on every path.
      if ("skip" in found) throw new Error(found.skip);
      const contexts = found.browser.contexts().length;
      // Every page the project's context opens during the calls: the helper's blank page must not be
      // one of them, or an init script, a route or a cookie of that context would reach the reference.
      // A word per page and never the page itself: a failure here prints what the list holds, and a
      // browser's page is too large an object to print.
      const opened: string[] = [];
      underTest.context().on("page", () => opened.push("a page of the project's context"));

      writeFileSync(join(at.design, "shots.md"), table(row("home-default", "home.png", 1280)));
      const made = await fixture.pairShots(underTest);
      expect(made?.pairs[0]?.pair).toBe("home-default@1280.pair.png");
      expect(await seen()).toEqual([]);
      expect(opened).toEqual([]);
      expect(underTest.context().pages().length).toBe(pages);
      expect(found.browser.contexts().length).toBe(contexts);

      writeFileSync(join(at.design, "shots.md"), table(row("home-default", "broken.png", 1280)));
      const failed = await fixture.pairShots(underTest);
      expect(failed?.pairs[0]?.reason).toBe("not composed");
      expect(await seen()).toEqual([]);
      expect(opened).toEqual([]);
      expect(underTest.context().pages().length).toBe(pages);
      expect(found.browser.contexts().length).toBe(contexts);

      // A page the browser itself made, whose context allows no second page: the helper takes the
      // same way, a context of its own, and the pair is made.
      const alone = await found.browser.newPage();
      try {
        await alone.setContent(WATCHED);
        writeFileSync(join(at.design, "shots.md"), table(row("home-default", "home.png", 1280)));
        const again = await fixture.pairShots(alone);
        expect(again?.pairs[0]?.pair).toBe("home-default@1280.pair.png");
        expect(await alone.evaluate<string[]>("window.__seen")).toEqual([]);
        expect(alone.context().pages().length).toBe(1);
        expect(found.browser.contexts().length).toBe(contexts + 1);
      } finally {
        await alone.close();
      }
      expect(found.browser.contexts().length).toBe(contexts);
    });
  },
  60_000,
);

browserTest(
  "pairs AC-15: each way a row has no pair gives its reason from the fixed list, a failed cell is null and its text nowhere, and the other rows keep their pairs",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      const small = await picture(own, 400, 200, RED);
      for (const name of ["home.png", "second.png", "kept.png"])
        writeFileSync(join(at.refs, name), small);
      writeFileSync(join(at.refs, "tall.png"), await picture(own, 100, 17000, RED));
      writeFileSync(join(at.refs, "broken.png"), "this is no picture");
      writeFileSync(join(at.refs, "huge.png"), Buffer.alloc(20 * 1024 * 1024 + 1));
      writeFileSync(join(at.root, "outside.png"), small);
      symlinkSync(join(at.root, "outside.png"), join(at.refs, "linked.png"));
      writeFileSync(join(at.refs, ".hidden.png"), small);
      writeFileSync(join(at.refs, "notes.gif"), small);
      const capture = await picture(own, 800, 1200, BLUE);
      for (const name of [
        "home-default@1280.png",
        "about-default@1280.png",
        "tall-default@1280.png",
        "broken-default@1280.png",
        "huge-default@1280.png",
        "linked-default@1280.png",
        "last-default@1280.png",
      ])
        writeFileSync(join(at.ui, name), capture);
      const rows: [string, string, string | number, string | null][] = [
        ["home-default", "home.png", 1280, null],
        ["Home Page!", "home.png", 1280, "shot name"],
        ["home-default", "home.png", "wide <b>one</b>", "width"],
        ["home-default", "home.png", 199, "width"],
        ["home-default", "home.png", 4001, "width"],
        ["edge-low", "home.png", 200, "capture missing"],
        ["edge-high", "home.png", 4000, "capture missing"],
        ["home-default", "absent.png", 1280, "reference missing"],
        ["home-default", "../outside.png", 1280, "ref name"],
        ["home-default", ".hidden.png", 1280, "ref name"],
        ["home-default", "notes.gif", 1280, "ref name"],
        ["home-default", "second.png", 1280, "duplicate"],
        ["about-default", "absent.png", 1280, "reference missing"],
        ["about-default", "second.png", 1280, null],
        ["linked-default", "linked.png", 1280, "reference not a regular file"],
        ["huge-default", "huge.png", 1280, "reference too large"],
        ["missing-default", "home.png", 1280, "capture missing"],
        ["tall-default", "tall.png", 1280, "too many pixels"],
        ["broken-default", "broken.png", 1280, "not composed"],
        ["last-default", "kept.png", 1280, null],
      ];
      writeFileSync(
        join(at.design, "shots.md"),
        table(...rows.map(([shot, ref, width]) => row(shot, ref, width))),
      );
      const record = await fixture.pairShots(underTest);
      expect(record?.reason).toBeNull();
      const told = (reasons: (string | null | undefined)[]): string[] =>
        rows.map(([shot, ref, width], i) => `${shot} | ${ref} | ${width}: ${reasons[i]}`);
      expect(told((record?.pairs ?? []).map((entry) => entry.reason))).toEqual(
        told(rows.map((r) => r[3])),
      );
      for (const [i, entry] of (record?.pairs ?? []).entries()) {
        const made = rows[i]?.[3] === null;
        expect(entry.pair === null, `row ${i}`).toBe(!made);
        if (made) expect(existsSync(join(at.ui, entry.pair ?? "absent"))).toBe(true);
      }
      expect(record?.pairs[0]?.ref).toBe("home.png");
      expect(record?.pairs.at(-1)?.pair).toBe("last-default@1280.pair.png");
      expect(record?.pairs[1]?.shot).toBeNull();
      expect(record?.pairs[2]?.width).toBeNull();
      expect(record?.pairs[8]?.ref).toBeNull();
      const text = readFileSync(join(at.ui, "shots.json"), "utf8");
      for (const free of ["Home Page!", "wide", "<b>", "../outside", ".hidden", "notes.gif"])
        expect(text).not.toContain(free);
      expect(
        readdirSync(at.ui)
          .filter((name) => name.endsWith(".pair.png"))
          .sort(),
      ).toEqual([
        "about-default@1280.pair.png",
        "home-default@1280.pair.png",
        "last-default@1280.pair.png",
      ]);
    });
  },
  120_000,
);

browserTest(
  "pairs AC-16: the shot list as a whole: none, not readable, no table, too many rows, and a table with no row",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest) => {
      expect(await fixture.pairShots(underTest)).toEqual({ pairs: [] });
      expect(readdirSync(at.ui)).toEqual([]);

      const list = join(at.design, "shots.md");
      const reasonOf = async (): Promise<[string | null | undefined, number]> => {
        const record = await fixture.pairShots(underTest);
        expect(JSON.parse(readFileSync(join(at.ui, "shots.json"), "utf8"))).toEqual(record);
        return [record?.reason, record?.pairs.length ?? -1];
      };
      writeFileSync(
        list,
        `${table(row("home-default", "home.png", 1280))}${"x".repeat(256 * 1024)}`,
      );
      expect(await reasonOf()).toEqual(["shot list not readable", 0]);

      writeFileSync(list, "# Shots\n\nNo table here.\n");
      expect(await reasonOf()).toEqual(["no table", 0]);
      writeFileSync(
        list,
        "| Ref | Shot | Whose and from where | Shows | Take from it | Leave | Width |\n| :- | :- | :- | :- | :- | :- | :- |\n| home.png | home-default | a | b | c | d | 1280 |\n",
      );
      expect(await reasonOf()).toEqual(["no table", 0]);

      writeFileSync(
        list,
        table(...Array.from({ length: 51 }, (_, i) => row(`page-${i}`, "home.png", 1280))),
      );
      expect(await reasonOf()).toEqual(["too many rows", 0]);
      writeFileSync(
        list,
        table(...Array.from({ length: 50 }, (_, i) => row(`page-${i}`, "home.png", 1280))),
      );
      expect(await reasonOf()).toEqual([null, 50]);

      writeFileSync(list, `# Shots\n\n${HEADER}\n| :- | :- | :- | :- | :- | :- | :- |\n`);
      expect(await reasonOf()).toEqual([null, 0]);

      const real = join(at.root, "real-shots.md");
      writeFileSync(real, table(row("home-default", "home.png", 1280)));
      unlinkSync(list);
      symlinkSync(real, list);
      expect(await reasonOf()).toEqual(["shot list not readable", 0]);
    });
  },
  120_000,
);

browserTest(
  "pairs AC-17: the helper stays in the item's folder, follows no link on its way, and never writes through one",
  async () => {
    await withPages(null, async (fixture, underTest, own) => {
      const small = await picture(own, 400, 200, RED);
      const capture = await picture(own, 800, 1200, BLUE);
      const list = table(row("home-default", "home.png", 1280));

      // An evidence folder that is not <item>/review/ui finds no shot list, a planted one in a parent included.
      const elsewhere = item();
      const loose = join(elsewhere.folder, "review", "task-1", "ui");
      mkdirSync(loose, { recursive: true });
      writeFileSync(join(elsewhere.design, "shots.md"), list);
      writeFileSync(join(elsewhere.refs, "home.png"), small);
      writeFileSync(join(loose, "home-default@1280.png"), capture);
      process.env.WIZARDINGCODE_CREW_UI_DIR = loose;
      expect(await fixture.pairShots(underTest)).toEqual({ pairs: [] });
      expect(readdirSync(loose)).toEqual(["home-default@1280.png"]);

      const planted = item();
      mkdirSync(join(planted.root, "work", "design", "refs"), { recursive: true });
      writeFileSync(join(planted.root, "work", "design", "shots.md"), list);
      writeFileSync(join(planted.root, "work", "design", "refs", "home.png"), small);
      writeFileSync(join(planted.ui, "home-default@1280.png"), capture);
      rmSync(planted.design, { recursive: true });
      process.env.WIZARDINGCODE_CREW_UI_DIR = planted.ui;
      expect(await fixture.pairShots(underTest)).toEqual({ pairs: [] });

      // A design folder that is a link: the list is not readable.
      const linkedDesign = item();
      const away = join(linkedDesign.root, "away");
      mkdirSync(join(away, "refs"), { recursive: true });
      writeFileSync(join(away, "shots.md"), list);
      writeFileSync(join(away, "refs", "home.png"), small);
      rmSync(linkedDesign.design, { recursive: true });
      symlinkSync(away, linkedDesign.design);
      writeFileSync(join(linkedDesign.ui, "home-default@1280.png"), capture);
      process.env.WIZARDINGCODE_CREW_UI_DIR = linkedDesign.ui;
      const first = await fixture.pairShots(underTest);
      expect(first?.reason).toBe("shot list not readable");
      expect(first?.pairs).toEqual([]);

      // A refs folder that is a link out of the item's folder: the row's reference is outside.
      const linkedRefs = item();
      const out = join(linkedRefs.root, "out");
      mkdirSync(out);
      writeFileSync(join(out, "home.png"), small);
      rmSync(linkedRefs.refs, { recursive: true });
      symlinkSync(out, linkedRefs.refs);
      writeFileSync(join(linkedRefs.design, "shots.md"), list);
      writeFileSync(join(linkedRefs.ui, "home-default@1280.png"), capture);
      process.env.WIZARDINGCODE_CREW_UI_DIR = linkedRefs.ui;
      const second = await fixture.pairShots(underTest);
      expect(second?.pairs[0]?.reason).toBe("reference outside the folder");
      expect(second?.pairs[0]?.pair).toBeNull();

      // A link planted under the pair's name and under the record: each is replaced, its target untouched.
      const linked = item();
      const victim = join(linked.root, "victim.txt");
      const other = join(linked.root, "other.txt");
      writeFileSync(victim, "do not touch");
      writeFileSync(other, "nor this");
      writeFileSync(join(linked.refs, "home.png"), small);
      writeFileSync(join(linked.ui, "home-default@1280.png"), capture);
      writeFileSync(join(linked.design, "shots.md"), list);
      symlinkSync(victim, join(linked.ui, "home-default@1280.pair.png"));
      symlinkSync(other, join(linked.ui, "shots.json"));
      process.env.WIZARDINGCODE_CREW_UI_DIR = linked.ui;
      const third = await fixture.pairShots(underTest);
      expect(third?.pairs[0]?.pair).toBe("home-default@1280.pair.png");
      expect(readFileSync(victim, "utf8")).toBe("do not touch");
      expect(readFileSync(other, "utf8")).toBe("nor this");
      expect(lstatSync(join(linked.ui, "home-default@1280.pair.png")).isFile()).toBe(true);
      expect(lstatSync(join(linked.ui, "shots.json")).isFile()).toBe(true);
    });
  },
  120_000,
);

browserTest(
  "pairs AC-18: each call removes the pairs and the record an earlier one left, a row's that left the list among them, and nothing of another shape",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      const small = await picture(own, 400, 200, RED);
      const capture = await picture(own, 800, 1200, BLUE);
      for (const name of ["home.png", "about.png"]) writeFileSync(join(at.refs, name), small);
      for (const name of ["home-default@1280.png", "about-default@1280.png"])
        writeFileSync(join(at.ui, name), capture);
      const kept = {
        "home-default.json": '{"page":"home","state":"default","by":"fixture","viewports":[]}',
        "copy of home-default@1280.pair.png": "before the shape",
        "home-default@1280.pair.png.bak": "after the shape",
        "Home@1280.pair.png": "not the fixture's name shape",
        "notes.txt": "a person's",
      };
      for (const [name, body] of Object.entries(kept)) writeFileSync(join(at.ui, name), body);
      const list = join(at.design, "shots.md");
      writeFileSync(
        list,
        table(row("home-default", "home.png", 1280), row("about-default", "about.png", 1280)),
      );
      await fixture.pairShots(underTest);
      expect(existsSync(join(at.ui, "about-default@1280.pair.png"))).toBe(true);

      writeFileSync(list, table(row("home-default", "home.png", 1280)));
      const record = await fixture.pairShots(underTest);
      expect(record?.pairs.length).toBe(1);
      expect(existsSync(join(at.ui, "about-default@1280.pair.png"))).toBe(false);
      expect(existsSync(join(at.ui, "home-default@1280.pair.png"))).toBe(true);

      unlinkSync(list);
      expect(await fixture.pairShots(underTest)).toEqual({ pairs: [] });
      expect(readdirSync(at.ui).sort()).toEqual(
        [...Object.keys(kept), "home-default@1280.png", "about-default@1280.png"].sort(),
      );
      for (const [name, body] of Object.entries(kept))
        expect(readFileSync(join(at.ui, name), "utf8")).toBe(body);
    });
  },
  60_000,
);

browserTest(
  "pairs AC-19: with no evidence folder the helper returns null, writes nothing and opens no page",
  async () => {
    const at = item();
    await withPages(null, async (fixture, underTest, own) => {
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED));
      writeFileSync(join(at.ui, "home-default@1280.png"), await picture(own, 800, 1200, BLUE));
      writeFileSync(join(at.design, "shots.md"), table(row("home-default", "home.png", 1280)));
      const pages = underTest.context().pages().length;
      expect(await fixture.pairShots(underTest)).toBeNull();
      expect(underTest.context().pages().length).toBe(pages);
      expect(readdirSync(at.ui)).toEqual(["home-default@1280.png"]);
    });
  },
  60_000,
);

browserTest(
  "pairs AC-21: a capture taken with a pair file and the record in the folder writes what it writes without them, and counts no page for the record",
  async () => {
    const run = async (
      withFiles: boolean,
    ): Promise<{ names: string[]; meta: Record<string, unknown> }> => {
      const at = item();
      return withPages(at.ui, async (fixture, underTest) => {
        if (withFiles) {
          writeFileSync(join(at.ui, "home-default@1280.pair.png"), "a pair");
          writeFileSync(
            join(at.ui, "shots.json"),
            JSON.stringify({
              by: "fixture",
              at: "2026-11-18T00:00:00.000Z",
              reason: null,
              pairs: [],
            }),
          );
        }
        const names: string[] = [];
        let meta: Record<string, unknown> = {};
        for (const name of ["one", "two", "three"]) {
          meta = (await fixture.capture(underTest, name, "default")) ?? {};
        }
        names.push(...readdirSync(at.ui).sort());
        if (withFiles) {
          expect(readFileSync(join(at.ui, "home-default@1280.pair.png"), "utf8")).toBe("a pair");
          expect(existsSync(join(at.ui, "shots.json"))).toBe(true);
        }
        return { names, meta };
      });
    };
    const without = await run(false);
    const withThem = await run(true);
    expect(withThem.names.filter((n) => n !== "shots.json" && !n.endsWith(".pair.png"))).toEqual(
      without.names,
    );
    expect(Object.keys(withThem.meta).sort()).toEqual(Object.keys(without.meta).sort());
    const lights = (meta: Record<string, unknown>): unknown[] =>
      (meta.viewports as { light: string }[]).map((viewport) => viewport.light);
    expect(lights(withThem.meta)).toEqual(lights(without.meta));
  },
  120_000,
);

browserTest(
  "pairs2 AC-1: a row that is not composed leaves the pair's name to a later row, and a row with its pair makes a later one a duplicate",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      writeFileSync(join(at.refs, "broken.png"), "this is no picture");
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED));
      writeFileSync(join(at.refs, "second.png"), await picture(own, 400, 200, GREEN));
      const capture = await picture(own, 800, 1200, BLUE);
      writeFileSync(join(at.ui, "free-default@1280.png"), capture);
      writeFileSync(join(at.ui, "home-default@1280.png"), capture);
      writeFileSync(
        join(at.design, "shots.md"),
        table(
          row("free-default", "broken.png", 1280),
          row("free-default", "home.png", 1280),
          row("home-default", "home.png", 1280),
          row("home-default", "second.png", 1280),
        ),
      );
      const record = await fixture.pairShots(underTest);
      expect(record?.pairs.map((entry) => `${entry.shot} | ${entry.ref}: ${entry.reason}`)).toEqual(
        [
          "free-default | broken.png: not composed",
          "free-default | home.png: null",
          "home-default | home.png: null",
          "home-default | second.png: duplicate",
        ],
      );
      expect(record?.pairs.map((entry) => entry.pair)).toEqual([
        null,
        "free-default@1280.pair.png",
        "home-default@1280.pair.png",
        null,
      ]);
      // The pair under the freed name is the second row's: its reference is red, and the broken one drew nothing.
      const read = await colours(own, readFileSync(join(at.ui, "free-default@1280.pair.png")), [
        [360, 180],
      ]);
      expect(near(read[0], RED), `the freed name's pair: ${read[0]}`).toBe(true);
      // The duplicate drew nothing over the first row's pair: it is still red, where the duplicate's reference is green.
      const kept = await colours(own, readFileSync(join(at.ui, "home-default@1280.pair.png")), [
        [360, 180],
      ]);
      expect(near(kept[0], RED), `the pair a duplicate must leave: ${kept[0]}`).toBe(true);
    });
  },
  60_000,
);

/** A page of a persistent context, and the way to close it. */
async function persistentPage(): Promise<{ page: Page; close(): Promise<void> }> {
  if ("skip" in found) throw new Error(found.skip);
  const context = await found.chromium.launchPersistentContext(tempDir(), found.options);
  const close = (): Promise<void> => context.close().catch(() => {});
  try {
    return { page: context.pages()[0] ?? (await context.newPage()), close };
  } catch (error) {
    // No page to hand back: the context is closed here, since the caller never gets the way to close it.
    await close();
    throw error;
  }
}

browserTest(
  "pairs2 AC-15: the record holds five keys and says in which context the run composed: own, shared or none",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED));
      writeFileSync(join(at.ui, "home-default@1280.png"), await picture(own, 800, 1200, BLUE));
      const list = join(at.design, "shots.md");

      writeFileSync(list, table(row("home-default", "home.png", 1280)));
      const composed = await fixture.pairShots(underTest);
      expect(Object.keys(composed ?? {}).sort()).toEqual(RECORD_KEYS);
      expect(composed?.context).toBe("own");

      writeFileSync(list, table(row("home-default", "absent.png", 1280)));
      const none = await fixture.pairShots(underTest);
      expect(Object.keys(none ?? {}).sort()).toEqual(RECORD_KEYS);
      expect(none?.context).toBeNull();
      expect(none?.pairs[0]?.reason).toBe("reference missing");

      writeFileSync(list, table(row("home-default", "home.png", 1280)));
      const persistent = await persistentPage();
      try {
        // On this Playwright a page of a persistent context reaches its browser: a context of the helper's own.
        const fromPersistent = await fixture.pairShots(persistent.page);
        expect(fromPersistent?.context).toBe("own");
        expect(fromPersistent?.pairs[0]?.pair).toBe("home-default@1280.pair.png");
      } finally {
        await persistent.close();
      }

      // A page whose context gives no browser: the helper's page is one of that context, and the record says so.
      const answer = `data:image/png;base64,${(await picture(own, 8, 8, RED)).toString("base64")}`;
      const standIn = {
        context: () => ({
          browser: () => null,
          newPage: async () => ({
            evaluate: async () => ({ reason: null, cut: null, dataUrl: answer }),
            close: async () => {},
          }),
        }),
      };
      const shared = await fixture.pairShots(standIn);
      expect(Object.keys(shared ?? {}).sort()).toEqual(RECORD_KEYS);
      expect(shared?.context).toBe("shared");
      expect(shared?.pairs[0]?.pair).toBe("home-default@1280.pair.png");
      expect(JSON.parse(readFileSync(join(at.ui, "shots.json"), "utf8"))).toEqual(shared);
    });
  },
  120_000,
);

browserTest(
  "pairs2 AC-10: from a page of a persistent context the pair is made, away from that page, and the helper's page is closed",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, _underTest, own) => {
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED, GREEN));
      writeFileSync(join(at.ui, "home-default@1280.png"), await picture(own, 800, 1200, BLUE));
      writeFileSync(join(at.design, "shots.md"), table(row("home-default", "home.png", 1280)));
      const persistent = await persistentPage();
      try {
        await persistent.page.setContent(WATCHED);
        const pages = persistent.page.context().pages().length;
        const record = await fixture.pairShots(persistent.page);
        expect(record?.pairs[0]?.pair).toBe("home-default@1280.pair.png");
        expect(record?.pairs[0]?.reason).toBeNull();
        expect(await persistent.page.evaluate<string[]>("window.__seen")).toEqual([]);
        expect(persistent.page.context().pages().length).toBe(pages);
        const pair = readFileSync(join(at.ui, "home-default@1280.pair.png"));
        expect(pngSize(pair)).toEqual({ width: 1464, height: 1080 });
        const read = await colours(own, pair, [
          [360, 90],
          [360, 270],
          [1104, 540],
        ]);
        expect(near(read[0], RED)).toBe(true);
        expect(near(read[1], GREEN)).toBe(true);
        expect(near(read[2], BLUE)).toBe(true);
      } finally {
        await persistent.close();
      }
    });
  },
  120_000,
);

browserTest(
  "pairs2 AC-11: a write that fails rejects the call, with no page of the project's context opened and no context left open",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      if ("skip" in found) throw new Error(found.skip);
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED));
      writeFileSync(join(at.ui, "home-default@1280.png"), await picture(own, 800, 1200, BLUE));
      writeFileSync(join(at.design, "shots.md"), table(row("home-default", "home.png", 1280)));
      // A folder under the pair's name: the removal cannot unlink it and the exclusive write refuses it.
      mkdirSync(join(at.ui, "home-default@1280.pair.png"));
      const opened: string[] = [];
      underTest.context().on("page", () => opened.push("a page of the project's context"));
      const contexts = found.browser.contexts().length;
      let rejected = "the call did not reject";
      try {
        await fixture.pairShots(underTest);
      } catch (error) {
        rejected = String((error as { code?: string }).code ?? "rejected");
      }
      expect(rejected).toBe("EEXIST");
      expect(opened).toEqual([]);
      expect(found.browser.contexts().length).toBe(contexts);
      expect(existsSync(join(at.ui, "shots.json"))).toBe(false);
    });
  },
  60_000,
);

browserTest(
  "pairs2 AC-12: a row whose cells are written in backticks has its pair, and its entry holds the values without them",
  async () => {
    const at = item();
    await withPages(at.ui, async (fixture, underTest, own) => {
      writeFileSync(join(at.refs, "home.png"), await picture(own, 400, 200, RED));
      writeFileSync(join(at.ui, "home-default@1280.png"), await picture(own, 800, 1200, BLUE));
      writeFileSync(
        join(at.design, "shots.md"),
        table(row("`home-default`", "`home.png`", "`1280`")),
      );
      const record = await fixture.pairShots(underTest);
      const entry = record?.pairs[0];
      expect(entry?.reason).toBeNull();
      expect([entry?.shot, entry?.ref, entry?.width]).toEqual(["home-default", "home.png", 1280]);
      expect(entry?.pair).toBe("home-default@1280.pair.png");
      expect(existsSync(join(at.ui, "home-default@1280.pair.png"))).toBe(true);
    });
  },
  60_000,
);
