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

test("0.3.0: node test:* scripts: test:lint is the lint gate over a fixing lint, test:types the typecheck gate, and bun test is detected without a test script", () => {
  const dir = tempDir();
  write(
    dir,
    "package.json",
    JSON.stringify({
      scripts: {
        lint: "vp lint --fix",
        "test:lint": "vp lint",
        "test:types": "vue-tsc --noEmit",
        test: "vitest run",
        "test:watch": "vitest",
      },
    }),
  );
  write(dir, "bun.lock", "");
  expect(nodeDetector.detect(dir)?.gates).toEqual({
    lint: "bun run test:lint",
    typecheck: "bun run test:types",
    test: "bun run test",
  });
  // No test script, bun and a bunfig.toml: bun test.
  const bun = tempDir();
  write(bun, "package.json", JSON.stringify({ scripts: { build: "vp build" } }));
  write(bun, "bun.lock", "");
  write(bun, "bunfig.toml", "[test]\n");
  expect(nodeDetector.detect(bun)?.gates.test).toBe("bun test");
  // No test script and nothing that says bun test: no test gate, as before.
  const none = tempDir();
  write(none, "package.json", JSON.stringify({ scripts: { build: "vp build" } }));
  write(none, "bun.lock", "");
  expect(nodeDetector.detect(none)?.gates.test).toBeUndefined();
  // Without a test script the other test:* scripts compose the test gate; watch, ui, e2e stay out.
  const composed = tempDir();
  write(
    composed,
    "package.json",
    JSON.stringify({
      scripts: {
        "test:unit": "vitest run",
        "test:integration": "vitest run --dir tests/integration",
        "test:e2e": "playwright test",
        "test:ui": "vitest --ui",
        "test:watch": "vitest",
      },
    }),
  );
  write(composed, "package-lock.json", "");
  expect(nodeDetector.detect(composed)?.gates.test).toBe(
    "npm run test:unit && npm run test:integration",
  );
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
