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
  if (/(?:^|\/)__tests__\//.test(lower)) return false;
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (/\.(?:test|spec|stories)\./.test(name)) return false;
  if (/(?:^|\/)resources\/views\//.test(lower)) return true;
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
