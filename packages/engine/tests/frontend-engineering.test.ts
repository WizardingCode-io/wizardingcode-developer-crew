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
} from "./frontend-skill-rows.ts";

const DIR = "plugins/core/skills/wizardingcode-frontend-engineering";
const SKILL = `${DIR}/SKILL.md`;
const SOURCES = `${DIR}/sources.md`;
const STRATEGY = "plugins/core/skills/wizardingcode-frontend-strategy/SKILL.md";
const SECURITY = "plugins/core/skills/crew/rubrics/security.md";
const SUBJECTS = [
  "Frameworks per stack",
  "CSS and Tailwind",
  "Components and state",
  "Data and rendering",
  "Performance and web vitals",
  "Internationalisation, SEO and security in the browser",
];
const DATED = "as of 2026-11-16";
/** Whose guidance a `platform-guidance` rule is, and the hosts of that owner's pages. */
const OWNERS: [prefix: string, hosts: string[]][] = [
  ["On the web", ["web.dev", "developer.chrome.com"]],
  ["In Next.js", ["nextjs.org"]],
  ["In Tailwind CSS 4", ["tailwindcss.com"]],
  ["In Livewire 4", ["livewire.laravel.com"]],
  ["In Inertia 3", ["inertiajs.com"]],
  ["On Apple's platforms", ["developer.apple.com"]],
];
const RECORDS = ["registry.npmjs.org", "repo.packagist.org", "api.webstatus.dev"];
const VENDOR = ["web.dev/case-studies", "blog.google", "vercel.com/blog"];

const skill = () => repoFile(SKILL);
const allRows = () => SUBJECTS.flatMap((title) => rows(sections(skill()).get(title) ?? []));
const both = () => `${skill()}\n${repoFile(SOURCES)}`;
const host = (address: string) => address.replace(/^https:\/\//, "").split("/")[0] ?? "";

test("engineering AC-1: the skill holds its six subjects, each a rule table with the four columns, at least four rules each and thirty-six in all", () => {
  const text = skill();
  expect(text).toMatch(/^---\nname: wizardingcode-frontend-engineering\n/);
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
  expect(total).toBeGreaterThanOrEqual(36);
  // Every table of the page is a rule table of a subject.
  expect(tableHeaders(text.split(/\r?\n/))).toEqual(SUBJECTS.map(() => HEADER));
});

test("engineering AC-10: two labels, each one its source carries: an owner named on a platform's guidance, a date on a record, the vendor on a vendor's figure, no three-part version anywhere, and the row on Flux", () => {
  const all = allRows();
  expect(all.length).toBeGreaterThan(0);
  const seen = new Set<string>();
  for (const [rule, label, source, note] of all) {
    expect((rule ?? "").length, rule).toBeGreaterThan(20);
    expect((note ?? "").length, rule).toBeGreaterThan(10);
    const name = (label ?? "").replace(/`/g, "");
    expect(["platform-guidance", "hypothesis"], rule).toContain(name);
    seen.add(name);
    const cell = source ?? "";
    const line = `${rule} ${note}`;
    if (cell.startsWith("`")) {
      expect(cell, rule).toMatch(/^`[^`\s]+`$/);
      expect(existsSync(join(ROOT, cell.replace(/`/g, ""))), `${rule}: ${cell}`).toBe(true);
      expect(name, rule).toBe("hypothesis");
      continue;
    }
    expect(cell, rule).toMatch(/^https:\/\/\S+$/);
    const owner = OWNERS.find(([prefix]) => (rule ?? "").startsWith(`${prefix} `));
    const vendor = VENDOR.some((part) => cell.includes(part));
    if (name === "platform-guidance") {
      // Whose guidance it is, and a page of that owner.
      expect(owner, rule).toBeDefined();
      expect(owner?.[1] ?? [], rule).toContain(host(cell));
      expect(vendor, rule).toBe(false);
    }
    if (RECORDS.includes(host(cell))) {
      expect(name, rule).toBe("hypothesis");
      expect(line, rule).toContain(DATED);
    }
    if (vendor) {
      expect(name, rule).toBe("hypothesis");
      expect(line, rule).toContain("a vendor's");
    }
  }
  expect([...seen].sort()).toEqual(["hypothesis", "platform-guidance"]);
  // The versions of that day stay in the definition: none stands in either file.
  for (const fileLine of both().split(/\r?\n/)) {
    expect(fileLine).not.toMatch(/\b\d+\.\d+\.\d+\b/);
    if (/\bBaseline\b/.test(fileLine)) expect(fileLine).toContain(DATED);
  }
  // The row on Flux, in Components and state.
  const components = rows(sections(skill()).get("Components and state") ?? []);
  const flux = components.filter(([rule]) => /\bFlux\b/.test(rule ?? ""));
  expect(flux).toHaveLength(1);
  const [rule, label, source, note] = flux[0] ?? [];
  expect(label).toBe("`hypothesis`");
  expect(source).toBe("https://repo.packagist.org/p2/livewire/flux.json");
  const text = `${rule} ${note}`;
  for (const part of ["proprietary", DATED, "only where the project already holds it"])
    expect(text, part).toContain(part);
});

test("engineering AC-3: the skill's addresses and its sources file hold each other, each line with its date, and nothing the research did not open is an address", () => {
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
  // No line of the sources file for an address the skill does not cite.
  for (const address of lines.keys()) expect(cited.has(address), address).toBe(true);
  // No address pattern: every address names one page or one record.
  expect(both()).not.toMatch(/<id>|features\/<|\{[a-z]+\}/);
  const text = both().toLowerCase();
  for (const closed of [
    "developers.google.com/search",
    "schema.org",
    "vuejs.org",
    "react.dev",
    "laravel.com/docs/13.x/blade",
  ])
    expect(text, closed).not.toContain(closed);
});

test("engineering AC-4: no third party's skill set is a source or is named", () => {
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
});

test("engineering AC-11: dated facts and named packages, seven lines: what the dates are worth, what wins over the page, and what naming a package means", () => {
  const section = sections(skill()).get("Dated facts and named packages") ?? [];
  expect(section.length).toBeGreaterThan(0);
  expect(section.some((l) => l.startsWith("|"))).toBe(false);
  const lines = section.filter((l) => l.startsWith("- "));
  expect(lines).toHaveLength(7);
  const said: RegExp[] = [
    /releases and Baseline statuses.*facts.*as of 2026-11-16/i,
    /lock file.*which major is installed.*before any code is written/i,
    /framework's own documentation at the installed major wins over this page/i,
    /page and the project disagree.*follows the project and says so/i,
    /package named on this page is a fact about it and no recommendation to add it/i,
    /project's own dependencies come first/i,
    /new dependency is a choice the session records.*version its registry gives on the day it is added.*never from this page/i,
  ];
  said.forEach((line, i) => {
    expect(lines[i] ?? "", String(line)).toMatch(line);
  });
});

test("engineering AC-12: what the team never claims, each on its own line", () => {
  const lines = (sections(skill()).get("What the team never claims") ?? []).filter((l) =>
    l.startsWith("- "),
  );
  expect(lines).toHaveLength(6);
  const claims: RegExp[] = [
    /speed.*conversion.*vendor's observational study.*2016 to 2020.*never quoted as a promise/i,
    /INP.*unproven until field data exists.*Total Blocking Time/i,
    /four shares of LCP.*never.*fixed budgets in milliseconds/i,
    /no number.*JavaScript budgets.*`srcset` and `sizes`.*font subsetting.*caching headers.*third-party scripts/i,
    /nothing was read.*SEO guidance.*structured data.*internationalisation practice beyond two facts.*cost of hydration.*hypothesis/i,
    /no rule of its own.*cross-site scripting.*Content Security Policy.*security team's to write/i,
  ];
  claims.forEach((claim, i) => {
    expect(lines[i] ?? "", String(claim)).toMatch(claim);
  });
});

test("engineering AC-7: the skill and its sources file tell the session nothing to fetch or run", () => {
  const text = skill();
  for (const [name, file] of [
    [SKILL, text],
    [SOURCES, repoFile(SOURCES)],
  ] as const) {
    expect(file, name).not.toContain("```");
    expect(file, name).not.toMatch(
      /(?:^|[\s`;&|(])(?:npx|npm|pnpm|yarn|bunx|curl|wget|brew|pip|composer)\s|git clone|\binstall\b|create-next-app/m,
    );
    for (const line of file.split(/\r?\n/))
      if (/https?:\/\//.test(line))
        expect(line, name).not.toMatch(
          /\b(?:open|visit|fetch|download|install|clone|run|browse|go to|see|add)\b/i,
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

test("engineering AC-13: the Strategy skill sends the session to the skill in a step of its own, and the skill names the crew's own files and says where the rules on scripting and policy stand", () => {
  const steps = repoFile(STRATEGY)
    .split(/\r?\n/)
    .filter((l) => /^\d+\. /.test(l));
  const own = steps.filter((l) => l.includes("`wizardingcode-frontend-engineering`"));
  expect(own).toHaveLength(1);
  const step = own[0] ?? "";
  expect(step).toContain("before the first component of the change");
  expect(step.match(ADDRESS)).toBeNull();
  for (const other of ["wizardingcode-frontend-screens", "wizardingcode-frontend-visual-craft"])
    expect(step).not.toContain(other);
  // Right after the step of the Screens skill, which follows the Visual craft skill's.
  const screens = steps.findIndex((l) => l.includes("`wizardingcode-frontend-screens`"));
  expect(screens).toBeGreaterThanOrEqual(0);
  expect(steps.indexOf(step)).toBe(screens + 1);
  expect(steps[screens - 1]).toContain("`wizardingcode-frontend-visual-craft`");
  const text = skill();
  for (const path of [
    "packs/nuxt/knowledge/nuxt.md",
    "packs/next/knowledge/next.md",
    "packs/laravel/knowledge/laravel.md",
    "packs/laravel/checklists/screen.md",
    "packs/frontend/knowledge/frontend.md",
    "plugins/core/skills/crew/references/frontend.md",
    "plugins/core/skills/crew/rubrics/ui-ux.md",
    SECURITY,
  ]) {
    expect(text, path).toContain(`\`${path}\``);
    expect(existsSync(join(ROOT, path)), path).toBe(true);
  }
  // One paragraph under the sixth section, which names the security rubric.
  const sixth = sections(text).get(SUBJECTS[5] ?? "") ?? [];
  const paragraphs = sixth.filter((l) => l.includes(`\`${SECURITY}\``));
  expect(paragraphs).toHaveLength(1);
  const paragraph = paragraphs[0] ?? "";
  for (const part of [
    "cross-site scripting and Content Security Policy are the security team's",
    "yet has a rule that names them",
    "the security team's definition",
    "question on the boundary",
    "writes markup from data it did not build",
    "touches a Content Security Policy",
    "is raised to the security review and is not decided from this page",
  ])
    expect(paragraph, part).toContain(part);
  // The rubric is as the paragraph says: a question on the boundary, and neither subject named.
  const rubric = repoFile(SECURITY);
  expect(rubric).toMatch(/Boundary/);
  expect(rubric).not.toMatch(/cross-site scripting|\bXSS\b|Content Security Policy|\bCSP\b/i);
});
