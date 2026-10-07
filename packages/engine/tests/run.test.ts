import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "../src/run.ts";
import { tempDir } from "./helpers.ts";

test("captures exit code, tail and a log file", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "a.txt");
  const result = await runCommand("echo one; echo two; echo err 1>&2; exit 3", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
  });
  expect(result.exit).toBe(3);
  expect(result.timedOut).toBe(false);
  expect(result.tail).toContain("two");
  expect(result.tail).toContain("err");
  expect(readFileSync(log, "utf8")).toContain("one");
});

test("a hanging command is killed at the timeout, children included", async () => {
  const dir = tempDir();
  const started = Date.now();
  const result = await runCommand("sleep 30 & sleep 30; echo never", {
    cwd: dir,
    timeoutMs: 300,
    logPath: join(dir, "hang.txt"),
  });
  expect(result.timedOut).toBe(true);
  expect(result.exit).not.toBe(0);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(result.tail).not.toContain("never");
});

test("stdin is passed through when given", async () => {
  const dir = tempDir();
  const result = await runCommand("cat", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: join(dir, "c.txt"),
    stdin: "hello",
  });
  expect(result.exit).toBe(0);
  expect(result.tail).toBe("hello");
});
