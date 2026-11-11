import { afterAll } from "bun:test";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { enterRun, removeTempDirs, runsHome, sweepDeadRuns } from "./helpers.ts";

// Named by both bunfig.toml files (the root's and the engine's). Every run of the tests gets a
// temporary folder of its own, beside the system's: each fixture lands in it, registered with
// tempDir or made by a test's own mkdtempSync, and leaves with it when the run ends (findings 74
// and 234); the sweep removes the folders of runs that were killed before their end.
// WIZARDINGCODE_CREW_KEEP_FIXTURES=1 keeps them. The per-test timeout is not set here: bun 1.3.9
// reads no timeout key from bunfig.toml and applies a preload's setDefaultTimeout to one file only,
// so the root script carries --timeout 30000 and the tests that run commands or sleep declare
// their own budget.
const home = runsHome(realpathSync(tmpdir()));
sweepDeadRuns(home);
const run = enterRun(home);

afterAll(() => {
  removeTempDirs();
  run.leave();
});
