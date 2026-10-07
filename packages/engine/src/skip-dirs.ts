/**
 * Folders that hold dependencies, build output or tool state, never the code a person changes.
 * Shared by the detector and the walk that watches files outside git, so both skip the same places.
 */
export const SKIP_DIRS: ReadonlySet<string> = new Set([
  ".git",
  ".crew",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "coverage",
  "storage",
  "target",
]);
