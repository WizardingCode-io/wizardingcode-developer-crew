// packages/engine/src/cli.ts
import { existsSync as existsSync3 } from "node:fs";
import { join as join18, resolve as resolve2 } from "node:path";

// packages/engine/src/glob.ts
var SPECIAL = /[.+^${}()|[\]\\]/g;
function globToRegExp(glob) {
  let re = "";
  for (let i = 0;i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c !== undefined) {
      re += c.replace(SPECIAL, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, "i");
}
function matchesAny(path, patterns) {
  const normalised = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalised));
}

// packages/engine/src/types.ts
var GATE_NAMES = [
  "build",
  "test",
  "lint",
  "typecheck",
  "secrets",
  "deps"
];
var ROUTE_ORDER = ["fast", "standard", "full"];
var PHASE_ORDER = [
  "receive",
  "recognize",
  "understand",
  "specify",
  "conclave",
  "plan",
  "build",
  "gate",
  "deliver"
];
var PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "bypassPermissions",
  "dontAsk"
];
function isPermissionMode(value) {
  return PERMISSION_MODES.includes(value);
}

// packages/engine/src/classify.ts
var WORK_TYPES = {
  fix: "repairs behaviour that is wrong today",
  feature: "adds or changes behaviour on purpose",
  refactor: "changes structure without changing behaviour",
  chore: "tooling, dependencies, configuration or documentation",
  "new-product": "a new application or service from scratch",
  question: "the user wants an answer, not a change"
};
var QUESTIONS = {
  work_type: {
    type: "choice",
    instructions: "What kind of work does this request ask for?",
    criteria: WORK_TYPES
  },
  is_vague: {
    type: "noul",
    instructions: "Is information missing without which two competent engineers would build different things?"
  },
  scope: {
    type: "score",
    instructions: "How much of the codebase does this change touch?",
    criteria: ["one spot", "one module", "several modules", "the whole system"]
  },
  touches_auth: {
    type: "noul",
    instructions: "Does this change authentication, authorization or sessions?"
  },
  touches_payments: {
    type: "noul",
    instructions: "Does this change payments, billing or pricing?"
  },
  touches_personal_data: {
    type: "noul",
    instructions: "Does this read, store or expose personal data?"
  },
  touches_data_migration: {
    type: "noul",
    instructions: "Does this change a database schema or migrate data?"
  },
  touches_infra: {
    type: "noul",
    instructions: "Does this change infrastructure, deployment or CI?"
  },
  touches_public_api: {
    type: "noul",
    instructions: "Does this change an interface other systems depend on?"
  }
};

class AnswerError extends Error {
  problems;
  constructor(problems) {
    super(problems.join("; "));
    this.problems = problems;
    this.name = "AnswerError";
  }
}
var RISK_THRESHOLD = 0.3;
var VAGUE_THRESHOLD = 0.5;
function validateAnswers(raw) {
  const problems = [];
  if (typeof raw !== "object" || raw === null)
    throw new AnswerError(["answers must be an object"]);
  const input = raw;
  for (const [id, question] of Object.entries(QUESTIONS)) {
    const value = input[id];
    if (question.type === "choice") {
      if (typeof value !== "string" || !(value in question.criteria)) {
        problems.push(`${id}: expected one of ${Object.keys(question.criteria).join(", ")}`);
      }
    } else if (question.type === "noul") {
      if (typeof value !== "number" || value < 0 || value > 1) {
        problems.push(`${id}: expected a probability between 0 and 1`);
      }
    } else if (!Number.isInteger(value) || value < 0 || value >= question.criteria.length) {
      problems.push(`${id}: expected an integer level from 0 to ${question.criteria.length - 1}`);
    }
  }
  if (problems.length)
    throw new AnswerError(problems);
  return input;
}
var AREA_BY_QUESTION = {
  touches_auth: "auth",
  touches_payments: "payments",
  touches_personal_data: "personal-data",
  touches_data_migration: "data-migration",
  touches_infra: "infra",
  touches_public_api: "public-api"
};
function riskAreasFromAnswers(answers) {
  const areas = [];
  for (const [id, area] of Object.entries(AREA_BY_QUESTION)) {
    if (answers[id] >= RISK_THRESHOLD)
      areas.push(area);
  }
  return areas;
}
var DEFAULT_RISK_PATHS = {
  auth: [
    "**/auth/**",
    "**/*auth*",
    "**/Middleware/Authenticate*",
    "**/login*",
    "**/session*",
    "**/password*",
    "**/oauth*",
    "**/jwt*"
  ],
  payments: [
    "**/payment*",
    "**/billing*",
    "**/checkout*",
    "**/stripe*",
    "**/invoice*",
    "**/pricing*"
  ],
  "personal-data": ["**/gdpr*", "**/privacy*", "**/consent*", "**/pii*", "**/*personal*"],
  "data-migration": ["**/migrations/**", "**/migrate*", "**/schema.*", "**/*.sql", "**/prisma/**"],
  infra: [
    ".github/workflows/**",
    ".gitlab-ci.yml",
    "**/Dockerfile*",
    "**/docker-compose*",
    "**/terraform/**",
    "**/*.tf",
    "**/k8s/**",
    "**/helm/**",
    "**/deploy*",
    "**/ansible/**"
  ],
  "public-api": [
    "**/routes/api*",
    "**/openapi*",
    "**/swagger*",
    "**/*.proto",
    "**/graphql/schema*"
  ],
  secrets: [".env*", "**/.env*", "**/secrets*", "**/*.pem", "**/*.key", "**/credentials*"]
};
function riskPatterns(area, policy) {
  return [...DEFAULT_RISK_PATHS[area], ...policy.riskPaths[area] ?? []];
}
function isExcluded(path, policy) {
  return matchesAny(path, policy.riskPathExclusions);
}
function riskAreasForPaths(paths, policy) {
  const kept = paths.filter((path) => !isExcluded(path, policy));
  const areas = [];
  for (const area of Object.keys(DEFAULT_RISK_PATHS)) {
    const patterns = riskPatterns(area, policy);
    if (kept.some((path) => matchesAny(path, patterns)))
      areas.push(area);
  }
  return areas;
}
function excludedRiskPaths(paths, policy) {
  const areas = Object.keys(DEFAULT_RISK_PATHS);
  return paths.filter((path) => isExcluded(path, policy) && areas.some((area) => matchesAny(path, riskPatterns(area, policy))));
}
function routeRank(route) {
  return ROUTE_ORDER.indexOf(route);
}
function higherRoute(a, b) {
  return routeRank(a) >= routeRank(b) ? a : b;
}
function computeRoute(answers, pathRisk, policy) {
  const riskAreas = [...new Set([...riskAreasFromAnswers(answers), ...pathRisk])];
  const reasons = [];
  let route;
  if (answers.work_type === "new-product") {
    route = "full";
    reasons.push("new product");
  } else if (riskAreas.length > 0) {
    route = "full";
    reasons.push(`risk areas: ${riskAreas.join(", ")}`);
  } else if ((answers.work_type === "fix" || answers.work_type === "chore") && answers.is_vague < VAGUE_THRESHOLD && answers.scope === 0) {
    route = "fast";
    reasons.push(`${answers.work_type} in one spot, clear request, no risk area`);
  } else {
    route = "standard";
    reasons.push(`${answers.work_type}, scope level ${answers.scope}, ${answers.is_vague >= VAGUE_THRESHOLD ? "vague request" : "clear request"}`);
  }
  if (routeRank(policy.minimumRoute) > routeRank(route)) {
    route = policy.minimumRoute;
    reasons.push(`team policy minimum: ${policy.minimumRoute}`);
  }
  return { route, reasons, riskAreas };
}

// packages/engine/src/config.ts
import { join as join2 } from "node:path";

// packages/engine/src/fs.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}
function exists(path) {
  return existsSync(path);
}
function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}
function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
function readJson(path) {
  const text = readText(path);
  if (text === null)
    return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function writeText(path, text) {
  ensureDir(dirname(path));
  const tmp = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
function writeJson(path, data) {
  writeText(path, `${JSON.stringify(data, null, 2)}
`);
}
function nowIso() {
  return new Date().toISOString();
}

// packages/engine/src/config.ts
var DEFAULT_CONFIG = { mode: "partner", decisions: { log: true } };
var MODES = ["partner", "guide", "pilot"];
function configPath(paths) {
  return join2(paths.userDir, "config.json");
}
function loadConfig(paths) {
  const raw = readJson(configPath(paths)) ?? {};
  return {
    mode: MODES.includes(raw.mode) ? raw.mode : DEFAULT_CONFIG.mode,
    decisions: { log: raw.decisions?.log !== false }
  };
}
function saveConfig(paths, config) {
  writeJson(configPath(paths), config);
}
function setConfigValue(config, key, value) {
  if (key === "mode") {
    if (!MODES.includes(value))
      throw new Error(`mode must be one of ${MODES.join(", ")}`);
    return { ...config, mode: value };
  }
  if (key === "decisions.log") {
    if (value !== "true" && value !== "false")
      throw new Error("decisions.log must be true or false");
    return { ...config, decisions: { log: value === "true" } };
  }
  throw new Error(`unknown setting: ${key}`);
}

// packages/engine/src/detect/index.ts
import { readdirSync, statSync } from "node:fs";
import { join as join6, relative } from "node:path";

// packages/engine/src/skip-dirs.ts
var SKIP_DIRS = new Set([
  ".git",
  ".crew",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  "coverage",
  "storage",
  "target"
]);

// packages/engine/src/detect/node.ts
import { join as join3 } from "node:path";
function workspaceGlobs(pkg) {
  const raw = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
  return (raw ?? []).filter((glob) => typeof glob === "string").map((glob) => glob.replace(/^\.\//, "").replace(/\/$/, ""));
}
var SCRIPT_CANDIDATES = {
  build: ["build"],
  test: ["test", "test:unit", "unit"],
  lint: ["lint", "lint:check", "eslint", "biome"],
  typecheck: ["typecheck", "type-check", "types", "tsc"]
};
var TSC_BY_MANAGER = {
  npm: "npx tsc --noEmit",
  pnpm: "pnpm exec tsc --noEmit",
  yarn: "yarn tsc --noEmit",
  bun: "bunx tsc --noEmit"
};
var MANAGERS = ["npm", "pnpm", "yarn", "bun"];
var LOCKFILES = [
  ["bun", ["bun.lock", "bun.lockb"]],
  ["pnpm", ["pnpm-lock.yaml"]],
  ["yarn", ["yarn.lock"]],
  ["npm", ["package-lock.json", "npm-shrinkwrap.json"]]
];
function packageManager(dir, pkg) {
  const declared = typeof pkg.packageManager === "string" ? pkg.packageManager.split("@")[0] : "";
  if (declared && MANAGERS.includes(declared))
    return { manager: declared, sure: true };
  const present = LOCKFILES.filter(([, files]) => files.some((f) => exists(join3(dir, f)))).map(([manager]) => manager);
  return { manager: present[0] ?? "npm", sure: present.length <= 1 };
}
var nodeDetector = {
  stack: "node",
  detect(dir) {
    const pkg = readJson(join3(dir, "package.json"));
    if (!pkg)
      return null;
    const { manager, sure } = packageManager(dir, pkg);
    const scripts = pkg.scripts ?? {};
    const gates = {};
    for (const [gate, names] of Object.entries(SCRIPT_CANDIDATES)) {
      const name = names.find((candidate) => (candidate in scripts));
      if (!name)
        continue;
      if (gate === "test" && /no test specified/.test(scripts[name] ?? ""))
        continue;
      gates[gate] = `${manager} run ${name}`;
    }
    if (!gates.typecheck && exists(join3(dir, "tsconfig.json"))) {
      gates.typecheck = TSC_BY_MANAGER[manager];
    }
    const workspaces = workspaceGlobs(pkg);
    return {
      stack: "node",
      packageManager: manager,
      gates,
      ...workspaces.length ? { workspaces } : {},
      ...sure ? {} : { proposed: true }
    };
  }
};

// packages/engine/src/detect/php.ts
import { join as join4 } from "node:path";
var phpDetector = {
  stack: "php",
  detect(dir) {
    const composer = readJson(join4(dir, "composer.json"));
    if (!composer)
      return null;
    const scripts = composer.scripts ?? {};
    const installed = (tool) => exists(join4(dir, "vendor", "bin", tool));
    const gates = {};
    if ("test" in scripts)
      gates.test = "composer run test";
    else if (installed("pest"))
      gates.test = "vendor/bin/pest";
    else if (installed("phpunit"))
      gates.test = "vendor/bin/phpunit";
    if ("lint" in scripts)
      gates.lint = "composer run lint";
    else if (installed("pint"))
      gates.lint = "vendor/bin/pint --test";
    if ("analyse" in scripts)
      gates.typecheck = "composer run analyse";
    else if ("analyze" in scripts)
      gates.typecheck = "composer run analyze";
    else if (installed("phpstan"))
      gates.typecheck = "vendor/bin/phpstan analyse --no-progress";
    return { stack: "php", packageManager: "composer", gates };
  }
};

// packages/engine/src/detect/python.ts
import { join as join5 } from "node:path";
var PREFIX = {
  uv: "uv run ",
  poetry: "poetry run ",
  pip: "python -m "
};
var pythonDetector = {
  stack: "python",
  detect(dir) {
    const pyproject = readText(join5(dir, "pyproject.toml"));
    if (pyproject === null && !exists(join5(dir, "requirements.txt")))
      return null;
    const manager = exists(join5(dir, "uv.lock")) ? "uv" : exists(join5(dir, "poetry.lock")) ? "poetry" : "pip";
    const prefix = PREFIX[manager] ?? "";
    const text = pyproject ?? "";
    const gates = {};
    const hasPytest = /\[tool\.pytest/.test(text) || exists(join5(dir, "pytest.ini")) || exists(join5(dir, "conftest.py")) || exists(join5(dir, "tests"));
    if (hasPytest)
      gates.test = `${prefix}pytest`;
    if (/\[tool\.ruff/.test(text) || exists(join5(dir, "ruff.toml"))) {
      gates.lint = `${prefix}ruff check .`;
    }
    if (/\[tool\.mypy/.test(text))
      gates.typecheck = `${prefix}mypy .`;
    else if (/\[tool\.pyright/.test(text))
      gates.typecheck = `${prefix}pyright`;
    return { stack: "python", packageManager: manager, gates };
  }
};

// packages/engine/src/detect/index.ts
var DETECTORS = [nodeDetector, phpDetector, pythonDetector];
var DEFAULT_WATCH_EXCLUDE = ["**/*.md", "docs/**", ".crew/**", ".claude/**"];
var DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
var FORMER_WATCH_EXCLUDES = [["**/*.md", "docs/**", ".crew/**"]];
var MAX_DEPTH = 3;
function isFormerWatchDefault(profile) {
  const saved = JSON.stringify(profile.watch.exclude);
  return FORMER_WATCH_EXCLUDES.some((list) => JSON.stringify(list) === saved);
}
function watchOf(previous) {
  if (!previous)
    return { exclude: [...DEFAULT_WATCH_EXCLUDE] };
  return isFormerWatchDefault(previous) ? { exclude: [...DEFAULT_WATCH_EXCLUDE] } : previous.watch;
}
function* folders(root, depth = 0) {
  yield root;
  if (depth >= MAX_DEPTH)
    return;
  let names;
  try {
    names = readdirSync(root).sort();
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith(".") || SKIP_DIRS.has(name))
      continue;
    const path = join6(root, name);
    try {
      if (!statSync(path).isDirectory())
        continue;
    } catch {
      continue;
    }
    yield* folders(path, depth + 1);
  }
}
function detectTargets(root) {
  const targets = [];
  const workspaces = new Map;
  for (const dir of folders(root)) {
    for (const detector of DETECTORS) {
      const found = detector.detect(dir);
      if (!found)
        continue;
      const gates = {};
      for (const [gate, command] of Object.entries(found.gates)) {
        gates[gate] = { command, source: found.proposed ? "proposed" : "detected" };
      }
      const rel = relative(root, dir).replace(/\\/g, "/");
      const target = {
        path: rel === "" ? "." : rel,
        stack: found.stack,
        packageManager: found.packageManager,
        gates,
        timeoutMs: DEFAULT_TIMEOUT_MS
      };
      targets.push(target);
      if (found.workspaces)
        workspaces.set(target, found.workspaces);
    }
  }
  for (const [parent, globs] of workspaces) {
    const prefix = parent.path === "." ? "" : `${parent.path}/`;
    for (const child of targets) {
      if (child === parent || child.stack !== parent.stack || !child.path.startsWith(prefix))
        continue;
      if (matchesAny(child.path.slice(prefix.length), globs))
        child.workspaceOf = parent.path;
    }
  }
  return targets;
}
function mergeProfile(previous, detected) {
  const targets = detected.map((t) => ({ ...t, gates: { ...t.gates } }));
  if (previous) {
    for (const target of targets) {
      const old = previous.targets.find((t) => t.path === target.path && t.stack === target.stack);
      if (!old)
        continue;
      target.timeoutMs = old.timeoutMs;
      for (const [gate, command] of Object.entries(old.gates)) {
        if (command.source !== "detected")
          target.gates[gate] = command;
      }
    }
  }
  return {
    version: 1,
    detectedAt: nowIso(),
    targets,
    watch: watchOf(previous)
  };
}
function detectProfile(root, previous = null) {
  return mergeProfile(previous, detectTargets(root));
}
function missingTestCommands(profile) {
  if (profile.targets.length === 0)
    return [{ target: ".", gate: "test" }];
  const byPath = new Map(profile.targets.map((t) => [t.path, t]));
  const hasTest = (t) => !!t.gates.test || t.workspaceOf !== undefined && !!byPath.get(t.workspaceOf)?.gates.test;
  const covered = new Set(profile.targets.filter(hasTest).map((t) => t.path));
  const paths = [...new Set(profile.targets.map((t) => t.path))];
  return paths.filter((p) => !covered.has(p)).map((target) => ({ target, gate: "test" }));
}

// packages/engine/src/evidence.ts
import { join as join12 } from "node:path";

// packages/engine/src/fingerprint.ts
import { execFileSync } from "node:child_process";
import { readdirSync as readdirSync2, readFileSync as readFileSync2 } from "node:fs";
import { join as join7 } from "node:path";
var MAX_WATCHED_FILES = 20000;
var UNAVAILABLE = "unavailable";
var WALK_PREFIX = "walk:";
function isGitRepo(root) {
  return exists(join7(root, ".git"));
}
function gitOut(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024
  });
}
function gitTry(root, args) {
  try {
    return gitOut(root, args);
  } catch {
    return null;
  }
}
function gitHead(root) {
  return gitTry(root, ["rev-parse", "HEAD"])?.trim() ?? "none";
}
function baseCommitOf(root) {
  if (!isGitRepo(root))
    return null;
  const head = gitHead(root);
  return head === "none" ? null : head;
}
function gitChangedPaths(root) {
  const out = gitTry(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (out === null)
    return null;
  const entries = out.split("\x00");
  const paths = new Set;
  for (let i = 0;i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4)
      continue;
    paths.add(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") {
      const original = entries[++i];
      if (original)
        paths.add(original);
    }
  }
  return [...paths].sort();
}
function untrackedPaths(root) {
  const out = gitTry(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  return out === null ? null : out.split("\x00").filter(Boolean);
}
function gitChangedSince(root, base) {
  const diff = gitTry(root, ["diff", "--name-only", "--no-renames", "-z", base, "--"]);
  const untracked = untrackedPaths(root);
  if (diff === null || untracked === null)
    return null;
  return [...new Set([...diff.split("\x00").filter(Boolean), ...untracked])].sort();
}
function isWatched(path, profile) {
  return !matchesAny(path, profile.watch.exclude);
}
function allWatchedFiles(root, profile, maxFiles = MAX_WATCHED_FILES) {
  const files = [];
  let seen = 0;
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = readdirSync2(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || SKIP_DIRS.has(entry.name))
        continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!walk(join7(dir, entry.name), path))
          return false;
      } else if (entry.isFile()) {
        if (++seen > maxFiles)
          return false;
        if (isWatched(path, profile))
          files.push(path);
      }
    }
    return true;
  };
  return walk(root, "") ? files.sort() : null;
}
function hashFile(abs) {
  try {
    return sha256(readFileSync2(abs));
  } catch {
    return "DELETED";
  }
}
function hashPaths(root, paths) {
  const hashes = {};
  for (const path of paths)
    hashes[path] = hashFile(join7(root, path));
  return hashes;
}
function ownChanges(root, paths, base) {
  const files = base?.baseFiles;
  if (!files)
    return paths;
  const own = new Set(paths.filter((path) => files[path] === undefined || hashFile(join7(root, path)) !== files[path]));
  for (const [path, hash] of Object.entries(files)) {
    if (!paths.includes(path) && hashFile(join7(root, path)) !== hash)
      own.add(path);
  }
  return [...own].sort();
}
function changedWatchedPaths(root, profile, base, maxFiles = MAX_WATCHED_FILES) {
  if (isGitRepo(root)) {
    const commit = base?.baseCommit ?? null;
    const paths = commit ? gitChangedSince(root, commit) : gitChangedPaths(root);
    if (paths !== null) {
      return ownChanges(root, paths.filter((path) => isWatched(path, profile)), base);
    }
  }
  return allWatchedFiles(root, profile, maxFiles) ?? [];
}
function fingerprintMethod(fingerprint) {
  return fingerprint?.startsWith(WALK_PREFIX) ? "walk" : undefined;
}
function computeFingerprint(root, profile, base, maxFiles = MAX_WATCHED_FILES, method) {
  if (method !== "walk" && isGitRepo(root)) {
    const commit = base?.baseCommit ?? null;
    const changed = commit ? gitChangedSince(root, commit) : gitChangedPaths(root);
    if (changed !== null) {
      const parts2 = [`base:${commit ?? gitHead(root)}`];
      const watched = changed.filter((p) => isWatched(p, profile));
      for (const path of ownChanges(root, watched, base)) {
        parts2.push(`${path}:${hashFile(join7(root, path))}`);
      }
      return `sha256:${sha256(parts2.join(`
`))}`;
    }
  }
  const files = allWatchedFiles(root, profile, maxFiles);
  if (files === null)
    return UNAVAILABLE;
  const parts = files.map((path) => `${path}:${hashFile(join7(root, path))}`);
  return `${WALK_PREFIX}${sha256(parts.join(`
`))}`;
}

// packages/engine/src/paths.ts
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname as dirname2, join as join8, relative as relative2, resolve, sep } from "node:path";
function canonical(path) {
  const abs = resolve(path);
  const tail = [];
  let dir = abs;
  for (;; ) {
    try {
      return join8(realpathSync(dir), ...tail);
    } catch {
      const parent = dirname2(dir);
      if (parent === dir)
        return abs;
      tail.unshift(basename(dir));
      dir = parent;
    }
  }
}
function findRoot(cwd) {
  const start = canonical(cwd);
  let dir = start;
  for (;; ) {
    if (exists(join8(dir, ".git")))
      return dir;
    const parent = dirname2(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return exists(join8(start, ".crew")) ? start : null;
}
function userDirOf(env = process.env) {
  return join8(env.WIZARDINGCODE_HOME ?? join8(homedir(), ".wizardingcode"), "crew");
}
function resolvePaths(cwd, env = process.env) {
  const root = findRoot(cwd);
  if (root === null)
    return null;
  const userDir = canonical(userDirOf(env));
  const repoId = sha256(root).slice(0, 16);
  return {
    root,
    crewDir: join8(root, ".crew"),
    localDir: join8(root, ".crew", "local"),
    userDir,
    integrityFile: join8(userDir, "integrity", `${repoId}.json`),
    repoId
  };
}
function workDir(paths, id) {
  return join8(paths.crewDir, "work", id);
}
var PROTECTED_TOP = new Set([".crew/profile.json", ".crew/policy.json", ".crew/.gitignore"]);
var PROTECTED_IN_WORK = new Set(["work.json", "evidence.json", "report.md"]);
function isProtectedPath(paths, absPath) {
  const abs = canonical(absPath);
  if (abs === paths.userDir || abs.startsWith(paths.userDir + sep))
    return true;
  const rel = relative2(paths.root, abs).replace(/\\/g, "/");
  if (rel.startsWith("..") || rel === "")
    return false;
  if (PROTECTED_TOP.has(rel))
    return true;
  if (rel === ".crew/local" || rel.startsWith(".crew/local/"))
    return true;
  const inWork = /^\.crew\/work\/[^/]+\/(.+)$/.exec(rel);
  if (!inWork)
    return false;
  const inner = inWork[1] ?? "";
  return PROTECTED_IN_WORK.has(inner) || inner.startsWith("logs/");
}

// packages/engine/src/policy.ts
import { join as join9 } from "node:path";

// packages/engine/src/store.ts
import { relative as relative3 } from "node:path";
var HAND_WRITTEN = ".crew/policy.json";
function rel(paths, absPath) {
  return relative3(paths.root, absPath).replace(/\\/g, "/");
}
function readIntegrity(paths) {
  const text = readText(paths.integrityFile);
  if (text === null)
    return { map: {}, corrupt: false };
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return { map: {}, corrupt: true };
    return { map: parsed, corrupt: false };
  } catch {
    return { map: {}, corrupt: true };
  }
}
function integrityOf(paths) {
  return readIntegrity(paths).map;
}
function remember(paths, absPath, text) {
  const integrity = integrityOf(paths);
  integrity[rel(paths, absPath)] = sha256(text);
  writeJson(paths.integrityFile, integrity);
}
function writeProtectedText(paths, absPath, text) {
  writeText(absPath, text);
  remember(paths, absPath, text);
}
function writeProtectedJson(paths, absPath, data) {
  writeProtectedText(paths, absPath, `${JSON.stringify(data, null, 2)}
`);
}
function recordIntegrity(paths, absPath) {
  const text = readText(absPath);
  if (text === null)
    return false;
  remember(paths, absPath, text);
  return true;
}
function readProtectedJson(paths, absPath) {
  const text = readText(absPath);
  if (text === null)
    return { data: null, tampered: false };
  const { map, corrupt } = readIntegrity(paths);
  const key = rel(paths, absPath);
  const expected = map[key];
  const tampered = corrupt ? true : expected === undefined ? key !== HAND_WRITTEN && Object.keys(map).length > 0 : expected !== sha256(text);
  try {
    return { data: JSON.parse(text), tampered };
  } catch {
    return { data: null, tampered: true };
  }
}

// packages/engine/src/policy.ts
var DEFAULT_POLICY = {
  requiredGates: [],
  riskPaths: {},
  riskPathExclusions: [],
  minimumRoute: "fast",
  allowSkips: ["*"],
  artifacts: "commit",
  unattendedDecisions: "wait"
};
function decisionCounts(policy, decision) {
  if (decision.by === "validator")
    return policy.unattendedDecisions === "validator";
  return decision.by !== "agent" || policy.unattendedDecisions === "count";
}
var RISK_AREAS = [
  "auth",
  "payments",
  "personal-data",
  "data-migration",
  "infra",
  "public-api",
  "secrets"
];
function strings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
function loadPolicy(paths) {
  const read = readProtectedJson(paths, join9(paths.crewDir, "policy.json"));
  const raw = read.data ?? {};
  const riskPaths = {};
  const rawRisk = raw.riskPaths ?? {};
  for (const area of RISK_AREAS) {
    const patterns = strings(rawRisk[area]);
    if (patterns.length)
      riskPaths[area] = patterns;
  }
  const minimumRoute = ROUTE_ORDER.includes(raw.minimumRoute) ? raw.minimumRoute : DEFAULT_POLICY.minimumRoute;
  const allowSkips = Array.isArray(raw.allowSkips) ? strings(raw.allowSkips) : DEFAULT_POLICY.allowSkips;
  return {
    policy: {
      requiredGates: strings(raw.requiredGates).filter((g) => GATE_NAMES.includes(g)),
      riskPaths,
      riskPathExclusions: strings(raw.riskPathExclusions),
      minimumRoute,
      allowSkips,
      artifacts: raw.artifacts === "local" ? "local" : "commit",
      unattendedDecisions: raw.unattendedDecisions === "count" || raw.unattendedDecisions === "validator" ? raw.unattendedDecisions : "wait"
    },
    tampered: read.tampered
  };
}
function skipAllowed(policy, step) {
  const bare = step.replace(/^(gate|tdd):/, "");
  return policy.allowSkips.some((s) => s === "*" || s === step || s === bare);
}

// packages/engine/src/work.ts
import { existsSync as existsSync2, readdirSync as readdirSync3 } from "node:fs";
import { join as join11 } from "node:path";

// packages/engine/src/state.ts
import { join as join10 } from "node:path";
function statePath(paths) {
  return join10(paths.localDir, "state.json");
}
function loadState(paths) {
  const raw = readJson(statePath(paths)) ?? {};
  return {
    active: typeof raw.active === "string" ? raw.active : null,
    sessions: raw.sessions ?? {}
  };
}
function saveState(paths, state) {
  writeJson(statePath(paths), state);
}
function sessionState(state, sessionId) {
  const existing = state.sessions[sessionId];
  if (existing)
    return existing;
  const created = { baseline: null, stopBlocks: 0 };
  state.sessions[sessionId] = created;
  return created;
}
function ensureCrewDir(paths, policy) {
  const wanted = `local/
work/*/logs/
${policy.artifacts === "local" ? `work/
` : ""}`;
  const file = join10(paths.crewDir, ".gitignore");
  if (readText(file) !== wanted)
    writeProtectedText(paths, file, wanted);
}

// packages/engine/src/work.ts
var PHASES_BY_ROUTE = {
  fast: ["receive", "recognize", "build", "gate", "deliver"],
  standard: ["receive", "recognize", "understand", "specify", "plan", "build", "gate", "deliver"],
  full: ["receive", "recognize", "understand", "specify", "plan", "build", "gate", "deliver"]
};
function slug(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}
function workJson(paths, id) {
  return join11(workDir(paths, id), "work.json");
}
function newWorkId(paths, title) {
  const date = nowIso().slice(0, 10);
  let existing = 0;
  try {
    existing = readdirSync3(join11(paths.crewDir, "work")).filter((n) => n.startsWith(date)).length;
  } catch {
    existing = 0;
  }
  const seq = String(existing + 1).padStart(3, "0");
  return `${date}-${seq}-${slug(title).slice(0, 40).replace(/-$/, "")}`;
}
function createWork(paths, input, baseFiles) {
  const title = (input.split(`
`).find((line) => line.trim()) ?? "untitled").trim().slice(0, 80);
  const at = nowIso();
  const work = {
    id: newWorkId(paths, title),
    title,
    input,
    type: "feature",
    route: "standard",
    routeReasons: ["not classified yet: standard by default"],
    riskAreas: [],
    phase: "receive",
    awaiting: null,
    criteria: [],
    approvals: [],
    skips: [],
    baseCommit: baseCommitOf(paths.root),
    ...baseFiles && Object.keys(baseFiles).length > 0 ? { baseFiles } : {},
    createdAt: at,
    updatedAt: at
  };
  writeProtectedJson(paths, workJson(paths, work.id), work);
  writeText(join11(workDir(paths, work.id), "brief.md"), `# Brief

## Request

${input.trim()}
`);
  const state = loadState(paths);
  state.active = work.id;
  saveState(paths, state);
  return work;
}
function saveWork(paths, work) {
  work.updatedAt = nowIso();
  writeProtectedJson(paths, workJson(paths, work.id), work);
}
function loadWork(paths, id) {
  const read = readProtectedJson(paths, workJson(paths, id));
  return { work: read.data, tampered: read.tampered };
}
function activeWork(paths) {
  const id = loadState(paths).active;
  if (!id || !existsSync2(workJson(paths, id)))
    return null;
  return loadWork(paths, id);
}
function openItems(paths, except) {
  let ids = [];
  try {
    ids = readdirSync3(join11(paths.crewDir, "work")).sort();
  } catch {
    return [];
  }
  const open = [];
  for (const id of ids) {
    if (id === except || !existsSync2(workJson(paths, id)))
      continue;
    const { work } = loadWork(paths, id);
    if (!work || work.phase === "deliver")
      continue;
    const evidence = readProtectedJson(paths, join11(workDir(paths, id), "evidence.json"));
    if (evidence.data?.verdict === "proven")
      continue;
    open.push(work);
  }
  return open;
}
function applyClassification(work, type, decision) {
  const first = work.phase === "receive";
  work.type = type;
  if (first) {
    work.route = decision.route;
    work.routeReasons = [...decision.reasons];
    work.riskAreas = [...decision.riskAreas];
  } else {
    const route = higherRoute(work.route, decision.route);
    if (route !== work.route) {
      work.routeReasons.push(`raised to ${route}: ${decision.reasons.join("; ")}`);
    } else if (decision.route !== work.route) {
      work.routeReasons.push(`reclassified as ${decision.route}; kept ${work.route}: a route is never lowered`);
    }
    work.route = route;
    work.riskAreas = [...new Set([...work.riskAreas, ...decision.riskAreas])];
  }
  if (work.phase === "receive")
    work.phase = "recognize";
}
function raiseRoute(work, to, reason) {
  if (routeRank(to) <= routeRank(work.route))
    return false;
  work.route = to;
  work.routeReasons.push(`raised to ${to}: ${reason}`);
  return true;
}
function addCriterion(work, text, kind = "behavior") {
  const taken = [...work.criteria, ...work.removedCriteria ?? []].map((c) => Number(c.id.slice("AC-".length))).filter((n) => Number.isFinite(n));
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const criterion = { id: `AC-${next}`, kind, text: text.trim() };
  work.criteria.push(criterion);
  return criterion;
}
function removeCriterion(work, evidence, id) {
  const index = work.criteria.findIndex((c) => c.id === id);
  if (index === -1)
    return { refused: `unknown criterion: ${id}` };
  if (evidence.tdd.some((t) => t.criterion === id)) {
    return { refused: `${id} has a test-first record; it stays` };
  }
  if (work.skips.some((s) => s.step === `tdd:${id}`)) {
    return { refused: `${id} has a skip; it stays` };
  }
  const [criterion] = work.criteria.splice(index, 1);
  const removed = { ...criterion, at: nowIso() };
  work.removedCriteria = [...work.removedCriteria ?? [], removed];
  return { removed };
}
var USER = { by: "user" };
function approve(work, what, decision = USER) {
  work.approvals.push({ what, at: nowIso(), ...decision });
}
function addSkip(work, step, reason, decision = USER) {
  work.skips.push({ step, reason, at: nowIso(), ...decision });
}
function isSkipped(work, step, policy) {
  return work.skips.some((s) => s.step === step && decisionCounts(policy, s));
}
function phaseIndex(phase) {
  return PHASE_ORDER.indexOf(phase);
}
function isBeforeBuild(work) {
  return phaseIndex(work.phase) < phaseIndex("build");
}
function hasAcceptanceSection(text) {
  const match = /^#{1,6}\s*acceptance criteria\s*$/im.exec(text);
  if (!match)
    return false;
  const rest = text.slice(match.index + match[0].length);
  const body = rest.split(/^#{1,6}\s/m)[0] ?? "";
  return body.trim().length > 0;
}
function tddDone(record, kind) {
  if (!record)
    return false;
  return kind === "behavior" ? !!record.red && !!record.green : !!record.before && !!record.after;
}
function routeDocuments(work, ctx) {
  const missing = [];
  if (work.route !== "fast") {
    if (ctx.specText === null)
      missing.push("spec.md in the work folder");
    else if (!hasAcceptanceSection(ctx.specText)) {
      missing.push('an "Acceptance criteria" section with content in spec.md');
    }
  }
  if (work.route === "full") {
    const approvals = work.approvals.filter((a) => a.what === "spec");
    if (!approvals.some((a) => decisionCounts(ctx.policy, a))) {
      const agent = approvals.find((a) => a.by === "agent");
      missing.push(agent ? `the user's approval of the spec: recorded by the agent in ${agent.mode} mode and not counted (a person runs crew approve <id> spec, or policy.json sets unattendedDecisions to "count")` : "the user's approval of the spec (crew approve <id> spec)");
    }
    if (!ctx.planExists)
      missing.push("plan.md in the work folder");
  }
  return missing;
}
function guardFor(work, next, ctx) {
  const missing = [];
  if (next === "build") {
    if (work.criteria.length === 0) {
      missing.push('at least one acceptance criterion (crew criteria <id> add "...")');
    }
    missing.push(...routeDocuments(work, ctx));
  } else if (next === "gate") {
    missing.push(...routeDocuments(work, ctx));
    for (const criterion of work.criteria) {
      if (isSkipped(work, `tdd:${criterion.id}`, ctx.policy))
        continue;
      const record = ctx.evidence?.tdd.find((t) => t.criterion === criterion.id);
      if (!tddDone(record, criterion.kind)) {
        const how = criterion.kind === "behavior" ? "red/green" : "before/after";
        missing.push(`test-first record for ${criterion.id} (crew tdd ${how})`);
      }
    }
  } else if (next === "deliver") {
    missing.push(...routeDocuments(work, ctx));
    if (!ctx.proven) {
      const reasons = ctx.unproven.map((reason) => `not proven: ${reason}`);
      missing.push(...reasons.length ? reasons : ["not proven: run crew gate run <id>"]);
    }
  }
  return missing;
}
function nextPhaseOf(work) {
  const phases = PHASES_BY_ROUTE[work.route];
  const index = phases.indexOf(work.phase);
  const current = index === -1 ? phases.findIndex((p) => phaseIndex(p) > phaseIndex(work.phase)) - 1 : index;
  return phases[current + 1] ?? null;
}
function advancePhase(work, ctx) {
  const next = nextPhaseOf(work);
  if (!next)
    return { ok: false, missing: ["already at the last phase"] };
  const missing = guardFor(work, next, ctx);
  if (missing.length)
    return { ok: false, missing };
  work.phase = next;
  return { ok: true, phase: next };
}

// packages/engine/src/evidence.ts
function decidedBy(decision) {
  return decision.by === "agent" ? `by the agent in ${decision.mode} mode` : "by the user";
}
function countedNote(policy, decision) {
  if (decision.by !== "agent")
    return "";
  return decisionCounts(policy, decision) ? ": counted by policy" : ": not counted, the policy waits for a person";
}
function emptyEvidence() {
  return {
    fingerprint: null,
    tdd: [],
    runs: [],
    verdict: "unproven",
    unproven: ["gates have not run"]
  };
}
function evidencePath(paths, id) {
  return join12(workDir(paths, id), "evidence.json");
}
function loadEvidence(paths, id) {
  const read = readProtectedJson(paths, evidencePath(paths, id));
  return { evidence: read.data ?? emptyEvidence(), tampered: read.tampered };
}
function saveEvidence(paths, id, evidence) {
  writeProtectedJson(paths, evidencePath(paths, id), evidence);
}
function runMatches(run, planned) {
  return run.gate === planned.gate && run.target === planned.target && (run.stack ?? null) === (planned.stack ?? null);
}
function gateLabel(planned, multiTarget) {
  const parts = [];
  if (multiTarget && planned.target !== ".")
    parts.push(planned.target);
  if (planned.stack)
    parts.push(planned.stack);
  return parts.length ? `${planned.gate} (${parts.join(", ")})` : planned.gate;
}
function computeVerdict(input) {
  const { work, evidence, expected, currentFingerprint, tampered, policy } = input;
  const unproven = [];
  if (tampered)
    unproven.push("state changed outside the engine");
  if (currentFingerprint === UNAVAILABLE)
    unproven.push("fingerprint unavailable: too many files to watch without git");
  const stale = evidence.fingerprint !== null && evidence.fingerprint !== currentFingerprint && !evidence.runs.some((r) => r.fingerprint === currentFingerprint);
  if (evidence.fingerprint === null)
    unproven.push("gates have not run");
  else if (stale)
    unproven.push("code changed since the last gate run");
  const multiTarget = new Set(expected.map((e) => e.target)).size > 1;
  for (const planned of expected) {
    const { gate } = planned;
    if (isSkipped(work, `gate:${gate}`, policy))
      continue;
    const label = gateLabel(planned, multiTarget);
    const run = evidence.runs.find((r) => runMatches(r, planned));
    if (!run)
      unproven.push(`gate ${label} not run`);
    else if (run.fingerprint !== currentFingerprint && !stale)
      unproven.push(`gate ${label} not run on the current code`);
    else if (run.status === "fail")
      unproven.push(`gate ${label} failing`);
    else if (run.status === "unavailable")
      unproven.push(`gate ${label} unavailable: ${run.reason ?? "no command"}`);
    else if (run.status === "pass" && !run.confirmed) {
      unproven.push(`gate ${label} ran an unconfirmed command (crew profile confirm)`);
    }
  }
  if (work.criteria.length === 0)
    unproven.push('no acceptance criteria (crew criteria <id> add "...")');
  for (const criterion of work.criteria) {
    if (isSkipped(work, `tdd:${criterion.id}`, policy))
      continue;
    const record = evidence.tdd.find((t) => t.criterion === criterion.id);
    if (!tddDone(record, criterion.kind))
      unproven.push(`test-first record missing for ${criterion.id}`);
  }
  return { verdict: unproven.length === 0 ? "proven" : "unproven", unproven };
}
function tddSummary(work, evidence, criterionId, kind, policy) {
  if (isSkipped(work, `tdd:${criterionId}`, policy)) {
    const skip = work.skips.find((s) => s.step === `tdd:${criterionId}`);
    return `skipped: ${skip?.reason ?? ""}`;
  }
  const record = evidence.tdd.find((t) => t.criterion === criterionId);
  if (tddDone(record, kind))
    return kind === "behavior" ? "red then green" : "passing before and after";
  if (record?.red || record?.before)
    return kind === "behavior" ? "red only" : "before only";
  return "missing";
}
function renderReport(work, evidence, policy) {
  const lines = [];
  lines.push(`# Report: ${work.title}`, "");
  lines.push(`- Work: \`${work.id}\``);
  lines.push(`- Type: ${work.type}. Route: ${work.route} (${work.routeReasons.join("; ")})`);
  lines.push(`- Verdict: **${evidence.verdict === "proven" ? "Proven" : "Not proven"}**`, "");
  if (evidence.unproven.length) {
    lines.push("## Not proven", "");
    for (const reason of evidence.unproven)
      lines.push(`- ${reason}`);
    lines.push("");
  }
  lines.push("## Acceptance criteria", "", "| Id | Kind | Criterion | Test-first |", "| :- | :- | :- | :- |");
  for (const c of work.criteria) {
    lines.push(`| ${c.id} | ${c.kind} | ${c.text.replace(/\|/g, "\\|")} | ${tddSummary(work, evidence, c.id, c.kind, policy)} |`);
  }
  lines.push("", "## Gates", "", "| Gate | Target | Status | Command | Duration | Log |", "| :- | :- | :- | :- | -: | :- |");
  for (const r of evidence.runs) {
    const status = r.status === "skipped" || r.status === "unavailable" ? `${r.status}${r.reason ? `: ${r.reason}` : ""}` : r.status;
    const target = r.stack ? `${r.target} (${r.stack})` : r.target;
    lines.push(`| ${r.gate} | ${target} | ${status} | ${r.command ? `\`${r.command}\`` : ""} | ${r.durationMs} ms | ${r.log ?? ""} |`);
  }
  const removed = work.removedCriteria ?? [];
  const pauses = work.pauses ?? [];
  const shared = work.sharedCheckout;
  if (work.approvals.length || work.skips.length || removed.length || pauses.length || shared) {
    lines.push("", "## Decisions", "");
    if (shared) {
      lines.push(`- started in a checkout shared with ${shared.with.join(", ")}, open with uncommitted changes in ${shared.paths.join(", ")} (${shared.at})`);
    }
    for (const a of work.approvals) {
      lines.push(`- ${a.what} approved ${decidedBy(a)} (${a.at})${countedNote(policy, a)}`);
    }
    for (const s of work.skips) {
      lines.push(`- \`${s.step}\` skipped ${decidedBy(s)}: ${s.reason} (${s.at})${countedNote(policy, s)}`);
    }
    for (const r of removed)
      lines.push(`- ${r.id} (${r.kind}) removed (${r.at}): ${r.text}`);
    for (const p of pauses)
      lines.push(`- paused for the user (${p.at}), not proven: ${p.reason}`);
  }
  lines.push("", `Fingerprint: ${evidence.fingerprint ?? "none"}`, "");
  return lines.join(`
`);
}

// packages/engine/src/gates.ts
import { accessSync, constants } from "node:fs";
import { basename as basename2, delimiter, join as join14 } from "node:path";

// packages/engine/src/run.ts
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync as mkdirSync2 } from "node:fs";
import { dirname as dirname3 } from "node:path";
var TAIL_LINES = 40;
function killTree(pid) {
  if (!pid)
    return;
  try {
    if (process.platform === "win32")
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
    else
      process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}
function runCommand(command, options) {
  mkdirSync2(dirname3(options.logPath), { recursive: true });
  const log = createWriteStream(options.logPath);
  const lines = [];
  let partial = "";
  const absorb = (chunk) => {
    log.write(chunk);
    partial += chunk.toString("utf8");
    const pieces = partial.split(`
`);
    partial = pieces.pop() ?? "";
    for (const line of pieces) {
      lines.push(line);
      if (lines.length > TAIL_LINES)
        lines.shift();
    }
  };
  const started = Date.now();
  return new Promise((resolve2) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      detached: process.platform !== "win32",
      env: options.env ?? process.env,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, options.timeoutMs);
    child.stdout?.on("data", absorb);
    child.stderr?.on("data", absorb);
    if (options.stdin !== undefined)
      child.stdin?.end(options.stdin);
    const finish = (exit) => {
      clearTimeout(timer);
      if (partial)
        lines.push(partial);
      log.end();
      resolve2({
        exit,
        durationMs: Date.now() - started,
        tail: lines.slice(-TAIL_LINES).join(`
`),
        timedOut
      });
    };
    child.on("error", (error) => {
      absorb(Buffer.from(`${error.message}
`));
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

// packages/engine/src/secrets.ts
import { execFileSync as execFileSync2, spawnSync } from "node:child_process";
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join13 } from "node:path";
var RULES = [
  {
    rule: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/
  },
  { rule: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16,}\b/ },
  {
    rule: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/
  },
  { rule: "Stripe key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { rule: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { rule: "OpenAI key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { rule: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    rule: "generic secret assignment",
    pattern: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{16,}['"]/i,
    generic: true
  }
];
var PLACEHOLDER = /example|placeholder|your[_-]|xxx|changeme|dummy|<[^>]+>/i;
var MAX_BYTES = 1024 * 1024;
function scanText(text, source) {
  const findings = [];
  text.split(`
`).forEach((line, index) => {
    for (const { rule, pattern, generic } of RULES) {
      if (generic && PLACEHOLDER.test(line))
        continue;
      if (pattern.test(line)) {
        findings.push({ source, line: index + 1, rule });
        break;
      }
    }
  });
  return findings;
}
function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}
function fileSource(root, path) {
  let buffer;
  try {
    buffer = readFileSync3(join13(root, path));
  } catch {
    return null;
  }
  if (buffer.length > MAX_BYTES || isBinary(buffer))
    return null;
  return { source: path, text: buffer.toString("utf8") };
}
function changedText(root, profile, base) {
  const sources = [];
  const everything = () => {
    for (const path of allWatchedFiles(root, profile) ?? []) {
      const source = fileSource(root, path);
      if (source)
        sources.push(source);
    }
    return sources;
  };
  if (!isGitRepo(root))
    return everything();
  const from = base ?? "HEAD";
  let diff;
  try {
    diff = execFileSync2("git", ["diff", from, "--unified=0", "--no-color", "--", "."], {
      cwd: root,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    diff = null;
  }
  const untracked = untrackedPaths(root);
  if (diff === null || untracked === null)
    return everything();
  const added = diff.split(`
`).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join(`
`);
  if (added)
    sources.push({
      source: `git diff ${base ? base.slice(0, 12) : "HEAD"} (added lines)`,
      text: added
    });
  for (const path of untracked.sort()) {
    if (!isWatched(path, profile))
      continue;
    const source = fileSource(root, path);
    if (source)
      sources.push(source);
  }
  return sources;
}
function gitleaks(text) {
  const result = spawnSync("gitleaks", ["stdin", "--no-banner", "--redact", "--exit-code", "1"], {
    input: text,
    encoding: "utf8"
  });
  if (result.error || result.status === null || result.status !== 0 && result.status !== 1)
    return { ran: false, leaked: false, tail: "" };
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status === 1 && !/leak/i.test(output))
    return { ran: false, leaked: false, tail: "" };
  return {
    ran: true,
    leaked: result.status === 1,
    tail: output.trim().split(`
`).slice(-20).join(`
`)
  };
}
async function scanSecrets(root, profile, base) {
  const sources = changedText(root, profile, base);
  const findings = sources.flatMap((s) => scanText(s.text, s.source));
  const lines = findings.map((f) => `${f.source}:${f.line}: ${f.rule}`);
  const extra = gitleaks(sources.map((s) => s.text).join(`
`));
  if (extra.ran && extra.leaked)
    lines.push("gitleaks:", extra.tail);
  const status = findings.length === 0 && !(extra.ran && extra.leaked) ? "pass" : "fail";
  return {
    status,
    findings,
    tail: lines.join(`
`) || "no secrets found in the change",
    usedGitleaks: extra.ran
  };
}

// packages/engine/src/gates.ts
var MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "composer.json",
  "composer.lock",
  "pyproject.toml",
  "uv.lock",
  "poetry.lock",
  "requirements.txt"
]);
function manifestChanged(changed) {
  return changed.some((p) => MANIFESTS.has(basename2(p)) || /^requirements.*\.txt$/.test(basename2(p)));
}
function onPath(binary, env) {
  const extensions = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir)
      continue;
    for (const extension of extensions) {
      try {
        accessSync(join14(dir, binary + extension), constants.X_OK);
        return true;
      } catch {}
    }
  }
  return false;
}
var NODE_AUDIT = {
  npm: {
    binary: "npm",
    command: "npm audit --audit-level=high",
    lockfiles: ["package-lock.json", "npm-shrinkwrap.json"]
  },
  pnpm: { binary: "pnpm", command: "pnpm audit --audit-level=high", lockfiles: ["pnpm-lock.yaml"] },
  yarn: { binary: "yarn", command: "yarn audit --level high", lockfiles: ["yarn.lock"] },
  bun: { binary: "bun", command: "bun audit", lockfiles: ["bun.lock", "bun.lockb"] }
};
var PYTHON_AUDIT = {
  uv: "uv run pip-audit",
  poetry: "poetry run pip-audit",
  pip: "python -m pip_audit"
};
function depsAuditCommand(target, root, env = process.env) {
  const dir = join14(root, target.path);
  if (target.stack === "python") {
    if (!onPath("pip-audit", env))
      return { reason: "pip-audit not on PATH" };
    return { command: PYTHON_AUDIT[target.packageManager] ?? PYTHON_AUDIT.pip ?? "pip-audit" };
  }
  let tool;
  if (target.stack === "node") {
    tool = NODE_AUDIT[target.packageManager];
    if (tool && target.packageManager === "yarn" && exists(join14(dir, ".yarnrc.yml")))
      tool = { ...tool, command: "yarn npm audit --severity high" };
  } else if (target.stack === "php") {
    tool = { binary: "composer", command: "composer audit", lockfiles: ["composer.lock"] };
  }
  if (!tool)
    return { reason: `no audit tool for ${target.packageManager}` };
  if (!tool.lockfiles.some((name) => exists(join14(dir, name))))
    return { reason: "no lockfile" };
  if (!onPath(tool.binary, env))
    return { reason: `${tool.binary} not on PATH` };
  return { command: tool.command };
}
function gatesForTarget(target, policy, changed) {
  const has = (gate) => !!target.gates[gate];
  const gates = [];
  if (has("build"))
    gates.push("build");
  gates.push("test");
  if (has("lint"))
    gates.push("lint");
  if (has("typecheck"))
    gates.push("typecheck");
  if (manifestChanged(changed))
    gates.push("deps");
  for (const gate of policy.requiredGates)
    if (gate !== "secrets" && !gates.includes(gate))
      gates.push(gate);
  return gates;
}
function plannedGates(route, profile, policy, changed, root) {
  const planned = [{ gate: "secrets", target: "." }];
  const touched = profile.targets.filter((t) => t.path === "." || changed.length === 0 || changed.some((p) => p === t.path || p.startsWith(`${t.path}/`)));
  const atPath = new Map;
  for (const t of profile.targets)
    atPath.set(t.path, (atPath.get(t.path) ?? 0) + 1);
  for (const target of touched) {
    const member = target.workspaceOf !== undefined && profile.targets.some((t) => t.path === target.workspaceOf);
    const shared = (atPath.get(target.path) ?? 0) > 1;
    for (const gate of gatesForTarget(target, policy, changed)) {
      if (member && !target.gates[gate])
        continue;
      if (gate === "deps" && route === "standard" && "reason" in depsAuditCommand(target, root))
        continue;
      planned.push({ gate, target: target.path, ...shared ? { stack: target.stack } : {} });
    }
  }
  return planned;
}
function targetOf(profile, planned) {
  return profile.targets.find((t) => t.path === planned.target && (planned.stack === undefined || t.stack === planned.stack));
}
function superseded(run, planned) {
  return run.gate === planned.gate && run.target === planned.target && (planned.stack === undefined || run.stack === undefined || run.stack === planned.stack);
}
async function runOne(paths, work, profile, planned, fingerprint) {
  const { gate, target: targetPath } = planned;
  const at = nowIso();
  const base = {
    gate,
    target: targetPath,
    ...planned.stack ? { stack: planned.stack } : {},
    command: null,
    commandSource: null,
    confirmed: true,
    exit: null,
    status: "unavailable",
    durationMs: 0,
    at,
    log: null,
    tail: "",
    fingerprint
  };
  if (gate === "secrets") {
    const started = Date.now();
    const scan = await scanSecrets(paths.root, profile, work.baseCommit);
    return {
      ...base,
      command: scan.usedGitleaks ? "built-in secret scan + gitleaks" : "built-in secret scan",
      exit: scan.status === "pass" ? 0 : 1,
      status: scan.status,
      durationMs: Date.now() - started,
      tail: scan.tail
    };
  }
  const target = targetOf(profile, planned);
  if (!target)
    return { ...base, reason: "target not in profile" };
  let command;
  let source = "detected";
  if (gate === "deps") {
    const audit = depsAuditCommand(target, paths.root);
    if ("reason" in audit)
      return { ...base, reason: audit.reason };
    command = audit.command;
  } else {
    const configured = target.gates[gate];
    if (!configured)
      return { ...base, reason: "no command" };
    command = configured.command;
    source = configured.source;
  }
  const where = targetPath.replace(/[^a-z0-9]+/gi, "_") + (planned.stack ? `-${planned.stack}` : "");
  const log = `logs/${gate}-${where}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: join14(paths.root, targetPath),
    timeoutMs: target.timeoutMs,
    logPath: join14(workDir(paths, work.id), log)
  });
  const passed = result.exit === 0 && !result.timedOut;
  return {
    ...base,
    command,
    commandSource: source,
    confirmed: source !== "proposed",
    exit: result.exit,
    status: passed ? "pass" : "fail",
    durationMs: result.durationMs,
    log,
    tail: result.tail,
    ...result.timedOut ? { reason: "timed out" } : {}
  };
}
async function runGates(paths, work, profile, policy, options = {}) {
  const base = work;
  const changed = changedWatchedPaths(paths.root, profile, base);
  const pathRisk = riskAreasForPaths(changed, policy);
  const excluded = excludedRiskPaths(changed, policy);
  const excludedNote = "risk paths excluded by the team policy: ";
  if (excluded.length && !work.routeReasons.some((r) => r.startsWith(excludedNote)))
    work.routeReasons.push(`${excludedNote}${excluded.join(", ")}`);
  let raised = null;
  if (pathRisk.length) {
    for (const area of pathRisk)
      if (!work.riskAreas.includes(area))
        work.riskAreas.push(area);
    if (raiseRoute(work, "full", `the change touches ${pathRisk.join(", ")} paths`))
      raised = "full";
  }
  const planned = plannedGates(work.route, profile, policy, changed, paths.root);
  const read = loadEvidence(paths, work.id);
  const evidence = read.evidence;
  const tampered = !!options.tampered || read.tampered;
  const fingerprintBefore = computeFingerprint(paths.root, profile, base);
  for (const one of planned) {
    const { gate, target } = one;
    if (options.only && !options.only.includes(gate))
      continue;
    evidence.runs = evidence.runs.filter((r) => !superseded(r, one));
    if (isSkipped(work, `gate:${gate}`, policy)) {
      const skip = work.skips.find((s) => s.step === `gate:${gate}`);
      evidence.runs.push({
        gate,
        target,
        ...one.stack ? { stack: one.stack } : {},
        command: null,
        commandSource: null,
        confirmed: true,
        exit: null,
        status: "skipped",
        durationMs: 0,
        at: nowIso(),
        log: null,
        tail: "",
        reason: skip?.reason,
        fingerprint: fingerprintBefore
      });
      continue;
    }
    evidence.runs.push(await runOne(paths, work, profile, one, fingerprintBefore));
  }
  evidence.fingerprint = fingerprintBefore;
  const verdict = computeVerdict({
    work,
    evidence,
    expected: planned,
    policy,
    currentFingerprint: computeFingerprint(paths.root, profile, base, MAX_WATCHED_FILES, fingerprintMethod(fingerprintBefore)),
    tampered
  });
  evidence.verdict = verdict.verdict;
  evidence.unproven = verdict.unproven;
  saveEvidence(paths, work.id, evidence);
  return { evidence, ...verdict, planned, changed, raised, tampered };
}
function assess(paths, work, profile, policy, tampered = false) {
  const base = work;
  const changed = changedWatchedPaths(paths.root, profile, base);
  const expected = plannedGates(work.route, profile, policy, changed, paths.root);
  const read = loadEvidence(paths, work.id);
  const verdict = computeVerdict({
    work,
    evidence: read.evidence,
    expected,
    currentFingerprint: computeFingerprint(paths.root, profile, base, MAX_WATCHED_FILES, fingerprintMethod(read.evidence.fingerprint)),
    tampered: tampered || read.tampered,
    policy
  });
  return { evidence: read.evidence, ...verdict, expected, changed };
}

// packages/engine/src/profile.ts
import { join as join15 } from "node:path";
function profilePath(paths) {
  return join15(paths.crewDir, "profile.json");
}
function loadProfile(paths) {
  const read = readProtectedJson(paths, profilePath(paths));
  return { profile: read.data, tampered: read.tampered };
}
function saveProfile(paths, profile) {
  writeProtectedJson(paths, profilePath(paths), profile);
}
function ensureProfile(paths) {
  const existing = loadProfile(paths);
  if (existing.profile)
    return { profile: existing.profile, tampered: existing.tampered };
  const profile = detectProfile(paths.root);
  if (existing.tampered)
    return { profile, tampered: true };
  saveProfile(paths, profile);
  return { profile, tampered: false };
}

// packages/engine/src/hooks/context.ts
function buildContext(payload, env = process.env) {
  const paths = resolvePaths(payload.cwd ?? process.cwd(), env);
  if (!paths)
    return null;
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  return {
    paths,
    sessionId: payload.session_id ?? "default",
    profile: profile.profile,
    policy: policy.policy,
    tampered: profile.tampered || policy.tampered,
    headless: env.CLAUDE_CODE_SESSION_ATTENDED === "0"
  };
}

// packages/engine/src/hooks/pre-tool-use.ts
import { isAbsolute, join as join16, relative as relative4 } from "node:path";

// packages/engine/src/hooks/shell.ts
function simpleCommands(command) {
  const pieces = [];
  for (const line of command.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    let piece = "";
    let quote = null;
    for (let i = 0;i < line.length; i++) {
      const ch = line.charAt(i);
      if (quote !== null) {
        piece += ch;
        if (ch === "\\" && quote === '"' && i + 1 < line.length)
          piece += line.charAt(++i);
        else if (ch === quote)
          quote = null;
      } else if (ch === "\\" && i + 1 < line.length) {
        piece += ch + line.charAt(++i);
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        piece += ch;
      } else if (ch === ";" || (ch === "|" || ch === "&") && !isRedirectPart(line, i)) {
        pieces.push(piece);
        piece = "";
      } else {
        piece += ch;
      }
    }
    pieces.push(piece);
  }
  return pieces.map((piece) => piece.trim()).filter((piece) => piece !== "");
}
function isRedirectPart(line, i) {
  const before = line.charAt(i - 1);
  return before === ">" || before === "<" || line.charAt(i) === "&" && line.charAt(i + 1) === ">";
}

// packages/engine/src/hooks/pre-tool-use.ts
var WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var RUNNER = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*|-\S*|node|bun|bunx|npx|sh|bash|zsh|eval|exec|env|time|nohup|xargs|sudo|command)`;
var USER_ONLY = new RegExp(String.raw`^[\s({]*(?:${RUNNER}\s+)*(?:\S*/)?crew(?:\.mjs)?\s+(?:skip|approve|accept|profile\s+confirm|policy\s+accept|profile\s+set\b[^;&|]*--force)\b`);
var ENGINE_FILES = /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|report\.md|logs\b))|\.wizardingcode\/crew\b/;
var WRITE_SHAPE = /(?:^|[\s;&|("'])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\|?\s*["']?\S*(?:\.crew\/|\.wizardingcode\/crew\b)/;
var OPAQUE_REDIRECT = />{1,2}\|?\s*["']?[$`]/;
var PROMPTLESS_MODES = new Set(["bypassPermissions", "dontAsk"]);
var MODE_FLAG = /--mode(?:=|\s+)(\S+)/;
function userOnlyDecision(cleaned, permissionMode, headless) {
  const flagged = MODE_FLAG.exec(cleaned)?.[1];
  const mode = permissionMode ?? "default";
  if (headless || PROMPTLESS_MODES.has(mode)) {
    if (flagged === mode)
      return null;
    const where = headless ? `a headless session in ${mode} mode` : `${mode} mode`;
    if (flagged === undefined) {
      return [
        "deny",
        `Crew: no person is watching this session (${where}) and this command records a decision that only the user can take. Run it again with --mode ${mode}, so the record says the agent decided and in which mode.`
      ];
    }
    return [
      "deny",
      `Crew: this session is ${where}, not ${flagged}; run the command with --mode ${mode}`
    ];
  }
  if (flagged !== undefined) {
    return [
      "deny",
      `Crew: a person is present (${mode} mode); run the command without --mode so they are asked`
    ];
  }
  return ["ask", "Crew: this command records a decision that only the user can take"];
}
function answer(permissionDecision, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason: reason
    }
  };
}
function pathFromInput(input) {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = input[key];
    if (typeof value === "string" && value)
      return value;
  }
  return null;
}
function onPreToolUse(ctx, payload) {
  const tool = payload.tool_name ?? "";
  const input = payload.tool_input ?? {};
  if (WRITE_TOOLS.has(tool)) {
    const filePath = pathFromInput(input);
    if (!filePath)
      return {};
    const abs = canonical(isAbsolute(filePath) ? filePath : join16(ctx.paths.root, filePath));
    if (isProtectedPath(ctx.paths, abs)) {
      return answer("deny", `Crew: ${filePath} is maintained by the engine and is changed through the crew command`);
    }
    const rel2 = relative4(ctx.paths.root, abs).replace(/\\/g, "/");
    if (rel2 === "" || rel2.startsWith("..") || !isWatched(rel2, ctx.profile))
      return {};
    const active = activeWork(ctx.paths);
    const work = active?.work;
    if (work && work.route !== "fast" && isBeforeBuild(work)) {
      return answer("deny", `Crew: work ${work.id} is in phase ${work.phase} on the ${work.route} route; source files change in the build phase (crew phase ${work.id} next)`);
    }
    return {};
  }
  if (tool === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    let asked = null;
    for (const piece of simpleCommands(command)) {
      const cleaned = piece.replace(/["'\\]/g, "");
      if (USER_ONLY.test(cleaned)) {
        const decided = userOnlyDecision(cleaned, payload.permission_mode, ctx.headless);
        if (decided?.[0] === "deny")
          return answer(...decided);
        asked ??= decided;
      }
      if (ENGINE_FILES.test(piece) && WRITE_SHAPE.test(piece) || OPAQUE_REDIRECT.test(piece) && ENGINE_FILES.test(command)) {
        return answer("deny", "Crew: files under .crew/ and ~/.wizardingcode/crew that the engine owns are written only by the crew command");
      }
    }
    if (asked)
      return answer(...asked);
  }
  return {};
}

// packages/engine/src/hooks/prompt.ts
function statusLine(ctx, work, tampered = false) {
  const result = assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || tampered);
  const state = result.verdict === "proven" ? "proven" : `not proven (${result.unproven[0] ?? "gates have not run"})`;
  const waiting = work.awaiting === "user" ? ", waiting for the user" : "";
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${waiting}.`;
}
function onPrompt(ctx) {
  const state = loadState(ctx.paths);
  sessionState(state, ctx.sessionId).stopBlocks = 0;
  saveState(ctx.paths, state);
  const active = activeWork(ctx.paths);
  if (!active?.work)
    return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: statusLine(ctx, active.work, active.tampered)
    }
  };
}

// packages/engine/src/hooks/session-start.ts
function onSessionStart(ctx, payload = {}) {
  ensureCrewDir(ctx.paths, ctx.policy);
  const former = isFormerWatchDefault(ctx.profile);
  const moved = former && !ctx.tampered;
  if (moved) {
    ctx.profile.watch.exclude = [...DEFAULT_WATCH_EXCLUDE];
    saveProfile(ctx.paths, ctx.profile);
  }
  const state = loadState(ctx.paths);
  const active = activeWork(ctx.paths);
  const continues = (payload.source === "resume" || payload.source === "compact") && state.sessions[ctx.sessionId] !== undefined;
  if (!continues) {
    const session = sessionState(state, ctx.sessionId);
    const work = active?.work ?? null;
    const base = work;
    const inherited = work !== null && changedWatchedPaths(ctx.paths.root, ctx.profile, base).length > 0 && assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered).verdict !== "proven";
    session.baseline = inherited ? null : computeFingerprint(ctx.paths.root, ctx.profile, base);
    session.stopBlocks = 0;
    saveState(ctx.paths, state);
  }
  const lines = [
    "WizardingCode Developer Crew is active in this repository. Work is proven by the `crew` command and the crew skill, and a turn cannot end while watched source files have unproven changes."
  ];
  if (active?.work)
    lines.push(statusLine(ctx, active.work, active.tampered).replace(/^Crew: work/, "Work in progress:"));
  else
    lines.push(`No work item is active. A code change starts by answering the crew skill's nine typed questions, then crew start "<request>" --answers '<json>'.`);
  const missing = missingTestCommands(ctx.profile);
  if (missing.length) {
    lines.push(`No test command is known for: ${missing.map((m) => m.target).join(", ")}. One is proposed with \`crew profile set test "<cmd>"\`.`);
  }
  if (moved) {
    lines.push(`The profile's watch list predated this release and now follows the current default (${DEFAULT_WATCH_EXCLUDE.join(", ")}).`);
  } else if (former) {
    lines.push("The profile predates this release: run `crew detect --refresh` once to pick up the current defaults.");
  }
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join(" ") }
  };
}

// packages/engine/src/hooks/stop.ts
var MAX_STOP_BLOCKS = 3;
function onStop(ctx) {
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  const active = activeWork(ctx.paths);
  const work = active?.work ?? null;
  const current = computeFingerprint(ctx.paths.root, ctx.profile, work);
  const result = work ? assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered) : null;
  const proven = result?.verdict === "proven";
  const changed = session.baseline !== null && current !== UNAVAILABLE ? current !== session.baseline : work !== null && !proven;
  const done = (response) => {
    saveState(ctx.paths, state);
    return response;
  };
  const release = (response, pause) => {
    if (work && work.awaiting !== null && !active?.tampered) {
      work.awaiting = null;
      if (pause !== undefined)
        work.pauses = [...work.pauses ?? [], { at: nowIso(), reason: pause }];
      saveWork(ctx.paths, work);
    }
    return done(response);
  };
  if (!changed || proven) {
    session.stopBlocks = 0;
    return release({});
  }
  const missing = result ? result.unproven : ['no work item: start one with crew start "<request>"'];
  if (work?.awaiting === "user") {
    session.stopBlocks = 0;
    const reason = missing[0] ?? "not proven";
    return release({
      systemMessage: `Crew: work ${work.id} ends this turn waiting for the user and is not proven (${reason}). The next turn is held to the Stop rule again.`
    }, reason);
  }
  if (session.stopBlocks >= MAX_STOP_BLOCKS) {
    return done({
      systemMessage: `Crew: not proven after ${MAX_STOP_BLOCKS} attempts. ${missing.join("; ")}.`
    });
  }
  session.stopBlocks += 1;
  const gate = work ? `crew gate run ${work.id}` : 'crew start "<request>"';
  const wait = work ? ` To end the turn with a question for the user, run crew await ${work.id} user first.` : "";
  return done({
    decision: "block",
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.${wait}`
  });
}

// packages/engine/src/hooks/index.ts
var EVENTS = new Set(["session-start", "prompt", "pre-tool-use", "stop"]);
var INACTIVE_CONTEXT = "Crew is inactive here: not a git repository and no .crew/ folder. Run crew detect in a project root to activate it.";
function handleHook(event, payload, env = process.env) {
  if (!EVENTS.has(event))
    return {};
  try {
    const ctx = buildContext(payload, env);
    if (!ctx) {
      return event === "session-start" ? {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: INACTIVE_CONTEXT
        }
      } : {};
    }
    switch (event) {
      case "session-start":
        return onSessionStart(ctx, payload);
      case "prompt":
        return onPrompt(ctx);
      case "pre-tool-use":
        return onPreToolUse(ctx, payload);
      default:
        return onStop(ctx);
    }
  } catch {
    return {};
  }
}

// packages/engine/src/tdd.ts
import { join as join17 } from "node:path";
var TEST_PATTERNS = ["**/*test*", "**/*spec*", "tests/**", "test/**", "**/__tests__/**"];
function defaultTestCommand(profile) {
  const target = profile.targets.find((t) => t.path === "." && t.gates.test) ?? profile.targets.find((t) => t.gates.test);
  return target?.gates.test ? { command: target.gates.test.command, timeoutMs: target.timeoutMs } : null;
}
async function recordTdd(paths, work, evidence, profile, criterionId, step, override) {
  const criterion = work.criteria.find((c) => c.id === criterionId);
  if (!criterion)
    return { ok: false, message: `unknown criterion ${criterionId}` };
  const behaviourStep = step === "red" || step === "green";
  if (behaviourStep !== (criterion.kind === "behavior")) {
    return {
      ok: false,
      message: criterion.kind === "behavior" ? `${criterionId} is a behavior criterion: record red, then green` : `${criterionId} is a preserve criterion: record before, then after`
    };
  }
  const fallback = defaultTestCommand(profile);
  const command = override ?? fallback?.command;
  if (!command) {
    return {
      ok: false,
      message: 'no test command: set one with crew profile set test "<cmd>" or pass -- <cmd>'
    };
  }
  let entry = evidence.tdd.find((t) => t.criterion === criterionId);
  if (!entry) {
    entry = { criterion: criterionId };
    evidence.tdd.push(entry);
  }
  if (step === "green" && !entry.red)
    return { ok: false, message: `no red run recorded for ${criterionId}: run crew tdd red first` };
  if (step === "after" && !entry.before)
    return {
      ok: false,
      message: `no before run recorded for ${criterionId}: run crew tdd before first`
    };
  const log = `logs/tdd-${criterionId}-${step}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: paths.root,
    timeoutMs: fallback?.timeoutMs ?? 10 * 60 * 1000,
    logPath: join17(workDir(paths, work.id), log)
  });
  const record = {
    command,
    exit: result.exit,
    at: nowIso(),
    durationMs: result.durationMs,
    log,
    tail: result.tail,
    timedOut: result.timedOut
  };
  const passed = result.exit === 0 && !result.timedOut;
  if (step === "red") {
    if (passed) {
      return {
        ok: false,
        message: "the test passed before the change; a test that passes before the code exists proves nothing",
        record
      };
    }
    if (result.timedOut || result.exit === null || result.exit === 126 || result.exit === 127) {
      return {
        ok: false,
        message: `the red run did not fail for the right reason (exit ${result.exit ?? "none"}${result.timedOut ? ", timed out" : ""}): fix the command before recording`,
        record
      };
    }
    record.changedTests = changedWatchedPaths(paths.root, profile, work).filter((p) => matchesAny(p, TEST_PATTERNS));
    entry.red = record;
    return { ok: true, message: `red recorded for ${criterionId} (exit ${result.exit})`, record };
  }
  if (!passed) {
    return {
      ok: false,
      message: `${step} run failed (exit ${result.exit}${result.timedOut ? ", timed out" : ""}); nothing recorded`,
      record
    };
  }
  entry[step] = record;
  return { ok: true, message: `${step} recorded for ${criterionId}`, record };
}

// packages/engine/src/version.ts
var VERSION = "0.1.7";

// packages/engine/src/cli.ts
var BOOLEAN_FLAGS = new Set(["json", "refresh", "force"]);
var KNOWN_FLAGS = {
  detect: ["refresh"],
  profile: ["target", "stack", "force"],
  policy: [],
  accept: [],
  start: ["answers", "criterion", "preserve"],
  classify: ["answers"],
  criteria: ["kind"],
  approve: ["mode"],
  phase: [],
  await: [],
  resume: [],
  tdd: [],
  gate: ["only"],
  skip: ["reason", "mode"],
  evidence: [],
  status: [],
  mode: [],
  config: [],
  version: [],
  help: []
};
function parse(argv) {
  const parsed = { positional: [], flags: {}, multi: {}, ordered: [], rest: [] };
  for (let i = 0;i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && !BOOLEAN_FLAGS.has(key)) {
        parsed.flags[key] = next;
        const values = parsed.multi[key] ?? [];
        values.push(next);
        parsed.multi[key] = values;
        parsed.ordered.push({ key, value: next });
        i++;
      } else
        parsed.flags[key] = true;
    } else
      parsed.positional.push(arg);
  }
  return parsed;
}
function unknownFlag(command, parsed) {
  const known = KNOWN_FLAGS[command];
  if (!known)
    return null;
  const unknown = Object.keys(parsed.flags).find((k) => k !== "json" && !known.includes(k));
  if (unknown === undefined)
    return null;
  const takes = [...known, "json"].map((k) => `--${k}`).join(", ");
  const hint = command === "start" && unknown === "kind" ? '; for a criterion that existing tests keep green use --preserve "<text>"' : "";
  return refuse(`unknown flag --${unknown} for ${command} (it takes ${takes})${hint}`);
}
var ok = (text, data = {}) => ({ code: 0, text, data });
var refuse = (text, data = {}) => ({
  code: 1,
  text,
  data
});
var INACTIVE = "crew is inactive here: not a git repository and no .crew/ folder; run crew detect in the project root to activate it";
function tamperMessage({ file, accept }) {
  return `state changed outside the engine: ${file}; the user can accept it with crew accept ${accept}`;
}
function load(paths) {
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  ensureCrewDir(paths, policy.policy);
  const tamperedFiles = [];
  if (profile.tampered)
    tamperedFiles.push({ file: ".crew/profile.json", accept: "profile" });
  if (policy.tampered)
    tamperedFiles.push({ file: ".crew/policy.json", accept: "policy" });
  return {
    paths,
    profile: profile.profile,
    policy: policy.policy,
    config: loadConfig(paths),
    tampered: tamperedFiles.length > 0,
    tamperedFiles
  };
}
function openWork(env, id) {
  if (!id)
    return refuse("a work item id is required");
  const read = loadWork(env.paths, id);
  if (!read.work) {
    return read.tampered ? refuse(tamperMessage({ file: `.crew/work/${id}/work.json`, accept: id })) : refuse(`unknown work item: ${id}`);
  }
  return { work: read.work, tampered: read.tampered };
}
function tamperRefusal(env, opened) {
  const found = [...env.tamperedFiles];
  if (opened) {
    const base = `.crew/work/${opened.work.id}`;
    if (opened.tampered)
      found.push({ file: `${base}/work.json`, accept: opened.work.id });
    if (loadEvidence(env.paths, opened.work.id).tampered)
      found.push({ file: `${base}/evidence.json`, accept: opened.work.id });
  }
  const first = found[0];
  return first ? refuse(tamperMessage(first)) : null;
}
function skipStep(work, raw) {
  const isGate = (name) => GATE_NAMES.includes(name);
  const isCriterion = (id) => work.criteria.some((c) => c.id === id);
  if (isGate(raw))
    return `gate:${raw}`;
  if (isCriterion(raw))
    return `tdd:${raw}`;
  if (raw.startsWith("gate:") && isGate(raw.slice(5)))
    return raw;
  if (raw.startsWith("tdd:") && isCriterion(raw.slice(4)))
    return raw;
  if (PHASE_ORDER.includes(raw))
    return raw;
  return null;
}
function accept(env, target) {
  if (target === "profile" || target === "policy") {
    if (!recordIntegrity(env.paths, join18(env.paths.crewDir, `${target}.json`)))
      return refuse(`no .crew/${target}.json to accept`);
    return ok(`${target} accepted: its current content is now the trusted version`, {
      accepted: target
    });
  }
  const dir = workDir(env.paths, target);
  if (!/^[\w.-]+$/.test(target) || target.includes("..") || !existsSync3(join18(dir, "work.json")))
    return refuse(`unknown work item: ${target}`);
  const files = ["work.json", "evidence.json", "report.md"].filter((name) => recordIntegrity(env.paths, join18(dir, name)));
  return ok(`${target} accepted: ${files.join(", ")} now trusted as they are`, {
    accepted: target,
    files
  });
}
function openForChange(env, id) {
  const opened = openWork(env, id);
  if (isOutcome(opened))
    return opened;
  return tamperRefusal(env, opened) ?? opened;
}
function isOutcome(value) {
  return typeof value === "object" && value !== null && "code" in value && "text" in value;
}
function decisionFlag(parsed) {
  const mode = parsed.flags.mode;
  if (mode === undefined)
    return { by: "user" };
  if (!isPermissionMode(mode)) {
    return refuse(`--mode names the permission mode of a session with no person watching: ${PERMISSION_MODES.slice(0, -1).join(", ")} or ${PERMISSION_MODES.at(-1)}`);
  }
  return { by: "agent", mode };
}
function decisionText(policy, decision) {
  const note = countedNote(policy, decision);
  return `${decidedBy(decision)}${note ? ` (${note.slice(2)})` : ""}`;
}
function guardContext(env, work, tampered) {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join18(dir, "spec.md")),
    planExists: existsSync3(join18(dir, "plan.md")),
    evidence: result.evidence,
    proven: result.verdict === "proven",
    unproven: result.unproven,
    policy: env.policy
  };
}
function logDecision(env, work, answers) {
  if (!env.config.decisions.log)
    return;
  const line = JSON.stringify({
    at: nowIso(),
    work: work.id,
    input: work.input.slice(0, 500),
    answers,
    route: work.route,
    reasons: work.routeReasons
  });
  const file = join18(env.paths.localDir, "decisions.jsonl");
  writeText(file, `${readText(file) ?? ""}${line}
`);
}
function parseAnswers(raw) {
  try {
    return validateAnswers(JSON.parse(raw));
  } catch (error) {
    if (error instanceof AnswerError)
      return refuse(`invalid answers: ${error.message}`);
    return refuse("answers must be valid JSON");
  }
}
function classify(env, work, answers) {
  const decision = computeRoute(answers, [], env.policy);
  applyClassification(work, answers.work_type, decision);
  logDecision(env, work, answers);
}
function gateSummary(work, verdict, unproven, runs) {
  const lines = runs.map((r) => `  ${r.gate} (${r.target}${r.stack ? `, ${r.stack}` : ""}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`);
  lines.push(verdict === "proven" ? `Proven: ${work.id}` : `Not proven: ${unproven.join("; ")}`);
  return lines.join(`
`);
}
async function dispatch(parsed, io) {
  const [command, ...args] = parsed.positional;
  if (parsed.flags.version || command === "version")
    return ok(VERSION, { version: VERSION });
  if (command === "hook") {
    const event = args[0] ?? "";
    let payload = {};
    try {
      const raw = await io.stdin();
      payload = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    if (typeof payload.cwd !== "string")
      payload.cwd = io.cwd;
    return ok(JSON.stringify(handleHook(event, payload, io.env)), {
      hookEvent: event
    });
  }
  const badFlag = unknownFlag(command ?? "help", parsed);
  if (badFlag)
    return badFlag;
  if (!command || command === "help")
    return ok(HELP);
  if (command === "mode" || command === "config")
    return settings(command, args, { userDir: userDirOf(io.env) });
  let paths = resolvePaths(io.cwd, io.env);
  if (!paths && command === "detect") {
    ensureDir(join18(resolve2(io.cwd), ".crew"));
    paths = resolvePaths(io.cwd, io.env);
  }
  if (!paths)
    return refuse(INACTIVE);
  const env = load(paths);
  switch (command) {
    case "detect": {
      if (parsed.flags.refresh) {
        const refused = tamperRefusal(env);
        if (refused)
          return refused;
      }
      const previous = parsed.flags.refresh ? loadProfile(env.paths).profile : null;
      const profile = parsed.flags.refresh ? detectProfile(env.paths.root, previous) : env.profile;
      if (parsed.flags.refresh) {
        saveProfile(env.paths, profile);
        if (integrityOf(env.paths)[".crew/policy.json"] === undefined) {
          recordIntegrity(env.paths, join18(env.paths.crewDir, "policy.json"));
        }
      }
      const missing = missingTestCommands(profile);
      const lines = profile.targets.map((t) => `  ${t.path} (${t.stack}, ${t.packageManager}${t.workspaceOf ? `, workspace of ${t.workspaceOf}` : ""}): ${Object.entries(t.gates).map(([g, c]) => `${g}=${c.command}${c.source === "proposed" ? " [proposed]" : ""}`).join(", ") || "no commands"}`);
      if (missing.length)
        lines.push(`No test command for: ${missing.map((m) => m.target).join(", ")}. Propose one: crew profile set test "<cmd>" [--target <path>]`);
      return ok(lines.join(`
`), { profile, missing });
    }
    case "profile": {
      const [sub, gate, cmd] = args;
      if (sub === "set" || sub === "confirm") {
        const refused = tamperRefusal(env);
        if (refused)
          return refused;
      }
      if (sub === "set") {
        if (!GATE_NAMES.includes(gate) || gate === "secrets" || !cmd)
          return refuse('usage: crew profile set <build|test|lint|typecheck|deps> "<cmd>" [--target <path>]');
        const targetPath = typeof parsed.flags.target === "string" ? parsed.flags.target : ".";
        const stackFlag = parsed.flags.stack;
        if (stackFlag !== undefined && !STACKS.includes(stackFlag))
          return refuse(`usage: crew profile set <gate> "<cmd>" --stack <${STACKS.join("|")}>`);
        const stack = stackFlag;
        const atPath = env.profile.targets.filter((t) => t.path === targetPath);
        if (stack === undefined && atPath.length > 1) {
          const stacks = atPath.map((t) => t.stack);
          return refuse(`two targets at ${targetPath} (${stacks.join(", ")}): say which one with --stack <${stacks.join("|")}>`);
        }
        let target = stack === undefined ? atPath[0] : atPath.find((t) => t.stack === stack);
        if (!target) {
          target = {
            path: targetPath,
            stack: stack ?? "other",
            packageManager: "unknown",
            gates: {},
            timeoutMs: 10 * 60 * 1000
          };
          env.profile.targets.push(target);
        }
        const where = stack === undefined ? targetPath : `${targetPath} (${stack})`;
        const current = target.gates[gate];
        if (current && current.source !== "proposed" && !parsed.flags.force)
          return refuse(`${gate} for ${where} already has a ${current.source} command (${current.command}); replacing it needs the user: crew profile set ${gate} "<cmd>" --force`);
        target.gates[gate] = { command: cmd, source: "proposed" };
        saveProfile(env.paths, env.profile);
        return ok(`proposed ${gate} for ${where}: ${cmd} (unconfirmed until crew profile confirm)`, {
          target: targetPath,
          ...stack ? { stack } : {},
          gate,
          command: cmd
        });
      }
      if (sub === "confirm") {
        if (gate !== undefined && !GATE_NAMES.includes(gate))
          return refuse("usage: crew profile confirm [<gate>]");
        const confirmed = [];
        for (const target of env.profile.targets)
          for (const [name, command2] of Object.entries(target.gates))
            if (command2.source === "proposed" && (gate === undefined || name === gate)) {
              command2.source = "confirmed";
              confirmed.push(`${name}: ${command2.command}`);
            }
        saveProfile(env.paths, env.profile);
        return ok([`confirmed ${confirmed.length} command(s)`, ...confirmed].join(`
  `), {
          confirmed: confirmed.length,
          commands: confirmed
        });
      }
      return refuse("usage: crew profile set|confirm");
    }
    case "policy": {
      if (args[0] !== "accept")
        return refuse("usage: crew policy accept");
      return accept(env, "policy");
    }
    case "accept": {
      if (!args[0])
        return refuse("usage: crew accept <id|profile|policy>");
      return accept(env, args[0]);
    }
    case "start": {
      const input = args.join(" ").trim();
      if (!input)
        return refuse(`usage: crew start "<request>" --answers '<json>'`);
      if (typeof parsed.flags.answers !== "string")
        return refuse("answers are required: answer the nine typed questions from the crew skill (references/receive.md) and pass them with --answers");
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers))
        return answers;
      if (answers.work_type === "question")
        return ok("question: answer the user; no work item is created", { id: null });
      const previous = activeWork(env.paths);
      const previousProven = !!previous?.work && assess(env.paths, previous.work, env.profile, env.policy, env.tampered || previous.tampered).verdict === "proven";
      const warning = previous?.work && !previousProven ? `warning: ${previous.work.id} is not proven and is no longer the active work item
` : "";
      const uncommitted = isGitRepo(env.paths.root) ? changedWatchedPaths(env.paths.root, env.profile) : [];
      const baseFiles = previousProven ? hashPaths(env.paths.root, uncommitted) : {};
      const inherited = previousProven ? [] : uncommitted;
      const inheritedWarning = inherited.length ? `warning: uncommitted changes in ${inherited.join(", ")} count as this item's change; commit them first if they are not
` : "";
      const provenNote = previousProven && uncommitted.length && previous?.work ? `note: uncommitted changes in ${uncommitted.join(", ")} are ${previous.work.id}'s proven work and not this item's
` : "";
      const neighbours = uncommitted.length ? openItems(env.paths).map((w) => w.id) : [];
      const work = createWork(env.paths, input, baseFiles);
      if (neighbours.length)
        work.sharedCheckout = { with: neighbours, paths: uncommitted, at: work.createdAt };
      const sharedWarning = neighbours.length ? `warning: this checkout is shared with ${neighbours.join(", ")}, which ${neighbours.length === 1 ? "is" : "are"} open with uncommitted changes in ${uncommitted.join(", ")}; a second session on one checkout blocks turn ends and proves half-written code: work in a worktree (git worktree add ../<name> -b <branch>)
` : "";
      classify(env, work, answers);
      const criteria = parsed.ordered.filter((f) => f.key === "criterion" || f.key === "preserve").map((f) => addCriterion(work, f.value, f.key === "preserve" ? "preserve" : "behavior"));
      if (work.route === "fast" && criteria.length > 0)
        advancePhase(work, guardContext(env, work, false));
      saveWork(env.paths, work);
      const lines = criteria.map((c) => `
  ${c.id} (${c.kind}): ${c.text}`).join("");
      return ok(`${warning}${sharedWarning}${inheritedWarning}${provenNote}started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})${lines}`, {
        id: work.id,
        route: work.route,
        phase: work.phase,
        routeReasons: work.routeReasons,
        replaced: warning ? previous?.work?.id : null,
        criteria,
        inherited,
        shared: work.sharedCheckout ?? null,
        proven: previousProven && previous?.work ? { of: previous.work.id, paths: uncommitted } : null
      });
    }
    case "classify": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (typeof parsed.flags.answers !== "string")
        return refuse("usage: crew classify <id> --answers <json>");
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers))
        return answers;
      classify(env, opened.work, answers);
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: route ${opened.work.route} (${opened.work.routeReasons.join("; ")})`, { id: opened.work.id, route: opened.work.route, riskAreas: opened.work.riskAreas });
    }
    case "criteria": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (args[1] === "remove" && args[2]) {
        const { evidence } = loadEvidence(env.paths, opened.work.id);
        const outcome = removeCriterion(opened.work, evidence, args[2]);
        if ("refused" in outcome)
          return refuse(outcome.refused);
        saveWork(env.paths, opened.work);
        const { removed } = outcome;
        return ok(`${removed.id} (${removed.kind}) removed: ${removed.text}`, { removed });
      }
      const text = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !text)
        return refuse('usage: crew criteria <id> add "<criterion>" [--kind preserve] | crew criteria <id> remove <AC-n>');
      const kind = parsed.flags.kind === "preserve" ? "preserve" : "behavior";
      const criterion = addCriterion(opened.work, text, kind);
      saveWork(env.paths, opened.work);
      return ok(`${criterion.id} (${kind}): ${criterion.text}`, { criterion });
    }
    case "approve": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (args[1] !== "spec")
        return refuse("usage: crew approve <id> spec [--mode <mode>]");
      const decision = decisionFlag(parsed);
      if (isOutcome(decision))
        return decision;
      approve(opened.work, "spec", decision);
      saveWork(env.paths, opened.work);
      return ok(`spec approved for ${opened.work.id} ${decisionText(env.policy, decision)}`, {
        approvals: opened.work.approvals
      });
    }
    case "phase": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (args[1] !== "next")
        return refuse("usage: crew phase <id> next");
      const result = advancePhase(opened.work, guardContext(env, opened.work, opened.tampered));
      if (!result.ok)
        return refuse(`cannot enter the next phase; missing:
  ${result.missing.join(`
  `)}`, {
          missing: result.missing,
          phase: opened.work.phase
        });
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: phase ${result.phase}`, { phase: result.phase });
    }
    case "await":
    case "resume": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      opened.work.awaiting = command === "await" ? "user" : null;
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: ${command === "await" ? "waiting for the user" : "resumed"}`, {
        awaiting: opened.work.awaiting
      });
    }
    case "tdd": {
      const [step, id, criterion] = args;
      const opened = openForChange(env, id);
      if (isOutcome(opened))
        return opened;
      if (!["red", "green", "before", "after"].includes(step ?? "") || !criterion)
        return refuse("usage: crew tdd <red|green|before|after> <id> <criterion> [-- <cmd>]");
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      const override = parsed.rest.length ? parsed.rest.join(" ") : undefined;
      const outcome = await recordTdd(env.paths, opened.work, evidence, env.profile, criterion, step, override);
      if (outcome.ok)
        saveEvidence(env.paths, opened.work.id, evidence);
      const tail = outcome.record?.tail ? `
${outcome.record.tail}` : "";
      return outcome.ok ? ok(outcome.message, { record: outcome.record }) : refuse(`${outcome.message}${tail}`, { record: outcome.record });
    }
    case "gate": {
      const opened = openForChange(env, args[1]);
      if (isOutcome(opened))
        return opened;
      if (args[0] !== "run")
        return refuse("usage: crew gate run <id> [--only a,b]");
      const only = typeof parsed.flags.only === "string" ? parsed.flags.only.split(",").map((g) => g.trim()).filter(Boolean) : undefined;
      const unknown = only?.find((g) => !GATE_NAMES.includes(g));
      if (unknown !== undefined)
        return refuse(`unknown gate: ${unknown}`);
      const outcome = await runGates(env.paths, opened.work, env.profile, env.policy, {
        only,
        tampered: env.tampered || opened.tampered
      });
      for (const target of ["gate", "deliver"]) {
        if (nextPhaseOf(opened.work) !== target)
          continue;
        if (!advancePhase(opened.work, guardContext(env, opened.work, opened.tampered)).ok)
          break;
      }
      saveWork(env.paths, opened.work);
      writeProtectedText(env.paths, join18(workDir(env.paths, opened.work.id), "report.md"), renderReport(opened.work, outcome.evidence, env.policy));
      const raised = outcome.raised ? `Route raised to ${outcome.raised}: ${opened.work.routeReasons.at(-1)}
` : "";
      return {
        code: outcome.verdict === "proven" ? 0 : 1,
        stdout: true,
        text: raised + gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs),
        data: {
          verdict: outcome.verdict,
          unproven: outcome.unproven,
          runs: outcome.evidence.runs,
          raised: outcome.raised,
          route: opened.work.route
        }
      };
    }
    case "skip": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const raw = args[1];
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
      if (!raw || !reason)
        return refuse('usage: crew skip <id> <step> --reason "<text>"');
      const step = skipStep(opened.work, raw);
      if (!step)
        return refuse(`unknown step: ${raw}`);
      if (!skipAllowed(env.policy, step))
        return refuse(`the team policy does not allow skipping ${step}`);
      if (env.config.mode === "pilot" && (step === "gate:secrets" || step === "gate:deps"))
        return refuse(`in pilot mode the ${step.slice(5)} gate cannot be skipped`);
      const decision = decisionFlag(parsed);
      if (isOutcome(decision))
        return decision;
      addSkip(opened.work, step, reason, decision);
      saveWork(env.paths, opened.work);
      return ok(`skipped ${step} on ${opened.work.id} ${decisionText(env.policy, decision)}: ${reason}`, {
        skips: opened.work.skips
      });
    }
    case "evidence": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const refused = tamperRefusal(env, opened);
      const result = assess(env.paths, opened.work, env.profile, env.policy, env.tampered || opened.tampered);
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      const report = renderReport(opened.work, result.evidence, env.policy);
      if (refused)
        return refuse(`${refused.text}

${report}`, {
          verdict: result.verdict,
          unproven: result.unproven
        });
      saveEvidence(env.paths, opened.work.id, result.evidence);
      writeProtectedText(env.paths, join18(workDir(env.paths, opened.work.id), "report.md"), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case "status": {
      const active = activeWork(env.paths);
      if (!active?.work)
        return ok("no active work item", { active: null });
      const result = assess(env.paths, active.work, env.profile, env.policy, env.tampered || active.tampered);
      const text = `${active.work.id} "${active.work.title}"
  phase ${active.work.phase}, route ${active.work.route}${active.work.awaiting ? ", waiting for the user" : ""}
${gateSummary(active.work, result.verdict, result.unproven, result.evidence.runs)}`;
      const work = active.work;
      return ok(text, {
        active: work.id,
        title: work.title,
        type: work.type,
        phase: work.phase,
        route: work.route,
        awaiting: work.awaiting,
        baseCommit: work.baseCommit,
        phases: PHASES_BY_ROUTE[work.route],
        verdict: result.verdict,
        unproven: result.unproven,
        expected: [...new Set(result.expected.map((p) => p.gate))],
        criteria: work.criteria.map((c) => ({
          id: c.id,
          kind: c.kind,
          text: c.text,
          tdd: tddSummary(work, result.evidence, c.id, c.kind, env.policy)
        })),
        runs: result.evidence.runs.map((r) => ({
          gate: r.gate,
          target: r.target,
          ...r.stack ? { stack: r.stack } : {},
          status: r.status,
          durationMs: r.durationMs,
          ...r.reason ? { reason: r.reason } : {}
        })),
        skips: work.skips.map((s) => ({ step: s.step, reason: s.reason }))
      });
    }
    default:
      return refuse(`unknown command: ${command}
${HELP}`);
  }
}
function settings(command, args, user) {
  const config = loadConfig(user);
  if (command === "mode") {
    if (!args[0])
      return ok(config.mode, { mode: config.mode });
    try {
      saveConfig(user, setConfigValue(config, "mode", args[0]));
    } catch (error) {
      return refuse(error.message);
    }
    return ok(`mode: ${args[0]}`, { mode: args[0] });
  }
  const [key, value] = args;
  if (!key)
    return ok(JSON.stringify(config), { config });
  if (value === undefined) {
    const current = key === "mode" ? config.mode : key === "decisions.log" ? config.decisions.log : undefined;
    return current === undefined ? refuse(`unknown setting: ${key}`) : ok(String(current), { key, value: current });
  }
  try {
    saveConfig(user, setConfigValue(config, key, value));
  } catch (error) {
    return refuse(error.message);
  }
  return ok(`${key}: ${value}`, {
    key,
    value: key === "decisions.log" ? value === "true" : value
  });
}
var STACKS = ["node", "php", "python", "other"];
var HELP = `crew ${VERSION}
  detect [--refresh]                    build or refresh the project profile
  profile set <gate> "<cmd>" [--target p] [--stack s]  propose a gate command (unconfirmed)
  profile set <gate> "<cmd>" --force    replace a detected or confirmed command (asks the user)
  profile confirm [<gate>]              confirm proposed commands (asks the user)
  policy accept                         trust the current policy.json after a hand edit (asks the user)
  accept <id|profile|policy>            trust state changed outside the engine (asks the user)
  start "<request>" --answers <json>    create a work item from the typed answers
      [--criterion "<text>"] [--preserve "<text>"]   criteria, repeatable; preserve: existing tests stay green
  classify <id> --answers <json>        record typed answers and compute the route
  criteria <id> add "<text>" [--kind preserve]
  criteria <id> remove <AC-n>           take out a criterion no test-first record or skip names
  approve <id> spec                     record the user's approval (asks the user)
      --mode auto|bypassPermissions|dontAsk   no person watching: recorded as the agent's decision
  phase <id> next                       advance when the guard holds
  await <id> user | resume <id>         mark or clear waiting for the user
  tdd <red|green|before|after> <id> <criterion> [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires
  skip <id> <step> --reason "<text>"    record a skip (asks the user; --mode as for approve)
  evidence <id>                         write and print the report
  status | mode [m] | config <key> [v]  state and settings
  --json on any command prints the machine form`;
async function main(argv, io) {
  const parsed = parse(argv);
  let outcome;
  try {
    const first = argv[0] ?? "";
    const leadingFlag = first.startsWith("--") && first !== "--version" || (first === "profile" || first === "policy") && (argv[1] ?? "").startsWith("--");
    outcome = leadingFlag ? refuse("the command comes first: crew <command> [arguments] [--flags]") : await dispatch(parsed, io);
  } catch (error) {
    if (parsed.positional[0] === "hook") {
      io.stdout(`{}
`);
      return 0;
    }
    io.stderr(`crew: ${error.message}
`);
    return 2;
  }
  if (parsed.positional[0] === "hook") {
    io.stdout(`${outcome.text}
`);
    return 0;
  }
  if (parsed.flags.json)
    io.stdout(`${JSON.stringify({ ok: outcome.code === 0, message: outcome.text, ...outcome.data })}
`);
  else if (outcome.code === 0 || outcome.stdout)
    io.stdout(`${outcome.text}
`);
  else
    io.stderr(`${outcome.text}
`);
  return outcome.code;
}

// packages/engine/src/crew.ts
async function readStdin() {
  if (process.stdin.isTTY)
    return "";
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
process.exitCode = await main(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  stdin: readStdin,
  env: process.env,
  cwd: process.cwd()
});
