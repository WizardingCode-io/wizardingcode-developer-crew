import { expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as metrics from "../src/metrics.ts";

// The shape of the source the code-quality reviewers of SP4 named (findings 107 and 108): a doc
// comment over the function it documents, no export without a reader, one read of the base in the
// analyse case, no cast where a narrowing serves, a comment on a copy that keeps rows out. Each
// row reads the file as text; none runs anything.

const src = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`../src/${name}`, import.meta.url)), "utf8");

/** The doc comment that ends on the line right before `declaration`, or null when the line before is not a comment's end. */
function docCommentBefore(text: string, declaration: string): string | null {
  const at = text.indexOf(declaration);
  if (at === -1) throw new Error(`${declaration} not found`);
  const before = text.slice(0, at).trimEnd();
  if (!before.endsWith("*/")) return null;
  const start = before.lastIndexOf("/**");
  return start === -1 ? null : before.slice(start);
}

/** The text of one `case "<name>"` of the CLI's dispatch, up to the next case at the same depth. */
function caseText(name: string): string {
  const cli = src("cli.ts");
  const start = cli.indexOf(`    case "${name}": {`);
  if (start === -1) throw new Error(`case ${name} not found`);
  const next = cli.indexOf('\n    case "', start + 1);
  return cli.slice(start, next === -1 ? undefined : next);
}

test("SP6-T1 AC-8: the doc comments sit over the functions they document (findings 107 and 108)", () => {
  expect(docCommentBefore(src("evidence.ts"), "export function renderReport(")).toContain(
    "The report.",
  );
  expect(docCommentBefore(src("types.ts"), "export interface KnowledgeRecord {")).toContain(
    "What the base listed for an item at its classification",
  );
  expect(docCommentBefore(src("metrics.ts"), "export function metricsText(")).toContain(
    "The short text `crew metrics` prints",
  );
  // The helpers that were inserted between a comment and its function carry their own comments.
  expect(docCommentBefore(src("evidence.ts"), "export function learnedText(")).toContain(
    "one wording for the register",
  );
  expect(docCommentBefore(src("types.ts"), "export interface KnownRootCause {")).toContain(
    "A root cause the base holds",
  );
});

test("SP6-T1 AC-8: emptyKnowledge is the metrics module's own, not exported (finding 108)", () => {
  expect("emptyKnowledge" in metrics).toBe(false);
  expect(typeof metrics.computeMetrics).toBe("function");
});

test("SP6-T1 AC-8: the analyse case reads the base once, the cto case casts nothing, the metrics copy says why it copies (finding 108)", () => {
  const analyse = caseText("analyse");
  expect(analyse.split("readBase(").length - 1).toBe(1);
  expect(caseText("cto")).not.toContain("file as string");
  const text = src("metrics.ts");
  const body = text.slice(text.indexOf("export function computeMetrics("));
  const lines = body.split("\n");
  const copy = lines.findIndex((l) => l.trim() === "knowledge: {");
  expect(copy).toBeGreaterThan(0);
  expect(lines[copy - 1]).toMatch(/^\s*\/\/.*rows/);
});

// Item C2b (finding 130): a doc comment is bound to its declaration by adjacency, and a function
// inserted between the two leaves the comment over a stranger. The symptom is textual: a doc
// comment opening right after another doc comment closed. A file's leading comment before any
// code is the one legitimate stacked shape.

/** Every `<file>:<line>` where a doc comment opens right after another doc comment closed, the file's leading comment excepted. */
function stackedDocComments(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (!entry.endsWith(".ts")) continue;
    const lines = readFileSync(`${dir}/${entry}`, "utf8").split("\n");
    let codeSeen = false;
    let inBlock = false;
    let blockStartedAfterCode = false;
    let prevClosedBlockAfterCode = false;
    for (let i = 0; i < lines.length; i++) {
      const line = (lines[i] ?? "").trim();
      if (!line) continue;
      if (!inBlock && line.startsWith("/**")) {
        if (prevClosedBlockAfterCode) found.push(`${entry}:${i + 1}`);
        blockStartedAfterCode = codeSeen;
        inBlock = true;
        prevClosedBlockAfterCode = false;
      }
      if (inBlock) {
        // A block's close, on its opening line or a later one, is the one place it is recorded.
        if (line.endsWith("*/")) {
          inBlock = false;
          prevClosedBlockAfterCode = blockStartedAfterCode;
        }
        continue;
      }
      prevClosedBlockAfterCode = false;
      if (!line.startsWith("//")) codeSeen = true;
    }
  }
  return found.sort();
}

test("AC-1 (item C2b, finding 130): no doc comment stacked under another doc comment anywhere in the engine's source, a file's leading comment excepted", () => {
  const dir = fileURLToPath(new URL("../src", import.meta.url));
  expect(stackedDocComments(dir)).toEqual([]);
});

test("AC-1 (finding 131): the scanner names a doc comment stacked under another, and passes a single-line doc comment over a declaration and a file's leading comment", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-stacked-"));
  try {
    writeFileSync(
      join(dir, "stacked.ts"),
      "import { x } from \"./x.ts\";\n\n/** The stranger's comment. */\n/**\n * The owner's comment.\n */\nexport const y = x;\n",
    );
    writeFileSync(
      join(dir, "clean.ts"),
      "/**\n * The file's leading comment.\n */\n/** The first declaration. */\nexport const a = 1;\n\n/** A single-line one. */\nexport const b = 2;\n",
    );
    writeFileSync(join(dir, "notes.md"), "/** a */\n/** b */\n");
    expect(stackedDocComments(dir)).toEqual(["stacked.ts:4"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
