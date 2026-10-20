import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
