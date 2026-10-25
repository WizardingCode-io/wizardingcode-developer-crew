import { expect, test } from "bun:test";
import { readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createFreeFile,
  createFreePair,
  jsonText,
  writeJson,
  writeText,
  writeTextNew,
} from "../src/fs.ts";
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

test("the race harness's own check (not a criterion's): with a replacing write in writeTextNew's place, the other writer's text is lost", () => {
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

test("2026-10-25-002 AC-5 (the pair): createFreePair moves past a held second name, removes the first file it created there, and leaves the holder and another file alone", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "p.inputs.json"), "a holder");
  const written = createFreePair(dir, "p", [".md", "plan"], [".inputs.json", "copy"]);
  expect(written).toBe(join(dir, "p-2.md"));
  expect(readFileSync(join(dir, "p-2.inputs.json"), "utf8")).toBe("copy");
  expect(readFileSync(join(dir, "p.inputs.json"), "utf8")).toBe("a holder");
  expect(readdirSync(dir).sort()).toEqual(["p-2.inputs.json", "p-2.md", "p.inputs.json"]);
});

test("2026-10-25-002 AC-5 (a failed copy): when the second write fails for another reason, the first file this call created is removed and the error stands", () => {
  const dir = tempDir();
  const failing = (path: string, text: string): boolean => {
    if (path.endsWith(".inputs.json")) throw new Error("disk full");
    return writeTextNew(path, text);
  };
  expect(() =>
    createFreePair(dir, "p", [".md", "plan"], [".inputs.json", "copy"], failing),
  ).toThrow("disk full");
  expect(readdirSync(dir)).toEqual([]);
});

test("2026-10-25-002 AC-6: jsonText is the engine's JSON form, and writeJson writes it byte for byte", () => {
  const dir = tempDir();
  const data = { a: 1, b: ["x"], c: { d: null } };
  expect(jsonText(data)).toBe(`${JSON.stringify(data, null, 2)}\n`);
  writeJson(join(dir, "d.json"), data);
  expect(readFileSync(join(dir, "d.json"), "utf8")).toBe(jsonText(data));
});
