// What fills a site's eight moving elements (item 2026-11-18-003): the site standard's rows on the
// order, the purpose and the keyboard, the build skill's pointer and the ledger's rows.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const STANDARD = "plugins/core/skills/crew/references/frontend-site.md";
const BUILD = "plugins/core/skills/wizardingcode-design-build/SKILL.md";

/** The rows of the table "Motion on a site", each as its name, its value and its reason. */
function motionRows(): Map<string, { value: string; why: string }> {
  const text = repoFile(STANDARD);
  const start = text.indexOf("## Motion on a site");
  if (start < 0) return new Map();
  const next = text.indexOf("\n## ", start + 1);
  const table = text.slice(start, next < 0 ? text.length : next);
  const rows = new Map<string, { value: string; why: string }>();
  for (const line of table.split("\n")) {
    if (!line.startsWith("| ") || line.startsWith("| :-")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
    rows.set(cells[0] ?? "", { value: cells[1] ?? "", why: cells[2] ?? "" });
  }
  return rows;
}

/** True when every phrase stands in the text, each after the one before it. */
function inOrder(text: string, phrases: string[]): boolean {
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    if (at < 0) return false;
    from = at + phrase.length;
  }
  return true;
}

test("floor AC-7: the standard says what fills the eight, in order, and whose the order is", () => {
  const rows = motionRows();
  const row = rows.get("What fills the eight");
  expect(row).toBeDefined();
  expect(
    inOrder(row?.value ?? "", [
      "feedback on every control",
      "opens from the control that opened it",
      "the one signature move",
      "one entrance for the first screen",
      "the moves the thesis names",
    ]),
  ).toBe(true);
  expect(row?.value).toContain("in this order, each kind before the next");
  expect(row?.value).toContain("A second reveal of a shape the page has already used adds nothing");
  expect(row?.why).toContain("the order is the crew's own");
  expect(row?.why).toContain("a reveal on every section");
  const floor = rows.get("Moving elements");
  expect(floor?.value).toContain("at least eight");
  expect(floor?.value).toContain("What fills the eight");
});

test("floor AC-8: a move names one of five purposes or is not built, with the two that may name none", () => {
  const value = motionRows().get("Purpose")?.value ?? "";
  for (const phrase of [
    "where a thing came from or went",
    "a change of state",
    "the person's action",
    "to explain",
    "from jarring",
    "A move with none is not built",
    "a rare, first-time moment",
    "the crew's own allowance",
  ])
    expect(value).toContain(phrase);
});

test("floor AC-9: an action started from the keyboard does not animate, case by case", () => {
  const value = motionRows().get("From the keyboard")?.value ?? "";
  for (const phrase of [
    "a shortcut",
    "a palette",
    "a jump of focus",
    "with the arrows",
    "none animates",
  ])
    expect(value).toContain(phrase);
});

test("floor AC-10: the build skill's motion step sends a session to the standard's order", () => {
  const step = repoFile(BUILD)
    .split("\n")
    .find((line) => line.startsWith("7. "));
  expect(
    inOrder(step ?? "", [
      "At least eight elements really move",
      "in the order the standard gives",
      "a reveal repeated on every section is not among them",
    ]),
  ).toBe(true);
});

test("floor AC-11: the ledger holds the four rows, each read at the commit it names, with what is the crew's own said", () => {
  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    rows: Record<string, string | undefined>[];
  };
  const rows = ledger.rows.filter(
    (row) => row.source === "emilkowalski" && row.proof === "motion-floor.test.ts",
  );
  expect(rows.length).toBe(4);
  for (const row of rows) {
    expect(row.status).toBe("in");
    expect(repoFile(row.file ?? "")).toContain(row.text ?? "\u0000");
    expect((row.text ?? "").length).toBeGreaterThan(10);
    expect(row.note).toContain("64eb3de");
  }
  const noteOf = (rule: string): string =>
    rows.find((row) => (row.rule ?? "").startsWith(rule))?.note ?? "";
  for (const rule of ["what fills the eight", "a repeated reveal", "a move names its purpose"])
    expect(noteOf(rule)).toContain("the crew's own");
  expect(noteOf("no animation on an action started from the keyboard")).not.toContain(
    "the crew's own",
  );
  expect(noteOf("no animation on an action started from the keyboard")).toContain("64eb3de");
});
