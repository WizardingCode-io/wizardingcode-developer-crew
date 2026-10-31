/** A failed run's wait in hours: an hour, doubling per failure, a day at most. */
export function backoffHours(failures: number): number {
  return Math.min(2 ** Math.max(0, failures - 1), 24);
}
