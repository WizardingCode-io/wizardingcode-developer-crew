// Which backend frameworks a target's own manifest shows. A closed table of the frameworks the
// backend team's definition names, each with the dependency its own documentation or its own
// skeleton names, and one reader a manifest. A reader answers ids of the table and no text of the
// project: a name read from a manifest is only ever looked up. A form of declaring a dependency
// that is not read shows no framework, never a wrong one, since a later part picks what a project
// is given from this list.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { readRegular } from "../fs.ts";
import type { Target } from "../types.ts";

export interface Framework {
  id: string;
  /** The name the backend team's definition gives it. */
  name: string;
  stack: string;
  /** What a project's manifest holds when it uses the framework. */
  identifiers: readonly string[];
}

/**
 * The frameworks a manifest can show, in the definition's order. Each identifier was read on
 * 2026-11-21 on the page named beside it. Three rows are a rule of the engine's and not a page's
 * word: Symfony (its skeleton lists the bundle under `flex-require`; a real application, Symfony's
 * demo, has it under `require`), API Platform for Symfony (its page installs a pack alias, so the
 * pack's name is an identifier; `api-platform/core` was read on no page and is left out) and Yii 3
 * (no one package: its two application templates both require the two named here).
 */
export const FRAMEWORKS: readonly Framework[] = [
  // github.com/laravel/laravel, composer.json: `"laravel/framework": "^13.17"`.
  { id: "laravel", name: "Laravel", stack: "php", identifiers: ["laravel/framework"] },
  // github.com/symfony/skeleton and symfony/demo, composer.json.
  { id: "symfony", name: "Symfony", stack: "php", identifiers: ["symfony/framework-bundle"] },
  // github.com/api-platform/docs, symfony/index.md and laravel/index.md; api-platform/api-pack.
  {
    id: "api-platform",
    name: "API Platform",
    stack: "php",
    identifiers: ["api-platform/symfony", "api-platform/laravel", "api-platform/api-pack"],
  },
  // book.cakephp.org/5/en/installation.html; github.com/cakephp/app, composer.json.
  { id: "cakephp", name: "CakePHP", stack: "php", identifiers: ["cakephp/cakephp"] },
  // codeigniter.com/user_guide/installation/installing_composer.html.
  { id: "codeigniter", name: "CodeIgniter", stack: "php", identifiers: ["codeigniter4/framework"] },
  // yiiframework.com/doc/guide/2.0/en/start-installation; github.com/yiisoft/app and app-api.
  {
    id: "yii",
    name: "Yii",
    stack: "php",
    identifiers: ["yiisoft/yii2", "yiisoft/yii-runner-http", "yiisoft/yii-http"],
  },
  // slimframework.com/docs/v4/start/installation.html.
  { id: "slim", name: "Slim", stack: "php", identifiers: ["slim/slim"] },
  // github.com/nestjs/typescript-starter, package.json.
  { id: "nestjs", name: "NestJS", stack: "node", identifiers: ["@nestjs/core"] },
  // expressjs.com/en/starter/installing.html.
  { id: "express", name: "Express", stack: "node", identifiers: ["express"] },
  // fastify.dev/docs/latest/Guides/Getting-Started/.
  { id: "fastify", name: "Fastify", stack: "node", identifiers: ["fastify"] },
  // github.com/honojs/starter, templates/nodejs/package.json.
  { id: "hono", name: "Hono", stack: "node", identifiers: ["hono"] },
  // github.com/fastapi/fastapi, docs/en/docs/index.md.
  { id: "fastapi", name: "FastAPI", stack: "python", identifiers: ["fastapi"] },
  // docs.djangoproject.com/en/stable/topics/install/.
  { id: "django", name: "Django", stack: "python", identifiers: ["django"] },
  // django-rest-framework.org.
  {
    id: "django-rest-framework",
    name: "Django REST Framework",
    stack: "python",
    identifiers: ["djangorestframework"],
  },
  // flask.palletsprojects.com/en/stable/installation/.
  { id: "flask", name: "Flask", stack: "python", identifiers: ["flask"] },
  // docs.litestar.dev/latest/.
  { id: "litestar", name: "Litestar", stack: "python", identifiers: ["litestar"] },
  // gin-gonic.com/en/docs/quickstart/.
  { id: "gin", name: "Gin", stack: "go", identifiers: ["github.com/gin-gonic/gin"] },
  // github.com/labstack/echo, README.md and go.mod (documented at /v5, released at /v4).
  { id: "echo", name: "Echo", stack: "go", identifiers: ["github.com/labstack/echo"] },
  // docs.gofiber.io (documented at /v3, released at /v2).
  { id: "fiber", name: "Fiber", stack: "go", identifiers: ["github.com/gofiber/fiber"] },
  // github.com/go-chi/chi, README.md (documented at /v5).
  { id: "chi", name: "Chi", stack: "go", identifiers: ["github.com/go-chi/chi"] },
  // docs.rs/axum/latest/axum/.
  { id: "axum", name: "Axum", stack: "rust", identifiers: ["axum"] },
  // actix.rs/docs/getting-started/.
  { id: "actix-web", name: "Actix Web", stack: "rust", identifiers: ["actix-web"] },
  // rocket.rs/guide/v0.5/getting-started/.
  { id: "rocket", name: "Rocket", stack: "rust", identifiers: ["rocket"] },
  // tokio.rs/tokio/tutorial/hello-tokio.
  { id: "tokio", name: "Tokio", stack: "rust", identifiers: ["tokio"] },
];

/** The entries of the definition that no manifest shows, each with why. */
export const NOT_IN_A_MANIFEST: readonly { name: string; reason: string }[] = [
  {
    name: "WordPress",
    reason:
      "a site, a plugin or a theme is known by its files (wp-config.php, a header comment), not by a dependency",
  },
  { name: "PHP with no framework", reason: "the absence of a framework is no dependency" },
  {
    name: "the standard library's net/http",
    reason: "the standard library has no require line in go.mod",
  },
];

/** A manifest larger than this is not read. */
export const MANIFEST_MAX_BYTES = 1024 * 1024;
/**
 * A line longer than this is not read. No dependency line is that long, and the bound makes a
 * line's cost constant, so a file's cost follows its size whatever its lines hold.
 */
export const MANIFEST_LINE_MAX = 4096;
/** How many `requirements-<word>.txt` files of a folder are read, in name order. */
const REQUIREMENTS_FILES_MAX = 16;

const IDS: ReadonlySet<string> = new Set(FRAMEWORKS.map((f) => f.id));

/** A stack's identifiers, each to its framework's id: a map, so a name like `constructor` finds nothing. */
const BY_IDENTIFIER: ReadonlyMap<string, ReadonlyMap<string, string>> = (() => {
  const stacks = new Map<string, Map<string, string>>();
  for (const framework of FRAMEWORKS) {
    const names = stacks.get(framework.stack) ?? new Map<string, string>();
    for (const identifier of framework.identifiers) names.set(identifier, framework.id);
    stacks.set(framework.stack, names);
  }
  return stacks;
})();

/** The ids the names of a stack's manifest show, in the table's order, each once. */
function idsOf(stack: string, names: Iterable<string>): string[] {
  const known = BY_IDENTIFIER.get(stack);
  if (!known) return [];
  const found = new Set<string>();
  for (const name of names) {
    const id = known.get(name);
    if (id !== undefined) found.add(id);
  }
  return FRAMEWORKS.filter((f) => found.has(f.id)).map((f) => f.id);
}

/**
 * A manifest's text: a regular file under the cap, never through a link, decoded by the byte order
 * mark it opens with. UTF-8's mark is passed over; UTF-16's, in either order, decodes the file as
 * UTF-16, which is what a Windows shell's redirect writes (`pip freeze > requirements.txt`) and what
 * read as UTF-8 shows nothing. With no mark the bytes are UTF-8. The cap is on the bytes.
 */
function manifestText(path: string): string | null {
  const bytes = readRegular(path, MANIFEST_MAX_BYTES);
  if (!(bytes instanceof Buffer)) return null;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return bytes.subarray(3).toString("utf8");
  const littleEndian = bytes[0] === 0xff && bytes[1] === 0xfe;
  const bigEndian = bytes[0] === 0xfe && bytes[1] === 0xff;
  if (!littleEndian && !bigEndian) return bytes.toString("utf8");
  // Whole pairs only: an odd byte at the end is no character.
  const pairs = Buffer.from(bytes.subarray(2, 2 + Math.floor((bytes.length - 2) / 2) * 2));
  return (bigEndian ? pairs.swap16() : pairs).toString("utf16le");
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The keys of the named object fields of a JSON manifest; none where it cannot be read or parsed, or a field has another shape. */
function jsonKeys(path: string, fields: readonly string[]): string[] {
  const text = manifestText(path);
  if (text === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // Not JSON, or nested past what the parser takes: no framework is shown.
    return [];
  }
  if (!isRecord(data)) return [];
  const names: string[] = [];
  for (const field of fields) {
    const value = Object.hasOwn(data, field) ? data[field] : undefined;
    // One at a time: a manifest may declare more names than a call takes arguments.
    if (isRecord(value)) for (const name of Object.keys(value)) names.push(name);
  }
  return names;
}

const isBlank = (char: string | undefined) => char === " " || char === "\t";

/** A line of a text manifest: read, or passed over for its length with the character it opens with. */
type ManifestLine = { text: string } | { text: null; opens: string };

/** A text manifest's lines, one pass: a line past `MANIFEST_LINE_MAX` is answered by its first character alone. */
function* linesOf(text: string): Generator<ManifestLine> {
  for (const raw of text.split("\n")) {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.length <= MANIFEST_LINE_MAX) {
      yield { text: line };
      continue;
    }
    let at = 0;
    while (isBlank(line[at])) at++;
    yield { text: null, opens: line[at] ?? "" };
  }
}

/** The run of characters from `from` that a package or a crate name is made of. */
function nameEnd(text: string, from: number, extra: string): number {
  let at = from;
  for (; at < text.length; at++) {
    const code = text.charCodeAt(at);
    const letterOrDigit =
      (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    if (!letterOrDigit && !extra.includes(text[at] ?? "")) break;
  }
  return at;
}

/** A Python distribution's name as the packaging specification compares it: lowercased, each run of `.`, `-` and `_` one `-`. */
function normalised(name: string): string {
  let out = "";
  let inRun = false;
  for (const char of name.toLowerCase()) {
    if (char === "." || char === "-" || char === "_") {
      if (!inRun) out += "-";
      inRun = true;
    } else {
      out += char;
      inRun = false;
    }
  }
  return out;
}

/** What may follow a requirement's name: an extra, a version specifier, a marker, a comment, a direct reference. */
const AFTER_A_REQUIREMENT = " \t[=<>!~;#,@";

/** The distribution a requirement names, normalised; null for an option, a comment, a URL or a path. */
function requirementName(requirement: string): string | null {
  let from = 0;
  while (isBlank(requirement[from])) from++;
  const to = nameEnd(requirement, from, "._-");
  if (to === from) return null;
  const next = requirement[to];
  // `git+https://…` and `https://…` open with a word too: what follows a name decides.
  if (next !== undefined && !AFTER_A_REQUIREMENT.includes(next)) return null;
  return normalised(requirement.slice(from, to));
}

/** The requirements files of a folder that are read: `requirements.txt` and the first of `requirements-<word>.txt`. */
function requirementsFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const grouped = names.filter((name) => /^requirements-[a-z0-9-]+\.txt$/.test(name)).sort();
  return [
    ...(names.includes("requirements.txt") ? ["requirements.txt"] : []),
    ...grouped.slice(0, REQUIREMENTS_FILES_MAX),
  ];
}

/** The quoted strings of a stretch of a TOML array, each given to `take`; true when the stretch closes the array. */
function arrayStrings(text: string, from: number, take: (value: string) => void): boolean {
  for (let at = from; at < text.length; at++) {
    const char = text[at];
    if (char === "#") return false;
    if (char === "]") return true;
    if (char !== '"' && char !== "'") continue;
    let value = "";
    let end = at + 1;
    for (; end < text.length && text[end] !== char; end++) {
      // A basic string escapes with a backslash; a literal string has no escape.
      if (char === '"' && text[end] === "\\") end++;
      value += text[end] ?? "";
    }
    take(value);
    at = end;
  }
  return false;
}

/** The name between a TOML table header's brackets, spaces around it dropped; null for an array of tables. */
function tableName(trimmed: string): string | null {
  if (trimmed.startsWith("[[")) return null;
  const close = trimmed.indexOf("]");
  return close < 0 ? null : trimmed.slice(1, close).trim();
}

/** A key of a TOML table at the start of a line, bare or quoted, with where it ends; null where the line opens with none. */
function tomlKey(trimmed: string): { key: string; rest: string } | null {
  const quote = trimmed[0];
  if (quote === '"' || quote === "'") {
    const close = trimmed.indexOf(quote, 1);
    return close < 0 ? null : { key: trimmed.slice(1, close), rest: trimmed.slice(close + 1) };
  }
  const end = nameEnd(trimmed, 0, "_-");
  return end === 0 ? null : { key: trimmed.slice(0, end), rest: trimmed.slice(end) };
}

/** The distributions `pyproject.toml` declares: the `[project]` table's `dependencies` array and Poetry's table's keys. */
function pyprojectNames(text: string): string[] {
  const names: string[] = [];
  const take = (requirement: string) => {
    const name = requirementName(requirement);
    if (name !== null) names.push(name);
  };
  let table: "project" | "poetry" | "other" = "other";
  let inArray = false;
  for (const line of linesOf(text)) {
    if (line.text === null) {
      // A line passed over inside the array ends the array: it may be the one that closes it, and
      // reading on would take what follows for entries. Elsewhere a header passed over closes the
      // table that was open.
      if (inArray) inArray = false;
      else if (line.opens === "[") table = "other";
      continue;
    }
    if (inArray) {
      if (arrayStrings(line.text, 0, take)) inArray = false;
      continue;
    }
    const trimmed = line.text.trim();
    if (trimmed.startsWith("[")) {
      const name = tableName(trimmed);
      table =
        name === "project" ? "project" : name === "tool.poetry.dependencies" ? "poetry" : "other";
      continue;
    }
    if (table === "other") continue;
    const found = tomlKey(trimmed);
    if (!found) continue;
    const value = found.rest.trimStart();
    if (!value.startsWith("=")) continue;
    if (table === "poetry") names.push(normalised(found.key));
    else if (found.key === "dependencies") {
      const opened = value.slice(1).trimStart();
      if (opened.startsWith("[")) inArray = !arrayStrings(opened, 1, take);
    }
  }
  return names;
}

/** The distributions a Python target declares: its requirements files and its `pyproject.toml`. */
function pythonNames(dir: string): string[] {
  const names: string[] = [];
  for (const file of requirementsFiles(dir)) {
    const text = manifestText(join(dir, file));
    if (text === null) continue;
    for (const line of linesOf(text)) {
      const name = line.text === null ? null : requirementName(line.text);
      if (name !== null) names.push(name);
    }
  }
  const pyproject = manifestText(join(dir, "pyproject.toml"));
  if (pyproject !== null) for (const name of pyprojectNames(pyproject)) names.push(name);
  return names;
}

/** A Go module path without its major-version suffix `/v<digits>`, which is how Go names a module's major versions. */
function withoutMajor(path: string): string {
  const slash = path.lastIndexOf("/");
  const tail = path.slice(slash + 1);
  if (slash < 0 || tail.length < 2 || tail[0] !== "v") return path;
  for (let at = 1; at < tail.length; at++) {
    const code = tail.charCodeAt(at);
    if (code < 48 || code > 57) return path;
  }
  return path.slice(0, slash);
}

/** The first word of a stretch of text. */
function firstWord(text: string): string {
  let end = 0;
  while (end < text.length && !isBlank(text[end])) end++;
  return text.slice(0, end);
}

/** The modules `go.mod` requires directly, each without its major suffix: `require` lines, in a block or alone, never one marked indirect. */
function goModules(text: string): string[] {
  const modules: string[] = [];
  let inBlock = false;
  for (const line of linesOf(text)) {
    if (line.text === null) {
      if (line.opens === ")") inBlock = false;
      continue;
    }
    const comment = line.text.indexOf("//");
    const code = (comment < 0 ? line.text : line.text.slice(0, comment)).trim();
    const indirect =
      comment >= 0 &&
      line.text
        .slice(comment + 2)
        .trimStart()
        .startsWith("indirect");
    if (inBlock) {
      if (code.startsWith(")")) inBlock = false;
      else if (code && !indirect) modules.push(withoutMajor(firstWord(code)));
      continue;
    }
    if (!code.startsWith("require")) continue;
    const after = code.slice("require".length);
    // `require` is the whole word: a blank or the block's bracket follows it.
    if (!isBlank(after[0]) && after[0] !== "(") continue;
    const rest = after.trimStart();
    if (rest.startsWith("(")) inBlock = true;
    else if (rest && !indirect) modules.push(withoutMajor(firstWord(rest)));
  }
  return modules;
}

/** The tables of `Cargo.toml` whose keys are a package's or a workspace's dependencies. */
const CARGO_TABLES = ["dependencies", "workspace.dependencies"];

/** The crates `Cargo.toml` declares as dependencies: a key, a dotted key or a table header under the two tables. */
function cargoCrates(text: string): string[] {
  const crates: string[] = [];
  let inTable = false;
  for (const line of linesOf(text)) {
    if (line.text === null) {
      if (line.opens === "[") inTable = false;
      continue;
    }
    const trimmed = line.text.trim();
    if (trimmed.startsWith("[")) {
      const name = tableName(trimmed) ?? "";
      inTable = CARGO_TABLES.includes(name);
      // `[dependencies.axum]`: the crate is the header's last part.
      const under = CARGO_TABLES.find((table) => name.startsWith(`${table}.`));
      if (under) crates.push(name.slice(under.length + 1).trim());
      continue;
    }
    if (!inTable) continue;
    const found = tomlKey(trimmed);
    if (!found) continue;
    const next = found.rest.trimStart()[0];
    if (next === "=" || next === ".") crates.push(found.key);
  }
  return crates;
}

/**
 * The frameworks a stack's manifest in a folder shows, ids of `FRAMEWORKS` in its order. Each
 * manifest is read here, as a regular file under the cap and never through a link, whatever the
 * stack's detector read of it.
 */
export function frameworksOf(dir: string, stack: string): string[] {
  const text = (name: string) => manifestText(join(dir, name));
  switch (stack) {
    case "php":
      return idsOf(stack, jsonKeys(join(dir, "composer.json"), ["require", "require-dev"]));
    case "node":
      return idsOf(stack, jsonKeys(join(dir, "package.json"), ["dependencies", "devDependencies"]));
    case "python":
      return idsOf(stack, pythonNames(dir));
    case "go": {
      const manifest = text("go.mod");
      return manifest === null ? [] : idsOf(stack, goModules(manifest));
    }
    case "rust": {
      const manifest = text("Cargo.toml");
      return manifest === null ? [] : idsOf(stack, cargoCrates(manifest));
    }
    default:
      return [];
  }
}

/** The ids of the table a list holds, in the list's order; none for a value that is no list. A saved profile's field is read through this, so a value changed by hand is never trusted for its shape. */
export function frameworkIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && IDS.has(id))
    : [];
}

/** The line a profile's view prints under a target that shows a framework: ids of the table alone, so a profile changed by hand puts no word of its own there. */
export function frameworksLine(target: Pick<Target, "frameworks">): string {
  const ids = frameworkIds(target.frameworks);
  return ids.length ? `\n    frameworks: ${ids.join(", ")}` : "";
}
