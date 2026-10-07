import type { GateName, Stack } from "../types.ts";

export interface DetectedTarget {
  stack: Stack;
  packageManager: string;
  gates: Partial<Record<GateName, string>>;
}

export interface Detector {
  stack: Stack;
  /** Returns null when the folder holds no manifest for this stack. */
  detect(dir: string): DetectedTarget | null;
}
