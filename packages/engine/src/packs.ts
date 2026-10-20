import { existsSync, readdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, sep } from "node:path";
import type { DetectorRule } from "./detect/types.ts";
import { ensureDir, nowIso, readJson, readText, sha256, writeJson } from "./fs.ts";
import { withLock } from "./lock.ts";
import { packPath, packsDir } from "./paths.ts";
import { scanText } from "./secrets.ts";
import { TEAMS } from "./team.ts";
import {
  CORE_STACKS,
  type CoreStack,
  GATE_NAMES,
  type GateName,
  type Policy,
  type Profile,
  type TeamName,
} from "./types.ts";
import { VERSION } from "./version.ts";

/**
 * A pack is data the engine serves (SP6 Task 2, ADR 0010): a folder with `pack.json`, checklists
 * for the gap round, knowledge files for the expert, detector rules that refine the profile and a
 * team template that gives a path team its paths. No code, no agent, no hook. The engine checks a
 * pack whole before registering it, serves its files by absolute path, and says when one changed.
 */

export type PackKind = "stack" | "domain" | "team";

export interface TeamTemplate {
  template: string;
  teams: Partial<Record<TeamName, { mandatory: { kind: "paths"; globs: string[] } }>>;
}

export interface Provenance {
  source: string;
  licence: string;
  commit: string | null;
  measuredBy: string;
}

export interface PackManifest {
  name: string;
  version: string;
  kind: PackKind;
  core: string;
  verifiedAgainst: Record<string, string>;
  detectors: DetectorRule[];
  checklists: string[];
  knowledge: Record<string, string>;
  team: TeamTemplate | null;
  evals: string[];
  provenance: Provenance[];
}

export interface PackRegistration {
  name: string;
  version: string;
  root: string;
  registeredAt: string;
  by: "command" | "discovery";
  /** The plugin key discovery found the pack under (`<name>@<marketplace>`); null for a pack added by hand. */
  key: string | null;
  files: Record<string, string>;
  manifest: PackManifest;
}

export type PackState =
  | { kind: "ok" }
  | { kind: "missing" }
  | { kind: "unreadable"; reason: string }
  | { kind: "changed"; files: string[] };

export interface PackListing {
  name: string;
  registration: PackRegistration | null;
  state: PackState;
}

export const PACK_NAME = /^wizardingcode-pack-[a-z0-9][a-z0-9-]*$/;
const WORD = /^[a-z][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const CORE_RANGE = /^>=(\d+)\.(\d+)\.(\d+)$/;
const PACK_KINDS: readonly PackKind[] = ["stack", "domain", "team"];
const TEMPLATE_KEYS = new Set(["template", "teams"]);
const PROVENANCE_KEYS = ["source", "licence", "commit", "measuredBy"] as const;

export function stateText(state: PackState): string {
  switch (state.kind) {
    case "ok":
      return "ok";
    case "missing":
      return "missing";
    case "unreadable":
      return `unreadable (${state.reason})`;
    case "changed":
      return `changed since registration (${state.files.join(", ")})`;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");
/** A path a manifest may hold: relative, never climbing. */
const climbs = (p: string): boolean =>
  isAbsolute(p) || p.split(/[\\/]/).some((segment) => segment === "..");
const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** The manifest at `<root>/pack.json`, checked field by field (SP6 Task 2 AC-1), or the one refusal. */
export function readManifest(root: string): { manifest: PackManifest } | { refused: string } {
  const text = readText(join(root, "pack.json"));
  if (text === null) return { refused: "pack.json names nothing: the file is missing" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { refused: `pack.json: not JSON (${message(error)})` };
  }
  if (!isRecord(data)) return { refused: "pack.json: not an object" };
  const m = data;
  const bad = (what: string) => ({ refused: `pack.json: ${what}` });
  if (typeof m.name !== "string" || !PACK_NAME.test(m.name))
    return bad("name is not wizardingcode-pack-<name> (lowercase letters, digits and dashes)");
  if (typeof m.version !== "string" || !SEMVER.test(m.version)) return bad("version is not X.Y.Z");
  if (!PACK_KINDS.includes(m.kind as PackKind)) return bad("kind is not stack, domain or team");
  if (typeof m.core !== "string" || !CORE_RANGE.test(m.core))
    return bad("core is not of the form >=X.Y.Z");
  if (
    !isRecord(m.verifiedAgainst) ||
    !Object.keys(m.verifiedAgainst).length ||
    !Object.values(m.verifiedAgainst).every((v) => typeof v === "string")
  )
    return bad("verifiedAgainst needs at least one technology with its version");
  if (!Array.isArray(m.detectors)) return bad("detectors is not a list of rules");
  const detectors: DetectorRule[] = [];
  for (const raw of m.detectors) {
    if (!isRecord(raw)) return bad("detectors is not a list of rules");
    const stack = typeof raw.stack === "string" ? raw.stack : "?";
    const rule = (what: string) => bad(`detector ${stack}: ${what}`);
    if (typeof raw.stack !== "string" || !WORD.test(raw.stack))
      return rule("stack is not a lowercase word");
    if (raw.extends !== undefined && !CORE_STACKS.includes(raw.extends as CoreStack))
      return rule(`extends ${String(raw.extends)} is not a core stack (${CORE_STACKS.join(", ")})`);
    if (!isStringList(raw.markers) || !raw.markers.length) return rule("markers is empty");
    for (const marker of raw.markers)
      if (climbs(marker)) return bad(`markers holds a path that is absolute or climbs (${marker})`);
    if (typeof raw.packageManager !== "string") return rule("packageManager is not a string");
    if (!isRecord(raw.gates)) return rule("gates is not an object of gate name to command");
    const gates: Partial<Record<GateName, string>> = {};
    for (const [gate, command] of Object.entries(raw.gates)) {
      if (!GATE_NAMES.includes(gate as GateName)) return rule(`${gate} is not a gate name`);
      if (typeof command !== "string" || !command.trim())
        return rule(`the ${gate} gate has no command`);
      gates[gate as GateName] = command;
    }
    if (
      raw.testScoped !== undefined &&
      (typeof raw.testScoped !== "string" || !raw.testScoped.includes("{files}"))
    )
      return rule("testScoped has no {files}");
    detectors.push({
      stack: raw.stack,
      ...(raw.extends !== undefined ? { extends: raw.extends as CoreStack } : {}),
      markers: raw.markers,
      packageManager: raw.packageManager,
      gates,
      ...(typeof raw.testScoped === "string" ? { testScoped: raw.testScoped } : {}),
    });
  }
  // The paths: a climbing one is named first, then the shape.
  if (!isStringList(m.checklists))
    return bad("checklists is not a list of checklists/<name>.md paths");
  for (const p of m.checklists)
    if (climbs(p)) return bad(`checklists holds a path that is absolute or climbs (${p})`);
  if (!m.checklists.every((p) => /^checklists\/[a-z0-9-]+\.md$/.test(p)))
    return bad("checklists is not a list of checklists/<name>.md paths");
  if (!isRecord(m.knowledge) || !Object.values(m.knowledge).every((v) => typeof v === "string"))
    return bad("knowledge is not an object of lowercase keys to knowledge/<name>.md paths");
  for (const v of Object.values(m.knowledge as Record<string, string>))
    if (climbs(v)) return bad(`knowledge holds a path that is absolute or climbs (${v})`);
  if (
    !Object.entries(m.knowledge as Record<string, string>).every(
      ([k, v]) => WORD.test(k) && /^knowledge\/[a-z0-9-]+\.md$/.test(v),
    )
  )
    return bad("knowledge is not an object of lowercase keys to knowledge/<name>.md paths");
  let team: TeamTemplate | null = null;
  if (m.team !== null) {
    if (!isRecord(m.team)) return bad("team is not null or a template");
    const t = m.team;
    if (typeof t.template !== "string" || !WORD.test(t.template))
      return bad("template: template is not a lowercase word");
    for (const key of Object.keys(t))
      if (!TEMPLATE_KEYS.has(key))
        return bad(
          `template: a template sets no cap, removes no team and seats nothing always (${key})`,
        );
    if (!isRecord(t.teams)) return bad("template: teams is not an object");
    const teams: TeamTemplate["teams"] = {};
    for (const [name, def] of Object.entries(t.teams)) {
      const core = TEAMS[name as TeamName];
      if (!core) return bad(`template: ${name} is not a team of the registry`);
      if (core.mandatory.kind !== "paths")
        return bad(`template: ${name} takes no globs (its rule is ${core.mandatory.kind})`);
      const mandatory = isRecord(def) && isRecord(def.mandatory) ? def.mandatory : null;
      if (mandatory?.kind !== "paths" || !isStringList(mandatory.globs))
        return bad(`template: ${name}: mandatory is not { kind: "paths", globs }`);
      if (!mandatory.globs.length) return bad(`template: ${name}: globs is empty`);
      for (const g of mandatory.globs)
        if (climbs(g)) return bad(`globs holds a path that is absolute or climbs (${g})`);
      teams[name as TeamName] = { mandatory: { kind: "paths", globs: mandatory.globs } };
    }
    team = { template: t.template, teams };
  }
  if (!isStringList(m.evals)) return bad("evals is not a list of case names");
  if (!Array.isArray(m.provenance))
    return bad("provenance is not a list of { source, licence, commit, measuredBy }");
  const provenance: Provenance[] = [];
  for (const p of m.provenance) {
    if (
      !isRecord(p) ||
      !PROVENANCE_KEYS.every((k) => k in p) ||
      typeof p.source !== "string" ||
      typeof p.licence !== "string" ||
      (p.commit !== null && typeof p.commit !== "string") ||
      typeof p.measuredBy !== "string"
    )
      return bad("provenance is not a list of { source, licence, commit, measuredBy }");
    if (!/^https?:\/\//.test(p.source))
      return bad(`provenance: source ${p.source} is not an http(s) URL`);
    provenance.push({
      source: p.source,
      licence: p.licence,
      commit: p.commit as string | null,
      measuredBy: p.measuredBy,
    });
  }
  return {
    manifest: {
      name: m.name,
      version: m.version,
      kind: m.kind as PackKind,
      core: m.core,
      verifiedAgainst: m.verifiedAgainst as Record<string, string>,
      detectors,
      checklists: m.checklists,
      knowledge: m.knowledge as Record<string, string>,
      team,
      evals: m.evals,
      provenance,
    },
  };
}

/** Whether `version` (X.Y.Z) satisfies the manifest's `>=X.Y.Z`. */
function coreSatisfied(range: string, version: string): boolean {
  const want = CORE_RANGE.exec(range)?.slice(1).map(Number) ?? [0, 0, 0];
  const have = version.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((have[i] ?? 0) > (want[i] ?? 0)) return true;
    if ((have[i] ?? 0) < (want[i] ?? 0)) return false;
  }
  return true;
}

/** The files a manifest names, relative to the root: pack.json, the checklists, the knowledge files. */
function namedFiles(manifest: PackManifest): string[] {
  return ["pack.json", ...manifest.checklists, ...Object.values(manifest.knowledge)];
}

/** A file read whole, or the refusal that names it: a directory where a file should be, a file nobody may read. */
function readNamed(root: string, rel: string): { text: string } | { refused: string } {
  try {
    return { text: readFileSync(join(root, rel), "utf8") };
  } catch (error) {
    return { refused: `${rel} cannot be read (${message(error)})` };
  }
}

/**
 * What stands against a pack as a whole (AC-1), in order: the core range, a named file (pack.json
 * included) missing or outside the root's real path, a secret in pack.json, a Markdown file or
 * README.md, a rule whose stack is a core id, provenance without its measuring case. Null for a
 * sound pack. Never throws: a file that cannot be read is the refusal.
 */
export function checkPack(
  root: string,
  manifest: PackManifest,
  engineVersion = VERSION,
): string | null {
  if (!coreSatisfied(manifest.core, engineVersion))
    return `core ${manifest.core} needs an engine at or above ${manifest.core.slice(2)}; this is ${engineVersion}`;
  let real: string;
  try {
    real = realpathSync(root);
  } catch (error) {
    return `the pack's root cannot be read (${message(error)})`;
  }
  for (const rel of namedFiles(manifest)) {
    let resolved: string;
    try {
      resolved = realpathSync(join(root, rel));
    } catch {
      // Not there, or gone between a check and this read (the security gate's advisory, round 3).
      return `pack.json names ${rel}, which is missing`;
    }
    if (resolved !== real && !resolved.startsWith(real + sep))
      return `pack.json names ${rel}, which is outside the pack's root`;
  }
  const scanned = [
    ...namedFiles(manifest),
    ...(existsSync(join(root, "README.md")) ? ["README.md"] : []),
  ];
  for (const rel of scanned) {
    const read = readNamed(root, rel);
    if ("refused" in read) return read.refused;
    const finding = scanText(read.text, rel)[0];
    if (finding) return `${rel} holds a secret (${finding.rule}) at line ${finding.line}`;
  }
  for (const rule of manifest.detectors)
    if (CORE_STACKS.includes(rule.stack as CoreStack))
      return `detector ${rule.stack}: a core stack is not a pack's`;
  for (const p of manifest.provenance)
    if (!manifest.evals.includes(p.measuredBy))
      return `folded in without proof: ${p.source} names no case of this pack`;
  return null;
}

function hashes(root: string, manifest: PackManifest): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of namedFiles(manifest))
    out[rel] = `sha256:${sha256(readFileSync(join(root, rel)))}`;
  return out;
}

/** Registers a checked pack under the lock (AC-2): one file per pack, `registeredAt` kept on a rewrite. */
export function registerPack(
  userDir: string,
  root: string,
  by: PackRegistration["by"],
  key: string | null = null,
): PackRegistration | { refused: string } {
  const read = readManifest(root);
  if ("refused" in read) return read;
  const refused = checkPack(root, read.manifest);
  if (refused) return { refused };
  const manifest = read.manifest;
  const dir = packsDir(userDir);
  ensureDir(dir);
  return withLock(dir, () => {
    const earlier = readJson<PackRegistration>(packPath(userDir, manifest.name));
    // Registration order is the serving order: a new registration's time is later than every
    // earlier one's, so two packs registered in one millisecond keep their order.
    const latest = readdirSync(dir)
      .filter((n) => n.endsWith(".json"))
      .map((n) => readJson<PackRegistration>(join(dir, n))?.registeredAt ?? "")
      .sort()
      .at(-1);
    const now = nowIso();
    const registeredAt =
      earlier?.registeredAt ??
      (latest && latest >= now ? new Date(Date.parse(latest) + 1).toISOString() : now);
    const registration: PackRegistration = {
      name: manifest.name,
      version: manifest.version,
      root: realpathSync(root),
      registeredAt,
      by,
      key,
      files: hashes(root, manifest),
      manifest,
    };
    writeJson(packPath(userDir, manifest.name), registration);
    return registration;
  });
}

/** Unregisters a pack by its name alone (the security gate's finding: a path here would reach the engine's own files). */
export function removePack(userDir: string, name: string): { removed: true } | { refused: string } {
  if (!PACK_NAME.test(name))
    return { refused: `${name} is not a pack name (wizardingcode-pack-<name>)` };
  const dir = packsDir(userDir);
  ensureDir(dir);
  return withLock(dir, () => {
    const file = packPath(userDir, name);
    if (!existsSync(file)) return { refused: `no pack ${name} is registered (crew pack list)` };
    rmSync(file);
    return { removed: true as const };
  });
}

/**
 * The state of a registration now. Quick: the root and its manifest alone (what a hook needs at
 * every prompt). Full: the checks and the hashes again, so `ok` means served as registered.
 * Never throws: what cannot be read is `unreadable` with the reason.
 */
function stateOf(registration: PackRegistration, quick: boolean): PackState {
  try {
    if (!existsSync(registration.root) || !existsSync(join(registration.root, "pack.json")))
      return { kind: "missing" };
    const read = readManifest(registration.root);
    if ("refused" in read) return { kind: "unreadable", reason: read.refused };
    if (quick) return { kind: "ok" };
    const refused = checkPack(registration.root, read.manifest);
    if (refused) return { kind: "unreadable", reason: refused };
    const changed: string[] = [];
    for (const [rel, hash] of Object.entries(registration.files)) {
      const path = join(registration.root, rel);
      if (!existsSync(path) || `sha256:${sha256(readFileSync(path))}` !== hash) changed.push(rel);
    }
    if (changed.length) return { kind: "changed", files: changed };
    return { kind: "ok" };
  } catch (error) {
    return { kind: "unreadable", reason: message(error) };
  }
}

/** Every registration under the user directory with its state, in registration order; a garbage file listed as unreadable; never throws. */
export function listPacks(userDir: string, options: { quick?: boolean } = {}): PackListing[] {
  const dir = packsDir(userDir);
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const listed: PackListing[] = [];
  for (const file of names) {
    const name = basename(file, ".json");
    const text = readText(join(dir, file)) ?? "";
    let registration: PackRegistration | null = null;
    let reason = "";
    try {
      const data = JSON.parse(text) as Partial<PackRegistration>;
      if (
        isRecord(data) &&
        typeof data.name === "string" &&
        typeof data.root === "string" &&
        isRecord(data.manifest) &&
        isRecord(data.files)
      )
        registration = data as PackRegistration;
      else reason = "registration of another shape";
    } catch (error) {
      reason = message(error);
    }
    listed.push({
      name: registration?.name ?? name,
      registration,
      state: registration
        ? stateOf(registration, options.quick ?? false)
        : { kind: "unreadable", reason },
    });
  }
  // Registration order (the ISO dates compared as plain strings), a garbage registration last.
  const key = (p: PackListing) => p.registration?.registeredAt ?? "~";
  return listed.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    if (x !== y) return x < y ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

function okPacks(userDir: string): PackRegistration[] {
  return listPacks(userDir)
    .filter(
      (p): p is PackListing & { registration: PackRegistration } =>
        p.state.kind === "ok" && p.registration !== null,
    )
    .map((p) => p.registration);
}

/** The absolute paths the ok packs serve for a checklist kind or a knowledge key, in registration order (AC-2). */
export function packFiles(
  userDir: string,
  kind: "checklists" | "knowledge",
  key: string,
): string[] {
  const paths: string[] = [];
  for (const pack of okPacks(userDir)) {
    if (kind === "checklists") {
      for (const rel of pack.manifest.checklists)
        if (basename(rel, ".md") === key) paths.push(join(pack.root, rel));
    } else {
      const rel = pack.manifest.knowledge[key];
      if (rel) paths.push(join(pack.root, rel));
    }
  }
  return paths;
}

export function packRules(userDir: string): { pack: string; rule: DetectorRule }[] {
  return okPacks(userDir).flatMap((p) =>
    p.manifest.detectors.map((rule) => ({ pack: p.name, rule })),
  );
}

export function packTemplates(userDir: string): { pack: string; template: TeamTemplate }[] {
  return okPacks(userDir).flatMap((p) =>
    p.manifest.team ? [{ pack: p.name, template: p.manifest.team }] : [],
  );
}

/** A registered pack by its full name or the part after `wizardingcode-pack-`. */
function packNamed(packs: readonly PackRegistration[], name: string): PackRegistration | undefined {
  return packs.find((p) => p.name === name || p.name === `wizardingcode-pack-${name}`);
}

/**
 * The knowledge files the expert reads for an item (AC-5): the files of the stacks and tags of the
 * targets a changed file sits in (every target with no changed file yet), then the specialists the
 * policy names as `<pack>:<key>`; deduplicated, in registration order; what was skipped, named.
 */
export function knowledgeFilesFor(
  userDir: string,
  profile: Profile,
  changed: readonly string[],
  policy: Policy,
): { paths: string[]; packs: string[]; skipped: string[] } {
  const packs = okPacks(userDir);
  const holds = (targetPath: string, file: string) =>
    targetPath === "." || file.startsWith(`${targetPath}/`);
  const targets = changed.length
    ? profile.targets.filter((t) => changed.some((f) => holds(t.path, f)))
    : profile.targets;
  const keys = [...new Set(targets.flatMap((t) => [t.stack, ...(t.tags ?? [])]))];
  const paths: string[] = [];
  const served = new Set<string>();
  const add = (pack: PackRegistration, rel: string) => {
    const path = join(pack.root, rel);
    if (!paths.includes(path)) paths.push(path);
    served.add(pack.name);
  };
  for (const pack of packs)
    for (const key of keys) {
      const rel = pack.manifest.knowledge[key];
      if (rel) add(pack, rel);
    }
  const skipped: string[] = [];
  for (const entry of policy.team.specialists) {
    const match = /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(entry);
    if (!match) {
      skipped.push(`${entry}: not of the form <pack>:<key>`);
      continue;
    }
    const [, name, key] = match as unknown as [string, string, string];
    const pack = packNamed(packs, name);
    if (!pack) {
      skipped.push(`${entry}: no pack ${name} is registered`);
      continue;
    }
    const rel = pack.manifest.knowledge[key];
    if (!rel) {
      skipped.push(`${entry}: ${pack.name} has no knowledge file ${key}`);
      continue;
    }
    add(pack, rel);
  }
  return { paths, packs: packs.filter((p) => served.has(p.name)).map((p) => p.name), skipped };
}

/** `<name> <version>` for the report's Packs line, from one listing taken by the caller. */
export function packLabel(listed: readonly PackListing[], name: string): string {
  const pack = listed.find((p) => p.name === name)?.registration;
  return pack ? `${pack.name} ${pack.version}` : name;
}

/** Where Claude Code keeps what it installed: `<config dir>/plugins/installed_plugins.json`, the config dir `CLAUDE_CONFIG_DIR` or `<HOME>/.claude`. */
export function pluginRegistryPath(env: NodeJS.ProcessEnv): string {
  const configDir = env.CLAUDE_CONFIG_DIR ?? join(env.HOME ?? homedir(), ".claude");
  return join(configDir, "plugins", "installed_plugins.json");
}

interface InstalledPlugin {
  installPath?: unknown;
}

/**
 * Discovery (AC-6): under Claude Code (`CLAUDE_PLUGIN_ROOT` set), the packs the plugin registry
 * installed are registered by their key, read-only on the registry and fail-open; a pack whose key
 * left the registry is unregistered; a pack registered by hand is never touched; a pack this run
 * registered or refreshed is never removed by the same run. Returns the lines of what changed.
 */
export function discoverPacks(userDir: string, env: NodeJS.ProcessEnv): string[] {
  if (!env.CLAUDE_PLUGIN_ROOT) return [];
  const text = readText(pluginRegistryPath(env));
  if (text === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  if (!isRecord(data) || !isRecord(data.plugins)) return [];
  const plugins = data.plugins;
  const lines: string[] = [];
  const registered = listPacks(userDir, { quick: true });
  const seenKeys = new Set<string>();
  const touched = new Set<string>();
  for (const [key, raw] of Object.entries(plugins)) {
    const keyName = key.split("@")[0] ?? key;
    if (!keyName.startsWith("wizardingcode-pack-")) continue;
    seenKeys.add(key);
    const entries = (Array.isArray(raw) ? raw : [raw]).filter(isRecord) as InstalledPlugin[];
    const root = entries
      .map((e) => (typeof e.installPath === "string" ? e.installPath : null))
      .find((p): p is string => p !== null && existsSync(join(p, "pack.json")));
    if (!root) continue;
    const read = readManifest(root);
    if ("refused" in read) {
      lines.push(`${key}: ${read.refused}`);
      continue;
    }
    if (read.manifest.name !== keyName) {
      lines.push(`${key}: pack.json names ${read.manifest.name}, not ${keyName}`);
      continue;
    }
    const current = registered.find((p) => p.name === read.manifest.name)?.registration;
    if (current?.by === "command") {
      lines.push(`${read.manifest.name}: registered by hand, left as it is`);
      continue;
    }
    let realRoot: string;
    try {
      realRoot = realpathSync(root);
    } catch (error) {
      lines.push(`${key}: the pack's root cannot be read (${message(error)})`);
      continue;
    }
    if (
      current &&
      current.root === realRoot &&
      current.version === read.manifest.version &&
      current.key === key
    )
      continue;
    const out = registerPack(userDir, root, "discovery", key);
    if ("refused" in out) lines.push(`${key}: ${out.refused}`);
    else {
      touched.add(out.name);
      lines.push(`${out.name} ${out.version} registered (${key})`);
    }
  }
  for (const p of registered) {
    const r = p.registration;
    if (r?.by === "discovery" && r.key && !seenKeys.has(r.key) && !touched.has(r.name)) {
      const gone = removePack(userDir, r.name);
      lines.push(
        "refused" in gone
          ? `${r.name}: ${gone.refused}`
          : `${r.name} removed: ${r.key} is no longer installed`,
      );
    }
  }
  return lines;
}
