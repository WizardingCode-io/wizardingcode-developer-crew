import { existsSync } from "node:fs";
import { join } from "node:path";
import { readJson, readTextQuietly } from "../fs.ts";
import type { Environment, GateCommand, Target } from "../types.ts";

/** How long `crew env start` and the e2e gate wait for health by default (SP7 §8.2). */
export const ENVIRONMENT_TIMEOUT_MS = 120_000;
/** The environment's commands, named once for the detector, the re-detection's lines and `crew profile`. */
export const ENVIRONMENT_COMMANDS = ["start", "health", "stop"] as const;
export type EnvironmentCommand = (typeof ENVIRONMENT_COMMANDS)[number];
const COMPOSE_FILES = ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"];
/** The Makefile targets that start an application, in order of preference. */
const MAKE_TARGETS = ["start", "serve", "dev"];
/** The package.json scripts that start an application, in order of preference. */
const NODE_SCRIPTS = ["dev", "start"];
/** The managers the node detector sets; anything else reads as npm, so a manifest's free text never enters a command. */
const NODE_MANAGERS = ["npm", "pnpm", "yarn", "bun"];
const DEFAULT_PORT = 3000;

const proposed = (command: string): GateCommand => ({ command, source: "proposed" });

function onLocalhost(host: string, port: number): Pick<Environment, "health" | "url"> {
  return { health: proposed(`curl -fsS http://${host}:${port}/`), url: `http://${host}:${port}` };
}

/**
 * The first published port of a compose file (`- "8080:80"` or `- 8080:80` under `ports:`),
 * accepted only as digits alone from 1 to 65535 and parsed to an integer; anything else (a
 * variable, a range, an address, a shell character) is the default, so nothing but the digits
 * reaches the health command.
 */
export function composePort(text: string): number {
  const match = /^\s*ports:\s*\n\s*-\s*"?(\d{1,5})(?=:\d)/m.exec(text);
  const port = match ? Number.parseInt(match[1] as string, 10) : Number.NaN;
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}

/**
 * The environment a project declares at its root (SP7 §8.2), the first that matches: a compose
 * file, a Laravel `artisan`, a Makefile target, a `package.json` script. Every command is a
 * proposal the user confirms, as a guessed test command is; null when nothing declares one.
 */
export function detectEnvironment(root: string, targets: readonly Target[]): Environment | null {
  const compose = COMPOSE_FILES.map((f) => join(root, f)).find((p) => existsSync(p));
  if (compose) {
    return {
      start: proposed("docker compose up -d"),
      stop: proposed("docker compose down"),
      ...onLocalhost("localhost", composePort(readTextQuietly(compose) ?? "")),
      timeoutMs: ENVIRONMENT_TIMEOUT_MS,
    };
  }
  if (existsSync(join(root, "artisan"))) {
    return {
      start: proposed("php artisan serve --port 8000"),
      ...onLocalhost("127.0.0.1", 8000),
      timeoutMs: ENVIRONMENT_TIMEOUT_MS,
    };
  }
  // A file that cannot be read is no marker: detection runs in the hooks too (finding 30).
  const makefile = readTextQuietly(join(root, "Makefile"));
  const target = makefile
    ? MAKE_TARGETS.find((t) => new RegExp(`^${t}:`, "m").test(makefile))
    : undefined;
  if (target) {
    return {
      start: proposed(`make ${target}`),
      ...onLocalhost("localhost", DEFAULT_PORT),
      timeoutMs: ENVIRONMENT_TIMEOUT_MS,
    };
  }
  const pkg = readJson<{ scripts?: Record<string, unknown> }>(join(root, "package.json"));
  const script = NODE_SCRIPTS.find((s) => typeof pkg?.scripts?.[s] === "string");
  if (script) {
    const detected = targets.find((t) => t.path === "." && t.stack === "node")?.packageManager;
    const manager = detected && NODE_MANAGERS.includes(detected) ? detected : "npm";
    return {
      start: proposed(`${manager} run ${script}`),
      ...onLocalhost("localhost", DEFAULT_PORT),
      timeoutMs: ENVIRONMENT_TIMEOUT_MS,
    };
  }
  return null;
}

/** True when the user confirmed any command of the block: it then outlives a re-detection whole, as a confirmed gate does. */
export function confirmedEnvironment(environment: Environment): boolean {
  return ENVIRONMENT_COMMANDS.some((key) => environment[key]?.source === "confirmed");
}

/** What a re-detection changed in the environment, one line each (SP7 §8.2), in `profileChanges`' voice. */
export function environmentChanges(
  previous: Environment | undefined,
  next: Environment | undefined,
): string[] {
  if (previous && !next) return ["environment: removed"];
  if (!next) return [];
  const lines: string[] = [];
  for (const key of ENVIRONMENT_COMMANDS) {
    const before = previous?.[key];
    const after = next[key];
    if (after && (before?.command !== after.command || before.source !== after.source))
      lines.push(`environment.${key}: ${after.command}`);
    else if (before && !after) lines.push(`environment.${key}: removed`);
  }
  return lines;
}
