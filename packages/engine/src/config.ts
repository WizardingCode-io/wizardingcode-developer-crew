import { join } from "node:path";
import { readJson, writeJson } from "./fs.ts";
import type { CrewPaths } from "./paths.ts";
import type { Mode, UserConfig } from "./types.ts";

export const DEFAULT_CONFIG: UserConfig = { mode: "partner", decisions: { log: true } };
const MODES: Mode[] = ["partner", "guide", "pilot"];

export function configPath(paths: CrewPaths): string {
  return join(paths.userDir, "config.json");
}

export function loadConfig(paths: CrewPaths): UserConfig {
  const raw = readJson<Partial<UserConfig>>(configPath(paths)) ?? {};
  return {
    mode: MODES.includes(raw.mode as Mode) ? (raw.mode as Mode) : DEFAULT_CONFIG.mode,
    decisions: { log: raw.decisions?.log !== false },
  };
}

export function saveConfig(paths: CrewPaths, config: UserConfig): void {
  writeJson(configPath(paths), config);
}

export function setConfigValue(config: UserConfig, key: string, value: string): UserConfig {
  if (key === "mode") {
    if (!MODES.includes(value as Mode)) throw new Error(`mode must be one of ${MODES.join(", ")}`);
    return { ...config, mode: value as Mode };
  }
  if (key === "decisions.log") {
    if (value !== "true" && value !== "false")
      throw new Error("decisions.log must be true or false");
    return { ...config, decisions: { log: value === "true" } };
  }
  throw new Error(`unknown setting: ${key}`);
}
