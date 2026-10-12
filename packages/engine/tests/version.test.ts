import { expect, test } from "bun:test";
import { VERSION } from "../src/version.ts";

test("the engine reports the plugin version", () => {
  expect(VERSION).toBe("0.1.4");
});
