// A page's new look on an established site is `surface` (item 2026-11-18-018): four texts hold one
// definition of `extend`, and none keeps the old one, under which a hero, a new section and a
// reworked page of the user's real project were each recorded `extend` and never scored.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const SKILLS = "plugins/core/skills";
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");

const ONLY =
  "`extend` is only for a control, a state or a fix inside a page whose look stays as it is";
const LOOK =
  "a change to how a page or a section of it looks, a new section, a hero or a new opening, is `surface`, on an established site too";

/** Every Markdown file under a folder, as paths from the repository's root. */
function pages(folder: string): string[] {
  return readdirSync(join(ROOT, folder), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? pages(`${folder}/${entry.name}`)
      : entry.name.endsWith(".md")
        ? [`${folder}/${entry.name}`]
        : [],
  );
}

test("extend AC-1: extend is only a control, a state or a fix; a page's new look is surface on an established site too; and no skill keeps the old rule", () => {
  const brief = repoFile(`${SKILLS}/wizardingcode-design-brief/SKILL.md`);
  for (const file of [
    `${SKILLS}/wizardingcode-design-brief/SKILL.md`,
    `${SKILLS}/crew/references/specify.md`,
  ]) {
    expect(repoFile(file), file).toContain(ONLY);
    expect(repoFile(file), file).toContain(LOOK);
  }
  // The frontend standard is held to its size by another row: it takes the short form.
  expect(repoFile(`${SKILLS}/crew/references/frontend.md`)).toContain(
    "`extend`, a fix that keeps its page's look, takes none of them.",
  );
  expect(brief).toContain("the site was never held to the bar");
  expect(brief).toContain("propose `surface`");
  const description =
    /^description: "(.*)"$/m.exec(repoFile(`${SKILLS}/wizardingcode-design-build/SKILL.md`))?.[1] ??
    "";
  expect(description).toContain("Not for a control, a state or a fix whose page keeps its look.");
  const all = pages(SKILLS);
  expect(all.length).toBeGreaterThan(60);
  for (const file of all)
    for (const old of [
      "that is `extend`",
      "for a change inside an established site",
      "A section inside an established site is `extend`",
      "a small change inside an established site",
      "`extend` inherits and needs nothing more",
    ])
      expect(repoFile(file), `${file}: ${old}`).not.toContain(old);
});
