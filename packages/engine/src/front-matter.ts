/**
 * The front matter of a shipped page, checked without a YAML parser: the engine runs on Node with
 * no dependency, and every runtime but Claude Code reads the page with a strict YAML loader that
 * drops it on a nested mapping it never meant (finding 121). The rule is YAML's plain-scalar rule:
 * each line `key: value` (a simple key, a colon, one space, a non-empty value; no key twice, no
 * indented line); a double-quoted value parses whole as a JSON string; a plain value holds no
 * `: ` and no ` #`, does not start with an indicator and does not end with `:`. Narrower than
 * YAML (a block scalar, a single-quoted or a folded value is refused although YAML takes them),
 * never wider: whatever it passes, a strict parser reads as the text the engine reads
 * (`front-matter.test.ts` proves both directions against Bun.YAML).
 */
/** The front-matter block of a page: the lines between the opening `---` and the next. */
export const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;
const KEY_VALUE = /^([A-Za-z_][\w-]*): (.+)$/;

/** A double-quoted value decoded once as the JSON string it is; undefined for anything else (one reading for the rule and the agent-page reader). */
export function parseQuoted(value: string): string | undefined {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "string" ? parsed : undefined;
  } catch {
    return undefined;
  }
}
const INDICATORS = new Set([
  "[",
  "]",
  "{",
  "}",
  "&",
  "*",
  "!",
  "|",
  ">",
  "'",
  '"',
  "%",
  "@",
  "`",
  "?",
]);

/** The problems of a page's front matter, each `line <n>: <what>`; empty when a strict loader reads it as the engine does. */
export function frontMatterProblems(text: string): string[] {
  const match = FRONT_MATTER.exec(text);
  if (!match) return ["line 1: no front matter (--- … ---)"];
  const problems: string[] = [];
  const seen = new Set<string>();
  (match[1] ?? "").split("\n").forEach((line, i) => {
    // The block starts on line 2: line 1 is the opening `---`.
    const n = i + 2;
    const kv = KEY_VALUE.exec(line);
    const key = kv?.[1];
    const value = kv?.[2];
    if (key === undefined || value === undefined) {
      problems.push(`line ${n}: not "key: value"`);
      return;
    }
    if (seen.has(key)) problems.push(`line ${n}: key "${key}" given twice`);
    seen.add(key);
    if (value.startsWith('"')) {
      if (parseQuoted(value) === undefined)
        problems.push(`line ${n}: a quoted value is not a JSON string`);
      return;
    }
    const first = value[0] ?? "";
    if (INDICATORS.has(first) || value.startsWith("- "))
      problems.push(`line ${n}: a plain value starts with "${first}" (quote it)`);
    if (value.includes(": ")) problems.push(`line ${n}: a plain value holds ": " (quote it)`);
    if (value.includes(" #")) problems.push(`line ${n}: a plain value holds " #" (quote it)`);
    if (value.endsWith(":")) problems.push(`line ${n}: a plain value ends with ":" (quote it)`);
  });
  return problems;
}
