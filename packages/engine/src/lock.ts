import { mkdirSync, rmdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 2_000;

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** The lock was still held after the wait: the one failure of `withLock` a caller may pass by. */
export class LockBusy extends Error {}

/**
 * One writer at a time per folder: the lock is a folder, created atomically, held for the
 * duration of `fn`. A lock older than ten seconds was left by a process that died and is taken;
 * a lock still fresh after the wait is reported, never broken (SP2c review focus 1). `what` names
 * the folder in that report (a mailbox, a work folder).
 */
export function withLock<T>(
  dir: string,
  fn: () => T,
  options: { waitMs?: number; what?: string } = {},
): T {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, ".lock");
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      // Only another holder is contention; anything else (no permission, no space) is thrown, as
      // the neighbours throw it.
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    let age: number | null = null;
    try {
      age = Date.now() - statSync(lock).mtimeMs;
    } catch {
      // gone between the two calls: taken again below, within the same wait
    }
    if (age !== null && age > LOCK_STALE_MS) {
      try {
        rmdirSync(lock);
      } catch {
        // another process took it first
      }
      continue;
    }
    if (Date.now() - started >= waitMs)
      throw new LockBusy(
        `${options.what ?? "folder"} busy: ${lock} held for more than ${waitMs} ms`,
      );
    if (age !== null) sleep(20);
  }
  try {
    return fn();
  } finally {
    try {
      rmdirSync(lock);
    } catch {
      // already released
    }
  }
}
