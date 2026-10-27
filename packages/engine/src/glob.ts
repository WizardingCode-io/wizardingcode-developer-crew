/** `s` as a regular expression that matches it literally (findings 54, 110: one escape for every caller). */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c !== undefined) {
      re += escapeRegExp(c);
    }
  }
  return new RegExp(`^${re}$`, "i");
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  const normalised = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalised));
}

/** The most words one brace expansion yields before the reader stops expanding (a guard against `{a,b}{c,d}…` blowing up). */
export const MAX_BRACE_WORDS = 256;
/**
 * The words a shell's brace expansion makes of one word (`.{crew,x}` → `.crew`, `.x`; `w{1..3}` →
 * `w1`, `w2`, `w3`; a letter range too), the word itself when it holds none. Expansion stops at
 * `MAX_BRACE_WORDS`, keeping what it has.
 */
export function braceExpand(word: string): string[] {
  const words = [word];
  const out: string[] = [];
  while (words.length && out.length + words.length <= MAX_BRACE_WORDS) {
    const w = words.shift() ?? "";
    const parts = firstBrace(w);
    if (!parts) {
      out.push(w);
      continue;
    }
    const [head, choices, tail] = parts;
    words.unshift(...choices.map((c) => `${head}${c}${tail}`));
  }
  return [...out, ...words];
}
/** The first `{…}` of a word that expands (a top-level comma, or a `a..b` range), as head, choices and tail; null when there is none. */
function firstBrace(word: string): [string, string[], string] | null {
  for (let open = word.indexOf("{"); open !== -1; open = word.indexOf("{", open + 1)) {
    let depth = 0;
    const commas: number[] = [];
    for (let i = open; i < word.length; i++) {
      const c = word[i];
      if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        const body = word.slice(open + 1, i);
        const head = word.slice(0, open);
        const tail = word.slice(i + 1);
        if (commas.length) {
          const choices: string[] = [];
          let from = open + 1;
          for (const at of [...commas, i]) {
            choices.push(word.slice(from, at));
            from = at + 1;
          }
          return [head, choices, tail];
        }
        const range = /^(-?\d+|[A-Za-z])\.\.(-?\d+|[A-Za-z])$/.exec(body);
        if (range) return [head, braceRange(range[1] ?? "", range[2] ?? ""), tail];
        break;
      } else if (c === "," && depth === 1) commas.push(i);
    }
  }
  return null;
}
function braceRange(from: string, to: string): string[] {
  const numeric = /\d/.test(from) && /\d/.test(to);
  const a = numeric ? Number(from) : from.charCodeAt(0);
  const b = numeric ? Number(to) : to.charCodeAt(0);
  const step = a <= b ? 1 : -1;
  const out: string[] = [];
  for (let n = a; out.length < MAX_BRACE_WORDS; n += step) {
    out.push(numeric ? String(n) : String.fromCharCode(n));
    if (n === b) break;
  }
  return out;
}

/**
 * A path word normalised lexically, for a test only: either separator read as `/`, repeated
 * separators collapsed, `.` segments dropped, `seg/..` resolved (never above the word's start,
 * so a leading `..` stays), a trailing separator dropped.
 */
export function normalizePathWord(word: string): string {
  const slashed = word.replace(/\\/g, "/");
  const absolute = slashed.startsWith("/");
  const kept: string[] = [];
  for (const segment of slashed.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && kept.length && kept[kept.length - 1] !== "..") kept.pop();
    else kept.push(segment);
  }
  return `${absolute ? "/" : ""}${kept.join("/")}`;
}

/**
 * Whether one segment of a shell glob (`*`, `?`, `[…]`, the rest literal) can match a name, case
 * ignored; with `leadingDot`, a leading wildcard never matches a leading dot, as the shell reads it.
 */
export function segmentMatches(segment: string, name: string, leadingDot = true): boolean {
  if (leadingDot && name.startsWith(".") && /^[*?[]/.test(segment)) return false;
  let re = "";
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i] ?? "";
    if (c === "*") re += ".*";
    else if (c === "?") re += ".";
    else if (c === "[") {
      const close = segment.indexOf("]", i + 2);
      if (close === -1) re += "\\[";
      else {
        const body = segment
          .slice(i + 1, close)
          .replace(/^[!^]/, "^")
          .replace(/\\/g, "\\\\");
        re += `[${body}]`;
        i = close;
      }
    } else re += escapeRegExp(c);
  }
  try {
    return new RegExp(`^${re}$`, "is").test(name);
  } catch {
    return true;
  }
}
