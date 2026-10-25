import { expect, test } from "bun:test";
import { readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createFreeFile, writeText, writeTextNew } from "../src/fs.ts";
import { tempDir } from "./helpers.ts";

/** A write that lets another writer create the first name it is given just before it writes. */
function racing(write: (path: string, text: string) => boolean) {
  let first = true;
  return (path: string, text: string): boolean => {
    if (first) {
      first = false;
      writeFileSync(path, "the other writer's plan");
    }
    return write(path, text);
  };
}

test("2026-10-25-001 AC-6 (the race): createFreeFile moves to the next name when another writer took the free one before the write, and both texts are kept", () => {
  const dir = tempDir();
  const written = createFreeFile(dir, "2026-10-25-plan", ".md", "this plan", racing(writeTextNew));
  expect(written).toBe(join(dir, "2026-10-25-plan-2.md"));
  expect(readFileSync(join(dir, "2026-10-25-plan.md"), "utf8")).toBe("the other writer's plan");
  expect(readFileSync(written, "utf8")).toBe("this plan");
});

test("2026-10-25-001 AC-6 (the control): with a replacing write in writeTextNew's place, the other writer's text is lost", () => {
  const dir = tempDir();
  const replacing = (path: string, text: string): boolean => {
    writeText(path, text);
    return true;
  };
  createFreeFile(dir, "2026-10-25-plan", ".md", "this plan", racing(replacing));
  expect(readFileSync(join(dir, "2026-10-25-plan.md"), "utf8")).toBe("this plan");
});

test("2026-10-25-001 AC-6 (a held name): writeTextNew returns false for a taken name and leaves it as it was", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "a.md"), "kept");
  expect(writeTextNew(join(dir, "a.md"), "x")).toBe(false);
  expect(readFileSync(join(dir, "a.md"), "utf8")).toBe("kept");
});

test("2026-10-25-001 AC-6 (a dangling link): writeTextNew returns false for a name a link to nothing holds", () => {
  const dir = tempDir();
  symlinkSync(join(dir, "nowhere"), join(dir, "dangling.md"));
  expect(writeTextNew(join(dir, "dangling.md"), "x")).toBe(false);
});

test("2026-10-25-001 AC-6 (no temporary file): writeTextNew leaves nothing but the files it was given, written or refused", () => {
  const dir = tempDir();
  expect(writeTextNew(join(dir, "a.md"), "x")).toBe(true);
  expect(writeTextNew(join(dir, "a.md"), "y")).toBe(false);
  expect(readdirSync(dir)).toEqual(["a.md"]);
});

test("2026-10-25-001 AC-6 (other errors): writeTextNew throws an error that is not a taken name", () => {
  const dir = tempDir();
  expect(() => writeTextNew(join(dir, "missing-folder", "a.md"), "x")).toThrow();
});
