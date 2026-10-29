import { expect, test } from "bun:test";
import { detectProfile } from "../src/detect/index.ts";
import { nodeDetector } from "../src/detect/node.ts";
import { GATE_NAMES } from "../src/types.ts";
import { tempDir, write } from "./helpers.ts";

test("returns null without a package.json", () => {
  expect(nodeDetector.detect(tempDir())).toBeNull();
});

test("SP7a AC-1 (Task 6): a project with vitest or jest gets a scoped test template; one with neither gets none", () => {
  const vitest = tempDir();
  write(
    vitest,
    "package.json",
    JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "^2" } }),
  );
  expect(nodeDetector.detect(vitest)?.testScoped).toBe("vitest related {files} --run");
  expect(detectProfile(vitest).targets[0]?.testScoped).toEqual({
    command: "vitest related {files} --run",
    source: "detected",
  });
  const jest = tempDir();
  write(
    jest,
    "package.json",
    JSON.stringify({ scripts: { test: "jest" }, dependencies: { jest: "^29" } }),
  );
  expect(nodeDetector.detect(jest)?.testScoped).toBe("jest --findRelatedTests {files}");
  const plain = tempDir();
  write(plain, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
  expect(nodeDetector.detect(plain)?.testScoped).toBeUndefined();
  expect(detectProfile(plain).targets[0]?.testScoped).toBeUndefined();
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

test("SP7b-T4 AC-1: the e2e command comes from a test:e2e or e2e script (detected) or from a Playwright or Cypress config (proposed); test:e2e stays out of the test gate; GATE_NAMES ends with e2e", () => {
  const playwright = tempDir();
  write(playwright, "package.json", JSON.stringify({ scripts: { test: "vitest run" } }));
  write(playwright, "playwright.config.ts", "export default {};");
  const pw = detectProfile(playwright).targets[0];
  expect(pw?.gates.e2e).toEqual({ command: "npx playwright test", source: "proposed" });
  expect(pw?.gates.test).toEqual({ command: "npm run test", source: "detected" });
  const cypress = tempDir();
  write(cypress, "package.json", JSON.stringify({ scripts: {} }));
  write(cypress, "cypress.config.js", "module.exports = {};");
  expect(detectProfile(cypress).targets[0]?.gates.e2e).toEqual({
    command: "npx cypress run",
    source: "proposed",
  });
  const script = tempDir();
  write(
    script,
    "package.json",
    JSON.stringify({ scripts: { "test:unit": "vitest run", "test:e2e": "playwright test" } }),
  );
  write(script, "bun.lock", "");
  const byScript = detectProfile(script).targets[0];
  expect(byScript?.gates.e2e).toEqual({ command: "bun run test:e2e", source: "detected" });
  expect(byScript?.gates.test).toEqual({ command: "bun run test:unit", source: "detected" });
  const plain = tempDir();
  write(plain, "package.json", JSON.stringify({ scripts: { e2e: "cypress run" } }));
  write(plain, "bun.lock", "");
  expect(detectProfile(plain).targets[0]?.gates.e2e).toEqual({
    command: "bun run e2e",
    source: "detected",
  });
  // SP9-T6 AC-1 edits this line: design-lint joins right after secrets; the list still ends with e2e.
  expect(GATE_NAMES).toEqual([
    "build",
    "test",
    "lint",
    "typecheck",
    "secrets",
    "prose",
    "design-lint",
    "deps",
    "e2e",
  ]);
  // A script named after the built-in gate proposes no command: the gate has none (SP9-T6 AC-1).
  const lintScript = tempDir();
  write(
    lintScript,
    "package.json",
    JSON.stringify({ scripts: { "design-lint": "stylelint .", test: "vitest run" } }),
  );
  const gates = detectProfile(lintScript).targets[0]?.gates as Record<string, unknown> | undefined;
  expect(gates?.["design-lint"]).toBeUndefined();
  expect(gates?.test).toEqual({ command: "npm run test", source: "detected" });
});
