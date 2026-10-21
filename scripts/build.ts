import { statSync } from "node:fs";
import { readJson } from "../packages/engine/src/fs.ts";
import { VERSION } from "../packages/engine/src/version.ts";
import { archiveKilobytes, buildTarball } from "./tarball.ts";

const outdir = "plugins/core/dist";
const manifest = readJson<{ version: string }>("plugins/core/.claude-plugin/plugin.json");
if (manifest?.version !== VERSION) {
  console.error(
    `plugin.json version ${manifest?.version} does not match engine version ${VERSION}`,
  );
  process.exit(1);
}
const result = await Bun.build({
  entrypoints: ["packages/engine/src/crew.ts"],
  outdir,
  naming: "[name].mjs",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "none",
});
if (!result.success) {
  for (const log of result.logs) console.error(String(log));
  process.exit(1);
}
const size = statSync(`${outdir}/crew.mjs`).size;
if (size > 2 * 1024 * 1024) {
  console.error(`bundle is ${size} bytes, over the 2 MB limit`);
  process.exit(1);
}
console.log(`built ${outdir}/crew.mjs (${Math.round(size / 1024)} KB) for version ${VERSION}`);
// The release asset for the other runtimes (SP6 Task 4): the plugin folder as one archive.
if (process.argv.includes("--tarball")) {
  const archive = buildTarball(VERSION, "dist");
  console.log(`built ${archive} (${archiveKilobytes(archive)} KB)`);
}
