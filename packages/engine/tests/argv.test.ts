import { expect, test } from "bun:test";
import { commaList, parse } from "../src/argv.ts";

test("SP8-T1 AC-5 (finding 88): commaList reads a comma-separated flag into its trimmed non-empty words, and nothing from an absent or boolean flag", () => {
  expect(commaList("a, b,,c ")).toEqual(["a", "b", "c"]);
  expect(commaList(undefined)).toEqual([]);
  expect(commaList(true)).toEqual([]);
  expect(commaList("")).toEqual([]);
  expect(commaList(parse(["x", "--only", "test,lint"]).flags.only)).toEqual(["test", "lint"]);
});
