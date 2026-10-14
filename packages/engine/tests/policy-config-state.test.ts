import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig, setConfigValue } from "../src/config.ts";
import { DEFAULT_POLICY, loadPolicy, skipAllowed } from "../src/policy.ts";
import { ensureCrewDir, loadState, saveState, sessionState } from "../src/state.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

test("policy: defaults when absent, validated when present, unknown values ignored", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(loadPolicy(paths)).toEqual({ policy: DEFAULT_POLICY, tampered: false });
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({
      requiredGates: ["lint", "bogus"],
      minimumRoute: "standard",
      allowSkips: ["lint"],
      artifacts: "local",
      riskPaths: { payments: ["app/Billing/**"] },
    }),
  );
  const { policy } = loadPolicy(paths);
  expect(policy.requiredGates).toEqual(["lint"]);
  expect(policy.minimumRoute).toBe("standard");
  expect(policy.artifacts).toBe("local");
  expect(skipAllowed(policy, "gate:lint")).toBe(true);
  expect(skipAllowed(policy, "gate:test")).toBe(false);
  expect(skipAllowed(DEFAULT_POLICY, "anything")).toBe(true);
});

test("policy: riskPathExclusions is a list of globs, empty by default, non-strings ignored", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.riskPathExclusions).toEqual([]);
  expect(loadPolicy(paths).policy.riskPathExclusions).toEqual([]);
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({ riskPathExclusions: ["plugins/core/hooks/session-*.ts", 7, null, "docs/**"] }),
  );
  expect(loadPolicy(paths).policy.riskPathExclusions).toEqual([
    "plugins/core/hooks/session-*.ts",
    "docs/**",
  ]);
  writeFileSync(join(paths.crewDir, "policy.json"), JSON.stringify({ riskPathExclusions: "x" }));
  expect(loadPolicy(paths).policy.riskPathExclusions).toEqual([]);
});

test("config: defaults, set values, reject unknown keys and values", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(loadConfig(paths)).toEqual({ mode: "partner", decisions: { log: true } });
  const next = setConfigValue(loadConfig(paths), "decisions.log", "false");
  saveConfig(paths, setConfigValue(next, "mode", "pilot"));
  expect(loadConfig(paths)).toEqual({ mode: "pilot", decisions: { log: false } });
  expect(() => setConfigValue(next, "mode", "captain")).toThrow(/mode/);
  expect(() => setConfigValue(next, "colour", "red")).toThrow(/unknown/);
});

test("state: per-session entries and the .crew/.gitignore", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  ensureCrewDir(paths, DEFAULT_POLICY);
  expect(readFileSync(join(paths.crewDir, ".gitignore"), "utf8")).toBe("local/\nwork/*/logs/\n");
  ensureCrewDir(paths, { ...DEFAULT_POLICY, artifacts: "local" });
  expect(readFileSync(join(paths.crewDir, ".gitignore"), "utf8")).toBe(
    "local/\nwork/*/logs/\nwork/\n",
  );
  const state = loadState(paths);
  expect(state).toEqual({ active: null, sessions: {} });
  const session = sessionState(state, "s1");
  session.baseline = "sha256:abc";
  session.stopBlocks = 2;
  state.active = "w1";
  saveState(paths, state);
  expect(loadState(paths)).toEqual({
    active: "w1",
    sessions: { s1: { baseline: "sha256:abc", stopBlocks: 2 } },
  });
});
