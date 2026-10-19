import { join } from "node:path";
import { readJson, writeJson } from "./fs.ts";
import { endpointRefusal } from "./jev.ts";
import type { CrewPaths } from "./paths.ts";
import type { Mode, UserConfig } from "./types.ts";

export const DEFAULT_CONFIG: UserConfig = { mode: "partner", decisions: { log: true } };
const MODES: Mode[] = ["partner", "guide", "pilot"];

// Only the user folder is needed, so settings work even where crew is inactive.
type UserPaths = Pick<CrewPaths, "userDir">;

export function configPath(paths: UserPaths): string {
  return join(paths.userDir, "config.json");
}

const MODEL_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export function loadConfig(paths: UserPaths): UserConfig {
  const raw = readJson<Partial<UserConfig>>(configPath(paths)) ?? {};
  const jev: UserConfig["jev"] = {};
  if (typeof raw.jev?.endpoint === "string" && endpointRefusal(raw.jev.endpoint) === null)
    jev.endpoint = raw.jev.endpoint;
  if (typeof raw.jev?.model === "string" && MODEL_NAME.test(raw.jev.model))
    jev.model = raw.jev.model;
  return {
    mode: MODES.includes(raw.mode as Mode) ? (raw.mode as Mode) : DEFAULT_CONFIG.mode,
    decisions: { log: raw.decisions?.log !== false },
    ...(Object.keys(jev).length ? { jev } : {}),
  };
}

export function saveConfig(paths: UserPaths, config: UserConfig): void {
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
  // Where Jev is reached (SP3 decision 8): the key never lives here, and the endpoint is one the key may travel to.
  if (key === "jev.endpoint") {
    const refused = endpointRefusal(value);
    if (refused)
      throw new Error(
        `jev.endpoint is an https URL, an http URL to a loopback host, or a file:// path, with no userinfo: ${refused}`,
      );
    return { ...config, jev: { ...config.jev, endpoint: value } };
  }
  if (key === "jev.model") {
    if (!MODEL_NAME.test(value))
      throw new Error("jev.model is a name of letters, digits, dot, dash and underscore");
    return { ...config, jev: { ...config.jev, model: value } };
  }
  throw new Error(`unknown setting: ${key}`);
}
