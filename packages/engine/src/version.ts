export const VERSION = "0.23.3";

/** Two `X.Y.Z` versions compared part by part: -1, 0 or 1 as `a` is older than, equal to or newer than `b`. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d > 0) return 1;
    if (d < 0) return -1;
  }
  return 0;
}
