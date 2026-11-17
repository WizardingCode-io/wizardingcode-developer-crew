import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LABELS } from "../src/design-proof.ts";
import { ADDRESS, HEADER, listed, ROOT, repoFile, rows, sections } from "./frontend-skill-rows.ts";

const DIR = "plugins/core/skills/wizardingcode-frontend-visual-craft";
const SKILL = `${DIR}/SKILL.md`;
const SOURCES = `${DIR}/sources.md`;
const STRATEGY = "plugins/core/skills/wizardingcode-frontend-strategy/SKILL.md";
const SUBJECTS = [
  "Typography",
  "Spacing, proportion and grids",
  "Colour",
  "Design contract and tokens",
  "Retina and pixel precision",
  "Motion",
  "Interface copy",
  "Signs of generic design",
];
const HTTP_ADMITTED = "http://webtypography.net/2.1.2";

const skill = () => repoFile(SKILL);
const allRows = () => SUBJECTS.flatMap((title) => rows(sections(skill()).get(title) ?? []));

test("visual-craft AC-8: the skill holds its eight subjects, each a rule table with the four columns, at least three rules each and forty in all", () => {
  const text = skill();
  expect(text).toMatch(/^---\nname: wizardingcode-frontend-visual-craft\n/);
  const found = sections(text);
  let total = 0;
  for (const title of SUBJECTS) {
    const lines = found.get(title);
    expect(lines, title).toBeDefined();
    const headers = (lines ?? []).filter(
      (line, i, all) => line.startsWith("|") && !(all[i - 1] ?? "").startsWith("|"),
    );
    expect(headers, title).toEqual([HEADER]);
    const own = rows(lines ?? []);
    expect(own.length, title).toBeGreaterThanOrEqual(3);
    for (const row of own) expect(row, title).toHaveLength(4);
    total += own.length;
  }
  expect(total).toBeGreaterThanOrEqual(40);
  // Every table of the page is a rule table of a subject.
  const everyHeader = text
    .split(/\r?\n/)
    .filter((line, i, all) => line.startsWith("|") && !(all[i - 1] ?? "").startsWith("|"));
  expect(everyHeader).toEqual(SUBJECTS.map(() => HEADER));
});

test("visual-craft AC-9: every rule has one of the five labels, never measured-here, one source that is an address or a file of the repository, a clause on a norm and a replication note on a study", () => {
  const all = allRows();
  expect(all.length).toBeGreaterThan(0);
  const seen = new Set<string>();
  for (const [rule, label, source, note] of all) {
    expect((rule ?? "").length, rule).toBeGreaterThan(10);
    const name = (label ?? "").replace(/`/g, "");
    expect(LABELS as readonly string[], rule).toContain(name);
    expect(name, rule).not.toBe("measured-here");
    seen.add(name);
    const cell = source ?? "";
    if (cell.startsWith("`")) {
      const path = cell.replace(/`/g, "");
      expect(cell, rule).toMatch(/^`[^`\s]+`$/);
      expect(existsSync(join(ROOT, path)), `${rule}: ${path}`).toBe(true);
    } else if (cell !== HTTP_ADMITTED) expect(cell, rule).toMatch(/^https:\/\/\S+$/);
    expect((note ?? "").length, rule).toBeGreaterThan(5);
    if (name === "norm") expect(`${rule} ${note}`, rule).toMatch(/\b\d\.\d\.\d{1,2}\b/);
    if (name === "published-study")
      expect(note ?? "", rule).toMatch(/no replication found|replication unknown|repeated by/);
  }
  // The page uses the four labels a page can carry.
  expect([...seen].sort()).toEqual(["hypothesis", "norm", "platform-guidance", "published-study"]);
});

test("visual-craft AC-10: every address the skill cites is in its sources file with the date it was read, what was read in part or by its abstract says so, and nothing not opened is cited", () => {
  const lines = listed(SOURCES);
  const cited = new Set(skill().match(ADDRESS) ?? []);
  expect(cited.size).toBeGreaterThan(30);
  for (const address of cited) {
    const line = lines.get(address);
    expect(line, `sources.md lacks ${address}`).toBeDefined();
    expect(line, address).toMatch(/read on \d{4}-\d{2}-\d{2}/);
    // The address, its title, what it is, the date: four parts at least.
    expect((line ?? "").split(" · ").length, address).toBeGreaterThanOrEqual(4);
  }
  expect(cited.has(HTTP_ADMITTED)).toBe(true);
  const inPart = [
    "https://www.w3.org/TR/WCAG22/",
    "https://www.w3.org/TR/wcag-3.0/",
    "https://www.designtokens.org/tr/2025.10/format/",
    "https://primer.style/product/getting-started/foundations/layout/",
    "https://en.wikipedia.org/wiki/Golden_ratio",
  ];
  for (const address of inPart.slice(0, 3)) expect(cited.has(address), address).toBe(true);
  // A page read in part that the skill cites says so; one it does not cite has no line at all.
  for (const address of inPart) {
    if (cited.has(address)) expect(lines.get(address) ?? "", address).toContain("read in part");
    else expect(lines.has(address), address).toBe(false);
  }
  const byAbstract = [
    "pubmed.ncbi.nlm.nih.gov/20421475",
    "pubmed.ncbi.nlm.nih.gov/23654206",
    "pubmed.ncbi.nlm.nih.gov/25141597",
    "api.openalex.org/works/doi:10.1111/j.2044-8295.1980.tb01763.x",
    "api.crossref.org/works/10.2190/2PNH-8TT0-EMC5-FTW5",
    "arxiv.org/abs/2511.20513",
    "arxiv.org/abs/2407.08850",
  ];
  let abstracts = 0;
  for (const [address, line] of lines)
    if (byAbstract.some((part) => address.includes(part))) {
      expect(line, address).toContain("by its abstract");
      abstracts += 1;
    }
  expect(abstracts).toBeGreaterThan(0);
  const both = `${skill()}\n${repoFile(SOURCES)}`.toLowerCase();
  for (const closed of [
    "researchr.org",
    "apartmenttherapy.com",
    "id=154437",
    "id=1741689",
    "refactoringui",
    "refactoring ui",
    "animations.dev",
  ])
    expect(both, closed).not.toContain(closed);
});

test("visual-craft AC-11: no third party's skill set is a source: no address of the skill or of its sources file names a repository or a raw file of the fifteen sets", () => {
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
  const addresses = [
    ...(skill().match(ADDRESS) ?? []),
    ...(repoFile(SOURCES).match(ADDRESS) ?? []),
  ];
  expect(addresses.length).toBeGreaterThan(60);
  for (const address of addresses)
    for (const set of SETS) expect(address.toLowerCase(), address).not.toContain(set);
  // A practitioner's own page stays a source: the sets' repositories are what is shut out.
  expect(addresses.some((a) => a.startsWith("https://emilkowal.ski/"))).toBe(true);
  // No set is named anywhere in the two files: the page speaks of "a set" and "another".
  const both = `${skill()}\n${repoFile(SOURCES)}`.toLowerCase();
  for (const set of SETS) expect(both, set).not.toContain(set);
  // A row's source cell never holds a set's name either, as an address or as a path.
  for (const [rule, , source] of allRows())
    for (const set of SETS) expect((source ?? "").toLowerCase(), rule).not.toContain(set);
});

const CONFLICTS = [
  "Line length",
  "Body size",
  "Tracking floor",
  "Display face",
  "Touch target on the web",
  "Spacing scale",
  "One-pixel adjustment",
  "Contrast floor",
  "Easing of an exit",
  "Length of a UI animation",
  "Bounce",
  "Hover duration",
  "Case of headings",
  "Gradient text",
  "Icon set",
];

test("visual-craft AC-17: fifteen conflicts, one line and one default each, the norm as the floor, and the contract bounded by the norms, the gates and the standard", () => {
  const lines = sections(skill()).get("Where the sources disagree") ?? [];
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.some((l) => l.startsWith("|"))).toBe(false);
  const items = lines.filter((l) => l.startsWith("- **"));
  expect(items.map((l) => /^- \*\*([^*]+)\*\*/.exec(l)?.[1])).toEqual(CONFLICTS);
  for (const item of items) expect(item.split("Default:").length - 1, item).toBe(1);
  const line = (name: string) => items.find((l) => l.startsWith(`- **${name}**`)) ?? "";
  expect(line("Contrast floor")).toMatch(/Default: 4\.5:1/);
  expect(line("Contrast floor")).toContain("1.4.3");
  const target = line("Touch target on the web");
  expect(target).toMatch(/floor[^.]*24 by 24 CSS px/);
  expect(target).toMatch(/Default: 24 px, 44 on touch/);
  expect(target).toContain("`references/frontend.md`");
  expect(target).toContain("2.5.8");
  // A default that is none leaves the choice to the direction, in those words.
  const none = items.filter((l) => l.includes("Default: none"));
  expect(none.length).toBeGreaterThan(0);
  for (const item of none) expect(item).toContain("the project's direction decides");
  // Which conflicts have no default is decided: a default that turned into none fails here.
  expect(none.map((l) => /^- \*\*([^*]+)\*\*/.exec(l)?.[1])).toEqual([
    "Tracking floor",
    "One-pixel adjustment",
    "Case of headings",
  ]);
  // How far the contract goes, said once.
  const section = lines.join("\n");
  expect(section.split("DESIGN.md").length - 1).toBe(1);
  const sentence = lines.find((l) => l.includes("DESIGN.md")) ?? "";
  for (const part of [
    "wins among conventions and defaults",
    "never below a rule labelled `norm`",
    "never over a gate's result",
    "only with the user's decision on record",
  ])
    expect(sentence).toContain(part);
});

test("visual-craft AC-13: what the team never claims, each on its own line", () => {
  const lines = (sections(skill()).get("What the team never claims") ?? []).filter((l) =>
    l.startsWith("- "),
  );
  expect(lines).toHaveLength(7);
  const claims: RegExp[] = [
    /colour.*conversion/i,
    /animation.*conversion/i,
    /detectors.*floor.*never.*proof.*preferred/i,
    /APCA.*not a norm.*WCAG ratio.*first/i,
    /pixel perfect.*visual regression.*same operating system, browser and device scale/i,
    /golden ratio.*no evidence.*prefer/i,
    /vendor's benchmark.*hypothesis.*never.*another language/i,
  ];
  claims.forEach((claim, i) => {
    expect(lines[i] ?? "", String(claim)).toMatch(claim);
  });
});

test("visual-craft AC-14: the skill and its sources file tell the session nothing to fetch or run", () => {
  const text = skill();
  for (const [name, file] of [
    [SKILL, text],
    [SOURCES, repoFile(SOURCES)],
  ] as const) {
    expect(file, name).not.toContain("```");
    expect(file, name).not.toMatch(
      /(?:^|[\s`;&|(])(?:npx|npm|pnpm|yarn|bunx|curl|wget|brew|pip)\s|git clone|\binstall\b/m,
    );
    for (const line of file.split(/\r?\n/))
      if (/https?:\/\//.test(line))
        expect(line, name).not.toMatch(
          /\b(?:open|visit|fetch|download|install|clone|run|browse|go to|see)\b/i,
        );
  }
  const provenance = text
    .split(/\r?\n/)
    .filter((l) =>
      l.includes(
        "The addresses are provenance: they are recorded with a choice and never opened by the session.",
      ),
    );
  expect(provenance).toHaveLength(1);
});

test("visual-craft AC-15: the Strategy skill sends the session to the skill in a step with no address, and the skill names the gate's reference, the crew's own files and the rule on invented proof", () => {
  const strategy = repoFile(STRATEGY);
  const step = strategy
    .split(/\r?\n/)
    .find((l) => l.includes("`wizardingcode-frontend-visual-craft`"));
  expect(step).toBeDefined();
  expect(step ?? "").toMatch(/^\d+\. /);
  expect(step ?? "").toContain("before the direction's tokens and the first interface file");
  expect((step ?? "").match(ADDRESS)).toBeNull();
  const text = skill();
  for (const path of [
    "plugins/core/skills/crew/references/gate.md",
    "plugins/core/skills/wizardingcode-design-system/SKILL.md",
    "plugins/core/skills/crew/references/frontend.md",
  ]) {
    expect(text, path).toContain(`\`${path}\``);
    expect(existsSync(join(ROOT, path)), path).toBe(true);
  }
  expect(text).toContain("`design-detect`");
  expect(text).toContain("design lint");
  const copy = (sections(text).get("Interface copy") ?? []).join("\n");
  expect(copy).toContain("`wizardingcode-frontend-strategy`");
  expect(copy).toMatch(/invented proof/i);
  expect(copy).toMatch(/deceptive pattern/i);
});
