import { expect, test } from "bun:test";
import { existsSync, mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { breakStale, LockBusy, readUnderLock, readWaitSpent, withLock } from "../src/lock.ts";
import { tempDir } from "./helpers.ts";

/** A folder whose lock is held, dated as the test says. */
function held(at: Date): { dir: string; lock: string } {
  const dir = tempDir();
  const lock = join(dir, ".lock");
  mkdirSync(lock);
  utimesSync(lock, at, at);
  return { dir, lock };
}

test("SP7b-T5 AC-4: a lock dated ahead is never stale, a lock dated eleven seconds back is taken, a fresh lock is waited for and reported busy", () => {
  const ahead = held(new Date(Date.now() + 60_000));
  let ran = false;
  const started = Date.now();
  expect(() => withLock(ahead.dir, () => (ran = true), { waitMs: 300 })).toThrow(LockBusy);
  expect(Date.now() - started).toBeGreaterThanOrEqual(300);
  expect(ran).toBe(false);
  expect(existsSync(ahead.lock)).toBe(true);
  const stale = held(new Date(Date.now() - 11_000));
  expect(withLock(stale.dir, () => "ran", { waitMs: 300 })).toBe("ran");
  expect(existsSync(stale.lock)).toBe(false);
  const fresh = held(new Date());
  const again = Date.now();
  expect(() => withLock(fresh.dir, () => "never", { waitMs: 300 })).toThrow(LockBusy);
  expect(Date.now() - again).toBeGreaterThanOrEqual(300);
  expect(existsSync(fresh.lock)).toBe(true);
});

test("AC-6 (item D, finding 133): several processes breaking the same stale lock at once leave one holder at a time; a breaker that died is taken, a live one is waited for", async () => {
  // Each worker takes the lock and creates a marker exclusively inside it: a second holder fails
  // to create it and exits 3. Sixteen folders, four workers each, all released at one instant.
  const scripts = tempDir("crew-lock-race-");
  const worker = join(scripts, "worker.ts");
  writeFileSync(
    worker,
    `import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { withLock } from "${join(import.meta.dir, "../src/lock.ts")}";
const [dir, at] = [process.argv[2]!, Number(process.argv[3])];
while (Date.now() < at) {}
withLock(dir, () => {
  try {
    writeFileSync(join(dir, "holder"), String(process.pid), { flag: "wx" });
  } catch {
    process.exit(3);
  }
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30);
  rmSync(join(dir, "holder"));
});
`,
  );
  const stale = new Date(Date.now() - 20_000);
  const folders = Array.from({ length: 16 }, () => held(stale).dir);
  const at = Date.now() + 1500;
  const runs = folders.flatMap((dir) =>
    [0, 1, 2, 3].map(() =>
      Bun.spawn(["bun", worker, dir, String(at)], { stdout: "ignore", stderr: "ignore" }),
    ),
  );
  const exits = await Promise.all(runs.map((r) => r.exited));
  expect(exits.filter((e) => e !== 0)).toEqual([]);
  // A breaker its maker left behind is stale too: it is taken and the stale lock broken.
  const orphan = held(stale);
  mkdirSync(`${orphan.lock}.break`);
  utimesSync(`${orphan.lock}.break`, stale, stale);
  expect(withLock(orphan.dir, () => "ran", { waitMs: 300 })).toBe("ran");
  expect(existsSync(`${orphan.lock}.break`)).toBe(false);
  // The breaker reads the age again under its own lock: a lock refreshed since it was read as
  // stale is kept, and the breaker is gone after it.
  const fresh = held(new Date());
  expect(breakStale(fresh.lock)).toBe(false);
  expect(existsSync(fresh.lock)).toBe(true);
  expect(existsSync(`${fresh.lock}.break`)).toBe(false);
  const old = held(stale);
  expect(breakStale(old.lock)).toBe(true);
  expect(existsSync(old.lock)).toBe(false);
  expect(existsSync(`${old.lock}.break`)).toBe(false);
  // A live breaker is another process breaking the lock: never broken under it, waited for.
  const breaking = held(stale);
  mkdirSync(`${breaking.lock}.break`);
  expect(() => withLock(breaking.dir, () => "never", { waitMs: 300 })).toThrow(LockBusy);
  expect(existsSync(breaking.lock)).toBe(true);
}, 30_000);

test("2026-11-11-005 AC-8: a stale lock that cannot be removed ends in LockBusy within the wait, with no spin", () => {
  // A lock twenty seconds old that holds a file: stale, and rmdir fails on it.
  const { dir, lock } = held(new Date(Date.now() - 20_000));
  writeFileSync(join(lock, "left-inside"), "");
  utimesSync(lock, new Date(Date.now() - 20_000), new Date(Date.now() - 20_000));
  // In a child with a bound of its own: a taker that spins never returns, and no test's time limit
  // interrupts a synchronous loop.
  const script = join(tempDir(), "taker.ts");
  writeFileSync(
    script,
    `import { LockBusy, withLock } from "${join(import.meta.dir, "../src/lock.ts")}";
const started = Date.now();
let ran = false;
let outcome = "returned";
try {
  withLock(process.argv[2], () => { ran = true; }, { waitMs: 300 });
} catch (error) {
  outcome = error instanceof LockBusy ? "LockBusy" : String(error);
}
console.log(JSON.stringify({ outcome, ran, ms: Date.now() - started }));
`,
  );
  const run = Bun.spawnSync(["bun", "run", script, dir], { timeout: 5_000 });
  expect(run.exitCode).toBe(0); // null when the bound killed a taker that never returned
  const said = JSON.parse(run.stdout.toString().trim()) as {
    outcome: string;
    ran: boolean;
    ms: number;
  };
  expect(said).toMatchObject({ outcome: "LockBusy", ran: false });
  expect(said.ms).toBeGreaterThanOrEqual(300);
  expect(said.ms).toBeLessThan(2_000);
  expect(existsSync(lock)).toBe(true);
}, 30_000);

test("2026-11-11-005 AC-7 (the read under a lock): what the read itself throws once the lock is taken is thrown, the lock released and no wait spent; and the tests' own guard fails a row that spends the process's one wait", () => {
  const dir = tempDir();
  // The lock is free: the read runs under it, and its own failure is the caller's to see.
  expect(() =>
    readUnderLock(dir, "first", () => {
      throw new Error("the file cannot be read");
    }),
  ).toThrow("the file cannot be read");
  expect(existsSync(join(dir, ".lock"))).toBe(false);
  expect(readUnderLock(dir, "first", () => "read again")).toBe("read again");
  expect(readWaitSpent()).toBe(false);
  // The guard of preload.ts, in a run of its own: a row that makes a read fail to take a lock in
  // the tests' process fails by name, and the row after it does not.
  const fixture = tempDir("crew-guard-");
  writeFileSync(
    join(fixture, "spends.test.ts"),
    `import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { readUnderLock, readWaitSpent } from "${join(import.meta.dir, "../src/lock.ts")}";
test("spends the wait", () => {
  mkdirSync(join(import.meta.dir, ".lock"));
  expect(readUnderLock(import.meta.dir, "first", () => "second", { waitMs: 50 })).toBe("first");
  expect(readWaitSpent()).toBe(true);
});
test("runs after it", () => {
  expect(readUnderLock(import.meta.dir, "kept", () => "second")).toBe("kept");
});
`,
  );
  const run = Bun.spawnSync(
    ["bun", "test", "--preload", join(import.meta.dir, "preload.ts"), "spends.test.ts"],
    { cwd: fixture, timeout: 30_000 },
  );
  const said = `${run.stdout}${run.stderr}`;
  expect(run.exitCode).toBe(1);
  expect(said).toContain("make that read in a child process");
  expect(said).toContain("(fail) spends the wait");
  // One row failed and one passed: the row after it is not failed for the first one's wait.
  expect(said).toMatch(/\n 1 pass\n 1 fail\n/);
}, 60_000);
