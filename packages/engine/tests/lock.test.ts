import { expect, test } from "bun:test";
import { existsSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { LockBusy, withLock } from "../src/lock.ts";
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
