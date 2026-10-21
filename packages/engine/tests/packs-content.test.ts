import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { detectProfile } from "../src/detect/index.ts";
import { emptyEvidence } from "../src/evidence.ts";
import { runOneGate } from "../src/gates.ts";
import {
  checkPack,
  knowledgeFilesFor,
  listPacks,
  type PackManifest,
  packRules,
  packTemplates,
  readManifest,
  registerPack,
} from "../src/packs.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { scanText } from "../src/secrets.ts";
import { recordTdd } from "../src/tdd.ts";
import { plannedSeats, teamsFor } from "../src/team.ts";
import type { GateName, Policy, Target } from "../src/types.ts";
import { VERSION } from "../src/version.ts";
import { addCriterion, createWork } from "../src/work.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";
import { userDir } from "./pack-fixtures.ts";

// SP6 Task 3: the first two packs are data in this repository; these rows read the real folders.

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const ROOTS = {
  laravel: join(REPO, "packs", "laravel"),
  agentic: join(REPO, "packs", "agentic-os"),
} as const;
const LARAVEL = "wizardingcode-pack-laravel";
const AGENTIC = "wizardingcode-pack-agentic-os";
/** Decision 7's rule, pinned whole. */
const RULE = {
  stack: "laravel",
  extends: "php" as const,
  markers: ["artisan", "composer.json"],
  packageManager: "composer",
  gates: {
    test: "php artisan test",
    lint: "vendor/bin/pint --test",
    typecheck: "vendor/bin/phpstan analyse --no-progress",
  },
  testScoped: "php artisan test {files}",
};
const GLOBS = ["agents/**", "skills/**", "prompts/**", "hooks/**", "**/*.prompt.md", ".claude/**"];
/** Decision 7's template, pinned whole: teams alone, no always, no cap. */
const TEMPLATE = {
  template: "agentic-os",
  teams: { "agentic-os": { mandatory: { kind: "paths" as const, globs: GLOBS } } },
};
const KNOWLEDGE_HEADINGS = [
  "What the model gets wrong",
  "How work is verified",
  "Where the documentation is",
];
const CHECKLIST_HEADINGS = [
  "Assumed by good practice",
  "Decisions only the user can make",
  "Proposals",
  "Warnings",
];
const SOURCES_HEADING = "## Sources read on 2026-10-20";

const read = (path: string) => readFileSync(path, "utf8");
const h2 = (text: string) =>
  text
    .split("\n")
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3).trim());
/** The text under each H2, in order. */
const bodies = (text: string) => text.split(/^## .*$/m).slice(1);
/** Every URL of a text, a trailing sentence mark stripped (the spec's regex). */
const urlsIn = (text: string) =>
  [...text.matchAll(/https?:\/\/[^\s)\]>"'`]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
const filesUnder = (dir: string, base = dir): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? filesUnder(path, base)
      : [relative(base, path).split(sep).join("/")];
  });
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const nextMinor = (v: string) => {
  const [major, minor] = v.split(".").map(Number);
  return `${major}.${(minor ?? 0) + 1}.0`;
};
const manifestOf = (root: string): PackManifest => {
  const out = readManifest(root);
  if ("refused" in out) throw new Error(out.refused);
  return out.manifest;
};
const real = (p: string) => realpathSync(p);

/**
 * The registration at build time (the spec's AC-3 mechanism): the engine is below the packs'
 * `core` until the release, so the rows that need a registration run on a copy of the folder,
 * every file byte for byte and `pack.json`'s `core` alone at the engine's version.
 */
function copyOf(root: string): string {
  const copy = tempDir("pack-copy-");
  cpSync(root, copy, { recursive: true });
  const m = JSON.parse(read(join(copy, "pack.json")));
  m.core = `>=${VERSION}`;
  writeFileSync(join(copy, "pack.json"), `${JSON.stringify(m, null, 2)}\n`);
  for (const rel of filesUnder(root))
    if (rel !== "pack.json") expect(sha(join(copy, rel)), rel).toBe(sha(join(root, rel)));
  expect({ ...manifestOf(copy), core: "" }).toEqual({ ...manifestOf(root), core: "" });
  return copy;
}

function register(dir: string, root: string): string {
  const copy = copyOf(root);
  const out = registerPack(dir, copy, "command");
  if ("refused" in out) throw new Error(out.refused);
  return copy;
}

function expectKnowledgeShape(path: string, title: string) {
  const text = read(path);
  expect(text.split("\n")[0]).toBe(title);
  expect(h2(text)).toEqual(KNOWLEDGE_HEADINGS);
  for (const body of bodies(text)) expect(body.trim().length).toBeGreaterThan(0);
}

function expectChecklistShape(path: string) {
  const text = read(path);
  const lines = text.split("\n");
  expect(lines[0], path).toMatch(/^# \S/);
  const firstH2 = lines.findIndex((l) => l.startsWith("## "));
  expect(firstH2, path).toBeGreaterThan(1);
  expect(
    lines.slice(1, firstH2).some((l) => l.trim() && !l.startsWith("#")),
    path,
  ).toBe(true);
  expect(h2(text), path).toEqual(CHECKLIST_HEADINGS);
  for (const body of bodies(text))
    expect(
      body.split("\n").some((l) => /^- /.test(l)),
      path,
    ).toBe(true);
}

/** The URLs the README lists under its sources heading. */
function sourcesOf(root: string): Set<string> {
  const readme = read(join(root, "README.md"));
  const at = readme.indexOf(SOURCES_HEADING);
  expect(at, "the sources heading").toBeGreaterThan(-1);
  const rest = readme.slice(at + SOURCES_HEADING.length);
  const end = rest.search(/^## /m);
  return new Set(urlsIn(end === -1 ? rest : rest.slice(0, end)));
}

test("SP6-T3 AC-1: the Laravel pack is complete: decision 7's rule and files, the shapes, Verified against, the cases; it registers clean and packRules yields its rule", () => {
  const root = ROOTS.laravel;
  const m = manifestOf(root);
  expect(m.name).toBe(LARAVEL);
  expect(m.kind).toBe("stack");
  expect(m.detectors).toEqual([RULE]);
  expect(m.checklists).toEqual([
    "checklists/eloquent-model.md",
    "checklists/job-or-listener.md",
    "checklists/artisan-command.md",
  ]);
  expect(m.knowledge).toEqual({ laravel: "knowledge/laravel.md" });
  expect(m.team).toBeNull();
  expect(m.evals).toEqual(["pack-laravel-refines-the-gates", "pack-laravel-absent"]);
  expect(m.provenance).toEqual([]);
  const v = m.verifiedAgainst;
  expect(v.laravel).toMatch(/^\d+(\.\d+|\.x)?$/);
  expect(v.pest).toMatch(/^\d+\.x$/);
  expect(v.pint).toMatch(/^\d+\.\d+\.\d+$/);
  expect(v.larastan).toMatch(/^\d+\.\d+\.\d+$/);
  expect(checkPack(root, m, m.version)).toBeNull();
  const plugin = JSON.parse(read(join(root, ".claude-plugin", "plugin.json")));
  expect(plugin.name).toBe(LARAVEL);
  expect(plugin.license).toBe("MIT");
  expect(plugin.author?.name).toBe("WizardingCode");
  expect(plugin.keywords).toContain("pack");
  const readme = read(join(root, "README.md"));
  expect(readme).toContain(
    `Verified against: Laravel ${v.laravel}, Pest ${v.pest}, Pint ${v.pint}, Larastan ${v.larastan}`,
  );
  for (const c of m.evals) expect(readme).toContain(c);
  expect(readme).toContain("crew profile confirm");
  expectKnowledgeShape(join(root, "knowledge", "laravel.md"), `# Laravel ${v.laravel}`);
  for (const rel of m.checklists) expectChecklistShape(join(root, rel));
  const dir = userDir();
  register(dir, root);
  expect(listPacks(dir).map((p) => [p.name, p.state.kind])).toEqual([[LARAVEL, "ok"]]);
  expect(packRules(dir)).toEqual([{ pack: LARAVEL, rule: RULE }]);
  expect(packTemplates(dir)).toEqual([]);
});

test("SP6-T3 AC-2: the agentic-os pack is complete: the template with its six globs and nothing else, the files and shapes, Verified against, the cases; it registers clean, packTemplates yields it, the seat per glob on standard and full, none on fast or src, the expert's file through team.specialists alone", () => {
  const root = ROOTS.agentic;
  const m = manifestOf(root);
  expect(m.name).toBe(AGENTIC);
  expect(m.kind).toBe("team");
  expect(m.detectors).toEqual([]);
  expect(m.checklists).toEqual([
    "checklists/agent.md",
    "checklists/tool.md",
    "checklists/prompt.md",
  ]);
  expect(m.knowledge).toEqual({ agentic: "knowledge/agentic.md" });
  expect(m.team).toEqual(TEMPLATE);
  expect(m.evals).toEqual(["pack-agentic-os-seats-the-team", "pack-agentic-os-absent"]);
  expect(m.provenance).toEqual([]);
  const v = m.verifiedAgainst;
  expect(v["owasp-llm-top-10"]).toMatch(/^\d{4}$/);
  expect(v["claude-code"]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(checkPack(root, m, m.version)).toBeNull();
  const plugin = JSON.parse(read(join(root, ".claude-plugin", "plugin.json")));
  expect(plugin.name).toBe(AGENTIC);
  expect(plugin.license).toBe("MIT");
  expect(plugin.keywords).toContain("pack");
  const readme = read(join(root, "README.md"));
  expect(readme).toContain(
    `Verified against: OWASP Top 10 for LLM Applications ${v["owasp-llm-top-10"]}; Claude Code and Anthropic documentation read on ${v["claude-code"]}`,
  );
  for (const c of m.evals) expect(readme).toContain(c);
  expect(readme).toContain('"template": "agentic-os"');
  expect(readme).toContain(`"specialists": ["${AGENTIC}:agentic"]`);
  expectKnowledgeShape(join(root, "knowledge", "agentic.md"), "# Agentic systems");
  for (const rel of m.checklists) expectChecklistShape(join(root, rel));
  // Registered through the copy: the template served, the seats, the expert's file.
  const env = testEnv();
  const node = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "agents/x.md": "# x",
  });
  const paths = repoPaths(node, env);
  const copy = register(paths.userDir, root);
  expect(listPacks(paths.userDir).map((p) => [p.name, p.state.kind])).toEqual([[AGENTIC, "ok"]]);
  expect(packRules(paths.userDir)).toEqual([]);
  const templates = packTemplates(paths.userDir);
  expect(templates.map((t) => t.pack)).toEqual([AGENTIC]);
  expect(templates.map((t) => t.template)).toEqual([TEMPLATE]);
  const policy: Policy = {
    ...DEFAULT_POLICY,
    team: { ...DEFAULT_POLICY.team, template: "agentic-os" },
  };
  const { teams, warning } = teamsFor(policy, templates);
  expect(warning).toBeNull();
  expect(teams["agentic-os"].mandatory).toMatchObject({ kind: "paths", globs: GLOBS });
  const table: [string, string][] = [
    ["agents/x.md", "agents/**"],
    ["skills/a/SKILL.md", "skills/**"],
    ["prompts/p.txt", "prompts/**"],
    ["hooks/h.json", "hooks/**"],
    ["docs/x.prompt.md", "**/*.prompt.md"],
    [".claude/settings.json", ".claude/**"],
  ];
  const seat = (glob: string) =>
    expect.objectContaining({
      role: "expert",
      team: "agentic-os",
      reason: `pack ${AGENTIC} (${glob})`,
    });
  for (const [path, glob] of table) {
    expect(
      plannedSeats("standard", [], [path], policy, undefined, undefined, teams),
      path,
    ).toContainEqual(seat(glob));
    expect(
      plannedSeats("full", [], [path], policy, undefined, undefined, teams),
      path,
    ).toContainEqual(seat(glob));
  }
  const agentic = (route: "fast" | "standard", changed: string[]) =>
    plannedSeats(route, [], changed, policy, undefined, undefined, teams).filter(
      (s) => s.team === "agentic-os",
    );
  expect(agentic("fast", ["agents/x.md"])).toEqual([]);
  expect(agentic("standard", ["src/x.ts"])).toEqual([]);
  // The expert's file: a team pack has no detector, so team.specialists names it.
  const profile = detectProfile(node, null, packRules(paths.userDir));
  expect(knowledgeFilesFor(paths.userDir, profile, ["agents/x.md"], policy)).toEqual({
    paths: [],
    labels: [],
    packs: [],
    skipped: [],
  });
  const withSpecialists: Policy = {
    ...policy,
    team: { ...policy.team, specialists: [`${AGENTIC}:agentic`] },
  };
  const served = knowledgeFilesFor(paths.userDir, profile, ["agents/x.md"], withSpecialists);
  expect(served.paths.map(real)).toEqual([real(join(copy, "knowledge", "agentic.md"))]);
  expect(served.packs).toEqual([AGENTIC]);
  expect(served.skipped).toEqual([]);
});

/** A Laravel-shaped tree, or the same without `artisan`. */
function laravelTree(withArtisan: boolean): string {
  return makeRepo({
    "composer.json": JSON.stringify({ name: "acme/shop", scripts: { test: "phpunit" } }),
    ...(withArtisan ? { artisan: "#!/usr/bin/env php\n<?php\n" } : {}),
    "phpunit.xml": "<phpunit/>\n",
    "app/Models/User.php": "<?php\nclass User {}\n",
    "tests/Feature/ExampleTest.php": "<?php\n",
  });
}

test("SP6-T3 AC-3: the Laravel rule refines a fixture tree with artisan (the gates and the template proposed with the pack, the tag, the knowledge file served) and leaves a plain PHP tree to the core; the proposed commands are held at the gate run and at crew tdd", async () => {
  const env = testEnv();
  const root = laravelTree(true);
  const paths = repoPaths(root, env);
  const copy = register(paths.userDir, ROOTS.laravel);
  const profile = detectProfile(root, null, packRules(paths.userDir));
  expect(profile.targets).toHaveLength(1);
  const t = profile.targets[0] as Target;
  expect(t.path).toBe(".");
  expect(t.stack).toBe("php");
  expect(t.packageManager).toBe("composer");
  expect(t.tags).toEqual(["laravel"]);
  const proposed = (command: string) => ({ command, source: "proposed" as const, pack: LARAVEL });
  expect(t.gates.test).toEqual(proposed("php artisan test"));
  expect(t.gates.lint).toEqual(proposed("vendor/bin/pint --test"));
  expect(t.gates.typecheck).toEqual(proposed("vendor/bin/phpstan analyse --no-progress"));
  expect(t.testScoped).toEqual(proposed("php artisan test {files}"));
  const served = knowledgeFilesFor(paths.userDir, profile, ["app/Models/User.php"], DEFAULT_POLICY);
  expect(served.paths.map(real)).toEqual([real(join(copy, "knowledge", "laravel.md"))]);
  expect(served.packs).toEqual([LARAVEL]);
  expect(served.skipped).toEqual([]);
  // Without artisan: the core's PHP target, nothing of the pack.
  const plain = laravelTree(false);
  const plainProfile = detectProfile(plain, null, packRules(paths.userDir));
  expect(plainProfile.targets).toHaveLength(1);
  const p = plainProfile.targets[0] as Target;
  expect(p.path).toBe(".");
  expect(p.stack).toBe("php");
  expect(p.tags).toBeUndefined();
  expect(p.gates.test).toEqual({ command: "composer run test", source: "detected" });
  expect(Object.values(p.gates).some((g) => "pack" in g)).toBe(false);
  expect(p.testScoped).toBeUndefined();
  expect(
    knowledgeFilesFor(paths.userDir, plainProfile, ["app/Models/User.php"], DEFAULT_POLICY),
  ).toEqual({ paths: [], labels: [], packs: [], skipped: [] });
  // The hold on the real pack's commands: sentinel commands keep the source and the pack.
  const work = createWork(paths, "fix");
  work.route = "fast";
  const criterion = addCriterion(work, "x");
  write(root, "app/Models/User.php", "<?php\nclass User { public $name; }\n");
  for (const gate of ["test", "lint", "typecheck"] as const) {
    t.gates[gate] = proposed(`touch ${gate}-ran.txt && exit 0`);
  }
  t.testScoped = proposed("touch scoped-ran.txt && exit 0 # {files}");
  const changed = ["app/Models/User.php"];
  for (const gate of ["test", "lint", "typecheck"] as GateName[]) {
    const run = await runOneGate(paths, work, profile, { gate, target: "." }, "fp", changed);
    expect(run.status, gate).toBe("unavailable");
    expect(run.confirmed, gate).toBe(false);
    expect(run.reason, gate).toBe(
      `pack ${LARAVEL}'s command is not confirmed (crew profile confirm ${gate})`,
    );
    expect(existsSync(join(root, `${gate}-ran.txt`)), gate).toBe(false);
  }
  const scoped = await runOneGate(
    paths,
    work,
    profile,
    { gate: "test", target: "." },
    "fp",
    changed,
    changed,
  );
  expect(scoped.status).toBe("unavailable");
  expect(existsSync(join(root, "scoped-ran.txt"))).toBe(false);
  const tdd = await recordTdd(paths, work, emptyEvidence(), profile, criterion.id, "red");
  expect(tdd.ok).toBe(false);
  expect(tdd.message).toBe(
    `pack ${LARAVEL}'s command is not confirmed (crew profile confirm test): pass -- <cmd> to run another`,
  );
  expect(existsSync(join(root, "test-ran.txt"))).toBe(false);
});

test("SP6-T3 AC-4: the packs' versions follow the engine's (the pack's version, plugin.json's, core; accepted at that version, refused at 0.10.0), every URL https and listed in the README's sources, every file scanned for secrets, no stray file, plugin:check validates both packs, the release section names the four files", () => {
  for (const [key, root] of Object.entries(ROOTS)) {
    const m = manifestOf(root);
    expect([VERSION, nextMinor(VERSION)], key).toContain(m.version);
    expect(m.core, key).toBe(`>=${m.version}`);
    const plugin = JSON.parse(read(join(root, ".claude-plugin", "plugin.json")));
    expect(plugin.version, key).toBe(m.version);
    expect(plugin.name, key).toBe(m.name);
    expect(checkPack(root, m, m.version), key).toBeNull();
    expect(checkPack(root, m, "0.10.0"), key).toBe(
      `core ${m.core} needs an engine at or above ${m.version}; this is 0.10.0`,
    );
    // The folder holds the declared files and nothing else.
    const declared = [
      "pack.json",
      ".claude-plugin/plugin.json",
      "README.md",
      ...m.checklists,
      ...Object.values(m.knowledge),
    ].sort();
    expect(filesUnder(root).sort(), key).toEqual(declared);
    // Every URL https and in the sources; every file free of secrets.
    const sources = sourcesOf(root);
    expect(sources.size, key).toBeGreaterThan(0);
    for (const rel of declared) {
      const text = read(join(root, rel));
      expect(scanText(text, rel), rel).toEqual([]);
      for (const url of urlsIn(text)) {
        expect(url, rel).toMatch(/^https:\/\//);
        expect(sources.has(url), `${rel}: ${url} is not in the README's sources`).toBe(true);
        if (url.includes("laravel.com/docs/"))
          expect(url, rel).toContain(`/docs/${m.verifiedAgainst.laravel}/`);
      }
    }
  }
  const pkg = JSON.parse(read(join(REPO, "package.json")));
  expect(pkg.scripts["plugin:check"]).toContain("claude plugin validate packs/laravel --strict");
  expect(pkg.scripts["plugin:check"]).toContain("claude plugin validate packs/agentic-os --strict");
  const claudeMd = read(join(REPO, "CLAUDE.md"));
  for (const rel of [
    "packs/laravel/pack.json",
    "packs/laravel/.claude-plugin/plugin.json",
    "packs/agentic-os/pack.json",
    "packs/agentic-os/.claude-plugin/plugin.json",
  ])
    expect(claudeMd, rel).toContain(rel);
});
