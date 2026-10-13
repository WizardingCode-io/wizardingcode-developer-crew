import { expect, test } from "bun:test";
import { detectProfile } from "../src/detect/index.ts";
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

test("finding 13: the packageManager field wins; several lockfiles without it make the commands proposed", () => {
  const declared = tempDir();
  write(
    declared,
    "package.json",
    JSON.stringify({ packageManager: "pnpm@9.1.0", scripts: { test: "vitest" } }),
  );
  write(declared, "bun.lock", "");
  write(declared, "pnpm-lock.yaml", "");
  expect(nodeDetector.detect(declared)).toEqual({
    stack: "node",
    packageManager: "pnpm",
    gates: { test: "pnpm run test" },
  });
  const unsure = tempDir();
  write(unsure, "package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  write(unsure, "bun.lock", "");
  write(unsure, "pnpm-lock.yaml", "");
  expect(nodeDetector.detect(unsure)).toEqual({
    stack: "node",
    packageManager: "bun",
    gates: { test: "bun run test" },
    proposed: true,
  });
  expect(detectProfile(unsure).targets[0]?.gates.test).toEqual({
    command: "bun run test",
    source: "proposed",
  });
  // One lockfile, or none, is as certain as before.
  const one = tempDir();
  write(one, "package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  write(one, "yarn.lock", "");
  expect(detectProfile(one).targets[0]?.gates.test).toEqual({
    command: "yarn run test",
    source: "detected",
  });
});
