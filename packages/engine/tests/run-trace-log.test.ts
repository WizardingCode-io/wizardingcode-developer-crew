import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "../src/run.ts";
import { tempDir } from "./helpers.ts";

// Its own file, importing `runCommand` alone, so the row runs on the code before the trace existed
// (where `events` is ignored) and after it: the preserve pair of 2026-11-02-002 AC-8 (finding 220).

test("2026-11-02-002 AC-6 (AC-8): the trace leaves the log and the result as they are without it", async () => {
  const dir = tempDir();
  const command = "echo one; echo two; echo err 1>&2; exit 3";
  const tracedLog = join(dir, "logs", "traced.txt");
  const plainLog = join(dir, "logs", "plain.txt");
  const traced = await runCommand(command, {
    cwd: dir,
    timeoutMs: 5000,
    logPath: tracedLog,
    events: true,
  });
  const plain = await runCommand(command, { cwd: dir, timeoutMs: 5000, logPath: plainLog });
  expect(readFileSync(tracedLog, "utf8")).toBe(readFileSync(plainLog, "utf8"));
  expect({ exit: traced.exit, tail: traced.tail, timedOut: traced.timedOut }).toEqual({
    exit: plain.exit,
    tail: plain.tail,
    timedOut: plain.timedOut,
  });
  expect(Object.keys(traced).sort()).toEqual(Object.keys(plain).sort());
});
