// Runs the design-detect gate's own runner once against the real detector (item 2026-11-17-001,
// AC-29): `bun scripts/design-detect-observe.ts`. It needs the network on a first run. The two pages
// are held here as strings and written into a temporary project of the script's own, outside this
// repository and removed at the end, so no interface file enters the repository. It prints one
// line per page: the gate's status, the detector's exit and the gate's output. Exit 0 when the
// first page fails naming `side-tab` and the second passes, 1 otherwise.

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DETECTOR_VERSION, runDesignDetect } from "../packages/engine/src/design-detect.ts";
import { resolvePaths } from "../packages/engine/src/paths.ts";
import type { WorkItem } from "../packages/engine/src/types.ts";

const PAGES: Record<string, string> = {
  "side-tab.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>A card</title>
<style>
body { font-family: Georgia, serif; color: #111; background: #fff; }
.card { border-left: 4px solid #0a5; border-radius: 12px; padding: 16px; }
</style></head>
<body><main><h1>Orders</h1><div class="card"><p>Three orders wait for dispatch.</p></div></main></body>
</html>
`,
  "clean.html": `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>A page</title>
<style>
body { font-family: Georgia, serif; color: #111; background: #fff; }
</style></head>
<body><main><h1>Orders</h1><p>Three orders wait for dispatch.</p></main></body>
</html>
`,
};

const root = realpathSync(mkdtempSync(join(tmpdir(), "crew-design-detect-observe-")));
let ok = true;
try {
  mkdirSync(join(root, ".crew"));
  for (const [name, text] of Object.entries(PAGES)) writeFileSync(join(root, name), text);
  const paths = resolvePaths(root, { ...process.env, WIZARDINGCODE_HOME: join(root, ".home") });
  if (!paths) throw new Error(`crew is inactive in ${root}`);
  const work = { id: "observe" } as WorkItem;
  console.log(`impeccable@${DETECTOR_VERSION}, ${new Date().toISOString().slice(0, 10)}`);
  for (const name of Object.keys(PAGES)) {
    const run = await runDesignDetect({ paths, work, files: [name] });
    console.log(
      `${name}: ${run.status}, exit ${run.exit}, output: ${run.tail.split("\n").join(" | ")}`,
    );
    const expected =
      name === "side-tab.html"
        ? run.status === "fail" &&
          run.exit === 2 &&
          /(^|\n)side-tab side-tab\.html:\d+/.test(run.tail)
        : run.status === "pass" && run.exit === 0;
    if (!expected) ok = false;
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
