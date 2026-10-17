import { expect, test } from "bun:test";
import { phpDetector } from "../src/detect/php.ts";
import { pythonDetector } from "../src/detect/python.ts";
import { tempDir, write } from "./helpers.ts";

test("php: composer scripts win, installed tools fill the rest", () => {
  const dir = tempDir();
  write(dir, "composer.json", JSON.stringify({ scripts: { test: "pest" } }));
  write(dir, "vendor/bin/pint", "");
  write(dir, "vendor/bin/phpstan", "");
  expect(phpDetector.detect(dir)).toEqual({
    stack: "php",
    packageManager: "composer",
    gates: {
      test: "composer run test",
      lint: "vendor/bin/pint --test",
      typecheck: "vendor/bin/phpstan analyse --no-progress",
    },
  });
});

test("0.3.0: composer test:* scripts follow the team's convention: test:lint is the lint gate, test:types the typecheck gate, the rest plus the runner the test gate", () => {
  const dir = tempDir();
  write(
    dir,
    "composer.json",
    JSON.stringify({
      scripts: {
        lint: "pint",
        "test:lint": "pint --test",
        "test:types": "phpstan",
        "test:type-coverage": "pest --type-coverage",
        "test:watch": "pest --watch",
        setup: ["composer install"],
      },
    }),
  );
  write(dir, "vendor/bin/pest", "");
  write(dir, "vendor/bin/pint", "");
  expect(phpDetector.detect(dir)?.gates).toEqual({
    lint: "composer run test:lint",
    typecheck: "composer run test:types",
    test: "composer run test:type-coverage && vendor/bin/pest",
  });
  // A test script of its own still owns the test gate; the check forms still feed lint and typecheck.
  write(
    dir,
    "composer.json",
    JSON.stringify({ scripts: { test: "pest", "test:lint": "pint --test", analyse: "phpstan" } }),
  );
  expect(phpDetector.detect(dir)?.gates).toEqual({
    test: "composer run test",
    lint: "composer run test:lint",
    typecheck: "composer run analyse",
  });
});

test("php: phpunit is used when pest is absent, and nothing without composer.json", () => {
  const dir = tempDir();
  write(dir, "composer.json", "{}");
  write(dir, "vendor/bin/phpunit", "");
  expect(phpDetector.detect(dir)?.gates.test).toBe("vendor/bin/phpunit");
  expect(phpDetector.detect(tempDir())).toBeNull();
});

test("python: uv projects run tools through uv run", () => {
  const dir = tempDir();
  write(dir, "pyproject.toml", "[tool.pytest.ini_options]\n[tool.ruff]\n[tool.mypy]\n");
  write(dir, "uv.lock", "");
  expect(pythonDetector.detect(dir)).toEqual({
    stack: "python",
    packageManager: "uv",
    gates: { test: "uv run pytest", lint: "uv run ruff check .", typecheck: "uv run mypy ." },
    testScoped: "uv run pytest {files}",
  });
});

test("SP7a AC-1 (Task 6): a pytest project gets a scoped test template through its runner; a project without pytest gets none", () => {
  const uv = tempDir();
  write(uv, "pyproject.toml", "[tool.pytest.ini_options]\n");
  write(uv, "uv.lock", "");
  expect(pythonDetector.detect(uv)?.testScoped).toBe("uv run pytest {files}");
  const bare = tempDir();
  write(bare, "pyproject.toml", "[project]\nname = 'x'\n");
  expect(pythonDetector.detect(bare)?.testScoped).toBeUndefined();
});

test("python: a requirements.txt project with a tests folder uses python -m", () => {
  const dir = tempDir();
  write(dir, "requirements.txt", "pytest\n");
  write(dir, "tests/test_a.py", "");
  const found = pythonDetector.detect(dir);
  expect(found?.packageManager).toBe("pip");
  expect(found?.gates).toEqual({ test: "python -m pytest" });
});
