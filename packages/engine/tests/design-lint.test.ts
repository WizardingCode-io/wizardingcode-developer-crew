// The design lint (SP9 Task 6): nine text rules over the changed interface files, the unresolved
// durations, the allowances, the inventory and the file's safety.

import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  LINT_RULES,
  type LintOptions,
  type LintResult,
  lintInterfaceFiles,
  lintVerdict,
  readDesignContract,
  runDesignLint,
} from "../src/design-lint.ts";
import { detectProfile } from "../src/detect/index.ts";
import { DEFAULT_POLICY, loadPolicy } from "../src/policy.ts";
import { GATE_NAMES } from "../src/types.ts";
import { addCriterion, createWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

/** A project file that names the reduced-motion guard, so a rule's fixture is judged for its own rule alone. */
const GUARD = { "src/guard.ts": "export const reduced = useReducedMotion();\n" };

function lint(
  changed: Record<string, string>,
  project: Record<string, string> = GUARD,
  options: LintOptions = {},
): LintResult {
  const root = makeRepo({ ...project, ...changed });
  return lintInterfaceFiles(root, Object.keys(changed), {
    projectFiles: [...Object.keys(project), ...Object.keys(changed)],
    ...options,
  });
}

const hitsOf = (result: LintResult, rule: string): string[] =>
  result.hits.filter((h) => h.rule === rule).map((h) => `${h.file}:${h.line}:${h.verdict}`);

test("SP9-T6 AC-2: motion/transition-all hits transition: all, transition-property: all and the Tailwind class, never a named property", () => {
  const result = lint({
    "src/a.css": [
      ".a { transition: all 200ms ease-out; }",
      ".b { transition: opacity 200ms ease-out; }",
      ".c { transition-property: all; }",
    ].join("\n"),
    "src/b.vue": '<template><div class="transition-all duration-200" /></template>',
  });
  expect(hitsOf(result, "motion/transition-all")).toEqual([
    "src/a.css:1:defect",
    "src/a.css:3:defect",
    "src/b.vue:1:defect",
  ]);
  expect(hitsOf(result, "motion/duration-over-500")).toEqual([]);
  expect(result.files).toEqual(["src/a.css", "src/b.vue"]);
});

test("SP9-T6 AC-2: motion/scale-from-zero hits scale(0), scale3d(0, …) and scaleX(0), and a scale-0 class only beside a transition or animate class", () => {
  const result = lint({
    "src/s.css": [
      ".in { transform: scale(0); }",
      ".ok { transform: scale(0.96); }",
      "@keyframes pop { from { transform: scale3d(0, 0, 1); } to { transform: none; } }",
      ".x { transform: scaleX(0); }",
      ".y { transform: scaleY(0); }",
      ".z { transform: scale(0.0); }",
    ].join("\n"),
    "src/s.vue": [
      '<div class="scale-0" />',
      '<div class="transition scale-0" />',
      '<div class="animate-pop scale-0" />',
    ].join("\n"),
  });
  expect(hitsOf(result, "motion/scale-from-zero")).toEqual([
    "src/s.css:1:defect",
    "src/s.css:3:defect",
    "src/s.css:4:defect",
    "src/s.css:5:defect",
    "src/s.css:6:defect",
    "src/s.vue:2:defect",
    "src/s.vue:3:defect",
  ]);
});

test("SP9-T6 AC-2: motion/layout-property hits a transition on a layout property and a layout declaration inside @keyframes, never border-width, max-width, background-color or a width outside a block", () => {
  const result = lint({
    "src/l.css": [
      ".a { transition: width 200ms; }",
      ".b { transition: border-width 200ms; }",
      ".c { transition: max-width 200ms; }",
      ".d { transition: background-color 200ms; }",
      ".e { transition-property: margin-top, opacity; }",
      "@keyframes grow { from { height: 0; } to { height: 10px; } }",
      "@keyframes slide {",
      "  from { top: 0; }",
      "}",
      ".f { width: 10px; }",
      ".g { transition: padding 200ms; }",
      ".h { transition: bottom 200ms; }",
      ".i { transition: right 200ms; }",
    ].join("\n"),
  });
  expect(hitsOf(result, "motion/layout-property")).toEqual([
    "src/l.css:1:defect",
    "src/l.css:5:defect",
    "src/l.css:6:defect",
    "src/l.css:8:defect",
    "src/l.css:11:defect",
    "src/l.css:12:defect",
    "src/l.css:13:defect",
  ]);
});

test("SP9-T6 AC-2: motion/duration-over-500 hits a literal over 500 ms in a transition or animation value and a duration-N class over 500, never 500ms, 0.5s or duration-500", () => {
  const result = lint({
    "src/d.css": [
      ".a { transition: opacity 0.6s; }",
      ".b { transition: opacity 750ms ease; }",
      ".c { transition: opacity 500ms; }",
      ".d { transition: opacity 0.5s; }",
      ".e { animation: spin 1s linear infinite; }",
      ".f { animation-duration: 300ms; }",
      ".g { transition-duration: 2s; }",
    ].join("\n"),
    "src/d.vue": ['<div class="duration-500" />', '<div class="duration-700" />'].join("\n"),
  });
  expect(hitsOf(result, "motion/duration-over-500")).toEqual([
    "src/d.css:1:defect",
    "src/d.css:2:defect",
    "src/d.css:5:defect",
    "src/d.css:7:defect",
    "src/d.vue:2:defect",
  ]);
  expect(result.unresolved).toEqual([]);
});

test("SP9-T6 AC-2: motion/reduced-motion-missing hits once when the change adds motion and no project file names a guard; a guard anywhere, in the change too, or a change with no motion, is clean", () => {
  const transition = {
    "src/m.vue": '<template><Transition name="fade"><p /></Transition></template>',
  };
  const none = {};
  expect(hitsOf(lint(transition, none), "motion/reduced-motion-missing")).toEqual([
    "src/m.vue:1:defect",
  ]);
  // Two motion lines, one hit, on the first.
  const two = {
    "src/m.css": ".a { animation: spin 1s linear; }\n.b { transition: opacity 200ms; }",
  };
  expect(hitsOf(lint(two, none), "motion/reduced-motion-missing")).toEqual(["src/m.css:1:defect"]);
  const guards: Record<string, string>[] = [
    { "src/app.css": "@media (prefers-reduced-motion: reduce) { * { animation: none; } }" },
    GUARD,
    { "src/x.ts": "const { reducedMotion } = settings;" },
    { "src/y.vue": '<div class="motion-reduce:transition-none" />' },
  ];
  for (const guard of guards)
    expect(hitsOf(lint(transition, guard), "motion/reduced-motion-missing")).toEqual([]);
  // The rule disabled by the policy: the hit is kept as disabled and judged by nobody.
  expect(
    hitsOf(
      lint(transition, none, { disabled: ["motion/reduced-motion-missing"] }),
      "motion/reduced-motion-missing",
    ),
  ).toEqual(["src/m.vue:1:disabled"]);
  // The guard in the changed file itself.
  const own = {
    "src/m2.vue":
      '<template><Transition name="fade"><p /></Transition></template>\n<style>@media (prefers-reduced-motion: reduce) { .fade-enter-active { transition: none; } }</style>',
  };
  expect(hitsOf(lint(own, none), "motion/reduced-motion-missing")).toEqual([]);
  expect(
    hitsOf(lint({ "src/plain.css": ".a { color: red; }" }, none), "motion/reduced-motion-missing"),
  ).toEqual([]);
});

test("SP9-T6 AC-2: tokens/raw-colour hits a raw colour literal only when the contract declares colours; var() is never one; readDesignContract reads the frontmatter", () => {
  const files = {
    "src/c.css": [
      ".a { color: #fff; }",
      ".b { color: rgb(0, 0, 0); }",
      ".c { color: var(--color-danger); }",
      ".d { background: hsla(0, 0%, 0%, 0.5); }",
      ".e { color: rgba(0, 0, 0, 0.5); }",
      ".f { color: hsl(0 0% 0%); }",
      ".g { color: #11223344; }",
    ].join("\n"),
  };
  expect(hitsOf(lint(files, GUARD, { contract: null }), "tokens/raw-colour")).toEqual([]);
  expect(hitsOf(lint(files, GUARD, { contract: { colours: true } }), "tokens/raw-colour")).toEqual([
    "src/c.css:1:defect",
    "src/c.css:2:defect",
    "src/c.css:4:defect",
    "src/c.css:5:defect",
    "src/c.css:6:defect",
    "src/c.css:7:defect",
  ]);
  expect(hitsOf(lint(files, GUARD, { contract: { colours: false } }), "tokens/raw-colour")).toEqual(
    [],
  );
  const withColours = makeRepo({
    "DESIGN.md": "---\ncolors:\n  primary: '#0f0'\n---\n# Design\n",
  });
  // 2026-10-29-001 edits these two lines: the contract also says the devices it adopts.
  expect(readDesignContract(withColours)).toEqual({ colours: true, devices: [] });
  const underDocs = makeRepo({ "docs/DESIGN.md": "---\ntypography:\n  base: 16\n---\n" });
  expect(readDesignContract(underDocs)).toEqual({ colours: false, devices: [] });
  expect(readDesignContract(makeRepo({ "README.md": "x" }))).toBeNull();
  // A linked contract is no contract.
  const linked = makeRepo({ "README.md": "x" });
  const outside = tempDir();
  writeFileSync(join(outside, "DESIGN.md"), "---\ncolors: {}\n---\n");
  symlinkSync(join(outside, "DESIGN.md"), join(linked, "DESIGN.md"));
  expect(readDesignContract(linked)).toBeNull();
});

test("SP9-T6 AC-3: the advisories (ease-in, an unguarded :hover once per file, a third will-change) hit as advisory and never fail the run", () => {
  const result = lint({
    "src/e.css": [
      ".a { transition: opacity 200ms ease-in; }",
      ".b { transition: opacity 200ms ease-in-out; }",
    ].join("\n"),
    "src/e.vue": '<div class="ease-in duration-200" />',
    "src/h.css": ".a:hover { color: red; }\n.b:hover { color: blue; }",
    "src/h2.css": "@media (hover: hover) { .a:hover { color: red; } }",
    "src/h3.css": "@media (hover:hover) { .b:hover { color: red; } }",
    "src/h.vue": '<div class="hover:bg-x" />',
    "src/w.css": ".a { will-change: transform; }\n.b { will-change: opacity; }",
    "src/w2.css":
      ".a { will-change: transform; }\n.b { will-change: opacity; }\n.c { will-change: transform; }",
  });
  expect(hitsOf(result, "motion/ease-in")).toEqual([
    "src/e.css:1:advisory",
    "src/e.vue:1:advisory",
  ]);
  expect(hitsOf(result, "hover/unguarded")).toEqual(["src/h.css:1:advisory"]);
  expect(hitsOf(result, "perf/will-change")).toEqual(["src/w2.css:3:advisory"]);
  expect(result.hits.every((h) => h.verdict === "advisory")).toBe(true);
  const verdict = lintVerdict(result);
  expect(verdict.status).toBe("pass");
  expect(verdict.reason).toBeNull();
  expect(verdict.tail.split("\n")).toEqual([
    "advisory: motion/ease-in src/e.css:1",
    "advisory: motion/ease-in src/e.vue:1",
    "advisory: hover/unguarded src/h.css:1",
    "advisory: perf/will-change src/w2.css:3",
    "unresolved: 0",
    "inventory: 2 animated declarations (review/design-lint.json)",
  ]);
});

test("SP9-T6 AC-4: a duration value holding var(), $name, @name, theme(), calc() or env() and no literal is unresolved and never judged; a literal is judged; a value with neither is nothing", () => {
  const result = lint({
    "src/u.css": [
      ".a { transition: opacity var(--slow); }",
      ".b { transition-duration: $duration; }",
      ".c { animation-duration: theme(--d); }",
      ".d { transition: opacity 200ms var(--ease); }",
      ".e { transition: opacity ease-out; }",
      ".f { transition: none; }",
      ".g { transition: transform; }",
      ".h { transition: opacity 900ms var(--ease); }",
      ".i { transition: opacity @slow; }",
      ".j { transition-duration: calc(var(--a) * 2); }",
      ".k { animation-duration: env(--d); }",
    ].join("\n"),
  });
  expect(result.unresolved.map((u) => `${u.file}:${u.line}`)).toEqual([
    "src/u.css:1",
    "src/u.css:2",
    "src/u.css:3",
    "src/u.css:9",
    "src/u.css:10",
    "src/u.css:11",
  ]);
  expect(hitsOf(result, "motion/duration-over-500")).toEqual(["src/u.css:8:defect"]);
  expect(lintVerdict(result).tail).toContain("unresolved: 6");
});

test("SP9-T6 AC-6: a disabled rule keeps its hits as disabled and an unknown id is named; an inline allowance on the line or the line above allows that one hit with its why; no why, another rule or two lines above allow nothing; another rule's defect still fails", () => {
  const file = [
    ".a { transition: all 200ms; }",
    "/* crew-lint: allow motion/duration-over-500 -- the hero's reveal, once */",
    ".b { transition: opacity 900ms; }",
    ".c { transition: opacity 900ms; } /* crew-lint: allow motion/duration-over-500 -- same line */",
    "/* crew-lint: allow motion/duration-over-500 -- too far */",
    ".gap { color: red; }",
    ".d { transition: opacity 900ms; }",
    "/* crew-lint: allow motion/duration-over-500 */",
    ".e { transition: opacity 900ms; }",
    "/* crew-lint: allow motion/ease-in -- x */",
    ".f { transition: opacity 900ms; }",
  ].join("\n");
  const result = lint({ "src/p.css": file }, GUARD, {
    disabled: ["motion/transition-all", "nope"],
  });
  expect(hitsOf(result, "motion/transition-all")).toEqual(["src/p.css:1:disabled"]);
  expect(result.unknownDisabled).toEqual(["nope"]);
  expect(result.disabled).toEqual(["motion/transition-all"]);
  expect(
    result.hits
      .filter((h) => h.rule === "motion/duration-over-500")
      .map((h) => `${h.line}:${h.verdict}:${h.allowed ?? "-"}`),
  ).toEqual([
    "3:defect:the hero's reveal, once",
    "4:defect:same line",
    "7:defect:-",
    "9:defect:-",
    "11:defect:-",
  ]);
  const verdict = lintVerdict(result);
  expect(verdict.status).toBe("fail");
  expect(verdict.reason).toBe("motion/duration-over-500 src/p.css:7, +2 more");
  expect(verdict.tail.split("\n")).toEqual([
    "motion/duration-over-500 src/p.css:7",
    "motion/duration-over-500 src/p.css:9",
    "motion/duration-over-500 src/p.css:11",
    "allowed: motion/duration-over-500 src/p.css:3 (the hero's reveal, once)",
    "allowed: motion/duration-over-500 src/p.css:4 (same line)",
    "rules disabled by policy: motion/transition-all",
    "disabled: motion/transition-all src/p.css:1",
    "unknown rule in ui.lint.disabled: nope",
    "unresolved: 0",
    "inventory: 6 animated declarations (review/design-lint.json)",
  ]);
  // With the disabled rule's hit and an allowed hit alone, the run passes.
  const clean = lint(
    { "src/q.css": `.a { transition: all 200ms; }\n${file.split("\n").slice(1, 3).join("\n")}` },
    GUARD,
    { disabled: ["motion/transition-all"] },
  );
  expect(lintVerdict(clean).status).toBe("pass");
  // The policy's list loads strings alone; a non-array or an absent block is empty.
  const paths = repoPaths(makeRepo(), testEnv());
  mkdirSync(paths.crewDir, { recursive: true });
  const policyFile = join(paths.crewDir, "policy.json");
  expect(loadPolicy(paths).policy.ui.lint.disabled).toEqual([]);
  writeFileSync(
    policyFile,
    JSON.stringify({ ui: { lint: { disabled: ["motion/ease-in", 3, null] } } }),
  );
  expect(loadPolicy(paths).policy.ui.lint.disabled).toEqual(["motion/ease-in"]);
  writeFileSync(policyFile, JSON.stringify({ ui: { lint: { disabled: "x" } } }));
  expect(loadPolicy(paths).policy.ui.lint.disabled).toEqual([]);
});

test("SP9-T6 AC-7: the inventory lists every animated declaration with its kind, property, duration and easing; a linked or climbing path is skipped with none of its text kept; every string is one safe line", () => {
  const result = lint({
    "src/i.vue": [
      "<template>",
      '  <Transition name="fade"><div /></Transition>',
      '  <motion.div :animate="{ x: 1 }" />',
      "</template>",
      "<script setup>",
      "el.animate([{ opacity: 0 }, { opacity: 1 }], 300)",
      "</script>",
      "<style>",
      ".a { transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1); }",
      ".b { animation: spin 1s linear infinite; }",
      "</style>",
    ].join("\n"),
  });
  expect(result.inventory).toEqual([
    {
      file: "src/i.vue",
      line: 2,
      kind: "vue-transition",
      property: "fade",
      durationMs: null,
      easing: null,
    },
    { file: "src/i.vue", line: 3, kind: "motion", property: null, durationMs: null, easing: null },
    { file: "src/i.vue", line: 6, kind: "waapi", property: null, durationMs: null, easing: null },
    {
      file: "src/i.vue",
      line: 9,
      kind: "transition",
      property: "transform",
      durationMs: 250,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    },
    {
      file: "src/i.vue",
      line: 10,
      kind: "animation",
      property: "spin",
      durationMs: 1000,
      easing: "linear",
    },
  ]);
  // A changed path that is a symlink to an outside file, and one that climbs: skipped, nothing read.
  const root = makeRepo(GUARD);
  const outside = tempDir();
  writeFileSync(join(outside, "secret.css"), ".a { transition: all 200ms; } SECRET-TEXT\n");
  mkdirSync(join(root, "src"), { recursive: true });
  symlinkSync(join(outside, "secret.css"), join(root, "src", "x.css"));
  const skipped = lintInterfaceFiles(root, ["src/x.css", "../outside.css", "src/guard.ts"], {
    projectFiles: ["src/guard.ts"],
  });
  expect(skipped.skipped).toEqual(["../outside.css", "src/x.css"]);
  expect(skipped.files).toEqual([]);
  expect(skipped.hits).toEqual([]);
  expect(JSON.stringify(skipped)).not.toContain("SECRET-TEXT");
  expect(lintVerdict(skipped).tail).toContain("skipped: ../outside.css, src/x.css");
  // Over the cap, a NUL byte and an absolute path: skipped as well, nothing of them read.
  writeFileSync(
    join(root, "src", "big.css"),
    `.a { transition: all 200ms; }\n${"/* p */".repeat(150000)}`,
  );
  writeFileSync(join(root, "src", "bin.css"), Buffer.from([0x2e, 0x61, 0x00, 0x7d]));
  const absolute = join(outside, "secret.css");
  const more = lintInterfaceFiles(root, ["src/big.css", "src/bin.css", absolute], {
    projectFiles: [],
  });
  expect(more.skipped).toEqual([absolute, "src/big.css", "src/bin.css"].sort());
  expect(more.files).toEqual([]);
  expect(more.hits).toEqual([]);
  // A control character in a line and a why with a carriage return and 300 characters: one clean line each, cut at 120.
  const why = `${"w".repeat(290)}\rmore`;
  const unsafe = lint({
    "src/z.css": [
      `/* crew-lint: allow motion/duration-over-500 -- ${why} */`,
      ".a { transition: opacity 900ms; } \u001b[31m",
      ".b { transition: all 200ms; } \u001b[31m",
    ].join("\n"),
  });
  const allowed = unsafe.hits.find((h) => h.allowed !== null);
  expect(allowed?.allowed).toBe(`${"w".repeat(119)}…`);
  expect(allowed?.text).not.toContain("\u001b");
  expect(allowed?.text.length).toBeLessThanOrEqual(120);
  const defect = unsafe.hits.find((h) => h.rule === "motion/transition-all");
  expect(defect?.text).toBe(".b { transition: all 200ms; } [31m");
  expect(lintVerdict(unsafe).tail).not.toContain("\u001b");
  expect(lintVerdict(unsafe).tail).not.toContain("\n\n");
  // A 300-character line is cut to 120 as the why is; an unknown id with a control character is one safe id.
  const long = lint({
    "src/long.css": `.a { transition: all 200ms; } /* ${"x".repeat(300)} */`,
  });
  expect(long.hits[0]?.text.length).toBe(120);
  expect(long.hits[0]?.text.endsWith("…")).toBe(true);
  const odd = lint({ "src/o.css": ".a { color: red; }" }, GUARD, { disabled: ["no\u001bpe"] });
  expect(odd.unknownDisabled).toEqual(["nope"]);
  // A changed path carrying a control character: `files` and the hit's file are one safe name.
  const named = lint({ "src/e\u001bx.css": ".a { transition: all 200ms; }" });
  expect(named.files).toEqual(["src/ex.css"]);
  expect(named.hits.map((h) => h.file)).toEqual(["src/ex.css"]);
  expect(JSON.stringify(named)).not.toContain("\u001b");
  // The rule ids are the nine, and the gate's name sits right after secrets.
  expect(LINT_RULES).toEqual([
    "motion/transition-all",
    "motion/scale-from-zero",
    "motion/layout-property",
    "motion/duration-over-500",
    "motion/ease-in",
    "motion/reduced-motion-missing",
    "hover/unguarded",
    "perf/will-change",
    "tokens/raw-colour",
    // 2026-10-29-001 edits this list: the five craft rules.
    "craft/gradient-text",
    "craft/emoji",
    "copy/placeholder",
    "craft/glass",
    "layout/100vh",
  ]);
  // 2026-10-29-001: the prose scan sits between them.
  expect(GATE_NAMES.indexOf("design-lint")).toBe(GATE_NAMES.indexOf("prose") + 1);
  expect(GATE_NAMES.indexOf("prose")).toBe(GATE_NAMES.indexOf("secrets") + 1);
  expect(GATE_NAMES.at(-1)).toBe("e2e");
});

test("2026-10-29-001 AC-4: the five craft rules hit their refused strings with their severities, stay silent on the accepted ones, turn off for a DESIGN.md that declares the device and never for prose that names it, are allowed inline, and copy/placeholder never reads a test file", () => {
  const refused: [string, string, string][] = [
    ["craft/gradient-text", "src/a.css", ".h { background-clip: text; }"],
    ["craft/gradient-text", "src/a.css", ".h { -webkit-background-clip: text; }"],
    ["craft/gradient-text", "src/A.vue", '<h1 class="bg-clip-text text-transparent">Hi</h1>'],
    ["craft/emoji", "src/A.vue", "<p>Ready 🚀</p>"],
    ["craft/emoji", "src/A.tsx", "const label = 'Done ✅';"],
    ["copy/placeholder", "src/A.vue", "<p>Lorem ipsum dolor sit amet</p>"],
    ["copy/placeholder", "src/A.vue", "<p>Signed by John Doe</p>"],
    ["copy/placeholder", "src/A.vue", "<p>Jane Doe, admin</p>"],
    ["copy/placeholder", "src/A.vue", "<p>Acme ships today</p>"],
    ["copy/placeholder", "src/A.tsx", "const mail = 'ana@example.com';"],
    ["copy/placeholder", "src/A.tsx", "const url = 'https://example.com/a';"],
    ["craft/glass", "src/a.css", ".nav { backdrop-filter: blur(8px); }"],
    ["craft/glass", "src/A.vue", '<nav class="backdrop-blur-md">x</nav>'],
    ["layout/100vh", "src/a.css", ".hero { height: 100vh; }"],
    ["layout/100vh", "src/A.vue", '<div class="h-screen">x</div>'],
    ["layout/100vh", "src/A.vue", '<div class="min-h-screen">x</div>'],
  ];
  for (const [rule, file, text] of refused) {
    const result = lint({ [file]: `${text}\n` });
    const verdict = rule === "craft/glass" || rule === "layout/100vh" ? "advisory" : "defect";
    expect(hitsOf(result, rule), text).toEqual([`${file}:1:${verdict}`]);
  }
  const accepted: [string, string, string][] = [
    ["craft/gradient-text", "src/a.css", ".h { background-clip: padding-box; }"],
    ["craft/emoji", "src/A.vue", "<p>© 2026 Shop™ ® • ✓ → 3 items</p>"],
    ["craft/emoji", "src/A.vue", "<!-- 🚀 a note in a comment -->"],
    ["copy/placeholder", "src/A.vue", "<p>Pacmed and acmeCorp and AcmeWidget</p>"],
    [
      "copy/placeholder",
      "src/A.tsx",
      "const host = 'myexample.community'; const b = 'example.co';",
    ],
    ["copy/placeholder", "src/A.tsx", "// lorem ipsum in a comment"],
    ["craft/glass", "src/a.css", ".nav { filter: blur(2px); }"],
    ["layout/100vh", "src/a.css", ".hero { height: 100svh; min-height: 100dvh; }"],
  ];
  for (const [rule, file, text] of accepted)
    expect(hitsOf(lint({ [file]: `${text}\n` }), rule), text).toEqual([]);
  // A test file is never read for placeholder data.
  expect(
    hitsOf(lint({ "src/A.test.tsx": "const name = 'John Doe';\n" }), "copy/placeholder"),
  ).toEqual([]);
  // The contract's front matter declares a device: its rule is off, the tail says so.
  // The front matter's devices, inline or as a list.
  const root = makeRepo({ "DESIGN.md": "---\ndevices:\n  - glass\n---\n" });
  expect(readDesignContract(root)).toEqual({ colours: false, devices: ["glass"] });
  const withContract = (contract: string) => {
    const r = makeRepo({
      ...GUARD,
      "DESIGN.md": contract,
      "src/A.vue": '<p class="bg-clip-text">Ready 🚀</p>\n',
    });
    return lintInterfaceFiles(r, ["src/A.vue"], {
      contract: readDesignContract(r),
      projectFiles: Object.keys(GUARD),
    });
  };
  const on = withContract("---\ndevices: [gradient-text, emoji]\n---\n# Shop\n");
  expect(hitsOf(on, "craft/gradient-text")).toEqual([]);
  expect(hitsOf(on, "craft/emoji")).toEqual([]);
  expect(lintVerdict(on).tail).toContain(
    "craft/gradient-text off: DESIGN.md declares gradient-text",
  );
  expect(lintVerdict(on).tail).toContain("craft/emoji off: DESIGN.md declares emoji");
  // Prose that names a device changes nothing.
  const prose = withContract("# Shop\n\nNever use emoji. No gradient text.\n");
  expect(hitsOf(prose, "craft/gradient-text")).toEqual(["src/A.vue:1:defect"]);
  expect(hitsOf(prose, "craft/emoji")).toEqual(["src/A.vue:1:defect"]);
  // An allowance with its why allows the one hit.
  const allowed = lint({
    "src/A.vue":
      "<!-- crew-lint: allow craft/emoji -- the brand's mark is an emoji -->\n<p>Ready 🚀</p>\n",
  });
  expect(allowed.hits.find((h) => h.rule === "craft/emoji")?.allowed).toBe(
    "the brand's mark is an emoji",
  );
});

test("2026-10-29-001 AC-4 (the round-1 rulings): every craft rule is allowed inline; each device turns its own rule off only when the base commit's contract declared it too, a device declared in this change saying it takes effect once committed; an input's placeholder attribute is not placeholder copy", () => {
  const strings: [string, string, string][] = [
    ["craft/gradient-text", "src/a.css", ".h { background-clip: text; }"],
    ["craft/emoji", "src/A.vue", "<p>Ready 🚀</p>"],
    ["copy/placeholder", "src/A.vue", "<p>Lorem ipsum</p>"],
    ["craft/glass", "src/a.css", ".nav { backdrop-filter: blur(8px); }"],
    ["layout/100vh", "src/a.css", ".hero { height: 100vh; }"],
  ];
  for (const [rule, file, text] of strings) {
    const comment = file.endsWith(".css")
      ? `/* crew-lint: allow ${rule} -- the brand asks for it */`
      : `<!-- crew-lint: allow ${rule} -- the brand asks for it -->`;
    const hit = lint({ [file]: `${comment}\n${text}\n` }).hits.find((h) => h.rule === rule);
    expect(hit?.allowed, rule).toBe("the brand asks for it");
  }
  const devices: [string, string, string][] = [
    ["craft/gradient-text", "gradient-text", ".h { background-clip: text; }"],
    ["craft/emoji", "emoji", ".i::after { content: '🚀'; }"],
    ["craft/glass", "glass", ".nav { backdrop-filter: blur(8px); }"],
    ["layout/100vh", "full-viewport", ".hero { height: 100vh; }"],
  ];
  for (const [rule, device, text] of devices) {
    const contract = { colours: false, devices: [device] };
    const off = lint({ "src/a.css": `${text}\n` }, GUARD, { contract, baseDevices: [device] });
    expect(hitsOf(off, rule), `${rule} off`).toEqual([]);
    expect(lintVerdict(off).tail, rule).toContain(`${rule} off: DESIGN.md declares ${device}`);
    const pending = lint({ "src/a.css": `${text}\n` }, GUARD, { contract, baseDevices: [] });
    expect(hitsOf(pending, rule).length, `${rule} pending`).toBe(1);
    expect(lintVerdict(pending).tail, rule).toContain(
      `${rule} on: DESIGN.md declares ${device} in this change; it takes effect once committed`,
    );
  }
  expect(
    hitsOf(
      lint({ "src/A.vue": '<input type="email" placeholder="you@example.com">\n' }),
      "copy/placeholder",
    ),
  ).toEqual([]);
});

test("2026-10-29-001 AC-4 (the architecture defect at round 1): the gate reference's design-lint table carries the five craft rules with their verdicts, the devices: declaration and where the rules came from", () => {
  const reference = readFileSync(
    join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "plugins",
      "core",
      "skills",
      "crew",
      "references",
      "gate.md",
    ),
    "utf8",
  );
  for (const [rule, verdict] of [
    ["craft/gradient-text", "defect"],
    ["craft/emoji", "defect"],
    ["copy/placeholder", "defect"],
    ["craft/glass", "advisory"],
    ["layout/100vh", "advisory"],
  ] as const)
    expect(reference, rule).toMatch(
      new RegExp(`\\| \`${rule.replace("/", "\\/")}\` \\| ${verdict} \\|`),
    );
  for (const words of [
    "`devices:`",
    "`gradient-text`, `emoji`, `glass`, `full-viewport`",
    "a mention in its prose changes nothing",
    "once committed",
    "taste-skill",
  ])
    expect(reference, words).toContain(words);
});

test("2026-10-29-001 AC-4 (the test-quality advisory at round 2): the gate's run reads the devices from the base commit's DESIGN.md through git: a device added uncommitted keeps its rule on and says so; once committed, the next item's base turns it off", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ name: "x" }),
    "DESIGN.md": "---\nname: shop\n---\n# Shop\n",
    "src/A.vue": "<p>Ready</p>\n",
  });
  const paths = repoPaths(root, testEnv());
  const profile = detectProfile(root);
  const policy = DEFAULT_POLICY;
  write(root, "DESIGN.md", "---\nname: shop\ndevices: [emoji]\n---\n# Shop\n");
  write(root, "src/A.vue", "<p>Ready 🚀</p>\n");
  const work = createWork(paths, "feature");
  addCriterion(work, "x");
  const pending = runDesignLint({
    paths,
    work,
    profile,
    files: ["src/A.vue"],
    policy,
    writes: false,
  });
  expect(pending.status).toBe("fail");
  expect(pending.tail).toContain(
    "craft/emoji on: DESIGN.md declares emoji in this change; it takes effect once committed",
  );
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "the contract adopts emoji");
  const next = createWork(paths, "feature");
  addCriterion(next, "y");
  const off = runDesignLint({
    paths,
    work: next,
    profile,
    files: ["src/A.vue"],
    policy,
    writes: false,
  });
  expect(off.tail).toContain("craft/emoji off: DESIGN.md declares emoji");
  expect(off.tail).not.toContain("craft/emoji src/A.vue");
});
