// The craft rules a new site is held to (item 2026-10-30-005), each with its planted line and its
// clean counterpart, and the process rules that require what the skills produce.
import { expect, test } from "bun:test";
import { designReasons, readSurface, recordSurface } from "../src/design.ts";
import { lintInterfaceFiles, runDesignLint } from "../src/design-lint.ts";
import { detectProfile } from "../src/detect/index.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { createWork, saveWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

const GUARD = { "src/guard.ts": "export const reduced = useReducedMotion();\n" };

function strict(file: string, line: string) {
  const root = makeRepo({ ...GUARD, [file]: `${line}\n` });
  return lintInterfaceFiles(root, [file], {
    projectFiles: [file, ...Object.keys(GUARD)],
    strict: true,
  });
}
const rules = (r: ReturnType<typeof strict>) => r.hits.map((h) => h.rule);

const ROWS: [string, string, string, string][] = [
  [
    "font/overused",
    "a.css",
    "h1 { font-family: 'Space Grotesk', sans-serif; }",
    "h1 { font-family: 'Canela', serif; }",
  ],
  [
    "font/overused",
    "a.html",
    '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400">',
    '<link href="/fonts/canela.css">',
  ],
  ["font/overused", "a.css", "body { font-family: Fraunces; }", "body { font-family: Tiempos; }"],
  ["colour/ai-palette", "a.css", ".b { color: #6366f1; }", ".b { color: #a02020; }"],
  ["colour/ai-palette", "a.vue", '<a class="bg-indigo-600">x</a>', '<a class="bg-red-800">x</a>'],
  ["colour/ai-palette", "a.css", "body { background: #faf9f5; }", "body { background: #f2f7f2; }"],
  ["label/eyebrow", "a.vue", '<p class="eyebrow">Our way</p>', '<p class="lead">Our way</p>'],
  [
    "label/micro",
    "a.vue",
    '<p class="uppercase tracking-widest text-xs">Our way</p>',
    '<p class="uppercase text-lg">Our way</p>',
  ],
  ["label/numbered", "a.html", "<span>01</span>", "<span>12 loaves</span>"],
  [
    "craft/costume-mono",
    "a.css",
    ".t { font-family: 'JetBrains Mono'; }",
    "pre { font-family: Menlo; }",
  ],
  ["link/dead", "a.html", '<a href="#">Menu</a>', '<a href="/menu">Menu</a>'],
  ["a11y/missing-alt", "a.html", '<img src="/x.png">', '<img src="/x.png" alt="The oven">'],
  [
    "craft/side-border",
    "a.css",
    ".c { border-left: 4px solid red; border-radius: 8px; }",
    ".c { border-radius: 8px; }",
  ],
  [
    "copy/stock-phrase",
    "a.html",
    "<p>Unlock the future of baking</p>",
    "<p>One oven, lit at five</p>",
  ],
  ["copy/generic-action", "a.html", "<a>Learn more</a>", "<a>See the menu</a>"],
  [
    "craft/gradient",
    "a.css",
    ".c { background: linear-gradient(red, blue); }",
    ".c { background: #a02020; }",
  ],
  [
    "craft/resting-shadow",
    "a.css",
    ".c { box-shadow: 0 2px 8px #0002; }",
    ".c { box-shadow: none; }",
  ],
  ["craft/hairline", "a.html", "<hr>", "<br>"],
  ["copy/stock-phrase", "a.html", "<p>Nestled in Alfama</p>", "<p>At Rua das Sete Portas 7</p>"],
  [
    "a11y/no-zoom",
    "a.html",
    '<meta name="viewport" content="width=device-width, user-scalable=no">',
    '<meta name="viewport" content="width=device-width">',
  ],
  ["motion/looping", "a.html", '<i class="animate-pulse"></i>', '<i class="block"></i>'],
];
for (const [rule, file, planted, clean] of ROWS) {
  test(`AC-10: ${rule} hits ${planted.slice(0, 44)} and leaves its counterpart`, () => {
    expect(rules(strict(file, planted))).toContain(rule);
    expect(rules(strict(file, clean))).not.toContain(rule);
  });
}

test("AC-15: a site's reveal may run to 900 ms, an ordinary change stays at 500", () => {
  const line = ".r { transition: transform 700ms; }";
  expect(rules(strict("a.css", line))).not.toContain("motion/duration-over-500");
  expect(rules(strict("a.css", ".r { transition: transform 1000ms; }"))).toContain(
    "motion/duration-over-500",
  );
  const root = makeRepo({ ...GUARD, "a.css": `${line}\n` });
  const loose = lintInterfaceFiles(root, ["a.css"], { projectFiles: ["a.css"] });
  expect(loose.hits.map((h) => h.rule)).toContain("motion/duration-over-500");
});

test("AC-10: the verdicts: the gradient, the shadow, the hairline and the loop advise, the rest are defects", () => {
  const verdict = (file: string, line: string, rule: string) =>
    strict(file, line).hits.find((h) => h.rule === rule)?.verdict;
  expect(verdict("a.css", ".c { background: linear-gradient(red, blue); }", "craft/gradient")).toBe(
    "advisory",
  );
  expect(verdict("a.css", "body { font-family: Inter; }", "font/overused")).toBe("defect");
});

test("AC-10: devices: in DESIGN.md turns a rule off, and without strict none of the craft rules run", () => {
  const contract = "---\ndevices: [overused-font]\n---\n# Design\n";
  const root = makeRepo({
    ...GUARD,
    "a.css": "body { font-family: Inter; }\n",
    "DESIGN.md": contract,
  });
  const off = lintInterfaceFiles(root, ["a.css"], {
    projectFiles: ["a.css"],
    strict: true,
    contract: { colours: false, devices: ["overused-font"] },
    baseDevices: ["overused-font"],
  });
  expect(off.hits.map((h) => h.rule)).not.toContain("font/overused");
  const plain = makeRepo({ ...GUARD, "a.css": "body { font-family: Inter; }\n" });
  const loose = lintInterfaceFiles(plain, ["a.css"], { projectFiles: ["a.css"] });
  expect(loose.hits.map((h) => h.rule)).not.toContain("font/overused");
});

function started(route: "standard" | "fast", type = "feature", files: Record<string, string> = {}) {
  const root = makeRepo({ "package.json": '{"name":"t"}\n', ...GUARD, ...files });
  const env = testEnv();
  const paths = repoPaths(root, env);
  const work = createWork(paths, "a site");
  work.route = route;
  work.type = type as typeof work.type;
  return { root, paths, work };
}
const runLint = (s: ReturnType<typeof started>, files: string[]) =>
  runDesignLint({
    paths: s.paths,
    work: s.work,
    profile: detectProfile(s.root),
    files,
    policy: DEFAULT_POLICY,
    writes: false,
  });

test("AC-4: an interface change on the standard route with no surface fails, and the fast route is extend", () => {
  const a = started("standard", "feature", { "a.css": "a { color: red; }\n" });
  const no = runLint(a, ["a.css"]);
  expect(no.status).toBe("fail");
  expect(no.tail).toContain("process/no-surface");
  const f = started("fast", "feature", { "a.css": "a { color: red; }\n" });
  expect(runLint(f, ["a.css"]).status).toBe("pass");
});

test("AC-4: surface and world name each missing or malformed file, extend needs none", () => {
  const a = started("standard", "feature", { "a.css": "a { color: red; }\n" });
  recordSurface(a.paths, a.work.id, "persuade", "world", "2026-10-30");
  const missing = runLint(a, ["a.css"]);
  expect(missing.status).toBe("fail");
  for (const rule of ["process/brief", "process/direction", "process/copy", "process/deal"])
    expect(missing.tail).toContain(rule);
  write(a.root, `.crew/work/${a.work.id}/design/brief.md`, "## Inventory\n- one\n");
  expect(runLint(a, ["a.css"]).tail).toContain("inventory has 1 lines");
  recordSurface(a.paths, a.work.id, "operate", "extend", "2026-10-30");
  saveWork(a.paths, a.work);
  expect(runLint(a, ["a.css"]).status).toBe("pass");
});

test("AC-4: a world item must have its DESIGN.md by the end", () => {
  const a = started("standard", "feature", { "a.css": "a { color: red; }\n" });
  recordSurface(a.paths, a.work.id, "persuade", "world", "2026-10-30");
  expect(runLint(a, ["a.css"]).tail).toContain("process/design-md");
  write(a.root, "DESIGN.md", "---\ncolors:\n  ink: '#111'\n---\n# D\n");
  expect(runLint(a, ["a.css"]).tail).not.toContain("process/design-md");
});

test("AC-19: a small change inside an established site goes through extend with no brief, no deal and no score", () => {
  const a = started("standard", "feature", {
    "DESIGN.md": "---\ncolors:\n  ink: '#111'\n---\n# D\n",
    "src/Card.vue": "<template><p>Hello</p></template>\n",
  });
  recordSurface(a.paths, a.work.id, "persuade", "extend", "2026-10-30");
  const run = runLint(a, ["src/Card.vue"]);
  expect(run.status).toBe("pass");
  expect(designReasons(readSurface(a.paths, a.work.id), null, "f")).toEqual([]);
});
