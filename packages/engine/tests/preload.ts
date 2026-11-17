import { afterAll, afterEach } from "bun:test";
import { chmodSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { readWaitSpent } from "../src/lock.ts";
import { enterRun, removeTempDirs, runsHome, sweepDeadRuns, tempDir } from "./helpers.ts";

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

// No test reaches the network or the real detector (item 2026-11-17-001): a stand-in named `npx`
// stands first on the PATH of the tests' process, in the run's own folder, and leaves with it. It
// answers the design-detect gate's call alone, with no finding; any other call fails by name, so
// a test that meant another `npx` command never passes on an empty array.
const standIn = tempDir("crew-npx-");
writeFileSync(
  join(standIn, "npx"),
  `#!/bin/sh
for word in "$@"; do
  case "$word" in
    impeccable@*) echo "[]"; exit 0 ;;
  esac
done
echo "the tests' stand-in npx answers the design-detect gate alone: $*" >&2
exit 64
`,
);
chmodSync(join(standIn, "npx"), 0o755);
process.env.PATH = `${standIn}${delimiter}${process.env.PATH ?? ""}`;

// The removal has a budget of its own: a run started without the root script's --timeout gets bun's
// 5 seconds for a hook, which the fixtures of three of the larger files together pass (5.2 s
// measured on 2026-11-13, item 2026-11-13-005), and a slow removal is no failed test.
afterAll(() => {
  removeTempDirs();
  run.leave();
}, 120_000);

// A process waits for a lock on a read at most once (finding 239, `readUnderLock`), and the files
// of a run share this process: a row that makes a read fail to take a lock here would leave every
// later row with reads that are never made again under a lock. So such a read belongs in a child
// process, and the row that makes one here fails, once, by name.
let spentReported = false;
afterEach(() => {
  if (spentReported || !readWaitSpent()) return;
  spentReported = true;
  throw new Error(
    "this row made a read fail to take a lock in the tests' own process, which spends the one wait every later row shares: make that read in a child process",
  );
});
