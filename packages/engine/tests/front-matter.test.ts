import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { frontMatterProblems } from "../src/front-matter.ts";

// The engine runs on Node with no dependency, so its front-matter rule is YAML's plain-scalar
// rule and not a parser; Bun.YAML, under the test runner, is the strict parser every runtime
// but Claude Code stands for (finding 121). The rule promises two things, proven here per
// direction: whatever it passes, the parser reads as the text the engine reads; whatever it
// refuses, the parser throws on or reads as something else.

const THROWN = Symbol("thrown");
const block = (text: string): string => /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? "";
const strict = (text: string): Record<string, unknown> | typeof THROWN => {
  try {
    const value = Bun.YAML.parse(block(text));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : { "": value };
  } catch {
    return THROWN;
  }
};
const page = (lines: string[]): string => `---\n${lines.join("\n")}\n---\n\n# Body\n`;
const engineReads = (value: string): string =>
  value.startsWith('"') ? (JSON.parse(value) as string) : value;

test("AC-3 (finding 121's debt), never wider: every value the rule passes is read by a strict parser as the text the engine reads, on every shipped page and on the passing shapes", () => {
  const agents = fileURLToPath(new URL("../../../plugins/core/agents/", import.meta.url));
  const shipped = [
    ...readdirSync(agents)
      .filter((f) => f.endsWith(".md"))
      .map((f) => `${agents}${f}`),
    fileURLToPath(new URL("../../../plugins/core/skills/crew/SKILL.md", import.meta.url)),
  ];
  expect(shipped).toHaveLength(16);
  const passing = [
    page([
      "name: crew-method",
      "description: Reviews the diff (a:b and a#b inside) and returns findings tied to a file)",
      "tools: Read, Grep, Glob",
      "model: opus",
    ]),
    page(["name: x", 'description: "Use when: a \\"fix\\", a\\nfeature"']),
  ];
  for (const text of [...shipped.map((p) => readFileSync(p, "utf8")), ...passing]) {
    const label = block(text).split("\n")[1]?.slice(0, 60) ?? text.slice(0, 60);
    expect(frontMatterProblems(text), label).toEqual([]);
    const parsed = strict(text);
    expect(parsed, label).not.toBe(THROWN);
    for (const line of block(text).split("\n")) {
      const at = line.indexOf(": ");
      const key = line.slice(0, at);
      const value = line.slice(at + 2);
      expect((parsed as Record<string, unknown>)[key], line).toBe(engineReads(value));
    }
  }
});

test("AC-3 (finding 121's debt), narrower than YAML: every shape the rule refuses is one a strict parser throws on or reads as something other than the text", () => {
  const refused: { lines: string[]; problem: string; key: string; text: string }[] = [
    {
      lines: ["name: x", "description: Use when: a fix"],
      problem: 'holds ": "',
      key: "description",
      text: "Use when: a fix",
    },
    {
      lines: ["name: x", "description: a #b"],
      problem: 'holds " #"',
      key: "description",
      text: "a #b",
    },
    {
      lines: ["name: x", "description: - x"],
      problem: 'starts with "-"',
      key: "description",
      text: "- x",
    },
    {
      lines: ["name: x", "description: &a x"],
      problem: 'starts with "&"',
      key: "description",
      text: "&a x",
    },
    {
      lines: ["name: x", "description: !!str x"],
      problem: 'starts with "!"',
      key: "description",
      text: "!!str x",
    },
    {
      lines: ["name: x", "description: *a"],
      problem: 'starts with "*"',
      key: "description",
      text: "*a",
    },
    {
      lines: ["name: x", "description: |", "  folded"],
      problem: 'starts with "|"',
      key: "description",
      text: "|",
    },
    {
      lines: ["name: x", "description: 'x'"],
      problem: `starts with "'"`,
      key: "description",
      text: "'x'",
    },
    {
      lines: ["name: x", "description: ? x"],
      problem: 'starts with "?"',
      key: "description",
      text: "? x",
    },
    {
      lines: ["name: x", "description: x:"],
      problem: 'ends with ":"',
      key: "description",
      text: "x:",
    },
    {
      lines: ["name: x", 'description: "unclosed'],
      problem: "not a JSON string",
      key: "description",
      text: '"unclosed',
    },
    {
      lines: ["name: x", "description:x"],
      problem: 'not "key: value"',
      key: "description",
      text: "x",
    },
    {
      lines: ["name: x", "description:"],
      problem: 'not "key: value"',
      key: "description",
      text: "",
    },
    {
      lines: ["name: x", "description: a", "  more"],
      problem: 'not "key: value"',
      key: "description",
      text: "a",
    },
    { lines: ["name: x", "? x"], problem: 'not "key: value"', key: "x", text: "" },
    { lines: ["name: a", "name: b"], problem: 'key "name" given twice', key: "name", text: "a" },
  ];
  for (const { lines, problem, key, text } of refused) {
    const label = lines.join(" | ");
    const problems = frontMatterProblems(page(lines));
    expect(
      problems.some((p) => p.includes(problem)),
      `${label}: ${problems.join("; ")}`,
    ).toBe(true);
    for (const p of problems) expect(p, label).toMatch(/^line \d+: /);
    const parsed = strict(page(lines));
    expect(parsed === THROWN || parsed[key] !== text, label).toBe(true);
  }
  // No front matter at all is a problem of its own, named at line 1.
  expect(frontMatterProblems("# A page\n")).toEqual(["line 1: no front matter (--- … ---)"]);
});
