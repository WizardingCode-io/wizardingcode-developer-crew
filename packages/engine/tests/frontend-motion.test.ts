// The frontend team's motion skill (item 2026-11-19-001): how a move is chosen and made. The text
// rows read the skill's files as a session would; one row runs the spring's function from the
// skill's own block; the browser row builds a page from the skill's own blocks and reads it.
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = join(import.meta.dir, "..", "..", "..");
const DIR = "plugins/core/skills/wizardingcode-frontend-motion";
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const part = (name: string): string => repoFile(`${DIR}/${name}`);
const REFERENCES = [
  "references/vocabulary.md",
  "references/recipes.md",
  "references/review.md",
  "references/gestures.md",
];
const PARTS = ["SKILL.md", ...REFERENCES];
const LABELS = ["norm", "platform-guidance", "published-study", "hypothesis"];

const HEADINGS = [
  "When",
  "How to read a row",
  "The gate",
  "The thesis",
  "Made by hand",
  "Choreography",
  "Springs",
  "Gestures",
  "Page, view and scroll-linked motion",
  "Performance",
  "Reduced motion and the norms",
  "Review",
  "Where the sources disagree",
  "What the team never claims",
  "What the skill refuses",
  "Done when",
  "Provenance",
];
const QUESTIONS = [
  "How often is it met",
  "Did a key start it",
  "Which purpose",
  "What does it do for the task",
  "Which tool",
];
const PURPOSES = ["feedback", "orientation", "continuity", "attention", "material", "signature"];
const THESIS = ["device", "purpose", "value", "rejected", "reduced"];
const ONE_RISE =
  "The same rise on every section counts once toward the floor of eight, however many sections repeat it.";
const REFUSALS = [
  "a library by default",
  "a reveal on every section",
  "parallax under reduced motion",
  "bounce without the thesis",
  "hijacked scroll",
  "an animation on a keyboard action",
];
const AUTHORS = ["Emil", "Kowalski", "GreenSock", "Vaul", "Sonner"];

/** The fenced blocks of a Markdown text, each with the word after its opening fence. */
function fences(text: string): { lang: string; body: string }[] {
  const out: { lang: string; body: string }[] = [];
  const pattern = /^```([a-z]*)\n([\s\S]*?)^```$/gm;
  for (let m = pattern.exec(text); m; m = pattern.exec(text))
    out.push({ lang: m[1] ?? "", body: m[2] ?? "" });
  return out;
}
/** A Markdown text with its fenced blocks taken out: the prose and the tables. */
const prose = (text: string): string => text.replace(/^```[a-z]*\n[\s\S]*?^```$/gm, "");

/** The text of a `##` section, from its heading to the next heading of that level. */
function section(text: string, title: string): string {
  const start = text.indexOf(`## ${title}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + title.length + 4);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The recipe of that number in `references/recipes.md`: from its `### n.` heading to the next. */
function piece(n: number): { text: string; css: string; js: string; html: string } {
  const recipes = part("references/recipes.md");
  const start = recipes.search(new RegExp(`^### ${n}\\. `, "m"));
  if (start < 0) return { text: "", css: "", js: "", html: "" };
  const rest = recipes.slice(start + 4);
  const end = rest.search(/^### \d+\. /m);
  const text = end < 0 ? rest : rest.slice(0, end);
  const of = (lang: string) =>
    fences(text)
      .filter((f) => f.lang === lang)
      .map((f) => f.body)
      .join("\n");
  return { text, css: of("css"), js: of("js"), html: of("html") };
}

/** The rows of every table of a text whose header names a Label column: the cells of each. */
function ruleRows(text: string): string[][] {
  const rows: string[][] = [];
  let inRules = false;
  for (const line of prose(text).split("\n")) {
    if (!line.startsWith("|")) {
      inRules = false;
      continue;
    }
    const cells = line
      .slice(1, line.lastIndexOf("|"))
      .split("|")
      .map((c) => c.trim());
    if (cells[1] === "Label") {
      inRules = true;
      continue;
    }
    if (inRules && !/^:?-+:?$/.test(cells[0] ?? "")) rows.push(cells);
  }
  return rows;
}

test("motion AC-1: the skill has visual craft's form, its sections in order, its three references and its sources file, and three skills send a session to it", () => {
  for (const name of [...PARTS, "sources.md"])
    expect(existsSync(join(ROOT, DIR, name)), name).toBe(true);
  const skill = part("SKILL.md");
  expect(skill).toMatch(/^---\nname: wizardingcode-frontend-motion\n/);
  const description = /^description: "?(.*?)"?$/m.exec(skill)?.[1] ?? "";
  expect(description.length).toBeGreaterThan(40);
  expect(description.length).toBeLessThanOrEqual(200);
  expect([...skill.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(HEADINGS);
  for (const name of [...REFERENCES, "sources.md"]) expect(skill, name).toContain(name);
  for (const other of [
    "wizardingcode-frontend-visual-craft",
    "wizardingcode-design-direction",
    "wizardingcode-design-build",
  ])
    expect(repoFile(`plugins/core/skills/${other}/SKILL.md`), other).toContain(
      "wizardingcode-frontend-motion",
    );
});

test("motion AC-2: every rule row has four cells, a label and a source, and the gate, the purposes, the thesis and the rule of the one rise stand by their words", () => {
  const skill = part("SKILL.md");
  const rows = ruleRows(skill);
  expect(rows.length).toBeGreaterThanOrEqual(30);
  for (const row of rows) {
    expect(row.length, row[0]).toBe(4);
    expect(LABELS, row[0]).toContain((row[1] ?? "").replaceAll("`", ""));
    expect((row[2] ?? "").length, row[0]).toBeGreaterThan(5);
    expect((row[3] ?? "").length, row[0]).toBeGreaterThan(5);
  }
  const inOrder = (text: string, words: string[]) => {
    let at = -1;
    for (const word of words) {
      const next = text.indexOf(word, at + 1);
      expect(next, word).toBeGreaterThan(at);
      at = next;
    }
  };
  const gate = section(skill, "The gate");
  inOrder(gate, QUESTIONS);
  inOrder(
    gate,
    PURPOSES.map((p) => `\`${p}\``),
  );
  expect(gate).toContain("A move that names none is not built");
  const thesis = section(skill, "The thesis");
  inOrder(
    thesis,
    THESIS.map((p) => `\`${p}\``),
  );
  expect(section(skill, "Made by hand")).toContain(ONE_RISE);
});

test("motion AC-3: the code is the browser's alone, parses, and holds its feature tests and its reduced-motion branches", () => {
  const banned = [
    /\bimport\b/,
    /@import/,
    /\brequire\(/,
    /\bfetch\(/,
    /[a-z][a-z0-9+.-]*:\/\//i,
    /(^|[\s"'(=])\/\/[a-z0-9-]+\.[a-z]/im,
    /\bgsap\b/i,
    /\bframer\b/i,
    /\blenis\b/i,
    /\banime\b/i,
    /motion\//,
  ];
  let blocksSeen = 0;
  for (const name of [...PARTS, "sources.md"]) {
    for (const block of fences(part(name))) {
      blocksSeen++;
      // A comment's own slashes are no address: the address pattern asks for a host after them.
      for (const pattern of banned)
        expect(pattern.test(block.body), `${name}: ${pattern} in a ${block.lang} block`).toBe(
          false,
        );
      if (block.lang === "js") expect(() => new Function(block.body), name).not.toThrow();
      if (block.lang === "css") {
        if (/animation-timeline|@starting-style/.test(block.body))
          expect(block.body, name).toContain("@supports");
        if (/(^|[\s;{])(animation|transition)(-[a-z-]+)?\s*:/m.test(block.body))
          expect(block.body, name).toContain("prefers-reduced-motion");
        for (const hover of block.body.matchAll(/:hover/g)) {
          const before = block.body.slice(0, hover.index);
          const opened = before.lastIndexOf("@media (hover: hover)");
          expect(opened, `${name}: a hover rule outside the hover query`).toBeGreaterThanOrEqual(0);
          const between = before.slice(opened);
          const depth = (between.match(/\{/g) ?? []).length - (between.match(/\}/g) ?? []).length;
          expect(depth, `${name}: a hover rule after the hover query closed`).toBeGreaterThan(0);
        }
        for (const rule of block.body.matchAll(/\{[^{}]*animation-timeline[^{}]*\}/g)) {
          const shorthand = rule[0].search(/\banimation:/);
          expect(shorthand, "the shorthand stands in the rule").toBeGreaterThanOrEqual(0);
          expect(rule[0].indexOf("animation-timeline")).toBeGreaterThan(shorthand);
        }
      }
      if (block.lang === "js" && /\.animate\(/.test(block.body))
        expect(block.body, name).toMatch(/reducedMotion|prefers-reduced-motion/);
      // No block's markup carries a hidden state of its own: a page with no stylesheet shows all.
      if (block.lang === "html") expect(block.body, name).not.toMatch(/style="|hidden/);
    }
  }
  expect(blocksSeen).toBeGreaterThanOrEqual(14);
  // The ten pieces, each with code; the view transition's pseudo-elements beside its feature test.
  for (let n = 1; n <= 10; n++) {
    const p = piece(n);
    expect(p.css.length + p.js.length, `piece ${n}`).toBeGreaterThan(40);
  }
  expect(piece(11).text).toBe("");
  const view = piece(10);
  expect(view.css).toContain("::view-transition");
  expect(view.js).toMatch(/if \(!document\.startViewTransition/);
  expect(piece(9).css).toMatch(
    /@supports \(animation-timeline: view\(\)\)[\s\S]*prefers-reduced-motion: no-preference/,
  );
  expect(piece(5).css).toContain("transition-behavior: allow-discrete");
  expect(piece(8).js).toContain("IntersectionObserver");
});

type Spring = (
  duration?: number,
  bounce?: number,
  points?: number,
) => { easing: string; durationMs: number };

/** A damped spring's place at a time, written out here and never taken from the skill. */
function closedForm(duration: number, bounce: number, t: number): number {
  const w = (2 * Math.PI) / duration;
  const z = 1 - bounce;
  if (z >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

test("motion AC-4: the spring's function gives a damped spring's curve, and the text writes what it returns", () => {
  const spring = new Function(`${piece(2).js}\nreturn springLinear;`)() as Spring;
  const stops = (easing: string): number[] => {
    expect(easing).toMatch(/^linear\([0-9., -]+\)$/);
    return easing
      .slice(7, -1)
      .split(",")
      .map((s) => Number(s.trim()));
  };
  for (const [duration, bounce] of [
    [0.4, 0],
    [0.5, 0.2],
  ] as const) {
    const made = spring(duration, bounce);
    const values = stops(made.easing);
    expect(values.every((v) => Number.isFinite(v))).toBe(true);
    expect(values.length).toBeGreaterThanOrEqual(20);
    expect(values[0]).toBe(0);
    expect(values.at(-1)).toBe(1);
    expect(made.durationMs).toBeGreaterThan(duration * 1000);
    expect(made.durationMs, "a run that ends near its settle").toBeLessThan(duration * 4000);
    expect(Math.abs((values.at(-2) ?? 0) - 1)).toBeLessThanOrEqual(0.002);
    // Ten stops spread over the run, each against the closed form at that stop's own time.
    const last = values.length - 1;
    for (let k = 1; k <= 10; k++) {
      const i = Math.round((k * (last - 1)) / 10);
      const t = (made.durationMs / 1000) * (i / last);
      expect(
        Math.abs((values[i] ?? 0) - closedForm(duration, bounce, t)),
        `bounce ${bounce}, stop ${i}`,
      ).toBeLessThanOrEqual(0.005);
    }
    const peak = Math.max(...values);
    if (bounce === 0) expect(peak).toBe(1);
    else {
      expect(peak).toBeGreaterThan(1.005);
      expect(peak).toBeLessThanOrEqual(1.02);
    }
  }
  const written = [...prose(part("references/recipes.md")).matchAll(/`(linear\([^`]+\))`/g)].map(
    (m) => m[1],
  );
  expect(written).toEqual([spring(0.4, 0).easing, spring(0.5, 0.2).easing]);
  const text = piece(2).text;
  expect(text).toContain(`${spring(0.4, 0).durationMs} ms`);
  expect(text).toContain(`${spring(0.5, 0.2).durationMs} ms`);
});

// The standard's values, each read from the standard's own row and found in the skill's row of
// the same rule. The words a rule is found by are fixed here, before the skill's text.
const NUMBERS: { rule: string; file: string; row: RegExp; values: string[] }[] = [
  {
    rule: "Feedback on a control",
    file: "frontend.md",
    row: /^\| 100\+ uses a day/m,
    values: ["120 ms"],
  },
  {
    rule: "Tens of uses a day",
    file: "frontend.md",
    row: /^\| Tens of uses a day/m,
    values: ["200 ms"],
  },
  { rule: "An occasional move", file: "frontend.md", row: /^\| Occasional/m, values: ["300 ms"] },
  {
    rule: "The signature",
    file: "frontend-site.md",
    row: /^\| The signature move/m,
    values: ["800 ms"],
  },
  { rule: "A press", file: "frontend.md", row: /^\| Press/m, values: ["scale(0.97)"] },
  {
    rule: "The enter and exit curve",
    file: "frontend.md",
    row: /^\| Easing, enter and exit/m,
    values: ["cubic-bezier(0.16, 1, 0.3, 1)"],
  },
  {
    rule: "A stagger inside an entrance",
    file: "frontend-site.md",
    row: /^\| Stagger inside an entrance/m,
    values: ["240 ms"],
  },
  {
    rule: "An entrance",
    file: "frontend-site.md",
    row: /^\| Entrance/m,
    values: ["16 to 24 px", "700 ms"],
  },
  {
    rule: "The floor",
    file: "frontend-site.md",
    row: /^\| Moving elements/m,
    values: ["at least eight"],
  },
  {
    rule: "A literal's limit",
    file: "frontend-site.md",
    row: /^\| Duration lint/m,
    values: ["900 ms", "500 ms"],
  },
  { rule: "A frame", file: "frontend.md", row: /^\| Frames/m, values: ["16.7 ms"] },
];
const OWNED = ["the source's", "the spring's", "the skill's own"];

test("motion AC-6: the standard's eleven values stand in the skill as the standard holds them, and every other figure says whose it is", () => {
  const skill = part("SKILL.md");
  const rows = ruleRows(skill);
  const standardRows: string[] = [];
  for (const n of NUMBERS) {
    const standard = repoFile(`plugins/core/skills/crew/references/${n.file}`);
    const at = standard.search(n.row);
    expect(at, `${n.file}: ${n.rule}`).toBeGreaterThanOrEqual(0);
    const line = standard.slice(at, standard.indexOf("\n", at));
    const mine = rows.find((r) => (r[0] ?? "").startsWith(n.rule));
    expect(mine, n.rule).toBeDefined();
    for (const value of n.values) {
      expect(line, `${n.file} holds ${value}`).toContain(value);
      expect(mine?.[0] ?? "", `${n.rule}: ${value}`).toContain(value);
    }
    expect(mine?.[2] ?? "", n.rule).toContain(n.file);
    standardRows.push(mine?.[0] ?? "");
  }
  // The other direction, over the prose and the tables of the skill's four files.
  const figure = /\b\d+(?:\.\d+)?\s?(?:ms|px|s)\b|cubic-bezier\(/;
  const loose: string[] = [];
  for (const name of PARTS)
    for (const line of prose(part(name)).split("\n")) {
      if (!figure.test(line)) continue;
      if (standardRows.some((row) => row && line.includes(row))) continue;
      const cells = line.startsWith("|") ? line.split("|").map((c) => c.trim()) : [];
      if (cells[2] === "`hypothesis`") continue;
      if (OWNED.some((words) => line.includes(words))) continue;
      loose.push(`${name}: ${line.slice(0, 90)}`);
    }
  expect(loose).toEqual([]);
});

test("motion AC-7: the skill says what it refuses, gives each conflict of the sources a default, and says which figures were not read at their origin", () => {
  const skill = part("SKILL.md");
  const refuses = section(skill, "What the skill refuses");
  for (const words of REFUSALS) expect(refuses, words).toContain(words);
  const conflicts = section(skill, "Where the sources disagree")
    .split("\n")
    .filter((l) => /^(- |\d+\. )/.test(l));
  expect(conflicts.length).toBeGreaterThanOrEqual(10);
  for (const line of conflicts) expect(line, line.slice(0, 60)).toContain("Default");
  expect(skill).toContain("were not read at their origin");
  // The gestures' paragraph says what is not here yet, and gives no rule of a set left out.
  const gestures = section(skill, "Gestures");
  expect(gestures).toContain("a button beside it does the same");
  expect(gestures).toContain("references/gestures.md");
});

test("motion AC-8: no author's name outside the sources file, and the sources file, the ledger and the ADR say how the material entered", () => {
  for (const name of PARTS)
    for (const author of AUTHORS) expect(part(name), `${author} in ${name}`).not.toContain(author);
  const sources = part("sources.md");
  for (const words of [
    "64eb3de",
    "aed9cfd",
    "MIT",
    "Read whole",
    "Not opened",
    "gave nothing",
    "no tool of its server was called",
    "follow a source's order",
    "What was not compared",
    "D-1",
  ])
    expect(sources, words).toContain(words);
  for (const out of ["gsap-core", "gsap-plugins", "claudedesignskills", "mobile-native"])
    expect(sources, out).toContain(out);

  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    sources: { name: string; licence: string; commit: string }[];
    rows: Record<string, string>[];
  };
  const mine = ledger.rows.filter((r) => (r.file ?? "").startsWith(DIR));
  for (const row of mine) {
    expect(row.proof, row.rule).toContain("frontend-motion.test.ts");
    expect((row.text ?? "").length, row.rule).toBeGreaterThanOrEqual(20);
  }
  expect(new Set(mine.map((r) => r.text)).size).toBe(mine.length);
  // As many ledger rows that hold a rule's text as rule rows: one row for one rule.
  const cells = ruleRows(part("SKILL.md")).map((r) => r[0] ?? "");
  expect(
    mine.filter(
      (r) => r.file === `${DIR}/SKILL.md` && cells.some((c) => c.includes(r.text ?? "\u0000")),
    ).length,
  ).toBe(cells.length);
  const skill = part("SKILL.md");
  for (const cells of ruleRows(skill)) {
    const rule = cells[0] ?? "";
    // One row for one rule: no ledger text of the skill stands in two rule cells.
    expect(
      mine.filter((r) => r.file === `${DIR}/SKILL.md` && rule.includes(r.text ?? "\u0000")).length,
      rule.slice(0, 70),
    ).toBe(1);
    const held = mine.some(
      (r) => r.file === `${DIR}/SKILL.md` && rule.includes(r.text ?? "\u0000"),
    );
    expect(held, `no ledger row for: ${rule.slice(0, 70)}`).toBe(true);
  }
  expect(ledger.sources.some((s) => s.name === "gsap-skills" && s.commit === "aed9cfd")).toBe(true);
  expect(ledger.sources.find((s) => s.name === "emilkowalski")?.commit).toBe("a81dbca");
  const split = (rule: string) => ledger.rows.filter((r) => r.rule === rule);
  expect(split("springs for native gestures and mobile-native")).toEqual([]);
  const web = split("springs on the web");
  expect(web).toHaveLength(1);
  expect(web[0]?.status).toBe("in");
  expect(web[0]?.note ?? "").toContain("D-1 of item 2026-11-19-001");
  for (const rule of [
    "React Native and Swift springs and gestures",
    "the web-on-phone fixes of mobile-native",
  ]) {
    const row = split(rule);
    expect(row, rule).toHaveLength(1);
    expect(row[0]?.status, rule).toBe("refused");
    expect(row[0]?.decision, rule).toBe("D-6");
  }
  const adr = repoFile("docs/adr/0017-outside-sources-enter-the-core-distilled.md");
  const note = adr.slice(adr.indexOf("## Note of 2026-11-19 (item 2026-11-19-001"));
  for (const words of ["seventeenth skill", "`wizardingcode-frontend-motion`", "D-1", "2026-11-18"])
    expect(note, words).toContain(words);
});

test("motion AC-9: the vocabulary defines every device of the library and every device the skill names, and holds the count it states", () => {
  const vocabulary = part("references/vocabulary.md");
  const terms = [...vocabulary.matchAll(/^- \*\*`([a-z0-9-]+)`\*\*: (.+)$/gm)];
  const names = terms.map((m) => m[1]);
  expect(new Set(names).size).toBe(names.length);
  for (const term of terms) expect((term[2] ?? "").length, term[1]).toBeGreaterThan(25);
  const stated = /^(\d+) terms\b/m.exec(vocabulary)?.[1];
  expect(Number(stated)).toBe(names.length);
  expect(names.length).toBeGreaterThanOrEqual(30);
  const library = JSON.parse(repoFile("plugins/core/design/library/motions.json")) as unknown;
  const ids: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      const record = node as Record<string, unknown>;
      if (typeof record.id === "string") ids.push(record.id);
      Object.values(record).forEach(walk);
    }
  };
  walk(library);
  expect(ids.length).toBeGreaterThanOrEqual(10);
  for (const id of ids) expect(names, id).toContain(id);
  const named = [...part("SKILL.md").matchAll(/`device`[^\n`]*`([a-z0-9-]+)`/g)].map((m) => m[1]);
  expect(named.length).toBeGreaterThanOrEqual(3);
  for (const device of named) expect(names, device).toContain(device);
});

// The browser row. A page made of the skill's own blocks, read from a file, with nothing asked of
// any server. Skipped with one printed line where this machine has no headless browser.
type Page = {
  mouse: {
    move(x: number, y: number, o?: { steps: number }): Promise<void>;
    down(): Promise<void>;
    up(): Promise<void>;
  };
  goto(url: string): Promise<unknown>;
  emulateMedia(o: { reducedMotion: "reduce" | "no-preference" }): Promise<void>;
  evaluate<T>(script: string): Promise<T>;
  waitForFunction(script: string, arg?: unknown, o?: { timeout: number }): Promise<unknown>;
  on(event: "pageerror", handler: (error: Error) => void): void;
};
type Context = {
  newPage(): Promise<Page>;
  addInitScript(script: string): Promise<void>;
  close(): Promise<void>;
};
type Browser = {
  newContext(o?: {
    viewport?: { width: number; height: number };
    reducedMotion?: "reduce" | "no-preference";
    javaScriptEnabled?: boolean;
  }): Promise<Context>;
  close(): Promise<void>;
};

async function launch(): Promise<Browser | null> {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(ROOT, "node_modules", ".cache", "ms-playwright");
  try {
    const { chromium } = (await import("@playwright/test")) as unknown as {
      chromium: { launch(o: Record<string, unknown>): Promise<Browser> };
    };
    for (const options of [{ headless: true }, { channel: "chrome", headless: true }]) {
      try {
        return await chromium.launch(options);
      } catch {}
    }
  } catch {}
  return null;
}

/** The page: the skill's tokens, popover, entrance and reveal, and a box of the row's own to move. */
function pageOf(): string {
  const css = [1, 5, 6, 8].map((n) => piece(n).css).join("\n");
  // Reduced motion read live first: the FLIP move asks it.
  const js = [piece(10).js, piece(3).js, piece(5).js, piece(6).js, piece(8).js];
  const own =
    "body{margin:0}#box{position:absolute;left:100px;top:900px;width:80px;height:40px;background:#888}" +
    "#gap{height:2400px}#after{height:900px}#ghost{display:none;width:50px;height:50px}";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${css}\n${own}</style></head><body>
${piece(6).html}
${piece(5).html}
<div id="box"></div>
<div id="ghost"></div>
<div id="gap"></div>
<p data-reveal id="far">A line far below the first screen.</p>
<div id="after"></div>
${js.map((body) => `<script>${body}</script>`).join("\n")}
</body></html>`;
}

const browser = await launch();
if (!browser) console.log("frontend-motion.test.ts: no headless browser, the browser row skips");
const live = browser ? test : test.skip;
let folder: string | null = null;
afterAll(async () => {
  if (folder) rmSync(folder, { recursive: true, force: true });
  await browser?.close();
});

/** Two frames of the page, so that an observer's callbacks of the last change have run. */
const FRAMES = "new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))";
/** The row's own observer of an element: resolves once it reports the element in view or out. */
const seen = (id: string, inView: boolean) => `new Promise((done) => {
  const watch = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting === ${inView})) { watch.disconnect(); done(true); }
  });
  watch.observe(document.getElementById("${id}"));
})`;

live(
  "motion AC-5: in a real browser the content shows with scripts blocked, the entrance's gaps shrink, the reveal is made once, the FLIP move is taken from its place on screen and is still under reduced motion read live, and the popover leaves faster than it enters",
  async () => {
    if (!browser) return;
    folder = mkdtempSync(join(tmpdir(), "crew-motion-"));
    writeFileSync(join(folder, "index.html"), pageOf());
    expect(readdirSync(folder)).toEqual(["index.html"]);
    const url = pathToFileURL(join(folder, "index.html")).href;
    const open = async (options: Parameters<Browser["newContext"]>[0] = {}) => {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        reducedMotion: "no-preference",
        ...options,
      });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      return { context, page, errors };
    };
    const shown = `[...document.querySelectorAll(".opening-part, [data-reveal]")].map((el) => {
      const style = getComputedStyle(el);
      return [style.opacity, style.transform, el.getAnimations().length].join(" ");
    })`;

    // (a) Scripts blocked, the stylesheet loaded: nothing is hidden and nothing is set to move.
    const blocked = await open({ javaScriptEnabled: false });
    const without = await blocked.page.evaluate<string[]>(shown);
    expect(without.length).toBeGreaterThanOrEqual(5);
    for (const state of without) expect(state).toBe("1 none 0");
    await blocked.context.close();

    const { context, page, errors } = await open();
    // Every animation held at its start, so no clause below reads a state that time moved.
    await page.evaluate(
      "document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 0; })",
    );

    // (b) The entrance: unequal gaps that shrink, inside the standard's totals.
    const parts = await page.evaluate<{ delay: number; duration: number; running: number }[]>(
      `[...document.querySelectorAll(".opening-part")].map((el) => {
        const style = getComputedStyle(el);
        return { delay: parseFloat(style.animationDelay) * 1000,
                 duration: parseFloat(style.animationDuration) * 1000,
                 running: el.getAnimations().length };
      })`,
    );
    expect(parts.length).toBeGreaterThanOrEqual(4);
    for (const one of parts) {
      expect(one.running).toBe(1);
      expect(one.duration).toBeGreaterThan(0);
      expect(one.duration).toBeLessThanOrEqual(700);
    }
    const delays = parts.map((p) => Math.round(p.delay)).sort((a, b) => a - b);
    const gaps = delays.slice(1).map((d, i) => d - (delays[i] ?? 0));
    expect(delays[0]).toBe(0);
    expect(delays.at(-1)).toBeLessThanOrEqual(240);
    expect(delays.at(-1)).toBeGreaterThan(0);
    for (let i = 0; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(0);
      if (i > 0) expect(gaps[i], `gap ${i}`).toBeLessThan(gaps[i - 1] ?? 0);
    }

    // (c) The reveal: hidden once the script ran, shown on entering view, and made once.
    const far = (script: string) =>
      page.evaluate<string>(
        `(() => { const el = document.getElementById("far"); return String(${script}); })()`,
      );
    expect(await far(`document.documentElement.classList.contains("reveal-armed")`)).toBe("true");
    expect(await far(`getComputedStyle(el).opacity`)).toBe("0");
    expect(await far(`el.classList.contains("is-revealed")`)).toBe("false");
    await page.evaluate(`(document.getElementById("far").scrollIntoView(), ${seen("far", true)})`);
    await page.waitForFunction(`document.getElementById("far").classList.contains("is-revealed")`);
    await page.evaluate(
      `document.getElementById("far").getAnimations().forEach((a) => a.finish())`,
    );
    expect(await far(`getComputedStyle(el).opacity`)).toBe("1");
    await page.evaluate(`(window.scrollTo(0, 0), ${seen("far", false)})`);
    await page.evaluate(FRAMES);
    expect(await far(`el.classList.contains("is-revealed")`), "still revealed out of view").toBe(
      "true",
    );
    await page.evaluate(`(document.getElementById("far").scrollIntoView(), ${seen("far", true)})`);
    await page.evaluate(FRAMES);
    expect(await far(`el.classList.contains("is-revealed")`)).toBe("true");
    expect(await far(`el.getAnimations().length`), "no second reveal").toBe("0");
    await page.evaluate("window.scrollTo(0, 0)");

    // (d) The FLIP move: the inverse of the change played to none, and a second move taken from
    // where the first one stood on screen, the first held by the row at half its length.
    const place = `(() => { const r = document.getElementById("box").getBoundingClientRect(); return [r.left, r.top]; })()`;
    const origin = await page.evaluate<number[]>(place);
    const first = await page.evaluate<{ count: number; frames: string[]; duration: number }>(
      `(() => {
        const box = document.getElementById("box");
        flip([box], () => { box.style.left = "400px"; });
        const moves = box.getAnimations();
        return { count: moves.length,
                 frames: moves[0].effect.getKeyframes().map((k) => k.transform),
                 duration: moves[0].effect.getComputedTiming().duration };
      })()`,
    );
    expect(first.count).toBe(1);
    expect(first.frames).toHaveLength(2);
    expect(first.frames[0]).toMatch(/^translate\(-300px, 0px\)/);
    expect(first.frames[1]).toBe("none");
    expect(first.duration).toBeGreaterThan(0);
    const half = await page.evaluate<number[]>(
      `(() => {
        const move = document.getElementById("box").getAnimations()[0];
        move.pause();
        move.currentTime = ${first.duration} / 2;
        return ${place};
      })()`,
    );
    expect(half[0]).toBeGreaterThan((origin[0] ?? 0) + 5);
    expect(half[0]).toBeLessThan(395);
    const second = await page.evaluate<{ count: number; start: number[]; frames: string[] }>(
      `(() => {
        const box = document.getElementById("box");
        flip([box], () => { box.style.left = "400px"; box.style.top = "1100px"; });
        const moves = box.getAnimations();
        moves.forEach((m) => { m.pause(); m.currentTime = 0; });
        return { count: moves.length, start: ${place},
                 frames: moves[0].effect.getKeyframes().map((k) => k.transform) };
      })()`,
    );
    expect(second.count, "the running move was cancelled, not stacked on").toBe(1);
    expect(Math.abs((second.start[0] ?? 0) - (half[0] ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((second.start[1] ?? 0) - (half[1] ?? 0))).toBeLessThanOrEqual(1);
    expect(second.frames[1]).toBe("none");
    await page.evaluate(
      `document.getElementById("box").getAnimations().forEach((a) => a.finish())`,
    );
    const landed = await page.evaluate<number[]>(place);
    expect(landed[0]).toBe(400);
    expect((landed[1] ?? 0) - (origin[1] ?? 0)).toBe(200);
    expect(
      await page.evaluate<string>(`getComputedStyle(document.getElementById("box")).transform`),
    ).toBe("none");

    // An element with no box before the change takes no move: it does not fly in from a corner.
    expect(
      await page.evaluate<number>(
        `(() => {
          const ghost = document.getElementById("ghost");
          flip([ghost], () => { ghost.style.display = "block"; });
          return ghost.getAnimations().length;
        })()`,
      ),
    ).toBe(0);

    // And one that loses its box takes none either.
    expect(
      await page.evaluate<number>(
        `(() => {
          const ghost = document.getElementById("ghost");
          flip([ghost], () => { ghost.style.display = "none"; });
          return ghost.getAnimations().length;
        })()`,
      ),
    ).toBe(0);

    // (e) Reduced motion, switched on and off by the row with the page open.
    const moved = (left: number) => `(() => {
      const box = document.getElementById("box");
      flip([box], () => { box.style.left = "${left}px"; });
      const count = box.getAnimations().length;
      box.getAnimations().forEach((a) => a.finish());
      return [count, box.getBoundingClientRect().left];
    })()`;
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction("matchMedia('(prefers-reduced-motion: reduce)').matches");
    await page.evaluate(FRAMES);
    expect(await page.evaluate<number[]>(moved(150))).toEqual([0, 150]);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.waitForFunction("!matchMedia('(prefers-reduced-motion: reduce)').matches");
    await page.evaluate(FRAMES);
    await page.evaluate(FRAMES);
    expect(await page.evaluate<number[]>(moved(300))).toEqual([1, 300]);

    // (f) The popover: it grows from its trigger, and it leaves faster than it enters.
    const menu = await page.evaluate<{
      open: number;
      closing: number;
      origin: number[];
      from: number[];
      centre: number[];
    }>(
      `(() => {
        const trigger = document.querySelector("[data-menu-trigger]");
        const menu = document.querySelector("[data-menu]");
        openFrom(trigger, menu);
        const seconds = (el) => Math.max(...getComputedStyle(el).transitionDuration.split(",").map(parseFloat));
        const open = seconds(menu);
        const origin = getComputedStyle(menu).transformOrigin.split(" ").map(parseFloat);
        // The menu at rest, its entrance finished: its own box on screen, read apart from the skill.
        menu.getAnimations().forEach((a) => a.finish());
        const t = trigger.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        const from = [t.left + t.width / 2 - m.left, t.top + t.height / 2 - m.top];
        const centre = [m.width / 2, m.height / 2];
        menu.hidePopover();
        return { open, closing: seconds(menu), origin, from, centre };
      })()`,
    );
    expect(menu.closing).toBeGreaterThan(0);
    expect(menu.open).toBeGreaterThan(menu.closing);
    expect(Math.abs((menu.origin[0] ?? 0) - (menu.from[0] ?? 0))).toBeLessThanOrEqual(1);
    expect(Math.abs((menu.origin[1] ?? 0) - (menu.from[1] ?? 0))).toBeLessThanOrEqual(1);
    expect(
      Math.abs((menu.origin[0] ?? 0) - (menu.centre[0] ?? 0)) +
        Math.abs((menu.origin[1] ?? 0) - (menu.centre[1] ?? 0)),
      "the origin is the control's place and not the menu's centre",
    ).toBeGreaterThan(5);
    expect(errors).toEqual([]);
    await context.close();

    // Reduced motion at load: the same page, and a FLIP move makes no animation.
    const still = await open({ reducedMotion: "reduce" });
    expect(await still.page.evaluate<number[]>(moved(250))).toEqual([0, 250]);
    expect(still.errors).toEqual([]);
    await still.context.close();
  },
  120_000,
);

// The gestures (item 2026-11-19-002): the reference's text, and its drag run in a real browser
// under a pointer the row makes, whose every event carries a time the row sets.
const GESTURE_HEADINGS = [
  "Before a drag is built",
  "The two phases",
  "While the pointer is down",
  "On release",
  "What moves with the drag",
  "The drag, whole",
  "What the code does not do",
  "Reduced motion",
  "Checking a gesture",
];

test("gestures AC-1: the reference has its nine headings, and the skill's section sends a session to it with its rule rows, the norm and the figures that are a source's", () => {
  const reference = part("references/gestures.md");
  expect([...reference.matchAll(/^## (.+)$/gm)].map((m) => m[1])).toEqual(GESTURE_HEADINGS);
  const skill = part("SKILL.md");
  const gestures = section(skill, "Gestures");
  const rows = ruleRows(gestures);
  expect(rows.length).toBeGreaterThanOrEqual(6);
  const norm = rows.filter((r) => r[1] === "`norm`");
  expect(norm).toHaveLength(1);
  expect(norm[0]?.[0]).toContain("2.5.7");
  for (const figure of ["0.998", "0.55"]) {
    const holders = [...rows, ...ruleRows(reference)].filter((r) => (r[0] ?? "").includes(figure));
    expect(holders.length, figure).toBeGreaterThanOrEqual(1);
    for (const row of holders) expect(row[1], figure).toBe("`hypothesis`");
  }
  expect(reference).toContain("were not read at their origin");
  const vocabulary = part("references/vocabulary.md");
  for (const term of ["drag-dismiss", "rubber-band"])
    expect(vocabulary, term).toMatch(new RegExp(`^- \\*\\*\`${term}\`\\*\\*: `, "m"));
  expect(vocabulary).toMatch(/^44 terms\b/m);
});

test("gestures AC-3: the reference's code reads the events' own time, writes no keyframes, and its tables hold nothing of the refused set", () => {
  const reference = part("references/gestures.md");
  const code = fences(reference);
  expect(code.filter((b) => b.lang === "js").length).toBeGreaterThanOrEqual(1);
  const all = code.map((b) => b.body).join("\n");
  for (const banned of ["@keyframes", ".animate(", "touchmove", "performance.now(", "Date.now("])
    expect(all, banned).not.toContain(banned);
  expect(all).toContain("touch-action");
  expect(all).toContain("reducedMotion");
  expect(all).toContain("event.timeStamp");
  expect(all).toContain("setPointerCapture");
  const tables = ruleRows(reference)
    .map((r) => r.join(" "))
    .join("\n");
  const skillRows = ruleRows(section(part("SKILL.md"), "Gestures"))
    .map((r) => r.join(" "))
    .join("\n");
  for (const refused of ["manipulation", "overscroll-behavior", "tap highlight"]) {
    expect(tables, refused).not.toContain(refused);
    expect(skillRows, refused).not.toContain(refused);
  }
  expect(all).toContain("destroy()");
});

test("gestures AC-5: the sources file says what the drag keeps from its sources, and names the files and the page", () => {
  const sources = part("sources.md");
  const whole = sources.slice(0, sources.indexOf("Left out of this item"));
  expect(whole).toMatch(/Read whole[\s\S]*skills\/gestures\/SKILL\.md/);
  for (const words of [
    "2.5.7",
    "follow a source's order",
    "The two formulas",
    "0.998",
    "0.55",
    "were not read at their origin",
  ])
    expect(sources, words).toContain(words);
  expect(sources).not.toContain("[source?]");
});

/** The page of the drag: the reference's CSS and function, the live read of reduced motion, and wiring of the row's own. */
function dragPage(): string {
  const reference = part("references/gestures.md");
  const of = (lang: string) =>
    fences(reference)
      .filter((f) => f.lang === lang)
      .map((f) => f.body);
  const own =
    "body{margin:0}[data-sheet]{position:fixed;left:0;top:100px;width:300px;height:300px;background:#888}" +
    "#side{position:fixed;left:400px;top:100px;width:300px;height:300px;background:#666}";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${of("css").join("\n")}\n${own}</style></head><body>
${of("html")[0] ?? ""}
<div id="side"></div>
<script>${piece(10).js}</script>
<script>${of("js")[0] ?? ""}</script>
<script>
  const sheet = document.querySelector("[data-sheet]");
  const side = document.getElementById("side");
  window.log = { dismissed: 0, progress: [], sideDismissed: 0 };
  window.drag = dragToDismiss(sheet, {
    onDismiss: () => { log.dismissed += 1; },
    onProgress: (share) => { log.progress.push(share); },
  });
  sheet.querySelector("[data-sheet-close]").addEventListener("click", () => window.drag.dismiss());
  dragToDismiss(side, { axis: "x", onDismiss: () => { log.sideDismissed += 1; } });
  // A pointer of the row's own: each event with the time the row gives it.
  window.fire = (type, at, travel, o = {}) => {
    const target = o.target ?? sheet;
    const sideways = o.sideways ?? 0;
    const event = new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: o.id ?? 1, isPrimary: (o.id ?? 1) === 1,
      button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: 150 + sideways, clientY: 150 + travel,
    });
    Object.defineProperty(event, "timeStamp", { value: at });
    target.dispatchEvent(event);
  };
  window.play = (events) => { for (const [type, at, travel, o] of events) window.fire(type, at, travel, o); };
  window.place = (el = sheet) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; };
</script>
</body></html>`;
}

type Step = [string, number, number];
const press = (at = 0): Step => ["pointerdown", at, 0];
const moves = (...pairs: [number, number][]): Step[] =>
  pairs.map(([at, travel]) => ["pointermove", at, travel]);
const release = (at: number, travel: number): Step => ["pointerup", at, travel];
/** A travel to `travel` in sixteen even moves ending at `by`, then a release at `at`. */
const still = (travel: number, by: number, at: number): Step[] => [
  press(),
  ...moves(
    ...Array.from({ length: 16 }, (_, i): [number, number] => [
      ((i + 1) * by) / 16,
      ((i + 1) * travel) / 16,
    ]),
  ),
  release(at, travel),
];
// The gestures of the spec's table: the pointer's travel from the press, in pixels, at each time.
const GESTURES: Record<string, { steps: Step[]; ends: "rest" | "dismissed" }> = {
  "(f) slow and short": {
    steps: [press(), ...moves([100, 10], [200, 20], [300, 30], [400, 40]), release(400, 40)],
    ends: "rest",
  },
  // The sample that stands exactly a window before the release is inside the window: with it the
  // speed is 0.3 and the landing 179.7; without it the speed is nought and the landing 30.
  "(f2) the window's edge": {
    steps: [press(), ...moves([100, 10], [200, 40]), release(200, 40)],
    ends: "dismissed",
  },
  "(g) a flick": {
    steps: [press(), ...moves([10, 10], [20, 20], [30, 30], [40, 40]), release(40, 40)],
    ends: "dismissed",
  },
  "(g2) held, then flicked": {
    steps: [
      press(),
      ...moves([10, 12], [500, 12], [510, 22], [520, 32], [530, 42], [540, 52]),
      release(540, 52),
    ],
    ends: "dismissed",
  },
  "(g3) the constant": {
    steps: [press(), ...moves([40, 10], [80, 20], [120, 30]), release(120, 30)],
    ends: "dismissed",
  },
  // Pulled fast and then held: by the release its samples are old, so its speed is nought.
  "(h3) fast, then held": {
    steps: [press(), ...moves([10, 10], [20, 60], [30, 100]), release(300, 100)],
    ends: "rest",
  },
  "(h) far and still": { steps: still(160, 1800, 2000), ends: "dismissed" },
  "(h2) short and still": { steps: still(100, 1800, 2000), ends: "rest" },
  // After a release the browser tells the element its capture is gone: that undoes nothing.
  "(h4) far and still, the capture lost after the release": {
    steps: [...still(160, 1800, 2000), ["lostpointercapture", 2000, 160]],
    ends: "dismissed",
  },
};

live(
  "gestures AC-2: under a pointer whose times the row sets, the drag commits past its threshold, follows one to one, resists, clears, returns from a slow drag, dismisses on a flick and on distance, has its button, obeys reduced motion, spares a control inside, can be caught, reports its progress, holds its pointer and keeps to its axis",
  async () => {
    if (!browser) return;
    const dir = mkdtempSync(join(tmpdir(), "crew-drag-"));
    try {
      writeFileSync(join(dir, "index.html"), dragPage());
      const url = pathToFileURL(join(dir, "index.html")).href;
      const open = async (reducedMotion: "reduce" | "no-preference" = "no-preference") => {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          reducedMotion,
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(url);
        return { context, page, errors };
      };
      const stateIs = (name: string) =>
        `document.querySelector("[data-sheet]").dataset.dragState === "${name}"`;
      const read = `({ state: document.querySelector("[data-sheet]").dataset.dragState,
        top: place()[1] - 100, dismissed: log.dismissed, last: log.progress.at(-1), calls: log.progress.length,
        transform: document.querySelector("[data-sheet]").style.transform })`;
      type Read = {
        state: string;
        top: number;
        dismissed: number;
        last: number;
        calls: number;
        transform: string;
      };
      const play = (steps: unknown[]) => `play(${JSON.stringify(steps)})`;

      // (a) to (e2), on one page: each ends where it began.
      const one = await open();
      const at = async (script: string) => {
        await one.page.evaluate(script);
        return one.page.evaluate<Read>(read);
      };
      expect((await one.page.evaluate<Read>(read)).state).toBe("rest");
      // (a) under the threshold nothing moves.
      let now = await at(play([press(), ...moves([10, 6])]));
      expect([now.state, now.top, now.transform]).toEqual(["rest", 0, ""]);
      // (b) past it the element follows one to one, from the point of commitment.
      now = await at(play(moves([20, 40])));
      expect(now.state).toBe("dragging");
      expect(Math.abs(now.top - 30)).toBeLessThanOrEqual(1);
      now = await at(play(moves([30, 70])));
      expect(Math.abs(now.top - 60)).toBeLessThanOrEqual(1);
      // (c) a second pointer changes nothing.
      now = await at(
        play([
          ["pointerdown", 35, 0, { id: 2 }],
          ["pointermove", 40, 170, { id: 2 }],
          ["pointerup", 45, 170, { id: 2 }],
        ]),
      );
      expect(now.state).toBe("dragging");
      expect(Math.abs(now.top - 60)).toBeLessThanOrEqual(1);
      // (e) the browser cancels the pointer: back to rest, nothing dismissed.
      await one.page.evaluate(play([["pointercancel", 50, 70]]));
      await one.page.waitForFunction(stateIs("rest"));
      now = await one.page.evaluate<Read>(read);
      expect([now.top, now.transform, now.dismissed, now.last]).toEqual([0, "", 0, 0]);
      // (d) against the direction of dismissal: the band's value, by the row's own arithmetic.
      now = await at(play([press(100), ...moves([110, -110])]));
      const band = (100 * 300 * 0.55) / (300 + 0.55 * 100);
      expect(band).toBeGreaterThan(40);
      expect(band).toBeLessThan(60);
      expect(Math.abs(now.top + band)).toBeLessThanOrEqual(1);
      // (e2) the capture is lost: back to rest.
      await one.page.evaluate(play([["lostpointercapture", 120, -110]]));
      await one.page.waitForFunction(stateIs("rest"));
      now = await one.page.evaluate<Read>(read);
      expect([now.top, now.transform, now.dismissed]).toEqual([0, "", 0]);
      // (k) a press on a control inside moves nothing.
      now = await at(
        `(() => { const inner = document.querySelector("[data-sheet-close]");
          fire("pointerdown", 200, 0, { target: inner }); fire("pointermove", 210, 60, { target: inner });
          fire("pointerup", 220, 60, { target: inner }); })()`,
      );
      expect([now.state, now.top, now.transform]).toEqual(["rest", 0, ""]);
      // (o) the sideways element follows a sideways travel and ignores a vertical one.
      const sideAt = (script: string) =>
        one.page.evaluate<number[]>(`(() => { ${script}; return place(side); })()`);
      let side = await sideAt(
        `fire("pointerdown", 300, 0, { target: side }); fire("pointermove", 310, 80, { target: side })`,
      );
      expect(side).toEqual([400, 100]);
      side = await sideAt(`fire("pointermove", 320, 80, { target: side, sideways: 50 })`);
      expect(Math.abs((side[0] ?? 0) - 440)).toBeLessThanOrEqual(1);
      expect(side[1]).toBe(100);
      expect(one.errors).toEqual([]);
      await one.context.close();

      // (f) to (h2): the table's gestures, each on a page of its own, every end collected so that
      // one run shows each gesture that ended wrong.
      const ended: Record<string, string> = {};
      const expected: Record<string, string> = {};
      for (const [name, gesture] of Object.entries(GESTURES)) {
        const run = await open();
        // (m) before the release: a call for each move past the threshold, from the moves alone.
        const up = gesture.steps.findIndex(([type]) => type === "pointerup");
        await run.page.evaluate(play(gesture.steps.slice(0, up)));
        const past = gesture.steps.filter(
          ([type, , travel]) => type === "pointermove" && travel >= 10,
        );
        const calls = (await run.page.evaluate<Read>(read)).calls;
        await run.page.evaluate(play(gesture.steps.slice(up)));
        await run.page.waitForFunction(
          `["rest", "dismissed"].includes(document.querySelector("[data-sheet]").dataset.dragState)`,
        );
        const end = await run.page.evaluate<Read>(read);
        ended[name] = `${end.state}, ${calls} calls before the release`;
        expected[name] = `${gesture.ends}, ${past.length} calls before the release`;
        const gone = end.state === "dismissed";
        expect(end.dismissed, name).toBe(gone ? 1 : 0);
        expect(end.last, name).toBe(gone ? 1 : 0);
        expect(end.top, name).toBe(gone ? 300 : 0);
        expect(run.errors, name).toEqual([]);
        await run.context.close();
      }
      expect(ended).toEqual(expected);

      // (i) the button beside the element does the same with no drag.
      const button = await open();
      await button.page.evaluate(`document.querySelector("[data-sheet-close]").click()`);
      await button.page.waitForFunction(stateIs("dismissed"));
      expect((await button.page.evaluate<Read>(read)).dismissed).toBe(1);
      await button.context.close();

      // (j) reduced motion: the end is set in the release's own task.
      const reduced = await open("reduce");
      const atOnce = await reduced.page.evaluate<Read>(
        `(${play(GESTURES["(h) far and still"]?.steps ?? [])}, ${read})`,
      );
      expect([atOnce.state, atOnce.top, atOnce.dismissed]).toEqual(["dismissed", 300, 1]);
      await reduced.context.close();

      // (l) caught while it settles: pressed in the release's own task, it stays where it is,
      // and the drag goes on from there.
      const caught = await open();
      const held = await caught.page.evaluate<Read>(
        `(${play(GESTURES["(h2) short and still"]?.steps ?? [])}, fire("pointerdown", 2000, 100), ${read})`,
      );
      expect(held.state).toBe("dragging");
      expect(Math.abs(held.top - 90)).toBeLessThanOrEqual(1);
      await caught.page.evaluate(
        "new Promise((done) => { let n = 0; const tick = () => (++n === 5 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); })",
      );
      const after = await caught.page.evaluate<Read>(read);
      expect(after.state).toBe("dragging");
      expect(Math.abs(after.top - held.top)).toBeLessThanOrEqual(0.5);
      const further = await caught.page.evaluate<Read>(`(fire("pointermove", 2010, 120), ${read})`);
      expect(Math.abs(further.top - held.top - 20)).toBeLessThanOrEqual(1);
      await caught.context.close();

      // (l2) a drag caught again forgets the samples of the drag before it: pulled out fast and let go
      // while it still goes out, so a dismissal starts; caught, moved once and released, its speed
      // is that one move's, nought.
      const again = await open();
      await again.page.evaluate(
        play([
          press(),
          ...moves([10, 10], [20, 130], [30, 100]),
          release(30, 100),
          ["pointerdown", 30, 100],
          ["pointermove", 40, 120],
          release(40, 120),
        ]),
      );
      await again.page.waitForFunction(
        `["rest", "dismissed"].includes(document.querySelector("[data-sheet]").dataset.dragState)`,
      );
      expect((await again.page.evaluate<Read>(read)).state).toBe("rest");
      await again.context.close();

      // (n) the browser's own mouse: taken far to the side of the element's box, where no event
      // would reach the element, it still follows along its axis, which only a captured pointer
      // gives. (Along the axis alone the element stays under the mouse and proves nothing.)
      const real = await open();
      await real.page.mouse.move(150, 150);
      await real.page.mouse.down();
      await real.page.mouse.move(150, 190, { steps: 4 });
      const near = await real.page.evaluate<Read>(read);
      expect(near.state).toBe("dragging");
      expect(Math.abs(near.top - 30)).toBeLessThanOrEqual(1);
      await real.page.mouse.move(1000, 250, { steps: 8 });
      const far = await real.page.evaluate<Read>(read);
      expect(far.state).toBe("dragging");
      expect(Math.abs(far.top - 90)).toBeLessThanOrEqual(1);
      await real.page.mouse.up();
      await real.page.waitForFunction(
        `["rest", "dismissed"].includes(document.querySelector("[data-sheet]").dataset.dragState)`,
      );
      // The browser's own loss of the capture after a release undoes nothing: the state and the
      // count of dismissals agree.
      const let_go = await real.page.evaluate<Read>(read);
      expect(let_go.dismissed).toBe(let_go.state === "dismissed" ? 1 : 0);
      expect(real.errors).toEqual([]);

      // (p) a pointer let go outside the element before the drag committed never told the
      // element: a mouse that then only hovers over it drags nothing, and the next press drags.
      const stale = await open();
      await stale.page.mouse.move(150, 150);
      await stale.page.mouse.down();
      await stale.page.mouse.move(1000, 154, { steps: 4 });
      await stale.page.mouse.up();
      expect((await stale.page.evaluate<Read>(read)).state).toBe("rest");
      // Back over the element with no button down: it must not follow a mouse that only hovers.
      // The first such move ends the kept drag by a settle from nothing, so the row waits for rest.
      await stale.page.mouse.move(150, 150);
      await stale.page.mouse.move(150, 200, { steps: 5 });
      await stale.page.waitForFunction(stateIs("rest"));
      const hovered = await stale.page.evaluate<Read>(read);
      expect([hovered.state, hovered.top, hovered.transform]).toEqual(["rest", 0, ""]);
      await stale.page.mouse.move(150, 150);
      await stale.page.mouse.down();
      await stale.page.mouse.move(150, 190, { steps: 4 });
      const taken = await stale.page.evaluate<Read>(read);
      expect(taken.state).toBe("dragging");
      expect(Math.abs(taken.top - 30)).toBeLessThanOrEqual(1);
      await stale.page.mouse.up();
      expect(stale.errors).toEqual([]);
      await stale.context.close();

      // (q) destroyed, the element hears nothing more.
      const off = await open();
      const dead = await off.page.evaluate<Read>(
        `(drag.destroy(), ${play([press(), ...moves([10, 40], [20, 70])])}, ${read})`,
      );
      expect([dead.state, dead.top, dead.transform]).toEqual(["rest", 0, ""]);
      await off.context.close();

      // (q2) destroyed while it settles: at rest at once, and five frames later still there.
      const mid = await open();
      const cut = await mid.page.evaluate<Read>(
        `(${play(GESTURES["(h2) short and still"]?.steps ?? [])}, drag.destroy(), ${read})`,
      );
      expect([cut.state, cut.top, cut.transform]).toEqual(["rest", 0, ""]);
      await mid.page.evaluate(
        "new Promise((done) => { let n = 0; const tick = () => (++n === 5 ? done() : requestAnimationFrame(tick)); requestAnimationFrame(tick); })",
      );
      const later = await mid.page.evaluate<Read>(read);
      expect([later.state, later.top, later.transform]).toEqual(["rest", 0, ""]);
      await mid.context.close();
      await real.context.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  120_000,
);

live(
  "gestures AC-6: where the media query's list has no addEventListener the page loads and a move still obeys a change of the setting, the menu's text says its loop runs once (the element that loses its box is a case of the layout move's own row)",
  async () => {
    if (!browser) return;
    expect(piece(5).text).toContain("runs once at load");
    expect(piece(10).js).toContain("addListener");
    const dir = mkdtempSync(join(tmpdir(), "crew-old-"));
    try {
      writeFileSync(join(dir, "index.html"), pageOf());
      const context = await browser.newContext({ reducedMotion: "no-preference" });
      // A browser of before the list was an event target: the method is gone before any script.
      await context.addInitScript(
        'Object.defineProperty(MediaQueryList.prototype, "addEventListener", { value: undefined });',
      );
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(pathToFileURL(join(dir, "index.html")).href);
      expect(
        await page.evaluate<string>(
          "typeof matchMedia('(prefers-reduced-motion: reduce)').addEventListener",
        ),
      ).toBe("undefined");
      const moved = (left: number) => `(() => {
        const box = document.getElementById("box");
        flip([box], () => { box.style.left = "${left}px"; });
        const count = box.getAnimations().length;
        box.getAnimations().forEach((a) => a.finish());
        return count;
      })()`;
      expect(await page.evaluate<number>(moved(200))).toBe(1);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForFunction("matchMedia('(prefers-reduced-motion: reduce)').matches");
      await page.evaluate(FRAMES);
      expect(await page.evaluate<number>(moved(300))).toBe(0);
      expect(errors).toEqual([]);
      await context.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  60_000,
);
