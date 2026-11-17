import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { LABELS } from "../src/design-proof.ts";
import {
  ADDRESS,
  HEADER,
  listed,
  ROOT,
  repoFile,
  rows,
  sections,
  tableHeaders,
} from "./frontend-skill-rows.ts";

const DIR = "plugins/core/skills/wizardingcode-frontend-screens";
const SKILL = `${DIR}/SKILL.md`;
const SOURCES = `${DIR}/sources.md`;
const STRATEGY = "plugins/core/skills/wizardingcode-frontend-strategy/SKILL.md";
const STANDARD = "plugins/core/skills/crew/references/frontend.md";
const SUBJECTS = [
  "Screens and states",
  "Keyboard and focus",
  "Measured accessibility",
  "Responsive",
  "Forms",
];
const DIRECTIVE = "http://publications.europa.eu/resource/celex/32019L0882";
const VERCEL = "https://vercel.com/design/guidelines";

const skill = () => repoFile(SKILL);
const allRows = () => SUBJECTS.flatMap((title) => rows(sections(skill()).get(title) ?? []));
const both = () => `${skill()}\n${repoFile(SOURCES)}`;

test("screens AC-1: the skill holds its five subjects, each a rule table with the four columns, at least four rules each and thirty in all", () => {
  const text = skill();
  expect(text).toMatch(/^---\nname: wizardingcode-frontend-screens\n/);
  const found = sections(text);
  let total = 0;
  for (const title of SUBJECTS) {
    const lines = found.get(title);
    expect(lines, title).toBeDefined();
    expect(tableHeaders(lines ?? []), title).toEqual([HEADER]);
    const own = rows(lines ?? []);
    expect(own.length, title).toBeGreaterThanOrEqual(4);
    for (const row of own) expect(row, title).toHaveLength(4);
    total += own.length;
  }
  expect(total).toBeGreaterThanOrEqual(30);
  // Every table of the page is a rule table of a subject.
  const everyHeader = tableHeaders(text.split(/\r?\n/));
  expect(everyHeader).toEqual(SUBJECTS.map(() => HEADER));
});

test("screens AC-10: every rule has a label its source carries: a clause on a norm, the law as one row by its article, a replication note on a study, a platform on a platform's guidance", () => {
  const all = allRows();
  expect(all.length).toBeGreaterThan(0);
  const seen = new Set<string>();
  for (const [rule, label, source, note] of all) {
    expect((rule ?? "").length, rule).toBeGreaterThan(20);
    const name = (label ?? "").replace(/`/g, "");
    expect(LABELS as readonly string[], rule).toContain(name);
    expect(name, rule).not.toBe("measured-here");
    seen.add(name);
    const cell = source ?? "";
    if (cell.startsWith("`")) {
      expect(cell, rule).toMatch(/^`[^`\s]+`$/);
      const path = cell.replace(/`/g, "");
      expect(existsSync(join(ROOT, path)), `${rule}: ${path}`).toBe(true);
    } else if (cell !== DIRECTIVE) expect(cell, rule).toMatch(/^https:\/\/\S+$/);
    expect((note ?? "").length, rule).toBeGreaterThan(10);
    if (name === "norm") {
      expect(`${rule} ${note}`, rule).toMatch(/\b\d\.\d\.\d{1,2}\b|\bArticle \d+\b/);
      // A criterion the standard lists and the research did not read again says so.
      if (cell === `\`${STANDARD}\``)
        expect(note ?? "", rule).toContain("not read again at the W3C's page");
    }
    if (name === "published-study")
      expect(note ?? "", rule).toMatch(
        /no replication found|replication unknown|no larger replication found|one company's experiments|repeated by/,
      );
    if (name === "platform-guidance")
      expect(rule ?? "", rule).toMatch(/^On (?:the web|iOS|macOS|Android)\b/);
  }
  expect([...seen].sort()).toEqual(["hypothesis", "norm", "platform-guidance", "published-study"]);
  // The law: one row, the Directive's, with its scope and the decree that transposes it.
  const law = all.filter(([, , source]) => source === DIRECTIVE);
  expect(law).toHaveLength(1);
  const [rule, label, , note] = law[0] ?? [];
  expect(label).toBe("`norm`");
  const text = `${rule} ${note}`;
  for (const part of [
    "Article 2",
    "Directive (EU) 2019/882",
    "28 June 2025",
    "e-commerce services",
    "Decreto-Lei n.º 82/2022",
    "microenterprises",
  ])
    expect(text, part).toContain(part);
  // The decree is no row's source.
  for (const [r, , source] of all) expect(source ?? "", r).not.toContain("dre.pt");
});

test("screens AC-3: every address the skill cites is in its sources file with the date it was read, what was read in part says so, and nothing not opened is cited", () => {
  const lines = listed(SOURCES);
  const cited = new Set(skill().match(ADDRESS) ?? []);
  expect(cited.size).toBeGreaterThan(20);
  for (const address of cited) {
    const line = lines.get(address);
    expect(line, `sources.md lacks ${address}`).toBeDefined();
    expect(line, address).toMatch(/read on \d{4}-\d{2}-\d{2}/);
    // The address, its title, what it is, the date: four parts at least.
    expect((line ?? "").split(" · ").length, address).toBeGreaterThanOrEqual(4);
  }
  expect(cited.has(DIRECTIVE)).toBe(true);
  const inPart = [
    "https://www.w3.org/TR/WCAG22/",
    "https://primer.style/product/getting-started/foundations/layout/",
  ];
  expect(cited.has(inPart[0] ?? "")).toBe(true);
  for (const address of inPart) {
    const line = lines.get(address);
    if (cited.has(address)) expect(line ?? "", address).toContain("read in part");
    else expect(lines.has(address), address).toBe(false);
  }
  const text = both().toLowerCase();
  for (const closed of [
    "automated-accessibility-coverage-report",
    "blog.hubspot.com",
    "hubspot",
    "etsi.org",
    "w3.org/wai/aria/apg",
  ])
    expect(text, closed).not.toContain(closed);
});

test("screens AC-11: no third party's skill set is a source or is named, and the practitioner's page that carries a set's text is the source of at most six rules, each a hypothesis in the crew's own words", () => {
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
  for (const set of SETS) expect(text, set).not.toContain(set);
  const addresses = [
    ...(skill().match(ADDRESS) ?? []),
    ...(repoFile(SOURCES).match(ADDRESS) ?? []),
  ];
  expect(addresses.length).toBeGreaterThan(40);
  // The page's own title stays writable: it is the repository's name that is shut out.
  expect(repoFile(SOURCES)).toContain("Web Interface Guidelines");
  const fromPage = allRows().filter(([, , source]) => source === VERCEL);
  expect(fromPage.length).toBeGreaterThan(0);
  expect(fromPage.length).toBeLessThanOrEqual(6);
  for (const [rule, label] of fromPage) expect(label, rule).toBe("`hypothesis`");
  // The six findings the definition's rows give the page, one row at most for each.
  const findings: RegExp[] = [
    /loading indicator/i,
    /:focus-visible/,
    /\bpaste\b/i,
    /\bsubmit\b/i,
    /\berror/i,
    /16 px/,
  ];
  const matched = fromPage.map(([rule]) => findings.findIndex((f) => f.test(rule ?? "")));
  expect(matched, "a row of the page with none of its six findings").not.toContain(-1);
  // One row at most for a finding.
  expect(new Set(matched).size).toBe(matched.length);
  // None of the page's own phrases, as the research recorded its sentences.
  for (const phrase of [
    "to avoid distracting pointer users",
    "disable paste in",
    "until submission starts",
    "next to their fields",
    "focus the first error",
  ])
    expect(text, phrase).not.toContain(phrase);
});

const CONFLICTS = [
  "Touch target on the web",
  "Focus indicator",
  "Breakpoints",
  "Focus after a failed submit",
];

test("screens AC-12: four conflicts, one line and one default each in its own words, and the contract bounded by the norms, the gates and the standard", () => {
  const lines = sections(skill()).get("Where the sources disagree") ?? [];
  expect(lines.length).toBeGreaterThan(0);
  expect(lines.some((l) => l.startsWith("|"))).toBe(false);
  const items = lines.filter((l) => l.startsWith("- **"));
  const name = (l: string) => /^- \*\*([^*]+)\*\*/.exec(l)?.[1];
  expect(items.map(name)).toEqual(CONFLICTS);
  for (const item of items) expect(item.split("Default:").length - 1, item).toBe(1);
  const line = (title: string) => items.find((l) => l.startsWith(`- **${title}**`)) ?? "";
  const target = line("Touch target on the web");
  expect(target).toMatch(/floor[^.]*24 by 24 CSS px/);
  expect(target).toContain("Default: 24 px, 44 on touch");
  expect(target).toContain("2.5.8");
  expect(target).toContain("`references/frontend.md`");
  const focus = line("Focus indicator");
  expect(focus).toContain(
    "Default: a focus ring from the tokens, never removed without a replacement",
  );
  expect(focus).toContain("`references/frontend.md`");
  const breakpoints = line("Breakpoints");
  expect(breakpoints).toContain("Default: the project's own breakpoints");
  expect(breakpoints).toContain("360, 768 and 1280");
  expect(breakpoints).toContain("`references/frontend.md`");
  const submit = line("Focus after a failed submit");
  expect(submit).toContain("Default: none");
  expect(submit).toContain("the project's direction decides");
  expect(items.filter((l) => l.includes("Default: none")).map(name)).toEqual([
    "Focus after a failed submit",
  ]);
  // The standard holds what the three defaults say it holds.
  const standard = repoFile(STANDARD);
  for (const part of [
    "Targets 24 px, 44 on touch",
    "A focus ring from the tokens, never removed without a replacement",
    "360, 768 and 1280",
  ])
    expect(standard, part).toContain(part);
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

test("screens AC-6: what the team never claims, each on its own line", () => {
  const lines = (sections(skill()).get("What the team never claims") ?? []).filter((l) =>
    l.startsWith("- "),
  );
  expect(lines).toHaveLength(6);
  const claims: RegExp[] = [
    /no violation.*floor.*never proof of accessibility/i,
    /inline validation.*never quoted as a promise/i,
    /vendor's figure.*automated testing.*vendor's/i,
    /one company.*own site.*does not transfer/i,
    /fewer form fields.*not always better/i,
    /no experiment with numbers.*empty states.*progressive disclosure.*onboarding.*skeleton.*hypothesis/i,
  ];
  claims.forEach((claim, i) => {
    expect(lines[i] ?? "", String(claim)).toMatch(claim);
  });
});

test("screens AC-7: the skill and its sources file tell the session nothing to fetch or run", () => {
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

test("screens AC-8: the Strategy skill sends the session to the skill in a step of its own with no address, and the skill names the gate's reference, the crew's own files and that zoom is never disabled", () => {
  const steps = repoFile(STRATEGY)
    .split(/\r?\n/)
    .filter((l) => /^\d+\. /.test(l));
  const own = steps.filter((l) => l.includes("`wizardingcode-frontend-screens`"));
  expect(own).toHaveLength(1);
  const step = own[0] ?? "";
  expect(step).toContain("before the first screen of the change");
  expect(step.match(ADDRESS)).toBeNull();
  expect(step).not.toContain("wizardingcode-frontend-visual-craft");
  // The step of the Visual craft skill stays, before it.
  const craft = steps.findIndex((l) => l.includes("`wizardingcode-frontend-visual-craft`"));
  expect(craft).toBeGreaterThanOrEqual(0);
  expect(steps.indexOf(step)).toBe(craft + 1);
  expect(steps[craft]).toContain("before the direction's tokens and the first interface file");
  const text = skill();
  for (const path of [
    "plugins/core/skills/crew/references/gate.md",
    STANDARD,
    "plugins/core/skills/crew/rubrics/ui-ux.md",
    "packs/frontend/checklists/screen.md",
  ]) {
    expect(text, path).toContain(`\`${path}\``);
    expect(existsSync(join(ROOT, path)), path).toBe(true);
  }
  expect(text).toContain("The team never disables zoom");
});
