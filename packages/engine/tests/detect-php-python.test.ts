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
  });
});

test("python: a requirements.txt project with a tests folder uses python -m", () => {
  const dir = tempDir();
  write(dir, "requirements.txt", "pytest\n");
  write(dir, "tests/test_a.py", "");
  const found = pythonDetector.detect(dir);
  expect(found?.packageManager).toBe("pip");
  expect(found?.gates).toEqual({ test: "python -m pytest" });
});
