import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  ADDRESS,
  HEADER,
  listed,
  ROOT,
  repoFile,
  rows,
  sections,
  tableHeaders,
  tellsToFetchOrRun,
} from "./frontend-skill-rows.ts";

const DIR = "plugins/core/skills/wizardingcode-frontend-verification";
const SKILL = `${DIR}/SKILL.md`;
const SOURCES = `${DIR}/sources.md`;
const STRATEGY = "plugins/core/skills/wizardingcode-frontend-strategy/SKILL.md";
const SUBJECTS = ["Component library, visual tests and enforcement", "New sites"];
/** A testing tool's own page: it states the tool's default and asks for nothing. */
const TOOLS = ["playwright.dev", "raw.githubusercontent.com", "www.chromatic.com"];
/** A gallery's terms or its robots file, as the research read them. */
const GALLERIES = ["doc.refero.design", "mobbin.com", "www.adobe.com", "godly.website"];
const SUMMARY = "through a summary and not at the page itself";
const COMMANDS =
  /(?:^|[\s`;&|(])(?:npx|npm|pnpm|yarn|bunx|curl|wget|brew|pip|composer)\s|git clone|\binstall\b/m;
const VERBS = /\b(?:open|visit|fetch|download|install|clone|run|scrape|copy)\b/i;

const skill = () => repoFile(SKILL);
const allRows = () => SUBJECTS.flatMap((title) => rows(sections(skill()).get(title) ?? []));
const both = () => `${skill()}\n${repoFile(SOURCES)}`;
const host = (address: string) => address.replace(/^https:\/\//, "").split("/")[0] ?? "";

test("verification AC-1: the skill holds its two subjects, each a rule table with the four columns, at least eight rules each and twenty in all", () => {
  const text = skill();
  expect(text).toMatch(/^---\nname: wizardingcode-frontend-verification\n/);
  const found = sections(text);
  let total = 0;
  for (const title of SUBJECTS) {
    const lines = found.get(title);
    expect(lines, title).toBeDefined();
    expect(tableHeaders(lines ?? []), title).toEqual([HEADER]);
    const own = rows(lines ?? []);
    expect(own.length, title).toBeGreaterThanOrEqual(8);
    for (const row of own) expect(row, title).toHaveLength(4);
    total += own.length;
  }
  expect(total).toBeGreaterThanOrEqual(20);
  // Every table of the page is a rule table of a subject.
  expect(tableHeaders(text.split(/\r?\n/))).toEqual(SUBJECTS.map(() => HEADER));
});

test("verification AC-14: two labels, each one its source carries: a study with its replication, a tool's default as the tool's own, a vendor's eval, one person's measurement, a gallery's terms as the research read them, and no three-part version", () => {
  const all = allRows();
  expect(all.length).toBeGreaterThan(0);
  const seen = new Set<string>();
  for (const [rule, label, source, note] of all) {
    expect((rule ?? "").length, rule).toBeGreaterThan(20);
    expect((note ?? "").length, rule).toBeGreaterThan(10);
    const name = (label ?? "").replace(/`/g, "");
    expect(["published-study", "hypothesis"], rule).toContain(name);
    seen.add(name);
    const cell = source ?? "";
    const line = `${rule} ${note}`;
    if (name === "published-study") expect(note ?? "", rule).toContain("replication");
    if (cell.startsWith("`")) {
      expect(cell, rule).toMatch(/^`[^`\s]+`$/);
      expect(existsSync(join(ROOT, cell.replace(/`/g, ""))), `${rule}: ${cell}`).toBe(true);
      expect(name, rule).toBe("hypothesis");
      continue;
    }
    expect(cell, rule).toMatch(/^https:\/\/\S+$/);
    if (TOOLS.includes(host(cell))) {
      expect(name, rule).toBe("hypothesis");
      expect(line, rule).toContain("the tool's own");
    }
    if (cell.includes("vercel.com/blog")) {
      expect(name, rule).toBe("hypothesis");
      expect(line, rule).toContain("a vendor's");
    }
    if (host(cell) === "scottspence.com") {
      expect(name, rule).toBe("hypothesis");
      expect(line, rule).toContain("one person's");
    }
    if (GALLERIES.includes(host(cell))) {
      expect(name, rule).toBe("hypothesis");
      expect(note ?? "", rule).toContain("as the research read");
      if (host(cell) === "mobbin.com") expect(note ?? "", rule).toContain(SUMMARY);
    }
  }
  expect([...seen].sort()).toEqual(["hypothesis", "published-study"]);
  // Each kind of source the criterion names has its row: a clause over no row would hold nothing.
  const hosts = all.map(([, , source]) => host(source ?? ""));
  for (const needed of [...TOOLS, ...GALLERIES, "scottspence.com", "vercel.com"])
    expect(hosts, needed).toContain(needed);
  for (const fileLine of both().split(/\r?\n/)) expect(fileLine).not.toMatch(/\b\d+\.\d+\.\d+\b/);
});

test("verification AC-15: the skill's addresses and its sources file hold each other, each line with its date and with how a page was read, and nothing the research did not read is an address", () => {
  const lines = listed(SOURCES);
  const cited = new Set(skill().match(ADDRESS) ?? []);
  expect(cited.size).toBeGreaterThan(14);
  for (const address of cited) {
    const line = lines.get(address);
    expect(line, `sources.md lacks ${address}`).toBeDefined();
    expect(line, address).toMatch(/read on \d{4}-\d{2}-\d{2}/);
    // The address, its title, what it is, the date: four parts at least.
    expect((line ?? "").split(" · ").length, address).toBeGreaterThanOrEqual(4);
  }
  // No line of the sources file for an address the skill does not cite.
  for (const address of lines.keys()) expect(cited.has(address), address).toBe(true);
  // How a page was read, where the research did not read the page itself.
  const arxiv = [...lines.entries()].filter(([address]) => host(address) === "arxiv.org");
  expect(arxiv).toHaveLength(1);
  expect(arxiv[0]?.[1] ?? "").toContain("by its abstract");
  const mobbin = [...lines.entries()].filter(([address]) => host(address) === "mobbin.com");
  expect(mobbin).toHaveLength(1);
  expect(mobbin[0]?.[1] ?? "").toContain(SUMMARY);
  const text = both().toLowerCase();
  for (const closed of ["percy.io", "applitools.com", "storybook.js.org", "m3.material.io"])
    expect(text, closed).not.toContain(closed);
});

test("verification AC-4: no third party's skill set is a source or is named", () => {
  const SETS = [
    "impeccable",
    "taste-skill",
    "ui-ux-pro-max",
    "anthropics/skills",
    "web-interface-guidelines",
    "agent-skills",
    "superdesign",
    "emilkowalski/skills",
    "nutlope",
    "hallmark",
    "huashu-design",
    "unslop",
    "ai-design-skills",
    "garden-skills",
    "ui-skills",
    "anti-slop",
    "antislop",
  ];
  const text = both().toLowerCase();
  expect(text.length).toBeGreaterThan(5000);
  for (const set of SETS) expect(text, set).not.toContain(set);
  // The detector is named by its gate.
  expect(skill()).toContain("`design-detect`");
});

test("verification AC-12: what is not decided, five lines: each open value with whose it is, and a session that fixes none", () => {
  const section = sections(skill()).get("What is not decided") ?? [];
  expect(section.length).toBeGreaterThan(0);
  expect(section.some((l) => l.startsWith("|"))).toBe(false);
  const lines = section.filter((l) => l.startsWith("- "));
  expect(lines).toHaveLength(5);
  const said: RegExp[] = [
    /tolerance of the screenshot comparison.*where the project writes it.*item that builds the comparison.*no value stands on this page/i,
    /jury's protocol.*how many jurors.*blind pairing.*outliers.*the user's to say/i,
    /QA team's definition takes Storybook's server.*not decided here/i,
    /which measure pixelmatch uses.*version Playwright bundles.*checked before a value is carried from one tool to another/i,
    /fixes none of them.*asks the user or leaves the value to the item its line names.*records the answer it is given and no choice of its own.*writes no value and claims nothing that rests on it.*tool's default is no answer/i,
  ];
  said.forEach((line, i) => {
    expect(lines[i] ?? "", String(line)).toMatch(line);
  });
});

test("verification AC-6: what the team never claims, each on its own line", () => {
  const lines = (sections(skill()).get("What the team never claims") ?? []).filter((l) =>
    l.startsWith("- "),
  );
  expect(lines).toHaveLength(5);
  const claims: RegExp[] = [
    /one model's verdict counts as one juror's.*never called a jury's/i,
    /8\.5.*one model's reading of the captures.*no proof that a person prefers the page/i,
    /defaults of Playwright, pixelmatch and Chromatic.*never compared as one scale.*no page read recommends a value/i,
    /how often a skill is invoked.*a vendor's eval or one person's measurement.*never quoted as the crew's rate/i,
    /chain of the six design skills.*not proven on a whole site.*real project with a blind jury.*no site of three.*8\.5/i,
  ];
  claims.forEach((claim, i) => {
    expect(lines[i] ?? "", String(claim)).toMatch(claim);
  });
});

test("verification AC-7: the shared check names each fault it finds: a fenced block, every command, and a verb on a line with an address", () => {
  const fence = "```";
  expect(tellsToFetchOrRun(`Text.\n${fence}\ncode\n${fence}\n`, COMMANDS, VERBS)).toEqual([
    "a fenced block",
  ]);
  expect(tellsToFetchOrRun("Then npx something here.", COMMANDS, VERBS)).toEqual([
    "a command: npx",
  ]);
  // A command at the start of a line, and every command of a text, not the first alone.
  expect(tellsToFetchOrRun("Text.\ncurl something\nthen `npm test`.", COMMANDS, VERBS)).toEqual([
    "a command: curl",
    "a command: `npm",
  ]);
  expect(tellsToFetchOrRun("Scrape https://example.test/gallery.", COMMANDS, VERBS)).toEqual([
    "a verb on a line with an address: Scrape",
  ]);
  expect(tellsToFetchOrRun("- Copy it from https://example.test/a\n", COMMANDS, VERBS)).toEqual([
    "a verb on a line with an address: Copy",
  ]);
  // A verb on a line with no address, and a longer word on a line with one, are no fault.
  expect(
    tellsToFetchOrRun(
      "The gate will run.\nIts terms forbid scraping and copied captures: https://example.test/terms",
      COMMANDS,
      VERBS,
    ),
  ).toEqual([]);
});

test("verification AC-7: the skill and its sources file tell the session nothing to fetch or run", () => {
  const text = skill();
  for (const [name, file] of [
    [SKILL, text],
    [SOURCES, repoFile(SOURCES)],
  ] as const)
    expect(tellsToFetchOrRun(file, COMMANDS, VERBS), name).toEqual([]);
  const provenance = text
    .split(/\r?\n/)
    .filter((l) =>
      l.includes(
        "The addresses are provenance: they are recorded with a choice and never opened by the session.",
      ),
    );
  expect(provenance).toHaveLength(1);
});

test("verification AC-13: the Strategy skill sends the session to the skill in a step of its own, and the skill names the crew's own files and says the rule on galleries in one paragraph with no address", () => {
  const steps = repoFile(STRATEGY)
    .split(/\r?\n/)
    .filter((l) => /^\d+\. /.test(l));
  const own = steps.filter((l) => l.includes("`wizardingcode-frontend-verification`"));
  expect(own).toHaveLength(1);
  const step = own[0] ?? "";
  expect(step).toContain("before the first gate run of the change");
  expect(step.match(ADDRESS)).toBeNull();
  for (const other of [
    "wizardingcode-frontend-engineering",
    "wizardingcode-frontend-screens",
    "wizardingcode-frontend-visual-craft",
  ])
    expect(step).not.toContain(other);
  // Right after the step of the Engineering skill, which stays as it is.
  const engineering = steps.findIndex((l) => l.includes("`wizardingcode-frontend-engineering`"));
  expect(engineering).toBeGreaterThanOrEqual(0);
  expect(steps.indexOf(step)).toBe(engineering + 1);
  expect(steps[engineering]).toContain("before the first component of the change");
  const text = skill();
  for (const path of [
    "docs/specs/2026-11-15-qa-team-design.md",
    "plugins/core/skills/crew/references/gate.md",
    "plugins/core/e2e/measure.mjs",
    "packages/engine/src/design-grade.ts",
    "packages/engine/src/design-lint.ts",
    "packages/engine/src/design.ts",
    "scripts/site-distinctness.ts",
    "docs/adr/0018-a-new-site-has-a-creation-process-the-engine-requires.md",
    "plugins/core/skills/wizardingcode-design-brief/SKILL.md",
    "plugins/core/skills/wizardingcode-design-direction/SKILL.md",
    "plugins/core/skills/wizardingcode-design-copy/SKILL.md",
    "plugins/core/skills/wizardingcode-design-system/SKILL.md",
    "plugins/core/skills/wizardingcode-design-build/SKILL.md",
    "plugins/core/skills/wizardingcode-design-review/SKILL.md",
    "plugins/core/skills/crew/rubrics/design-finish.md",
    "docs/evals/2026-10-31-site-results.md",
  ]) {
    expect(text, path).toContain(`\`${path}\``);
    expect(existsSync(join(ROOT, path)), path).toBe(true);
  }
  // One paragraph under New sites says the rule on galleries, and holds no address.
  const sites = sections(text).get("New sites") ?? [];
  const paragraphs = sites.filter((l) => l.includes("opens no gallery"));
  expect(paragraphs).toHaveLength(1);
  const paragraph = paragraphs[0] ?? "";
  expect(paragraph.startsWith("|")).toBe(false);
  expect(paragraph.match(ADDRESS)).toBeNull();
  for (const part of [
    "The session opens no gallery and drives no browser against one",
    "the study of a gallery is a person's, through the gallery's own interface",
    "what reaches the session is a written observation of the crew's own with the original site's link",
    "no capture is copied, nothing is scraped, and nothing is used to train or score a model",
    "a gallery's terms as they stand on the day win over what this page says of them",
  ])
    expect(paragraph, part).toContain(part);
});
