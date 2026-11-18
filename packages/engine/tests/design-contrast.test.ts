// The probe holds a new site's text to the standard's contrast (item 2026-11-17-008): 4.5:1, or 3:1
// for large text, against a ground it can know. Each row plants a small page, reads it with the probe
// in a real browser and looks at two counts: the text blocks under the standard, and the ones whose
// ground the probe could not know. The ratios in the titles are the probe's own formula's.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { recordSurface } from "../src/design.ts";
import { gradeDesign, gradeProbe, type PageProbe } from "../src/design-grade.ts";
import { createWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
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
if (!browser) console.log("design-contrast.test.ts: no browser, the browser rows skip");
const live = browser ? test : test.skip;

const WORDS = "Words to read in one line of this page.";
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
/** A page with a white ground and nothing on it but what the row plants. */
const PAGE = (body: string) =>
  `<!doctype html><html><head><style>*{margin:0;box-sizing:border-box} body{font:16px/1.5 Georgia,serif;color:#1a1a1a;background:#fff;padding:32px}</style></head><body><main>${body}</main></body></html>`;
const P = (style: string, text = WORDS) => `<p style="${style}">${text}</p>`;

/** The two counts of a planted page: text blocks under the standard, and text blocks not judged. */
async function counts(body: string): Promise<[under: number, unknown: number | undefined]> {
  const out = await read(body);
  return [out.lowContrast, out.contrastUnknown];
}
async function read(body: string): Promise<PageProbe> {
  const page = await (browser as Browser).newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(PAGE(body));
  const out = (await page.evaluate(`(${pageProbe.toString()})(document, window)`)) as PageProbe;
  await page.close();
  return out;
}
const contrastOffences = (probe: PageProbe) =>
  gradeProbe(probe, "persuade", {}).filter((o) => o.id === "colour/contrast");

live(
  "contrast AC-7: body text under 4.5:1 against a plain ground fails, on white and on a dark ground a wrapper sets, and text at or over it does not",
  async () => {
    // #777 on white is 4.48:1 and #767676 is 4.54:1.
    const under = await read(P("color:#777"));
    expect(under.lowContrast).toBe(1);
    expect(contrastOffences(under).map((o) => o.text)).toEqual([
      "colour/contrast: 1 text blocks under the standard's contrast (4.5:1, or 3:1 for large text) at 1280",
    ]);
    const over = await read(P("color:#767676"));
    expect(over.lowContrast).toBe(0);
    expect(contrastOffences(over)).toEqual([]);
    // #888 on #222 is 4.49:1 and #8a8a8a is 4.61:1; the ground is the wrapper's, not the text's own.
    const dark = (colour: string) =>
      `<div style="background:#222;padding:8px">${P(`color:${colour}`)}</div>`;
    expect(await counts(dark("#888"))).toEqual([1, 0]);
    expect(await counts(dark("#8a8a8a"))).toEqual([0, 0]);
  },
);

live(
  "contrast AC-8: large text is held to 3:1, at 24 px and at 18.66 px in bold, and to 4.5:1 under those sizes",
  async () => {
    // #949494 on white is 3.03:1 and #999 is 2.85:1.
    expect(await counts(P("font-size:24px;color:#949494"))).toEqual([0, 0]);
    expect(await counts(P("font-size:24px;color:#999"))).toEqual([1, 0]);
    expect(await counts(P("font-size:19px;font-weight:700;color:#949494"))).toEqual([0, 0]);
    expect(await counts(P("font-size:19px;font-weight:400;color:#949494"))).toEqual([1, 0]);
    // 18 px is not 18 pt: bold text of 18 px is body text.
    expect(await counts(P("font-size:18px;font-weight:700;color:#949494"))).toEqual([1, 0]);
    // Each threshold from its other side: 23 px is not large, and neither is 19 px at weight 600.
    expect(await counts(P("font-size:23px;color:#949494"))).toEqual([1, 0]);
    expect(await counts(P("font-size:19px;font-weight:600;color:#949494"))).toEqual([1, 0]);
  },
);

live(
  "contrast AC-9: a gradient is judged by its own colours, a picture is a ground the probe cannot know, and what it cannot know is counted apart",
  async () => {
    const within = (background: string, colour = "#999") =>
      `<div style="background:${background};padding:8px">${P(`color:${colour}`)}</div>`;
    // Under the floor against every colour of the gradient: a gradient cannot pass the text.
    expect(await counts(within("linear-gradient(#fff,#fff)"))).toEqual([1, 0]);
    // 2.85:1 against white and 7.37:1 against black: not judged.
    expect(await counts(within("linear-gradient(#fff,#000)"))).toEqual([0, 1]);
    // Over the floor against every colour: counted in neither.
    expect(await counts(within("linear-gradient(#fff,#eee)", "#1a1a1a"))).toEqual([0, 0]);
    // A colour that is not opaque is laid over what stands under it: a wash of nothing over white is
    // white, so the text still fails, and a translucent wash on the body cannot empty the check.
    expect(await counts(within("linear-gradient(#fff,transparent)"))).toEqual([1, 0]);
    expect(await counts(within("linear-gradient(rgba(0,0,0,.04),rgba(0,0,0,.04))"))).toEqual([
      1, 0,
    ]);
    // A wash over the wrapper's own dark colour: light text on it is judged against the dark ground.
    expect(
      await counts(
        `<div style="background:linear-gradient(rgba(255,255,255,.04),rgba(255,255,255,.04)) #222;padding:8px">${P("color:#f5f5f5")}</div>`,
      ),
    ).toEqual([0, 0]);
    // More colours than the probe combines (seven washes over six colours, forty-two): not judged.
    const six = "linear-gradient(#fff,#fff,#fff,#fff,#fff,#fff)";
    const seven = `linear-gradient(${Array(7).fill("rgba(0,0,0,.04)").join(",")})`;
    expect(
      await counts(
        `<div style="background:${six};padding:8px"><div style="background:${seven};padding:8px">${P("color:#999")}</div></div>`,
      ),
    ).toEqual([0, 1]);
    // A picture inside the element that paints the ground under a wash is still behind the text.
    const washed = `<div style="position:relative;background:#fff;width:300px;height:200px"><img alt="x" src="${PIXEL}" style="display:block;width:300px;height:200px"><div style="position:absolute;top:20px;left:10px;background:linear-gradient(rgba(0,0,0,.04),rgba(0,0,0,.04))">${P("color:#999")}</div></div>`;
    expect(await counts(washed)).toEqual([0, 1]);
    // The colours of a gradient written in a modern colour space are read.
    expect(await counts(within("linear-gradient(oklch(1 0 0),oklch(1 0 0))"))).toEqual([1, 0]);
    // A gradient is the ground only where it paints the whole box. One pixel of black on a white
    // wrapper, not repeated, leaves the page grey on white: the text is judged against the white.
    expect(
      await counts(
        `<div style="background:linear-gradient(#000,#000) no-repeat #fff;background-size:1px 1px;padding:8px">${P("color:#999")}</div>`,
      ),
    ).toEqual([1, 0]);
    // An underline drawn as a gradient in the text's own colour is a mark, not the ground.
    expect(
      await counts(
        `<h2 style="color:#1a1a1a;background:linear-gradient(#1a1a1a,#1a1a1a) no-repeat 0 100%/100% 2px">${WORDS}</h2>`,
      ),
    ).toEqual([0, 0]);
    // The same small gradient repeated in both directions paints the whole box, and is the ground.
    expect(
      await counts(
        `<div style="background:linear-gradient(#000,#000);background-size:1px 1px;padding:8px">${P("color:#999")}</div>`,
      ),
    ).toEqual([0, 0]);
    // The rule is read layer by layer and axis by axis. Not repeated, at a size that reaches the box
    // (`cover`, or twice the box): the ground.
    const fill = (rest: string, colour = "#999") =>
      `<div style="background:#fff;padding:8px"><div style="background:${rest};padding:8px">${P(`color:${colour}`)}</div></div>`;
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 0 0/cover"))).toEqual([0, 0]);
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 0 0/200% 200%"))).toEqual([
      0, 0,
    ]);
    // Repeated along one axis alone it paints a strip: a mark, and the text is judged against the white.
    expect(await counts(fill("linear-gradient(#000,#000) repeat-x 0 0/1px 1px"))).toEqual([1, 0]);
    // Tiles stretched to fill the box (`round`) paint it: the ground.
    expect(await counts(fill("linear-gradient(#000,#000) round 0 0/7px 7px"))).toEqual([0, 0]);
    // Two layers, a mark over a fill: the fill is the ground, and the mark changes nothing.
    const stacked =
      "linear-gradient(#000,#000) no-repeat 0 100%/100% 2px, linear-gradient(#111,#000)";
    expect(await counts(fill(stacked, "#1a1a1a"))).toEqual([1, 0]);
    expect(await counts(fill(stacked, "#f5f5f5"))).toEqual([0, 0]);
    // A mark on an element with its own colour: the text is judged against that colour.
    expect(
      await counts(
        fill(
          "linear-gradient(#f5f5f5,#f5f5f5) no-repeat 0 100%/100% 2px rgba(10,10,10,.9)",
          "#f5f5f5",
        ),
      ),
    ).toEqual([0, 0]);
    // A layer that reaches the box and does not repeat is the ground only where its position cannot
    // move it off. At a percentage, the centre here, it stays: the ground. At an offset in pixels it
    // may show the light colour beneath: not judged, and never a silent pass against the dark layer.
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat center"))).toEqual([0, 0]);
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 400px 0 #fff"))).toEqual([0, 1]);
    // A percentage moves a layer by a share of the difference between the box and the layer. A layer
    // of exactly the box's size is moved by none of it, whatever the percentage: the ground.
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 20000% 0"))).toEqual([0, 0]);
    // A layer larger than the box stays over it from nought to a hundred percent: the ground.
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat center/200% 200%"))).toEqual([
      0, 0,
    ]);
    // One percent larger, at a percentage far outside that range, it stands off the box and the page
    // shows grey on white: not judged, and never a pass against the dark layer.
    expect(
      await counts(fill("linear-gradient(#000,#000) no-repeat 20000% 0/101% 100% #fff")),
    ).toEqual([0, 1]);
    expect(
      await counts(fill("linear-gradient(#000,#000) no-repeat -50% 0/200% 100% #fff")),
    ).toEqual([0, 1]);
    // A background clipped to the element's text paints no ground: the text is judged against the white beneath.
    expect(
      await counts(
        `<div style="background:#fff;padding:8px"><div style="background:linear-gradient(#000,#000);-webkit-background-clip:text;background-clip:text;padding:8px">${P("color:#999")}</div></div>`,
      ),
    ).toEqual([1, 0]);
    // The same with a colour of the element's own: clipped to the text too, it is no ground.
    expect(
      await counts(
        `<div style="background:#fff;padding:8px"><div style="background:linear-gradient(#000,#000) #000;-webkit-background-clip:text;background-clip:text;padding:8px">${P("color:#999")}</div></div>`,
      ),
    ).toEqual([1, 0]);
    // `text` as the clip of one layer among others: the element's own dark colour is painted over
    // the whole box and the page shows dim text on it. Not judged, and never a pass against the
    // white further up.
    expect(
      await counts(
        `<div style="background:#fff;padding:8px"><div style="background-color:#222;background-image:linear-gradient(#000,#000),none;-webkit-background-clip:text,border-box;background-clip:text,border-box;padding:8px">${P("color:#555")}</div></div>`,
      ),
    ).toEqual([0, 1]);
    // A blend mode: white blended as a difference over the element's own black is drawn black, and
    // the page shows dark text on it. Not judged, and never a pass against the white of the layer.
    expect(
      await counts(
        fill("#000 linear-gradient(#fff,#fff);background-blend-mode:difference", "#333"),
      ),
    ).toEqual([0, 1]);
    // A blend mode on an element with no layer blends nothing: its colour is the ground.
    expect(await counts(fill("#fff;background-blend-mode:difference"))).toEqual([1, 0]);
    // The two ends of the range for a layer larger than the box: at exactly nought and at exactly a
    // hundred percent it still lies over all of the box, and is the ground.
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 0% 0%/200% 200%"))).toEqual([
      0, 0,
    ]);
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 100% 100%/200% 200%"))).toEqual([
      0, 0,
    ]);
    // The same rule from the sides the rows above leave: its natural size and no repeat is the ground;
    // `contain` is the ground; one percent short of the box is not known (item 2026-11-17-009: a mark
    // is thin); the vertical axis alone is a mark; `space`, which leaves gaps, is not known.
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat"))).toEqual([0, 0]);
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 0 0/contain"))).toEqual([0, 0]);
    expect(await counts(fill("linear-gradient(#000,#000) no-repeat 0 0/99% 100%"))).toEqual([0, 1]);
    expect(await counts(fill("linear-gradient(#000,#000) repeat-y 0 0/1px 1px"))).toEqual([1, 0]);
    expect(await counts(fill("linear-gradient(#000,#000) space 0 0/7px 7px"))).toEqual([0, 1]);
    // A length that reaches the box is the ground, and one pixel short of it is not known.
    const sized = (width: number) =>
      `<div style="background:#fff;padding:8px"><div style="width:300px;height:100px;background:linear-gradient(#000,#000) no-repeat 0 0/${width}px 100px">${P("color:#999")}</div></div>`;
    expect(await counts(sized(300))).toEqual([0, 0]);
    expect(await counts(sized(299))).toEqual([0, 1]);
    // Two layers that both paint the box: the top one alone is the ground.
    expect(await counts(fill("linear-gradient(#fff,#fff), linear-gradient(#000,#000)"))).toEqual([
      1, 0,
    ]);
    // One size for two layers serves both: each is a mark, and the white beneath is the ground.
    expect(
      await counts(
        `<div style="background:#fff;padding:8px"><div style="background-image:linear-gradient(#000,#000),linear-gradient(#000,#000);background-size:1px 1px;background-repeat:no-repeat;padding:8px">${P("color:#999")}</div></div>`,
      ),
    ).toEqual([1, 0]);
    // Two washes are laid from the lowest up: half white over white, then half black over that, is a
    // mid grey, which large white text holds at 3.98:1. Laid the other way round it would not.
    const washes =
      "linear-gradient(rgba(0,0,0,.5),rgba(0,0,0,.5)), linear-gradient(rgba(255,255,255,.5),rgba(255,255,255,.5))";
    expect(
      await counts(
        `<div style="background:#fff;padding:8px"><div style="background:${washes};padding:8px">${P("font-size:24px;color:#fff")}</div></div>`,
      ),
    ).toEqual([0, 0]);
    // Thirty-six combined colours are still judged: six washes over six colours.
    const sixWashes = `linear-gradient(${Array(6).fill("rgba(0,0,0,.04)").join(",")})`;
    expect(
      await counts(
        `<div style="background:linear-gradient(#fff,#fff,#fff,#fff,#fff,#fff);padding:8px"><div style="background:${sixWashes};padding:8px">${P("color:#999")}</div></div>`,
      ),
    ).toEqual([1, 0]);
    // A picture layer leaves its text not judged whatever its size: a bullet that does not repeat.
    expect(await counts(fill(`url(${PIXEL}) no-repeat 0 0/8px 8px`))).toEqual([0, 1]);
    // A background picture on an ancestor: not judged.
    expect(await counts(within(`url(${PIXEL})`))).toEqual([0, 1]);
    // A picture the probe lists (300 by 200 px) behind the text: not judged.
    const over = `<div style="position:relative;width:300px;height:200px"><img alt="x" src="${PIXEL}" style="display:block;width:300px;height:200px"><p style="position:absolute;top:20px;left:10px;color:#999">${WORDS}</p></div>`;
    expect(await counts(over)).toEqual([0, 1]);
    // A card that paints its own ground over a picture: the picture is not behind the text, and it is judged.
    const card = `<div style="position:relative;width:400px;height:300px"><img alt="x" src="${PIXEL}" style="display:block;width:400px;height:300px"><div style="position:absolute;top:20px;left:20px;width:300px;background:#fff;padding:8px">${P("color:#999")}</div></div>`;
    expect(await counts(card)).toEqual([1, 0]);
    // A picture beside the text, their boxes apart: the text is judged.
    const beside = `<div style="display:flex;gap:40px"><img alt="x" src="${PIXEL}" style="width:300px;height:200px"><div style="width:400px">${P("color:#999")}</div></div>`;
    expect(await counts(beside)).toEqual([1, 0]);
    // The control: the same text on a plain white ground is under the standard.
    expect(
      await counts(`<div style="background:#fff;padding:8px">${P("color:#999")}</div>`),
    ).toEqual([1, 0]);
  },
);

live(
  "contrast AC-10: the text inside a disabled control is left out, and a disabled attribute on any other element leaves nothing out",
  async () => {
    const area = (attr: string) =>
      `<fieldset ${attr}><textarea style="color:#999;background:#fff;width:400px;height:60px">${WORDS}</textarea></fieldset>`;
    expect(await counts(area("disabled"))).toEqual([0, 0]);
    expect(await counts(area(""))).toEqual([1, 0]);
    const link = (attr: string) => `<a role="button" ${attr} style="color:#999">${WORDS}</a>`;
    expect(await counts(link('aria-disabled="true"'))).toEqual([0, 0]);
    expect(await counts(link(""))).toEqual([1, 0]);
    // A control disabled by its own attribute, by its own state, and a link that is one by its kind.
    const own = (attr: string) =>
      `<textarea ${attr} style="color:#999;background:#fff;width:400px;height:60px">${WORDS}</textarea>`;
    expect(await counts(own("disabled"))).toEqual([0, 0]);
    expect(await counts(own('aria-disabled="true"'))).toEqual([0, 0]);
    expect(
      await counts(`<a href="/x" aria-disabled="true" style="color:#999">${WORDS}</a>`),
    ).toEqual([0, 0]);
    // The first legend of a disabled fieldset is not disabled, and neither is a control in it.
    expect(
      await counts(
        `<fieldset disabled><legend><textarea style="color:#999;background:#fff;width:400px;height:60px">${WORDS}</textarea></legend></fieldset>`,
      ),
    ).toEqual([1, 0]);
    // A wrapper is no control: its attribute leaves the paragraph in the count, and so does a
    // control's role on an element that holds more than a label.
    // The label's limit from both sides: a hundred characters is a label, a hundred and one is not.
    const labelled = (n: number) =>
      `<span role="button" aria-disabled="true" style="color:#999">${"a".repeat(n)}</span>`;
    expect(await counts(labelled(100))).toEqual([0, 0]);
    expect(await counts(labelled(101))).toEqual([1, 0]);
    const long = `${P("color:#999", `${WORDS} ${WORDS} ${WORDS}`)}${P("color:#999")}`;
    expect(await counts(`<div role="button" aria-disabled="true">${long}</div>`)).toEqual([2, 0]);
    expect(await counts(`<div aria-disabled="true">${P("color:#999")}</div>`)).toEqual([1, 0]);
    expect(await counts(`<div disabled>${P("color:#999")}</div>`)).toEqual([1, 0]);
  },
);

/** A probe as the fixture records one, clean but for the two counts a row sets. */
const recorded = (extra: Partial<PageProbe>): PageProbe => ({
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
  ...extra,
});

/** A page of a new site graded from one recorded probe, or from two at two widths. */
const graded = (probe: PageProbe, narrow?: PageProbe) => {
  const root = makeRepo({ "package.json": '{"name":"t"}\n' });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "a site");
  recordSurface(paths, work.id, "persuade", "world", "2026-11-17");
  write(
    root,
    `.crew/work/${work.id}/review/ui/home-default.json`,
    JSON.stringify({
      page: "home",
      state: "default",
      viewports: [{ width: 1280, page: probe }, ...(narrow ? [{ width: 360, page: narrow }] : [])],
    }),
  );
  return gradeDesign(paths, work);
};

test("contrast AC-11: the count of text not judged is a line of the grade's result and no verdict, and a probe recorded before the count reads as before", () => {
  const unjudged = recorded({ contrastUnknown: 3 });
  expect(contrastOffences(unjudged)).toEqual([]);
  const result = graded(unjudged);
  expect(result.offences.filter((o) => o.includes("colour/contrast"))).toEqual([]);
  expect(result.lines).toContain(
    "contrast: 3 text blocks not judged, a ground or a text colour the probe could not know (home)",
  );
  // A page read at two widths says its largest count once.
  const two = graded(
    recorded({ contrastUnknown: 1 }),
    recorded({ width: 360, contrastUnknown: 4 }),
  );
  expect(two.lines.filter((l) => l.startsWith("contrast:"))).toEqual([
    "contrast: 4 text blocks not judged, a ground or a text colour the probe could not know (home)",
  ]);
  // A probe recorded before this item has no such count: it grades on lowContrast and adds no line.
  const older = recorded({ lowContrast: 2 });
  expect("contrastUnknown" in older).toBe(false);
  expect(contrastOffences(older)).toHaveLength(1);
  const before = graded(older);
  expect(before.offences.filter((o) => o.includes("colour/contrast"))).toHaveLength(1);
  expect(before.lines.filter((l) => l.startsWith("contrast:"))).toEqual([]);
  expect(graded(recorded({})).lines.filter((l) => l.startsWith("contrast:"))).toEqual([]);
});

test("contrast AC-12: no page of the crew gives the probe's old floor, and the Visual craft skill says what the probe holds", () => {
  const skill = readFileSync(
    join(ROOT, "plugins/core/skills/wizardingcode-frontend-visual-craft/SKILL.md"),
    "utf8",
  );
  expect(skill).toContain(
    "The crew's probe holds text to 4.5:1, or 3:1 for large text, against a ground it can know",
  );
  expect(skill).toContain("is not judged by the probe");
  expect(skill).not.toContain("yet to resolve");
  const files = [
    "plugins/core/e2e/measure.mjs",
    "packages/engine/src/design-grade.ts",
    ...walk("plugins/core/skills"),
  ];
  expect(files.length).toBeGreaterThan(20);
  for (const file of files)
    expect(readFileSync(join(ROOT, file), "utf8"), file).not.toMatch(/(?<![\d.])2\.6(?![\d.])/);
});

// Item 2026-11-17-009: what the count leaves out or cannot see. A mark is thin, the text of disabled
// controls is counted apart, a text whose colour the probe cannot judge is not judged, and the
// grade's sentence says what its count holds.

/** A box of 300 by 100 px on a white wrapper, with one paragraph in it. */
const boxed = (style: string, colour = "#999") =>
  `<div style="background:#fff;padding:8px"><div style="width:300px;height:100px;${style}">${P(`color:${colour}`)}</div></div>`;
const layered = (background: string, colour = "#999") => boxed(`background:${background}`, colour);
const BLACK = "linear-gradient(#000,#000)";

live(
  "count AC-8: a layer that falls short of the box is a mark only where it is thin, alone and with the element's other marks, and is otherwise not known",
  async () => {
    // Ninety percent of the box, dark text on it: today's silent pass against the white beneath.
    expect(await counts(layered(`${BLACK} no-repeat 0 0/90% 90%`, "#333"))).toEqual([0, 1]);
    expect(await counts(layered(`${BLACK} no-repeat 0 0/99% 99%`))).toEqual([0, 1]);
    expect(await counts(layered(`${BLACK} no-repeat 0 0/299px 299px`))).toEqual([0, 1]);
    expect(await counts(layered(`${BLACK} space 0 0/1px 1px`))).toEqual([0, 1]);
    // `space` on a layer that reaches the box lays one whole tile and no gap: the ground, as before.
    expect(await counts(layered(`${BLACK} space`))).toEqual([0, 0]);
    expect(await counts(layered(`${BLACK} space 0 0/200% 200%`))).toEqual([0, 0]);
    // Four pixels is a mark, and the text is judged against the white beneath; five is not known.
    expect(await counts(layered(`${BLACK} no-repeat 0 100%/100% 4px`))).toEqual([1, 0]);
    expect(await counts(layered(`${BLACK} no-repeat 0 100%/100% 5px`))).toEqual([0, 1]);
    // One pixel, and one pixel repeated along one axis alone, stay marks.
    expect(await counts(layered(`${BLACK} no-repeat 0 0/1px 1px`))).toEqual([1, 0]);
    expect(await counts(layered(`${BLACK} repeat-x 0 0/1px 1px`))).toEqual([1, 0]);
    // Marks are thin together: five rules of 4 px laid into a band of 20 px are not known.
    const band = [0, 4, 8, 12, 16].map((y) => `${BLACK} no-repeat 0 ${y}px/100% 4px`).join(",");
    expect(await counts(layered(`${band} #fff`, "#333"))).toEqual([0, 1]);
    // An underline and an overline of 2 px each add up to 4: still marks.
    expect(
      await counts(layered(`${BLACK} no-repeat 0 0/100% 2px,${BLACK} no-repeat 0 100%/100% 2px`)),
    ).toEqual([1, 0]);
    // The sum along the horizontal axis: two rules of 2 px side by side stay marks, 3 px and 2 px do not.
    expect(
      await counts(layered(`${BLACK} no-repeat 0 0/2px 100%,${BLACK} no-repeat 100% 0/2px 100%`)),
    ).toEqual([1, 0]);
    expect(
      await counts(layered(`${BLACK} no-repeat 0 0/3px 100%,${BLACK} no-repeat 100% 0/2px 100%`)),
    ).toEqual([0, 1]);
    // 3 px and 2 px add up to 5: each alone is thin, together they are not.
    expect(
      await counts(layered(`${BLACK} no-repeat 0 0/100% 3px,${BLACK} no-repeat 0 100%/100% 2px`)),
    ).toEqual([0, 1]);
  },
);

live(
  "count AC-9: a text whose colour the probe cannot judge is counted as not judged: under half opacity, or filled with another colour than its own",
  async () => {
    expect(
      await counts(
        `<h2 style="color:transparent;background:linear-gradient(#000,#fff);-webkit-background-clip:text;background-clip:text">${WORDS}</h2>`,
      ),
    ).toEqual([0, 1]);
    expect(await counts(P("color:rgba(153,153,153,0.4)"))).toEqual([0, 1]);
    // Exactly half opacity is judged, by its red, green and blue.
    expect(await counts(P("color:rgba(153,153,153,0.5)"))).toEqual([1, 0]);
    // Glyphs filled with a colour that is not the text's own: the page shows grey, the colour says black.
    expect(await counts(P("color:#000;-webkit-text-fill-color:#999"))).toEqual([0, 1]);
    expect(await counts(P("color:#999"))).toEqual([1, 0]);
    // A text that fails by its colour keeps its offence whatever it is filled with: a fill moves no
    // offence into the count.
    expect(await counts(P("color:#999;-webkit-text-fill-color:#000"))).toEqual([1, 0]);
    // The usual gradient heading: an opaque colour, glyphs filled with nothing.
    expect(await counts(P("color:#000;-webkit-text-fill-color:transparent"))).toEqual([0, 1]);
    // A fill set to the text's own colour is no other colour: judged.
    expect(await counts(P("color:#999;-webkit-text-fill-color:#999"))).toEqual([1, 0]);
  },
);

live(
  "count AC-11: the sides of the ground's rule that the reviews of item 2026-11-17-008 named and no row held",
  async () => {
    // A blend mode on one layer of two.
    expect(
      await counts(layered(`${BLACK},${BLACK};background-blend-mode:normal,multiply`)),
    ).toEqual([0, 1]);
    // Both clips `text`: no ground, the text is judged against the white beneath.
    expect(
      await counts(
        boxed(
          `background-image:${BLACK},${BLACK};-webkit-background-clip:text,text;background-clip:text,text`,
        ),
      ),
    ).toEqual([1, 0]);
    // `text` as the last entry of a mixed list.
    expect(
      await counts(
        boxed(
          `background-color:#222;background-image:none,${BLACK};-webkit-background-clip:border-box,text;background-clip:border-box,text`,
          "#555",
        ),
      ),
    ).toEqual([0, 1]);
    // The vertical offset alone.
    expect(await counts(layered(`${BLACK} no-repeat 0 400px/100% 100%`))).toEqual([0, 1]);
    // Repeated along the horizontal axis alone, on a size that is not symmetric: the ground.
    expect(await counts(layered(`${BLACK} repeat-x 0 0/1px 100%`))).toEqual([0, 0]);
    // Thin along one axis and not known along the other: a mark comes first.
    expect(await counts(layered(`${BLACK} no-repeat 0 40px/2px 100%`))).toEqual([1, 0]);
    // An offset on the thin axis changes nothing.
    expect(await counts(layered(`${BLACK} no-repeat 40px 0/2px 100%`))).toEqual([1, 0]);
    // An offset of exactly nought, in pixels.
    expect(await counts(layered(`${BLACK} no-repeat 0px 0px/cover`))).toEqual([0, 0]);
    // The element's own colour at exactly half opacity is no ground.
    expect(await counts(layered("rgba(0,0,0,0.5)"))).toEqual([1, 0]);
  },
);

/** The characters of text the probe left out as a disabled control's. */
const left = async (body: string) => (await read(body)).contrastDisabled;
const LABEL = "a".repeat(57);

live(
  "count AC-2: the text of a disabled control is counted apart, in characters, and stays out of the two other counts",
  async () => {
    const link = (attr: string) => `<a role="button" ${attr} style="color:#999">${LABEL}</a>`;
    expect(await counts(link('aria-disabled="true"'))).toEqual([0, 0]);
    expect(await left(link('aria-disabled="true"'))).toBe(57);
    expect(await counts(link(""))).toEqual([1, 0]);
    expect(await left(link(""))).toBe(0);
    // A page cut into short disabled controls: every character is counted.
    const tab = `<span role="tab" aria-disabled="true" style="color:#999">${LABEL}</span> `;
    expect(await left(tab.repeat(3))).toBe(171);
    expect(await left(P("color:#999"))).toBe(0);
    // A form control's text is counted too.
    expect(
      await left(
        `<textarea disabled style="color:#999;background:#fff;width:400px;height:60px">${LABEL}</textarea>`,
      ),
    ).toBe(57);
    // The order of the exclusions. The navigation comes first: a disabled control in a `nav` is in no count.
    const off = (style: string) =>
      `<span role="tab" aria-disabled="true" style="${style}">${LABEL}</span>`;
    expect(await left(`<nav>${off("color:#999")}</nav>`)).toBe(0);
    // The disabled control comes before the colour: its transparent text is counted as disabled, not as not judged.
    expect(await counts(off("color:transparent"))).toEqual([0, 0]);
    expect(await left(off("color:transparent"))).toBe(57);
    // A disabled button's text is left out by the older exclusion, before any count.
    expect(await left(`<button disabled style="color:#999">${LABEL}</button>`)).toBe(0);
  },
);

const DISABLED_LINE = (l: string) => l.includes("disabled controls");

test("count AC-3: the grade says how many characters disabled controls hold on a page where they are more than a hundred, as a line and no verdict", () => {
  const probe = (n: number, extra: Partial<PageProbe> = {}) =>
    recorded({ ...extra, contrastDisabled: n });
  const over = graded(probe(101));
  expect(over.lines).toContain(
    "contrast: 101 characters of text inside disabled controls not judged (home)",
  );
  expect(over.offences.filter((o) => o.includes("colour/contrast"))).toEqual([]);
  expect(graded(probe(100)).lines.filter(DISABLED_LINE)).toEqual([]);
  // A page read at two widths says its largest count once.
  expect(graded(probe(40), probe(300, { width: 360 })).lines.filter(DISABLED_LINE)).toEqual([
    "contrast: 300 characters of text inside disabled controls not judged (home)",
  ]);
  // The largest, whichever width it stands at.
  expect(graded(probe(300), probe(40, { width: 360 })).lines.filter(DISABLED_LINE)).toEqual([
    "contrast: 300 characters of text inside disabled controls not judged (home)",
  ]);
  // Both lines of one page, each with its own count.
  expect(
    graded(probe(150, { contrastUnknown: 3 })).lines.filter((l) => l.startsWith("contrast:")),
  ).toEqual([
    "contrast: 3 text blocks not judged, a ground or a text colour the probe could not know (home)",
    "contrast: 150 characters of text inside disabled controls not judged (home)",
  ]);
  // A count that is no finite number adds no line, and a fraction is floored.
  expect(graded(probe(Number.POSITIVE_INFINITY)).lines.filter(DISABLED_LINE)).toEqual([]);
  expect(graded(probe(100.9)).lines.filter(DISABLED_LINE)).toEqual([]);
  // A probe recorded without the count adds no line.
  expect(graded(recorded({})).lines.filter(DISABLED_LINE)).toEqual([]);
});

test("count AC-5: the grade's sentence for text not judged says what its count holds, and the old sentence is in no source file", () => {
  expect(graded(recorded({ contrastUnknown: 3 })).lines).toContain(
    "contrast: 3 text blocks not judged, a ground or a text colour the probe could not know (home)",
  );
  const files = ["plugins/core/e2e/measure.mjs", ...walk("packages/engine/src")];
  expect(files.length).toBeGreaterThan(20);
  for (const file of files)
    expect(readFileSync(join(ROOT, file), "utf8"), file).not.toContain(
      "a picture or a gradient of mixed contrast",
    );
});

/** Every file under a folder of the repository, by its path from the root. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}
