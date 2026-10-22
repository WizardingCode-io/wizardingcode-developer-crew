import { mkdirSync, rmdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LOCK_STALE_MS = 10_000;
const LOCK_WAIT_MS = 2_000;

/** Blocks the thread for `ms`: the lock and the hooks are synchronous. */
export function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Milliseconds since `path` was last changed, or null when it is gone. */
function ageOf(path: string): number | null {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Breaks a stale lock under a lock of its own, `<lock>.break` (finding 133): two processes that
 * both read the lock as stale would otherwise both remove it, the second removing the fresh lock
 * the first had just taken. The breaker reads the age again and removes the lock only when it is
 * still stale. A breaker older than the stale age was left by a process that died while breaking
 * and is removed; a live one is another process breaking, waited for. True when the lock is gone.
 */
export function breakStale(lock: string): boolean {
  const breaker = `${lock}.break`;
  try {
    mkdirSync(breaker);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const age = ageOf(breaker);
    if (age !== null && age > LOCK_STALE_MS) {
      try {
        rmdirSync(breaker);
      } catch {
        // another process took it first
      }
    }
    return false;
  }
  try {
    const age = ageOf(lock);
    if (age === null) return true;
    if (age <= LOCK_STALE_MS) return false;
    try {
      rmdirSync(lock);
    } catch {
      // gone already
    }
    return true;
  } finally {
    try {
      rmdirSync(breaker);
    } catch {
      // already removed
    }
  }
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
    // gone between the two calls (null): taken again below, within the same wait
    const age = ageOf(lock);
    if (age !== null && age > LOCK_STALE_MS && breakStale(lock)) continue;
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
