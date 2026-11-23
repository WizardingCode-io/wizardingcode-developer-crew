import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./helpers.ts";
import {
  copyOf,
  declared,
  ENTRY_SENTENCES,
  expectEntrySentences,
  expectNothingToOpen,
  expectOneSentence,
  frontmatter,
  headings,
  listingOf,
  run,
  SKILLS,
  tableRows,
  under,
  wordEdge,
} from "./team-skills-kit.ts";

// The kit's own answers on texts written here, so a helper that answers wrongly is seen by a row of
// its own and not only where a team's files happen to show it (item 2026-11-21-010).
test("2026-11-21-010 the kit: each helper of the teams' skills tests answers as its name says, on a text of the test's own", () => {
  expect(run("  a\n  b\t\tc  ")).toBe("a b c");
  expect([
    wordEdge(undefined),
    wordEdge(" "),
    wordEdge("."),
    wordEdge("`"),
    wordEdge("a"),
    wordEdge("é"),
    wordEdge("7"),
  ]).toEqual([true, true, true, true, false, false, false]);
  const text =
    '---\nname: a-skill\ndescription: "One sentence."\n---\n\n# Title\n\n## One\n\nfirst\n\n| A | B |\n| :- | :- |\n| a 1 | b 1 |\n| a 2 | b 2 |\n\n## Two\n\nsecond\n';
  expect(frontmatter(text)).toEqual({
    name: "a-skill",
    description: "One sentence.",
    body: text.slice(text.indexOf("# Title")),
  });
  expect(frontmatter("# No frontmatter\n")).toEqual({
    name: "",
    description: "",
    body: "# No frontmatter\n",
  });
  expect(headings(text)).toEqual(["## One", "## Two"]);
  expect(under(text, "## One").filter((line) => line !== "")).toEqual([
    "first",
    "| A | B |",
    "| :- | :- |",
    "| a 1 | b 1 |",
    "| a 2 | b 2 |",
  ]);
  expect(under(text, "## Two").filter((line) => line !== "")).toEqual(["second"]);
  expect(under(text, "## Three")).toEqual([]);
  expect(tableRows(under(text, "## One"))).toEqual({
    header: "| A | B |",
    rule: "| :- | :- |",
    rows: [
      ["a 1", "b 1"],
      ["a 2", "b 2"],
    ],
  });
  expect(
    declared(
      "# T\n\n| Subject | Sources |\n| :- | :- |\n| One | a; b |\n| Two | c | d |\n\nafter\n",
    ),
  ).toEqual([
    ["One", "a; b"],
    ["Two", "c | d"],
  ]);
  expect(() => declared("no table\n")).toThrow("the declaration has no table of subjects");
  // The two checks refuse what they name, and hold what fits.
  expectOneSentence("One sentence.", "fits");
  for (const description of ["", "Two. Sentences.", "No full stop", `${"long ".repeat(70)}.`])
    expect(() => expectOneSentence(description, "refused")).toThrow();
  expectNothingToOpen("A skill's text, with nothing to open.", "fits");
  for (const body of [
    "see https://example.org/page",
    "plain http://example.org",
    // An address with nothing after its scheme is no match of the pattern, and is still refused.
    "cut short: https://)",
    "a\n```\nblock\n```\n",
  ])
    expect(() => expectNothingToOpen(body, "refused")).toThrow();
  // The listing: every path under a folder, sorted, each from the folder's own root.
  const folder = tempDir("crew-kit-");
  mkdirSync(join(folder, "b"));
  writeFileSync(join(folder, "b", "two.md"), "2\n");
  writeFileSync(join(folder, "b", "sources.md"), "3\n");
  writeFileSync(join(folder, "a.md"), "1\n");
  expect(listingOf(folder)).toEqual(["/a.md", "/b", "/b/sources.md", "/b/two.md"]);
  // The copy: the teams' declarations and the folders asked for, and no other skill.
  const copy = copyOf(["wizardingcode-qa-testing"]);
  const copied = listingOf(copy);
  expect(copied).toContain("/plugins/core/teams/qa.md");
  expect(copied).toContain(`/${SKILLS}/wizardingcode-qa-testing/SKILL.md`);
  expect(
    copied.filter((path) => path.startsWith(`/${SKILLS}/`) && path.endsWith("SKILL.md")),
  ).toEqual([`/${SKILLS}/wizardingcode-qa-testing/SKILL.md`]);
});

// The check of the build reference's five sentences, on texts written here: the five in order pass,
// and each of six texts that departs in one thing fails (items 2026-11-22-001 and 2026-11-23-001).
test("2026-11-22-001 AC-42: the check of the build reference's sentences passes on the five in order and fails on an order changed, a sentence missing, one twice, a paragraph between two, a wrong paragraph before and a wrong one after", () => {
  const [qa, devops, agentic, architects, researchers] = ENTRY_SENTENCES;
  const text = (...paragraphs: (string | undefined)[]) => `${paragraphs.join("\n\n")}\n`;
  const BEFORE = "4. A fourth step.\n5. A fifth step.";
  const AFTER = "Use `-- <command>` after the criterion.";
  const five = [qa, devops, agentic, architects, researchers];
  expectEntrySentences(text("# Build", BEFORE, ...five, AFTER, "A last one."));
  const wrong: [string, string][] = [
    // Two in the middle, so that the first and the last still stand beside their neighbours.
    ["an order changed", text(BEFORE, qa, agentic, devops, architects, researchers, AFTER)],
    ["a sentence missing", text(BEFORE, qa, devops, architects, researchers, AFTER)],
    ["one twice", text(BEFORE, ...five, AFTER, agentic)],
    [
      "a paragraph between two",
      text(BEFORE, qa, devops, agentic, architects, "Between.", researchers, AFTER),
    ],
    ["a wrong paragraph before", text("4. A fourth step.", ...five, AFTER)],
    ["a wrong paragraph after", text(BEFORE, ...five, "Another.", AFTER)],
  ];
  for (const [why, build] of wrong) expect(() => expectEntrySentences(build), why).toThrow();
  expect(ENTRY_SENTENCES).toHaveLength(5);
});
