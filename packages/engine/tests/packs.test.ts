import { expect, test } from "bun:test";
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DetectorRule } from "../src/detect/types.ts";
import {
  checkPack,
  discoverPacks,
  knowledgeFilesFor,
  listPacks,
  type PackListing,
  type PackManifest,
  packFiles,
  packRules,
  packTemplates,
  pluginRegistryPath,
  readManifest,
  registerPack,
  removePack,
  stateText,
} from "../src/packs.ts";
import { packPath, packsDir } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Policy, Profile } from "../src/types.ts";
import { VERSION } from "../src/version.ts";
import { makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";
import { manifest, userDir, writePack } from "./pack-fixtures.ts";

const KEY = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");

const refusal = (root: string): string => {
  const read = readManifest(root);
  if ("refused" in read) return read.refused;
  return checkPack(root, read.manifest) ?? "";
};

test("SP6-T2 AC-1: readManifest refuses each field of the wrong shape with one text, and every absolute or climbing path or glob", () => {
  expect(refusal(writePack({}, {}, "{not json"))).toMatch(/^pack\.json: not JSON \(/);
  const cases: [Partial<PackManifest> | Record<string, unknown>, string][] = [
    [
      { name: "laravel" },
      "pack.json: name is not wizardingcode-pack-<name> (lowercase letters, digits and dashes)",
    ],
    [{ version: "1" }, "pack.json: version is not X.Y.Z"],
    [{ kind: "tool" as never }, "pack.json: kind is not stack, domain or team"],
    [{ core: "^0.11" }, "pack.json: core is not of the form >=X.Y.Z"],
    [
      { verifiedAgainst: {} },
      "pack.json: verifiedAgainst needs at least one technology with its version",
    ],
    [{ detectors: {} as never }, "pack.json: detectors is not a list of rules"],
    [
      { detectors: [{ ...manifest().detectors[0], stack: "Laravel 12" }] as never },
      "pack.json: detector Laravel 12: stack is not a lowercase word",
    ],
    [
      { detectors: [{ ...manifest().detectors[0], extends: "laravel" }] as never },
      "pack.json: detector laravel: extends laravel is not a core stack (node, php, python, other)",
    ],
    [
      { detectors: [{ ...manifest().detectors[0], markers: [] }] as never },
      "pack.json: detector laravel: markers is empty",
    ],
    [
      { detectors: [{ ...manifest().detectors[0], packageManager: 3 }] as never },
      "pack.json: detector laravel: packageManager is not a string",
    ],
    [
      { detectors: [{ ...manifest().detectors[0], gates: { test: "" } }] as never },
      "pack.json: detector laravel: the test gate has no command",
    ],
    [
      { detectors: [{ ...manifest().detectors[0], gates: { deploy: "x" } }] as never },
      "pack.json: detector laravel: deploy is not a gate name",
    ],
    [
      { detectors: [{ ...manifest().detectors[0], testScoped: "php artisan test" }] as never },
      "pack.json: detector laravel: testScoped has no {files}",
    ],
    [
      { checklists: ["lists/a.md"] },
      "pack.json: checklists is not a list of checklists/<name>.md paths",
    ],
    [
      { knowledge: { Laravel: "knowledge/laravel.md" } },
      "pack.json: knowledge is not an object of lowercase keys to knowledge/<name>.md paths",
    ],
    [{ team: "core" as never }, "pack.json: team is not null or a template"],
    [
      { team: { template: "My Pack", teams: {} } as never },
      "pack.json: template: template is not a lowercase word",
    ],
    [
      {
        team: {
          template: "x",
          teams: { marketing: { mandatory: { kind: "paths", globs: ["a/**"] } } },
        } as never,
      },
      "pack.json: template: marketing is not a team of the registry",
    ],
    [
      {
        team: {
          template: "x",
          teams: { qa: { mandatory: { kind: "paths", globs: ["a/**"] } } },
        } as never,
      },
      "pack.json: template: qa takes no globs (its rule is always)",
    ],
    [
      { team: { template: "x", teams: {}, maxExperts: 1 } as never },
      "pack.json: template: a template sets no cap, removes no team and seats nothing always (maxExperts)",
    ],
    [
      { team: { template: "x", teams: {}, always: ["etl"] } as never },
      "pack.json: template: a template sets no cap, removes no team and seats nothing always (always)",
    ],
    [
      {
        team: {
          template: "x",
          teams: { "agentic-os": { mandatory: { kind: "paths", globs: [] } } },
        } as never,
      },
      "pack.json: template: agentic-os: globs is empty",
    ],
    [{ evals: "x" as never }, "pack.json: evals is not a list of case names"],
    [
      { provenance: [{ source: "x" }] as never },
      "pack.json: provenance is not a list of { source, licence, commit, measuredBy }",
    ],
    [
      { provenance: [{ source: "ftp://x", licence: "MIT", commit: null, measuredBy: "c" }] },
      "pack.json: provenance: source ftp://x is not an http(s) URL",
    ],
    [
      { detectors: [{ ...manifest().detectors[0], markers: ["../artisan"] }] as never },
      "pack.json: markers holds a path that is absolute or climbs (../artisan)",
    ],
    [
      { checklists: ["checklists/../../x.md"] },
      "pack.json: checklists holds a path that is absolute or climbs (checklists/../../x.md)",
    ],
    [
      { knowledge: { laravel: "/etc/passwd" } },
      "pack.json: knowledge holds a path that is absolute or climbs (/etc/passwd)",
    ],
    [
      {
        team: {
          template: "x",
          teams: { "agentic-os": { mandatory: { kind: "paths", globs: ["../**"] } } },
        } as never,
      },
      "pack.json: globs holds a path that is absolute or climbs (../**)",
    ],
  ];
  for (const [over, text] of cases) {
    expect(refusal(writePack(over as Partial<PackManifest>)), text).toBe(text);
  }
  // A sound manifest reads whole.
  const sound = readManifest(writePack());
  expect("refused" in sound).toBe(false);
});

test("SP6-T2 AC-1: checkPack refuses the core range, a missing or escaping file, a secret in pack.json or a Markdown file, a core-id rule and provenance without its case, and registerPack writes nothing then", () => {
  const dir = userDir();
  const refused = (root: string, text: string) => {
    expect(refusal(root), text).toBe(text);
    const out = registerPack(dir, root, "command");
    expect("refused" in out && out.refused, text).toBe(text);
    expect(readdirSync(packsDir(dir), { recursive: false }).length, text).toBe(0);
  };
  mkdirSync(packsDir(dir), { recursive: true });
  refused(
    writePack({ core: ">=99.0.0" }),
    `core >=99.0.0 needs an engine at or above 99.0.0; this is ${VERSION}`,
  );
  expect(checkPack(writePack({ core: ">=0.1.0" }), manifest({ core: ">=0.1.0" }))).toBeNull();
  refused(
    writePack({ checklists: ["checklists/missing.md"] }),
    "pack.json names checklists/missing.md, which is missing",
  );
  // A knowledge file that is a symlink out of the root: outside the real root.
  const escaping = writePack();
  const outside = join(tempDir("outside-"), "secret.md");
  writeFileSync(outside, "# outside\n");
  rmSync(join(escaping, "knowledge", "laravel.md"));
  symlinkSync(outside, join(escaping, "knowledge", "laravel.md"));
  refused(escaping, "pack.json names knowledge/laravel.md, which is outside the pack's root");
  refused(
    writePack({}, { "knowledge/laravel.md": `# Laravel\n\nkey = "${KEY}"\n` }),
    "knowledge/laravel.md holds a secret (AWS access key) at line 3",
  );
  const laravelRule = manifest().detectors[0] as DetectorRule;
  refused(
    writePack({
      detectors: [{ ...laravelRule, gates: { test: `AWS_KEY=${KEY} php artisan test` } }],
    }),
    "pack.json holds a secret (AWS access key) at line 19",
  );
  const { extends: _core, ...coreNamed } = laravelRule;
  refused(
    writePack({ detectors: [{ ...coreNamed, stack: "node" }] }),
    "detector node: a core stack is not a pack's",
  );
  refused(
    writePack({
      provenance: [
        { source: "https://x.test/skill", licence: "MIT", commit: null, measuredBy: "other-case" },
      ],
    }),
    "folded in without proof: https://x.test/skill names no case of this pack",
  );
  // The same source with its case: taken.
  expect(
    checkPack(
      writePack({
        provenance: [
          {
            source: "https://x.test/skill",
            licence: "MIT",
            commit: null,
            measuredBy: "pack-laravel-refines-the-gates",
          },
        ],
      }),
      manifest({
        provenance: [
          {
            source: "https://x.test/skill",
            licence: "MIT",
            commit: null,
            measuredBy: "pack-laravel-refines-the-gates",
          },
        ],
      }),
    ),
  ).toBeNull();
  // A tightening template: taken.
  const agentic = manifest({
    name: "wizardingcode-pack-agentic-os",
    kind: "team",
    detectors: [],
    team: {
      template: "agentic-os",
      teams: { "agentic-os": { mandatory: { kind: "paths", globs: ["agents/**"] } } },
    },
  });
  expect(checkPack(writePack(agentic), agentic)).toBeNull();
});

test("SP6-T2 AC-2: registerPack writes one file with the hashes under the lock from two CrewPaths of one user directory, rewrites keeping registeredAt, and removePack deletes it", () => {
  const dir = userDir();
  const home = { ...testEnv(), WIZARDINGCODE_HOME: dirname(dir) };
  const shop = repoPaths(makeRepo({ "package.json": "{}" }), home);
  const crm = repoPaths(makeRepo({ "package.json": "{}" }), home);
  const laravel = writePack();
  const agentic = writePack(
    {
      name: "wizardingcode-pack-agentic-os",
      kind: "team",
      detectors: [],
      checklists: ["checklists/agent.md"],
      knowledge: { agentic: "knowledge/agentic.md" },
      team: {
        template: "agentic-os",
        teams: { "agentic-os": { mandatory: { kind: "paths", globs: ["agents/**"] } } },
      },
    },
    { "checklists/agent.md": "# Agent\n", "knowledge/agentic.md": "# Agentic\n" },
  );
  const first = registerPack(shop.userDir, laravel, "command");
  const second = registerPack(
    crm.userDir,
    agentic,
    "discovery",
    "wizardingcode-pack-agentic-os@wizardingcode-plugins",
  );
  if ("refused" in first || "refused" in second) throw new Error("refused");
  expect(first).toMatchObject({
    name: "wizardingcode-pack-laravel",
    version: "0.1.0",
    by: "command",
    key: null,
  });
  expect(first.root).toBe(laravel);
  expect(Object.keys(first.files).sort()).toEqual([
    "checklists/eloquent-model.md",
    "knowledge/laravel.md",
    "pack.json",
  ]);
  for (const hash of Object.values(first.files)) expect(hash).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(second.key).toBe("wizardingcode-pack-agentic-os@wizardingcode-plugins");
  expect(readdirSync(packsDir(dir)).sort()).toEqual([
    "wizardingcode-pack-agentic-os.json",
    "wizardingcode-pack-laravel.json",
  ]);
  expect(JSON.parse(readFileSync(packPath(dir, "wizardingcode-pack-laravel"), "utf8"))).toEqual(
    first,
  );
  // Registered again: registeredAt kept, by as given.
  const again = registerPack(dir, laravel, "discovery", "wizardingcode-pack-laravel@m");
  if ("refused" in again) throw new Error(again.refused);
  expect(again.registeredAt).toBe(first.registeredAt);
  expect(again.by).toBe("discovery");
  expect(removePack(dir, "wizardingcode-pack-laravel")).toEqual({ removed: true });
  expect(removePack(dir, "wizardingcode-pack-laravel")).toEqual({
    refused: "no pack wizardingcode-pack-laravel is registered (crew pack list)",
  });
  expect(readdirSync(packsDir(dir))).toEqual(["wizardingcode-pack-agentic-os.json"]);
});

test("SP6-T2 AC-2: listPacks says each pack's state, packFiles serves ok packs in registration order, packRules and packTemplates read ok packs alone", () => {
  const dir = userDir();
  const laravel = writePack();
  const agentic = writePack(
    {
      name: "wizardingcode-pack-agentic-os",
      kind: "team",
      detectors: [],
      checklists: ["checklists/agent.md", "checklists/eloquent-model.md"],
      knowledge: { agentic: "knowledge/agentic.md", laravel: "knowledge/laravel.md" },
      team: {
        template: "agentic-os",
        teams: { "agentic-os": { mandatory: { kind: "paths", globs: ["agents/**"] } } },
      },
    },
    { "checklists/agent.md": "# Agent\n", "knowledge/agentic.md": "# Agentic\n" },
  );
  const gone = writePack({ name: "wizardingcode-pack-gone" });
  const garbage = writePack({ name: "wizardingcode-pack-garbage" });
  const changed = writePack({ name: "wizardingcode-pack-changed" });
  for (const root of [laravel, agentic, gone, garbage, changed]) {
    const out = registerPack(dir, root, "command");
    if ("refused" in out) throw new Error(out.refused);
  }
  writeFileSync(packPath(dir, "wizardingcode-pack-broken"), "{not json");
  rmSync(gone, { recursive: true });
  writeFileSync(join(garbage, "pack.json"), "{not json");
  writeFileSync(join(changed, "knowledge", "laravel.md"), "# edited\n");
  const listed = listPacks(dir);
  expect(listed.map((p) => [p.name, stateText(p.state)])).toEqual([
    ["wizardingcode-pack-laravel", "ok"],
    ["wizardingcode-pack-agentic-os", "ok"],
    ["wizardingcode-pack-gone", "missing"],
    [
      "wizardingcode-pack-garbage",
      expect.stringMatching(/^unreadable \(pack\.json: not JSON \(.+\)\)$/),
    ],
    ["wizardingcode-pack-changed", "changed since registration (knowledge/laravel.md)"],
    ["wizardingcode-pack-broken", expect.stringMatching(/^unreadable \(.+\)$/)],
  ]);
  expect(packFiles(dir, "checklists", "eloquent-model")).toEqual([
    join(laravel, "checklists", "eloquent-model.md"),
    join(agentic, "checklists", "eloquent-model.md"),
  ]);
  expect(packFiles(dir, "checklists", "agent")).toEqual([join(agentic, "checklists", "agent.md")]);
  expect(packFiles(dir, "knowledge", "laravel")).toEqual([
    join(laravel, "knowledge", "laravel.md"),
    join(agentic, "knowledge", "laravel.md"),
  ]);
  expect(packFiles(dir, "knowledge", "none")).toEqual([]);
  expect(packRules(dir).map((r) => [r.pack, r.rule.stack])).toEqual([
    ["wizardingcode-pack-laravel", "laravel"],
  ]);
  expect(packTemplates(dir).map((t) => [t.pack, t.template.template])).toEqual([
    ["wizardingcode-pack-agentic-os", "agentic-os"],
  ]);
  // A deleted pack.json is missing too.
  rmSync(join(changed, "pack.json"));
  expect(
    stateText(
      (listPacks(dir).find((p) => p.name === "wizardingcode-pack-changed") as PackListing).state,
    ),
  ).toBe("missing");
});

test("SP6-T2 AC-5: knowledgeFilesFor reads the changed files' targets' stacks and tags and the specialists of the right form", () => {
  const dir = userDir();
  const laravel = writePack();
  const agentic = writePack(
    {
      name: "wizardingcode-pack-agentic-os",
      kind: "team",
      detectors: [],
      checklists: ["checklists/agent.md"],
      knowledge: { agentic: "knowledge/agentic.md" },
      team: null,
    },
    { "checklists/agent.md": "# Agent\n", "knowledge/agentic.md": "# Agentic\n" },
  );
  for (const root of [laravel, agentic]) {
    const out = registerPack(dir, root, "command");
    if ("refused" in out) throw new Error(out.refused);
  }
  const profile: Profile = {
    version: 1,
    detectedAt: "2026-10-20T00:00:00.000Z",
    targets: [
      { path: ".", stack: "node", packageManager: "npm", gates: {}, timeoutMs: 1 },
      {
        path: "api",
        stack: "php",
        tags: ["laravel"],
        packageManager: "composer",
        gates: {},
        timeoutMs: 1,
      },
    ],
    watch: { exclude: [] },
  };
  const policy = (specialists: string[]): Policy => ({
    ...DEFAULT_POLICY,
    team: { ...DEFAULT_POLICY.team, specialists },
  });
  // A change under api/: the php target's tag laravel.
  // The labels beside the paths (finding 118): the pack's name and the path inside it, what a
  // report may print without a machine's path.
  expect(knowledgeFilesFor(dir, profile, ["api/app/User.php"], policy([]))).toEqual({
    paths: [join(laravel, "knowledge", "laravel.md")],
    labels: ["wizardingcode-pack-laravel:knowledge/laravel.md"],
    packs: ["wizardingcode-pack-laravel"],
    skipped: [],
  });
  // A change at the root alone: node has no file; nothing.
  expect(knowledgeFilesFor(dir, profile, ["src/a.ts"], policy([])).paths).toEqual([]);
  // No changed file yet: every target.
  expect(knowledgeFilesFor(dir, profile, [], policy([])).paths).toEqual([
    join(laravel, "knowledge", "laravel.md"),
  ]);
  // The specialists: the right form by short and full name, the wrong form, an unregistered pack, a missing key.
  const out = knowledgeFilesFor(
    dir,
    profile,
    ["src/a.ts"],
    policy([
      "agentic-os:agentic",
      "wizardingcode-pack-agentic-os:agentic",
      "agentic",
      "rust:rust",
      "laravel:eloquent",
    ]),
  );
  expect(out.paths).toEqual([join(agentic, "knowledge", "agentic.md")]);
  expect(out.packs).toEqual(["wizardingcode-pack-agentic-os"]);
  expect(out.skipped).toEqual([
    "agentic: not of the form <pack>:<key>",
    "rust:rust: no pack rust is registered",
    "laravel:eloquent: wizardingcode-pack-laravel has no knowledge file eloquent",
  ]);
});

test("SP6-T2 AC-6: discoverPacks reads the plugin registry read-only and fail-open, registers by key and name, skips a hand registration and a mismatch, and removes by key", () => {
  const dir = userDir();
  const home = tempDir("home-");
  const registry = join(home, ".claude", "plugins", "installed_plugins.json");
  mkdirSync(dirname(registry), { recursive: true });
  const env = { HOME: home, CLAUDE_PLUGIN_ROOT: "/x" };
  const write = (plugins: unknown) =>
    writeFileSync(registry, JSON.stringify({ version: 1, plugins }));
  const laravel = writePack();
  const agentic = writePack({
    name: "wizardingcode-pack-agentic-os",
    kind: "team",
    detectors: [],
    team: null,
  });
  const bad = writePack({ name: "wizardingcode-pack-bad", core: ">=99.0.0" });
  const mismatch = writePack({ name: "wizardingcode-pack-other" });
  const empty = tempDir("empty-");
  // No CLAUDE_PLUGIN_ROOT: nothing, whatever the registry.
  write({
    "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: laravel, version: "0.1.0" }],
  });
  expect(discoverPacks(dir, { HOME: home })).toEqual([]);
  expect(listPacks(dir)).toEqual([]);
  // No registry, garbage, no plugins object: nothing.
  rmSync(registry);
  expect(discoverPacks(dir, env)).toEqual([]);
  writeFileSync(registry, "{not json");
  expect(discoverPacks(dir, env)).toEqual([]);
  writeFileSync(registry, JSON.stringify({ version: 1 }));
  expect(discoverPacks(dir, env)).toEqual([]);
  // Four keys: a pack, one without pack.json, one failing a check, a name mismatch; a single object read as a list of one.
  write({
    "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: laravel, version: "0.1.0" }],
    "wizardingcode-pack-empty@m": [{ scope: "user", installPath: empty, version: "0.1.0" }],
    "wizardingcode-pack-bad@m": { scope: "user", installPath: bad, version: "0.1.0" },
    "wizardingcode-pack-mismatch@m": [{ scope: "user", installPath: mismatch, version: "0.1.0" }],
    "wizardingcode-mem@m": [{ scope: "user", installPath: empty, version: "0.5.0" }],
  });
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-laravel 0.1.0 registered (wizardingcode-pack-laravel@m)",
    `wizardingcode-pack-bad@m: core >=99.0.0 needs an engine at or above 99.0.0; this is ${VERSION}`,
    "wizardingcode-pack-mismatch@m: pack.json names wizardingcode-pack-other, not wizardingcode-pack-mismatch",
  ]);
  expect(listPacks(dir).map((p) => [p.name, p.registration?.by, p.registration?.key])).toEqual([
    ["wizardingcode-pack-laravel", "discovery", "wizardingcode-pack-laravel@m"],
  ]);
  // Nothing differs for the registered pack: nothing said of it, nothing rewritten; what still fails is said again.
  const before = readFileSync(packPath(dir, "wizardingcode-pack-laravel"), "utf8");
  expect(discoverPacks(dir, env)).toEqual([
    `wizardingcode-pack-bad@m: core >=99.0.0 needs an engine at or above 99.0.0; this is ${VERSION}`,
    "wizardingcode-pack-mismatch@m: pack.json names wizardingcode-pack-other, not wizardingcode-pack-mismatch",
  ]);
  expect(readFileSync(packPath(dir, "wizardingcode-pack-laravel"), "utf8")).toBe(before);
  // A hand registration of a name the registry also holds: left as it is, said.
  const byHand = registerPack(dir, agentic, "command");
  if ("refused" in byHand) throw new Error(byHand.refused);
  write({
    "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: laravel, version: "0.1.0" }],
    "wizardingcode-pack-agentic-os@m": [{ scope: "user", installPath: agentic, version: "0.1.0" }],
  });
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-agentic-os: registered by hand, left as it is",
  ]);
  expect(
    listPacks(dir).find((p) => p.name === "wizardingcode-pack-agentic-os")?.registration?.by,
  ).toBe("command");
  // The key leaves the registry: the discovery registration goes, the hand one stays.
  write({
    "wizardingcode-pack-agentic-os@m": [{ scope: "user", installPath: agentic, version: "0.1.0" }],
  });
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-agentic-os: registered by hand, left as it is",
    "wizardingcode-pack-laravel removed: wizardingcode-pack-laravel@m is no longer installed",
  ]);
  expect(listPacks(dir).map((p) => p.name)).toEqual(["wizardingcode-pack-agentic-os"]);
  // A valid registry with no pack entries removes every discovery registration; the hand one stays.
  const back = registerPack(dir, laravel, "discovery", "wizardingcode-pack-laravel@m");
  if ("refused" in back) throw new Error(back.refused);
  write({ "wizardingcode-mem@m": [{ scope: "user", installPath: empty, version: "0.5.0" }] });
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-laravel removed: wizardingcode-pack-laravel@m is no longer installed",
  ]);
  expect(listPacks(dir).map((p) => p.name)).toEqual(["wizardingcode-pack-agentic-os"]);
});

test("SP6-T2 AC-2 (round 2): removePack takes a pack name alone, never a path; listPacks never throws on a pack whose file cannot be read", () => {
  const dir = userDir();
  const laravel = writePack();
  const first = registerPack(dir, laravel, "command");
  if ("refused" in first) throw new Error(first.refused);
  // A climbing name would reach the engine's own files beside the packs folder: refused, nothing touched.
  const sibling = join(dirname(packsDir(dir)), "projects.json");
  writeFileSync(sibling, "{}");
  for (const name of [
    "../projects",
    "../integrity/x",
    "laravel",
    "wizardingcode-pack-Laravel",
    "",
  ]) {
    expect(removePack(dir, name), name).toEqual({
      refused: `${name} is not a pack name (wizardingcode-pack-<name>)`,
    });
  }
  expect(readFileSync(sibling, "utf8")).toBe("{}");
  expect(listPacks(dir).map((p) => p.name)).toEqual(["wizardingcode-pack-laravel"]);
  // A named file turned into a directory: the pack is unreadable, nothing throws, nothing is served.
  rmSync(join(laravel, "knowledge", "laravel.md"));
  mkdirSync(join(laravel, "knowledge", "laravel.md"));
  const listed = listPacks(dir);
  expect(listed.map((p) => [p.name, p.state.kind])).toEqual([
    ["wizardingcode-pack-laravel", "unreadable"],
  ]);
  expect(stateText((listed[0] as PackListing).state)).toMatch(/^unreadable \(.*EISDIR.*\)$/);
  expect(packRules(dir)).toEqual([]);
  expect(packFiles(dir, "knowledge", "laravel")).toEqual([]);
});

test("SP6-T2 AC-6 (round 2): discovery refreshes a registration whose version, root or key changed, and a key change never removes the pack in the same run", () => {
  const dir = userDir();
  const home = tempDir("home-");
  const registry = join(home, ".claude", "plugins", "installed_plugins.json");
  mkdirSync(dirname(registry), { recursive: true });
  const env = { HOME: home, CLAUDE_PLUGIN_ROOT: "/x" };
  const write = (plugins: unknown) =>
    writeFileSync(registry, JSON.stringify({ version: 1, plugins }));
  const v1 = writePack();
  write({ "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: v1, version: "0.1.0" }] });
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-laravel 0.1.0 registered (wizardingcode-pack-laravel@m)",
  ]);
  // The same version at a new root: refreshed on the root alone.
  const v2 = writePack();
  write({ "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: v2, version: "0.1.0" }] });
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-laravel 0.1.0 registered (wizardingcode-pack-laravel@m)",
  ]);
  expect(listPacks(dir)[0]?.registration?.root).toBe(v2);
  // A new version at the same root: refreshed on the version alone.
  writeFileSync(join(v2, "pack.json"), JSON.stringify(manifest({ version: "0.2.0" })));
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-laravel 0.2.0 registered (wizardingcode-pack-laravel@m)",
  ]);
  const refreshed = listPacks(dir)[0]?.registration;
  expect(refreshed?.version).toBe("0.2.0");
  expect(refreshed?.root).toBe(v2);
  // The same pack under another marketplace's key: re-registered under the new key, kept, not removed.
  write({
    "wizardingcode-pack-laravel@other": [{ scope: "user", installPath: v2, version: "0.2.0" }],
  });
  expect(discoverPacks(dir, env)).toEqual([
    "wizardingcode-pack-laravel 0.2.0 registered (wizardingcode-pack-laravel@other)",
  ]);
  expect(listPacks(dir).map((p) => [p.name, p.registration?.key])).toEqual([
    ["wizardingcode-pack-laravel", "wizardingcode-pack-laravel@other"],
  ]);
  expect(discoverPacks(dir, env)).toEqual([]);
  // A pack.json that is a symlink out of the root is outside the root too.
  const linked = tempDir("linked-");
  const elsewhere = writePack({ name: "wizardingcode-pack-linked" });
  symlinkSync(join(elsewhere, "pack.json"), join(linked, "pack.json"));
  expect(checkPack(linked, manifest({ name: "wizardingcode-pack-linked" }))).toBe(
    "pack.json names pack.json, which is outside the pack's root",
  );
});

test("SP6-T2 AC-6 (round 3): discovery reads the registry under CLAUDE_CONFIG_DIR when set and under HOME/.claude otherwise", () => {
  const dir = userDir();
  const home = tempDir("home-");
  const config = tempDir("config-");
  const under = (base: string) => join(base, "plugins", "installed_plugins.json");
  expect(pluginRegistryPath({ HOME: home })).toBe(under(join(home, ".claude")));
  expect(pluginRegistryPath({ HOME: home, CLAUDE_CONFIG_DIR: config })).toBe(under(config));
  const laravel = writePack();
  const agentic = writePack({ name: "wizardingcode-pack-agentic-os" });
  const write = (path: string, plugins: unknown) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ version: 1, plugins }));
  };
  write(under(join(home, ".claude")), {
    "wizardingcode-pack-laravel@m": [{ scope: "user", installPath: laravel, version: "0.1.0" }],
  });
  write(under(config), {
    "wizardingcode-pack-agentic-os@m": [{ scope: "user", installPath: agentic, version: "0.1.0" }],
  });
  // With the variable: that configuration's registry alone, HOME's never read.
  expect(
    discoverPacks(dir, { HOME: home, CLAUDE_PLUGIN_ROOT: "/x", CLAUDE_CONFIG_DIR: config }),
  ).toEqual(["wizardingcode-pack-agentic-os 0.1.0 registered (wizardingcode-pack-agentic-os@m)"]);
  expect(listPacks(dir).map((p) => p.name)).toEqual(["wizardingcode-pack-agentic-os"]);
  // Without it: HOME/.claude, whose registry holds the other key, so the first is pruned.
  expect(discoverPacks(dir, { HOME: home, CLAUDE_PLUGIN_ROOT: "/x" })).toEqual([
    "wizardingcode-pack-laravel 0.1.0 registered (wizardingcode-pack-laravel@m)",
    "wizardingcode-pack-agentic-os removed: wizardingcode-pack-agentic-os@m is no longer installed",
  ]);
  expect(listPacks(dir).map((p) => p.name)).toEqual(["wizardingcode-pack-laravel"]);
});
