// The in-page measurements of the crew's Playwright fixture (2026-10-29-001, P-1 and P-3), run here
// against a DOM-shaped fake whose geometry, computed styles and fonts each row sets: the
// measurement itself, where e2e-capture.test.ts proves only that its results reach the metadata.
import { expect, test } from "bun:test";

const MODULE = new URL("../../../plugins/core/e2e/measure.mjs", import.meta.url).href;

interface FakeElement {
  tagName: string;
  id?: string;
  className?: string;
  rect?: { top?: number; bottom?: number; right?: number; width?: number };
  style?: Record<string, string>;
  text?: string;
  children?: FakeElement[];
  complete?: boolean;
  naturalWidth?: number;
  src?: string;
}

type Measure = {
  measureOverflow: (
    doc: unknown,
    win: unknown,
  ) => { overflowPx: number; offenders: { target: string; right: number }[] };
  brokenImages: (doc: unknown) => string[];
  fontsNotLoaded: (doc: unknown) => Promise<string[]>;
  textBlocks: (doc: unknown, win: unknown) => { target: string; text: string; visible: boolean }[];
  hiddenText: (
    before: { target: string; text: string; visible: boolean }[],
    after: { target: string; text: string; visible: boolean }[],
  ) => { target: string; text: string }[];
  appMeasures: (doc: unknown, win: unknown) => Record<string, unknown>;
};
const load = async () => (await import(MODULE)) as Measure;

/** A document over a flat list of elements: querySelectorAll by tag name or `*`, computed styles from each element's style. */
function fakeDocument(
  elements: FakeElement[],
  scrollWidth = 360,
  fonts: { family: string; status: string }[] = [],
) {
  const all = (root: FakeElement[]): FakeElement[] =>
    root.flatMap((e) => [e, ...all(e.children ?? [])]);
  const wrap = (e: FakeElement) => ({
    tagName: e.tagName.toUpperCase(),
    id: e.id ?? "",
    className: e.className ?? "",
    complete: e.complete,
    naturalWidth: e.naturalWidth,
    src: e.src,
    currentSrc: e.src,
    getBoundingClientRect: () => ({
      top: 0,
      bottom: 20,
      right: 100,
      width: 100,
      ...(e.rect ?? {}),
    }),
    childNodes: e.text === undefined ? [] : [{ nodeType: 3, textContent: e.text }],
    querySelectorAll: (selector: string) => select(all(e.children ?? []), selector),
    __style: e.style ?? {},
  });
  const select = (list: FakeElement[], selector: string) => {
    const tags = selector.split(",").map((s) => s.trim().toUpperCase());
    return list
      .filter((e) => tags.includes("*") || tags.includes(e.tagName.toUpperCase()))
      .map(wrap);
  };
  const doc = {
    documentElement: { scrollWidth },
    body: { querySelectorAll: (s: string) => select(all(elements), s) },
    querySelectorAll: (s: string) => select(all(elements), s),
    fonts: Object.assign(fonts, { ready: Promise.resolve() }),
  };
  const win = {
    innerWidth: 360,
    innerHeight: 640,
    getComputedStyle: (el: { __style: Record<string, string> }) => ({
      opacity: "1",
      visibility: "visible",
      textAlign: "start",
      fontVariantNumeric: "normal",
      fill: "none",
      ...el.__style,
      getPropertyValue(name: string) {
        return (this as unknown as Record<string, string>)[name] ?? "";
      },
    }),
  };
  return { doc, win };
}

test("2026-10-29-001 AC-6: measureOverflow gives the overflow in pixels and five offenders widest first from six; none gives 0 and an empty list", async () => {
  const { measureOverflow } = await load();
  const wide = (n: number, right: number): FakeElement => ({
    tagName: "div",
    id: `w${n}`,
    rect: { right },
  });
  const { doc, win } = fakeDocument(
    [
      wide(1, 380),
      wide(2, 520),
      wide(3, 410),
      wide(4, 600),
      wide(5, 365),
      wide(6, 450),
      { tagName: "p", rect: { right: 300 } },
    ],
    600,
  );
  const out = measureOverflow(doc, win);
  expect(out.overflowPx).toBe(240);
  expect(out.offenders).toEqual([
    { target: "div#w4", right: 600 },
    { target: "div#w2", right: 520 },
    { target: "div#w6", right: 450 },
    { target: "div#w3", right: 410 },
    { target: "div#w1", right: 380 },
  ]);
  const clean = fakeDocument([{ tagName: "p", rect: { right: 300 } }], 360);
  expect(measureOverflow(clean.doc, clean.win)).toEqual({ overflowPx: 0, offenders: [] });
});

test("2026-10-29-001 AC-6: brokenImages keeps ten of twelve, a data source to its type and an http source without userinfo, query or fragment, cut at 120; loaded images are not broken", async () => {
  const { brokenImages } = await load();
  const broken = (src: string): FakeElement => ({
    tagName: "img",
    complete: true,
    naturalWidth: 0,
    src,
  });
  const images = [
    broken(`data:image/png;base64,${"A".repeat(5000)}`),
    broken("https://user:pw@cdn.example/a.png?token=abc#x"),
    broken(`https://cdn.example/${"p".repeat(300)}.png`),
    broken("blob:https://shop.test/1"),
    ...Array.from({ length: 8 }, (_, i) => broken(`https://cdn.example/${i}.png`)),
    { tagName: "img", complete: true, naturalWidth: 640, src: "https://cdn.example/ok.png" },
    { tagName: "img", complete: false, naturalWidth: 0, src: "https://cdn.example/loading.png" },
  ];
  const { doc } = fakeDocument(images);
  const out = brokenImages(doc);
  expect(out).toHaveLength(10);
  expect(out[0]).toBe("data:image/png");
  expect(out[1]).toBe("https://cdn.example/a.png");
  expect(out[2]?.length).toBeLessThanOrEqual(120);
  expect(out[3]).toBe("blob:");
  expect(out.join(" ")).not.toContain("token");
  expect(out.join(" ")).not.toContain("pw@");
  expect(out).not.toContain("https://cdn.example/ok.png");
});

test("2026-10-29-001 AC-6: fontsNotLoaded keeps ten families of twelve not loaded, each one line cut at 80", async () => {
  const { fontsNotLoaded } = await load();
  const fonts = [
    { family: '"Brand Sans"', status: "error" },
    { family: `Weird\u0007${"x".repeat(5000)}\nsecond`, status: "unloaded" },
    ...Array.from({ length: 10 }, (_, i) => ({ family: `F${i}`, status: "unloaded" })),
    { family: "Loaded", status: "loaded" },
  ];
  const { doc } = fakeDocument([], 360, fonts);
  const out = await fontsNotLoaded(doc);
  expect(out).toHaveLength(10);
  expect(out[0]).toBe("Brand Sans");
  expect(out[1]?.length).toBeLessThanOrEqual(80);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what must be absent
  expect(out[1]).not.toMatch(/[\u0000-\u001f\n]/);
  expect(out).not.toContain("Loaded");
});

test("2026-10-29-001 AC-6: hiddenText keeps the first-screen blocks visible in the first reading and hidden in the second, ten of twelve, each cut at 80", async () => {
  const { textBlocks, hiddenText } = await load();
  const blocks = (opacity: string): FakeElement[] => [
    ...Array.from({ length: 12 }, (_, i) => ({
      tagName: "p",
      id: `t${i}`,
      text: `${"word ".repeat(30)}${i}`,
      rect: { top: 10 * i, bottom: 10 * i + 8 },
      style: { opacity },
    })),
    { tagName: "h1", id: "steady", text: "Checkout", rect: { top: 0, bottom: 30 } },
    {
      tagName: "p",
      id: "below",
      text: "far",
      rect: { top: 2000, bottom: 2010 },
      style: { opacity },
    },
  ];
  const before = fakeDocument(blocks("1"));
  const after = fakeDocument(blocks("0"));
  const first = textBlocks(before.doc, before.win);
  expect(first.some((b) => b.target === "p#below")).toBe(false);
  const out = hiddenText(first, textBlocks(after.doc, after.win));
  expect(out).toHaveLength(10);
  expect(out[0]?.target).toBe("p#t0");
  expect(out[0]?.text.length).toBeLessThanOrEqual(80);
  expect(out.some((b) => b.target === "h1#steady")).toBe(false);
  expect(hiddenText(first, first)).toEqual([]);
});

test("2026-10-29-001 AC-8: appMeasures gives the numeric cells' right-aligned and tabular shares, each chart's hues and the sidebar's share, numbers only", async () => {
  const { appMeasures } = await load();
  const cell = (text: string, style: Record<string, string> = {}): FakeElement => ({
    tagName: "td",
    text,
    style,
  });
  const marks = (fills: string[]): FakeElement[] =>
    fills.map((fill) => ({ tagName: "rect", style: { fill } }));
  const { doc, win } = fakeDocument([
    cell("12.50", { textAlign: "right", fontVariantNumeric: "tabular-nums" }),
    cell("3", { textAlign: "right" }),
    cell("7 %"),
    cell("Name"),
    { tagName: "svg", children: marks(["red", "blue", "red", "green", "teal", "pink"]) },
    { tagName: "svg", children: marks(["red", "red"]) },
    { tagName: "aside", rect: { width: 324 } },
  ]);
  const out = appMeasures(doc, win);
  expect(out).toEqual({
    width: 360,
    numericCells: 3,
    rightAlignedShare: 0.67,
    tabularShare: 0.33,
    chartHues: [5],
    sidebarShare: 0.9,
  });
  expect(
    Object.values(out)
      .flat()
      .every((v) => typeof v === "number"),
  ).toBe(true);
});

test("2026-10-29-001 AC-6 (the round-1 rulings): an image path keeps its origin and last segment only, an image with no source is not broken, an element's id loses its bidi and zero-width characters, and the no-defect inputs give empty lists", async () => {
  const { brokenImages, fontsNotLoaded, measureOverflow } = await load();
  const broken = (src: string): FakeElement => ({
    tagName: "img",
    complete: true,
    naturalWidth: 0,
    src,
  });
  const { doc } = fakeDocument([
    broken("https://cdn.example/t/SECRET-TOKEN/a.png"),
    { tagName: "img", complete: true, naturalWidth: 0, src: "" },
  ]);
  expect(brokenImages(doc)).toEqual(["https://cdn.example/…/a.png"]);
  const wide = fakeDocument([{ tagName: "div", id: "w‮evil​", rect: { right: 500 } }], 500);
  expect(measureOverflow(wide.doc, wide.win).offenders[0]?.target).toBe("div#wevil");
  const clean = fakeDocument(
    [{ tagName: "img", complete: true, naturalWidth: 10, src: "https://x.test/a.png" }],
    360,
    [{ family: "Brand", status: "loaded" }],
  );
  expect(brokenImages(clean.doc)).toEqual([]);
  expect(await fontsNotLoaded(clean.doc)).toEqual([]);
});

test("2026-10-29-001 AC-6 (the test-quality advisory at round 2): fontsNotLoaded reads the statuses once fonts.ready settles, not before", async () => {
  const { fontsNotLoaded } = await load();
  const fonts = [
    { family: "Brand", status: "loading" },
    { family: "Mono", status: "loading" },
  ];
  const { doc } = fakeDocument([], 360, fonts);
  // The fonts finish loading only as ready settles: a reading taken before it names both.
  (doc.fonts as { ready: Promise<void> }).ready = new Promise<void>((resolve) =>
    setTimeout(() => {
      for (const f of fonts) f.status = "loaded";
      resolve();
    }, 0),
  );
  expect(await fontsNotLoaded(doc)).toEqual([]);
});
