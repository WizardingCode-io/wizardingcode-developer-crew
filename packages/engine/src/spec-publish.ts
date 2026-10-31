import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { validItemId } from "./design.ts";
import { scanText } from "./secrets.ts";

/** A path that is a symlink, read without following it; false when nothing is there. */
function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * The approved document under `docs/designs/`, which the drift skill later compares with the code
 * (ADR 0019): the spec, the plan and where they came from. It overwrites only this item's own file,
 * stays inside the repository, follows no symlink and writes nothing the secrets scan refuses.
 */
export function publishDesign(
  root: string,
  id: string,
  title: string,
  specText: string,
  planText: string,
): { path: string } | { refused: string } {
  if (!validItemId(id)) return { refused: `"${id}" is not an item id` };
  const provenance = `Published by \`crew learn\` from item \`${id}\`, reviewed before the code (ADR 0019).`;
  const text = `${specText.trimEnd()}\n\n${planText.trimEnd()}\n\n---\n\n${provenance}\n`;
  const cleanTitle = title.replace(/\|/g, "/").replace(/\s+/g, " ").trim();
  const row = `| ${id} | ${cleanTitle} | ${id}.md |`;
  const secret = [...scanText(text, "the document"), ...scanText(row, "the sitemap row")][0];
  if (secret)
    return {
      refused: `${secret.source} line ${secret.line} matches ${secret.rule}: fix it, then crew spec-review ${id} publish`,
    };
  const docs = join(root, "docs");
  const folder = join(docs, "designs");
  const file = join(folder, `${id}.md`);
  const sitemap = join(folder, "SITEMAP.md");
  for (const path of [docs, folder, file, sitemap])
    if (isLink(path)) return { refused: `${relative(root, path)} is a symlink: nothing written` };
  try {
    mkdirSync(folder, { recursive: true });
    const inside = relative(realpathSync(root), realpathSync(folder));
    if (inside.startsWith("..") || isAbsolute(inside))
      return { refused: "docs/designs resolves outside the repository: nothing written" };
    writeFileSync(file, text);
    if (existsSync(sitemap)) {
      const current = readFileSync(sitemap, "utf8");
      if (!current.includes(`| ${id} |`)) writeFileSync(sitemap, `${current.trimEnd()}\n${row}\n`);
    }
  } catch (error) {
    return { refused: `the document could not be written: ${(error as Error).message}` };
  }
  return { path: `docs/designs/${id}.md` };
}
