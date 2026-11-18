// References as the target of a new site (item 2026-11-18-004): the brief's step that asks for them,
// the build's capture per shot, the review beside the reference, the rubric's two lines and the ledger.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseScore } from "../src/design.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const skill = (name: string): string => repoFile(`plugins/core/skills/${name}/SKILL.md`);
const RUBRIC = "plugins/core/skills/crew/rubrics/design-finish.md";
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

const briefStep = (): string => step(skill("wizardingcode-design-brief"), 9, "Ask for references");

test("references AC-8: the brief asks once, with a default, says what is taken and writes the shot list", () => {
  const text = briefStep();
  for (const phrase of [
    ", once, with the default `no references`",
    "`design/brief.md` says `no references`",
    "the user's own file",
    "the client's own material",
    "a page this project already ships",
    "a comp the user approved",
    "made or holds the rights to",
    "is taken with its owner named in its row",
    "`design/refs/`",
    "`design/shots.md`",
  ])
    expect(text).toContain(phrase);
  expect(
    inOrder(text, [
      "| Shot |",
      " Ref |",
      " Whose and from where |",
      " Shows |",
      " Take from it |",
      " Leave |",
      " Width |",
    ]),
  ).toBe(true);
  expect(section(skill("wizardingcode-design-brief"), "Output")).toContain("`design/shots.md`");
});

test("references AC-9: what is not taken, and what a build takes from a reference", () => {
  const text = briefStep();
  for (const phrase of [
    "a reference whose origin is not said is not taken",
    "a gallery's own terms still bind",
    "came from a gallery is not taken as a picture, whoever hands it over",
    "a written observation of the crew's own with the original site's link",
    "`wizardingcode-frontend-verification`",
    "unless the user decides, on record",
    "one the session captures itself is not taken until the user decides",
    "only what is the client's is recreated",
    "never its code, copy, pictures or signature effect",
  ])
    expect(text).toContain(phrase);
});

test("references AC-10: references stay out of commits and of what ships, and a person in one is not taken as given", () => {
  const text = briefStep();
  for (const phrase of [
    "in the project's ignore file before the first reference is saved",
    "no person's name and no client's private name",
    "cropped or blurred by the user before it is taken, or is not taken",
    "never enter a commit and are never published",
    "No file of `design/refs/` is staged before a commit, none is copied into a folder the site ships",
    "no capture of the build beside its reference is published",
  ])
    expect(text).toContain(phrase);
});

test("references AC-11: the build captures each shot at its width", () => {
  const text = step(skill("wizardingcode-design-build"), 8, "Capture");
  expect(
    inOrder(text, ["`design/shots.md`", "each shot's page and state has its `capture()`"]),
  ).toBe(true);
});

test("references AC-12: the review reads each capture beside its reference and says what the score was read against", () => {
  const text = skill("wizardingcode-design-review");
  const inputs = section(text, "Inputs");
  expect(inputs).toContain("`design/shots.md`");
  expect(inputs).toContain("`design/refs/`");
  expect(step(text, 2, "Launch `review-ui-ux`")).toContain(
    "each capture is read beside its reference",
  );
  expect(step(text, 6, "Stop.")).toContain(
    "the person's open feedback first, else the weakest dimension of the weakest shot",
  );
  expect(section(text, "Done when")).toContain("what the score was read against");
});

test("references AC-13: the rubric's three lines stand apart and in order, with what a reference adds to the reading", () => {
  const text = section(repoFile(RUBRIC), "The line");
  const lines = text.split("\n");
  const bare = (line: string): string => line.replace(/`/g, "").trim();
  const score = lines.findIndex((line) => line.includes(SCORE_LINE));
  const dimensions = lines.findIndex(
    (line) =>
      bare(line) === "dimensions: design <n> · usability <n> · creativity <n> · content <n>",
  );
  const reference = lines.findIndex(
    (line) =>
      line.includes("reference: <n> shots") &&
      line.includes("reference: none") &&
      !line.includes("dimensions:") &&
      !line.includes("score:"),
  );
  expect(score).toBeGreaterThanOrEqual(0);
  expect(dimensions).toBeGreaterThan(score);
  expect(reference).toBeGreaterThan(dimensions);
  expect(lines[dimensions + 1]?.trim()).toBe("reference: <n> shots");
  for (const phrase of [
    "the three largest gaps",
    "where, what is wrong and what to change",
    "only on what the shot's row says to take",
    "read against nothing but the rubric",
    "The weakest dimension is named in words",
  ])
    expect(text).toContain(phrase);
  const provenance = lines.find((line) => line.startsWith("Provenance")) ?? "";
  expect(provenance).toContain("cook");
  expect(provenance).toContain("b23cac6");
  expect(provenance).toContain("the crew's own");
});

test("references AC-14: the ledger holds the source, what was not read of it and its six rows", () => {
  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    sources: { name: string; licence: string; commit: string }[];
    unread: string[];
    rows: Record<string, string | undefined>[];
  };
  expect(ledger.sources.find((source) => source.name === "cook")).toEqual({
    name: "cook",
    licence: "MIT",
    commit: "b23cac6",
  });
  expect(ledger.unread.some((line) => line.startsWith("cook:"))).toBe(true);
  const rows = ledger.rows.filter(
    (row) => row.source === "cook" && row.proof === "design-references.test.ts",
  );
  expect(rows.length).toBe(6);
  for (const row of rows) {
    expect(row.status).toBe("in");
    expect((row.text ?? "").length).toBeGreaterThan(10);
    expect(row.file ?? "").not.toBe("");
    expect(repoFile(row.file ?? RUBRIC)).toContain(row.text ?? "\u0000");
    expect(row.note).toContain("site-bakery");
  }
  const noteOf = (rule: string): string =>
    rows.find((row) => (row.rule ?? "").startsWith(rule))?.note ?? "";
  expect(noteOf("a figure per dimension")).toContain("the crew's own");
  expect(noteOf("the shot list")).toContain("the crew's own");
});

test("references AC-15: the score line stands, and the engine reads it the same with two lines after it", () => {
  expect(repoFile(RUBRIC)).toContain(SCORE_LINE);
  const line = "score: 8.7 · caps: none · disposition: ship";
  const alone = parseScore(`read: 6 captures\n${line}\n`);
  const followed = parseScore(
    `read: 6 captures\n${line}\ndimensions: design 8.5 · usability 9 · creativity 8.5 · content 9\nreference: 3 shots\n`,
  );
  expect(alone).not.toBeNull();
  expect(followed).toEqual(alone);
  expect(parseScore(`${line} · dimensions: design 8.5\n`)).toBeNull();
});
