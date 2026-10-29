// What kind of file a repository path is, read from its name alone: the registry (`team.ts`), the
// gate planning (`gates.ts`) and the judgement planning (`judgement.ts`) all ask, so the answer
// lives apart from any of them. Backslashes read as `/`, names case-insensitively.

const INTERFACE_EXTENSIONS = [
  ".vue",
  ".svelte",
  ".tsx",
  ".jsx",
  ".astro",
  ".blade.php",
  ".html",
  ".css",
  ".scss",
  ".less",
];

/** A module's extensions: an interface file when it sits under an interface segment (SP9 Task 5). */
const MODULE_EXTENSIONS = [".ts", ".js", ".mts", ".mjs"];

/** The folder segments that hold interface code in Vue, Nuxt, Next and Astro: a composable, a layout, a page's script, an animation. */
const INTERFACE_SEGMENTS =
  /(?:^|\/)(?:components|composables|layouts|pages|animations|transitions|motion)\//;

/** A segment that is never interface code, wherever it sits above the file: an API route, the server, React hooks. */
const NEVER_INTERFACE_SEGMENTS = /(?:^|\/)(?:pages\/api|server|hooks)\//;

/** A Tailwind or UnoCSS config at the root or at a workspace's root, nowhere deeper. */
const CONTRACT_CONFIG = /^(?:(?:packages|apps)\/[^/]+\/)?(?:tailwind|uno)\.config\.[a-z]+$/;

/** A token or theme file by its name; its place is checked beside. */
const CONTRACT_TOKENS_OR_THEME = /^(?:tokens\.s?css|theme\.(?:css|ts|json))$/;

/** A folder segment where a token or theme file is the design's, not a component's. */
const CONTRACT_SEGMENTS = /(?:^|\/)(?:styles|assets|design)\//;

/**
 * A file the user sees: a component, a template, a stylesheet, anything under resources/views/, or
 * a module (`.ts`, `.js`, `.mts`, `.mjs`) under a `components`, `composables`, `layouts`, `pages`,
 * `animations`, `transitions` or `motion` segment, never under `pages/api/`, `server/` or `hooks/`.
 * A test, a spec, a story or a declaration of one is not one: nobody expects a UI review of a test file.
 */
export function isInterfacePath(rel: string): boolean {
  const { lower, name, folder } = parts(rel);
  if (inTestsFolder(lower)) return false;
  if (isTestName(name) || /\.stories\./.test(name)) return false;
  if (/(?:^|\/)resources\/views\//.test(lower)) return true;
  if (INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (!MODULE_EXTENSIONS.some((ext) => lower.endsWith(ext)) || name.endsWith(".d.ts")) return false;
  return INTERFACE_SEGMENTS.test(folder) && !NEVER_INTERFACE_SEGMENTS.test(folder);
}

/**
 * A design contract (SP9 Task 5): `DESIGN.md` at the root or under `docs/`, a Tailwind or UnoCSS
 * config at the root or at a workspace's root, a `*.tokens.json` anywhere, or `tokens.css`,
 * `tokens.scss`, `theme.css`, `theme.ts` or `theme.json` at the root or under a `styles`, `assets`
 * or `design` segment. A test path never; nothing else: a component's stylesheet is an interface file.
 */
export function isDesignContractPath(rel: string): boolean {
  if (isTestPath(rel)) return false;
  const { lower, name, folder } = parts(rel);
  if (name === "design.md") return folder === "" || folder.startsWith("docs/");
  if (CONTRACT_CONFIG.test(lower) || name.endsWith(".tokens.json")) return true;
  if (!CONTRACT_TOKENS_OR_THEME.test(name)) return false;
  return folder === "" || CONTRACT_SEGMENTS.test(folder);
}

/** A frontend change's path: an interface file or a design contract; what seats the frontend and plans the e2e run. */
export function isFrontendPath(rel: string): boolean {
  return isInterfacePath(rel) || isDesignContractPath(rel);
}

/**
 * A test file, from its path alone (finding 149): a `tests`, `test` or `spec` folder at the root or
 * at a workspace's root (`packages/<name>/`, `apps/<name>/`), `src/test/`, `__tests__/` at any
 * depth, or a test's own name (`.test.`, `.spec.`, `_test.`, `Test.php`, `Tests.cs`). Narrow on
 * purpose: `src/spec/` or `app/test/` hold source, so their lines are read for personal data.
 */
export function isTestPath(rel: string): boolean {
  const path = rel.replace(/\\/g, "/");
  if (/^(?:(?:packages|apps)\/[^/]+\/)?(?:tests?|spec)\//.test(path)) return true;
  if (/^src\/test\//.test(path) || inTestsFolder(path)) return true;
  const name = path.slice(path.lastIndexOf("/") + 1);
  return isTestName(name) || /_test\.[^.]+$/.test(name) || /(?:Test\.php|Tests\.cs)$/.test(name);
}

/** The path as every kind reads it: `/` separators and lowercased, with its file name and its folder (ending in `/`, empty at the root). */
function parts(rel: string): { lower: string; name: string; folder: string } {
  const lower = rel.replace(/\\/g, "/").toLowerCase();
  const cut = lower.lastIndexOf("/") + 1;
  return { lower, name: lower.slice(cut), folder: lower.slice(0, cut) };
}

/** A `__tests__` folder at any depth. */
function inTestsFolder(path: string): boolean {
  return /(?:^|\/)__tests__\//.test(path);
}

/** A test's or a spec's own file name: `a.test.ts`, `a.spec.js`. */
function isTestName(name: string): boolean {
  return /\.(?:test|spec)\./.test(name);
}

/** A Markdown file: prose the prose gate and the review's phrase inputs treat as text (2026-10-29-001). */
export function isMarkdownPath(rel: string): boolean {
  return /\.(?:md|mdx)$/i.test(rel);
}
