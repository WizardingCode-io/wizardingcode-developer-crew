// The advisories of items 2026-11-18-003 and 2026-11-18-004, closed (item 2026-11-18-005): the brief's
// order of steps, a shot's name, the review's round, the rubric's three lines, the motion table's rows
// and the keyboard's ledger row, with the clauses those items left held by no test.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const skill = (name: string): string => repoFile(`plugins/core/skills/${name}/SKILL.md`);
const SCORE_LINE =
  "score: <n> · caps: <none or a comma list> · disposition: <recapture|rebuild|fix|ship>";

/** A numbered step of a skill, found by its number and bold title, whole: to the next step or heading. */
function step(text: string, number: number, title: string): string {
  const start = text.indexOf(`\n${number}. **${title}`);
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const end = rest.slice(1).search(/^(\d+\. \*\*|## )/m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

/** The text of a `##` section, from its heading to the next heading of that level or the file's end. */
function section(text: string, title: string): string {
  const start = text.indexOf(`## ${title}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + title.length + 4);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

/** The rows of the table "Motion on a site", each as its name, its value and its reason. */
function motionRows(): Map<string, { value: string; why: string }> {
  const table = section(
    repoFile("plugins/core/skills/crew/references/frontend-site.md"),
    "Motion on a site",
  );
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

const briefStep = (number: number, title: string): string =>
  step(skill("wizardingcode-design-brief"), number, title);

test("advisories AC-9: a file offered as a reference is not opened before its origin is asked", () => {
  expect(briefStep(8, "Check what was supplied")).toContain(
    "A file offered as a reference waits for step 9, which asks its origin first",
  );
});

test("advisories AC-10: the brief's step on references says whose page waits, what a shot's picture is and what stands in a cell", () => {
  const text = briefStep(9, "Ask for references");
  for (const phrase of [
    "A third party's page is the user's to hand over: one the session captures itself is not taken until the user decides",
    "`<page>-<state>@<width>.png`",
    "every viewport of the plan for `default`, the narrowest and the widest for any other state",
    "says so under Take from it",
    "a role (the user's, the client's, a third party's)",
    "`| Shot | Ref | Whose and from where | Shows | Take from it | Leave | Width |`",
  ])
    expect(text).toContain(phrase);
  expect(text).not.toMatch(/(^|[.:] )A page the session captures itself/m);
});

test("advisories AC-20: a row's width is one the capture shoots, the origin is asked first, and the old sentence is nowhere", () => {
  const text = briefStep(9, "Ask for references");
  for (const phrase of [
    "and 320 where the capture is called with `narrow: true`",
    "A row's Width is one of those: another has no picture to read beside it",
    "and the origin is asked before the file is opened",
  ])
    expect(text).toContain(phrase);
  expect(text).not.toContain("A page the session captures itself");
});

test("advisories AC-11: the build's capture step says what the capture shoots", () => {
  expect(step(skill("wizardingcode-design-build"), 8, "Capture")).toContain(
    "Where `design/shots.md` exists, each shot's page and state has its `capture()`, which shoots `default` at every viewport of the plan and any other state at the narrowest and the widest",
  );
});

test("advisories AC-17: a round of the review has one order, something to order by and a fallback", () => {
  const text = skill("wizardingcode-design-review");
  const stop = step(text, 6, "Stop.");
  for (const phrase of [
    "The session files the person's open feedback among the findings",
    "inside the rubric's eight",
    "The rubric's order holds between kinds of finding",
    "each gap names its shot and its dimension",
    "A finding that is no gap keeps the rubric's order, as every finding does with `reference: none`",
  ])
    expect(stop).toContain(phrase);
  expect(step(text, 2, "Launch `review-ui-ux`")).toContain(
    "With a shot list, its prompt also gets",
  );
});

test("advisories AC-18: the rubric shows its three lines whole and says what each figure and each gap is", () => {
  const text = section(repoFile("plugins/core/skills/crew/rubrics/design-finish.md"), "The line");
  const lines = text.split("\n").map((line) => line.trim());
  const first = lines.indexOf(SCORE_LINE);
  expect(first).toBeGreaterThan(0);
  expect(lines[first - 1]).toBe("```");
  expect(lines[first + 1]).toBe(
    "dimensions: design <n> · usability <n> · creativity <n> · content <n>",
  );
  expect(lines[first + 2]).toBe("reference: <n> shots");
  expect(lines[first + 3]).toBe("```");
  for (const phrase of [
    "filed with its shot and its dimension",
    "in the first sentence the reviewer files after the three lines",
    "the overall figure is their weighted sum after the overall caps",
    "which stay eight at most",
  ])
    expect(text).toContain(phrase);
});

test("advisories AC-19: the motion table's rows hold the clauses item 003 left with no phrase", () => {
  const rows = motionRows();
  const purpose = rows.get("Purpose")?.value ?? "";
  expect(purpose).toContain("One may name none: a rare, first-time moment");
  expect(purpose).toContain(
    "The page's one signature move names the thesis as its purpose, which is the crew's own allowance",
  );
  expect(purpose).not.toContain("Two may name none");
  expect(purpose).toContain("An entrance shows where its parts came from");
  const keyboard = rows.get("From the keyboard");
  expect(keyboard?.value).toContain("A control's own feedback on focus stays");
  expect(keyboard?.value).toContain("opens as it does under the pointer");
  expect(keyboard?.why).toContain("an exception of the crew's");
  const fills = rows.get("What fills the eight")?.value ?? "";
  expect(fills).toContain("the page's one moving picture");
  expect(fills).toContain("last, the entrance of a later section in a shape the page has not used");
  expect(rows.get("Moving elements")?.value).toContain(
    "which the session holds and the count does not",
  );
  expect(step(skill("wizardingcode-design-build"), 7, "The motion layer")).toContain(
    "a menu or a popover that opens from its control",
  );
});

test("advisories AC-15: the keyboard's ledger row names its exception in its rule and in its note", () => {
  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    rows: Record<string, string | undefined>[];
  };
  const rule =
    "no animation on a shortcut, a palette, a jump of focus or the arrows; a control's own key excepted by the crew";
  const rows = ledger.rows.filter((row) => row.rule === rule);
  expect(rows.length).toBe(1);
  expect(rows[0]?.source).toBe("emilkowalski");
  expect(rows[0]?.note).toContain("an exception of the crew's");
  expect(rows[0]?.note).toContain("against the source's letter");
  expect(rows[0]?.note).toContain("not reaching an occasional press");
  expect(
    ledger.rows.some((row) => row.rule === "no animation on an action started from the keyboard"),
  ).toBe(false);
});
