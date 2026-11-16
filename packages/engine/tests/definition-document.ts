/**
 * How the tests of the teams' definitions read a definition document (`docs/specs/*-team-*-design.md`):
 * by `## ` section, by table row and by the mark a URL carries. One copy for the four tests, so a
 * change in how a table is read reaches all of them.
 */

/** The mark after the URL of a page that was not opened. */
export const NOT_OPENED_MARK = " (not opened)";
/** The mark after the URL of a page that was read only in part. */
export const READ_IN_PART_MARK = " (read in part)";
/** The first cell of the header of a table of servers, skills, links or memories. */
export const LISTED_HEADER = "Tool or service";

/** The text of one `## ` section, from its heading to the next; empty when the heading is absent. */
export function section(text: string, number: number): string {
  const parts = text.split(/\n(?=## )/);
  return parts.find((part) => part.startsWith(`## ${number}. `)) ?? "";
}

/**
 * The first line of section `number` that starts with `opens`, as the line of a numbered rule
 * does (`"3. "`); empty when the section has none.
 */
export function numberedLine(text: string, number: number, opens: string): string {
  const lines = section(text, number).split("\n");
  return lines.find((line) => line.startsWith(opens)) ?? "";
}

/** The cells of one table line. */
export function cells(line: string): string[] {
  return line
    .slice(1, line.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());
}

/** A line of a table that is not the rule under its header. */
export const isRow = (line: string) => line.startsWith("| ") && !line.startsWith("| :-");

/** The rows of a section's tables, each as its cells, the rule under a header left out. */
export function rows(part: string): string[][] {
  return part.split("\n").filter(isRow).map(cells);
}

/** The top-level bullets of a section, each without its dash. */
export function bullets(part: string): string[] {
  return part
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}

const escaped = (words: string) => words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The distinct URLs of `text` that carry `mark` right after them, sorted. */
function markedUrls(text: string, mark: string): string[] {
  const found = text.matchAll(new RegExp(`(https?://[^\\s)\`,;]+)${escaped(mark)}`, "g"));
  return [...new Set([...found].map((match) => match[1] ?? ""))].sort();
}

/**
 * The gaps of the pages listed under one mark, each named `<clause>: <url>`: a listed page that
 * is absent, a listed page that stands somewhere without the mark, and `<clause> count` when the
 * document marks a page the list does not hold. With `cited`, a place where the URL runs on into
 * a longer URL, or stands in backticks as a link someone sent, is not a place the page is cited.
 */
export function markGaps(
  text: string,
  urls: string[],
  mark: string,
  clause: string,
  cited = false,
): string[] {
  const gaps: string[] = [];
  for (const url of urls) {
    const after = text.split(url).slice(1);
    const places = cited ? after.filter((rest) => !/^([\w\-/?=&%#`]|\.\w)/.test(rest)) : after;
    if (places.length === 0 || places.some((rest) => !rest.startsWith(mark)))
      gaps.push(`${clause}: ${url}`);
  }
  const listed = [...urls].sort();
  if (markedUrls(text, mark).join("\n") !== listed.join("\n")) gaps.push(`${clause} count`);
  return gaps;
}

/**
 * `server count` when the four-cell rows of a section, its header rows left out, are not as many
 * as the list names, or when one of them has no URL in its third cell: a row the list does not
 * name, with a URL or with none, fails here.
 */
export function listedGaps(table: string[][], header: string, listed: number): string[] {
  const four = table.filter((row) => row.length === 4 && row[0] !== header);
  const whole = four.length === listed && four.every((row) => row[2]?.startsWith("https://"));
  return whole ? [] : ["server count"];
}

/**
 * The gaps of a table read by its first cell: `<rowClause>: <name>` for a name that is not the
 * first cell of exactly one row, and `<cellClause>: <name>` when `holds` refuses its second cell.
 */
export function namedRowGaps(
  table: string[][],
  names: string[],
  rowClause: string,
  cellClause: string,
  holds: (second: string) => boolean,
): string[] {
  const gaps: string[] = [];
  for (const name of names) {
    const found = table.filter((row) => row[0] === name);
    if (found.length !== 1) gaps.push(`${rowClause}: ${name}`);
    if (!holds(found[0]?.[1] ?? "")) gaps.push(`${cellClause}: ${name}`);
  }
  return gaps;
}

/** A row of sources holds a URL. */
export const hasUrl = (second: string) => second.includes("https://");
/** A row of tools holds something. */
export const hasText = (second: string) => second !== "";

/**
 * `text` with the first line of section `number` that `picks` chooses changed by `change`. It
 * throws when no line is picked, so a case over an absent document fails and does not pass.
 */
export function withChangedLine(
  text: string,
  number: number,
  what: string,
  picks: (line: string) => boolean,
  change: (line: string) => string,
): string {
  const part = section(text, number);
  const line = part.split("\n").find(picks);
  if (line === undefined) throw new Error(`no line holds ${what} in section ${number}`);
  const changed = part.replace(line, () => change(line));
  return text.replace(part, () => changed);
}
