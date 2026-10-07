import { join } from "node:path";
import { exists, readText } from "../fs.ts";
import type { GateName } from "../types.ts";
import type { DetectedTarget, Detector } from "./types.ts";

const PREFIX: Record<string, string> = {
  uv: "uv run ",
  poetry: "poetry run ",
  pip: "python -m ",
};

export const pythonDetector: Detector = {
  stack: "python",
  detect(dir: string): DetectedTarget | null {
    const pyproject = readText(join(dir, "pyproject.toml"));
    if (pyproject === null && !exists(join(dir, "requirements.txt"))) return null;
    const manager = exists(join(dir, "uv.lock"))
      ? "uv"
      : exists(join(dir, "poetry.lock"))
        ? "poetry"
        : "pip";
    const prefix = PREFIX[manager] ?? "";
    const text = pyproject ?? "";
    const gates: Partial<Record<GateName, string>> = {};
    const hasPytest =
      /\[tool\.pytest/.test(text) ||
      exists(join(dir, "pytest.ini")) ||
      exists(join(dir, "conftest.py")) ||
      exists(join(dir, "tests"));
    if (hasPytest) gates.test = `${prefix}pytest`;
    if (/\[tool\.ruff/.test(text) || exists(join(dir, "ruff.toml"))) {
      gates.lint = `${prefix}ruff check .`;
    }
    if (/\[tool\.mypy/.test(text)) gates.typecheck = `${prefix}mypy .`;
    else if (/\[tool\.pyright/.test(text)) gates.typecheck = `${prefix}pyright`;
    return { stack: "python", packageManager: manager, gates };
  },
};
