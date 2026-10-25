import { expect, test } from "bun:test";
import { readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeText, writeTextNew } from "../src/fs.ts";
import { createFreeFile } from "../src/knowledge.ts";
import { tempDir } from "./helpers.ts";

test("2026-10-25-001 AC-6: createFreeFile never writes over a file another writer created after the name was free; writeTextNew refuses a taken name or a dangling link, leaves no temporary file and throws any other error", () => {
  const dir = tempDir();
  // Another writer creates <base>.json between the free check and the write.
  const racing = (write: (path: string, text: string) => boolean) => {
    let first = true;
    return (path: string, text: string): boolean => {
      if (first) {
        first = false;
        writeFileSync(path, "the other writer's plan");
      }
      return write(path, text);
    };
  };
  const written = createFreeFile(dir, "2026-10-25-plan", ".md", "this plan", racing(writeTextNew));
  expect(written).toBe(join(dir, "2026-10-25-plan-2.md"));
  expect(readFileSync(join(dir, "2026-10-25-plan.md"), "utf8")).toBe("the other writer's plan");
  expect(readFileSync(written, "utf8")).toBe("this plan");
  // With the replacing write in its place, the other writer's text is lost: the test catches it.
  const lossy = tempDir();
  createFreeFile(
    lossy,
    "2026-10-25-plan",
    ".md",
    "this plan",
    racing((path, text) => {
      writeText(path, text);
      return true;
    }),
  );
  expect(readFileSync(join(lossy, "2026-10-25-plan.md"), "utf8")).not.toBe(
    "the other writer's plan",
  );
  // A taken name and a dangling link both refuse; nothing is left behind.
  expect(writeTextNew(join(dir, "2026-10-25-plan.md"), "x")).toBe(false);
  expect(readFileSync(join(dir, "2026-10-25-plan.md"), "utf8")).toBe("the other writer's plan");
  symlinkSync(join(dir, "nowhere"), join(dir, "dangling.md"));
  expect(writeTextNew(join(dir, "dangling.md"), "x")).toBe(false);
  expect(readdirSync(dir).filter((name) => name.includes(".tmp"))).toEqual([]);
  // Any other error is thrown, never read as a taken name.
  expect(() => writeTextNew(join(dir, "missing-folder", "a.md"), "x")).toThrow();
});
