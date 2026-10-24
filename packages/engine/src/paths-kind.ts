// What kind of file a repository path is, read from its name alone: the registry (`team.ts`) and the
// judgement planning (`judgement.ts`) both ask, so the answer lives apart from either.

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

/**
 * A file the user sees: a component, a template, a stylesheet, or anything under resources/views/.
 * A test, a spec or a story of one is not one: nobody expects a UI review of a test file.
 */
export function isInterfacePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (inTestsFolder(lower)) return false;
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (isTestName(name) || /\.stories\./.test(name)) return false;
  if (/(?:^|\/)resources\/views\//.test(lower)) return true;
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
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

/** A `__tests__` folder at any depth. */
function inTestsFolder(path: string): boolean {
  return /(?:^|\/)__tests__\//.test(path);
}

/** A test's or a spec's own file name: `a.test.ts`, `a.spec.js`. */
function isTestName(name: string): boolean {
  return /\.(?:test|spec)\./.test(name);
}
