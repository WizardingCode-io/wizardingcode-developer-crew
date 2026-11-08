// A second process that holds the adapters lock for a test (item 2026-11-08-002, AC-11, AC-27):
// bun tests/fixtures/hold-adapters-lock.ts <lock> <marker> <holdMs> [<file> <text>]. It takes the
// lock, writes the marker once it holds it, sleeps, writes the text to the file when given, and
// releases.
import { writeFileSync } from "node:fs";
import { sleep, withLock } from "../../src/lock.ts";

const [lock, marker, holdMs, file, text] = process.argv.slice(2);
if (!lock || !marker || !holdMs) throw new Error("usage: hold-adapters-lock <lock> <marker> <holdMs> [<file> <text>]");
withLock(
  lock,
  () => {
    writeFileSync(marker, "held\n");
    sleep(Number(holdMs));
    if (file !== undefined && text !== undefined) writeFileSync(file, text);
  },
  { what: "the test's hold", waitMs: 0 },
);
