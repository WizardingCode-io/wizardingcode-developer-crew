// The 3D stage a new site may open on (item 2026-11-18-017): the crew's skill for an object the
// scroll walks around. The text rows read the skill's files as a session would; the browser row
// runs the skill's own markup, loader and engine with three.js from this repository's node_modules.
import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const DIR = "plugins/core/skills/wizardingcode-design-stage";
const FILM = "plugins/core/skills/wizardingcode-design-film";
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const part = (name: string): string => repoFile(`${DIR}/${name}`);
const PARTS = ["SKILL.md", "references/model.md", "references/review.md", "references/stage.md"];
const RELEASE = "0.187.0";

/** The fenced blocks of a Markdown text, each with the word after its opening fence. */
function fences(text: string): { lang: string; body: string }[] {
  const out: { lang: string; body: string }[] = [];
  const pattern = /^```([a-z]*)\n([\s\S]*?)^```$/gm;
  for (let m = pattern.exec(text); m; m = pattern.exec(text))
    out.push({ lang: m[1] ?? "", body: m[2] ?? "" });
  return out;
}
const blocks = (text: string, lang: string): string[] =>
  fences(text)
    .filter((f) => f.lang === lang)
    .map((f) => f.body);

/** The text of a `##` section, from its heading to the next heading of that level. */
function section(text: string, title: string): string {
  const start = text.indexOf(`## ${title}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + title.length + 4);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The numbered steps of the skill, each from its number to the next. */
function steps(text: string): string[] {
  const body = section(text, "Steps");
  const marks = [...body.matchAll(/^(\d+)\. \*\*/gm)];
  return marks.map((m, i) => body.slice(m.index, marks[i + 1]?.index ?? body.length));
}

/** The still's five conditions as a text holds them, in the order it holds them. */
const CONDITION =
  /\(max-width: 720px\)|\(orientation: [a-z]+\)(?: and \([^)]*\)){1,2}|\(prefers-reduced-motion: reduce\)/g;
const conditions = (text: string): string[] => text.match(CONDITION) ?? [];

test("stage AC-1: the skill has the design skills' form and its three references, and the direction and build skills send a session to it", () => {
  for (const name of [...PARTS, "sources.md"])
    expect(existsSync(join(ROOT, DIR, name)), name).toBe(true);
  const skill = part("SKILL.md");
  expect(skill).toContain("name: wizardingcode-design-stage");
  const description = /^description: "(.*)"$/m.exec(skill)?.[1] ?? "";
  expect(description.length).toBeGreaterThan(0);
  expect(description.length).toBeLessThanOrEqual(200);
  for (const heading of [
    "When",
    "Inputs",
    "Steps",
    "What stays the user's",
    "What the skill refuses",
    "Output",
    "Done when",
  ])
    expect(skill, heading).toContain(`## ${heading}\n`);
  for (const ref of PARTS.slice(1)) expect(skill, ref).toContain(ref);
  for (const other of ["direction", "build"])
    expect(repoFile(`plugins/core/skills/wizardingcode-design-${other}/SKILL.md`), other).toContain(
      "wizardingcode-design-stage",
    );
});

test("stage AC-2: eleven steps in order, the price rule, the user's approval of the model, and what stays the user's", () => {
  const all = steps(part("SKILL.md"));
  const titles = [
    "The tools and the question",
    "The page first",
    "The storyboard",
    "The model",
    "The review",
    "The processing",
    "The stage",
    "The beats",
    "The posters",
    "The rest of the page",
    "The self-test",
  ];
  expect(all).toHaveLength(titles.length);
  titles.forEach((title, index) => {
    expect(all[index], title).toStartWith(`${index + 1}. **${title}.**`);
  });
  expect(all[0]).toContain("installs nothing by itself");
  expect(all[0]).toContain("a new dependency");
  expect(all[0]).toContain("wizardingcode-frontend-engineering");
  expect(all[3]).toContain("price");
  expect(all[3]).toContain("the user says yes");
  expect(all[3]).toContain("wizardingcode-design-film");
  expect(all[4]).toContain("No page is built on a model the user has not approved");
  const users = section(part("SKILL.md"), "What stays the user's");
  for (const phrase of [
    "With nobody present, stop before the first paid step",
    "the user's own message",
    "priced and approved by itself",
    "never signs up",
    "never written into a file",
  ])
    expect(users, phrase).toContain(phrase);
});

test("stage AC-3: the skill is read only where the direction's signature is an object, and a page with no scene loses nothing", () => {
  const when = section(part("SKILL.md"), "When");
  expect(when).toContain("only where the direction's signature is an object");
  expect(when).toContain("A site with no stage does not read this skill");
  const first = steps(part("SKILL.md"))[0] ?? "";
  expect(first).toContain("wizardingcode-design-film");
  expect(first).toContain("a composed still");
  expect(repoFile("plugins/core/skills/crew/rubrics/design-finish.md")).toContain(
    "a page with no film and no 3D scene loses nothing for having none",
  );
});

test("stage AC-4: the code blocks parse, hold what the stage needs, share the film's five conditions and hold none of the banned names", () => {
  const stage = part("references/stage.md");
  const html = blocks(stage, "html");
  expect(html).toHaveLength(2);
  expect(html[0]).toMatch(/<div class="stage" data-stage aria-hidden="true">/);
  expect(html[1]).toContain('<script type="importmap">');
  const scripts = blocks(stage, "js");
  expect(scripts).toHaveLength(2);
  const [loader = "", engine = ""] = scripts;
  const review = blocks(part("references/review.md"), "js");
  expect(review).toHaveLength(1);
  const transpiler = new Bun.Transpiler({ loader: "js" });
  for (const script of [loader, engine, review[0] ?? ""])
    expect(() => transpiler.transformSync(script)).not.toThrow();

  const film = conditions(blocks(repoFile(`${FILM}/references/scrub.md`), "js").join("\n"));
  expect(film).toHaveLength(5);
  expect(loader).toContain("import(");
  expect(conditions(loader)).toEqual(film);
  expect(conditions(blocks(stage, "css").join("\n"))).toEqual(film);
  for (const word of [
    "setAnimationLoop",
    "webglcontextlost",
    "PCFShadowMap",
    "setMeshoptDecoder",
    "devicePixelRatio",
    "getBoundingClientRect",
    "dataset.stageState",
  ])
    expect(engine, word).toContain(word);
  for (const name of [...PARTS, "sources.md"]) {
    const text = part(name);
    for (const banned of [
      "OrbitControls",
      "PCFSoftShadowMap",
      "THREE.Clock",
      "ScrollTrigger",
      "preserveDrawingBuffer",
      "scrollRestoration",
    ])
      expect(text, `${name} ${banned}`).not.toContain(banned);
    for (const banned of ["gsap", "lenis"])
      expect(text.toLowerCase(), `${name} ${banned}`).not.toContain(banned);
  }
});

test("stage AC-6: the skill says what it refuses", () => {
  const refuses = section(part("SKILL.md"), "What the skill refuses");
  for (const phrase of [
    "No real brand's product",
    "read and recorded",
    "never shown as the client's real product",
    "blocking objection",
    "is refused and made again",
    "says what is sent and to which service",
    "installs nothing by itself",
    "deploys nothing",
    "No fact a visitor needs lives only in the canvas",
    "No drag without a keyboard equal",
    "A stage on a phone",
    "A model over a film",
    "stay out of the folder that ships",
    "the person agreed",
    "never a child",
    "no outside address",
  ])
    expect(refuses, phrase).toContain(phrase);
});

/** Every file under a folder, as paths from the repository's root. */
function filesUnder(folder: string): string[] {
  return readdirSync(join(ROOT, folder), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(`${folder}/${entry.name}`) : [`${folder}/${entry.name}`],
  );
}

test("stage AC-7: nothing of the material's maker stands outside the sources file; the sources, the ADR, the ledger and the pinned three.js say how it entered; the plugin carries no three.js", () => {
  for (const name of PARTS) {
    const text = part(name);
    for (const refused of ["10k", "10K", "http"])
      expect(text, `${name} ${refused}`).not.toContain(refused);
    for (const word of ["signup", "partner", "affiliate", "hostinger", "higgsfield"])
      expect(text.toLowerCase(), `${name} ${word}`).not.toContain(word);
  }
  const sources = part("sources.md");
  for (const phrase of [
    "no licence",
    "2026-11-18",
    "D-1",
    "no sentence, no code, no prompt and no form is copied",
    RELEASE,
  ])
    expect(sources, phrase).toContain(phrase);
  expect(repoFile("docs/adr/0017-outside-sources-enter-the-core-distilled.md")).toContain(
    "item 2026-11-18-017",
  );
  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    rows: { source: string; status: string; file?: string; text?: string; proof?: string }[];
  };
  const rows = ledger.rows.filter((r) => (r.file ?? "").startsWith(`${DIR}/`));
  expect(rows.length).toBeGreaterThanOrEqual(12);
  for (const row of rows) {
    expect(row.status, row.text).toBe("in");
    expect(row.proof, row.text).toBe("design-stage.test.ts");
    expect(repoFile(row.file ?? ""), row.text).toContain(row.text ?? "\u0000");
  }
  expect(sources).toContain("claudedesignskills");
  expect(sources).toContain("the origin of nothing");

  const manifest = JSON.parse(repoFile("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  expect(manifest.devDependencies?.three).toBe(RELEASE);
  expect(manifest.dependencies?.three).toBeUndefined();
  expect(part("references/stage.md")).toContain(RELEASE);
  // The published plugin: no copy of three.js, and nothing outside this skill imports or names it.
  const plugin = filesUnder("plugins/core").filter((file) => !file.startsWith(`${DIR}/`));
  expect(plugin.length).toBeGreaterThan(50);
  for (const file of plugin) {
    expect(file, file).not.toMatch(/(^|\/)three(\/|\.module\.js$)/);
    if (!/\.(m?js|ts|json|md)$/.test(file)) continue;
    const text = repoFile(file);
    expect(/from\s+["']three["'/]|import\(["']three["'/]|"three"\s*:/.test(text), file).toBe(false);
  }
});

test("stage AC-8: the review's bar, the model's origins and commands, and the stage's self-test", () => {
  const review = part("references/review.md");
  const bar = section(review, "The bar");
  expect([...bar.matchAll(/^\d+\. /gm)]).toHaveLength(6);
  const model = part("references/model.md");
  for (const origin of [
    "Generated from an image",
    "Bought or downloaded",
    "The client's own",
    "Drawn in code",
  ])
    expect(model, origin).toContain(origin);
  const commands = fences(model)
    .map((f) => f.body)
    .join("\n");
  expect(commands).toContain("gltf-transform inspect");
  expect(commands).toContain("gltf-transform optimize");
  for (const refused of ["npx", "install", "curl", "|"])
    expect(commands, refused).not.toContain(refused);
  expect(model).toContain("one self-contained binary file");
  const stage = part("references/stage.md");
  const selfTest = section(stage, "The self-test");
  expect([...selfTest.matchAll(/^\d+\. /gm)].length).toBeGreaterThanOrEqual(10);
  for (const phrase of ["reduced motion", "missing", "context", "a real phone"])
    expect(selfTest, phrase).toContain(phrase);
  expect(stage).toContain("4.5:1, or 3:1 for large text");
});

// The stage run in a real browser: a page made of the skill's own markup, import map, CSS, loader
// and engine, three.js from this repository's node_modules, and a model the row makes in code.
// Skipped with a line where this machine has no headless browser that gives a WebGL context.
type Page = {
  goto(url: string): Promise<unknown>;
  emulateMedia(o: { reducedMotion: "reduce" | "no-preference" }): Promise<void>;
  evaluate<T>(script: string): Promise<T>;
  waitForFunction(script: string, arg?: unknown, o?: { timeout: number }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  on(event: "request", handler: (request: { url(): string }) => void): void;
  on(event: "console", handler: (message: { type(): string; text(): string }) => void): void;
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
    deviceScaleFactor?: number;
    reducedMotion?: "reduce" | "no-preference";
  }): Promise<Context>;
  close(): Promise<void>;
};

async function launch(): Promise<Browser | null> {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= join(ROOT, "node_modules", ".cache", "ms-playwright");
  const args = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];
  try {
    const { chromium } = (await import("@playwright/test")) as unknown as {
      chromium: { launch(o: Record<string, unknown>): Promise<Browser> };
    };
    for (const options of [
      { headless: true, args },
      { channel: "chrome", headless: true, args },
    ]) {
      try {
        const found = await chromium.launch(options);
        const context = await found.newContext();
        const probe = await context.newPage();
        const draws = await probe.evaluate<boolean>(
          `!!document.createElement("canvas").getContext("webgl2")`,
        );
        await context.close();
        if (draws) return found;
        await found.close();
      } catch {}
    }
  } catch {}
  return null;
}

/** A box one unit by two by a half, as one binary glTF file; `picture` names an image by address. */
function box(picture?: string): Buffer {
  const half = [0.5, 1, 0.25];
  const faces: [number[], number[], number[]][] = [
    [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ],
    [
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 0],
    ],
    [
      [0, -1, 0],
      [0, 0, -1],
      [1, 0, 0],
    ],
    [
      [0, 0, 1],
      [1, 0, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, -1],
      [-1, 0, 0],
      [0, 1, 0],
    ],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  faces.forEach(([n, u, v], face) => {
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      positions.push(
        ...[0, 1, 2].map((i) => ((n[i] ?? 0) + a * (u[i] ?? 0) + b * (v[i] ?? 0)) * (half[i] ?? 0)),
      );
      normals.push(...n);
    }
    const o = face * 4;
    indices.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const p = Buffer.from(new Float32Array(positions).buffer);
  const n = Buffer.from(new Float32Array(normals).buffer);
  const i = Buffer.from(new Uint16Array(indices).buffer);
  const bin = Buffer.concat([p, n, i]);
  const index = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.5, 0.2, 1],
          // The picture is the material's own: a loader that parsed the file would ask for it.
          ...(picture ? { baseColorTexture: { index: 0 } } : {}),
        },
      },
    ],
    ...(picture ? { images: [{ uri: picture }], textures: [{ source: 0 }] } : {}),
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: p.length },
      { buffer: 0, byteOffset: p.length, byteLength: n.length },
      { buffer: 0, byteOffset: p.length + n.length, byteLength: i.length },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 24,
        type: "VEC3",
        min: half.map((h) => -h),
        max: half,
      },
      { bufferView: 1, componentType: 5126, count: 24, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 36, type: "SCALAR" },
    ],
  };
  let json = Buffer.from(JSON.stringify(index));
  while (json.length % 4) json = Buffer.concat([json, Buffer.from(" ")]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (length: number, type: number): Buffer => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(length, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  return Buffer.concat([
    head,
    chunk(json.length, 0x4e4f534a),
    json,
    chunk(bin.length, 0x004e4942),
    bin,
  ]);
}

const OUTSIDE = "https://outside.invalid/picture.png";

/** A binary glTF that is whole and holds nothing to show: a scene with no node. */
function nothing(): Buffer {
  let json = Buffer.from(
    JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [] }] }),
  );
  while (json.length % 4) json = Buffer.concat([json, Buffer.from(" ")]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + json.length, 8);
  head.writeUInt32LE(json.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, json]);
}
type Model = "whole" | "missing" | "heavy" | "outside" | "empty";

/** The skill's page in a temporary folder, served on 127.0.0.1 with the model the row asks for. */
function site() {
  const stage = part("references/stage.md");
  const [layers = "", map = ""] = blocks(stage, "html");
  const [loader = "", engine = ""] = blocks(stage, "js");
  const review = part("references/review.md");
  const root = mkdtempSync(join(tmpdir(), "crew-stage-"));
  mkdirSync(join(root, "assets"));
  const tokens =
    ":root{--bg:#14110f;--accent:#e8a13a}html{background:var(--bg);color:#fff}body{margin:0}";
  const page = (markup: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>${tokens}${blocks(stage, "css").join("\n")}</style>${map}</head><body>${markup}<div style="position:relative;z-index:1;height:200vh;background:#14110f"></div><script>${loader}</script></body></html>`;
  writeFileSync(
    join(root, "index.html"),
    page(layers.replace("data-stage ", "data-stage data-stage-dev ")),
  );
  writeFileSync(join(root, "plain.html"), page(layers));
  writeFileSync(join(root, "stage.js"), engine);
  writeFileSync(
    join(root, "review.html"),
    (blocks(review, "html")[0] ?? "").replace("</head>", `${map}</head>`),
  );
  writeFileSync(join(root, "review.js"), blocks(review, "js")[0] ?? "");
  writeFileSync(join(root, "assets", "stage-poster.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  writeFileSync(
    join(root, "assets", "stage-poster-portrait.jpg"),
    Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
  );
  const models: Record<Exclude<Model, "missing">, Buffer> = {
    whole: box(),
    heavy: Buffer.concat([box(), Buffer.alloc(7 * 1024 * 1024)]),
    outside: box(OUTSIDE),
    empty: nothing(),
  };
  const state = { model: "whole" as Model };
  const types: Record<string, string> = {
    html: "text/html",
    js: "text/javascript",
    jpg: "image/jpeg",
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/assets/model.glb") {
        if (state.model === "missing") return new Response("", { status: 404 });
        return new Response(models[state.model], {
          headers: { "Content-Type": "model/gltf-binary" },
        });
      }
      // The import map's own folder for three.js, answered from this repository's node_modules.
      const vendor = /^\/vendor\/three\/(.+)$/.exec(path)?.[1];
      const file = vendor
        ? join(ROOT, "node_modules", "three", vendor)
        : join(root, path === "/" ? "index.html" : path);
      if (path.includes("..") || !existsSync(file)) return new Response("", { status: 404 });
      return new Response(readFileSync(file), {
        headers: {
          "Content-Type": types[file.split(".").pop() ?? ""] ?? "application/octet-stream",
        },
      });
    },
  });
  return { root, server, state, origin: `http://127.0.0.1:${server.port}` };
}

const browser = await launch();
if (!browser)
  console.log(
    "design-stage.test.ts: no headless browser with a WebGL context, the browser row skips",
  );
const live = browser ? test : test.skip;
let made: ReturnType<typeof site> | null = null;
afterAll(async () => {
  made?.server.stop(true);
  if (made) rmSync(made.root, { recursive: true, force: true });
  await browser?.close();
});

// The beats as the skill's engine writes them: the camera's position and the object's turn, as the
// stage's element must hold them at rest. Written out here, never read back from the engine.
const BEATS = [
  "1.5 1.2 5.4 0",
  "0.8 1.3 1.9 1.3",
  "0.2 1 5.2 2.8",
  "0.6 4.4 2.5 4.4",
  "1.2 1.1 5 6.28",
];

live(
  "stage AC-5: in a real browser the stage arms, is ready, stands on each beat, rests, fails to the poster and gives the still, and the review page reports a model",
  async () => {
    if (!browser) return;
    made = site();
    const { origin, state } = made;
    const asked: string[] = []; // emptied before each case that counts what the stage asks for
    const every: string[] = []; // every request of every page, never emptied
    const open = async (
      path: string,
      options: Parameters<Browser["newContext"]>[0] = {},
    ): Promise<{ page: Page; errors: string[]; context: Context }> => {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        ...options,
      });
      // A count of the browser's own draw calls, beside the engine's: the row's own measure.
      await context.addInitScript(
        `window.drawCalls = 0; for (const name of ["drawElements", "drawArrays"]) { const real = WebGL2RenderingContext.prototype[name]; WebGL2RenderingContext.prototype[name] = function (...args) { window.drawCalls += 1; return real.apply(this, args); }; }`,
      );
      const page = await context.newPage();
      const errors: string[] = [];
      page.on("request", (request) => {
        asked.push(request.url());
        every.push(request.url());
      });
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${origin}/${path}`);
      return { page, errors, context };
    };
    const classes = (page: Page) => page.evaluate<string>("document.documentElement.className");
    const attribute = (page: Page, name: string) =>
      page.evaluate<string | null>(
        `document.querySelector("[data-stage]").getAttribute("${name}")`,
      );
    const draws = async (page: Page) => Number(await attribute(page, "data-stage-draws"));
    const calls = (page: Page) => page.evaluate<number>("window.drawCalls");
    const settled = (page: Page, mark: string) =>
      page.waitForFunction(`document.documentElement.classList.contains("${mark}")`, null, {
        timeout: 20_000,
      });
    /** The stage at rest: the count of draws has held for 300 ms. */
    const rest = async (page: Page): Promise<number> => {
      for (let last = -1, tries = 0; tries < 60; tries += 1) {
        const now = await draws(page);
        if (now === last) return now;
        last = now;
        await page.waitForTimeout(300);
      }
      throw new Error("the stage never came to rest");
    };
    const scroll = (page: Page, top: number) => page.evaluate<void>(`window.scrollTo(0, ${top})`);
    const stageAsks = () =>
      asked.filter((url) => /stage\.js|\/vendor\/three\/|model\.glb/.test(url));

    // Armed, ready, each beat's own values, and back.
    {
      const { page, errors, context } = await open("index.html");
      await settled(page, "stage-ready");
      expect(await classes(page)).toBe("stage-armed stage-ready");
      for (const [index, beat] of BEATS.entries()) {
        await scroll(page, index * 900);
        await rest(page);
        expect(await attribute(page, "data-stage-state"), `beat ${index + 1}`).toBe(beat);
      }
      await scroll(page, 0);
      const arrived = await rest(page);
      const drawnAtRest = await calls(page);
      expect(drawnAtRest).toBeGreaterThan(0);
      expect(await attribute(page, "data-stage-state")).toBe(BEATS[0] ?? "");
      // At rest nothing is drawn.
      await page.waitForTimeout(500);
      expect(await draws(page)).toBe(arrived);
      expect(await calls(page)).toBe(drawnAtRest);
      // The tab reported hidden: a scroll draws nothing. The listener is proven, not the browser's event.
      await page.evaluate<void>(
        `Object.defineProperty(document, "hidden", { get: () => true, configurable: true }); document.dispatchEvent(new Event("visibilitychange"))`,
      );
      await scroll(page, 900);
      await page.waitForTimeout(500);
      expect(await draws(page)).toBe(arrived);
      expect(await calls(page)).toBe(drawnAtRest);
      await page.evaluate<void>(
        `Object.defineProperty(document, "hidden", { get: () => false, configurable: true }); document.dispatchEvent(new Event("visibilitychange"))`,
      );
      await rest(page);
      expect(await attribute(page, "data-stage-state")).toBe(BEATS[1] ?? "");
      // The page proper covers the stage: scrolling within it draws nothing.
      await scroll(page, 4500);
      const covered = await rest(page);
      const drawnCovered = await calls(page);
      await scroll(page, 5000);
      await page.waitForTimeout(400);
      await scroll(page, 5600);
      await page.waitForTimeout(400);
      expect(await draws(page)).toBe(covered);
      expect(await calls(page)).toBe(drawnCovered);
      expect(errors).toEqual([]);
      // The context lost through the browser's own extension, on the engine's canvas.
      await page.evaluate<void>(
        `document.querySelector("[data-stage] canvas").getContext("webgl2").getExtension("WEBGL_lose_context").loseContext()`,
      );
      await settled(page, "stage-failed");
      expect(await classes(page)).toBe("stage-armed stage-ready stage-failed");
      // After a failure the stage has let go of the page: a scroll draws nothing.
      const lost = await calls(page);
      await scroll(page, 900);
      await page.waitForTimeout(400);
      expect(await calls(page)).toBe(lost);
      await context.close();
    }
    // A stage with no development mark writes no count.
    {
      const { page, context } = await open("plain.html");
      await settled(page, "stage-ready");
      expect(await attribute(page, "data-stage-draws")).toBeNull();
      expect(await attribute(page, "data-stage-state")).toBe(BEATS[0] ?? "");
      await context.close();
    }
    // The cap on pixels.
    {
      const { page, context } = await open("index.html", { deviceScaleFactor: 3 });
      await settled(page, "stage-ready");
      expect(
        await page.evaluate<number>(`document.querySelector("[data-stage] canvas").width`),
      ).toBe(1440 * 1.75);
      await context.close();
    }
    // The ways a model fails, each to the poster: a missing file, one over the ceiling, one that
    // names a picture at another host, and one with nothing to show.
    for (const model of ["missing", "heavy", "outside", "empty"] as const) {
      state.model = model;
      const { page, context } = await open("index.html");
      await settled(page, "stage-failed");
      expect(await classes(page), model).toBe("stage-armed stage-failed");
      await context.close();
    }
    state.model = "whole";
    // Reduced motion at load, then switched while the page is open.
    {
      asked.length = 0;
      const { page, context } = await open("index.html", { reducedMotion: "reduce" });
      await page.waitForTimeout(600);
      expect(await classes(page)).toBe("");
      expect(stageAsks()).toEqual([]);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await settled(page, "stage-ready");
      expect(await classes(page)).toContain("stage-armed");
      await rest(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.waitForTimeout(300);
      expect(await classes(page)).not.toContain("stage-armed");
      const still = await draws(page);
      await scroll(page, 900);
      await page.waitForTimeout(500);
      expect(await draws(page)).toBe(still);
      await context.close();
    }
    // A phone: the still, nothing asked, nothing wider than the screen.
    {
      asked.length = 0;
      const { page, context } = await open("index.html", { viewport: { width: 375, height: 812 } });
      await page.waitForTimeout(600);
      expect(await classes(page)).toBe("");
      expect(stageAsks()).toEqual([]);
      expect(
        await page.evaluate<number>("document.documentElement.scrollWidth"),
      ).toBeLessThanOrEqual(375);
      await context.close();
    }
    // A narrow window wider than it is tall: the first condition alone gives the still.
    {
      asked.length = 0;
      const { page, context } = await open("index.html", { viewport: { width: 700, height: 500 } });
      await page.waitForTimeout(600);
      expect(await classes(page)).toBe("");
      expect(stageAsks()).toEqual([]);
      await context.close();
    }
    // The review page.
    {
      const { page, context } = await open("review.html?model=assets/model.glb&front=0.6");
      await page.waitForFunction("document.body.dataset.ready", null, { timeout: 20_000 });
      expect(await page.evaluate<string>("document.body.dataset.ready")).toBe("model");
      expect(
        await page.evaluate<string>(`document.querySelector("[data-report]").textContent`),
      ).toContain("12 triangles");
      await context.close();
      const gone = await open("review.html?model=assets/none.glb");
      await gone.page.waitForFunction("document.body.dataset.ready", null, { timeout: 20_000 });
      expect(await gone.page.evaluate<string>("document.body.dataset.ready")).toBe("failed");
      await gone.context.close();
    }
    // Armed and failed, the page asked nothing of any origin but its own.
    expect(every.filter((url) => url.endsWith("/assets/model.glb")).length).toBeGreaterThan(5);
    expect(every.filter((url) => !url.startsWith(`${origin}/`))).toEqual([]);
  },
  180_000,
);
