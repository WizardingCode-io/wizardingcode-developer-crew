// The UI evidence's engine side (SP9 Task 3, design §4): the screens the criteria declare, the plan
// the e2e gate writes for the fixture, the dark scheme read from the project, the sweep of an earlier
// fixture run's files, the viewports a person sets, and the captures read back from the folder.
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { listCaptures, readReviewInputs, writeReviewInputs } from "../src/judgement.ts";
import { ensureProfile } from "../src/profile.ts";
import type { Profile } from "../src/types.ts";
import {
  capturesLine,
  DEFAULT_VIEWPORTS,
  darkScheme,
  expectedScreens,
  gradeUi,
  parseScreens,
  parseViewports,
  safeList,
  safeText,
  screensSummary,
  sweepStaleFixtureFiles,
  uiPlanPath,
  writeUiPlan,
} from "../src/ui.ts";
import { addCriterion, createWork, supersedeCriterion } from "../src/work.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const SCREENS_RULE = "screens: use page:state with [a-z0-9-]+ names, comma-separated";

function uiFolder(paths: ReturnType<typeof repoPaths>, id: string): string {
  const dir = join(paths.crewDir, "work", id, "review", "ui");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** A fixture capture's files in the folder: the images, the console, the aria, the metadata. */
function fixtureCapture(
  dir: string,
  page: string,
  state: string,
  widths = [360, 768, 1280],
  dark = true,
): void {
  const base = `${page}-${state}`;
  const viewports = widths.map((width, i) => {
    const light = `${base}@${width}.png`;
    writeFileSync(join(dir, light), "png");
    let darkFile: string | null = null;
    if (dark && i === widths.length - 1) {
      darkFile = `${base}@${width}-dark.png`;
      writeFileSync(join(dir, darkFile), "png");
    }
    return { name: `v${width}`, width, height: 800, light, dark: darkFile };
  });
  writeFileSync(join(dir, `console-${base}.json`), "[]");
  writeFileSync(join(dir, `${base}.aria.yml`), "- heading\n");
  writeFileSync(join(dir, `axe-${base}.json`), '{"violations":[]}');
  writeFileSync(
    join(dir, `${base}.json`),
    JSON.stringify({
      page,
      state,
      by: "fixture",
      viewports,
      console: `console-${base}.json`,
      aria: `${base}.aria.yml`,
      axe: { status: "clean", file: `axe-${base}.json`, violations: [] },
    }),
  );
}

function fixtureMotion(dir: string, page: string, interaction: string): void {
  const key = `${page}-${interaction}`;
  mkdirSync(join(dir, "motion", key), { recursive: true });
  writeFileSync(join(dir, "motion", key, "00.png"), "png");
  writeFileSync(join(dir, "motion", key, "01.png"), "png");
  writeFileSync(join(dir, `${key}.strip.png`), "png");
  writeFileSync(
    join(dir, `${key}.motion.json`),
    JSON.stringify({
      page,
      interaction,
      frames: { dir: `motion/${key}`, strip: `${key}.strip.png`, count: 2 },
    }),
  );
}

test("SP9-T3 AC-1: parseScreens reads page:state pairs with the fixture's names and refuses anything else naming the rule", () => {
  expect(parseScreens("checkout:error,checkout:empty")).toEqual([
    { page: "checkout", state: "error" },
    { page: "checkout", state: "empty" },
  ]);
  expect(parseScreens(" inbox:default , inbox:default ")).toEqual([
    { page: "inbox", state: "default" },
  ]);
  for (const bad of ["Checkout:error", "checkout", "checkout:er ror", "a/b:c", "", ":x", "x:"]) {
    expect(parseScreens(bad)).toEqual({ refused: SCREENS_RULE });
  }
});

test("SP9-T3 AC-2: expectedScreens is the union of the live criteria's screens with the criteria that declare them, sorted, superseded ones excluded", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  addCriterion(work, "a", "behavior", undefined, [{ page: "checkout", state: "error" }]);
  addCriterion(work, "b", "behavior", undefined, [
    { page: "checkout", state: "error" },
    { page: "checkout", state: "empty" },
  ]);
  addCriterion(work, "c", "behavior", undefined, [{ page: "inbox", state: "default" }]);
  addCriterion(work, "d", "behavior");
  expect(expectedScreens(work)).toEqual([
    { page: "checkout", state: "empty", criteria: ["AC-2"] },
    { page: "checkout", state: "error", criteria: ["AC-1", "AC-2"] },
    { page: "inbox", state: "default", criteria: ["AC-3"] },
  ]);
  // AC-4 replaces AC-3: AC-3's screens no longer count.
  const superseded = supersedeCriterion(work, "AC-3", "AC-4");
  expect("refused" in superseded).toBe(false);
  expect(expectedScreens(work).map((s) => `${s.page}-${s.state}`)).toEqual([
    "checkout-empty",
    "checkout-error",
  ]);
});

test("SP9-T3 AC-2: writeUiPlan writes review/ui-plan.json from the profile's ui block or the defaults, the dark scheme from the profile or the stylesheets", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "feature");
  addCriterion(work, "a", "behavior", undefined, [{ page: "checkout", state: "error" }]);
  // No ui block, no dark stylesheet: the defaults, light only, darkFrom none.
  const first = writeUiPlan(paths, work, profile);
  expect(first.file).toBe(uiPlanPath(paths, work.id));
  expect(first.file).toBe(join(paths.crewDir, "work", work.id, "review", "ui-plan.json"));
  const written = JSON.parse(readFileSync(first.file, "utf8")) as Record<string, unknown>;
  expect(written).toEqual(first.plan as unknown as Record<string, unknown>);
  expect(written).toMatchObject({
    id: work.id,
    viewports: DEFAULT_VIEWPORTS,
    colorSchemes: ["light"],
    darkFrom: "none",
    screens: [{ page: "checkout", state: "error", criteria: ["AC-1"] }],
  });
  expect(DEFAULT_VIEWPORTS).toEqual([
    { name: "mobile", width: 360, height: 800 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1280, height: 800 },
  ]);
  expect(typeof written.at).toBe("string");
  // A stylesheet with the media query: dark from the stylesheets.
  write(
    root,
    "src/app.css",
    "body { color: #111 }\n@media (prefers-color-scheme: dark) { body { color: #eee } }\n",
  );
  expect(darkScheme(root, profile)).toEqual({ dark: true, from: "stylesheets" });
  expect(writeUiPlan(paths, work, profile).plan).toMatchObject({
    colorSchemes: ["light", "dark"],
    darkFrom: "stylesheets",
  });
  // The profile's word wins over the stylesheets, both ways.
  const off: Profile = {
    ...profile,
    ui: { viewports: [{ name: "mobile", width: 390, height: 844 }], dark: false },
  };
  expect(darkScheme(root, off)).toEqual({ dark: false, from: "profile" });
  expect(writeUiPlan(paths, work, off).plan).toMatchObject({
    viewports: [{ name: "mobile", width: 390, height: 844 }],
    colorSchemes: ["light"],
    darkFrom: "profile",
  });
  const on: Profile = { ...profile, ui: { viewports: DEFAULT_VIEWPORTS.slice(), dark: true } };
  expect(writeUiPlan(paths, work, on).plan).toMatchObject({
    colorSchemes: ["light", "dark"],
    darkFrom: "profile",
  });
  // A `.dark` class and a data-theme attribute count too; a plain `.darker` does not.
  write(root, "src/app.css", ".darker { opacity: .9 }\n");
  expect(darkScheme(root, profile).from).toBe("none");
  write(root, "src/theme.scss", "html.dark { --bg: #000 }\n");
  expect(darkScheme(root, profile)).toEqual({ dark: true, from: "stylesheets" });
  write(root, "src/theme.scss", '[data-theme="dark"] { --bg: #000 }\n');
  expect(darkScheme(root, profile)).toEqual({ dark: true, from: "stylesheets" });
});

test("SP9-T3 AC-2: the dark-scheme read never follows a symlink, skips the dependency folders and stops at 400 files", () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const outside = tempDir();
  writeFileSync(join(outside, "dark.css"), "@media (prefers-color-scheme: dark) { body {} }\n");
  mkdirSync(join(root, "styles"), { recursive: true });
  symlinkSync(join(outside, "dark.css"), join(root, "styles", "link.css"));
  symlinkSync(outside, join(root, "styles", "linked-folder"));
  expect(darkScheme(root, profile)).toEqual({ dark: false, from: "none" });
  // A match under node_modules or dist is not the project's.
  write(root, "node_modules/lib/dark.css", "@media (prefers-color-scheme: dark) { body {} }\n");
  write(root, "dist/app.css", "html.dark {}\n");
  expect(darkScheme(root, profile).from).toBe("none");
  // The cap: 400 plain stylesheets read, the 401st (last in name order) holds the match and is not reached.
  for (let i = 0; i < 400; i++)
    write(root, `styles/a${String(i).padStart(3, "0")}.css`, "body { margin: 0 }\n");
  write(root, "styles/zzz.css", "@media (prefers-color-scheme: dark) { body {} }\n");
  expect(darkScheme(root, profile).from).toBe("none");
  // One file fewer and the match is read.
  write(root, "styles/a399.css", "@media (prefers-color-scheme: dark) { body {} }\n");
  expect(darkScheme(root, profile).from).toBe("stylesheets");
});

test("SP9-T3 AC-2: the sweep removes an earlier fixture run's files and nothing else: the session's captures stay, names outside the fixture's shape are skipped and said, a symlink is removed as a link", () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  fixtureCapture(ui, "checkout", "default");
  fixtureMotion(ui, "checkout", "open");
  // The session's: a bare capture with its console, and a capture whose metadata says session.
  writeFileSync(join(ui, "home-empty.png"), "png");
  writeFileSync(join(ui, "console-home-empty.json"), "[]");
  writeFileSync(join(ui, "cart-error@360.png"), "png");
  writeFileSync(
    join(ui, "cart-error.json"),
    JSON.stringify({
      page: "cart",
      state: "error",
      by: "session",
      viewports: [{ light: "cart-error@360.png", dark: null }],
    }),
  );
  // Forged metadata naming paths outside the folder, and a motion sample escaping its folder.
  const victim = join(paths.crewDir, "work", work.id, "review", "victim.txt");
  writeFileSync(victim, "keep");
  writeFileSync(
    join(ui, "evil-default.json"),
    JSON.stringify({
      page: "evil",
      state: "default",
      by: "fixture",
      viewports: [{ light: "../victim.txt", dark: victim }],
      console: "motion/../../victim.txt",
      aria: "sub/dir.aria.yml",
    }),
  );
  writeFileSync(
    join(ui, "bad-open.motion.json"),
    JSON.stringify({
      page: "bad",
      interaction: "open",
      frames: { dir: "motion/../..", strip: "/etc/hosts" },
    }),
  );
  // A symlink named by a fixture's metadata: removed as a link, its target untouched.
  const target = join(tempDir(), "target.png");
  writeFileSync(target, "png");
  symlinkSync(target, join(ui, "linked-shot@360.png"));
  writeFileSync(
    join(ui, "linked-shot.json"),
    JSON.stringify({
      page: "linked",
      state: "shot",
      by: "fixture",
      viewports: [{ light: "linked-shot@360.png", dark: null }],
    }),
  );
  const before = readdirSync(ui).sort();
  const result = sweepStaleFixtureFiles(ui);
  const after = readdirSync(ui).sort();
  // The fixture capture and the motion sample are gone whole.
  for (const name of [
    "checkout-default@360.png",
    "checkout-default@768.png",
    "checkout-default@1280.png",
    "checkout-default@1280-dark.png",
    "console-checkout-default.json",
    "checkout-default.aria.yml",
    "axe-checkout-default.json",
    "checkout-default.json",
    "checkout-open.strip.png",
    "checkout-open.motion.json",
  ]) {
    expect(before).toContain(name);
    expect(after).not.toContain(name);
  }
  expect(existsSync(join(ui, "motion", "checkout-open"))).toBe(false);
  // The session's stay.
  for (const name of [
    "home-empty.png",
    "console-home-empty.json",
    "cart-error@360.png",
    "cart-error.json",
  ])
    expect(after).toContain(name);
  // The escaping names were skipped and said; the forged metadata files themselves are gone.
  expect(existsSync(victim)).toBe(true);
  expect(existsSync("/etc/hosts")).toBe(true);
  expect(existsSync(join(paths.crewDir, "work", work.id, "review"))).toBe(true);
  expect(after).not.toContain("evil-default.json");
  expect(after).not.toContain("bad-open.motion.json");
  expect(result.skipped.sort()).toEqual(
    [
      "../victim.txt",
      victim,
      "motion/../../victim.txt",
      "sub/dir.aria.yml",
      "motion/../..",
      "/etc/hosts",
    ].sort(),
  );
  // The symlink is gone, its target is not.
  expect(after).not.toContain("linked-shot@360.png");
  expect(existsSync(target)).toBe(true);
  expect(result.removed.length).toBeGreaterThan(10);
  // A folder that does not exist sweeps nothing.
  expect(sweepStaleFixtureFiles(join(root, "nowhere"))).toEqual({ removed: [], skipped: [] });
});

test("SP9-T3 AC-3: parseViewports reads one to six WxH pairs, names them by width, and refuses anything else naming the rule", () => {
  const rule = "ui.viewports: one to six WxH pairs, integers 200 to 4000, comma-separated";
  expect(parseViewports("360x800,768x1024,1280x800")).toEqual([...DEFAULT_VIEWPORTS]);
  expect(parseViewports("390x844")).toEqual([{ name: "mobile", width: 390, height: 844 }]);
  expect(parseViewports("500x800, 550x800, 1300x800, 1400x900")).toEqual([
    { name: "mobile", width: 500, height: 800 },
    { name: "mobile-550", width: 550, height: 800 },
    { name: "desktop", width: 1300, height: 800 },
    { name: "desktop-1400", width: 1400, height: 900 },
  ]);
  for (const bad of [
    "100x100",
    "abc",
    "360x800,abc",
    "",
    "360",
    "360x800x2",
    "4001x800",
    "360x800,360x800,360x800,360x800,360x800,360x800,360x800",
  ]) {
    expect(parseViewports(bad)).toEqual({ refused: rule });
  }
});

test("SP9-T3 AC-4: listCaptures groups the fixture's and the session's names by page and state with their widths, dark, console, metadata and author; an older inputs.json still reads", () => {
  const root = makeRepo({ "src/App.vue": "<template/>" });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "fix");
  write(root, "src/App.vue", "<template>hi</template>");
  const ui = uiFolder(paths, work.id);
  fixtureCapture(ui, "checkout", "default");
  writeFileSync(join(ui, "checkout-empty@320.png"), "png");
  writeFileSync(join(ui, "checkout-empty@1280.png"), "png");
  writeFileSync(join(ui, "console-checkout-empty.json"), "[]");
  writeFileSync(
    join(ui, "checkout-empty.json"),
    JSON.stringify({ page: "checkout", state: "empty", by: "fixture", viewports: [] }),
  );
  writeFileSync(join(ui, "home-empty.png"), "png");
  writeFileSync(join(ui, "console-home-empty.json"), "[]");
  writeFileSync(join(ui, "cart-error.png"), "png");
  writeFileSync(join(ui, "notes.txt"), "not a capture");
  const captures = listCaptures(paths, work.id);
  expect(captures).toEqual([
    {
      page: "cart",
      state: "error",
      file: "review/ui/cart-error.png",
      files: ["review/ui/cart-error.png"],
      widths: [],
      dark: false,
      console: null,
      meta: null,
      by: "session",
    },
    {
      page: "checkout",
      state: "default",
      file: "review/ui/checkout-default@360.png",
      files: [
        "review/ui/checkout-default@360.png",
        "review/ui/checkout-default@768.png",
        "review/ui/checkout-default@1280.png",
        "review/ui/checkout-default@1280-dark.png",
      ],
      widths: [360, 768, 1280],
      dark: true,
      console: "review/ui/console-checkout-default.json",
      meta: "review/ui/checkout-default.json",
      by: "fixture",
    },
    {
      page: "checkout",
      state: "empty",
      file: "review/ui/checkout-empty@320.png",
      files: ["review/ui/checkout-empty@320.png", "review/ui/checkout-empty@1280.png"],
      widths: [320, 1280],
      dark: false,
      console: "review/ui/console-checkout-empty.json",
      meta: "review/ui/checkout-empty.json",
      by: "fixture",
    },
    {
      page: "home",
      state: "empty",
      file: "review/ui/home-empty.png",
      files: ["review/ui/home-empty.png"],
      widths: [],
      dark: false,
      console: "review/ui/console-home-empty.json",
      meta: null,
      by: "session",
    },
  ]);
  // A page with a dash in its name is read from the metadata; without one the last dash splits.
  writeFileSync(join(ui, "my-page-default@360.png"), "png");
  writeFileSync(
    join(ui, "my-page-default.json"),
    JSON.stringify({ page: "my-page", state: "default", by: "fixture", viewports: [] }),
  );
  writeFileSync(join(ui, "two-words-state.png"), "png");
  const named = listCaptures(paths, work.id);
  expect(named.find((c) => c.meta === "review/ui/my-page-default.json")).toMatchObject({
    page: "my-page",
    state: "default",
  });
  expect(named.find((c) => c.file === "review/ui/two-words-state.png")).toMatchObject({
    page: "two-words",
    state: "state",
  });
  // The inputs file carries the captures, and one of the older shape reads with the fields defaulted.
  writeReviewInputs(paths, work, ["src/App.vue"], "f1");
  expect(readReviewInputs(paths, work.id)?.captures.length).toBe(6);
  const inputs = join(paths.crewDir, "work", work.id, "review", "inputs.json");
  writeFileSync(
    inputs,
    JSON.stringify({
      fingerprint: "f1",
      at: "2026-10-18T10:00:00.000Z",
      captures: [
        { file: "review/ui/home-empty.png", console: "review/ui/console-home-empty.json" },
      ],
    }),
  );
  expect(readReviewInputs(paths, work.id)?.captures).toEqual([
    {
      page: "home",
      state: "empty",
      file: "review/ui/home-empty.png",
      files: ["review/ui/home-empty.png"],
      widths: [],
      dark: false,
      console: "review/ui/console-home-empty.json",
      meta: null,
      by: "session",
    },
  ]);
});

test("SP9-T3 AC-5: screensSummary counts the expected screens captured, the missing and the extra, by author, and capturesLine says it with the viewports and the silent captures", () => {
  const expected = [
    { page: "checkout", state: "empty", criteria: ["AC-2"] },
    { page: "checkout", state: "error", criteria: ["AC-1"] },
  ];
  const captures = [
    {
      page: "checkout",
      state: "error",
      file: "review/ui/checkout-error@360.png",
      files: [
        "review/ui/checkout-error@360.png",
        "review/ui/checkout-error@768.png",
        "review/ui/checkout-error@1280.png",
      ],
      widths: [360, 768, 1280],
      dark: false,
      console: "review/ui/console-checkout-error.json",
      meta: "review/ui/checkout-error.json",
      by: "fixture" as const,
    },
    {
      page: "home",
      state: "default",
      file: "review/ui/home-default.png",
      files: ["review/ui/home-default.png"],
      widths: [],
      dark: false,
      console: null,
      meta: null,
      by: "session" as const,
    },
  ];
  const summary = screensSummary(expected, captures);
  expect(summary).toEqual({
    captures: 2,
    captured: 1,
    expected: 2,
    missing: ["checkout-empty"],
    extra: ["home-default"],
    fixture: 1,
    session: 1,
    viewports: [360, 768, 1280],
  });
  expect(capturesLine(summary, ["home-default.png"])).toBe(
    "captures: 1 of 2 expected (fixture 1, session 1); missing: checkout-empty; extra: home-default; viewports 360, 768, 1280; 1 without a console file: home-default.png",
  );
  // Nothing declared: the line as before.
  const plain = screensSummary([], captures);
  expect(plain.expected).toBe(0);
  expect(capturesLine(plain, ["home-default.png"])).toBe(
    "captures: 2 (1 without a console file: home-default.png)",
  );
  expect(capturesLine(screensSummary([], []), [])).toBe("");
  expect(capturesLine(screensSummary(expected, []), [])).toBe(
    "captures: 0 of 2 expected (fixture 0, session 0); missing: checkout-empty, checkout-error",
  );
});

// SP9 Task 4: the UI evidence graded in the e2e run.

/** A metadata file of the fixture's shape with the given overrides, its console file and its images. */
function seedCapture(
  dir: string,
  page: string,
  state: string,
  overrides: Record<string, unknown> = {},
  options: { axeFile?: boolean; console?: unknown[] } = {},
): void {
  const base = `${page}-${state}`;
  for (const width of [360, 1280]) writeFileSync(join(dir, `${base}@${width}.png`), "png");
  writeFileSync(join(dir, `console-${base}.json`), JSON.stringify(options.console ?? []));
  const axe = {
    status: "not captured",
    reason: "@axe-core/playwright not installed",
    file: null,
    violations: [],
  };
  const body = {
    page,
    state,
    by: "fixture",
    viewports: [360, 1280].map((width) => ({
      name: `v${width}`,
      width,
      height: 800,
      light: `${base}@${width}.png`,
      dark: null,
    })),
    console: `console-${base}.json`,
    aria: null,
    axe,
    vitals: { cls: 0.02, lcpMs: 820, inpMs: null, longTasks: 0 },
    reducedMotion: { status: "clean", running: [] },
    ...overrides,
  };
  const axeBody = body.axe as { file?: string | null; violations?: unknown[] };
  if (options.axeFile !== false && typeof axeBody.file === "string")
    writeFileSync(
      join(dir, axeBody.file),
      JSON.stringify({ violations: axeBody.violations ?? [] }),
    );
  writeFileSync(join(dir, `${base}.json`), JSON.stringify(body));
}

function seedMotion(
  dir: string,
  page: string,
  interaction: string,
  overrides: Record<string, unknown> = {},
  options: { strip?: boolean } = {},
): void {
  const key = `${page}-${interaction}`;
  mkdirSync(join(dir, "motion", key), { recursive: true });
  writeFileSync(join(dir, "motion", key, "00.png"), "png");
  if (options.strip !== false) writeFileSync(join(dir, `${key}.strip.png`), "png");
  writeFileSync(
    join(dir, `${key}.motion.json`),
    JSON.stringify({
      page,
      interaction,
      frames: {
        method: "cdp-screencast",
        dir: `motion/${key}`,
        strip: `${key}.strip.png`,
        count: 1,
        times: [0],
      },
      frameTimes: { samples: 10, meanMs: 16, p95Ms: 17, maxMs: 20, over50ms: 0 },
      animations: [
        {
          target: "aside",
          kind: "CSSTransition",
          name: "transform",
          durationMs: 250,
          delayMs: 0,
          easing: "ease",
          iterations: 1,
          fill: "none",
          properties: ["transform"],
        },
      ],
      reducedMotion: { status: "clean", reason: null, animations: [] },
      ...overrides,
    }),
  );
}

function planFor(screens: { page: string; state: string; criteria: string[] }[]) {
  return {
    id: "w",
    at: "2026-10-26T00:00:00.000Z",
    viewports: [...DEFAULT_VIEWPORTS],
    colorSchemes: ["light" as const],
    darkFrom: "none" as const,
    screens,
  };
}

function graded(
  paths: ReturnType<typeof repoPaths>,
  id: string,
  screens: { page: string; state: string; criteria: string[] }[],
) {
  return gradeUi(paths, id, planFor(screens));
}

test("SP9-T4 AC-7: safeText keeps one line without control characters, capped at 120 characters; safeList caps the ids at five with the count of the rest", () => {
  expect(safeText("color-contrast\naxe: clean (9 captures)")).toBe("color-contrast");
  expect(safeText("a\u0000b\u001fc\u007fd")).toBe("abcd");
  expect(safeText("x".repeat(300))).toBe(`${"x".repeat(119)}…`);
  expect(safeText(42)).toBe("42");
  expect(safeText(null)).toBe("");
  expect(safeText("  padded  ")).toBe("padded");
  expect(safeList(["a", "b", "c", "d", "e", "f"])).toBe("a, b, c, d, e, +1 more");
  expect(safeList(["a", "b"])).toBe("a, b");
});

test("SP9-T4 AC-1: gradeUi names the first offence in order (a declared screen not captured, an unreadable file, reduced motion, axe, CLS) and passes a clean folder", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const declared = [{ page: "checkout", state: "error", criteria: ["AC-2"] }];
  // Nothing captured: the declared screen is the offence.
  expect(graded(paths, work.id, declared).offence).toBe(
    "ui: screen checkout-error declared by AC-2 not captured",
  );
  // Captured: clean.
  seedCapture(ui, "checkout", "error");
  const clean = graded(paths, work.id, declared);
  expect(clean.offence).toBeNull();
  expect(clean.lines).toEqual([
    "axe: not captured (@axe-core/playwright not installed)",
    "vitals: CLS max 0.02 (checkout-error@360), LCP max 820 ms",
    "reduced motion: clean",
    "motion: none",
  ]);
  // An unreadable file comes before the measurements.
  writeFileSync(join(ui, "checkout-default.json"), "{nope");
  writeFileSync(join(ui, "checkout-default@360.png"), "png");
  expect(graded(paths, work.id, declared).offence).toBe("ui: unreadable checkout-default.json");
  expect(
    graded(paths, work.id, [...declared, { page: "inbox", state: "default", criteria: ["AC-3"] }])
      .offence,
  ).toBe("ui: screen inbox-default declared by AC-3 not captured");
  // Reduced motion before axe, axe before CLS.
  const second = createWork(paths, "feature");
  const id2 = second.id;
  const ui2 = uiFolder(paths, id2);
  seedCapture(ui2, "checkout", "error", {
    axe: {
      status: "violations",
      reason: null,
      file: "axe-checkout-error.json",
      violations: [{ id: "color-contrast", impact: "serious", nodes: 2, targets: ["button.pay"] }],
    },
    vitals: { cls: 0.18, lcpMs: 900, inpMs: null, longTasks: 0 },
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
  const three = graded(paths, id2, declared);
  expect(three.offence).toBe(
    "ui: animation still running under reduced motion: div.spinner (checkout-error)",
  );
  expect(three.lines).toEqual([
    "axe: violations: color-contrast on checkout-error",
    "vitals: CLS max 0.18 (checkout-error@360), LCP max 900 ms",
    "ui: animation still running under reduced motion: div.spinner (checkout-error)",
    "motion: none",
  ]);
  seedCapture(ui2, "checkout", "error", {
    axe: {
      status: "violations",
      reason: null,
      file: "axe-checkout-error.json",
      violations: [{ id: "color-contrast", impact: "serious", nodes: 2, targets: ["button.pay"] }],
    },
    vitals: { cls: 0.18, lcpMs: 900, inpMs: null, longTasks: 0 },
  });
  expect(graded(paths, id2, declared).offence).toBe(
    "ui: axe serious color-contrast on checkout-error (2 nodes)",
  );
  seedCapture(ui2, "checkout", "error", {
    vitals: { cls: 0.18, lcpMs: 900, inpMs: null, longTasks: 0 },
  });
  expect(graded(paths, id2, declared).offence).toBe(
    "ui: CLS 0.18 on checkout-error@360 (limit 0.1)",
  );
  // A moderate axe hit, an opacity-only short animation under reduced motion and CLS at the limit pass.
  seedCapture(ui2, "checkout", "error", {
    axe: {
      status: "violations",
      reason: null,
      file: "axe-checkout-error.json",
      violations: [{ id: "region", impact: "moderate", nodes: 1, targets: ["main"] }],
    },
    vitals: { cls: 0.1, lcpMs: 900, inpMs: null, longTasks: 0 },
    reducedMotion: {
      status: "running",
      running: [
        {
          target: "div.toast",
          name: "fade",
          iterations: 1,
          durationMs: 200,
          properties: ["opacity"],
        },
      ],
    },
  });
  const passing = graded(paths, id2, declared);
  expect(passing.offence).toBeNull();
  expect(passing.lines[0]).toBe("axe: violations: region on checkout-error");
  // A motion sample's rerun under reduced motion is judged the same, named by its interaction.
  seedMotion(ui2, "checkout", "open", {
    reducedMotion: {
      status: "running",
      reason: null,
      animations: [
        {
          target: "aside.summary",
          kind: "CSSTransition",
          name: "transform",
          durationMs: 250,
          delayMs: 0,
          easing: "ease",
          iterations: 1,
          fill: "none",
          properties: ["transform"],
        },
      ],
    },
  });
  expect(graded(paths, id2, declared).offence).toBe(
    "ui: animation still running under reduced motion: aside.summary (checkout-open)",
  );
});

test("SP9-T4 AC-10: the measurement lines read not captured for a forged or partial file, count the samples without a strip, and never pass what is not there", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const declared = [{ page: "checkout", state: "default", criteria: ["AC-1"] }];
  // A metadata claiming clean with no axe file: not captured, naming the file.
  seedCapture(
    ui,
    "checkout",
    "default",
    { axe: { status: "clean", reason: null, file: "axe-checkout-default.json", violations: [] } },
    { axeFile: false },
  );
  seedMotion(ui, "checkout", "open", {}, { strip: false });
  const grade = graded(paths, work.id, declared);
  expect(grade.offence).toBeNull();
  expect(grade.lines).toEqual([
    "axe: not captured (axe-checkout-default.json missing)",
    "vitals: CLS max 0.02 (checkout-default@360), LCP max 820 ms",
    "reduced motion: clean",
    "motion: 1 interaction sampled (1 without a strip)",
  ]);
  // The file present: clean, counted.
  seedCapture(ui, "checkout", "default", {
    axe: { status: "clean", reason: null, file: "axe-checkout-default.json", violations: [] },
  });
  seedMotion(ui, "checkout", "open");
  expect(graded(paths, work.id, declared).lines).toEqual([
    "axe: clean (1 capture)",
    "vitals: CLS max 0.02 (checkout-default@360), LCP max 820 ms",
    "reduced motion: clean",
    "motion: 1 interaction sampled",
  ]);
  // All-null vitals (the fixture's failure path) read not captured, never unreadable; a session's bare capture has nothing to read.
  seedCapture(ui, "checkout", "default", {
    vitals: { cls: null, lcpMs: null, inpMs: null, longTasks: null },
    reducedMotion: { status: "not captured", reason: "no page", running: [] },
  });
  seedMotion(ui, "checkout", "open", {
    reducedMotion: { status: "not captured", reason: "no reset given", animations: [] },
  });
  const nulls = graded(paths, work.id, declared);
  expect(nulls.offence).toBeNull();
  expect(nulls.lines[1]).toBe("vitals: not captured");
  expect(nulls.lines[2]).toBe("reduced motion: not captured");
  writeFileSync(join(ui, "home-empty.png"), "png");
  const withSession = graded(paths, work.id, declared);
  expect(withSession.manifest.screens.find((s) => s.page === "home")).toMatchObject({
    page: "home",
    state: "empty",
    declared: false,
    by: "session",
    captured: { light: [], dark: [] },
    console: "not captured",
    axe: "not captured",
    vitals: null,
    reducedMotion: "not captured",
  });
});

test("SP9-T4 AC-9: a file over the cap or of the wrong shape is unreadable and an offence, never a throw and never a pass; only the string Infinity is infinite; a cls that is not a finite number is never below the limit", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const declared = [{ page: "checkout", state: "default", criteria: ["AC-1"] }];
  const cases: [string, unknown][] = [
    ["an array body", []],
    ["running not an array", { reducedMotion: { status: "running", running: "yes" } }],
    ["cls as a string", { vitals: { cls: "0.01", lcpMs: 1, inpMs: null, longTasks: 0 } }],
    ["cls null beside a number", { vitals: { cls: null, lcpMs: 1, inpMs: null, longTasks: 0 } }],
    ["vitals as a string", { vitals: "fast" }],
    ["cls NaN", { vitals: { cls: "NaN", lcpMs: 1, inpMs: null, longTasks: 0 } }],
  ];
  for (const [label, body] of cases) {
    seedCapture(ui, "checkout", "default");
    if (Array.isArray(body)) writeFileSync(join(ui, "checkout-default.json"), "[]");
    else seedCapture(ui, "checkout", "default", body as Record<string, unknown>);
    const grade = graded(paths, work.id, declared);
    expect([label, grade.offence]).toEqual([label, "ui: unreadable checkout-default.json"]);
    expect(grade.manifest.unreadable).toEqual(["checkout-default.json"]);
  }
  // Over the cap.
  seedCapture(ui, "checkout", "default", { padding: "p".repeat(1024 * 1024) });
  expect(graded(paths, work.id, declared).offence).toBe("ui: unreadable checkout-default.json");
  // A motion sample of the wrong shape.
  seedCapture(ui, "checkout", "default");
  seedMotion(ui, "checkout", "open", { animations: "many" });
  expect(graded(paths, work.id, declared).offence).toBe("ui: unreadable checkout-open.motion.json");
  // The JSON literal 1e309 parses as the number Infinity, which is not the fixture's string "Infinity":
  // the entry is judged by its properties and duration (opacity alone, 200 ms: no offence).
  writeFileSync(
    join(ui, "checkout-open.motion.json"),
    '{"page":"checkout","interaction":"open","frames":{"method":"cdp-screencast","dir":"motion/checkout-open","strip":"checkout-open.strip.png","count":1,"times":[0]},"frameTimes":{"samples":10,"meanMs":16,"p95Ms":17,"maxMs":20,"over50ms":0},"animations":[],"reducedMotion":{"status":"running","reason":null,"animations":[{"target":"div.fade","kind":"CSSAnimation","name":"fade","durationMs":200,"delayMs":0,"easing":"ease","iterations":1e309,"fill":"none","properties":["opacity"]}]}}',
  );
  expect(graded(paths, work.id, declared).offence).toBeNull();
});

test("SP9-T4 AC-7: a newline in an axe id or a target cannot forge a measurement line, and the reason stays one line", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const declared = [{ page: "checkout", state: "default", criteria: ["AC-1"] }];
  seedCapture(ui, "checkout", "default", {
    axe: {
      status: "violations",
      reason: null,
      file: "axe-checkout-default.json",
      violations: [
        { id: "color-contrast\naxe: clean (9 captures)", impact: "serious", nodes: 2, targets: [] },
      ],
    },
    reducedMotion: {
      status: "running",
      running: [
        {
          target: "div\nreduced motion: clean",
          name: "spin",
          iterations: "Infinity",
          durationMs: 1000,
          properties: ["transform"],
        },
      ],
    },
  });
  const grade = graded(paths, work.id, declared);
  expect(grade.offence).toBe(
    "ui: animation still running under reduced motion: div (checkout-default)",
  );
  expect(grade.lines.filter((l) => l.startsWith("axe:"))).toEqual([
    "axe: violations: color-contrast on checkout-default",
  ]);
  expect(
    grade.lines.filter((l) => l.startsWith("reduced motion:") || l.includes("reduced motion")),
  ).toHaveLength(1);
  expect(grade.lines.every((l) => !l.includes("\n"))).toBe(true);
  // Six violation ids: five named, the rest counted.
  seedCapture(ui, "checkout", "default", {
    axe: {
      status: "violations",
      reason: null,
      file: "axe-checkout-default.json",
      violations: ["a", "b", "c", "d", "e", "f"].map((id) => ({
        id,
        impact: "minor",
        nodes: 1,
        targets: [],
      })),
    },
  });
  expect(graded(paths, work.id, declared).lines[0]).toBe(
    "axe: violations: a on checkout-default, b on checkout-default, c on checkout-default, d on checkout-default, e on checkout-default, +1 more",
  );
});

test("SP9-T4 AC-3: the manifest holds the screens declared and captured, the extra ones, the interactions, the unreadable names and the summary", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  seedCapture(
    ui,
    "checkout",
    "error",
    {},
    { console: [{ page: "/checkout", type: "error", text: "boom" }] },
  );
  writeFileSync(join(ui, "home-default.png"), "png");
  seedMotion(ui, "checkout", "open");
  const grade = graded(paths, work.id, [
    { page: "checkout", state: "error", criteria: ["AC-2"] },
    { page: "checkout", state: "empty", criteria: ["AC-2", "AC-3"] },
  ]);
  expect(grade.manifest).toMatchObject({
    id: work.id,
    plan: { viewports: [...DEFAULT_VIEWPORTS], colorSchemes: ["light"] },
    screens: [
      {
        page: "checkout",
        state: "empty",
        criteria: ["AC-2", "AC-3"],
        declared: true,
        by: null,
        captured: null,
        console: "not captured",
        axe: "not captured",
        vitals: null,
        reducedMotion: "not captured",
      },
      {
        page: "checkout",
        state: "error",
        criteria: ["AC-2"],
        declared: true,
        by: "fixture",
        captured: { light: [360, 1280], dark: [] },
        console: "error",
        axe: "not captured",
        vitals: { cls: 0.02, lcpMs: 820, inpMs: null },
        reducedMotion: "clean",
      },
      { page: "home", state: "default", criteria: [], declared: false, by: "session" },
    ],
    interactions: [
      {
        page: "checkout",
        interaction: "open",
        strip: true,
        animations: 1,
        over50ms: 0,
        reducedMotion: "clean",
      },
    ],
    unreadable: [],
    summary: {
      captures: 2,
      captured: 1,
      expected: 2,
      missing: ["checkout-empty"],
      extra: ["home-default"],
      offence: "ui: screen checkout-empty declared by AC-2, AC-3 not captured",
    },
  });
  expect(typeof grade.manifest.at).toBe("string");
  expect(grade.artifacts).toEqual({
    manifest: "review/ui-evidence.json",
    captures: 2,
    expected: 2,
    missing: ["checkout-empty"],
    axe: "not captured",
    reducedMotion: "clean",
    motion: 1,
  });
  // Nothing declared and nothing captured: no artifact.
  const bare = createWork(paths, "feature");
  expect(graded(paths, bare.id, []).artifacts).toBeNull();
});

test("SP9-T4 AC-5: the sweep skips a symlinked motion folder whole, names what it would have removed and follows nothing", () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const outside = tempDir();
  mkdirSync(join(outside, "checkout-open"), { recursive: true });
  writeFileSync(join(outside, "checkout-open", "00.png"), "png");
  symlinkSync(outside, join(ui, "motion"));
  writeFileSync(join(ui, "checkout-open.strip.png"), "png");
  writeFileSync(
    join(ui, "checkout-open.motion.json"),
    JSON.stringify({
      page: "checkout",
      interaction: "open",
      frames: { dir: "motion/checkout-open", strip: "checkout-open.strip.png", count: 1 },
    }),
  );
  const result = sweepStaleFixtureFiles(ui);
  expect(result.skipped).toEqual(["motion/checkout-open"]);
  expect(existsSync(join(outside, "checkout-open", "00.png"))).toBe(true);
  expect(readdirSync(ui)).toContain("motion");
  expect(existsSync(join(ui, "checkout-open.strip.png"))).toBe(false);
});

test("SP9-T4 AC-1 (the order, paired): an unreadable file comes before a running animation, an axe violation and a CLS offence of another capture", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const declared = [
    { page: "checkout", state: "default", criteria: ["AC-1"] },
    { page: "checkout", state: "error", criteria: ["AC-1"] },
  ];
  seedCapture(ui, "checkout", "error", {
    axe: {
      status: "violations",
      reason: null,
      file: "axe-checkout-error.json",
      violations: [{ id: "color-contrast", impact: "serious", nodes: 2, targets: [] }],
    },
    vitals: { cls: 0.18, lcpMs: 900, inpMs: null, longTasks: 0 },
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
  seedCapture(ui, "checkout", "default");
  writeFileSync(join(ui, "checkout-default.json"), "{nope");
  const grade = graded(paths, work.id, declared);
  expect(grade.offence).toBe("ui: unreadable checkout-default.json");
  expect(grade.lines[2]).toBe(
    "ui: animation still running under reduced motion: div.spinner (checkout-error)",
  );
});

test("SP9-T4 AC-3 (declared only, captured only): the artifact and the lines appear when a screen is declared with no capture, and when a capture exists with nothing declared", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const declaredOnly = createWork(paths, "feature");
  uiFolder(paths, declaredOnly.id);
  const first = graded(paths, declaredOnly.id, [
    { page: "checkout", state: "error", criteria: ["AC-1"] },
  ]);
  expect(first.artifacts).toEqual({
    manifest: "review/ui-evidence.json",
    captures: 0,
    expected: 1,
    missing: ["checkout-error"],
    axe: "not captured",
    reducedMotion: "not captured",
    motion: 0,
  });
  expect(first.lines).toEqual([
    "axe: not captured (no capture)",
    "vitals: not captured",
    "reduced motion: not captured",
    "motion: none",
  ]);
  const capturedOnly = createWork(paths, "feature");
  const ui = uiFolder(paths, capturedOnly.id);
  seedCapture(ui, "home", "default");
  const second = graded(paths, capturedOnly.id, []);
  expect(second.artifacts).toMatchObject({
    captures: 1,
    expected: 0,
    missing: [],
    reducedMotion: "clean",
  });
  expect(second.lines).toHaveLength(4);
  expect(second.offence).toBeNull();
});

test("SP9-T4 AC-9 (the axe file): a metadata claiming clean or violations with an axe file of the wrong shape or over the cap reads unreadable and is an offence", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const declared = [{ page: "checkout", state: "default", criteria: ["AC-1"] }];
  seedCapture(ui, "checkout", "default", {
    axe: { status: "clean", reason: null, file: "axe-checkout-default.json", violations: [] },
  });
  writeFileSync(join(ui, "axe-checkout-default.json"), "{}");
  const wrong = graded(paths, work.id, declared);
  expect(wrong.offence).toBe("ui: unreadable axe-checkout-default.json");
  expect(wrong.lines[0]).toBe("axe: not captured (axe-checkout-default.json unreadable)");
  writeFileSync(
    join(ui, "axe-checkout-default.json"),
    `{"violations":[],"padding":"${"p".repeat(1024 * 1024)}"}`,
  );
  expect(graded(paths, work.id, declared).offence).toBe("ui: unreadable axe-checkout-default.json");
  // The file is the record: a metadata that claims clean over a file holding a serious violation is graded by the file.
  writeFileSync(
    join(ui, "axe-checkout-default.json"),
    JSON.stringify({
      violations: [{ id: "label", impact: "critical", nodes: [{ target: ["input#email"] }] }],
    }),
  );
  expect(graded(paths, work.id, declared).offence).toBe(
    "ui: axe critical label on checkout-default (0 nodes)",
  );
});

test("SP9-T4 AC-9 (planted links): a symlinked axe file or metadata is unreadable and never followed by the grade, the capture list or the sweep", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  const outside = tempDir();
  const declared = [{ page: "checkout", state: "default", criteria: ["AC-1"] }];
  seedCapture(ui, "checkout", "default", {
    axe: { status: "clean", reason: null, file: "axe-checkout-default.json", violations: [] },
  });
  // The seeded axe file replaced by a link to a well-formed one outside the folder: the link is what
  // is there, not its target.
  writeFileSync(join(outside, "axe.json"), JSON.stringify({ violations: [] }));
  unlinkSync(join(ui, "axe-checkout-default.json"));
  symlinkSync(join(outside, "axe.json"), join(ui, "axe-checkout-default.json"));
  expect(graded(paths, work.id, declared).offence).toBe("ui: unreadable axe-checkout-default.json");
  // The metadata itself as a link to a well-formed one naming another page: unreadable to the grade,
  // no metadata to the capture list (the name splits), nothing for the sweep to act on.
  const linked = JSON.parse(readFileSync(join(ui, "checkout-default.json"), "utf8"));
  writeFileSync(
    join(outside, "meta.json"),
    JSON.stringify({ ...linked, page: "other", state: "thing", axe: { status: "not captured" } }),
  );
  unlinkSync(join(ui, "checkout-default.json"));
  symlinkSync(join(outside, "meta.json"), join(ui, "checkout-default.json"));
  expect(graded(paths, work.id, declared).offence).toBe("ui: unreadable checkout-default.json");
  const captures = listCaptures(paths, work.id);
  expect(captures.map((c) => `${c.page}/${c.state}/${c.by}`)).toEqual(["checkout/default/session"]);
  const swept = sweepStaleFixtureFiles(ui);
  expect(swept.removed).toEqual([]);
  expect(existsSync(join(ui, "checkout-default@360.png"))).toBe(true);
  expect(readFileSync(join(outside, "meta.json"), "utf8")).toContain('"other"');
});

test("SP9-T4 AC-4 (the manifest read back): readUiEvidence returns the manifest the engine wrote and null for one over the cap or of the wrong shape", async () => {
  const { readUiEvidence, writeUiEvidence, uiEvidencePath } = await import("../src/ui.ts");
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ui = uiFolder(paths, work.id);
  seedCapture(ui, "checkout", "default");
  const grade = graded(paths, work.id, [
    { page: "checkout", state: "default", criteria: ["AC-1"] },
  ]);
  writeUiEvidence(paths, work.id, grade.manifest);
  expect(readUiEvidence(paths, work.id)).toEqual(grade.manifest);
  writeFileSync(
    uiEvidencePath(paths, work.id),
    JSON.stringify({ ...grade.manifest, screens: [{ page: "x" }] }),
  );
  expect(readUiEvidence(paths, work.id)).toBeNull();
  writeFileSync(
    uiEvidencePath(paths, work.id),
    JSON.stringify({ ...grade.manifest, summary: { missing: "none" } }),
  );
  expect(readUiEvidence(paths, work.id)).toBeNull();
  // Every list and every row is checked, not the containers alone.
  const first = grade.manifest.screens[0];
  if (!first) throw new Error("no screen row");
  for (const broken of [
    { unreadable: ["x", 1] },
    { interactions: [{ page: "x" }] },
    { screens: [{ ...first, captured: { light: ["360"], dark: [] } }] },
    { summary: { ...grade.manifest.summary, extra: [null] } },
  ]) {
    writeFileSync(uiEvidencePath(paths, work.id), JSON.stringify({ ...grade.manifest, ...broken }));
    expect(readUiEvidence(paths, work.id)).toBeNull();
  }
  writeFileSync(
    uiEvidencePath(paths, work.id),
    `${JSON.stringify(grade.manifest).slice(0, -1)},"padding":"${"p".repeat(1024 * 1024)}"}`,
  );
  expect(readUiEvidence(paths, work.id)).toBeNull();
  writeFileSync(uiEvidencePath(paths, work.id), "{nope");
  expect(readUiEvidence(paths, work.id)).toBeNull();
  // SP9-T7 AC-6: the audit's field reads back; a pages list that is not strings refuses the manifest.
  const audited = {
    ...grade.manifest,
    audit: { status: "captured", reason: null, pages: ["http://localhost:3000/"] },
  };
  writeFileSync(uiEvidencePath(paths, work.id), JSON.stringify(audited));
  expect(readUiEvidence(paths, work.id)?.audit).toEqual({
    status: "captured",
    reason: null,
    pages: ["http://localhost:3000/"],
  });
  writeFileSync(
    uiEvidencePath(paths, work.id),
    JSON.stringify({ ...grade.manifest, audit: { status: "captured", reason: null, pages: [1] } }),
  );
  expect(readUiEvidence(paths, work.id)).toBeNull();
  writeFileSync(
    uiEvidencePath(paths, work.id),
    JSON.stringify({ ...grade.manifest, audit: { status: 1, reason: null, pages: [] } }),
  );
  expect(readUiEvidence(paths, work.id)).toBeNull();
});

test("2026-10-29-001 AC-7: gradeUi fails on a horizontal overflow, a broken image or text hidden under reduced motion, in that order after reduced motion and axe and before CLS; fonts not loaded are an advisory line; a capture without the fields reads not captured", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const declared = [{ page: "checkout", state: "error", criteria: ["AC-2"] }];
  const viewports = (overflowPx: number) =>
    [360, 1280].map((width) => ({
      name: `v${width}`,
      width,
      height: 800,
      light: `checkout-error@${width}.png`,
      dark: null,
      overflow:
        width === 360 && overflowPx
          ? { overflowPx, offenders: [{ target: "div.row", right: 400 }] }
          : { overflowPx: 0, offenders: [] },
    }));
  const seeded = (overrides: Record<string, unknown>) => {
    const work = createWork(paths, "feature");
    seedCapture(uiFolder(paths, work.id), "checkout", "error", overrides);
    return graded(paths, work.id, declared);
  };
  const all = {
    axe: {
      status: "violations",
      reason: null,
      file: "axe-checkout-error.json",
      violations: [{ id: "color-contrast", impact: "serious", nodes: 2, targets: ["button.pay"] }],
    },
    vitals: { cls: 0.18, lcpMs: 900, inpMs: null, longTasks: 0 },
    viewports: viewports(40),
    images: ["https://cdn.example/a.png"],
    fonts: ["Brand Sans"],
    reducedMotion: {
      status: "clean",
      running: [],
      hidden: [{ target: "p.lead", text: "Your order" }],
    },
  };
  expect(seeded(all).offence).toBe("ui: axe serious color-contrast on checkout-error (2 nodes)");
  const noAxe = {
    ...all,
    axe: { status: "not captured", reason: "x", file: null, violations: [] },
  };
  expect(seeded(noAxe).offence).toBe(
    "ui: horizontal overflow 40px on checkout-error@360 (div.row)",
  );
  const noOverflow = { ...noAxe, viewports: viewports(0) };
  expect(seeded(noOverflow).offence).toBe(
    "ui: broken image https://cdn.example/a.png on checkout-error",
  );
  const noImage = { ...noOverflow, images: [] };
  expect(seeded(noImage).offence).toBe(
    "ui: text hidden under reduced motion: p.lead (checkout-error)",
  );
  const noHidden = { ...noImage, reducedMotion: { status: "clean", running: [], hidden: [] } };
  const cls = seeded(noHidden);
  expect(cls.offence).toBe("ui: CLS 0.18 on checkout-error@360 (limit 0.1)");
  // Fonts not loaded: an advisory line, never an offence.
  const fontsOnly = seeded({
    ...noHidden,
    vitals: { cls: 0.02, lcpMs: 820, inpMs: null, longTasks: 0 },
  });
  expect(fontsOnly.offence).toBeNull();
  expect(fontsOnly.lines).toContain("ui: fonts not loaded on checkout-error: Brand Sans");
  expect(fontsOnly.manifest.screens[0]?.measures).toEqual({
    overflow: "clean",
    images: "clean",
    fonts: "not loaded",
    hiddenText: "clean",
  });
  // A capture written before this item: no field, so not captured, never clean.
  const old = seeded({});
  expect(old.offence).toBeNull();
  expect(old.manifest.screens[0]?.measures).toEqual({
    overflow: "not captured",
    images: "not captured",
    fonts: "not captured",
    hiddenText: "not captured",
  });
  expect(old.lines.some((l) => l.startsWith("ui: fonts"))).toBe(false);
});

test("2026-10-29-001 AC-8: extreme app measures in a capture leave the offence and the lines unchanged: nothing grades them", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const declared = [{ page: "checkout", state: "error", criteria: ["AC-2"] }];
  const plain = createWork(paths, "feature");
  seedCapture(uiFolder(paths, plain.id), "checkout", "error");
  const extreme = createWork(paths, "feature");
  seedCapture(uiFolder(paths, extreme.id), "checkout", "error", {
    app: {
      width: 360,
      numericCells: 40,
      rightAlignedShare: 0,
      tabularShare: 0,
      chartHues: [12],
      sidebarShare: 0.9,
    },
  });
  const a = graded(paths, plain.id, declared);
  const b = graded(paths, extreme.id, declared);
  expect(b.offence).toBe(a.offence);
  expect(b.lines).toEqual(a.lines);
});

test("2026-10-29-001 AC-7 (the round-1 rulings): the page's strings in the UI lines are quoted through one rule (no bidi, no zero-width), and the manifest carries the app measures beside the statuses, checked when read back", async () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const declared = [{ page: "checkout", state: "error", criteria: ["AC-2"] }];
  const work = createWork(paths, "feature");
  const app = {
    width: 360,
    numericCells: 4,
    rightAlignedShare: 0.5,
    tabularShare: 0.25,
    chartHues: [3],
    sidebarShare: 0,
  };
  seedCapture(uiFolder(paths, work.id), "checkout", "error", {
    images: ["https://cdn.example/‮a.png​"],
    app,
  });
  const out = graded(paths, work.id, declared);
  expect(out.offence).toBe("ui: broken image https://cdn.example/a.png on checkout-error");
  expect(out.manifest.screens[0]?.measures?.app).toEqual(app);
  // Read back, a screen whose measures are malformed makes the manifest unreadable.
  const { readUiEvidence, writeUiEvidence } = await import("../src/ui.ts");
  writeUiEvidence(paths, work.id, out.manifest);
  expect(readUiEvidence(paths, work.id)?.screens[0]?.measures?.app).toEqual(app);
  const bad = structuredClone(out.manifest);
  (bad.screens[0] as { measures: unknown }).measures = {
    ...out.manifest.screens[0]?.measures,
    app: { ...app, width: "wide" },
  };
  writeUiEvidence(paths, work.id, bad);
  expect(readUiEvidence(paths, work.id)).toBeNull();
});
