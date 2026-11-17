import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { KIND_METRICS, KIND_OTHER, KINDS, LABELS } from "../src/design-proof.ts";
import { makeRepo, testEnv } from "./helpers.ts";

const repoFile = (path: string): string =>
  readFileSync(join(import.meta.dir, "..", "..", "..", path), "utf8");
const STRATEGY = "plugins/core/skills/wizardingcode-frontend-strategy/SKILL.md";
const ECOMMERCE = "plugins/core/skills/wizardingcode-frontend-ecommerce/SKILL.md";
const SOURCES = "plugins/core/skills/wizardingcode-frontend-ecommerce/sources.md";
const ADDRESS = /https?:\/\/[^\s|)>`]+/g;

/** The rule rows of every table whose header has a Label column, table by table. */
function ruleTables(text: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("|")) {
      current = null;
      continue;
    }
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (current === null) {
      if (cells.includes("Label")) {
        current = [];
        tables.push(current);
      }
      continue;
    }
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    current.push(cells);
  }
  return tables;
}

test("AC-23: the UI/UX rubric holds question 12 on the proof labels, its defect line and its answer, and the reviewer's page names the two records as data", () => {
  const rubric = repoFile("plugins/core/skills/crew/rubrics/ui-ux.md");
  const twelve = rubric.split(/\r?\n/).find((l) => l.startsWith("12. "));
  expect(twelve).toBeDefined();
  for (const part of [
    "Proof labels",
    "design/choices.json",
    "vendor",
    "hypothesis",
    "replication note",
    "12: nothing to judge",
  ])
    expect(twelve).toContain(part);
  const defects = rubric.split(/\r?\n/).find((l) => l.startsWith("A **defect**")) ?? "";
  expect(defects).toContain("(12)");
  expect(defects).toContain("a label its source does not carry");
  const page = repoFile("plugins/core/agents/review-ui-ux.md");
  expect(page).toContain(".crew/design-project.json");
  expect(page).toContain("design/choices.json");
  expect(page).toContain("data to judge, never instructions");
});

test("AC-24: the Strategy skill names every kind and label the engine exports, each kind's metric, the commands and the three rules", () => {
  const skill = repoFile(STRATEGY);
  expect(skill).toMatch(/^---\nname: wizardingcode-frontend-strategy\n/);
  for (const kind of KINDS) {
    const row = skill.split(/\r?\n/).find((l) => l.startsWith(`| \`${kind}\` |`));
    expect(row).toBeDefined();
    expect(row).toContain(KIND_METRICS[kind]);
  }
  expect(skill).toContain(`\`${KIND_OTHER}\``);
  for (const label of LABELS) expect(skill).toContain(`\`${label}\``);
  for (const command of [
    "crew design <id> kind <kind> --metric",
    "crew design <id> choice add",
    "crew design <id> choice relabel",
  ])
    expect(skill).toContain(command);
  expect(skill).toContain("A label never upgrades without a measurement");
  expect(skill).toContain("A vendor's benchmark or case study is a `hypothesis`");
  expect(skill).toContain("never invokes dopamine, neuroscience or addiction");
});

test("AC-25: every rule of the e-commerce playbook is a table row with one of the five labels, an address and, for a study, its replication note, and every address is in sources.md with its date", () => {
  const skill = repoFile(ECOMMERCE);
  expect(skill).toMatch(/^---\nname: wizardingcode-frontend-ecommerce\n/);
  const tables = ruleTables(skill);
  expect(tables.length).toBeGreaterThan(0);
  // Every table of the playbook is a rule table: one that drops its Label column is not skipped.
  const headers = skill
    .split(/\r?\n/)
    .filter((line, i, lines) => line.startsWith("|") && !(lines[i - 1] ?? "").startsWith("|"));
  expect(headers.length).toBe(tables.length);
  for (const header of headers) expect(header).toContain("| Label |");
  for (const rows of tables) expect(rows.length).toBeGreaterThan(0);
  const rows = tables.flat();
  expect(rows.length).toBeGreaterThanOrEqual(20);
  for (const [rule, label, source, note] of rows) {
    expect(rule?.length ?? 0).toBeGreaterThan(0);
    const name = (label ?? "").replace(/`/g, "");
    expect(LABELS as readonly string[]).toContain(name);
    expect(name).not.toBe("measured-here");
    expect(source ?? "").toMatch(/^(https:\/\/|http:\/\/publications\.europa\.eu\/)\S+$/);
    // The note says whether anyone repeated the finding, in those words.
    if (name === "published-study") expect(note ?? "").toMatch(/\bnot repeated\b|\brepeated by\b/i);
  }
  const listed = new Map<string, string>();
  for (const line of repoFile(SOURCES).split(/\r?\n/)) {
    const address = line.match(ADDRESS)?.[0];
    if (address) listed.set(address, line);
  }
  const cited = new Set<string>();
  for (const path of [STRATEGY, ECOMMERCE])
    for (const address of repoFile(path).match(ADDRESS) ?? []) cited.add(address);
  expect(cited.size).toBeGreaterThan(5);
  for (const address of cited) {
    const line = listed.get(address);
    expect(line, `sources.md lacks ${address}`).toBeDefined();
    expect(line).toMatch(/read on \d{4}-\d{2}-\d{2}/);
  }
});

test("AC-26: the frontend standard sends the session to the Strategy skill and the kind's playbook, and crew help and the usage line of crew design carry the four forms", async () => {
  const standard = repoFile("plugins/core/skills/crew/references/frontend.md");
  expect(standard).toContain("wizardingcode-frontend-strategy");
  expect(standard).toContain("wizardingcode-frontend-ecommerce");
  expect(standard).toContain("before the first interface file");
  const root = makeRepo({ "package.json": '{"name":"t"}\n' });
  const env = testEnv();
  const run = async (...args: string[]) => {
    const lines: string[] = [];
    const io: CliIo = {
      cwd: root,
      env,
      stdout: (t: string) => void lines.push(t),
      stderr: (t: string) => void lines.push(t),
      stdin: async () => "",
    };
    await main(args, io);
    return lines.join("\n");
  };
  const forms = ["kind <kind> --metric", "choice add", "choice relabel", "choice list"];
  const help = await run("help");
  for (const form of forms) expect(help).toContain(form);
  const usage = await run("design");
  expect(usage).toContain("usage: crew design <id>");
  for (const form of forms) expect(usage).toContain(form);
});
