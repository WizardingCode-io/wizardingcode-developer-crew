import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { delimiter, join, sep } from "node:path";
import { DETECTOR_CACHE, seedDetectorCache } from "../../../scripts/eval.ts";
import { type CliIo, main } from "../src/cli.ts";
import {
  DETECT_ENV_KEYS,
  DETECT_OUTPUT_MAX,
  DETECT_TIMEOUT_MS,
  DETECTOR_VERSION,
  runDesignDetect,
} from "../src/design-detect.ts";
import { KIND_METRICS } from "../src/design-proof.ts";
import { detectProfile } from "../src/detect/index.ts";
import { plannedGates, runTaskGate } from "../src/gates.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { GATE_NAMES, isBuiltInGate } from "../src/types.ts";
import { createWork } from "../src/work.ts";
import { childEnv, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

/** What the stand-in detector does on its next run. */
interface Behaviour {
  exit: number;
  /** Findings by the index of the file argument they name (`at`), or with a `file` of their own. */
  findings?: Record<string, unknown>[];
  /** Standard output as it is, in the place of the findings. */
  stdout?: string;
  stderr?: string;
  sleepMs?: number;
}
interface Seen {
  cwd: string;
  entries: string[];
  argv: string[];
  env: Record<string, string>;
}

const STAND_IN = `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const b = JSON.parse(fs.readFileSync(path.join(__dirname, "behaviour.json"), "utf8"));
const argv = process.argv.slice(2);
const at = argv.indexOf("--no-config");
const files = at < 0 ? [] : argv.slice(at + 1);
const { env } = process;
fs.writeFileSync(
  path.join(__dirname, "record.json"),
  JSON.stringify({ cwd: process.cwd(), entries: fs.readdirSync(process.cwd()), argv, env }),
);
if (b.stderr) process.stderr.write(b.stderr);
const out =
  b.stdout !== undefined
    ? b.stdout
    : JSON.stringify(
        (b.findings || []).map((f) => ({
          name: "A name",
          description: "DESC-TEXT",
          snippet: "SNIPPET-TEXT",
          category: "slop",
          ...f,
          file: f.file !== undefined ? f.file : files[f.at || 0],
        })),
      );
const end = () => process.stdout.write(out, () => process.exit(b.exit));
b.sleepMs ? setTimeout(end, b.sleepMs) : end();
`;

/** A folder holding a stand-in named `npx`, first on the PATH the gate is given. */
function standIn(behaviour: Behaviour) {
  const bin = tempDir("crew-npx-");
  writeFileSync(join(bin, "npx"), STAND_IN);
  chmodSync(join(bin, "npx"), 0o755);
  const set = (b: Behaviour) => writeFileSync(join(bin, "behaviour.json"), JSON.stringify(b));
  set(behaviour);
  const seen = (): Seen => JSON.parse(readFileSync(join(bin, "record.json"), "utf8"));
  const ran = () => existsSync(join(bin, "record.json"));
  return { bin, set, seen, ran };
}

const warning = (antipattern: string, line: number, at = 0) => ({
  antipattern,
  severity: "warning",
  line,
  at,
});
const advisory = (antipattern: string, at = 0) => ({
  antipattern,
  severity: "advisory",
  line: 1,
  at,
});

/** A project with its files, an item, and the gate's runner over a stand-in detector. */
function project(
  files: Record<string, string>,
  behaviour: Behaviour,
  extraEnv: NodeJS.ProcessEnv = {},
) {
  const root = makeRepo({ "package.json": '{"name":"t"}\n', ...files });
  const npx = standIn(behaviour);
  const env: NodeJS.ProcessEnv = {
    ...testEnv(),
    ...extraEnv,
    PATH: `${npx.bin}${delimiter}${process.env.PATH ?? ""}`,
  };
  const paths = repoPaths(root, env);
  const work = createWork(paths, "a shop");
  const run = (names: string[] = Object.keys(files), timeoutMs?: number) =>
    runDesignDetect({
      paths,
      work,
      files: names,
      env,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
  return { root, paths, work, env, npx, run };
}

/** One started item driven through the CLI in process, its gates over a stand-in detector. */
async function item(files: Record<string, string>, behaviour: Behaviour) {
  const root = makeRepo({ "README.md": "# t\n", "package.json": '{"name":"t"}\n' });
  const npx = standIn(behaviour);
  const env: NodeJS.ProcessEnv = {
    ...testEnv(),
    PATH: `${npx.bin}${delimiter}${process.env.PATH ?? ""}`,
  };
  const run = async (...args: string[]) => {
    const lines: string[] = [];
    const io: CliIo = {
      cwd: root,
      env,
      stdout: (t: string) => void lines.push(t),
      stderr: (t: string) => void lines.push(t),
      stdin: async () => "",
    };
    const code = await main(args, io);
    return { code, text: lines.join("\n") };
  };
  await run("detect");
  const answers = JSON.stringify({
    work_type: "feature",
    is_vague: 0,
    scope: 1,
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra: 0,
    touches_public_api: 0,
  });
  const started = await run("start", "a shop", "--answers", answers, "--criterion", "a", "--json");
  const id = /(\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)/.exec(started.text)?.[1] ?? "";
  for (const [name, text] of Object.entries(files)) write(root, name, text);
  return { run, id, root, env, npx };
}

const CSS = "a { color: red; }\n";
const inside = (folder: string, root: string) => {
  const f = realpathSync(folder);
  const r = realpathSync(root);
  return f === r || f.startsWith(r + sep);
};

test("design-detect AC-14: the gate is planned right after design-lint on every route when an interface file of the change exists, never otherwise, and a todo's gate runs it over the todo's own files", async () => {
  const p = project(
    { "a.css": CSS, "b.css": CSS, "src/a.ts": "export const a = 1;\n" },
    { exit: 0 },
  );
  const profile = detectProfile(p.root);
  expect(GATE_NAMES.indexOf("design-detect")).toBe(GATE_NAMES.indexOf("design-lint") + 1);
  for (const route of ["fast", "standard", "full"] as const) {
    const gates = plannedGates(route, profile, DEFAULT_POLICY, ["a.css"], p.root).map(
      (g) => g.gate,
    );
    expect(gates.indexOf("design-detect")).toBe(gates.indexOf("design-lint") + 1);
    expect(gates.filter((g) => g === "design-detect")).toHaveLength(1);
  }
  const of = (changed: string[]) =>
    plannedGates("standard", profile, DEFAULT_POLICY, changed, p.root).map((g) => g.gate);
  // A deleted interface file still plans the lint, which judges the change, and no detector run.
  expect(of(["gone.css"])).toContain("design-lint");
  expect(of(["gone.css"])).not.toContain("design-detect");
  expect(of(["gone.css", "a.css"])).toContain("design-detect");
  expect(of(["src/a.ts"])).not.toContain("design-detect");
  expect(of(["DESIGN.md"])).not.toContain("design-detect");
  // A todo's gate: the todo's files alone reach the detector.
  p.work.route = "standard";
  const todo = await runTaskGate(p.paths, p.work, profile, DEFAULT_POLICY, ["b.css"], p.env);
  const run = todo.runs.find((r) => r.gate === "design-detect");
  expect(run?.status).toBe("pass");
  const files = p.npx.seen().argv.slice(p.npx.seen().argv.indexOf("--no-config") + 1);
  expect(files).toEqual([join(p.paths.root, "b.css")]);
}, 60_000);

test("design-detect AC-15: the gate is built in: the profile gives it no command, and gate run takes its name", async () => {
  expect(isBuiltInGate("design-detect")).toBe(true);
  const c = await item({ "a.css": CSS }, { exit: 0 });
  const set = await c.run("profile", "set", "design-detect", "true");
  expect(set.code).not.toBe(0);
  expect(set.text).toContain("usage: crew profile set");
  const unset = await c.run("profile", "unset", "design-detect");
  expect(unset.code).not.toBe(0);
  expect(unset.text).toContain("usage: crew profile unset");
  // The same answers the design lint gets.
  expect((await c.run("profile", "set", "design-lint", "true")).text).toBe(set.text);
  const only = await c.run("gate", "run", c.id, "--only", "design-detect");
  expect(only.text).toMatch(/design-detect \(\.\): pass/);
  expect(only.text).not.toMatch(/design-lint \(\.\)/);
  expect(c.npx.ran()).toBe(true);
}, 60_000);

test("design-detect AC-32: the pinned command with the registry on it and absolute paths, in an empty folder outside the project that is gone after, whatever the file names and whatever the project holds", async () => {
  const names = ["a.css", "my page.css", "it's.css", "$(touch pwned).css", "--flag.css"];
  const files = Object.fromEntries(names.map((n) => [n, CSS]));
  const p = project(
    {
      ...files,
      "node_modules/impeccable/package.json": `{"name":"impeccable","version":"${DETECTOR_VERSION}"}\n`,
      ".npmrc": "registry=http://registry.invalid/\n",
      "gone.css.txt": "x\n",
    },
    { exit: 0 },
  );
  const run = await p.run([...names, "gone.css", "src/not-interface.ts"]);
  expect(run.status).toBe("pass");
  const seen = p.npx.seen();
  expect(seen.argv).toEqual([
    "--yes",
    "--prefer-offline",
    "--registry=https://registry.npmjs.org/",
    `impeccable@${DETECTOR_VERSION}`,
    "detect",
    "--json",
    "--no-config",
    ...names.map((n) => join(p.paths.root, n)),
  ]);
  expect(DETECTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  expect(run.command).toContain(`impeccable@${DETECTOR_VERSION} detect --json --no-config`);
  // Nothing a file name says is run: the words above are the files' own, none expanded, and the
  // folder the command ran in held nothing.
  // An empty folder that is neither the root nor under it, and gone after the run.
  expect(seen.entries).toEqual([]);
  expect(existsSync(seen.cwd)).toBe(false);
  expect(seen.cwd).not.toBe(realpathSync(p.root));
  expect(seen.cwd.startsWith(realpathSync(p.root) + sep)).toBe(false);
  // A temporary folder the caller points inside the project is not used.
  mkdirSync(join(p.root, "tmp-in"));
  const q = project({ "a.css": CSS }, { exit: 0 });
  mkdirSync(join(q.root, "tmp-in"));
  q.env.TMPDIR = join(q.root, "tmp-in");
  expect((await q.run()).status).toBe("pass");
  expect(q.npx.seen().cwd.startsWith(realpathSync(q.root))).toBe(false);
  expect(existsSync(q.npx.seen().cwd)).toBe(false);
  // Gone too when the run is unavailable and when it is killed at its bound.
  q.npx.set({ exit: 1, stdout: "[]" });
  expect((await q.run()).status).toBe("unavailable");
  expect(existsSync(q.npx.seen().cwd)).toBe(false);
  q.npx.set({ exit: 0, stdout: "[]", sleepMs: 20_000 });
  expect((await q.run(["a.css"], 2000)).status).toBe("unavailable");
  expect(existsSync(q.npx.seen().cwd)).toBe(false);
  expect(inside(q.npx.seen().cwd.replace(/[^/\\]+$/, ""), q.root)).toBe(false);
}, 60_000);

test("design-detect AC-17: the detector gets a named minimum of the environment, the two variables set over the caller's, and no secret or override of the caller", async () => {
  const p = project(
    { "a.css": CSS },
    { exit: 0 },
    {
      CREW_TEST_MARKER: "marker",
      IMPECCABLE_BIN: "/tmp/other-engine",
      IMPECCABLE_PRO: "on",
      DO_NOT_TRACK: "0",
      npm_config_registry: "http://registry.invalid/",
      WIZARDINGCODE_JEV_API_KEY: "secret",
      GH_TOKEN: "secret",
    },
  );
  expect((await p.run()).status).toBe("pass");
  const env = p.npx.seen().env;
  expect(env.DO_NOT_TRACK).toBe("1");
  expect(env.IMPECCABLE_PRO).toBe("off");
  expect(env.PATH).toBe(p.env.PATH as string);
  expect(env.HOME).toBe(p.env.HOME as string);
  for (const key of [
    "CREW_TEST_MARKER",
    "IMPECCABLE_BIN",
    "npm_config_registry",
    "WIZARDINGCODE_JEV_API_KEY",
    "WIZARDINGCODE_HOME",
    "GH_TOKEN",
  ])
    expect(env[key], key).toBeUndefined();
  // The whole of it: the named minimum, the two variables, and what a shell sets by itself.
  const shellOwn = ["PWD", "OLDPWD", "SHLVL", "_", "__CF_USER_TEXT_ENCODING"];
  const allowed = new Set([...DETECT_ENV_KEYS, "DO_NOT_TRACK", "IMPECCABLE_PRO", ...shellOwn]);
  expect(Object.keys(env).filter((key) => !allowed.has(key))).toEqual([]);
  expect(DETECT_ENV_KEYS).toContain("PATH");
  expect(DETECT_ENV_KEYS).toContain("npm_config_cache");
  expect(DETECT_ENV_KEYS.some((key) => /^IMPECCABLE_|TOKEN|KEY|SECRET/i.test(key))).toBe(false);
}, 60_000);

test("design-detect AC-18: exit 0 with an empty array or advisory findings only is a pass that counts them, whatever standard error holds", async () => {
  const p = project({ "a.css": CSS, "b.css": CSS }, { exit: 0, stdout: "[]" });
  const clean = await p.run();
  expect(clean).toMatchObject({ status: "pass", exit: 0 });
  expect(clean.tail).toBe("no finding in 2 files");
  expect(clean.reason).toBeUndefined();
  p.npx.set({
    exit: 0,
    findings: [advisory("em-dash-overuse"), advisory("em-dash-overuse", 1)],
    stderr: "npm warn exec The following package was not found\nWarning: STDERR-TEXT\n",
  });
  const noted = await p.run();
  expect(noted.status).toBe("pass");
  expect(noted.tail).toBe("no finding in 2 files; 2 advisory findings not listed");
  expect(noted.tail).not.toContain("STDERR-TEXT");
  // Standard output alone is read: the log the gate names holds it, standard error beside it.
  const log = join(p.paths.root, ".crew", "work", p.work.id, noted.log ?? "missing");
  expect(readFileSync(log, "utf8")).toContain("em-dash-overuse");
  expect(readFileSync(log, "utf8")).not.toContain("STDERR-TEXT");
}, 60_000);

test("design-detect AC-19: exit 2 with a finding that is not advisory is a fail that names rule id, path and line, the first ten and the rest counted, and prints nothing else of the detector", async () => {
  const p = project({ "a.css": CSS, "src/pages/home.css": CSS, "b​ad.css": CSS }, { exit: 2 });
  const findings = [
    warning("side-tab", 3),
    { antipattern: "low-contrast", severity: "error", line: 0, at: 1 },
    warning("si‮de\u0007-​t\u0085ab", 7, 2),
    ...Array.from({ length: 9 }, (_, i) => warning("gradient-text", i + 10)),
    advisory("em-dash-overuse"),
  ];
  p.npx.set({ exit: 2, findings, stderr: "Warning: STDERR-TEXT\n" });
  const run = await p.run();
  expect(run).toMatchObject({ status: "fail", exit: 2 });
  const lines = run.tail.split("\n");
  expect(lines.slice(0, 3)).toEqual([
    "side-tab a.css:3",
    "low-contrast src/pages/home.css:0",
    "side-tab bad.css:7",
  ]);
  expect(lines.slice(3, 10)).toEqual(
    Array.from({ length: 7 }, (_, i) => `gradient-text a.css:${i + 10}`),
  );
  expect(lines.slice(10)).toEqual(["+2 more", "1 advisory finding not listed"]);
  for (const text of ["DESC-TEXT", "SNIPPET-TEXT", "A name", "STDERR-TEXT", "em-dash-overuse"])
    expect(run.tail).not.toContain(text);
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the characters that must not be printed
  expect(run.tail).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/);
  // With no text on standard error the answer is the same.
  p.npx.set({ exit: 2, findings: [warning("side-tab", 3)] });
  expect((await p.run()).tail).toBe("side-tab a.css:3");
}, 60_000);

test("design-detect AC-20: an exit the table does not pass, a bound, no npx, an output that cannot be read or that disagrees with the exit each leave the gate unavailable with the engine's own reason alone", async () => {
  expect(DETECT_TIMEOUT_MS).toBe(180_000);
  expect(DETECT_OUTPUT_MAX).toBe(2 * 1024 * 1024);
  const p = project({ "a.css": CSS, "other.css": CSS }, { exit: 0 });
  const other = join(p.paths.root, "other.css");
  const entry = (over: Record<string, unknown>) => [{ ...warning("side-tab", 3), ...over }];
  const cases: [string, Behaviour, RegExp][] = [
    ["exit 1", { exit: 1, stdout: "[]", stderr: "Warning: LEAK\n" }, /exit 1/],
    ["another exit", { exit: 3, stdout: "LEAK" }, /exit 3/],
    ["not JSON", { exit: 0, stdout: "LEAK not json" }, /could not be read/],
    ["not an array", { exit: 0, stdout: '{"LEAK":1}' }, /could not be read/],
    ["over the size", { exit: 0, stdout: `[${" ".repeat(DETECT_OUTPUT_MAX + 16)}]` }, /over 2 MB/],
    ["exit 0 with a finding", { exit: 0, findings: [warning("LEAK", 1)] }, /disagree/],
    ["exit 2 with none", { exit: 2, stdout: "[]" }, /disagree/],
    ["exit 2 with advisory only", { exit: 2, findings: [advisory("LEAK")] }, /disagree/],
    ["an entry that is no object", { exit: 2, stdout: "[1]" }, /could not be read/],
    ["no rule id", { exit: 2, findings: entry({ antipattern: null }) }, /could not be read/],
    ["an empty rule id", { exit: 2, findings: entry({ antipattern: "" }) }, /could not be read/],
    ["no severity", { exit: 2, findings: entry({ severity: null }) }, /could not be read/],
    ["a line as text", { exit: 2, findings: entry({ line: "3" }) }, /could not be read/],
    ["a line with a fraction", { exit: 2, findings: entry({ line: 1.5 }) }, /could not be read/],
    ["a line below 0", { exit: 2, findings: entry({ line: -1 }) }, /could not be read/],
    ["a file outside", { exit: 2, findings: entry({ file: "/etc/LEAK" }) }, /could not be read/],
    ["a file not passed", { exit: 2, findings: entry({ file: other }) }, /could not be read/],
    ["no file", { exit: 2, findings: entry({ file: null }) }, /could not be read/],
  ];
  for (const [name, behaviour, reason] of cases) {
    p.npx.set(behaviour);
    const run = await p.run(["a.css"]);
    expect(run.status, name).toBe("unavailable");
    expect(run.reason ?? "", name).toMatch(reason);
    expect(run.tail, name).toBe(run.reason ?? "");
    expect(run.tail, name).not.toContain("LEAK");
    expect(run.tail.split("\n"), name).toHaveLength(1);
  }
  // The bound: the constant is the gate's, and a run past an injected one is unavailable.
  p.npx.set({ exit: 0, stdout: "[]", sleepMs: 20_000 });
  const late = await p.run(["a.css"], 2000);
  expect(late.status).toBe("unavailable");
  expect(late.reason).toMatch(/did not end in 2 s/);
  // No npx on PATH: nothing runs.
  const q = project({ "a.css": CSS }, { exit: 0 });
  q.env.PATH = tempDir("crew-empty-path-");
  const none = await q.run();
  expect(none).toMatchObject({ status: "unavailable", reason: "npx not on PATH" });
  expect(q.npx.ran()).toBe(false);
}, 120_000);

test("design-detect AC-21: a failing or unavailable gate leaves the item not proven by name, and its skip is refused until allowSkips lists it", async () => {
  const c = await item({ "a.css": CSS }, { exit: 2, findings: [warning("side-tab", 3)] });
  const failed = await c.run("gate", "run", c.id, "--only", "design-detect");
  expect(failed.text).toMatch(/design-detect \(\.\): fail/);
  expect(failed.text).toContain("side-tab a.css:3");
  expect((await c.run("status")).text).toMatch(/Not proven: .*gate design-detect failing/);
  c.npx.set({ exit: 1, stdout: "[]" });
  const unavailable = await c.run("gate", "run", c.id, "--only", "design-detect");
  expect(unavailable.text).toMatch(/design-detect \(\.\): unavailable/);
  expect((await c.run("status")).text).toMatch(
    /Not proven: .*gate design-detect unavailable: exit 1/,
  );
  const refused = await c.run("skip", c.id, "gate:design-detect", "--reason", "noise");
  expect(refused.code).not.toBe(0);
  expect(refused.text).toContain(
    "the team policy does not allow skipping gate:design-detect: gates are mandatory",
  );
  write(c.root, ".crew/policy.json", JSON.stringify({ allowSkips: ["design-detect"] }));
  const skipped = await c.run("skip", c.id, "gate:design-detect", "--reason", "noise");
  expect(skipped.code).toBe(0);
}, 120_000);

test("design-detect AC-24: the evidence path refuses the engine's and git's folders in any case", async () => {
  const c = await item({ "m.md": "2026-11-17, n=100\n" }, { exit: 0 });
  const add = (path: string) =>
    c.run(
      "design",
      c.id,
      "choice",
      "add",
      "a default",
      "--label",
      "measured-here",
      "--evidence",
      path,
    );
  const lower = await add(".git/HEAD");
  expect(lower.code).not.toBe(0);
  for (const path of [".GIT/HEAD", ".Git/HEAD", `.Crew/work/${c.id}/brief.md`, ".CREW/x.md"]) {
    const upper = await add(path);
    expect(upper.code, path).not.toBe(0);
    expect(upper.text, path).toBe(lower.text.replace(".git/HEAD", path));
  }
  expect((await add("m.md")).code).toBe(0);
}, 60_000);

test("design-detect AC-25: kind with no metric is refused with the kind's usual metric, and other names none", async () => {
  const c = await item({}, { exit: 0 });
  const refused = await c.run("design", c.id, "kind", "e-commerce");
  expect(refused.code).not.toBe(0);
  expect(refused.text).toContain(`--metric "${KIND_METRICS["e-commerce"]}"`);
  const brand = await c.run("design", c.id, "kind", "brand");
  expect(brand.text).toContain(`--metric "${KIND_METRICS.brand}"`);
  const other = await c.run("design", c.id, "kind", "other", "--name", "a kiosk");
  expect(other.code).not.toBe(0);
  expect(other.text).toContain("--metric");
  for (const metric of Object.values(KIND_METRICS)) expect(other.text).not.toContain(metric);
  expect((await c.run("design", c.id, "kind", "e-commerce", "--metric", "x")).code).toBe(0);
}, 60_000);

const repoFile = (path: string): string =>
  readFileSync(join(import.meta.dir, "..", "..", "..", path), "utf8");

test("design-detect AC-26: the e-commerce sources carry the carousel article's full title and list no university centre under vendors alone", () => {
  const sources = repoFile("plugins/core/skills/wizardingcode-frontend-ecommerce/sources.md");
  const lines = sources.split(/\r?\n/);
  const carousel = lines.find((l) => l.includes("https://baymard.com/blog/homepage-carousel"));
  expect(carousel).toContain(
    '"10 UX Requirements to Follow for a User-Friendly Homepage Carousel Design"',
  );
  const headings = lines.filter((l) => l.startsWith("## "));
  expect(headings).toContain(
    "## Reports with no stated method and vendors' figures, each a hypothesis in the playbook",
  );
  expect(headings.some((h) => /^## Vendors' figures/.test(h))).toBe(false);
  const spiegel = lines.findIndex((l) => l.includes("spiegel.medill.northwestern.edu"));
  const above = lines.slice(0, spiegel).filter((l) => l.startsWith("## "));
  expect(above.at(-1)).toMatch(/^## Reports with no stated method/);
});

test("design-detect AC-27: the gate reference, the frontend standard and the ledger name the gate with the engine's pinned version", () => {
  const gate = repoFile("plugins/core/skills/crew/references/gate.md");
  const section = gate.slice(gate.indexOf("## The design-detect gate"));
  expect(gate).toContain("## The design-detect gate");
  const command = `npx --yes --prefer-offline --registry=https://registry.npmjs.org/ impeccable@${DETECTOR_VERSION} detect --json --no-config`;
  expect(section).toContain(command);
  for (const part of [
    "pass",
    "fail",
    "unavailable",
    "`DO_NOT_TRACK=1`",
    "`IMPECCABLE_PRO=off`",
    "allowSkips",
    "hooks and its skill are not installed",
  ])
    expect(section).toContain(part);
  const standard = repoFile("plugins/core/skills/crew/references/frontend.md");
  expect(standard).toContain("`design-detect`");
  expect(standard).toContain(`impeccable@${DETECTOR_VERSION}`);
  const versions = [...`${gate}\n${standard}`.matchAll(/impeccable@(\d+\.\d+\.\d+)/g)].map(
    (m) => m[1],
  );
  expect(versions.length).toBeGreaterThan(1);
  expect(new Set(versions)).toEqual(new Set([DETECTOR_VERSION]));
  const ledger = JSON.parse(repoFile("docs/sources/ledger.json")) as {
    rows: { source: string; status: string; file?: string; text?: string; proof?: string }[];
  };
  const row = ledger.rows.find(
    (r) => r.source === "impeccable" && (r.text ?? "").includes(`impeccable@${DETECTOR_VERSION}`),
  );
  expect(row).toMatchObject({
    status: "in",
    file: "plugins/core/skills/crew/references/gate.md",
    proof: "design-detect.test.ts",
  });
});

test("design-detect AC-31: the tests' own PATH starts with a stand-in npx that answers the detector's call alone", () => {
  const first = (process.env.PATH ?? "").split(delimiter)[0] ?? "";
  expect(existsSync(join(first, "npx"))).toBe(true);
  expect(inside(first, join(import.meta.dir, "..", "..", ".."))).toBe(false);
  const call = (...args: string[]) => spawnSync("npx", args, { encoding: "utf8" });
  const detector = call("--yes", `impeccable@${DETECTOR_VERSION}`, "detect", "--json", "x.css");
  expect(detector.status).toBe(0);
  expect(detector.stdout.trim()).toBe("[]");
  const another = call("--yes", "cowsay", "hello");
  expect(another.status).not.toBe(0);
  expect(another.stderr).toContain("the tests' stand-in npx");
});

const DETECTOR_FIXTURE = join(
  import.meta.dir,
  "..",
  "..",
  "..",
  "plugins",
  "core",
  "evals",
  "fixtures",
  "detector.sh",
);

test("design-detect AC-38: the eval runner fetches the pinned detector into its own cache once per version, and says so when it cannot", () => {
  const root = tempDir("crew-seed-");
  const cache = join(root, DETECTOR_CACHE);
  expect(DETECTOR_CACHE).toBe("node_modules/.cache/crew-detector-npm");
  const calls: { command: string; args: string[] }[] = [];
  const options: { cwd?: string; env?: Record<string, string> }[] = [];
  const npm = (status: number) =>
    ((command: string, args: string[], given: { cwd?: string; env?: Record<string, string> }) => {
      calls.push({ command, args });
      options.push({ ...given, cwd: given.cwd });
      if (status === 0) mkdirSync(join(cache, "_cacache"), { recursive: true });
      return { status };
    }) as unknown as typeof spawnSync;
  // A fetch that fails: the line, and no marker, so the next run asks again.
  // The runner's environment holds what the launcher must never get.
  const runner = childEnv({
    CREW_TEST_MARKER: "marker",
    IMPECCABLE_BIN: "/tmp/other-engine",
    IMPECCABLE_PRO: "on",
    npm_config_registry: "http://registry.invalid/",
    ANTHROPIC_API_KEY: "secret",
    GH_TOKEN: "secret",
  });
  runner.WIZARDINGCODE_JEV_API_KEY = "secret";
  const failed = seedDetectorCache(root, npm(1), runner);
  expect(failed).toContain(`impeccable@${DETECTOR_VERSION} could not be fetched`);
  expect(failed).toContain("the design-detect gate will be unavailable in the sandbox");
  expect(seedDetectorCache(root, npm(0), runner)).toBeNull();
  expect(calls).toHaveLength(2);
  expect(calls[1]).toEqual({
    command: "npx",
    args: [
      "--yes",
      "--registry=https://registry.npmjs.org/",
      "--cache",
      cache,
      `impeccable@${DETECTOR_VERSION}`,
      "detect",
      "--list-rules",
      "--quiet",
    ],
  });
  // The launcher's run gets the gate's named minimum and the two variables, and nothing else of
  // the runner's; it runs in a folder that is neither the repository nor under it, gone after.
  const allowed = new Set([...DETECT_ENV_KEYS, "DO_NOT_TRACK", "IMPECCABLE_PRO"]);
  for (const given of options) {
    const env = given.env ?? {};
    expect(Object.keys(env).filter((key) => !allowed.has(key))).toEqual([]);
    expect(env.DO_NOT_TRACK).toBe("1");
    expect(env.IMPECCABLE_PRO).toBe("off");
    expect(env.PATH).toBe(runner.PATH as string);
    for (const key of [
      "CREW_TEST_MARKER",
      "IMPECCABLE_BIN",
      "npm_config_registry",
      "WIZARDINGCODE_JEV_API_KEY",
      "ANTHROPIC_API_KEY",
      "GH_TOKEN",
    ])
      expect(env[key], key).toBeUndefined();
    expect(given.cwd).toBeDefined();
    expect(inside(join(given.cwd ?? root, ".."), root)).toBe(false);
    expect(existsSync(given.cwd ?? root)).toBe(false);
  }
  // The marker names the version, so another version of the detector is fetched again.
  expect(existsSync(join(cache, `seeded-${DETECTOR_VERSION}`))).toBe(true);
  // Once per version: a seeded cache is not asked for again.
  expect(seedDetectorCache(root, npm(0), runner)).toBeNull();
  expect(calls).toHaveLength(2);
  // A cache emptied after the seed is filled again.
  rmSync(join(cache, "_cacache"), { recursive: true, force: true });
  expect(seedDetectorCache(root, npm(0), runner)).toBeNull();
  expect(calls).toHaveLength(3);
});

test("design-detect AC-38: detector.sh fetches nothing, copies the runner's cache into a home with no npm cache, leaves a home that has one, and says so when the repository holds none", () => {
  // No command that reaches a network or installs a package, outside its comments.
  const code = readFileSync(DETECTOR_FIXTURE, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"));
  for (const line of code)
    expect(line).not.toMatch(
      /\bcurl\b|\bwget\b|(?:^|[\s;&|(`$])(?:npm|npx|yarn|pnpm|bunx)\s|\bbun (?:add|install|x)\b|https?:/,
    );
  const run = (repo: string, home: string) =>
    spawnSync("sh", [DETECTOR_FIXTURE], {
      encoding: "utf8",
      env: childEnv({ HOME: home, WIZARDINGCODE_CREW_REPO: repo }),
    });
  const repo = tempDir("crew-detector-repo-");
  write(repo, `${DETECTOR_CACHE}/_cacache/index-v5/aa/entry`, "an entry\n");
  // A home with no npm cache takes the copy.
  const fresh = tempDir("crew-detector-home-");
  const copied = run(repo, fresh);
  expect(copied.status).toBe(0);
  expect(copied.stderr).toBe("");
  expect(readFileSync(join(fresh, ".npm", "_cacache", "index-v5", "aa", "entry"), "utf8")).toBe(
    "an entry\n",
  );
  // A home that has one is a person's: nothing is written into it.
  const owned = tempDir("crew-detector-home-");
  write(owned, ".npm/own", "theirs\n");
  const kept = run(repo, owned);
  expect(kept.status).toBe(0);
  expect(existsSync(join(owned, ".npm", "_cacache"))).toBe(false);
  expect(readFileSync(join(owned, ".npm", "own"), "utf8")).toBe("theirs\n");
  // No cache in the repository: the line, and the fixture goes on.
  const bare = tempDir("crew-detector-repo-");
  const home = tempDir("crew-detector-home-");
  const none = run(bare, home);
  expect(none.status).toBe(0);
  expect(none.stderr).toContain("the design-detect gate will be unavailable");
  expect(existsSync(join(home, ".npm"))).toBe(false);
});
