// packages/engine/src/cli.ts
import { existsSync as existsSync4 } from "node:fs";
import { join as join23, relative as relative6, resolve as resolve3 } from "node:path";

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
var JUDGEMENT_GATES = [
  "code-quality",
  "test-quality",
  "security",
  "ui-ux",
  "risk"
];
function isJudgementGateName(value) {
  return JUDGEMENT_GATES.includes(value);
}
var ROUTE_ORDER = ["fast", "standard", "full"];
var MAIL_TYPES = ["question", "change-request", "notice", "blocker"];
function isMailType(value) {
  return MAIL_TYPES.includes(value);
}
function partyLabel(party) {
  const agent = party.agent ?? "session";
  return agent === "session" ? party.project : `${party.project}/${agent}`;
}
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
var VALIDATOR_RULES = ["complete-gap-round", "stated-default"];
function isValidatorRule(value) {
  return VALIDATOR_RULES.includes(value);
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
import { readdirSync as readdirSync2, statSync as statSync2 } from "node:fs";
import { join as join7, relative } from "node:path";

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
import { join as join4 } from "node:path";

// packages/engine/src/detect/scripts.ts
import { readdirSync, statSync } from "node:fs";
import { join as join3 } from "node:path";
var NEVER_A_GATE = /^test:(watch|ui|dev|debug|e2e|browser|visual)(?:[:-]|$)/;
function testScripts(scripts) {
  const names = Object.keys(scripts).filter((n) => n.startsWith("test:"));
  const lint = names.find((n) => n === "test:lint");
  const types = names.find((n) => n === "test:types" || n === "test:typecheck");
  const rest = names.filter((n) => n !== lint && n !== types && !NEVER_A_GATE.test(n));
  return { ...lint ? { lint } : {}, ...types ? { types } : {}, rest };
}
var TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;
function hasTestFiles(dir, depth = 0) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return false;
  }
  for (const name of names) {
    if (name.startsWith(".") || SKIP_DIRS.has(name))
      continue;
    const path = join3(dir, name);
    let isDir = false;
    try {
      isDir = statSync(path).isDirectory();
    } catch {
      continue;
    }
    if (!isDir && TEST_FILE.test(name))
      return true;
    if (isDir && depth < 2 && hasTestFiles(path, depth + 1))
      return true;
  }
  return false;
}

// packages/engine/src/detect/node.ts
function workspaceGlobs(pkg) {
  const raw = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
  return (raw ?? []).filter((glob) => typeof glob === "string").map((glob) => glob.replace(/^\.\//, "").replace(/\/$/, ""));
}
var SCRIPT_CANDIDATES = {
  build: ["build"],
  test: ["test", "unit"],
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
  const present = LOCKFILES.filter(([, files]) => files.some((f) => exists(join4(dir, f)))).map(([manager]) => manager);
  return { manager: present[0] ?? "npm", sure: present.length <= 1 };
}
var nodeDetector = {
  stack: "node",
  detect(dir) {
    const pkg = readJson(join4(dir, "package.json"));
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
    const convention = testScripts(scripts);
    if (convention.lint)
      gates.lint = `${manager} run ${convention.lint}`;
    if (convention.types)
      gates.typecheck = `${manager} run ${convention.types}`;
    if (!gates.test) {
      if (convention.rest.length)
        gates.test = convention.rest.map((n) => `${manager} run ${n}`).join(" && ");
      else if (manager === "bun" && (exists(join4(dir, "bunfig.toml")) || hasTestFiles(dir)))
        gates.test = "bun test";
    }
    if (!gates.typecheck && exists(join4(dir, "tsconfig.json"))) {
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
import { join as join5 } from "node:path";
var phpDetector = {
  stack: "php",
  detect(dir) {
    const composer = readJson(join5(dir, "composer.json"));
    if (!composer)
      return null;
    const scripts = composer.scripts ?? {};
    const installed = (tool) => exists(join5(dir, "vendor", "bin", tool));
    const run = (name) => `composer run ${name}`;
    const convention = testScripts(scripts);
    const gates = {};
    const runner = installed("pest") ? "vendor/bin/pest" : installed("phpunit") ? "vendor/bin/phpunit" : undefined;
    if ("test" in scripts)
      gates.test = run("test");
    else {
      const parts = [...convention.rest.map(run), ...runner ? [runner] : []];
      if (parts.length)
        gates.test = parts.join(" && ");
    }
    if (convention.lint)
      gates.lint = run(convention.lint);
    else if ("lint" in scripts)
      gates.lint = run("lint");
    else if (installed("pint"))
      gates.lint = "vendor/bin/pint --test";
    if (convention.types)
      gates.typecheck = run(convention.types);
    else if ("analyse" in scripts)
      gates.typecheck = run("analyse");
    else if ("analyze" in scripts)
      gates.typecheck = run("analyze");
    else if (installed("phpstan"))
      gates.typecheck = "vendor/bin/phpstan analyse --no-progress";
    return { stack: "php", packageManager: "composer", gates };
  }
};

// packages/engine/src/detect/python.ts
import { join as join6 } from "node:path";
var PREFIX = {
  uv: "uv run ",
  poetry: "poetry run ",
  pip: "python -m "
};
var pythonDetector = {
  stack: "python",
  detect(dir) {
    const pyproject = readText(join6(dir, "pyproject.toml"));
    if (pyproject === null && !exists(join6(dir, "requirements.txt")))
      return null;
    const manager = exists(join6(dir, "uv.lock")) ? "uv" : exists(join6(dir, "poetry.lock")) ? "poetry" : "pip";
    const prefix = PREFIX[manager] ?? "";
    const text = pyproject ?? "";
    const gates = {};
    const hasPytest = /\[tool\.pytest/.test(text) || exists(join6(dir, "pytest.ini")) || exists(join6(dir, "conftest.py")) || exists(join6(dir, "tests"));
    if (hasPytest)
      gates.test = `${prefix}pytest`;
    if (/\[tool\.ruff/.test(text) || exists(join6(dir, "ruff.toml"))) {
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
    names = readdirSync2(root).sort();
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith(".") || SKIP_DIRS.has(name))
      continue;
    const path = join7(root, name);
    try {
      if (!statSync2(path).isDirectory())
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
    for (const old of previous.targets) {
      const found = targets.some((t) => t.path === old.path && t.stack === old.stack);
      const theirs = Object.values(old.gates).some((g) => g.source !== "detected");
      if (!found && theirs)
        targets.push({ ...old, gates: { ...old.gates } });
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
function profileChanges(previous, next) {
  const lines = [];
  const same = (a, b) => a.path === b.path && a.stack === b.stack;
  for (const target of next.targets) {
    const old = previous.targets.find((t) => same(t, target));
    if (!old) {
      const gates = Object.entries(target.gates).map(([g, c]) => `${g}=${c.command}`).join(", ");
      lines.push(`target (${target.path}, ${target.stack}): ${gates || "no gates"}`);
      continue;
    }
    if (old.packageManager !== target.packageManager)
      lines.push(`packageManager (${target.path}): ${target.packageManager}`);
    for (const [gate, command] of Object.entries(target.gates)) {
      const before = old.gates[gate];
      if (before?.command !== command.command || before.source !== command.source)
        lines.push(`${gate} (${target.path}): ${command.command}`);
    }
    for (const gate of Object.keys(old.gates))
      if (!target.gates[gate])
        lines.push(`${gate} (${target.path}): removed`);
  }
  for (const old of previous.targets)
    if (!next.targets.some((t) => same(t, old)))
      lines.push(`target (${old.path}, ${old.stack}): removed`);
  return lines;
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
import { join as join14 } from "node:path";

// packages/engine/src/fingerprint.ts
import { execFileSync } from "node:child_process";
import { readdirSync as readdirSync3, readFileSync as readFileSync2 } from "node:fs";
import { join as join8 } from "node:path";
var MAX_WATCHED_FILES = 20000;
var UNAVAILABLE = "unavailable";
var WALK_PREFIX = "walk:";
function isGitRepo(root) {
  return exists(join8(root, ".git"));
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
function gitShowFile(root, commit, rel) {
  return gitTry(root, ["show", `${commit}:${rel}`]);
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
function additionPatch(root, path) {
  let buffer;
  try {
    buffer = readFileSync2(join8(root, path));
  } catch {
    return "";
  }
  const header = `diff --git a/${path} b/${path}
new file mode 100644
--- /dev/null
+++ b/${path}
`;
  if (buffer.subarray(0, 8000).includes(0))
    return `${header}Binary files /dev/null and b/${path} differ
`;
  const text = buffer.toString("utf8");
  if (text === "")
    return header;
  const lines = text.split(`
`);
  const newlineAtEnd = lines.at(-1) === "";
  if (newlineAtEnd)
    lines.pop();
  const body = lines.map((line) => `+${line}`).join(`
`);
  return `${header}@@ -0,0 +1,${lines.length} @@
${body}
${newlineAtEnd ? "" : `\\ No newline at end of file
`}`;
}
function reviewPatch(root, base, paths) {
  const said = (note, body = "") => ({ patch: `# ${note}
${body}`, note });
  if (paths.length === 0)
    return said("no changed files");
  if (!isGitRepo(root))
    return said("outside git, no diff can be cut");
  const untracked = new Set(untrackedPaths(root) ?? []);
  const tracked = paths.filter((p) => !untracked.has(p));
  const additions = paths.filter((p) => untracked.has(p)).map((p) => additionPatch(root, p)).join("");
  if (tracked.length === 0)
    return { patch: additions, note: null };
  const files = `${tracked.length} tracked file${tracked.length === 1 ? "" : "s"}`;
  if (base === null)
    return said(`no base commit: ${files} not shown, untracked ones as additions`, additions);
  const diff = gitTry(root, [
    "--literal-pathspecs",
    "diff",
    "--no-renames",
    "--no-color",
    base,
    "--",
    ...tracked
  ]);
  if (diff === null)
    return said(`git could not produce the diff of ${files} since ${base}`, additions);
  if (diff === "" && additions === "")
    return said("the change has no diff content");
  return { patch: diff + additions, note: null };
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
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || SKIP_DIRS.has(entry.name))
        continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!walk(join8(dir, entry.name), path))
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
    hashes[path] = hashFile(join8(root, path));
  return hashes;
}
function ownChanges(root, paths, base) {
  const files = base?.baseFiles;
  if (!files)
    return paths;
  const own = new Set(paths.filter((path) => files[path] === undefined || hashFile(join8(root, path)) !== files[path]));
  for (const [path, hash] of Object.entries(files)) {
    if (!paths.includes(path) && hashFile(join8(root, path)) !== hash)
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
        parts2.push(`${path}:${hashFile(join8(root, path))}`);
      }
      return `sha256:${sha256(parts2.join(`
`))}`;
    }
  }
  const files = allWatchedFiles(root, profile, maxFiles);
  if (files === null)
    return UNAVAILABLE;
  const parts = files.map((path) => `${path}:${hashFile(join8(root, path))}`);
  return `${WALK_PREFIX}${sha256(parts.join(`
`))}`;
}

// packages/engine/src/objections.ts
import { join as join11 } from "node:path";

// packages/engine/src/criteria.ts
function tddDone(record, kind) {
  if (!record)
    return false;
  if (kind === "behavior")
    return !!record.red && !!record.green;
  if (kind === "preserve")
    return !!record.before && !!record.after;
  return !!record.observed;
}

// packages/engine/src/paths.ts
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname as dirname2, join as join9, relative as relative2, resolve, sep } from "node:path";
function canonical(path) {
  const abs = resolve(path);
  const tail = [];
  let dir = abs;
  for (;; ) {
    try {
      return join9(realpathSync(dir), ...tail);
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
    if (exists(join9(dir, ".git")))
      return dir;
    const parent = dirname2(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return exists(join9(start, ".crew")) ? start : null;
}
function userDirOf(env = process.env) {
  return join9(env.WIZARDINGCODE_HOME ?? join9(homedir(), ".wizardingcode"), "crew");
}
function resolvePaths(cwd, env = process.env) {
  const root = findRoot(cwd);
  if (root === null)
    return null;
  const userDir = canonical(userDirOf(env));
  const repoId = sha256(root).slice(0, 16);
  return {
    root,
    crewDir: join9(root, ".crew"),
    localDir: join9(root, ".crew", "local"),
    userDir,
    integrityFile: join9(userDir, "integrity", `${repoId}.json`),
    repoId
  };
}
function workDir(paths, id) {
  return join9(paths.crewDir, "work", id);
}
function registryPath(userDir) {
  return join9(userDir, "projects.json");
}
function mailboxDir(userDir, workspace, project) {
  return join9(userDir, "mail", workspace ?? "_alone", project);
}
var PROTECTED_TOP = new Set([".crew/profile.json", ".crew/policy.json", ".crew/.gitignore"]);
var PROTECTED_WORK_FILES = [
  "work.json",
  "evidence.json",
  "report.md",
  "objections.json",
  "mail.json"
];
var PROTECTED_IN_WORK = new Set(PROTECTED_WORK_FILES);
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
import { join as join10 } from "node:path";

// packages/engine/src/store.ts
import { basename as basename2, relative as relative3 } from "node:path";
var HAND_WRITTEN = ".crew/policy.json";
function rel(paths, absPath) {
  return relative3(paths.root, absPath).replace(/\\/g, "/");
}
function readIntegrityFile(file) {
  const text = readText(file);
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
  return readIntegrityFile(paths.integrityFile).map;
}
function rememberIn(file, key, text) {
  const integrity = readIntegrityFile(file).map;
  integrity[key] = sha256(text);
  writeJson(file, integrity);
}
function remember(paths, absPath, text) {
  rememberIn(paths.integrityFile, rel(paths, absPath), text);
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
function readProtected(integrityFile, key, absPath, handWritten) {
  const text = readText(absPath);
  if (text === null)
    return { data: null, tampered: false };
  const { map, corrupt } = readIntegrityFile(integrityFile);
  const expected = map[key];
  const tampered = corrupt ? true : expected === undefined ? !handWritten && Object.keys(map).length > 0 : expected !== sha256(text);
  try {
    return { data: JSON.parse(text), tampered };
  } catch {
    return { data: null, tampered: true };
  }
}
function readProtectedJson(paths, absPath) {
  const key = rel(paths, absPath);
  return readProtected(paths.integrityFile, key, absPath, key === HAND_WRITTEN);
}
function writeProtectedJsonAt(integrityFile, absPath, data) {
  const text = `${JSON.stringify(data, null, 2)}
`;
  writeText(absPath, text);
  rememberIn(integrityFile, basename2(absPath), text);
}
function readProtectedJsonAt(integrityFile, absPath) {
  return readProtected(integrityFile, basename2(absPath), absPath, false);
}

// packages/engine/src/policy.ts
var MAIL_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var WORKTREES = /^(\.\.|[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*)$/;
var DEFAULT_MAIL_POLICY = {
  workspace: null,
  name: null,
  accept: ["question", "notice"],
  open: "read-only",
  maxConcurrent: 2,
  maxHops: 2,
  maxTurns: 40,
  maxMinutes: 30,
  worktrees: ".."
};
var DEFAULT_POLICY = {
  requiredGates: [],
  judgementGates: [],
  riskPaths: {},
  riskPathExclusions: [],
  minimumRoute: "fast",
  allowSkips: ["tdd"],
  artifacts: "commit",
  unattendedDecisions: "wait",
  attendedDecisions: "relay",
  mail: DEFAULT_MAIL_POLICY
};
var NAME_HINT = "a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters";
var RANGES = {
  maxConcurrent: { min: 1, max: 10 },
  maxHops: { min: 1, max: 10 },
  maxTurns: { min: 1, max: 500 },
  maxMinutes: { min: 1, max: 600 }
};
var SETTABLE_POLICY_KEYS = {
  attendedDecisions: { values: ["prompt", "relay"] },
  unattendedDecisions: { values: ["wait", "count", "validator"] },
  "mail.workspace": { pattern: MAIL_NAME, hint: NAME_HINT },
  "mail.name": { pattern: MAIL_NAME, hint: NAME_HINT },
  "mail.open": { values: ["read-only", "branch"] },
  "mail.maxConcurrent": { integer: RANGES.maxConcurrent },
  "mail.maxHops": { integer: RANGES.maxHops },
  "mail.maxTurns": { integer: RANGES.maxTurns },
  "mail.maxMinutes": { integer: RANGES.maxMinutes },
  "mail.worktrees": {
    pattern: WORKTREES,
    hint: "a relative path with no spaces (.. for the folder beside the root)"
  }
};
function policyPath(paths) {
  return join10(paths.crewDir, "policy.json");
}
function checkSettable(key, rule, value) {
  if ("values" in rule)
    return rule.values.includes(value) ? value : { refused: `${key} is one of ${rule.values.join(", ")}, not ${value}` };
  if ("pattern" in rule)
    return rule.pattern.test(value) ? value : { refused: `${key} is ${rule.hint}, not ${value}` };
  const n = Number(value);
  const { min, max } = rule.integer;
  return /^\d+$/.test(value) && n >= min && n <= max ? n : { refused: `${key} is a whole number from ${min} to ${max}, not ${value}` };
}
function setPolicyValue(paths, key, value) {
  const rule = SETTABLE_POLICY_KEYS[key];
  if (!rule) {
    return {
      refused: `unknown policy key: ${key} (crew policy set writes ${Object.keys(SETTABLE_POLICY_KEYS).join(", ")})`
    };
  }
  const checked = checkSettable(key, rule, value);
  if (typeof checked === "object")
    return checked;
  const read = readProtectedJson(paths, policyPath(paths));
  if (read.tampered) {
    return {
      refused: "state changed outside the engine: .crew/policy.json; the user can accept it with crew policy accept"
    };
  }
  const raw = { ...read.data ?? {} };
  const dot = key.indexOf(".");
  if (dot === -1)
    raw[key] = checked;
  else {
    const block = raw[key.slice(0, dot)];
    raw[key.slice(0, dot)] = {
      ...typeof block === "object" && block !== null && !Array.isArray(block) ? block : {},
      [key.slice(dot + 1)]: checked
    };
  }
  writeProtectedJson(paths, policyPath(paths), raw);
  return { key, value };
}
function mailName(value) {
  return typeof value === "string" && MAIL_NAME.test(value) ? value : null;
}
function bounded(value, range, fallback) {
  return typeof value === "number" && Number.isInteger(value) && value >= range.min && value <= range.max ? value : fallback;
}
function loadMailPolicy(raw) {
  const m = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  return {
    workspace: mailName(m.workspace),
    name: mailName(m.name),
    accept: Array.isArray(m.accept) ? m.accept.filter(isMailType) : [...DEFAULT_MAIL_POLICY.accept],
    open: m.open === "branch" ? "branch" : "read-only",
    maxConcurrent: bounded(m.maxConcurrent, RANGES.maxConcurrent, DEFAULT_MAIL_POLICY.maxConcurrent),
    maxHops: bounded(m.maxHops, RANGES.maxHops, DEFAULT_MAIL_POLICY.maxHops),
    maxTurns: bounded(m.maxTurns, RANGES.maxTurns, DEFAULT_MAIL_POLICY.maxTurns),
    maxMinutes: bounded(m.maxMinutes, RANGES.maxMinutes, DEFAULT_MAIL_POLICY.maxMinutes),
    worktrees: typeof m.worktrees === "string" && WORKTREES.test(m.worktrees) ? m.worktrees : DEFAULT_MAIL_POLICY.worktrees
  };
}
function decisionCounts(policy, decision) {
  if (decision.by === "validator")
    return decision.mode === undefined || policy.unattendedDecisions === "validator";
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
  const read = readProtectedJson(paths, policyPath(paths));
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
      judgementGates: strings(raw.judgementGates).filter(isJudgementGateName),
      riskPaths,
      riskPathExclusions: strings(raw.riskPathExclusions),
      minimumRoute,
      allowSkips,
      artifacts: raw.artifacts === "local" ? "local" : "commit",
      unattendedDecisions: raw.unattendedDecisions === "count" || raw.unattendedDecisions === "validator" ? raw.unattendedDecisions : "wait",
      attendedDecisions: raw.attendedDecisions === "prompt" ? "prompt" : "relay",
      mail: loadMailPolicy(raw.mail)
    },
    tampered: read.tampered
  };
}
function skipAllowed(policy, step) {
  const bare = step.replace(/^(gate|tdd):/, "");
  return policy.allowSkips.some((s) => s === "*" || s === step || s === bare || s === "tdd" && step.startsWith("tdd:"));
}

// packages/engine/src/objections.ts
function ledgerPath(paths, id) {
  return join11(workDir(paths, id), "objections.json");
}
function emptyLedger() {
  return { objections: [] };
}
function loadLedger(paths, id) {
  const read = readProtectedJson(paths, ledgerPath(paths, id));
  return { ledger: read.data ?? emptyLedger(), tampered: read.tampered };
}
function saveLedger(paths, id, ledger) {
  writeProtectedJson(paths, ledgerPath(paths, id), ledger);
}
function addObjection(ledger, text, raisedBy, severity) {
  const taken = ledger.objections.map((o) => Number(o.id.slice("O-".length))).filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const objection = {
    id: `O-${next}`,
    raisedBy,
    severity,
    text: text.trim(),
    raisedAt: nowIso()
  };
  ledger.objections.push(objection);
  return objection;
}
function bindObjection(ledger, work, id, criterion) {
  const objection = ledger.objections.find((o) => o.id === id);
  if (!objection)
    return { refused: `unknown objection: ${id}` };
  if (objection.waived)
    return { refused: `${id} is waived; it stays waived` };
  if (!work.criteria.some((c) => c.id === criterion)) {
    return { refused: `unknown criterion: ${criterion}` };
  }
  objection.criterion = criterion;
  return objection;
}
function waiveObjection(ledger, id, reason, decision) {
  const objection = ledger.objections.find((o) => o.id === id);
  if (!objection)
    return { refused: `unknown objection: ${id}` };
  if (decision.by === "validator") {
    return {
      refused: "the validator never waives an objection; a person does, or it is bound to a criterion"
    };
  }
  objection.waived = {
    reason: reason.trim(),
    at: nowIso(),
    by: decision.by,
    ...decision.mode ? { mode: decision.mode } : {},
    ...decision.relayed ? { relayed: true } : {}
  };
  return objection;
}
function objectionStatus(objection, work, evidence, policy) {
  if (objection.waived && decisionCounts(policy, objection.waived))
    return "waived";
  if (objection.criterion) {
    const criterion = work.criteria.find((c) => c.id === objection.criterion);
    const record = evidence?.tdd.find((t) => t.criterion === objection.criterion);
    return criterion && tddDone(record, criterion.kind) ? "resolved" : "bound";
  }
  return "open";
}
function blockingObjections(ledger, work, evidence, policy, statuses) {
  return ledger.objections.filter((o) => o.severity === "blocking" && statuses.includes(objectionStatus(o, work, evidence, policy)));
}

// packages/engine/src/work.ts
import { existsSync as existsSync2, readdirSync as readdirSync4 } from "node:fs";
import { join as join13 } from "node:path";

// packages/engine/src/state.ts
import { join as join12 } from "node:path";
function statePath(paths) {
  return join12(paths.localDir, "state.json");
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
work/*/review/ui/
worktrees/
${policy.artifacts === "local" ? `work/
` : ""}`;
  const file = join12(paths.crewDir, ".gitignore");
  if (readText(file) !== wanted)
    writeProtectedText(paths, file, wanted);
}

// packages/engine/src/work.ts
var DELIBERATE = [
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
var PHASES_BY_ROUTE = {
  fast: ["receive", "recognize", "build", "gate", "deliver"],
  standard: [...DELIBERATE],
  full: [...DELIBERATE]
};
var CONCLAVE_SECTIONS = [
  "Assumed by good practice",
  "Decisions only the user can make",
  "Proposals",
  "Warnings"
];
function slug(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}
function workJson(paths, id) {
  return join13(workDir(paths, id), "work.json");
}
function newWorkId(paths, title) {
  const date = nowIso().slice(0, 10);
  let existing = 0;
  try {
    existing = readdirSync4(join13(paths.crewDir, "work")).filter((n) => n.startsWith(date)).length;
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
  writeText(join13(workDir(paths, work.id), "brief.md"), `# Brief

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
    ids = readdirSync4(join13(paths.crewDir, "work")).sort();
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
    const evidence = readProtectedJson(paths, join13(workDir(paths, id), "evidence.json"));
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
function removeCriterion(work, evidence, id, ledger) {
  const index = work.criteria.findIndex((c) => c.id === id);
  if (index === -1)
    return { refused: `unknown criterion: ${id}` };
  const bound = ledger?.objections.find((o) => o.criterion === id && !o.waived);
  if (bound)
    return { refused: `${id} is bound to objection ${bound.id}; it stays` };
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
function addDecision(work, question, dflt) {
  const taken = (work.decisions ?? []).map((d) => Number(d.id.slice("D-".length))).filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const decision = {
    id: `D-${next}`,
    question: question.trim(),
    ...dflt?.trim() ? { default: dflt.trim() } : {}
  };
  work.decisions = [...work.decisions ?? [], decision];
  return decision;
}
function answerDecision(work, id, answer, decision) {
  const found = (work.decisions ?? []).find((d) => d.id === id);
  if (!found)
    return { refused: `unknown decision: ${id}` };
  if (decision.by === "validator") {
    if (found.answer !== undefined) {
      const who = found.by === "validator" ? "the validator" : `the ${found.by ?? "user"}`;
      return {
        refused: `${id} is already answered by ${who}; the validator never overwrites an answer`
      };
    }
    if (found.default === undefined) {
      return { refused: `${id} has no stated default; a person answers it` };
    }
    if (answer !== undefined && answer.trim() !== found.default) {
      return {
        refused: `the validator may only take the stated default of ${id} (${found.default})`
      };
    }
  } else if (!answer?.trim()) {
    return { refused: `an answer is required: crew decide <id> ${id} "<answer>"` };
  }
  found.answer = (answer ?? found.default ?? "").trim();
  found.at = nowIso();
  found.by = decision.by;
  if (decision.mode)
    found.mode = decision.mode;
  else
    delete found.mode;
  if (decision.rule)
    found.rule = decision.rule;
  else
    delete found.rule;
  if (decision.relayed)
    found.relayed = true;
  else
    delete found.relayed;
  return found;
}
function unansweredDecisions(work, policy) {
  return (work.decisions ?? []).filter((d) => d.answer === undefined || !decisionCounts(policy, d));
}
function debateState(work) {
  if (!work.debate)
    return "none";
  return work.debate.closedAt ? "closed" : "open";
}
function openDebate(work, reason) {
  const current = work.debate;
  if (current) {
    return {
      refused: current.closedAt ? "the debate is closed; it opens once per item" : `the debate is already open (${current.openedAt}): ${current.reason}`
    };
  }
  if (!reason.trim())
    return { refused: "a debate opens for a reason: the decision with consequences" };
  work.debate = { openedAt: nowIso(), reason: reason.trim() };
  return work.debate;
}
function closeDebate(work, tokens) {
  const debate = work.debate;
  if (!debate)
    return { refused: 'no debate is open (crew debate <id> open --reason "<why>")' };
  if (debate.closedAt)
    return { refused: "the debate is already closed" };
  debate.closedAt = nowIso();
  if (tokens !== undefined)
    debate.tokens = tokens;
  return debate;
}
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
function sectionBodies(text, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = [];
  for (const match of text.matchAll(new RegExp(`^(#{1,6})\\s*${escaped}\\s*$`, "gim"))) {
    const level = (match[1] ?? "#").length;
    const rest = text.slice((match.index ?? 0) + match[0].length);
    const next = new RegExp(`^#{1,${level}}\\s`, "m").exec(rest);
    const body = next ? rest.slice(0, next.index) : rest;
    bodies.push(body.replace(/^#{1,6}\s.*$/gm, "").trim());
  }
  return bodies;
}
function hasSection(text, heading) {
  return sectionBodies(text, heading).some((body) => body.length > 0);
}
function hasAcceptanceSection(text) {
  return hasSection(text, "acceptance criteria");
}
function missingConclaveSections(text) {
  return CONCLAVE_SECTIONS.filter((name) => !hasSection(text, name));
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
      const uncounted = approvals.find((a) => a.by && a.by !== "user");
      missing.push(uncounted ? `the user's approval of the spec: recorded by the ${uncounted.by} in ${uncounted.mode} mode and not counted (a person runs crew approve <id> spec, or policy.json sets unattendedDecisions to "${uncounted.by === "validator" ? "validator" : "count"}")` : "the user's approval of the spec (crew approve <id> spec)");
    }
    if (!ctx.planExists)
      missing.push("plan.md in the work folder");
  }
  return missing;
}
function conclaveDocument(work, ctx) {
  if (work.route === "fast")
    return [];
  if (ctx.conclaveText === null) {
    return ["conclave.md in the work folder (the gap round: four sections)"];
  }
  return missingConclaveSections(ctx.conclaveText).map((name) => `a "${name}" section with content in conclave.md (write "none" when there is nothing)`);
}
function validatorPreconditions(rule, work, ctx) {
  if (rule !== "complete-gap-round")
    return [];
  const missing = conclaveDocument(work, ctx);
  for (const d of work.decisions ?? []) {
    const answered = d.answer !== undefined && decisionCounts(ctx.policy, d);
    if (!answered && d.default === undefined)
      missing.push(`a stated default or an answer for ${d.id}`);
  }
  if (ctx.ledger) {
    for (const o of blockingObjections(ctx.ledger, work, ctx.evidence, ctx.policy, ["open"]))
      missing.push(`blocking objection ${o.id} bound to a criterion or waived by a person`);
  }
  return missing;
}
function guardFor(work, next, ctx) {
  const missing = [];
  if (next === "plan") {
    missing.push(...conclaveDocument(work, ctx));
    for (const d of unansweredDecisions(work, ctx.policy))
      missing.push(`an answer to ${d.id} (crew decide <id> ${d.id} "<answer>")`);
    if (ctx.ledger) {
      for (const o of blockingObjections(ctx.ledger, work, ctx.evidence, ctx.policy, ["open"]))
        missing.push(`a criterion bound to blocking objection ${o.id}, or the user's waiver (crew objection <id> resolve ${o.id} --criterion AC-k | waive ${o.id} --reason "<why>")`);
    }
    if (debateState(work) === "open")
      missing.push(`the debate is open (${work.debate?.reason ?? ""}); close it with the judge's ruling (crew debate <id> close [--tokens n])`);
  } else if (next === "build") {
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
        const how = criterion.kind === "behavior" ? "red/green" : criterion.kind === "preserve" ? "before/after" : "observed --reason";
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
function waitingText(work) {
  if (work.awaiting === "user")
    return ", waiting for the user";
  if (work.awaiting === "role")
    return ", waiting for the roles";
  if (work.awaiting === "mail")
    return `, waiting for a reply to ${work.awaitingMessage ?? "a message"}`;
  return "";
}

// packages/engine/src/evidence.ts
function decidedBy(decision) {
  if (decision.by === "validator")
    return `by the validator (rule: ${decision.rule ?? "unnamed"})`;
  if (decision.by === "agent")
    return `by the agent in ${decision.mode} mode`;
  return decision.relayed ? "by the user, relayed by the agent" : "by the user";
}
function countedNote(policy, decision) {
  if (!decision.by || decision.by === "user")
    return "";
  if (decision.by === "validator" && decision.mode === undefined)
    return ": counted, a person was present";
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
  return join14(workDir(paths, id), "evidence.json");
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
  for (const { gate } of input.expectedJudgement ?? []) {
    if (isSkipped(work, `gate:${gate}`, policy))
      continue;
    const record = (evidence.judgement ?? []).find((j) => j.gate === gate);
    if (!record)
      unproven.push(`judgement gate ${gate} not run`);
    else if (record.fingerprint !== currentFingerprint && !stale)
      unproven.push(`judgement gate ${gate} not run on the current code`);
    else if (record.verdict === "not-proven") {
      const n = record.findings.length;
      unproven.push(`judgement gate ${gate} not proven (${n} finding${n === 1 ? "" : "s"})`);
    } else if (record.verdict === "not-run")
      unproven.push(`judgement gate ${gate} not run: ${record.reason ?? "no reason given"}`);
  }
  if (input.ledger) {
    for (const o of blockingObjections(input.ledger, work, evidence, policy, ["open", "bound"]))
      unproven.push(`blocking objection ${o.id} ${objectionStatus(o, work, evidence, policy)}: ${o.text}`);
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
  if (tddDone(record, kind)) {
    if (kind === "behavior")
      return "red then green";
    if (kind === "preserve")
      return "passing before and after";
    return `observed: passes after (${record?.reason ?? "no reason given"})`;
  }
  if (record?.red || record?.before)
    return kind === "behavior" ? "red only" : "before only";
  return "missing";
}
function auditStatus(status, a) {
  const known = a.known ? `, ${a.known} known before` : "";
  const base = a.baselined ? "" : ", base not audited";
  if (status === "fail")
    return `fail: ${a.fresh.length} new (${a.fresh.join(", ")})${known}${base}`;
  return a.known ? `pass: ${a.known} known before, none new` : status;
}
function problemStatus(status, p) {
  const untouched = `${p.untouched} untouched file${p.untouched === 1 ? "" : "s"}`;
  if (status === "fail")
    return `fail: problems in ${p.touched.join(", ")}${p.untouched ? ` (${untouched} also)` : ""}`;
  return `pass: ${untouched} with problems, none of the item's`;
}
function renderReport(work, evidence, policy, ledger, mail, selfName) {
  const lines = [];
  lines.push(`# Report: ${work.title}`, "");
  lines.push(`- Work: \`${work.id}\``);
  lines.push(`- Type: ${work.type}. Route: ${work.route} (${work.routeReasons.join("; ")})`);
  const byDecider = new Map;
  for (const o of ledger?.objections ?? []) {
    if (!o.waived || !decisionCounts(policy, o.waived))
      continue;
    const who = `${decidedBy(o.waived)}${o.waived.by === "user" ? "" : " (counted by policy)"}`;
    byDecider.set(who, (byDecider.get(who) ?? 0) + 1);
  }
  const waivedNote = byDecider.size ? `, with ${[...byDecider].map(([who, n]) => `${n} objection${n === 1 ? "" : "s"} waived ${who}`).join(" and ")}` : "";
  lines.push(`- Verdict: **${evidence.verdict === "proven" ? "Proven" : "Not proven"}**${waivedNote}`, "");
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
    const status = r.status === "skipped" || r.status === "unavailable" ? `${r.status}${r.reason ? `: ${r.reason}` : ""}` : r.advisories ? auditStatus(r.status, r.advisories) : r.problems ? problemStatus(r.status, r.problems) : r.status === "fail" && r.reason ? `fail: ${r.reason}` : r.status;
    const target = r.stack ? `${r.target} (${r.stack})` : r.target;
    lines.push(`| ${r.gate} | ${target} | ${status} | ${r.command ? `\`${r.command}\`` : ""} | ${r.durationMs} ms | ${r.log ?? ""} |`);
  }
  const judgement = evidence.judgement ?? [];
  if (judgement.length) {
    lines.push("", "## Judgement gates", "", "| Gate | Verdict | Reviewer | Findings | Tokens |", "| :- | :- | :- | -: | -: |");
    for (const j of judgement) {
      const word = j.verdict === "not-run" ? `not run: ${j.reason ?? "no reason given"}` : j.verdict === "not-proven" ? "not proven" : "proven";
      const verdict = j.fingerprint === evidence.fingerprint ? word : `${word} (earlier code)`;
      lines.push(`| ${j.gate} | ${verdict} | ${j.reviewer ?? ""} | ${j.findings.length} | ${j.tokens ?? ""} |`);
    }
    const findings = judgement.flatMap((j) => j.findings.map((f) => ({ gate: j.gate, ...f })));
    if (findings.length)
      lines.push("");
    for (const f of findings) {
      lines.push(`- ${f.gate}: ${f.file}${f.line ? `:${f.line}` : ""} ${f.text} (${f.severity}${f.outside ? ", outside the change" : ""})`);
    }
  }
  const decisions = work.decisions ?? [];
  if (decisions.length || work.debate) {
    lines.push("", "## Gap round", "");
    for (const d of decisions) {
      const answer = d.answer === undefined ? "no answer yet" : `${d.answer}, ${decidedBy(d)}${countedNote(policy, d)}`;
      lines.push(`- ${d.id}: ${d.question} → ${answer}`);
    }
    const debate = work.debate;
    lines.push(debate ? `- Debate: opened (${debate.reason}), ${debate.closedAt ? "closed" : "open"}${debate.tokens !== undefined ? `, ${debate.tokens} tokens` : ""}` : "- Debate: none");
  }
  if (mail?.tampered) {
    lines.push("", "## Mail", "", `mail.json changed outside the engine; the user accepts it with crew accept ${work.id}.`);
  } else if (mail?.box.messages.length) {
    lines.push("", "## Mail", "", "| Message | At | Direction | With | Type | Subject | Status |", "| :- | :- | :- | :- | :- | :- | :- |");
    for (const m of mail.box.messages) {
      const sent = m.from.item === work.id && m.from.project === selfName;
      const direction = sent ? "sent" : "received";
      const other = partyLabel(sent ? m.to : m.from);
      const cell = (text) => text.replace(/\|/g, "\\|");
      const status = cell(`${m.status}${m.reason ? `: ${m.reason}` : ""}${m.verdict ? ` (${m.verdict}${m.branch ? `, ${m.branch}` : ""})` : ""}${m.relayed ? ", relayed" : ""}`);
      lines.push(`| ${m.id} | ${m.at} | ${direction} | ${other} | ${m.type} | ${cell(m.subject)} | ${status} |`);
    }
  }
  if (evidence.roles?.length) {
    lines.push("", "## Roles", "", "| Role | At | Tokens | Answer |", "| :- | :- | -: | :- |");
    for (const r of evidence.roles)
      lines.push(`| ${r.agent} | ${r.at} | ${r.tokensFrom === "none" ? "not read" : r.tokens} | ${r.file ?? "not saved"} |`);
  }
  if (work.tasks?.length) {
    lines.push("", "## Tasks", "", "| Task | Criteria | Branch | Child | Verdict | Merged | Report |", "| :- | :- | :- | :- | :- | :- | :- |");
    for (const t of work.tasks)
      lines.push(`| ${t.task} | ${t.criteria.join(", ")} | ${t.branch} | ${t.child ?? ""} | ${t.verdict ?? "no reply yet"} | ${t.mergedAt ? `${t.mergeCommit?.slice(0, 7) ?? ""}${t.forced ? " (forced by the user)" : ""}` : "no"} | ${t.child ? `.crew/work/${t.child}/report.md` : ""} |`);
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
  if (ledger?.objections.length) {
    lines.push("", "## Objections", "");
    for (const o of ledger.objections) {
      const status = objectionStatus(o, work, evidence, policy);
      let how = "open";
      if (status === "waived" && o.waived) {
        how = `waived ${decidedBy(o.waived)}: ${o.waived.reason} (${o.waived.at})`;
      } else if (status === "resolved")
        how = `resolved by ${o.criterion}`;
      else if (status === "bound")
        how = `bound to ${o.criterion}, not yet proven`;
      else if (o.waived)
        how = `open (waiver ${decidedBy(o.waived)} not counted)`;
      lines.push(`- ${o.id} (${o.severity}, raised by ${o.raisedBy}) ${how}: ${o.text}`);
    }
  }
  lines.push("", `Fingerprint: ${evidence.fingerprint ?? "none"}`, "");
  return lines.join(`
`);
}

// packages/engine/src/gates.ts
import { accessSync, constants, mkdirSync as mkdirSync3, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename as basename3, delimiter, join as join18 } from "node:path";

// packages/engine/src/audit.ts
var NAMED_ID = /\b(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}|CVE-\d{4}-\d{4,}|PKSA-[0-9a-z]{4}(?:-[0-9a-z]{4}){1,2}|PYSEC-\d{4}-\d+)\b/i;
function named(value) {
  if (typeof value !== "string")
    return null;
  const id = NAMED_ID.exec(value)?.[1];
  if (!id)
    return null;
  const dash = id.indexOf("-");
  return `${id.slice(0, dash).toUpperCase()}${id.slice(dash).toLowerCase()}`;
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function advisoryId(o) {
  const byName = named(o.advisoryId) ?? named(o.github_advisory_id) ?? named(o.url) ?? named(o.id) ?? named(o.cve);
  if (byName)
    return byName;
  const numeric = typeof o.source === "number" ? o.source : typeof o.id === "number" ? o.id : null;
  return numeric === null ? null : `npm-${numeric}`;
}
function collect(value, into, skipKey) {
  if (Array.isArray(value)) {
    for (const item of value)
      collect(item, into);
    return;
  }
  if (!isObject(value))
    return;
  const id = advisoryId(value);
  if (id) {
    into.add(id);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === skipKey)
      continue;
    collect(child, into);
  }
}
function abandonedOf(root) {
  if (!isObject(root))
    return [];
  const list = root.abandoned;
  if (Array.isArray(list))
    return list.filter((v) => typeof v === "string");
  if (isObject(list))
    return Object.keys(list);
  return [];
}
function parseJson(text) {
  const whole = tryParse(text);
  if (whole !== undefined)
    return [whole];
  const start = text.search(/[{[]/);
  if (start >= 0) {
    const fromBrace = tryParse(text.slice(start));
    if (fromBrace !== undefined)
      return [fromBrace];
  }
  const lines = text.split(`
`).map((l) => l.trim()).filter((l) => l.startsWith("{")).map(tryParse).filter((v) => v !== undefined);
  return lines.length ? lines : null;
}
function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return;
  }
}
function parseAudit(tool, text) {
  const documents = parseJson(text);
  if (!documents)
    return { readable: false, advisories: [], abandoned: [] };
  const ids = new Set;
  const abandoned = [];
  for (const doc of documents) {
    collect(doc, ids, tool === "composer" ? "abandoned" : undefined);
    if (tool === "composer")
      abandoned.push(...abandonedOf(doc));
  }
  return { readable: true, advisories: [...ids], abandoned };
}

// packages/engine/src/judgement.ts
import { readdirSync as readdirSync5, unlinkSync } from "node:fs";
import { join as join15 } from "node:path";
var INTERFACE_EXTENSIONS = [
  ".vue",
  ".svelte",
  ".tsx",
  ".jsx",
  ".astro",
  ".blade.php",
  ".html",
  ".css",
  ".scss",
  ".less"
];
function isInterfacePath(rel2) {
  const lower = rel2.toLowerCase();
  if (/(?:^|\/)__tests__\//.test(lower))
    return false;
  const name = lower.slice(lower.lastIndexOf("/") + 1);
  if (/\.(?:test|spec|stories)\./.test(name))
    return false;
  if (/(?:^|\/)resources\/views\//.test(lower))
    return true;
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
function plannedJudgementGates(route, riskAreas, changed, policy) {
  const planned = [];
  const plan = (gate, reason) => {
    if (!planned.some((p) => p.gate === gate))
      planned.push({ gate, reason });
  };
  if (route !== "fast") {
    plan("code-quality", `${route} route`);
    plan("test-quality", `${route} route`);
  }
  if (route === "full")
    plan("security", "full route");
  else if (route === "standard" && riskAreas.length)
    plan("security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) {
    const shown = interfaces.slice(0, 3).join(", ");
    const more = interfaces.length > 3 ? `, +${interfaces.length - 3} more` : "";
    plan("ui-ux", `interface files: ${shown}${more}`);
  }
  if (route === "full")
    plan("risk", "full route");
  for (const gate of policy.judgementGates)
    plan(gate, "policy");
  return planned;
}
function reviewDir(paths, id) {
  return join15(workDir(paths, id), "review");
}
function readReviewInputs(paths, id) {
  const raw = readJson(join15(reviewDir(paths, id), "inputs.json"));
  return raw && typeof raw.fingerprint === "string" && typeof raw.at === "string" ? { fingerprint: raw.fingerprint, at: raw.at } : null;
}
function writeReviewInputs(paths, work, changed, fingerprint) {
  const dir = reviewDir(paths, work.id);
  const previous = readReviewInputs(paths, work.id);
  if (previous && previous.fingerprint !== fingerprint) {
    let names = [];
    try {
      names = readdirSync5(dir);
    } catch {
      names = [];
    }
    for (const name of names) {
      if (name === "ruling.json" || name.endsWith(".findings.md"))
        unlinkSync(join15(dir, name));
    }
  }
  const cut = reviewPatch(paths.root, work.baseCommit, changed);
  writeText(join15(dir, "diff.patch"), cut.patch);
  writeText(join15(dir, "files.txt"), changed.length ? `${changed.join(`
`)}
` : "");
  writeText(join15(dir, "inputs.json"), `${JSON.stringify({ fingerprint, at: nowIso() }, null, 2)}
`);
  return { dir, note: cut.note };
}
function judgementRows(work, evidence, planned, currentFingerprint, policy) {
  return planned.map((p) => {
    const record = (evidence.judgement ?? []).find((j) => j.gate === p.gate);
    const findings = record?.findings.length ?? 0;
    if (isSkipped(work, `gate:${p.gate}`, policy)) {
      const skip = work.skips.find((s) => s.step === `gate:${p.gate}`);
      return {
        gate: p.gate,
        status: "skipped",
        planned: p.reason,
        findings,
        ...skip?.reason ? { reason: skip.reason } : {}
      };
    }
    if (!record)
      return { gate: p.gate, status: "planned", planned: p.reason, findings: 0 };
    if (record.fingerprint !== currentFingerprint)
      return {
        gate: p.gate,
        status: "stale",
        planned: p.reason,
        findings,
        reason: "ruling on earlier code"
      };
    return {
      gate: p.gate,
      status: record.verdict,
      planned: p.reason,
      findings,
      ...record.reason ? { reason: record.reason } : {}
    };
  });
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function plannedNote(planned) {
  return planned.length ? ` (planned: ${planned.join(", ")})` : " (none is planned)";
}
function parseRulings(raw, planned) {
  if (!isRecord(raw) || !Array.isArray(raw.rulings))
    return { refused: 'the ruling file is a JSON object with a "rulings" list' };
  if (raw.rulings.length === 0)
    return { refused: "the ruling file has no rulings" };
  const rulings = [];
  for (const [index, entry] of raw.rulings.entries()) {
    const where = `ruling ${index + 1}`;
    if (!isRecord(entry))
      return { refused: `${where}: not an object` };
    const gate = entry.gate;
    if (!isJudgementGateName(gate))
      return {
        refused: `${where}: unknown judgement gate: ${String(gate)} (${JUDGEMENT_GATES.join(", ")})`
      };
    if (!planned.includes(gate))
      return { refused: `${where}: ${gate} is not planned for this item${plannedNote(planned)}` };
    const verdict = entry.verdict;
    if (verdict !== "proven" && verdict !== "not-proven")
      return {
        refused: `${where} (${gate}): verdict is proven or not-proven, not ${String(verdict)}; a gate that could not run is recorded with crew judgement <id> record ${gate} --not-run --reason "<why>"`
      };
    const rawFindings = entry.findings ?? [];
    if (!Array.isArray(rawFindings))
      return { refused: `${where} (${gate}): findings is a list` };
    const findings = [];
    for (const [n, f] of rawFindings.entries()) {
      const at = `finding ${n + 1} of ${gate}`;
      if (!isRecord(f))
        return { refused: `${at}: not an object` };
      if (typeof f.file !== "string" || !f.file.trim())
        return { refused: `${at}: needs a file` };
      if (typeof f.text !== "string" || !f.text.trim())
        return { refused: `${at}: needs a text` };
      if (f.severity !== "defect" && f.severity !== "advisory")
        return { refused: `${at}: severity is defect or advisory` };
      const line = f.line;
      if (line !== undefined && !(typeof line === "number" && Number.isInteger(line) && line > 0))
        return { refused: `${at}: line is a positive integer` };
      findings.push({
        file: f.file.trim().replace(/^\.\//, ""),
        ...typeof line === "number" ? { line } : {},
        text: f.text.trim(),
        severity: f.severity
      });
    }
    if (verdict === "not-proven" && !findings.some((f) => f.severity === "defect"))
      return {
        refused: `${where} (${gate}): not proven with no defect finding; the judge rules not proven on defects, or rules proven`
      };
    const tokens = entry.tokens;
    if (tokens !== undefined && !(typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0))
      return { refused: `${where} (${gate}): tokens is a number` };
    if (rulings.some((r) => r.gate === gate))
      return { refused: `two rulings for ${gate} in one file` };
    rulings.push({
      gate,
      verdict,
      ...typeof entry.reviewer === "string" ? { reviewer: entry.reviewer } : {},
      ...typeof entry.judge === "string" ? { judge: entry.judge } : {},
      findings,
      ...typeof tokens === "number" ? { tokens } : {}
    });
  }
  return { rulings };
}
function stampRuling(ruling, fingerprint, changed, workId) {
  const own = `.crew/work/${workId}/`;
  return {
    gate: ruling.gate,
    verdict: ruling.verdict,
    ...ruling.reviewer ? { reviewer: ruling.reviewer } : {},
    ...ruling.judge ? { judge: ruling.judge } : {},
    findings: ruling.findings.map((f) => changed.includes(f.file) || f.file.startsWith(own) ? { ...f } : { ...f, outside: true }),
    ...ruling.tokens !== undefined ? { tokens: ruling.tokens } : {},
    at: nowIso(),
    fingerprint
  };
}
function contradiction(record) {
  if (record.verdict !== "proven")
    return null;
  const defect = record.findings.find((f) => f.severity === "defect" && !f.outside);
  if (!defect)
    return null;
  const where = defect.line ? `${defect.file}:${defect.line}` : defect.file;
  return `${record.gate}: proven with a defect on ${where}; the judge rules not proven on a defect inside the change, or lowers it to advisory`;
}
function notRunRecord(gate, reason, fingerprint) {
  return {
    gate,
    verdict: "not-run",
    reason: reason.trim(),
    findings: [],
    at: nowIso(),
    fingerprint
  };
}
function recordJudgement(evidence, record) {
  evidence.judgement = [
    ...(evidence.judgement ?? []).filter((j) => j.gate !== record.gate),
    record
  ];
}

// packages/engine/src/problems.ts
import { statSync as statSync3 } from "node:fs";
import { isAbsolute, join as join16, relative as relative4 } from "node:path";
var SOURCE_FILE = /^(?:\.{0,2}\/)?[\w@./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro|php|py|rb|go|rs|kt|java|cs|json|css|scss|html)$/;
function isFile(path) {
  try {
    return statSync3(path).isFile();
  } catch {
    return false;
  }
}
function namedFiles(text, dirs, root) {
  const found = [];
  const seen = new Set;
  for (const raw of text.split(/\s+/)) {
    const token = (raw.replace(/^[("'`[]+/, "").split(/[:(]/)[0] ?? "").replace(/[,;)\]"'`]+$/, "");
    if (!SOURCE_FILE.test(token))
      continue;
    const candidates = isAbsolute(token) ? [token] : dirs.map((dir) => join16(dir, token));
    for (const abs of candidates) {
      if (!isFile(abs))
        continue;
      const rel2 = relative4(root, abs).replace(/\\/g, "/");
      if (!rel2.startsWith("..") && !seen.has(rel2)) {
        seen.add(rel2);
        found.push(rel2);
      }
      break;
    }
  }
  return found;
}

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
import { join as join17 } from "node:path";
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
    buffer = readFileSync3(join17(root, path));
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
  return changed.some((p) => MANIFESTS.has(basename3(p)) || /^requirements.*\.txt$/.test(basename3(p)));
}
function onPath(binary, env) {
  const extensions = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir)
      continue;
    for (const extension of extensions) {
      try {
        accessSync(join18(dir, binary + extension), constants.X_OK);
        return true;
      } catch {}
    }
  }
  return false;
}
var NODE_AUDIT = {
  npm: {
    binary: "npm",
    command: "npm audit --audit-level=high --json",
    lockfiles: ["package-lock.json", "npm-shrinkwrap.json"],
    tool: "npm",
    manifest: "package.json"
  },
  pnpm: {
    binary: "pnpm",
    command: "pnpm audit --audit-level=high --json",
    lockfiles: ["pnpm-lock.yaml"],
    tool: "pnpm",
    manifest: "package.json"
  },
  yarn: {
    binary: "yarn",
    command: "yarn audit --level high --json",
    lockfiles: ["yarn.lock"],
    tool: "yarn",
    manifest: "package.json"
  },
  bun: {
    binary: "bun",
    command: "bun audit --json",
    lockfiles: ["bun.lock", "bun.lockb"],
    tool: "bun",
    manifest: "package.json"
  }
};
var PYTHON_AUDIT = {
  uv: "uv run pip-audit",
  poetry: "poetry run pip-audit",
  pip: "python -m pip_audit"
};
var TEST_TIMEOUT_MS = 20 * 60 * 1000;
function gateTimeoutMs(target, gate) {
  const own = target.gates[gate]?.timeoutMs;
  if (own !== undefined)
    return own;
  return gate === "test" ? Math.max(target.timeoutMs, TEST_TIMEOUT_MS) : target.timeoutMs;
}
function depsAuditCommand(target, root, env = process.env) {
  const dir = join18(root, target.path);
  if (target.stack === "python") {
    if (!onPath("pip-audit", env))
      return { reason: "pip-audit not on PATH" };
    const prefix = PYTHON_AUDIT[target.packageManager] ?? PYTHON_AUDIT.pip ?? "pip-audit";
    return { command: `${prefix} --format=json`, tool: "pip-audit", files: [] };
  }
  let tool;
  if (target.stack === "node") {
    tool = NODE_AUDIT[target.packageManager];
    if (tool && target.packageManager === "yarn" && exists(join18(dir, ".yarnrc.yml")))
      tool = { ...tool, command: "yarn npm audit --severity high --json" };
  } else if (target.stack === "php") {
    tool = {
      binary: "composer",
      command: "composer audit --format=json --abandoned=report",
      lockfiles: ["composer.lock"],
      tool: "composer",
      manifest: "composer.json"
    };
  }
  if (!tool)
    return { reason: `no audit tool for ${target.packageManager}` };
  const present = tool.lockfiles.filter((name) => exists(join18(dir, name)));
  if (present.length === 0)
    return { reason: "no lockfile" };
  if (!onPath(tool.binary, env))
    return { reason: `${tool.binary} not on PATH` };
  return { command: tool.command, tool: tool.tool, files: [tool.manifest, ...present] };
}
async function baselineAdvisories(paths, work, target, audit, where) {
  if (!work.baseCommit || audit.files.length === 0)
    return { readable: false, advisories: [] };
  const scratch = join18(paths.crewDir, "local", "audit-base", work.id, where || "root");
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync3(scratch, { recursive: true });
  let lockfiles = 0;
  for (const [index, file] of audit.files.entries()) {
    const rel2 = target.path === "." ? file : `${target.path}/${file}`;
    const text = gitShowFile(paths.root, work.baseCommit, rel2);
    if (text === null)
      continue;
    writeFileSync2(join18(scratch, file), text);
    if (index > 0)
      lockfiles += 1;
  }
  if (lockfiles === 0)
    return { readable: true, advisories: [] };
  const log = join18(workDir(paths, work.id), "logs", `deps-base-${where}-${Date.now()}.txt`);
  const result = await runCommand(audit.command, {
    cwd: scratch,
    timeoutMs: gateTimeoutMs(target, "deps"),
    logPath: log
  });
  const report = parseAudit(audit.tool, readText(log) ?? result.tail);
  return { readable: report.readable && !result.timedOut, advisories: report.advisories };
}
async function judgeAudit(run, audit, paths, work, target, where) {
  const text = run.log && readText(join18(workDir(paths, work.id), run.log)) || run.tail;
  const report = parseAudit(audit.tool, text);
  if (!report.readable)
    return { ...run, reason: "audit report unreadable; judged by exit code" };
  const started = Date.now();
  const baseline = await baselineAdvisories(paths, work, target, audit, where);
  const known = baseline.readable ? report.advisories.filter((a) => baseline.advisories.includes(a)) : [];
  const fresh = baseline.readable ? report.advisories.filter((a) => !baseline.advisories.includes(a)) : report.advisories;
  const unbaselined = baseline.readable ? "" : "; the base commit could not be audited, so every advisory counts";
  const reason = fresh.length ? `${fresh.length} new: ${fresh.join(", ")}${known.length ? `; ${known.length} known before` : ""}${unbaselined}` : known.length ? `${known.length} known before this item, none introduced` : undefined;
  return {
    ...run,
    status: fresh.length ? "fail" : "pass",
    durationMs: run.durationMs + (Date.now() - started),
    ...reason ? { reason } : {},
    advisories: {
      current: report.advisories.length,
      known: known.length,
      fresh,
      baselined: baseline.readable
    }
  };
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
async function runOne(paths, work, profile, planned, fingerprint, changed) {
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
  let audit = null;
  if (gate === "deps") {
    const found = depsAuditCommand(target, paths.root);
    if ("reason" in found)
      return { ...base, reason: found.reason };
    audit = found;
    command = found.command;
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
    cwd: join18(paths.root, targetPath),
    timeoutMs: gateTimeoutMs(target, gate),
    logPath: join18(workDir(paths, work.id), log)
  });
  const passed = result.exit === 0 && !result.timedOut;
  const run = {
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
  if (result.timedOut)
    return run;
  if (audit)
    return judgeAudit(run, audit, paths, work, target, where);
  if ((gate === "lint" || gate === "typecheck") && run.status === "fail")
    return judgeProblems(run, paths, work, targetPath, changed);
  return run;
}
function judgeProblems(run, paths, work, targetPath, changed) {
  const text = run.log && readText(join18(workDir(paths, work.id), run.log)) || run.tail;
  const named2 = namedFiles(text, [join18(paths.root, targetPath), paths.root], paths.root);
  if (named2.length === 0)
    return run;
  const touched = named2.filter((file) => changed.includes(file));
  const untouched = named2.length - touched.length;
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (touched.length === 0) {
    return {
      ...run,
      status: "pass",
      reason: `${plural(named2.length, "file")} with problems, none changed by this item (pre-existing)`,
      problems: { touched, untouched }
    };
  }
  return {
    ...run,
    reason: `problems in files this item changed: ${touched.join(", ")}${untouched ? `; ${plural(untouched, "untouched file")} also` : ""}`,
    problems: { touched, untouched }
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
  const tampered = !!options.tampered || read.tampered || loadLedger(paths, work.id).tampered;
  const fingerprintBefore = computeFingerprint(paths.root, profile, base);
  let stamp = fingerprintBefore;
  const onlyGates = options.only?.filter((g) => GATE_NAMES.includes(g));
  for (const one of planned) {
    const { gate, target } = one;
    if (onlyGates !== undefined && !onlyGates.includes(gate))
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
        fingerprint: stamp
      });
      continue;
    }
    const run = await runOne(paths, work, profile, one, stamp, changed);
    if (gate === "build" && run.status === "pass") {
      const after = computeFingerprint(paths.root, profile, base, MAX_WATCHED_FILES, fingerprintMethod(fingerprintBefore));
      if (after !== stamp) {
        const now = changedWatchedPaths(paths.root, profile, base);
        run.wrote = now.filter((p) => !changed.includes(p));
        run.fingerprint = after;
        stamp = after;
      }
    }
    evidence.runs.push(run);
  }
  if (stamp !== fingerprintBefore) {
    for (const r of evidence.runs)
      if (r.fingerprint === fingerprintBefore)
        r.fingerprint = stamp;
  }
  evidence.fingerprint = stamp;
  const judgement = plannedJudgementGates(work.route, work.riskAreas, changed, policy);
  const reviewInputs = judgement.length ? writeReviewInputs(paths, work, changed, stamp) : null;
  const verdict = computeVerdict({
    work,
    evidence,
    expected: planned,
    expectedJudgement: judgement,
    policy,
    ledger: loadLedger(paths, work.id).ledger,
    currentFingerprint: computeFingerprint(paths.root, profile, base, MAX_WATCHED_FILES, fingerprintMethod(fingerprintBefore)),
    tampered
  });
  evidence.verdict = verdict.verdict;
  evidence.unproven = verdict.unproven;
  saveEvidence(paths, work.id, evidence);
  return {
    evidence,
    ...verdict,
    planned,
    changed,
    raised,
    tampered,
    judgement,
    review: reviewInputs?.dir ?? null,
    reviewNote: reviewInputs?.note ?? null
  };
}
function assess(paths, work, profile, policy, tampered = false) {
  const base = work;
  const changed = changedWatchedPaths(paths.root, profile, base);
  const expected = plannedGates(work.route, profile, policy, changed, paths.root);
  const judgement = plannedJudgementGates(work.route, work.riskAreas, changed, policy);
  const read = loadEvidence(paths, work.id);
  const currentFingerprint = computeFingerprint(paths.root, profile, base, MAX_WATCHED_FILES, fingerprintMethod(read.evidence.fingerprint));
  const led = loadLedger(paths, work.id);
  return reassess({
    evidence: read.evidence,
    expected,
    changed,
    judgement,
    currentFingerprint,
    ledger: led.ledger,
    tampered: tampered || read.tampered || led.tampered
  }, work, policy);
}
function reassess(a, work, policy) {
  const verdict = computeVerdict({
    work,
    evidence: a.evidence,
    expected: a.expected,
    expectedJudgement: a.judgement,
    ledger: a.ledger,
    currentFingerprint: a.currentFingerprint,
    tampered: a.tampered,
    policy
  });
  return { ...a, ...verdict };
}

// packages/engine/src/profile.ts
import { join as join19 } from "node:path";
function profilePath(paths) {
  return join19(paths.crewDir, "profile.json");
}
function loadProfile(paths) {
  const read = readProtectedJson(paths, profilePath(paths));
  return { profile: read.data, tampered: read.tampered };
}
function saveProfile(paths, profile) {
  writeProtectedJson(paths, profilePath(paths), profile);
}
function refreshProfile(paths, current, tampered = false) {
  if (tampered)
    return { profile: current, changed: [] };
  const next = detectProfile(paths.root, current);
  const changed = profileChanges(current, next);
  if (changed.length === 0)
    return { profile: current, changed };
  saveProfile(paths, next);
  return { profile: next, changed };
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
import { isAbsolute as isAbsolute2, join as join20, relative as relative5 } from "node:path";

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
var OPTS = String.raw`(?:--[\w-]+(?:[= ]\S+)?\s+)*`;
var USER_ONLY = new RegExp(String.raw`^[\s({]*(?:${RUNNER}\s+)*(?:\S*/)?crew(?:\.mjs)?\s+${OPTS}(?:skip|approve|accept|decide|objection\b[^;&|]*\bwaive\b|profile\s+${OPTS}(?:confirm|set)|policy\s+${OPTS}(?:accept|set))\b`);
var POLICY_COMMAND = new RegExp(String.raw`^[\s({]*(?:${RUNNER}\s+)*(?:\S*/)?crew(?:\.mjs)?\s+${OPTS}(?:policy\b|accept\s+${OPTS}policy\b)`);
var ENGINE_FILES = /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|objections\.json|mail\.json|report\.md|logs\b))|\.wizardingcode\/crew\b/;
var WRITE_SHAPE = /(?:^|[\s;&|("'])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\|?\s*["']?\S*(?:\.crew\/|\.wizardingcode\/crew\b)/;
var OPAQUE_REDIRECT = />{1,2}\|?\s*["']?[$`]/;
var PROMPTLESS_MODES = new Set(["bypassPermissions", "dontAsk"]);
var MODE_FLAG = /--mode(?:=|\s+)(\S+)/;
var VALIDATOR_FLAG = /--validator(?:=|\s+)\S+/;
var HELP_FLAG = /(?:^|\s)(?:--help|-h)(?=\s|$)/;
function userOnlyDecision(cleaned, permissionMode, headless, policy) {
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
  if (VALIDATOR_FLAG.test(cleaned))
    return null;
  if (policy.attendedDecisions === "relay" && !POLICY_COMMAND.test(cleaned))
    return null;
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
    const abs = canonical(isAbsolute2(filePath) ? filePath : join20(ctx.paths.root, filePath));
    if (isProtectedPath(ctx.paths, abs)) {
      return answer("deny", `Crew: ${filePath} is maintained by the engine and is changed through the crew command`);
    }
    const rel2 = relative5(ctx.paths.root, abs).replace(/\\/g, "/");
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
      if (USER_ONLY.test(cleaned) && !HELP_FLAG.test(cleaned)) {
        const decided = userOnlyDecision(cleaned, payload.permission_mode, ctx.headless, ctx.policy);
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
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${waitingText(work)}.`;
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
  const refreshed = refreshProfile(ctx.paths, ctx.profile, ctx.tampered);
  ctx.profile = refreshed.profile;
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
    "WizardingCode Developer Crew is active in this repository. Work is proven by the `crew` command and the crew skill, and a turn cannot end while watched source files have unproven changes.",
    ctx.policy.attendedDecisions === "relay" ? "You run every crew command; the user never types one: a decision that is theirs (crew approve, skip, decide, accept, profile confirm) is relayed by you from the conversation under this repository's policy (attendedDecisions: relay), so run the command once the user has said yes, with no prompt; the record says relayed by the agent." : "You run every crew command; the user never types one: a decision that is theirs (crew approve, skip, decide, accept, profile confirm) is signed by the permission prompt your command raises, in auto mode too."
  ];
  if (active?.work)
    lines.push(statusLine(ctx, active.work, active.tampered).replace(/^Crew: work/, "Work in progress:"));
  else
    lines.push(`No work item is active. A code change starts by answering the crew skill's nine typed questions, then crew start "<request>" --answers '<json>'.`);
  if (refreshed.changed.length)
    lines.push(`profile refreshed: ${refreshed.changed.join("; ")}.`);
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
var TYPED_CREW = /(?:^|[^\w!])!\s?(?:(?:node|bun)\s+)?(?:\S*\/)?crew(?:\.mjs)?\s+[a-z]/m;
function asksUserToTypeCrew(message) {
  return message !== undefined && TYPED_CREW.test(message);
}
function onStop(ctx, payload = {}) {
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  if (asksUserToTypeCrew(payload.last_assistant_message) && session.stopBlocks < MAX_STOP_BLOCKS) {
    session.stopBlocks += 1;
    saveState(ctx.paths, state);
    return {
      decision: "block",
      reason: "Crew: the last message tells the user to type a crew command. The user never types one: you run every crew command, and the permission prompt is the user's signature, in auto mode too (a note saying otherwise predates 0.1.6). Run the command now, without --mode, and tell the user what it recorded."
    };
  }
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
  const judgement = work && missing.some((m) => m.startsWith("judgement gate")) ? ` A judgement gate is cleared by its roles, not by the gate run: run the planned reviewers and the judge, then crew judgement ${work.id} record --ruling .crew/work/${work.id}/review/ruling.json.` : "";
  return done({
    decision: "block",
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.${judgement}${wait}`
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
        return onStop(ctx, payload);
    }
  } catch {
    return {};
  }
}

// packages/engine/src/mail.ts
import { existsSync as existsSync3, mkdirSync as mkdirSync4, rmdirSync, statSync as statSync4 } from "node:fs";
import { basename as basename4, isAbsolute as isAbsolute3, join as join21, resolve as resolve2 } from "node:path";
var LIVE_MS = 10 * 60 * 1000;
var INLINE_BODY_LIMIT = 2048;
var PREVIEW_CHARS = 200;
var SUBJECT_CHARS = 80;
var LOCK_STALE_MS = 1e4;
var LOCK_WAIT_MS = 2000;
var ROLE_AGENT = /^(judge|researcher|expert-\d+|devils-advocate|fault-finder|review-(code-quality|test-quality|security|ui-ux|risk))$/;
var TASK_AGENT = /^T-\d+$/;
var CRITICS = new Set(["devils-advocate", "fault-finder"]);
function worktreeMainRoot(root) {
  const gitFile = join21(root, ".git");
  try {
    if (!statSync4(gitFile).isFile())
      return null;
  } catch {
    return null;
  }
  const line = readText(gitFile)?.trim() ?? "";
  const match = /^gitdir:\s*(.+?)\/\.git\/worktrees\/[^/]+\/?$/.exec(line);
  return match?.[1] ? canonical(isAbsolute3(match[1]) ? match[1] : join21(root, match[1])) : null;
}
function effectiveMailPolicy(root, policy, env) {
  const main = worktreeMainRoot(root);
  let mail = policy.mail;
  if (main && (mail.name === null || mail.workspace === null)) {
    const mainPaths = resolvePaths(main, env);
    const theirs = mainPaths ? loadPolicy(mainPaths).policy.mail : null;
    if (theirs)
      mail = {
        ...mail,
        name: mail.name ?? theirs.name,
        workspace: mail.workspace ?? theirs.workspace
      };
  }
  return { mail, main };
}
function mailSelf(paths, policy, env) {
  const hops = Number(env.WIZARDINGCODE_CREW_MAIL_HOPS ?? "0");
  const { mail, main } = effectiveMailPolicy(paths.root, policy, env);
  return {
    workspace: mail.workspace,
    project: mail.name ?? basename4(main ?? paths.root),
    agent: env.WIZARDINGCODE_CREW_MAIL_AGENT?.trim() || "session",
    hops: Number.isInteger(hops) && hops >= 0 ? hops : 0,
    openedBy: env.WIZARDINGCODE_CREW_MAIL_ID?.trim() || null
  };
}
function mailContext(paths, policy, env) {
  return { paths, policy, env, self: mailSelf(paths, policy, env) };
}
function loadRegistry(userDir) {
  const raw = readJson(registryPath(userDir));
  const projects = Array.isArray(raw?.projects) ? raw.projects.filter((p) => typeof p === "object" && p !== null && typeof p.root === "string" && typeof p.name === "string") : [];
  return { version: 1, projects };
}
function saveRegistry(userDir, registry) {
  writeJson(registryPath(userDir), registry);
}
function projectEntry(registry, workspace, name) {
  const ws = workspace === "_alone" ? null : workspace;
  return registry.projects.find((p) => p.name === name && p.workspace === ws && !p.worktreeOf);
}
function isLive(entry, now = Date.now()) {
  const seen = Date.parse(entry.lastSeen);
  return Number.isFinite(seen) && now - seen <= LIVE_MS;
}
function registerProject(ctx, sessionId, options = {}) {
  const registry = loadRegistry(ctx.paths.userDir);
  const existing = registry.projects.find((p) => p.root === ctx.paths.root);
  if (existing && options.minIntervalMs !== undefined && Date.now() - Date.parse(existing.lastSeen) < options.minIntervalMs && existing.sessionId === sessionId)
    return existing;
  const main = worktreeMainRoot(ctx.paths.root);
  const entry = {
    root: ctx.paths.root,
    name: ctx.self.project,
    workspace: ctx.self.workspace,
    lastSeen: nowIso(),
    sessionId,
    ...main ? { worktreeOf: main } : {},
    ...ctx.self.openedBy ? { mail: ctx.self.openedBy } : {}
  };
  registry.projects = [...registry.projects.filter((p) => p.root !== entry.root), entry];
  saveRegistry(ctx.paths.userDir, registry);
  return entry;
}
function pruneRegistry(userDir) {
  const registry = loadRegistry(userDir);
  const gone = registry.projects.filter((p) => !existsSync3(p.root)).map((p) => p.root);
  if (gone.length) {
    registry.projects = registry.projects.filter((p) => existsSync3(p.root));
    saveRegistry(userDir, registry);
  }
  return gone;
}
function resolveProject(ctx, to) {
  const registry = loadRegistry(ctx.paths.userDir);
  const main = worktreeMainRoot(ctx.paths.root) ?? ctx.paths.root;
  if (to === "." || to === ctx.self.project) {
    const own = registry.projects.find((p) => p.root === main) ?? {
      root: main,
      name: ctx.self.project,
      workspace: ctx.self.workspace,
      lastSeen: nowIso(),
      sessionId: ""
    };
    return { entry: own };
  }
  if (ctx.self.workspace === null) {
    return {
      refused: "this project has no workspace (crew policy set mail.workspace <name>); it can only mail itself (--to .)"
    };
  }
  const candidates = registry.projects.filter((p) => p.name === to && !p.worktreeOf);
  const inWorkspace = candidates.filter((p) => p.workspace === ctx.self.workspace);
  const alive = inWorkspace.filter((p) => existsSync3(p.root));
  if (alive.length) {
    alive.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
    return { entry: alive[0] };
  }
  const where = `in workspace ${ctx.self.workspace}`;
  if (inWorkspace.length) {
    return {
      refused: `no project named ${to} ${where}; the registry knew one at ${inWorkspace[0]?.root}, which is gone`
    };
  }
  const elsewhere = candidates.find((p) => p.workspace !== null);
  if (elsewhere) {
    return {
      refused: `${to} is not in workspace ${ctx.self.workspace} (it is in ${elsewhere.workspace}); mail never leaves the workspace`
    };
  }
  if (candidates.length) {
    return {
      refused: `${to} is not in workspace ${ctx.self.workspace} (it has no workspace); mail never leaves the workspace`
    };
  }
  const known = [
    ...new Set(registry.projects.filter((p) => p.workspace === ctx.self.workspace && !p.worktreeOf).map((p) => p.name))
  ].sort();
  return { refused: `no project named ${to} ${where} (known: ${known.join(", ") || "none"})` };
}
function mailbox(userDir, workspace, project) {
  return { dir: mailboxDir(userDir, workspace, project) };
}
function boxFile(dir, name) {
  return join21(dir, `${name}.json`);
}
function readBox(dir, which) {
  const read = readProtectedJsonAt(boxFile(dir, "integrity"), boxFile(dir, which));
  const box = read.data && Array.isArray(read.data.messages) ? read.data : { version: 1, messages: [] };
  return { box, tampered: read.tampered };
}
function writeBox(dir, which, box) {
  writeProtectedJsonAt(boxFile(dir, "integrity"), boxFile(dir, which), box);
}
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function withMailLock(dir, fn, options = {}) {
  mkdirSync4(dir, { recursive: true });
  const lock = join21(dir, ".lock");
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const started = Date.now();
  for (;; ) {
    try {
      mkdirSync4(lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST")
        throw error;
    }
    let age = null;
    try {
      age = Date.now() - statSync4(lock).mtimeMs;
    } catch {}
    if (age !== null && age > LOCK_STALE_MS) {
      try {
        rmdirSync(lock);
      } catch {}
      continue;
    }
    if (Date.now() - started >= waitMs)
      throw new Error(`mailbox busy: ${lock} held for more than ${waitMs} ms`);
    if (age !== null)
      sleep(20);
  }
  try {
    return fn();
  } finally {
    try {
      rmdirSync(lock);
    } catch {}
  }
}
function newMessageId(outbox, project, at) {
  const day = at.slice(0, 10);
  const taken = outbox.messages.filter((m) => m.at.slice(0, 10) === day).map((m) => Number(/^M-\d{4}-\d{2}-\d{2}-(\d{3})-/.exec(m.id)?.[1])).filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  return `M-${day}-${String(next).padStart(3, "0")}-${project}`;
}
function itemMailPath(paths, id) {
  return join21(workDir(paths, id), "mail.json");
}
function loadItemMail(paths, id) {
  const read = readProtectedJson(paths, itemMailPath(paths, id));
  return { box: read.data ?? { version: 1, messages: [] }, tampered: read.tampered };
}
function recordInItem(paths, id, message) {
  if (!existsSync3(join21(workDir(paths, id), "work.json")))
    return;
  const { box, tampered } = loadItemMail(paths, id);
  if (tampered)
    return;
  box.messages = [...box.messages.filter((m) => m.id !== message.id), message].sort((a, b) => a.at.localeCompare(b.at));
  writeProtectedJson(paths, itemMailPath(paths, id), box);
}
function subjectOf(request) {
  if (request.subject?.trim())
    return request.subject.trim().slice(0, SUBJECT_CHARS);
  const first = request.text.split(`
`).find((l) => l.trim()) ?? "";
  return first.length > SUBJECT_CHARS - 3 ? `${first.slice(0, SUBJECT_CHARS - 3)}...` : first;
}
function destinationPolicy(entry, env) {
  const paths = resolvePaths(entry.root, env);
  return paths ? loadPolicy(paths) : null;
}
function openIn(userDir, workspace, project) {
  const { box } = readBox(mailbox(userDir, workspace, project).dir, "inbox");
  return box.messages.filter((m) => m.opened && !m.opened.endedAt).length;
}
function placeBody(dir, id, text) {
  if (Buffer.byteLength(text, "utf8") <= INLINE_BODY_LIMIT)
    return { body: text };
  const file = join21(dir, `${id}.md`);
  writeText(file, text);
  return { body: `${text.slice(0, PREVIEW_CHARS)}...`, bodyFile: file };
}
function party(self, item) {
  return { workspace: self.workspace ?? "_alone", project: self.project, item, agent: self.agent };
}
function attachFile(root, text, filePath) {
  if (!filePath)
    return { text };
  const abs = isAbsolute3(filePath) ? filePath : resolve2(root, filePath);
  const content = readText(abs);
  if (content === null)
    return { refused: `no file at ${abs}` };
  return { text: text.trim() ? `${text.trim()}

${content}` : content };
}
function tamperedBox(owner, which) {
  return `${owner}'s ${which} changed outside the engine; files under the user's crew directory are written only by the crew command`;
}
function appendToBox(dir, which, owner, build) {
  return withMailLock(dir, () => {
    const { box, tampered } = readBox(dir, which);
    if (tampered)
      return { refused: tamperedBox(owner, which) };
    const message = build(box);
    box.messages.push(message);
    writeBox(dir, which, box);
    return message;
  });
}
function send(ctx, request, work) {
  const at = nowIso();
  const self = ctx.self;
  const own = mailbox(ctx.paths.userDir, self.workspace, self.project);
  const itemId = request.item ?? work?.id ?? null;
  const attached = attachFile(ctx.paths.root, request.text, request.filePath);
  if ("refused" in attached)
    return { refused: attached.refused, message: null };
  const text = attached.text;
  if (!text.trim())
    return { refused: "a message needs a text (or --file)", message: null };
  const resolved = resolveProject(ctx, request.to);
  const refuse = (reason, to2) => {
    const written = appendToBox(own.dir, "outbox", self.project, (box) => ({
      id: newMessageId(box, self.project, at),
      at,
      from: party(self, itemId),
      to: to2,
      type: request.type,
      subject: subjectOf({ subject: request.subject, text }),
      body: text.slice(0, PREVIEW_CHARS),
      replyTo: request.replyTo ?? null,
      hops: self.hops,
      status: "refused",
      reason,
      opened: null
    }));
    if ("refused" in written)
      return { refused: written.refused, message: null };
    if (itemId)
      recordInItem(ctx.paths, itemId, written);
    return { refused: reason, message: written };
  };
  const unknownTo = {
    workspace: self.workspace ?? "_alone",
    project: request.to,
    item: null,
    agent: request.agent ?? null
  };
  if ("refused" in resolved)
    return refuse(resolved.refused, unknownTo);
  const entry = resolved.entry;
  const toSelf = entry.root === (worktreeMainRoot(ctx.paths.root) ?? ctx.paths.root);
  const to = {
    workspace: self.workspace ?? "_alone",
    project: entry.name,
    item: null,
    agent: request.agent ?? null
  };
  let relayed = false;
  if (request.agent) {
    if (!toSelf)
      return refuse(`--agent addresses a role or a task of this project; ${entry.name} is another project`, to);
    if (ROLE_AGENT.test(request.agent)) {
      relayed = true;
      if (request.agent === "judge" && self.agent !== "session")
        return refuse(`a message to the judge comes from the lead (session), not from ${self.agent}`, to);
      if (CRITICS.has(request.agent)) {
        const proposals = itemId ? `.crew/work/${itemId}/conclave/proposals.md` : null;
        const given = request.filePath ? canonical(resolve2(ctx.paths.root, request.filePath)) : null;
        if (!proposals || !given || given !== canonical(join21(ctx.paths.root, proposals)) || request.text.trim())
          return refuse(`a message to ${request.agent} carries ${proposals ?? ".crew/work/<id>/conclave/proposals.md"} (--file) and nothing else`, to);
      }
    } else if (TASK_AGENT.test(request.agent)) {
      if (!(work?.tasks ?? []).some((t) => t.task === request.agent))
        return refuse(`${request.agent} is not a task of ${work?.id ?? "the active item"} (crew task <id> open ${request.agent} …)`, to);
    } else if (request.agent !== "session") {
      return refuse(`--agent is session, a task (T-n) or a role, not ${request.agent}`, to);
    }
  }
  const destination = destinationPolicy(entry, ctx.env);
  if (!destination)
    return refuse(`${entry.name} at ${entry.root} is not a crew project any more`, to);
  if (destination.tampered)
    return refuse(`${entry.name}'s policy changed outside the engine; its user accepts it with crew policy accept`, to);
  const rules = destination.policy.mail;
  if (!toSelf && !rules.accept.includes(request.type))
    return refuse(`${entry.name} does not accept ${request.type} (its policy accepts ${rules.accept.join(", ")})`, to);
  if (!request.replyTo && self.hops >= rules.maxHops && self.openedBy)
    return refuse(`this session is ${self.hops} hops from the first message and ${entry.name} allows ${rules.maxHops} (mail.maxHops); only a reply may go out`, to);
  const dest = mailbox(ctx.paths.userDir, entry.workspace, entry.name);
  if (readBox(dest.dir, "inbox").tampered)
    return refuse(tamperedBox(entry.name, "inbox"), to);
  let delivery;
  if (toSelf)
    delivery = { kind: "self" };
  else if (isLive(entry))
    delivery = { kind: "live", entry };
  else if (request.type === "notice")
    delivery = { kind: "queued", reason: "a notice waits in the inbox" };
  else if (request.type === "change-request" && rules.open !== "branch")
    delivery = {
      kind: "queued",
      reason: `${entry.name} accepts change requests only with a person present (mail.open is read-only)`
    };
  else {
    const mode = request.type === "question" ? "read-only" : rules.open;
    const open = openIn(ctx.paths.userDir, entry.workspace, entry.name);
    if (open >= rules.maxConcurrent)
      return refuse(`${entry.name} has ${open} session${open === 1 ? "" : "s"} open (mail.maxConcurrent ${rules.maxConcurrent}); try again when one ends`, to);
    delivery = { kind: "open", mode, entry };
  }
  const message = appendToBox(own.dir, "outbox", self.project, (outbox) => {
    const id = newMessageId(outbox, self.project, at);
    return {
      id,
      at,
      from: party(self, itemId),
      to,
      type: request.type,
      subject: subjectOf({ subject: request.subject, text }),
      ...placeBody(dest.dir, id, text),
      replyTo: request.replyTo ?? null,
      hops: self.hops,
      status: "sent",
      ...relayed ? { relayed: true } : {},
      opened: null
    };
  });
  if ("refused" in message)
    return { refused: message.refused, message: null };
  const failed = deliver(ctx, dest.dir, entry.name, message);
  if (failed)
    return {
      refused: failed.refused,
      message: { ...message, status: "refused", reason: failed.refused }
    };
  if (itemId)
    recordInItem(ctx.paths, itemId, message);
  return { message, delivery };
}
function deliver(ctx, dir, owner, message) {
  const delivered = appendToBox(dir, "inbox", owner, () => message);
  if (!("refused" in delivered))
    return null;
  const reason = delivered.refused;
  updateEverywhere(ctx, message.id, (m) => ({ ...m, status: "refused", reason }));
  return { refused: reason };
}
function updateEverywhere(ctx, id, change) {
  let result = null;
  const registry = loadRegistry(ctx.paths.userDir);
  const boxes = new Set;
  for (const p of registry.projects) {
    if (!p.worktreeOf)
      boxes.add(mailbox(ctx.paths.userDir, p.workspace, p.name).dir);
  }
  boxes.add(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir);
  for (const dir of boxes) {
    for (const which of ["inbox", "outbox"]) {
      if (!existsSync3(boxFile(dir, which)))
        continue;
      withMailLock(dir, () => {
        const { box, tampered } = readBox(dir, which);
        const index = box.messages.findIndex((m) => m.id === id);
        if (index === -1 || tampered)
          return;
        const changed = change(box.messages[index]);
        box.messages[index] = changed;
        writeBox(dir, which, box);
        result = result ?? changed;
      });
    }
  }
  if (result) {
    const m = result;
    for (const item of [m.from.item, m.to.item]) {
      if (!item)
        continue;
      recordInItem(ctx.paths, item, m);
      const senderRoot = projectEntry(registry, m.from.workspace, m.from.project)?.root;
      const senderPaths = senderRoot ? resolvePaths(senderRoot, ctx.env) : null;
      if (senderPaths && senderPaths.root !== ctx.paths.root)
        recordInItem(senderPaths, item, m);
    }
  }
  return result;
}
function ownInbox(ctx) {
  const { box, tampered } = readBox(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir, "inbox");
  const mine = box.messages.filter((m) => (m.to.agent ?? "session") === ctx.self.agent);
  return { messages: mine.sort((a, b) => a.at.localeCompare(b.at)), tampered };
}
function addressed(ctx, m) {
  if (m.to.project !== ctx.self.project)
    return `${m.id} is addressed to ${m.to.project}, not to ${ctx.self.project}`;
  const agent = m.to.agent ?? "session";
  if (agent !== ctx.self.agent && !(ctx.self.agent === "session" && ROLE_AGENT.test(agent)))
    return `${m.id} is addressed to ${agent}, not to ${ctx.self.agent}`;
  return null;
}
function ownMessage(ctx, id) {
  const { messages, tampered } = ownInbox(ctx);
  if (tampered)
    return { refused: tamperedBox(ctx.self.project, "inbox") };
  const found = messages.find((m) => m.id === id);
  return found ? { found } : { refused: `no message ${id} in this inbox` };
}
function notUpdated(id) {
  return { refused: `${id} could not be updated: its mailbox changed while it was being written` };
}
function markRead(ctx, id) {
  const own = ownMessage(ctx, id);
  if ("refused" in own)
    return own;
  if (own.found.status !== "sent")
    return own.found;
  return updateEverywhere(ctx, id, (m) => ({ ...m, status: "read", readAt: nowIso() })) ?? notUpdated(id);
}
function refuseMail(ctx, id, reason) {
  const own = ownMessage(ctx, id);
  if ("refused" in own)
    return own;
  if (own.found.status !== "sent" && own.found.status !== "read")
    return { refused: `${id} is ${own.found.status}; nothing to refuse` };
  if (!reason.trim())
    return { refused: 'a refusal needs --reason "<why>"' };
  return updateEverywhere(ctx, id, (m) => ({ ...m, status: "refused", reason: reason.trim() })) ?? notUpdated(id);
}
function reply(ctx, id, text, options) {
  const ownDir = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir;
  const inbox = readBox(ownDir, "inbox");
  if (inbox.tampered)
    return { refused: tamperedBox(ctx.self.project, "inbox") };
  const original = inbox.box.messages.find((m) => m.id === id) ?? readBox(ownDir, "outbox").box.messages.find((m) => m.id === id);
  if (!original)
    return { refused: `no message ${id} in this inbox` };
  const wrong = addressed(ctx, original);
  if (wrong)
    return { refused: wrong };
  if (original.status === "answered")
    return { refused: `${id} is answered; a second answer is a new message` };
  if (original.status === "refused")
    return { refused: `${id} is refused; it has no answer` };
  if (original.status === "expired" || original.status === "stopped")
    return { refused: `${id} is ${original.status}; its session is over` };
  if (options.as !== undefined && !ROLE_AGENT.test(options.as))
    return {
      refused: "--as names a role: judge, researcher, expert-<n>, devils-advocate, fault-finder or review-<gate>"
    };
  if (options.as && (original.to.agent ?? "session") !== options.as)
    return {
      refused: `${id} is addressed to ${original.to.agent ?? "session"}, not to ${options.as}`
    };
  if (options.item && !loadWork(ctx.paths, options.item).work)
    return { refused: `unknown work item: ${options.item}` };
  const verdict = options.item ? loadEvidence(ctx.paths, options.item).evidence.verdict : undefined;
  const attached = attachFile(ctx.paths.root, text, options.filePath);
  if ("refused" in attached)
    return { refused: attached.refused };
  const body = attached.text;
  if (!body.trim())
    return { refused: "a reply needs a text (or --file)" };
  const at = nowIso();
  const own = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const dest = mailbox(ctx.paths.userDir, original.from.workspace === "_alone" ? null : original.from.workspace, original.from.project);
  const from = options.as ? { ...party(ctx.self, original.to.item ?? original.from.item), agent: options.as } : party(ctx.self, original.to.item);
  if (readBox(dest.dir, "inbox").tampered)
    return { refused: tamperedBox(original.from.project, "inbox") };
  const replyMessage = appendToBox(own.dir, "outbox", ctx.self.project, (outbox) => {
    const replyId = newMessageId(outbox, ctx.self.project, at);
    return {
      id: replyId,
      at,
      from,
      to: {
        workspace: original.from.workspace,
        project: original.from.project,
        item: original.from.item,
        agent: original.from.agent
      },
      type: original.type,
      subject: original.subject.startsWith("Re: ") ? original.subject : `Re: ${original.subject}`,
      ...placeBody(dest.dir, replyId, body),
      replyTo: original.id,
      hops: ctx.self.hops,
      status: "sent",
      ...options.as || original.relayed ? { relayed: true } : {},
      opened: null,
      ...options.branch ? { branch: options.branch } : {},
      ...options.item ? { item: options.item } : {},
      ...verdict ? { verdict } : {}
    };
  });
  if ("refused" in replyMessage)
    return { refused: replyMessage.refused };
  const failed = deliver(ctx, dest.dir, original.from.project, replyMessage);
  if (failed)
    return failed;
  const answered = updateEverywhere(ctx, id, (m) => ({
    ...m,
    status: "answered",
    answeredAt: at,
    ...options.branch ? { branch: options.branch } : {},
    ...options.item ? { item: options.item } : {},
    ...verdict ? { verdict } : {}
  }));
  if (!answered)
    return {
      refused: `${replyMessage.id} was delivered, but ${id} could not be marked answered: its mailbox changed while it was being written`
    };
  for (const item of [replyMessage.to.item, replyMessage.from.item])
    if (item)
      recordInItem(ctx.paths, item, replyMessage);
  return { reply: replyMessage, original: answered };
}
function syncMail(ctx, paths) {
  const own = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const registry = loadRegistry(ctx.paths.userDir);
  let updated = 0;
  withMailLock(own.dir, () => {
    const { box: outbox, tampered } = readBox(own.dir, "outbox");
    if (tampered)
      return;
    for (const sent of outbox.messages) {
      if (sent.status === "refused")
        continue;
      const entry = projectEntry(registry, sent.to.workspace, sent.to.project);
      const theirsDir = entry ? mailbox(ctx.paths.userDir, entry.workspace, entry.name).dir : own.dir;
      const inbox2 = readBox(theirsDir, "inbox");
      if (inbox2.tampered)
        continue;
      const theirs = inbox2.box.messages.find((m) => m.id === sent.id);
      if (theirs && JSON.stringify(theirs) !== JSON.stringify(sent)) {
        Object.assign(sent, theirs);
        updated += 1;
        if (sent.from.item)
          recordInItem(paths, sent.from.item, sent);
      }
    }
    if (updated)
      writeBox(own.dir, "outbox", outbox);
  });
  const inbox = ownInbox(ctx);
  if (inbox.tampered)
    return { newMail: [], newReplies: [], updated, tampered: true };
  const marker = join21(own.dir, `synced-${ctx.self.agent}.json`);
  const seen = new Set(readJson(marker) ?? []);
  const newMail = [];
  for (const m of inbox.messages) {
    if (m.to.item)
      recordInItem(paths, m.to.item, m);
    if (!seen.has(m.id))
      newMail.push(m);
    seen.add(m.id);
  }
  writeJson(marker, [...seen]);
  return {
    newMail,
    newReplies: newMail.filter((m) => m.replyTo !== null),
    updated,
    tampered: false
  };
}
function inboxSummary(ctx) {
  const { messages, tampered } = ownInbox(ctx);
  const empty = { unread: 0, answered: 0, waiting: 0, blockers: [] };
  if (tampered)
    return { ...empty, tampered, line: tamperedBox(ctx.self.project, "inbox") };
  const unread = messages.filter((m) => m.status === "sent" && !m.replyTo);
  const answered = messages.filter((m) => m.replyTo && m.status === "sent");
  const waiting = messages.filter((m) => m.status === "waiting-for-person");
  const blockers = unread.filter((m) => m.type === "blocker");
  if (!messages.length)
    return { ...empty, tampered, line: null };
  const byType = new Map;
  for (const m of unread)
    byType.set(m.type, (byType.get(m.type) ?? 0) + 1);
  const senders = [...new Set(unread.map((m) => m.from.project))].join(", ");
  const parts = [];
  if (unread.length)
    parts.push(`${unread.length} unread ${[...byType].map(([t, n]) => `${t}${n === 1 ? "" : "s"}`).join(" and ")} from ${senders}`);
  if (answered.length)
    parts.push(`${answered.length} answered`);
  if (waiting.length)
    parts.push(`${waiting.length} waiting for a person`);
  const where = ctx.self.workspace ?? "alone";
  return {
    unread: unread.length,
    answered: answered.length,
    waiting: waiting.length,
    blockers,
    tampered,
    line: parts.length ? `Mail (${where}): ${parts.join(", ")}` : null
  };
}
function openSessions(ctx) {
  const { box, tampered } = readBox(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir, "outbox");
  return tampered ? [] : box.messages.filter((m) => m.opened && !m.opened.endedAt);
}

// packages/engine/src/tdd.ts
import { join as join22 } from "node:path";
var STEPS_BY_KIND = {
  behavior: { steps: ["red", "green"], how: "record red, then green" },
  preserve: { steps: ["before", "after"], how: "record before, then after" },
  observed: { steps: ["observed"], how: "record observed, with --reason" }
};
function article(kind) {
  return /^[aeiou]/.test(kind) ? "an" : "a";
}
var TEST_PATTERNS = ["**/*test*", "**/*spec*", "tests/**", "test/**", "**/__tests__/**"];
function defaultTestCommand(profile) {
  const target = profile.targets.find((t) => t.path === "." && t.gates.test) ?? profile.targets.find((t) => t.gates.test);
  return target?.gates.test ? { command: target.gates.test.command, timeoutMs: target.timeoutMs } : null;
}
async function recordTdd(paths, work, evidence, profile, criterionId, step, override, reason) {
  const criterion = work.criteria.find((c) => c.id === criterionId);
  if (!criterion)
    return { ok: false, message: `unknown criterion ${criterionId}` };
  const expected = STEPS_BY_KIND[criterion.kind];
  if (!expected.steps.includes(step)) {
    return {
      ok: false,
      message: `${criterionId} is ${article(criterion.kind)} ${criterion.kind} criterion: ${expected.how}`
    };
  }
  if (step === "observed" && !reason?.trim()) {
    return { ok: false, message: "an observed run needs --reason: why no red run can exist" };
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
    logPath: join22(workDir(paths, work.id), log)
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
  if (step === "observed" && reason)
    entry.reason = reason.trim();
  return { ok: true, message: `${step} recorded for ${criterionId}`, record };
}

// packages/engine/src/version.ts
var VERSION = "0.4.0";

// packages/engine/src/cli.ts
var BOOLEAN_FLAGS = new Set(["json", "refresh", "force", "not-run", "all"]);
var KNOWN_FLAGS = {
  detect: ["refresh"],
  profile: ["target", "stack", "force", "timeout"],
  policy: [],
  accept: [],
  start: ["answers", "criterion", "preserve", "origin"],
  classify: ["answers"],
  criteria: ["kind"],
  decision: ["default"],
  debate: ["reason", "tokens"],
  decide: ["mode", "validator"],
  objection: ["by", "severity", "criterion", "reason", "mode"],
  approve: ["mode", "validator"],
  phase: [],
  await: [],
  resume: [],
  tdd: ["reason"],
  gate: ["only"],
  judgement: ["ruling", "not-run", "reason"],
  skip: ["reason", "mode"],
  evidence: [],
  status: [],
  mail: [
    "to",
    "type",
    "agent",
    "item",
    "reply-to",
    "subject",
    "file",
    "reason",
    "branch",
    "as",
    "all"
  ],
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
function load(paths, processEnv) {
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  ensureCrewDir(paths, policy.policy);
  const tamperedFiles = [];
  if (profile.tampered)
    tamperedFiles.push({ file: ".crew/profile.json", accept: "profile" });
  if (policy.tampered)
    tamperedFiles.push({ file: ".crew/policy.json", accept: "policy" });
  const mail = mailContext(paths, policy.policy, processEnv);
  const registered = registerProject(mail, processEnv.CLAUDE_CODE_SESSION_ID ?? "cli", {
    minIntervalMs: 2 * 60 * 1000
  });
  return {
    paths,
    profile: profile.profile,
    policy: policy.policy,
    config: loadConfig(paths),
    tampered: tamperedFiles.length > 0,
    tamperedFiles,
    mail,
    registered
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
    if (loadLedger(env.paths, opened.work.id).tampered)
      found.push({ file: `${base}/objections.json`, accept: opened.work.id });
  }
  const first = found[0];
  return first ? refuse(tamperMessage(first)) : null;
}
function skipStep(work, raw) {
  const isGate = (name) => GATE_NAMES.includes(name) || isJudgementGateName(name);
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
    if (!recordIntegrity(env.paths, join23(env.paths.crewDir, `${target}.json`)))
      return refuse(`no .crew/${target}.json to accept`);
    return ok(`${target} accepted: its current content is now the trusted version`, {
      accepted: target
    });
  }
  const dir = workDir(env.paths, target);
  if (!/^[\w.-]+$/.test(target) || target.includes("..") || !existsSync4(join23(dir, "work.json")))
    return refuse(`unknown work item: ${target}`);
  const files = PROTECTED_WORK_FILES.filter((name) => recordIntegrity(env.paths, join23(dir, name)));
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
function decisionFlag(parsed, policy) {
  const mode = parsed.flags.mode;
  if (mode === undefined)
    return policy.attendedDecisions === "relay" ? { by: "user", relayed: true } : { by: "user" };
  if (!isPermissionMode(mode)) {
    return refuse(`--mode names the permission mode of a session with no person watching: ${PERMISSION_MODES.slice(0, -1).join(", ")} or ${PERMISSION_MODES.at(-1)}`);
  }
  return { by: "agent", mode };
}
function validatorFlag(parsed, policy) {
  const rule = parsed.flags.validator;
  if (rule === undefined)
    return decisionFlag(parsed, policy);
  if (!isValidatorRule(rule))
    return refuse(`unknown validator rule: ${String(rule)} (${VALIDATOR_RULES.join(", ")})`);
  if (parsed.flags.mode === undefined) {
    if (rule !== "complete-gap-round") {
      return refuse("with a person present, a person answers: the validator takes a stated default only where no person is watching (add --mode <mode>)");
    }
    return { by: "validator", rule };
  }
  const base = decisionFlag(parsed, policy);
  if (isOutcome(base))
    return base;
  return { by: "validator", mode: base.mode, rule };
}
function decisionText(policy, decision) {
  const note = countedNote(policy, decision);
  return `${decidedBy(decision)}${note ? ` (${note.slice(2)})` : ""}`;
}
function guardContext(env, work, tampered) {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join23(dir, "spec.md")),
    conclaveText: readText(join23(dir, "conclave.md")),
    ledger: loadLedger(env.paths, work.id).ledger,
    planExists: existsSync4(join23(dir, "plan.md")),
    evidence: result.evidence,
    proven: result.verdict === "proven",
    unproven: result.unproven,
    policy: env.policy
  };
}
function deliver2(env, opened, evidence) {
  for (const target of ["gate", "deliver"]) {
    if (nextPhaseOf(opened.work) !== target)
      continue;
    if (!advancePhase(opened.work, guardContext(env, opened.work, opened.tampered)).ok)
      break;
  }
  saveWork(env.paths, opened.work);
  writeProtectedText(env.paths, join23(workDir(env.paths, opened.work.id), "report.md"), reportOf(env, opened.work, evidence));
}
function reportOf(env, work, evidence) {
  return renderReport(work, evidence, env.policy, loadLedger(env.paths, work.id).ledger, loadItemMail(env.paths, work.id), env.mail.self.project);
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
  const file = join23(env.paths.localDir, "decisions.jsonl");
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
    ensureDir(join23(resolve3(io.cwd), ".crew"));
    paths = resolvePaths(io.cwd, io.env);
  }
  if (!paths)
    return refuse(INACTIVE);
  const env = load(paths, io.env);
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
          recordIntegrity(env.paths, join23(env.paths.crewDir, "policy.json"));
        }
      }
      const missing = missingTestCommands(profile);
      const lines = profile.targets.map((t) => `  ${t.path} (${t.stack}, ${t.packageManager}${t.workspaceOf ? `, workspace of ${t.workspaceOf}` : ""}): ${Object.entries(t.gates).map(([g, c]) => `${g}=${c.command}${c.source === "proposed" ? " [proposed]" : ""}`).join(", ") || "no commands"}`);
      if (missing.length)
        lines.push(`No test command for: ${missing.map((m) => m.target).join(", ")}. Propose one: crew profile set test "<cmd>" [--target <path>]`);
      const entry = env.registered;
      lines.push(`registered ${entry.name} (workspace ${entry.workspace ?? "none"})`);
      return ok(lines.join(`
`), { profile, missing, registered: entry });
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
        const timeoutFlag = parsed.flags.timeout;
        const minutes = typeof timeoutFlag === "string" ? Number(timeoutFlag) : undefined;
        if (timeoutFlag !== undefined && !(minutes !== undefined && minutes > 0 && Number.isFinite(minutes)))
          return refuse('usage: crew profile set <gate> "<cmd>" --timeout <minutes> (a positive number)');
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
        if (current?.source === "confirmed" && !parsed.flags.force)
          return refuse(`${gate} for ${where} already has a confirmed command (${current.command}); replacing it needs --force: crew profile set ${gate} "<cmd>" --force`);
        target.gates[gate] = {
          command: cmd,
          source: "confirmed",
          ...minutes ? { timeoutMs: Math.round(minutes * 60 * 1000) } : {}
        };
        saveProfile(env.paths, env.profile);
        return ok(`${gate} for ${where} set and confirmed: ${cmd}`, {
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
      if (args[0] === "accept")
        return accept(env, "policy");
      if (args[0] === "set") {
        const [, key, value] = args;
        if (!key || value === undefined) {
          return refuse(`usage: crew policy set <${Object.keys(SETTABLE_POLICY_KEYS).join("|")}> <value>`);
        }
        const result = setPolicyValue(env.paths, key, value);
        if ("refused" in result)
          return refuse(result.refused);
        return ok(`policy ${key}: ${value}`, result);
      }
      return refuse("usage: crew policy accept | crew policy set <key> <value>");
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
      const originId = typeof parsed.flags.origin === "string" ? parsed.flags.origin : null;
      const inbox = originId ? ownInbox(env.mail) : null;
      if (inbox?.tampered)
        return refuse(tamperedBox(env.mail.self.project, "inbox"));
      const origin = inbox?.messages.find((m) => m.id === originId) ?? null;
      if (originId && !origin)
        return refuse(`no message ${originId} addressed to this session`);
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
      if (origin) {
        work.origin = { mail: origin.id };
        if (origin.type === "change-request" && origin.from.project === env.mail.self.project && origin.from.item && origin.to.agent && TASK_AGENT.test(origin.to.agent)) {
          work.parent = {
            project: origin.from.project,
            item: origin.from.item,
            task: origin.to.agent,
            root: worktreeMainRoot(env.paths.root) ?? env.paths.root
          };
        }
      }
      const criteria = parsed.ordered.filter((f) => f.key === "criterion" || f.key === "preserve").map((f) => addCriterion(work, f.value, f.key === "preserve" ? "preserve" : "behavior"));
      if (work.route === "fast" && criteria.length > 0)
        advancePhase(work, guardContext(env, work, false));
      saveWork(env.paths, work);
      if (origin) {
        const read = markRead(env.mail, origin.id);
        recordInItem(env.paths, work.id, "refused" in read ? origin : read);
      }
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
        const outcome = removeCriterion(opened.work, evidence, args[2], loadLedger(env.paths, opened.work.id).ledger);
        if ("refused" in outcome)
          return refuse(outcome.refused);
        saveWork(env.paths, opened.work);
        const { removed } = outcome;
        return ok(`${removed.id} (${removed.kind}) removed: ${removed.text}`, { removed });
      }
      const text = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !text)
        return refuse('usage: crew criteria <id> add "<criterion>" [--kind preserve|observed] | crew criteria <id> remove <AC-n>');
      const kind = parsed.flags.kind === "preserve" || parsed.flags.kind === "observed" ? parsed.flags.kind : "behavior";
      const criterion = addCriterion(opened.work, text, kind);
      saveWork(env.paths, opened.work);
      return ok(`${criterion.id} (${kind}): ${criterion.text}`, { criterion });
    }
    case "objection": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const { ledger } = loadLedger(env.paths, opened.work.id);
      const usage = 'usage: crew objection <id> add "<text>" --by <role> --severity blocking|advisory | resolve O-n --criterion AC-k | waive O-n --reason "<why>" [--mode <mode>]';
      if (args[1] === "add") {
        const text = args.slice(2).join(" ").trim();
        const by = typeof parsed.flags.by === "string" ? parsed.flags.by.trim() : "";
        const severity = parsed.flags.severity;
        if (!text || !by)
          return refuse(usage);
        if (severity !== "blocking" && severity !== "advisory")
          return refuse("severity is blocking or advisory");
        const objection = addObjection(ledger, text, by, severity);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${objection.id} (${severity}, raised by ${by}): ${objection.text}`, {
          objection
        });
      }
      if (args[1] === "resolve" && args[2]) {
        if (typeof parsed.flags.criterion !== "string")
          return refuse(usage);
        const result = bindObjection(ledger, opened.work, args[2], parsed.flags.criterion);
        if ("refused" in result)
          return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${result.id} is resolved when ${result.criterion} is proven`, {
          objection: result
        });
      }
      if (args[1] === "waive" && args[2]) {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!reason)
          return refuse(usage);
        const decision = decisionFlag(parsed, env.policy);
        if (isOutcome(decision))
          return decision;
        const result = waiveObjection(ledger, args[2], reason, decision);
        if ("refused" in result)
          return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        const waiver = result.waived ?? { by: "user" };
        return ok(`${result.id} waived ${decidedBy(waiver)}${countedNote(env.policy, waiver)}: ${reason}`, { objection: result });
      }
      return refuse(usage);
    }
    case "decision": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const question = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !question)
        return refuse('usage: crew decision <id> add "<question>" [--default "<answer>"]');
      const dflt = typeof parsed.flags.default === "string" ? parsed.flags.default : undefined;
      const decision = addDecision(opened.work, question, dflt);
      saveWork(env.paths, opened.work);
      return ok(`${decision.id}: ${decision.question}${dflt ? ` (default: ${dflt})` : ""}`, {
        decision
      });
    }
    case "debate": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const usage = 'usage: crew debate <id> open --reason "<why>" | crew debate <id> close [--tokens n]';
      if (args[1] === "open") {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!reason)
          return refuse(usage);
        const result = openDebate(opened.work, reason);
        if ("refused" in result)
          return refuse(result.refused);
        saveWork(env.paths, opened.work);
        return ok(`debate open on ${opened.work.id}: ${result.reason}`, { debate: result });
      }
      if (args[1] === "close") {
        const flag = parsed.flags.tokens;
        const tokens = flag === undefined ? undefined : typeof flag === "string" ? Number(flag) : Number.NaN;
        if (tokens !== undefined && !(Number.isFinite(tokens) && tokens >= 0))
          return refuse("--tokens is a number");
        const result = closeDebate(opened.work, tokens);
        if ("refused" in result)
          return refuse(result.refused);
        saveWork(env.paths, opened.work);
        return ok(`debate closed on ${opened.work.id}${tokens !== undefined ? ` (${tokens} tokens)` : ""}`, { debate: result });
      }
      return refuse(usage);
    }
    case "decide": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const id = args[1];
      if (!id)
        return refuse('usage: crew decide <id> D-n "<answer>" [--mode <mode> --validator stated-default]');
      const who = validatorFlag(parsed, env.policy);
      if (isOutcome(who))
        return who;
      if (who.by === "validator" && who.rule !== "stated-default")
        return refuse("a decision's default is taken by the validator under the stated-default rule");
      const answer2 = args.slice(2).join(" ").trim() || undefined;
      const result = answerDecision(opened.work, id, answer2, who);
      if ("refused" in result)
        return refuse(result.refused);
      saveWork(env.paths, opened.work);
      return ok(`${result.id} answered ${decidedBy(result)}: ${result.answer}`, {
        decision: result
      });
    }
    case "approve": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (args[1] !== "spec")
        return refuse("usage: crew approve <id> spec [--mode <mode> [--validator complete-gap-round]]");
      const decision = validatorFlag(parsed, env.policy);
      if (isOutcome(decision))
        return decision;
      if (decision.by === "validator") {
        if (decision.rule !== "complete-gap-round")
          return refuse("a spec is approved by the validator under the complete-gap-round rule");
        const missing = validatorPreconditions(decision.rule, opened.work, guardContext(env, opened.work, opened.tampered));
        if (missing.length)
          return refuse(`the complete-gap-round rule does not hold; missing:
  ${missing.join(`
  `)}`, { missing });
      }
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
      const usage = "usage: crew await <id> user | role | mail <message id>";
      if (command === "resume") {
        opened.work.awaiting = null;
        delete opened.work.awaitingMessage;
        saveWork(env.paths, opened.work);
        return ok(`${opened.work.id}: resumed`, { awaiting: null, awaitingMessage: null });
      }
      const kind = args[1];
      if (kind !== "user" && kind !== "role" && kind !== "mail")
        return refuse(usage);
      if (kind === "mail" && !args[2])
        return refuse(usage);
      opened.work.awaiting = kind;
      if (kind === "mail")
        opened.work.awaitingMessage = args[2];
      else
        delete opened.work.awaitingMessage;
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: ${waitingText(opened.work).slice(2)}`, {
        awaiting: kind,
        awaitingMessage: opened.work.awaitingMessage ?? null
      });
    }
    case "tdd": {
      const [step, id, criterion] = args;
      const opened = openForChange(env, id);
      if (isOutcome(opened))
        return opened;
      if (!["red", "green", "before", "after", "observed"].includes(step ?? "") || !criterion)
        return refuse('usage: crew tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]');
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      const override = parsed.rest.length ? parsed.rest.join(" ") : undefined;
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : undefined;
      const outcome = await recordTdd(env.paths, opened.work, evidence, env.profile, criterion, step, override, reason);
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
      const unknown = only?.find((g) => !GATE_NAMES.includes(g) && !isJudgementGateName(g));
      if (unknown !== undefined)
        return refuse(`unknown gate: ${unknown}`);
      const refreshed = refreshProfile(env.paths, env.profile, env.tampered);
      env.profile = refreshed.profile;
      const outcome = await runGates(env.paths, opened.work, env.profile, env.policy, {
        only,
        tampered: env.tampered || opened.tampered
      });
      deliver2(env, opened, outcome.evidence);
      const raised = outcome.raised ? `Route raised to ${outcome.raised}: ${opened.work.routeReasons.at(-1)}
` : "";
      const picked = refreshed.changed.length ? `profile refreshed: ${refreshed.changed.join("; ")}
` : "";
      const review = outcome.review ? relative6(env.paths.root, outcome.review).replace(/\\/g, "/") : null;
      const pending = judgementRows(opened.work, outcome.evidence, outcome.judgement, outcome.evidence.fingerprint ?? "", env.policy).filter((r) => r.status === "planned" || r.status === "stale");
      const judgementNote = pending.length ? `
Judgement gates to run: ${pending.map((r) => `${r.gate} (${r.planned})`).join(", ")}; inputs in ${review}/ (diff.patch, files.txt); record each with crew judgement ${opened.work.id} record --ruling <file>` : "";
      const reviewLine = outcome.reviewNote ? `
diff.patch: ${outcome.reviewNote}` : "";
      return {
        code: outcome.verdict === "proven" ? 0 : 1,
        stdout: true,
        text: picked + raised + gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs) + judgementNote + reviewLine,
        data: {
          verdict: outcome.verdict,
          unproven: outcome.unproven,
          runs: outcome.evidence.runs,
          raised: outcome.raised,
          route: opened.work.route,
          refreshed: refreshed.changed,
          judgement: outcome.judgement,
          review,
          reviewNote: outcome.reviewNote
        }
      };
    }
    case "judgement": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const usage = 'usage: crew judgement <id> record --ruling <file> | crew judgement <id> record <gate> --not-run --reason "<why>"';
      if (args[1] !== "record")
        return refuse(usage);
      const before = assess(env.paths, opened.work, env.profile, env.policy, env.tampered || opened.tampered);
      const planned = before.judgement.map((j) => j.gate);
      const records = [];
      if (parsed.flags["not-run"] && typeof parsed.flags.ruling === "string")
        return refuse("--not-run and --ruling do not go together: a gate that could not run has no ruling; give one or the other");
      if (parsed.flags["not-run"]) {
        const gate = args[2];
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!gate || !reason)
          return refuse(usage);
        if (!isJudgementGateName(gate))
          return refuse(`unknown judgement gate: ${gate} (${JUDGEMENT_GATES.join(", ")})`);
        if (!planned.includes(gate))
          return refuse(`${gate} is not planned for this item${plannedNote(planned)}`);
        records.push(notRunRecord(gate, reason, before.currentFingerprint));
      } else {
        if (typeof parsed.flags.ruling !== "string")
          return refuse(usage);
        const inputs = readReviewInputs(env.paths, opened.work.id);
        if (!inputs)
          return refuse(`no review inputs for this item: run crew gate run ${opened.work.id} first, then the reviewers and the judge`);
        if (inputs.fingerprint !== before.currentFingerprint)
          return refuse(`the review inputs describe other code than the current one: run crew gate run ${opened.work.id}, then the reviewers and the judge again`);
        const rulingPath = resolve3(env.paths.root, parsed.flags.ruling);
        const text = readText(rulingPath);
        if (text === null)
          return refuse(`no ruling file at ${rulingPath}`);
        let raw;
        try {
          raw = JSON.parse(text);
        } catch {
          return refuse(`the ruling file is not valid JSON: ${rulingPath}`);
        }
        const parsedRulings = parseRulings(raw, planned);
        if ("refused" in parsedRulings)
          return refuse(parsedRulings.refused);
        for (const ruling of parsedRulings.rulings)
          records.push(stampRuling(ruling, before.currentFingerprint, before.changed, opened.work.id));
      }
      for (const record of records) {
        const why = contradiction(record);
        if (why)
          return refuse(why);
      }
      for (const record of records)
        recordJudgement(before.evidence, record);
      const result = reassess(before, opened.work, env.policy);
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      saveEvidence(env.paths, opened.work.id, result.evidence);
      deliver2(env, opened, result.evidence);
      const lines = records.map((r) => {
        const outside = r.findings.filter((f) => f.outside).length;
        const detail = r.verdict === "not-run" ? `: ${r.reason}` : ` (${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}${outside ? `, ${outside} outside the change` : ""})`;
        const word = r.verdict === "not-proven" ? "not proven" : r.verdict === "not-run" ? "not run" : "proven";
        return `  ${r.gate}: ${word}${detail}`;
      });
      lines.push(result.verdict === "proven" ? `Proven: ${opened.work.id}` : `Not proven: ${result.unproven.join("; ")}`);
      return {
        code: result.verdict === "proven" ? 0 : 1,
        stdout: true,
        text: lines.join(`
`),
        data: { records, verdict: result.verdict, unproven: result.unproven }
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
      if (!skipAllowed(env.policy, step)) {
        return refuse(step.startsWith("gate:") ? `the team policy does not allow skipping ${step}: gates are mandatory. Fix what fails, set the gate's command to the team's own flow (crew profile set ${step.slice(5)} "<cmd>"), or have a person list the gate in policy.json allowSkips.` : `the team policy does not allow skipping ${step}`);
      }
      if (env.config.mode === "pilot" && (step === "gate:secrets" || step === "gate:deps"))
        return refuse(`in pilot mode the ${step.slice(5)} gate cannot be skipped`);
      const decision = decisionFlag(parsed, env.policy);
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
      const report = reportOf(env, opened.work, result.evidence);
      if (refused)
        return refuse(`${refused.text}

${report}`, {
          verdict: result.verdict,
          unproven: result.unproven
        });
      saveEvidence(env.paths, opened.work.id, result.evidence);
      writeProtectedText(env.paths, join23(workDir(env.paths, opened.work.id), "report.md"), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case "status": {
      const active = activeWork(env.paths);
      if (!active?.work)
        return ok("no active work item", { active: null });
      const result = assess(env.paths, active.work, env.profile, env.policy, env.tampered || active.tampered);
      const text = `${active.work.id} "${active.work.title}"
  phase ${active.work.phase}, route ${active.work.route}${waitingText(active.work)}
${gateSummary(active.work, result.verdict, result.unproven, result.evidence.runs)}`;
      const work = active.work;
      syncMail(env.mail, env.paths);
      const inbox = inboxSummary(env.mail);
      return ok(text, {
        active: work.id,
        title: work.title,
        type: work.type,
        phase: work.phase,
        route: work.route,
        awaiting: work.awaiting,
        awaitingMessage: work.awaitingMessage ?? null,
        mail: { unread: inbox.unread, answered: inbox.answered, waiting: inbox.waiting },
        debate: debateState(work),
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
        skips: work.skips.map((s) => ({ step: s.step, reason: s.reason })),
        judgement: judgementRows(work, result.evidence, result.judgement, result.currentFingerprint, env.policy),
        decisions: (work.decisions ?? []).map((d) => ({
          id: d.id,
          question: d.question,
          ...d.answer !== undefined ? { answer: d.answer } : {},
          ...d.by ? { by: d.by } : {}
        })),
        objections: loadLedger(env.paths, work.id).ledger.objections.map((o) => ({
          id: o.id,
          severity: o.severity,
          status: objectionStatus(o, work, result.evidence, env.policy),
          text: o.text
        }))
      });
    }
    case "mail": {
      const sendUsage = 'usage: crew mail send --to <project|.> --type question|change-request|notice|blocker [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] "<text>" [--file <path>]';
      const usage = `${sendUsage} | inbox [--all] | read <mid> | reply <mid> "<text>" [--branch <b>] [--item <child id>] [--as <role>] [--file <path>] | refuse <mid> --reason "<why>" | status | stop <mid>`;
      const ctx = env.mail;
      const verb = args[0];
      if (verb === "send") {
        const to = parsed.flags.to;
        const type = parsed.flags.type;
        const text = args.slice(1).join(" ");
        if (typeof to !== "string" || !isMailType(type))
          return refuse(sendUsage);
        const item = typeof parsed.flags.item === "string" ? parsed.flags.item : undefined;
        const work = item ? loadWork(env.paths, item).work ?? null : activeWork(env.paths)?.work ?? null;
        if (item && !work)
          return refuse(`unknown work item: ${item}`);
        const out = send(ctx, {
          to,
          type,
          text,
          ...typeof parsed.flags.agent === "string" ? { agent: parsed.flags.agent } : {},
          ...typeof parsed.flags.subject === "string" ? { subject: parsed.flags.subject } : {},
          ...typeof parsed.flags.file === "string" ? { filePath: parsed.flags.file } : {},
          ...item ? { item } : {},
          ...typeof parsed.flags["reply-to"] === "string" ? { replyTo: parsed.flags["reply-to"] } : {}
        }, work);
        if ("refused" in out)
          return refuse(`refused: ${out.refused}${out.message ? "; recorded in the outbox as refused" : ""}`, { refused: out.refused, message: out.message });
        const { message, delivery } = out;
        const where = `to ${message.to.project} (workspace ${message.to.workspace})`;
        let next;
        if (delivery.kind === "self")
          next = `to ${message.to.agent ?? "session"} of this project`;
        else if (delivery.kind === "live")
          next = `live session (session ${delivery.entry.sessionId}): ring it if your harness lists it`;
        else if (delivery.kind === "queued")
          next = `queued; ${delivery.reason}`;
        else
          next = `queued; no live session: a ${delivery.mode} session is to open`;
        const note = work ? "" : `
note: no active work item, so no item keeps a copy of this message`;
        return ok(`sent ${message.id} ${where}; ${next}${note}`, {
          message,
          delivery: delivery.kind,
          ...delivery.kind === "open" ? { mode: delivery.mode } : {}
        });
      }
      if (verb === "inbox") {
        syncMail(ctx, env.paths);
        const { messages, tampered } = ownInbox(ctx);
        if (tampered)
          return refuse(tamperedBox(ctx.self.project, "inbox"));
        const shown = parsed.flags.all ? messages : messages.filter((m) => m.status === "sent" || m.status === "read" || m.status === "answered" && !m.replyTo);
        const summary = inboxSummary(ctx);
        const lines = shown.map((m) => `  ${m.id} · ${m.type} · from ${partyLabel(m.from)} · ${m.subject} · ${m.status}${m.reason ? `: ${m.reason}` : ""}`);
        return ok(`Mail (${ctx.self.workspace ?? "alone"}/${ctx.self.project}, as ${ctx.self.agent}): ${summary.unread} unread, ${summary.answered} answered${lines.length ? `
${lines.join(`
`)}` : ""}`, { messages: shown, ...summary });
      }
      if (verb === "read") {
        if (!args[1])
          return refuse(usage);
        syncMail(ctx, env.paths);
        const result = markRead(ctx, args[1]);
        if ("refused" in result)
          return refuse(result.refused);
        const body = result.bodyFile ? readText(result.bodyFile) ?? result.body : result.body;
        const head = [
          `id: ${result.id}`,
          `from: ${result.from.project} (${result.from.agent})`,
          `to: ${result.to.project}${result.to.agent ? ` (${result.to.agent})` : ""}`,
          `type: ${result.type}`,
          `subject: ${result.subject}`,
          `status: ${result.status}${result.reason ? `: ${result.reason}` : ""}`,
          `at: ${result.at}`,
          ...result.from.item ? [`from item: ${result.from.item}`] : [],
          ...result.replyTo ? [`reply to: ${result.replyTo}`] : [],
          ...result.branch ? [`branch: ${result.branch}`] : [],
          ...result.item ? [`item: ${result.item}${result.verdict ? ` (${result.verdict})` : ""}`] : []
        ];
        return ok(`${head.join(`
`)}

${body}`, { message: result, body });
      }
      if (verb === "reply") {
        const text = args.slice(2).join(" ");
        if (!args[1])
          return refuse(usage);
        const result = reply(ctx, args[1], text, {
          ...typeof parsed.flags.file === "string" ? { filePath: parsed.flags.file } : {},
          ...typeof parsed.flags.branch === "string" ? { branch: parsed.flags.branch } : {},
          ...typeof parsed.flags.item === "string" ? { item: parsed.flags.item } : {},
          ...typeof parsed.flags.as === "string" ? { as: parsed.flags.as } : {}
        });
        if ("refused" in result)
          return refuse(result.refused);
        return ok(`replied to ${args[1]}: ${result.reply.id} to ${result.reply.to.project}; ${args[1]} answered`, { reply: result.reply, original: result.original });
      }
      if (verb === "refuse") {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : "";
        if (!args[1] || !reason.trim())
          return refuse(usage);
        const result = refuseMail(ctx, args[1], reason);
        if ("refused" in result)
          return refuse(result.refused);
        return ok(`${args[1]} refused: ${reason.trim()}`, { message: result });
      }
      if (verb === "status") {
        const pruned = pruneRegistry(env.paths.userDir);
        const sessions = openSessions(ctx);
        const lines = sessions.map((m) => `  ${m.id} → ${m.to.project}: ${m.opened?.mode} session ${m.opened?.name} (pid ${m.opened?.pid ?? "none"}), since ${m.opened?.startedAt}, ${m.opened?.maxTurns} turns and ${m.opened?.maxMinutes} minutes allowed`);
        const summary = inboxSummary(ctx);
        return ok(`${summary.line ?? `Mail (${ctx.self.workspace ?? "alone"}): inbox empty`}
open sessions: ${sessions.length ? `
${lines.join(`
`)}` : "none"}${pruned.length ? `
registry pruned: ${pruned.join(", ")}` : ""}`, { sessions, pruned, ...summary });
      }
      if (verb === "stop")
        return refuse("no session to stop: this engine has not opened one");
      return refuse(usage);
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
  profile set <gate> "<cmd>" [--target p] [--stack s] [--timeout m]  set a gate command, confirmed in one step (asks the user); m minutes
  profile set <gate> "<cmd>" --force    replace a command a person already confirmed (asks the user)
  profile confirm [<gate>]              confirm commands the detector only guessed (asks the user)
  policy accept                         trust the current policy.json after a hand edit (asks the user)
  policy set <key> <value>              attendedDecisions prompt|relay, unattendedDecisions wait|count|validator, mail.workspace|name|open|maxConcurrent|maxHops|maxTurns|maxMinutes|worktrees (asks the user)
  accept <id|profile|policy>            trust state changed outside the engine (asks the user)
  start "<request>" --answers <json>    create a work item from the typed answers
      [--criterion "<text>"] [--preserve "<text>"]   criteria, repeatable; preserve: existing tests stay green
      [--origin <message id>]           the item answers a message of this project's inbox (a session opened by mail)
  classify <id> --answers <json>        record typed answers and compute the route
  criteria <id> add "<text>" [--kind preserve|observed]
  criteria <id> remove <AC-n>           take out a criterion no test-first record or skip names
  decision <id> add "<question>" [--default "<answer>"]   a decision only the user can make (gap round)
  decide <id> D-n "<answer>"            record the user's answer (asks the user)
      --mode <mode> --validator stated-default   no person watching: the validator takes the default
  objection <id> add "<text>" --by <role> --severity blocking|advisory   file an objection (ledger)
  objection <id> resolve O-n --criterion AC-k   resolved when that criterion is proven
  objection <id> waive O-n --reason "<why>"     the user decides against it (asks the user)
  debate <id> open --reason "<why>"     the conclave's debate opens on a decision with consequences (once per item)
  debate <id> close [--tokens n]        the judge has ruled; plan is held while the debate is open
  approve <id> spec                     record the user's approval (asks the user)
      --mode auto|bypassPermissions|dontAsk   no person watching: recorded as the agent's decision
  phase <id> next                       advance when the guard holds
  await <id> user | role | mail <mid>   mark the turn's wait: for the user, for the roles, or for a reply to a message
  resume <id>                           clear the wait
  mail send --to <project|.> --type question|change-request|notice|blocker "<text>"   send mail inside the workspace
      [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] [--file <path>]
  mail inbox [--all] | read <mid> | reply <mid> "<text>" [--branch <b>] [--item <child>] [--as <role>] [--file <path>]
  mail refuse <mid> --reason "<why>" | status | stop <mid>   this project's mail and the sessions it opened
  tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires; plans the judgement gates and writes their inputs to .crew/work/<id>/review/
  judgement <id> record --ruling <file>  record the rulings of a review file ({"rulings":[{gate,verdict,reviewer,judge,findings,tokens}]}); exit 0 once proven
  judgement <id> record <gate> --not-run --reason "<why>"   a judgement gate that could not run, never passed by default
  skip <id> <step> --reason "<text>"    record a skip of a tdd step, a gate or a judgement gate (asks the user; --mode as for approve)
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
