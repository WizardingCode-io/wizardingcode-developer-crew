import { expect, test } from "bun:test";
import { nodeDetector } from "../src/detect/node.ts";
import { tempDir, write } from "./helpers.ts";

test("returns null without a package.json", () => {
  expect(nodeDetector.detect(tempDir())).toBeNull();
});

test("maps npm scripts to gates and picks the package manager from the lockfile", () => {
  const dir = tempDir();
  write(
    dir,
    "package.json",
    JSON.stringify({
      scripts: {
        build: "tsc",
        test: "vitest run",
        lint: "eslint .",
        typecheck: "tsc --noEmit",
      },
    }),
  );
  write(dir, "pnpm-lock.yaml", "");
  expect(nodeDetector.detect(dir)).toEqual({
    stack: "node",
    packageManager: "pnpm",
    gates: {
      build: "pnpm run build",
      test: "pnpm run test",
      lint: "pnpm run lint",
      typecheck: "pnpm run typecheck",
    },
  });
});

test("ignores the npm placeholder test script and derives typecheck from tsconfig", () => {
  const dir = tempDir();
  write(
    dir,
    "package.json",
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  );
  write(dir, "tsconfig.json", "{}");
  const found = nodeDetector.detect(dir);
  expect(found?.packageManager).toBe("npm");
  expect(found?.gates.test).toBeUndefined();
  expect(found?.gates.typecheck).toBe("npx tsc --noEmit");
});

test("bun projects run scripts through bun run", () => {
  const dir = tempDir();
  write(dir, "package.json", JSON.stringify({ scripts: { test: "bun test" } }));
  write(dir, "bun.lock", "");
  expect(nodeDetector.detect(dir)?.gates.test).toBe("bun run test");
});
