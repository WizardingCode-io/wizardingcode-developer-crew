import { expect, test } from "bun:test";
import { matchesAny } from "../src/glob.ts";

test("** matches zero or more directories", () => {
  expect(matchesAny("README.md", ["**/*.md"])).toBe(true);
  expect(matchesAny("docs/guide/a.md", ["**/*.md"])).toBe(true);
  expect(matchesAny("src/a.ts", ["**/*.md"])).toBe(false);
});

test("a trailing ** matches everything below a folder but not the folder itself", () => {
  expect(matchesAny("docs/a.txt", ["docs/**"])).toBe(true);
  expect(matchesAny("docs", ["docs/**"])).toBe(false);
  expect(matchesAny(".crew/work/x/work.json", [".crew/**"])).toBe(true);
});

test("* does not cross a slash and matching ignores case", () => {
  expect(matchesAny("app/Auth/Login.php", ["**/auth/**"])).toBe(true);
  expect(matchesAny("a/b.env", ["*.env"])).toBe(false);
  expect(matchesAny(".env.local", [".env*"])).toBe(true);
  expect(matchesAny("./src/x.ts", ["src/*.ts"])).toBe(true);
});
