/**
 * The command line of `crew`, as the command and the hooks read it: one parser, so what the hook
 * takes for a verb is what the command runs (security review of SP2c task 4, round 3: a flag that
 * takes a value takes the next word, and a hook that skipped only `--flag` read the value as the
 * verb).
 */
export interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
  /** Every value a flag was given, in order, for flags that may repeat (`--criterion a --criterion b`). */
  multi: Record<string, string[]>;
  /** Every valued flag in command-line order, so two repeatable flags keep their relative order. */
  ordered: { key: string; value: string }[];
  rest: string[];
}

// Flags that never take a value, so a word after them stays a positional argument.
export const BOOLEAN_FLAGS = new Set(["print", "json", "refresh", "force", "not-run", "all"]);

/** A comma-separated flag as its trimmed non-empty words; a flag absent, boolean or empty gives none (finding 88). */
export function commaList(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** `--key value` takes the next word unless the flag is boolean or the next word is a flag; `--` ends the flags. */
export function parse(argv: string[]): Parsed {
  const parsed: Parsed = { positional: [], flags: {}, multi: {}, ordered: [], rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && !BOOLEAN_FLAGS.has(key)) {
        parsed.flags[key] = next;
        const values = parsed.multi[key] ?? [];
        values.push(next);
        parsed.multi[key] = values;
        parsed.ordered.push({ key, value: next });
        i++;
      } else parsed.flags[key] = true;
    } else parsed.positional.push(arg);
  }
  return parsed;
}
