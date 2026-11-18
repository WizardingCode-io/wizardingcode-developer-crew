// The pair of a reference and its capture (item 2026-11-18-006), the rows that need no browser: what
// the skills say of the helper, the ledger's row, and that the engine reads an evidence folder the
// same with a pair file and the record in it.
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
import { recordSurface } from "../src/design.ts";
import { gradeDesign } from "../src/design-grade.ts";
import { listCaptures } from "../src/judgement.ts";
import { DEFAULT_VIEWPORTS, gradeUi, sweepStaleFixtureFiles } from "../src/ui.ts";
import { createWork } from "../src/work.ts";
import { makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const skill = (name: string): string => repoFile(`plugins/core/skills/${name}/SKILL.md`);
const FIXTURE = "plugins/core/e2e/playwright.mjs";

/** A numbered step of a skill, found by its number and bold title, whole: to the next step or heading. */
function step(text: string, number: number, title: string): string {
  const start = text.indexOf(`\n${number}. **${title}`);
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const end = rest.slice(1).search(/^(\d+\. \*\*|## )/m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

test("pairs AC-20: the skills call the helper and hand its record to the reviewer, the pairs stay out of commits, and the ledger has the row", () => {
  const capture = step(skill("wizardingcode-design-build"), 8, "Capture");
  const captures = capture.indexOf("has its `capture()`");
  expect(captures).toBeGreaterThanOrEqual(0);
  expect(capture.indexOf("`pairShots(page)` once")).toBeGreaterThan(captures);
  expect(capture).toContain("`narrow: true` where a row's Width is 320");

  const review = skill("wizardingcode-design-review");
  const launch = step(review, 2, "Launch `review-ui-ux`");
  expect(launch).toContain("`review/ui/shots.json`");
  expect(launch).toContain("a row with no pair is said with its reason");
  expect(step(review, 6, "Stop.")).toContain("after the gaps of its kind");

  const keeping = step(skill("wizardingcode-design-brief"), 9, "Ask for references")
    .split("\n")
    .find((line) => line.trimStart().startsWith("- Keeping them in:"));
  expect(keeping).toBeDefined();
  for (const phrase of [
    "`*.pair.png`",
    "`shots.json`",
    "before the first gate run that writes them",
  ])
    expect(keeping).toContain(phrase);

  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    rows: Record<string, string | undefined>[];
  };
  const rows = ledger.rows.filter(
    (row) => row.source === "cook" && row.proof === "e2e-pairs.test.ts",
  );
  expect(rows.length).toBe(1);
  expect(rows[0]?.status).toBe("in");
  expect(rows[0]?.file).toBe(FIXTURE);
  expect((rows[0]?.text ?? "").length).toBeGreaterThan(10);
  expect(repoFile(FIXTURE)).toContain(rows[0]?.text ?? "\u0000");
  expect(rows[0]?.note).toContain("neither run nor copied");
  expect(rows[0]?.note).toContain("the crew's own");
});

/** An item with one fixture capture in its evidence folder, with or without a pair file and the record beside it. */
function evidence(withPairs: boolean) {
  const root = makeRepo({ "package.json": '{"name":"t"}\n', "src/App.vue": "<template/>" });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "a site");
  recordSurface(paths, work.id, "persuade", "world", "2026-11-18");
  const ui = join(paths.crewDir, "work", work.id, "review", "ui");
  mkdirSync(ui, { recursive: true });
  const viewports = [360, 1280].map((width) => {
    const light = `home-default@${width}.png`;
    writeFileSync(join(ui, light), "png");
    return { name: `v${width}`, width, height: 800, light, dark: null };
  });
  writeFileSync(join(ui, "console-home-default.json"), "[]");
  writeFileSync(
    join(ui, "home-default.json"),
    JSON.stringify({
      page: "home",
      state: "default",
      url: "http://127.0.0.1:4173/",
      at: "2026-11-18T00:00:00.000Z",
      by: "fixture",
      viewports,
      console: "console-home-default.json",
      aria: null,
    }),
  );
  if (withPairs) {
    writeFileSync(join(ui, "home-default@1280.pair.png"), "a pair");
    writeFileSync(
      join(ui, "shots.json"),
      JSON.stringify({ by: "fixture", at: "2026-11-18T00:00:00.000Z", reason: null, pairs: [] }),
    );
  }
  return { paths, work, ui };
}

/** A result as text, with the item's id and the times of the run taken out: two items made a moment apart differ in both. */
const withoutPaths = (value: unknown, id: string): string =>
  JSON.stringify(value)
    .split(id)
    .join("<id>")
    .replace(/"at":"[^"]*"/g, '"at":"<at>"');

test("pairs AC-21: the engine reads an evidence folder the same with a pair file and the record in it, and its sweep leaves both", () => {
  const plain = evidence(false);
  const paired = evidence(true);
  const plan = (id: string) => ({
    id,
    at: "2026-11-18T00:00:00.000Z",
    viewports: [...DEFAULT_VIEWPORTS],
    colorSchemes: ["light" as const],
    darkFrom: "none" as const,
    screens: [{ page: "home", state: "default", criteria: ["AC-1"] }],
  });
  expect(withoutPaths(listCaptures(paired.paths, paired.work.id), paired.work.id)).toBe(
    withoutPaths(listCaptures(plain.paths, plain.work.id), plain.work.id),
  );
  expect(listCaptures(paired.paths, paired.work.id).length).toBe(1);
  expect(
    withoutPaths(gradeUi(paired.paths, paired.work.id, plan(paired.work.id)), paired.work.id),
  ).toBe(withoutPaths(gradeUi(plain.paths, plain.work.id, plan(plain.work.id)), plain.work.id));
  expect(withoutPaths(gradeDesign(paired.paths, paired.work), paired.work.id)).toBe(
    withoutPaths(gradeDesign(plain.paths, plain.work), plain.work.id),
  );
  const swept = sweepStaleFixtureFiles(paired.ui);
  expect(swept.removed).not.toContain("shots.json");
  expect(swept.removed).not.toContain("home-default@1280.pair.png");
  expect(existsSync(join(paired.ui, "shots.json"))).toBe(true);
  expect(existsSync(join(paired.ui, "home-default@1280.pair.png"))).toBe(true);
  expect(existsSync(join(paired.ui, "home-default.json"))).toBe(false);
});

const MODULE = new URL("../../../plugins/core/e2e/playwright.mjs", import.meta.url).href;
const HEADER = "| Shot | Ref | Whose and from where | Shows | Take from it | Leave | Width |";
const shotRow = (shot: string, ref: string, width: string | number): string =>
  `| ${shot} | ${ref} | the client's | a screen | the proportions | the colours | ${width} |`;

test("pairs AC-16, AC-17, AC-18, AC-19 without a browser: the helper's bounds on files hold with a page it must never touch", async () => {
  const { pairShots } = (await import(MODULE)) as {
    pairShots: (
      page: unknown,
    ) => Promise<{ reason?: string | null; pairs: { reason: string | null }[] } | null>;
  };
  // A page whose every use throws: a row that needs no composing must never reach it.
  const untouched = new Proxy(
    {},
    {
      get(_target, key) {
        throw new Error(`the page was touched: ${String(key)}`);
      },
    },
  );
  const root = tempDir();
  const folder = join(root, "work", "item");
  const ui = join(folder, "review", "ui");
  const refs = join(folder, "design", "refs");
  mkdirSync(ui, { recursive: true });
  mkdirSync(refs, { recursive: true });
  const list = join(folder, "design", "shots.md");
  const names = ["WIZARDINGCODE_CREW_UI_DIR", "WIZARDINGCODE_CREW_E2E_DIR"] as const;
  const previous = names.map((name) => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    writeFileSync(list, `${HEADER}\n${shotRow("home-default", "home.png", 1280)}\n`);
    expect(await pairShots(untouched)).toBeNull();
    expect(readdirSync(ui)).toEqual([]);

    process.env.WIZARDINGCODE_CREW_UI_DIR = ui;
    writeFileSync(join(ui, "old-default@1280.pair.png"), "an earlier pair");
    writeFileSync(join(ui, "shots.json"), "an earlier record");
    writeFileSync(join(ui, "home-default@1280.png"), "a capture");
    writeFileSync(join(ui, "notes.txt"), "a person's");
    writeFileSync(join(refs, "huge.png"), Buffer.alloc(20 * 1024 * 1024 + 1));
    writeFileSync(join(root, "outside.png"), "outside");
    symlinkSync(join(root, "outside.png"), join(refs, "linked.png"));
    const rows: [string, string, string | number, string][] = [
      ["Home Page", "home.png", 1280, "shot name"],
      ["home-default", "home.png", "wide", "width"],
      ["home-default", "../outside.png", 1280, "ref name"],
      ["home-default", "absent.png", 1280, "reference missing"],
      ["home-default", "linked.png", 1280, "reference not a regular file"],
      ["home-default", "huge.png", 1280, "reference too large"],
      ["other-default", "huge.png", 1280, "reference too large"],
    ];
    writeFileSync(list, `${HEADER}\n${rows.map(([s, r, w]) => shotRow(s, r, w)).join("\n")}\n`);
    const record = await pairShots(untouched);
    expect(record?.reason).toBeNull();
    expect(record?.pairs.map((entry) => entry.reason)).toEqual(rows.map((row) => row[3]));
    expect(readdirSync(ui).sort()).toEqual(["home-default@1280.png", "notes.txt", "shots.json"]);
    expect(JSON.parse(readFileSync(join(ui, "shots.json"), "utf8"))).toEqual(record);

    writeFileSync(list, "no table here\n");
    expect((await pairShots(untouched))?.reason).toBe("no table");
    writeFileSync(list, `${HEADER}\n${"x".repeat(256 * 1024)}\n`);
    expect((await pairShots(untouched))?.reason).toBe("shot list not readable");

    // A task's own evidence folder is no item's: no shot list is found from it, and nothing is written.
    const task = join(folder, "review", "task-1", "ui");
    mkdirSync(task, { recursive: true });
    process.env.WIZARDINGCODE_CREW_UI_DIR = task;
    expect(await pairShots(untouched)).toEqual({ pairs: [] });
    expect(readdirSync(task)).toEqual([]);
  } finally {
    for (const [i, name] of names.entries()) {
      const value = previous[i];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
