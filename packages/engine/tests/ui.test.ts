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
  parseScreens,
  parseViewports,
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
