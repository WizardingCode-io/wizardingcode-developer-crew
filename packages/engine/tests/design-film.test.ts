// The film a new site opens on (item 2026-11-18-001): the crew's skill for a clip that plays with the
// scroll. Each row reads the skill's files as a session would and holds what the spec's criteria fix.
import { afterAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const DIR = "plugins/core/skills/wizardingcode-design-film";
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const part = (name: string): string => repoFile(`${DIR}/${name}`);
const PARTS = ["SKILL.md", "references/shots.md", "references/encode.md", "references/scrub.md"];

/** The fenced blocks of a Markdown text, each with the word after its opening fence. */
function fences(text: string): { lang: string; body: string }[] {
  const out: { lang: string; body: string }[] = [];
  const pattern = /^```([a-z]*)\n([\s\S]*?)^```$/gm;
  for (let m = pattern.exec(text); m; m = pattern.exec(text))
    out.push({ lang: m[1] ?? "", body: m[2] ?? "" });
  return out;
}

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

test("film AC-9: the skill has the design skills' form and its four parts, and the direction and build skills send a session to it", () => {
  for (const name of [...PARTS, "sources.md"])
    expect(existsSync(join(ROOT, DIR, name)), name).toBe(true);
  const skill = part("SKILL.md");
  expect(skill).toContain("name: wizardingcode-design-film");
  const description = /^description: "(.*)"$/m.exec(skill)?.[1] ?? "";
  expect(description.length).toBeGreaterThan(0);
  expect(description.length).toBeLessThanOrEqual(200);
  for (const heading of ["When", "Inputs", "Steps", "Output", "Done when"])
    expect(skill, heading).toContain(`## ${heading}\n`);
  for (const ref of PARTS.slice(1)) expect(skill, ref).toContain(ref);
  for (const other of ["direction", "build"])
    expect(repoFile(`plugins/core/skills/wizardingcode-design-${other}/SKILL.md`), other).toContain(
      "wizardingcode-design-film",
    );
});

test("film AC-10: nine steps in order, a price said and the user's approval before each paid asset, and what stays the user's", () => {
  const all = steps(part("SKILL.md"));
  const titles = [
    "The tools",
    "The page first",
    "The storyboard",
    "The frame",
    "The film",
    "The encode",
    "The build",
    "The rest of the page",
    "The self-test",
  ];
  expect(all.map((s) => /^(\d+)\. \*\*(.*?)\.?\*\*/.exec(s)?.slice(1, 3))).toEqual(
    titles.map((t, i) => [String(i + 1), t]),
  );
  expect(all[0]).toContain("installs nothing");
  expect(all[2]).toContain("The user approves it before anything is generated");
  for (const paid of [all[3], all[4]]) {
    expect(paid).toContain("Its price is said before it is made");
    expect(paid).toContain("the user approves");
  }
  expect(all[4]).toContain("No page is built on a clip the user has not approved");
  expect(all[4]).toContain("three refused attempts");
  const stays = section(part("SKILL.md"), "What stays the user's");
  for (const phrase of [
    "the user's own message in this conversation",
    "With nobody present",
    "Every attempt is priced and approved by itself",
    "never signs up",
    "never enters payment details",
    "never buys credits",
    "key is never written",
  ])
    expect(stays, phrase).toContain(phrase);
});

test("film AC-11: the encode's commands are whole, and none fetches, installs or pipes", () => {
  const text = part("references/encode.md");
  const blocks = fences(text).map((f) => f.body);
  // Every command that encodes a clip the page scrubs carries the scrub's flags, the joins included.
  const commands = blocks.flatMap((b) => b.split("\n"));
  const encodes = commands.filter((line) => line.includes("libx264"));
  expect(encodes.length).toBeGreaterThanOrEqual(4);
  for (const line of encodes)
    for (const flag of ["-g 8 ", "-keyint_min 8 ", "-movflags +faststart", " -an ", "yuv420p"])
      expect(line, flag).toContain(flag);
  expect(
    commands.some((l) => l.includes("-frames:v 1") && l.endsWith("assets/film-poster.jpg")),
  ).toBe(true);
  expect(commands.some((l) => l.includes("-sseof") && l.endsWith("assets/film-ending.jpg"))).toBe(
    true,
  );
  expect(blocks.some((b) => b.includes("signalstats"))).toBe(true);
  for (const word of ["http", "curl", "wget", "npx", "npm", "brew", "apt-get", "winget"])
    expect(text, word).not.toContain(word);
  for (const body of blocks) expect(body).not.toContain("|");
});

const QUERIES = [
  "(max-width: 720px)",
  "(orientation: portrait) and (max-width: 1024px)",
  "(orientation: portrait) and (pointer: coarse)",
  "(orientation: landscape) and (pointer: coarse) and (max-height: 560px)",
  "(prefers-reduced-motion: reduce)",
];

test("film AC-12: the engine is one block of JavaScript that parses and holds its four things, and the still hero's five queries stand in the CSS and in the script", () => {
  const text = part("references/scrub.md");
  const engines = fences(text).filter((f) => f.lang === "js");
  expect(engines).toHaveLength(1);
  const engine = engines[0]?.body ?? "";
  expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(engine)).not.toThrow();
  for (const token of [
    "URL.createObjectURL",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "Math.pow",
    '"seeked"',
    '"error"',
    "matchMedia(",
    '"change"',
    "MAX_BYTES",
  ])
    expect(engine, token).toContain(token);
  expect(engine).not.toContain("setInterval");
  expect(engine).not.toContain("http");
  // The five conditions stand in the script and in the CSS, the same strings in both.
  const css = fences(text)
    .filter((f) => f.lang === "css")
    .map((f) => f.body.replace(/\s+/g, " "))
    .join("\n");
  for (const query of QUERIES) {
    expect(engine, query).toContain(query);
    expect(css, query).toContain(query);
  }
  // Every class and property the engine sets has a rule in the CSS.
  for (const name of ["film-armed", "film-ready", "film-failed", "--k"]) {
    expect(engine, name).toContain(name);
    expect(css, name).toContain(name);
  }
});

test("film AC-5: text over footage holds the norm's contrast against the worst frame, and the self-test names reduced motion and a blocked clip", () => {
  const text = part("references/scrub.md");
  const words = section(text, "Words over moving footage");
  expect(words).toContain("holds 4.5:1, or 3:1 for large text");
  expect(words).toContain("the worst frame of its window");
  const test_ = section(text, "The self-test");
  expect((test_.match(/^\d+\. /gm) ?? []).length).toBeGreaterThanOrEqual(8);
  expect(test_).toContain("reduced motion");
  expect(test_).toContain("with the clip blocked");
});

test("film AC-6: at least eight shot rules and two forms, each of which refuses text", () => {
  const text = part("references/shots.md");
  expect((section(text, "The rules").match(/^\d+\. /gm) ?? []).length).toBeGreaterThanOrEqual(8);
  const forms = fences(text).map((f) => f.body);
  expect(forms).toHaveLength(2);
  for (const form of forms) expect(form).toContain("No text");
});

test("film AC-13: nothing of the material's maker stands outside the sources file, and the sources, the ADR and the ledger say how it entered", () => {
  for (const name of PARTS) {
    const text = part(name);
    for (const refused of ["10k", "10K", "Metics", "http"])
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
  ])
    expect(sources, phrase).toContain(phrase);
  const adr = repoFile("docs/adr/0017-outside-sources-enter-the-core-distilled.md");
  expect(adr).toContain("item 2026-11-18-001, the user's decision D-1");
  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    rows: { source: string; status: string; file?: string; text?: string }[];
  };
  const rows = ledger.rows.filter((r) => r.source === "10k-websites");
  expect(rows).toHaveLength(8);
  for (const row of rows) {
    expect(row.status).toBe("in");
    expect(PARTS.map((name) => `${DIR}/${name}`)).toContain(row.file ?? "");
    expect(repoFile(row.file ?? "")).toContain(row.text ?? "\u0000");
  }
});

test("film AC-14: the skill says what it refuses", () => {
  const refuses = section(part("SKILL.md"), "What the skill refuses");
  for (const phrase of [
    "never a child",
    "the person agreed",
    "A generated person is never shown as a customer",
    "blocking objection",
    "No real brand's mark",
    "no living artist's",
    "is refused and made again",
    "says what is sent and to which service",
    "stay out of the folder that ships and out of commits",
    "deploys nothing and publishes no asset to a public address",
    "the client's own counsel",
  ])
    expect(refuses, phrase).toContain(phrase);
});

// The engine run in a real browser: a page made of the skill's own markup, CSS and script, served
// from a folder whose clip and poster are made by the commands of the skill's own encode reference.
// Skipped with a line where this machine has no browser that plays H.264 or no ffmpeg.
type Request = { url(): string };
type Page = {
  goto(url: string): Promise<unknown>;
  setViewportSize(s: { width: number; height: number }): Promise<void>;
  emulateMedia(o: { reducedMotion: "reduce" | "no-preference" }): Promise<void>;
  evaluate<T>(script: string): Promise<T>;
  waitForFunction(script: string, arg?: unknown, o?: { timeout: number }): Promise<unknown>;
  route(
    pattern: string,
    handler: (route: { abort(): Promise<void>; continue(): Promise<void> }) => void,
  ): Promise<void>;
  on(event: "request", handler: (request: Request) => void): void;
  close(): Promise<void>;
};
type Browser = {
  newPage(o?: { javaScriptEnabled?: boolean }): Promise<Page>;
  close(): Promise<void>;
};

async function launch(): Promise<Browser | null> {
  try {
    const { chromium } = (await import("@playwright/test")) as unknown as {
      chromium: { launch(o: Record<string, unknown>): Promise<Browser> };
    };
    for (const options of [{ channel: "chrome", headless: true }, { headless: true }]) {
      try {
        const found = await chromium.launch(options);
        const probe = await found.newPage();
        const plays = await probe.evaluate<string>(
          `document.createElement("video").canPlayType('video/mp4; codecs="avc1.42E01E"')`,
        );
        await probe.close();
        if (plays) return found;
        await found.close();
      } catch {}
    }
  } catch {}
  return null;
}

/**
 * The arguments of the first ffmpeg command under a heading of the encode reference. The list goes
 * to ffmpeg itself and never to a shell, and a line that holds an address, a path out of the folder
 * it runs in or a shell's character is refused. It is no sandbox: ffmpeg has other ways to name a
 * file (a protocol prefix, a filter that reads a path), and what keeps those out is that the
 * reference is the repository's own text.
 */
function command(heading: string): string[] {
  const line = fences(section(part("references/encode.md"), heading))
    .flatMap((f) => f.body.split("\n"))
    .find((l) => l.startsWith("ffmpeg "));
  const args = (line ?? "").split(" ").slice(1);
  const unsafe = (a: string) =>
    a.includes("://") || a.startsWith("/") || a.includes("..") || /[;&|`$<>"']/.test(a);
  if (args.length === 0 || args.some(unsafe)) throw new Error(`no plain command under ${heading}`);
  return args;
}

/**
 * A folder with the skill's page, a clip that brightens from black to white over two seconds, and
 * its poster. Null where this machine cannot make a source clip; a command of the skill's own that
 * fails is an error, not a skip.
 */
function site(): string | null {
  if (spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status !== 0) return null;
  // Read before anything is made, so a reference with no plain command leaves no folder behind.
  const wrote: [heading: string, file: string, args: string[]][] = [
    ["The scrub encode", "assets/film.mp4", command("The scrub encode")],
    [
      "The poster and the ending frame",
      "assets/film-poster.jpg",
      command("The poster and the ending frame"),
    ],
  ];
  const root = mkdtempSync(join(tmpdir(), "crew-film-"));
  const run = (args: string[]) =>
    spawnSync("ffmpeg", ["-v", "error", ...args], { cwd: root, encoding: "utf8" });
  mkdirSync(join(root, "assets"));
  mkdirSync(join(root, "raw"));
  const source = "color=c=white:s=320x180:r=24:d=2,fade=t=in:st=0:d=2";
  const raw = ["-f", "lavfi", "-i", source, "-c:v", "libx264", "-pix_fmt", "yuv420p"];
  if (run([...raw, "raw/film.mp4"]).status !== 0) {
    rmSync(root, { recursive: true, force: true });
    return null;
  }
  for (const [heading, file, args] of wrote) {
    const made = run(args);
    if (made.status === 0 && existsSync(join(root, file))) continue;
    rmSync(root, { recursive: true, force: true });
    throw new Error(`the encode reference's command under "${heading}" fails: ${made.stderr}`);
  }
  const text = part("references/scrub.md");
  const of = (lang: string) =>
    fences(text)
      .filter((f) => f.lang === lang)
      .map((f) => f.body)
      .join("\n");
  // The engine as the skill says to place it: a plain script directly after the section.
  const page = (script: string) =>
    `<!doctype html><html><head><style>*{margin:0}${of("css")}</style></head><body>${of("html")}${script}<main style="height:150vh"><h2>The page proper</h2></main></body></html>`;
  writeFileSync(join(root, "index.html"), page(`<script>${of("js")}</script>`));
  writeFileSync(join(root, "plain.html"), page(""));
  return root;
}

const browser = await launch();
/** The site, with the browser closed first where a command of the skill's own fails. */
async function made(): Promise<string | null> {
  try {
    return site();
  } catch (error) {
    await browser?.close();
    throw error;
  }
}
const root = browser ? await made() : null;
if (!browser || !root)
  console.log(
    "design-film.test.ts: no browser that plays H.264 or no ffmpeg, the browser row skips",
  );
const live = browser && root ? test : test.skip;
afterAll(async () => {
  if (root) rmSync(root, { recursive: true, force: true });
  await browser?.close();
});

type State = {
  classes: string;
  time: number;
  duration: number;
  light: number;
  shown: string | false;
  opacity: number[];
  reach: string;
  cut: boolean;
  span: number;
};
/** What the page shows: the classes, the clip's time, the brightness of the frame painted, the lines. */
const STATE = `(() => {
  const film = document.querySelector("[data-film]");
  const stage = film.querySelector(".film-stage");
  const video = film.querySelector("video");
  const lines = [...film.querySelectorAll(".film-line")];
  const look = getComputedStyle(video);
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 9;
  const context = canvas.getContext("2d");
  let light = -1;
  if (video.readyState >= 2) {
    context.drawImage(video, 0, 0, 16, 9);
    const data = context.getImageData(0, 0, 16, 9).data;
    light = 0;
    for (let i = 0; i < data.length; i += 4) light += data[i];
    light = Math.round(light / (data.length / 4));
  }
  const floor = stage.getBoundingClientRect().bottom;
  return {
    classes: film.className,
    time: video.currentTime,
    duration: video.duration,
    light,
    shown: look.display !== "none" && look.opacity,
    opacity: lines.map((l) => Number(getComputedStyle(l).opacity)),
    reach: getComputedStyle(film.querySelector(".film-line a")).visibility,
    cut: lines.some((l) => l.getBoundingClientRect().bottom > floor + 1),
    span: film.getBoundingClientRect().height - innerHeight,
  };
})()`;
const has = (name: string) => `document.querySelector("[data-film]").classList.contains("${name}")`;
const lines = (want: number[]) =>
  `JSON.stringify([...document.querySelectorAll(".film-line")].map((l) => Number(getComputedStyle(l).opacity))) === '${JSON.stringify(want)}'`;

live(
  "film AC-16: in a real browser the skill's page is a whole still with no script, plays its clip with the scroll when the engine arms, and is the still again under each condition that asks for it",
  async () => {
    // A server for this row's life, on this machine alone.
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const path = new URL(request.url).pathname;
        const name = join(root as string, path === "/" ? "index.html" : path);
        // No type is sent for the clip: the engine says its own.
        return existsSync(name)
          ? new Response(Bun.file(name).stream())
          : new Response("", { status: 404 });
      },
    });
    const url = `http://127.0.0.1:${server.port}/`;
    const open = async (
      path: string,
      o: {
        width?: number;
        height?: number;
        script?: boolean;
        reduced?: boolean;
        block?: boolean;
        slow?: boolean;
      },
    ) => {
      const page = await (browser as Browser).newPage({ javaScriptEnabled: o.script !== false });
      const asked: string[] = [];
      page.on("request", (request) => asked.push(new URL(request.url()).pathname));
      await page.setViewportSize({ width: o.width ?? 1280, height: o.height ?? 800 });
      if (o.reduced) await page.emulateMedia({ reducedMotion: "reduce" });
      if (o.block) await page.route("**/assets/film.mp4", (route) => route.abort());
      // A clip that takes a second and a half to start arriving.
      if (o.slow)
        await page.route("**/assets/film.mp4", (route) => {
          setTimeout(() => void route.continue().catch(() => {}), 1500);
        });
      await page.goto(url + path);
      return { page, asked };
    };
    const wait = (page: Page, script: string) =>
      page.waitForFunction(script, undefined, { timeout: 10000 });
    // The clip is where the scroll puts it and has a frame to show there.
    const settle = (page: Page, at: number) =>
      wait(
        page,
        `(() => { const v = document.querySelector("[data-film] video"); return v.readyState >= 2 && !v.seeking && Math.abs(v.currentTime - ${at}) < 0.2; })()`,
      );
    const still = (state: State) => {
      expect(state.classes).not.toContain("film-armed");
      expect(state.opacity.length).toBe(3);
      expect(state.opacity.every((o) => o === 1)).toBe(true);
      expect(state.shown).toBe(false);
      expect(state.cut).toBe(false);
      expect(state.reach).toBe("visible"); // in a still the one action is there to use
    };
    try {
      // With no script at all, on a phone's screen: the still, every line visible and none cut, the
      // poster asked for and the clip not.
      const plain = await open("plain.html", { width: 375, height: 667, script: false });
      still(await plain.page.evaluate<State>(STATE));
      expect(plain.asked).toContain("/assets/film-poster.jpg");
      expect(plain.asked).not.toContain("/assets/film.mp4");
      await plain.page.close();

      // The film: the engine arms, the clip arrives and shows, and the frame painted follows the scroll.
      const film = await open("", {});
      await wait(film.page, `${has("film-armed")} && ${has("film-ready")}`);
      await wait(film.page, lines([1, 0, 0]));
      const top = await film.page.evaluate<State>(STATE);
      expect(top.duration).toBeGreaterThan(1.5);
      // The one action is in the last line: out of its window it takes no focus and no click.
      expect(top.reach).toBe("hidden");
      // The engine is one function: it leaves no name of its own on the page.
      expect(
        await film.page.evaluate<string>(`[typeof seek, typeof disarm, typeof decide].join()`),
      ).toBe("undefined,undefined,undefined");
      await film.page.evaluate(`window.scrollTo(0, ${top.span})`);
      await settle(film.page, top.duration);
      await wait(film.page, lines([0, 0, 1]));
      await wait(
        film.page,
        `getComputedStyle(document.querySelector("[data-film] video")).opacity === "1"`,
      );
      const end = await film.page.evaluate<State>(STATE);
      expect(end.shown).toBe("1");
      expect(end.reach).toBe("visible");
      // A burst of scrolls, a frame apart so that each is read and starts a seek, ending in the
      // middle: the clip ends where the last one put it.
      await film.page.evaluate(
        `(async () => { for (let i = 0; i < 20; i++) { window.scrollTo(0, ${top.span} * ((i * 7) % 20) / 20); await new Promise(requestAnimationFrame); } window.scrollTo(0, ${top.span / 2}); })()`,
      );
      await settle(film.page, top.duration / 2);
      await wait(film.page, lines([0, 1, 0]));
      const middle = await film.page.evaluate<State>(STATE);
      await film.page.evaluate("window.scrollTo(0, 0)");
      await settle(film.page, 0);
      await wait(film.page, lines([1, 0, 0]));
      const back = await film.page.evaluate<State>(STATE);
      // The clip brightens with its time, so the frame painted says where the clip is.
      expect(back.light).toBeGreaterThanOrEqual(0);
      expect(back.light).toBeLessThan(40);
      expect(middle.light).toBeGreaterThan(back.light + 40);
      expect(end.light).toBeGreaterThan(middle.light + 40);
      // Reduced motion switched on while the page is open: the still. Switched off: the film again.
      await film.page.emulateMedia({ reducedMotion: "reduce" });
      await wait(film.page, `!${has("film-armed")}`);
      still(await film.page.evaluate<State>(STATE));
      await film.page.emulateMedia({ reducedMotion: "no-preference" });
      await wait(film.page, has("film-armed"));
      await wait(film.page, lines([1, 0, 0]));
      await film.page.close();

      // Loaded under reduced motion, and loaded on a narrow screen: the still, and no request for the clip.
      // 700 by 500 is landscape, so of the five conditions the first alone holds there.
      for (const o of [{ reduced: true }, { width: 700, height: 500 }]) {
        const calm = await open("", o);
        await wait(calm.page, "document.readyState === 'complete'");
        await Bun.sleep(600); // an engine that asks a little after the load is still caught
        still(await calm.page.evaluate<State>(STATE));
        expect(calm.asked).toContain("/assets/film-poster.jpg");
        expect(calm.asked).not.toContain("/assets/film.mp4");
        // Loaded as a still and then freed: the engine arms and asks for the clip then.
        if (o.reduced) {
          await calm.page.emulateMedia({ reducedMotion: "no-preference" });
          await wait(calm.page, `${has("film-armed")} && ${has("film-ready")}`);
          expect(calm.asked).toContain("/assets/film.mp4");
        }
        await calm.page.close();
      }

      // Turned to the still while the clip is still arriving: the late clip writes nothing into it.
      // This pins the behaviour and tells no fix: it holds with the engine's armed guard and without.
      const late = await open("", { slow: true });
      await wait(late.page, has("film-armed"));
      await late.page.emulateMedia({ reducedMotion: "reduce" });
      await wait(late.page, `!${has("film-armed")}`);
      await wait(late.page, has("film-ready"));
      await Bun.sleep(300);
      still(await late.page.evaluate<State>(STATE));
      await late.page.close();

      // The clip blocked: the page says so and the lines still follow the scroll over the poster.
      const blocked = await open("", { block: true });
      await wait(blocked.page, has("film-failed"));
      await wait(blocked.page, lines([1, 0, 0]));
      const failed = await blocked.page.evaluate<State>(STATE);
      expect(failed.shown).toBe(false);
      await blocked.page.evaluate(`window.scrollTo(0, ${failed.span})`);
      await wait(blocked.page, lines([0, 0, 1]));
      await blocked.page.close();
    } finally {
      server.stop(true);
    }
  },
  120000,
);
