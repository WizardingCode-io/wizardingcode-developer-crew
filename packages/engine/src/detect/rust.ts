import { join } from "node:path";
import { isRegularFile, readRegularText } from "../fs.ts";
import type { DetectedTarget, Detector } from "./types.ts";

/** A manifest larger than this is not read: it is a target, without the workspace flag. */
const MANIFEST_MAX_BYTES = 1024 * 1024;
/** A `[workspace]` header or a table under it, spaces allowed around the name; never `[[workspace]]`, `[workspaces]` or `[workspace-hack]`. */
const WORKSPACE_HEADER = /^\s*\[\s*workspace\s*[.\]]/;
/** Any table header: after the first, a `workspace` key belongs to that table. */
const TABLE_HEADER = /^\s*\[/;
/** The dotted or the inline form at the top of the file: `workspace.members = …`, `workspace = { … }`. */
const WORKSPACE_KEY = /^\s*workspace\s*(?:\.|=\s*\{)/;

/**
 * Whether a manifest's text makes it a workspace root, in one walk by lines: cargo reads a
 * `[workspace]` table, or any table under it, as a workspace. Nothing else of the text is read, so
 * a `members` list never reaches a pattern or a command.
 */
function isWorkspaceRoot(text: string): boolean {
  let beforeFirstTable = true;
  for (const line of text.split("\n")) {
    if (WORKSPACE_HEADER.test(line)) return true;
    if (beforeFirstTable && WORKSPACE_KEY.test(line)) return true;
    if (TABLE_HEADER.test(line)) beforeFirstTable = false;
  }
  return false;
}

/**
 * A Rust crate or workspace: a folder whose `Cargo.toml` is a regular file. The gates are cargo's
 * own subcommands, with `--workspace` at a workspace root, where a root that is also a package
 * would otherwise build that package alone. The lint is named as proposed: clippy is a component a
 * toolchain may lack and warnings denied is a bar a project takes on purpose, so a person confirms
 * it once. Whether the component is installed is not asked: rustup keeps a `cargo-clippy` on the
 * PATH either way, and a profile does not depend on a machine's PATH. A workspace's `members` are
 * not read: each member has its own manifest and is a target of its own.
 */
export const rustDetector: Detector = {
  stack: "rust",
  detect(dir: string): DetectedTarget | null {
    const manifest = join(dir, "Cargo.toml");
    if (!isRegularFile(manifest)) return null;
    const text = readRegularText(manifest, MANIFEST_MAX_BYTES);
    const all = text !== null && isWorkspaceRoot(text) ? " --workspace" : "";
    return {
      stack: "rust",
      packageManager: "cargo",
      gates: {
        build: `cargo build${all}`,
        test: `cargo test${all}`,
        typecheck: `cargo check${all} --all-targets`,
        lint: `cargo clippy${all} --all-targets -- -D warnings`,
      },
      proposedGates: ["lint"],
    };
  },
};
