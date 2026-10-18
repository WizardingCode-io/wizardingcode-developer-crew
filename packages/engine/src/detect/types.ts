import type { GateName, Stack } from "../types.ts";

export interface DetectedTarget {
  stack: Stack;
  packageManager: string;
  gates: Partial<Record<GateName, string>>;
  /** A test command narrowed to given files (SP7 §8.1), with `{files}` where they go. */
  testScoped?: string;
  /** Globs of the folders this manifest lists as workspaces, relative to its folder. */
  workspaces?: string[];
  /** True when the detector had to guess (several lockfiles, no declared package manager): the commands are proposed, not detected, so the first session is asked to confirm them. */
  proposed?: boolean;
  /** Gates whose command is a guess from a config file rather than a script (the e2e runner): proposed whatever the manager. */
  proposedGates?: GateName[];
}

export interface Detector {
  stack: Stack;
  /** Returns null when the folder holds no manifest for this stack. */
  detect(dir: string): DetectedTarget | null;
}
