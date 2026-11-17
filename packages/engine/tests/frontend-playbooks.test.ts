import { expect, test } from "bun:test";
import { KIND_METRICS, type Kind } from "../src/design-proof.ts";
import {
  ADDRESS,
  HEADER,
  listed,
  repoFile,
  rows,
  sections,
  tableHeaders,
  tellsToFetchOrRun,
} from "./frontend-skill-rows.ts";

// The row titles carry the criterion ids of item 2026-11-17-006, which wrote the first four
// playbooks. Item 2026-11-17-007 added the second four under its own ids: its AC-1 is "AC-1", its
// AC-11 (labels) "AC-10", its AC-3 (closed lists) "AC-11", its AC-4 "AC-4", its AC-5 "AC-5" and
// "AC-5b", its AC-6 "AC-6b", its AC-7 "AC-7", its AC-8 (the Strategy step) "AC-13", and its AC-12
// (donations and forms) "AC-12b".
const STRATEGY = "plugins/core/skills/wizardingcode-frontend-strategy/SKILL.md";
const KOHAVI = "https://www.exp-platform.com/Documents/2014%20experimentersRulesOfThumb.pdf";
const UNBOUNCE = "https://unbounce.com/conversion-benchmark-report/";
const NEXTAFTER_NOT_VALID = "https://www.nextafter.com/?p=16052";
const NEXTAFTER_LISTING = "https://www.nextafter.com/research/";
const ABOUT_US = "https://www.nngroup.com/articles/about-us-information-on-websites/";
const QUBIT = "https://www.gwern.net/doc/economics/advertising/2017-browne.pdf";
/**
 * Each playbook: its kind, its fewest rules, and the pages the research's notes mark as opened.
 * `second` marks the four of item 2026-11-17-007, which take two replication phrases where the
 * first four keep the four their own criterion gave them.
 */
const PLAYBOOKS: { kind: Kind; least: number; opened: string[]; second?: true }[] = [
  {
    kind: "info-product",
    least: 8,
    opened: [
      "https://marketingexperiments.com/?p=22175",
      "https://www.nextafter.com/?p=16052",
      "https://www.nextafter.com/?p=19235",
      "https://www.nextafter.com/research/",
      "https://wingify.com/resources/case-studies/sixpackabsexercises-used-videos-increased-conversions/",
      "https://teachable.com/blog/order-bumps-drive-sales",
      "https://www.gwern.net/doc/economics/advertising/2017-browne.pdf",
      KOHAVI,
      "https://www.nngroup.com/articles/about-us-information-on-websites/",
      UNBOUNCE,
    ],
  },
  {
    kind: "saas-marketing",
    least: 3,
    opened: [KOHAVI, "https://stripe.com/guides/state-of-european-checkouts-2022", UNBOUNCE],
  },
  {
    kind: "b2b-lead-gen",
    least: 5,
    opened: [
      "https://www.mida.so/change-types/form",
      "https://ventureharbour.com/how-form-length-impacts-conversion-rates/",
      "https://designnotes.blog.gov.uk/2015/07/03/one-thing-per-page/",
      UNBOUNCE,
    ],
  },
  {
    kind: "product-ui",
    least: 8,
    opened: [
      "https://review.firstround.com/the-tenets-of-a-b-testing-from-duolingos-master-growth-hacker",
      KOHAVI,
      "https://alistapart.com/article/inline-validation-in-web-forms/",
      "https://baymard.com/blog/inline-form-validation",
      "https://baymard.com/blog/mobile-ux-ecommerce",
      "https://homes.cs.washington.edu/~jheer/files/2010-MTurk-CHI.pdf",
      "https://www.perceptualedge.com/blog/?p=2793",
      "https://www.nngroup.com/articles/response-times-3-important-limits/",
    ],
  },
  {
    kind: "institutional",
    least: 6,
    second: true,
    opened: [
      "https://www.gov.uk/guidance/government-design-principles",
      "https://insidegovuk.blog.gov.uk/2017/11/14/using-ab-testing-to-measurably-improve-common-user-journeys/",
      "https://designsystem.digital.gov/design-principles/",
      "https://commission.europa.eu/resources/europa-web-guide/design-content-and-development/design/web-design-principles_en",
      ABOUT_US,
      "https://www.nngroup.com/articles/investor-relations-ir/",
    ],
  },
  {
    kind: "donations",
    least: 5,
    second: true,
    opened: [
      NEXTAFTER_LISTING,
      "https://www.nextafter.com/experiments/how-rolling-out-a-recurring-gift-pop-out-on-all-donation-pages-impacts-donor-conversion/",
      "https://www.nextafter.com/?p=19235",
      NEXTAFTER_NOT_VALID,
      "https://mrbenchmarks.com/website-performance/",
    ],
  },
  {
    kind: "brand",
    least: 3,
    second: true,
    opened: [QUBIT, ABOUT_US, "https://erikrunyon.com/2013/01/carousel-stats/"],
  },
  {
    kind: "content-media",
    least: 3,
    second: true,
    opened: ["https://web.dev/case-studies/vitals-business-impact"],
  },
];
/** The phrases of the second four: what the source reports, or that the notes are silent. */
const REPLICATION_SECOND = ["repeated by", "replication unknown"];
/** Sources that are a `hypothesis` said for what they are, by host: the words the row holds. */
const SAID_AS: [host: string, words: string][] = [
  ["www.gov.uk", "an institution's"],
  ["designsystem.digital.gov", "an institution's"],
  ["commission.europa.eu", "an institution's"],
  ["mrbenchmarks.com", "an observational benchmark"],
  ["erikrunyon.com", "one site's"],
];
const REPLICATION = [
  "repeated by",
  "no replication found",
  "no larger replication found",
  "replication unknown",
];
const VENDORS = [
  "unbounce.com",
  "wingify.com",
  "teachable.com",
  "stripe.com",
  "www.mida.so",
  "web.dev",
];
const COMMANDS =
  /(?:^|[\s`;&|(])(?:npx|npm|pnpm|yarn|bunx|curl|wget|brew|pip|composer)\s|git clone|\binstall\b/m;
const VERBS = /\b(?:open|visit|fetch|download|install|clone|run)\b/i;

const dir = (kind: string) => `plugins/core/skills/wizardingcode-frontend-${kind}`;
const page = (kind: string) => repoFile(`${dir(kind)}/SKILL.md`);
const sourcesOf = (kind: string) => `${dir(kind)}/sources.md`;
const ruleRows = (kind: string) => rows(page(kind).split(/\r?\n/));
const host = (address: string) => address.replace(/^https:\/\//, "").split("/")[0] ?? "";
const section = (kind: string, title: string) => sections(page(kind)).get(title) ?? [];
const every = () =>
  PLAYBOOKS.flatMap(({ kind }) => [page(kind), repoFile(sourcesOf(kind))]).join("\n");

test("playbooks AC-1: eight playbooks, each named after its kind, read after the Strategy skill, with the engine's metric for the kind, rule tables of four columns and its fewest rules", () => {
  for (const { kind, least } of PLAYBOOKS) {
    const text = page(kind);
    expect(text, kind).toMatch(new RegExp(`^---\\nname: wizardingcode-frontend-${kind}\\n`));
    const when = section(kind, "When").join("\n");
    expect(when, kind).toContain(`\`${kind}\``);
    expect(when, kind).toContain("`wizardingcode-frontend-strategy`");
    const metric = section(kind, "The metric").find((l) => l.trim().length > 0) ?? "";
    expect(metric.startsWith(`The primary metric is ${KIND_METRICS[kind]}`), kind).toBe(true);
    const headers = tableHeaders(text.split(/\r?\n/));
    expect(headers.length, kind).toBeGreaterThan(0);
    for (const header of headers) expect(header, kind).toBe(HEADER);
    const own = ruleRows(kind);
    expect(own.length, kind).toBeGreaterThanOrEqual(least);
    for (const row of own) expect(row, kind).toHaveLength(4);
  }
});

test("playbooks AC-10: two labels, each one its source carries: a study with what is known of its replication, a vendor's page, one company's account, a secondary roundup, and the kind of page a finding was measured on", () => {
  const seen = new Set<string>();
  for (const { kind, second } of PLAYBOOKS)
    for (const [rule, label, source, note] of ruleRows(kind)) {
      const at = `${kind}: ${rule}`;
      expect((rule ?? "").length, at).toBeGreaterThan(20);
      expect((note ?? "").length, at).toBeGreaterThan(10);
      const name = (label ?? "").replace(/`/g, "");
      expect(["published-study", "hypothesis"], at).toContain(name);
      const cell = source ?? "";
      expect(cell, at).toMatch(/^https:\/\/\S+$/);
      const line = `${rule} ${note}`;
      if (name === "published-study") {
        const phrases = second ? REPLICATION_SECOND : REPLICATION;
        expect(
          phrases.some((phrase) => (note ?? "").includes(phrase)),
          at,
        ).toBe(true);
        expect(note ?? "", at).not.toMatch(/\bnot repeated\b|nobody (?:has )?repeated/i);
        if (second) expect(note ?? "", at).not.toContain("no replication found");
      }
      const from = host(cell);
      seen.add(from);
      if (VENDORS.includes(from)) {
        expect(name, at).toBe("hypothesis");
        expect(line, at).toContain("a vendor's");
      }
      if (from === "review.firstround.com") {
        expect(name, at).toBe("hypothesis");
        expect(line, at).toContain("one company's account");
      }
      if (from === "ventureharbour.com") {
        expect(name, at).toBe("hypothesis");
        expect(line, at).toContain("a secondary roundup");
      }
      if (from === "www.nextafter.com") expect(note ?? "", at).toContain("donation");
      if (from === "www.gwern.net") expect(note ?? "", at).toContain("retail");
      const said = SAID_AS.find(([of]) => of === from);
      if (said) {
        expect(name, at).toBe("hypothesis");
        expect(line, at).toContain(said[1]);
      }
      // An experiment its own author marked not valid, and a result read at a listing alone.
      if (cell === NEXTAFTER_NOT_VALID) {
        expect(name, at).toBe("hypothesis");
        expect(line, at).toContain("not valid");
      }
      if (cell === NEXTAFTER_LISTING) {
        expect(name, at).toBe("hypothesis");
        expect(line, at).toContain("at its listing");
      }
    }
  // Each kind of source the criterion names has a row: a clause over no row would hold nothing.
  for (const needed of [
    ...VENDORS,
    "review.firstround.com",
    "ventureharbour.com",
    "www.nextafter.com",
    "www.gwern.net",
    ...SAID_AS.map(([of]) => of),
  ])
    expect([...seen], needed).toContain(needed);
});

test("playbooks AC-11: each playbook cites only the pages its closed list holds, its sources file and the skill hold each other, and each says how the pages were read", () => {
  for (const { kind, opened } of PLAYBOOKS) {
    const lines = listed(sourcesOf(kind));
    const cited = new Set(page(kind).match(ADDRESS) ?? []);
    expect(cited.size, kind).toBeGreaterThan(0);
    for (const address of cited) {
      expect(opened, `${kind}: ${address}`).toContain(address);
      const line = lines.get(address);
      expect(line, `${kind}: sources.md lacks ${address}`).toBeDefined();
      expect(line, address).toMatch(/read on \d{4}-\d{2}-\d{2}/);
      expect((line ?? "").split(" · ").length, address).toBeGreaterThanOrEqual(4);
    }
    for (const address of lines.keys())
      expect(cited.has(address), `${kind}: ${address}`).toBe(true);
    const provenance = section(kind, "Provenance").join("\n");
    expect(provenance.split("No figure here comes from a search summary.").length, kind).toBe(2);
    const sources = repoFile(sourcesOf(kind));
    expect(sources, kind).toContain("stay on the machine that made them");
    expect(sources, kind).toContain(
      "through a fetch that returns a model's extraction of the page",
    );
  }
});

test("playbooks AC-4: no third party's skill set is a source or is named", () => {
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
  const text = every().toLowerCase();
  expect(text.length).toBeGreaterThan(10000);
  for (const set of SETS) expect(text, set).not.toContain(set);
});

test("playbooks AC-5: each playbook says what the research did not find, that a choice no row carries is a hypothesis, and that no row is measured here", () => {
  for (const { kind } of PLAYBOOKS) {
    const absent = section(kind, "What the research did not find");
    expect(
      absent.some((l) => l.startsWith("|")),
      kind,
    ).toBe(false);
    expect(absent.filter((l) => l.startsWith("- ")).length, kind).toBeGreaterThanOrEqual(3);
    const how = section(kind, "How to read a row").join("\n");
    expect(how, kind).toContain("A choice no row carries is a `hypothesis`");
    expect(how, kind).toContain("No row is `measured-here`");
    for (const [, label] of ruleRows(kind)) expect(label, kind).not.toContain("measured-here");
  }
});

test("playbooks AC-12: each playbook carries what the definition says of its kind", () => {
  const info = ruleRows("info-product").filter(([rule]) => /three tests of 2004/.test(rule ?? ""));
  expect(info).toHaveLength(1);
  const tests = (info[0] ?? []).join(" ");
  expect(tests).toMatch(/authors themselves say the periods were too short/);
  expect(tests).toContain("both versions lost money");
  const saas = section("saas-marketing", "What the research did not find")
    .filter((l) => l.startsWith("- "))
    .join("\n");
  expect(saas).toMatch(/No published experiment or meta-analysis on pricing-page layout was found/);
  for (const part of ["the number of plans", "a decoy", "a default annual toggle"])
    expect(saas, part).toContain(part);
  expect(saas).toMatch(/such a layout is a hypothesis/);
  expect(saas).toMatch(/No trial figure is given.*rest on search summaries that disagree/);
  const b2b = ruleRows("b2b-lead-gen").map((row) => row.join(" "));
  const base = b2b.filter((row) => row.includes("12% won"));
  expect(base).toHaveLength(1);
  for (const part of ["70% showed no measurable change", "17% lost", "1,420 visitors per variant"])
    expect(base[0] ?? "", part).toContain(part);
  expect(
    b2b.filter((row) => /shorter form can lower the quality of the leads/.test(row)),
  ).toHaveLength(1);
  const metric = section("product-ui", "The metric").join("\n");
  expect(metric).toContain("never page conversion");
  const product = ruleRows("product-ui").map((row) => row.join(" "));
  expect(product.filter((row) => row.includes("0.1% to 1.0%"))).toHaveLength(1);
  const delayed = product.filter(
    (row) => /sign-up/.test(row) && row.includes("review.firstround.com"),
  );
  expect(delayed).toHaveLength(1);
  expect(delayed[0] ?? "").toContain("one company's account");
  expect(delayed[0] ?? "").toContain("no sample sizes or intervals");
});

test("playbooks AC-7: the sixteen files tell the session nothing to fetch or run", () => {
  for (const { kind } of PLAYBOOKS) {
    const text = page(kind);
    expect(tellsToFetchOrRun(text, COMMANDS, VERBS), kind).toEqual([]);
    expect(tellsToFetchOrRun(repoFile(sourcesOf(kind)), COMMANDS, VERBS), kind).toEqual([]);
    const provenance = text
      .split(/\r?\n/)
      .filter((l) =>
        l.includes(
          "The addresses are provenance: they are recorded with a choice and never opened by the session.",
        ),
      );
    expect(provenance, kind).toHaveLength(1);
  }
});

test("playbooks AC-13: the Strategy skill names each playbook for its kind, and each playbook says what it refuses: no leave to build a deceptive pattern, what stays true on a sales page, and no device to bring a person back", () => {
  const steps = repoFile(STRATEGY)
    .split(/\r?\n/)
    .filter((l) => /^\d+\. /.test(l));
  const own = steps.filter((l) => l.includes("**Read the kind's playbook**"));
  expect(own).toHaveLength(1);
  const step = own[0] ?? "";
  for (const kind of ["e-commerce", ...PLAYBOOKS.map((p) => p.kind)]) {
    const name = kind === "e-commerce" ? "ecommerce" : kind;
    expect(step, kind).toContain(`\`wizardingcode-frontend-${name}\` for \`${kind}\``);
  }
  expect(step.match(ADDRESS)).toBeNull();
  for (const other of ["visual-craft", "screens", "engineering", "verification"])
    expect(step, other).not.toContain(`wizardingcode-frontend-${other}`);
  expect(step).toContain("A kind with no playbook yet has only this skill");
  for (const { kind } of PLAYBOOKS) {
    const how = section(kind, "How to read a row").join("\n");
    expect(how, kind).toContain(
      "No row is leave to build what `wizardingcode-frontend-strategy` refuses",
    );
    expect(section(kind, "Done when").join("\n"), kind).toContain(
      "no page of the change holds a deceptive pattern",
    );
  }
  // What stays true on a sales page: one paragraph, the team's own rule and no legal text.
  const stays = section("info-product", "What stays true").filter((l) => l.trim().length > 0);
  expect(stays).toHaveLength(1);
  const paragraph = stays[0] ?? "";
  for (const part of [
    "a deadline shown is a real deadline and a count a real count",
    "a testimonial, a figure of buyers, a client or a result is a real one the seller can show, and none is written by the session",
    "a guarantee is one the seller honours as written",
    "an added offer at the checkout is never selected for the buyer",
    "a request for the opposite of any of these is a blocking objection, as `wizardingcode-frontend-strategy` says, and never a choice with a label",
  ])
    expect(paragraph, part).toContain(part);
  const info = `${page("info-product")}\n${repoFile(sourcesOf("info-product"))}`;
  for (const legal of ["publications.europa.eu", "eur-lex.europa.eu", "ec.europa.eu", "Directive"])
    expect(info, legal).not.toContain(legal);
  // No row of product UI on a device to bring a person back, and the playbook says they are left out.
  for (const row of ruleRows("product-ui"))
    expect(row.join(" ")).not.toMatch(/streak|badge|notification/i);
  const absent = section("product-ui", "What the research did not find").filter((l) =>
    /notifications, streaks and badges/.test(l),
  );
  expect(absent).toHaveLength(1);
  expect(absent[0] ?? "").toContain("left out by the team's rule");
  expect(absent[0] ?? "").toContain("no device to bring a person back more often");
  expect(every()).not.toMatch(/dopamine|neuroscience|addict/i);
});

test("playbooks AC-14: the playbook of B2B lead generation bounds what a form asks, and the SaaS playbook names it for a form", () => {
  const forms = section("b2b-lead-gen", "Forms");
  expect(rows(forms).length).toBeGreaterThan(0);
  const paragraphs = forms.filter((l) => l.includes("no leave to add a field"));
  expect(paragraphs).toHaveLength(1);
  const paragraph = paragraphs[0] ?? "";
  expect(paragraph.startsWith("|")).toBe(false);
  for (const part of [
    "a caution on what a test's goal shows and no leave to add a field",
    "every field a lead form asks has a use the project names, and the person sees why it is asked",
    "nothing about the person is collected that the form does not show them",
    "a change that adds a personal datum to a form is a personal-data change the security review reads",
  ])
    expect(paragraph, part).toContain(part);
  const saas = page("saas-marketing")
    .split(/\r?\n/)
    .filter((l) => l.includes("`wizardingcode-frontend-b2b-lead-gen`"));
  expect(saas).toHaveLength(1);
  expect(saas[0] ?? "").toMatch(/\bform\b/);
});

test("playbooks AC-5b: no rule row of the second four speaks of a streak, a badge or a notification", () => {
  for (const { kind, second } of PLAYBOOKS) {
    if (!second) continue;
    const own = ruleRows(kind);
    expect(own.length, kind).toBeGreaterThan(0);
    for (const row of own) expect(row.join(" "), kind).not.toMatch(/streak|badge|notification/i);
  }
});

test("playbooks AC-6b: each of the second four carries what the definition says of its kind", () => {
  const how = section("institutional", "How to read a row").join("\n");
  expect(how).toContain("qualitative research");
  expect(how).toContain("no measured lift");
  const donations = ruleRows("donations").map((row) => row.join(" "));
  expect(donations.filter((row) => row.includes("3,934 experiments on 2026-11-16"))).toHaveLength(
    1,
  );
  const device = donations.filter((row) => row.includes("52% of traffic"));
  expect(device).toHaveLength(1);
  expect(device[0] ?? "").toContain("72% of revenue");
  const brand = section("brand", "What the research did not find")
    .filter((l) => l.startsWith("- "))
    .join("\n");
  expect(brand).toMatch(
    /No published experiment and no independent benchmark was found for this kind in two rounds/,
  );
  expect(brand).toMatch(/awards, time on site and scroll depth are not outcomes/);
  const media = ruleRows("content-media");
  expect(media.length).toBeGreaterThanOrEqual(3);
  for (const row of media) expect(row.join(" ")).toContain("publishers' own");
  const absent = section("content-media", "What the research did not find")
    .filter((l) => l.startsWith("- "))
    .join("\n");
  expect(absent).toMatch(
    /subscription benchmark is known to the research by a search result alone.*no figure of it is given/,
  );
});

test("playbooks AC-12b: what stays true on a donation page, the prompt for a monthly gift after the decision to give, and each of the second four naming the paragraph on what a form asks", () => {
  const stays = section("donations", "What stays true").filter((l) => l.trim().length > 0);
  expect(stays).toHaveLength(1);
  const paragraph = stays[0] ?? "";
  expect(paragraph.match(ADDRESS)).toBeNull();
  for (const part of [
    "a goal, a deadline, a matching period and a count of donors shown are real ones",
    "the prompt for a monthly gift is asked once, declining it is as easy as accepting it, and the one-off gift then goes through as the donor chose it",
    "nothing that adds to what the donor pays is selected for them, a monthly gift, a larger amount or a sum to cover fees",
    "before the donor confirms a monthly gift the page shows its amount, how often it is charged and how to stop it",
    "a change to how a gift is charged is a payments change the security review reads",
    "a request for the opposite of any of these is a blocking objection, as `wizardingcode-frontend-strategy` says, and never a choice with a label",
  ])
    expect(paragraph, part).toContain(part);
  const prompt = ruleRows("donations").filter(([rule]) => /monthly gift/.test(rule ?? ""));
  expect(prompt).toHaveLength(1);
  expect((prompt[0] ?? []).join(" ")).toContain("after the decision to give");
  for (const { kind, second } of PLAYBOOKS) {
    if (!second) continue;
    const named = page(kind)
      .split(/\r?\n/)
      .filter((l) => l.includes("`wizardingcode-frontend-b2b-lead-gen`"));
    expect(named, kind).toHaveLength(1);
    expect(named[0] ?? "", kind).toMatch(/\bform\b/);
  }
});
