// packages/engine/src/cli.ts
import { existsSync as existsSync6 } from "node:fs";
import { join as join30, relative as relative6, resolve as resolve4 } from "node:path";

// packages/engine/src/argv.ts
var BOOLEAN_FLAGS = new Set(["json", "refresh", "force", "not-run", "all"]);
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
  "risk",
  "architecture",
  "data",
  "infra"
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

// packages/engine/src/decisions.ts
import { join as join3 } from "node:path";

// packages/engine/src/store.ts
import { basename, relative } from "node:path";
var HAND_WRITTEN = ".crew/policy.json";
function rel(paths, absPath) {
  return relative(paths.root, absPath).replace(/\\/g, "/");
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
  rememberIn(integrityFile, basename(absPath), text);
}
function readProtectedJsonAt(integrityFile, absPath) {
  return readProtected(integrityFile, basename(absPath), absPath, false);
}

// packages/engine/src/decisions.ts
function registerPath(paths) {
  return join3(paths.crewDir, "decisions.json");
}
function load(paths) {
  const read = readProtectedJson(paths, registerPath(paths));
  const entries = Array.isArray(read.data?.entries) ? read.data.entries : [];
  return { register: { version: 1, entries }, tampered: read.tampered };
}
function appendDecision(paths, entry) {
  const { register } = load(paths);
  register.entries.push(entry);
  writeProtectedJson(paths, registerPath(paths), register);
}
function decisionsCount(paths) {
  return load(paths).register.entries.length;
}
function listDecisions(paths, grep) {
  const entries = [...load(paths).register.entries].reverse();
  if (!grep)
    return entries;
  const needle = grep.toLowerCase();
  return entries.filter((e) => `${e.id ?? ""} ${e.text} ${e.answer ?? ""}`.toLowerCase().includes(needle));
}
function registerTampered(paths) {
  return load(paths).tampered;
}
function decisionLine(e) {
  const head = `${e.at.slice(0, 10)} · ${e.item} · ${e.kind} · ${e.id ? `${e.id} ` : ""}${e.text}`;
  return `${head}${e.answer ? ` → ${e.answer}` : ""} (by ${e.by})`;
}

// packages/engine/src/detect/index.ts
import { readdirSync as readdirSync2, statSync as statSync2 } from "node:fs";
import { join as join8, relative as relative2 } from "node:path";

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
import { join as join5 } from "node:path";

// packages/engine/src/detect/scripts.ts
import { readdirSync, statSync } from "node:fs";
import { join as join4 } from "node:path";
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
    const path = join4(dir, name);
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
  const present = LOCKFILES.filter(([, files]) => files.some((f) => exists(join5(dir, f)))).map(([manager]) => manager);
  return { manager: present[0] ?? "npm", sure: present.length <= 1 };
}
var nodeDetector = {
  stack: "node",
  detect(dir) {
    const pkg = readJson(join5(dir, "package.json"));
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
      else if (manager === "bun" && (exists(join5(dir, "bunfig.toml")) || hasTestFiles(dir)))
        gates.test = "bun test";
    }
    if (!gates.typecheck && exists(join5(dir, "tsconfig.json"))) {
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
import { join as join6 } from "node:path";
var phpDetector = {
  stack: "php",
  detect(dir) {
    const composer = readJson(join6(dir, "composer.json"));
    if (!composer)
      return null;
    const scripts = composer.scripts ?? {};
    const installed = (tool) => exists(join6(dir, "vendor", "bin", tool));
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
import { join as join7 } from "node:path";
var PREFIX = {
  uv: "uv run ",
  poetry: "poetry run ",
  pip: "python -m "
};
var pythonDetector = {
  stack: "python",
  detect(dir) {
    const pyproject = readText(join7(dir, "pyproject.toml"));
    if (pyproject === null && !exists(join7(dir, "requirements.txt")))
      return null;
    const manager = exists(join7(dir, "uv.lock")) ? "uv" : exists(join7(dir, "poetry.lock")) ? "poetry" : "pip";
    const prefix = PREFIX[manager] ?? "";
    const text = pyproject ?? "";
    const gates = {};
    const hasPytest = /\[tool\.pytest/.test(text) || exists(join7(dir, "pytest.ini")) || exists(join7(dir, "conftest.py")) || exists(join7(dir, "tests"));
    if (hasPytest)
      gates.test = `${prefix}pytest`;
    if (/\[tool\.ruff/.test(text) || exists(join7(dir, "ruff.toml"))) {
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
    const path = join8(root, name);
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
      const rel2 = relative2(root, dir).replace(/\\/g, "/");
      const target = {
        path: rel2 === "" ? "." : rel2,
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
import { join as join16 } from "node:path";

// packages/engine/src/fingerprint.ts
import { execFileSync } from "node:child_process";
import { readdirSync as readdirSync3, readFileSync as readFileSync2 } from "node:fs";
import { join as join9 } from "node:path";
var MAX_WATCHED_FILES = 20000;
var UNAVAILABLE = "unavailable";
var WALK_PREFIX = "walk:";
function isGitRepo(root) {
  return exists(join9(root, ".git"));
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
function gitShowFile(root, commit, rel2) {
  return gitTry(root, ["show", `${commit}:${rel2}`]);
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
    buffer = readFileSync2(join9(root, path));
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
  const walk = (dir, rel2) => {
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      return true;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || SKIP_DIRS.has(entry.name))
        continue;
      const path = rel2 ? `${rel2}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!walk(join9(dir, entry.name), path))
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
    hashes[path] = hashFile(join9(root, path));
  return hashes;
}
function ownChanges(root, paths, base) {
  const files = base?.baseFiles;
  if (!files)
    return paths;
  const own = new Set(paths.filter((path) => files[path] === undefined || hashFile(join9(root, path)) !== files[path]));
  for (const [path, hash] of Object.entries(files)) {
    if (!paths.includes(path) && hashFile(join9(root, path)) !== hash)
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
        parts2.push(`${path}:${hashFile(join9(root, path))}`);
      }
      return `sha256:${sha256(parts2.join(`
`))}`;
    }
  }
  const files = allWatchedFiles(root, profile, maxFiles);
  if (files === null)
    return UNAVAILABLE;
  const parts = files.map((path) => `${path}:${hashFile(join9(root, path))}`);
  return `${WALK_PREFIX}${sha256(parts.join(`
`))}`;
}

// packages/engine/src/objections.ts
import { join as join12 } from "node:path";

// packages/engine/src/criteria.ts
function tddDone(record, kind) {
  if (!record)
    return false;
  if (record.merged)
    return true;
  if (kind === "behavior")
    return !!record.red && !!record.green;
  if (kind === "preserve")
    return !!record.before && !!record.after;
  return !!record.observed;
}

// packages/engine/src/paths.ts
import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename as basename2, dirname as dirname2, join as join10, relative as relative3, resolve, sep } from "node:path";
function canonical(path) {
  const abs = resolve(path);
  const tail = [];
  let dir = abs;
  for (;; ) {
    try {
      return join10(realpathSync(dir), ...tail);
    } catch {
      const parent = dirname2(dir);
      if (parent === dir)
        return abs;
      tail.unshift(basename2(dir));
      dir = parent;
    }
  }
}
function findRoot(cwd) {
  const start = canonical(cwd);
  let dir = start;
  for (;; ) {
    if (exists(join10(dir, ".git")))
      return dir;
    const parent = dirname2(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  return exists(join10(start, ".crew")) ? start : null;
}
function userDirOf(env = process.env) {
  return join10(env.WIZARDINGCODE_HOME ?? join10(homedir(), ".wizardingcode"), "crew");
}
function resolvePaths(cwd, env = process.env) {
  const root = findRoot(cwd);
  if (root === null)
    return null;
  return pathsFor(root, canonical(userDirOf(env)));
}
function pathsFor(root, userDir) {
  const repoId = sha256(root).slice(0, 16);
  return {
    root,
    crewDir: join10(root, ".crew"),
    localDir: join10(root, ".crew", "local"),
    userDir,
    integrityFile: join10(userDir, "integrity", `${repoId}.json`),
    repoId
  };
}
function workDir(paths, id) {
  return join10(paths.crewDir, "work", id);
}
function registryPath(userDir) {
  return join10(userDir, "projects.json");
}
function mailboxDir(userDir, workspace, project) {
  return join10(userDir, "mail", workspace ?? "_alone", project);
}
var PROTECTED_TOP = new Set([
  ".crew/profile.json",
  ".crew/policy.json",
  ".crew/.gitignore",
  ".crew/decisions.json"
]);
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
  const rel2 = relative3(paths.root, abs).replace(/\\/g, "/");
  if (rel2.startsWith("..") || rel2 === "")
    return false;
  if (PROTECTED_TOP.has(rel2))
    return true;
  if (rel2 === ".crew/local" || rel2.startsWith(".crew/local/"))
    return true;
  const inWork = /^\.crew\/work\/[^/]+\/(.+)$/.exec(rel2);
  if (!inWork)
    return false;
  const inner = inWork[1] ?? "";
  return PROTECTED_IN_WORK.has(inner) || inner.startsWith("logs/");
}

// packages/engine/src/policy.ts
import { join as join11 } from "node:path";
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
var DEFAULT_TEAM_POLICY = {
  template: "core",
  always: [],
  specialists: [],
  maxExperts: 3,
  maxValidationRounds: 2,
  maxJudgementRounds: 2,
  maxGateRounds: 2
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
  mail: DEFAULT_MAIL_POLICY,
  team: DEFAULT_TEAM_POLICY
};
var NAME_HINT = "a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters";
var RANGES = {
  maxConcurrent: { min: 1, max: 10 },
  maxHops: { min: 1, max: 10 },
  maxTurns: { min: 1, max: 500 },
  maxMinutes: { min: 1, max: 600 },
  maxExperts: { min: 1, max: 3 },
  maxValidationRounds: { min: 1, max: 2 },
  maxJudgementRounds: { min: 1, max: 2 },
  maxGateRounds: { min: 1, max: 2 }
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
  },
  "team.template": { values: ["core"] },
  "team.maxExperts": { integer: RANGES.maxExperts },
  "team.maxValidationRounds": { integer: RANGES.maxValidationRounds },
  "team.maxJudgementRounds": { integer: RANGES.maxJudgementRounds },
  "team.maxGateRounds": { integer: RANGES.maxGateRounds }
};
function policyPath(paths) {
  return join11(paths.crewDir, "policy.json");
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
var TEAM_NAMES = [
  "architects",
  "researchers",
  "etl",
  "security",
  "devops",
  "qa",
  "backend",
  "frontend",
  "agentic-os"
];
function loadTeamPolicy(raw) {
  const t = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {};
  return {
    template: "core",
    always: strings(t.always).filter((n) => TEAM_NAMES.includes(n)),
    specialists: strings(t.specialists),
    maxExperts: bounded(t.maxExperts, RANGES.maxExperts, DEFAULT_TEAM_POLICY.maxExperts),
    maxValidationRounds: bounded(t.maxValidationRounds, RANGES.maxValidationRounds, DEFAULT_TEAM_POLICY.maxValidationRounds),
    maxJudgementRounds: bounded(t.maxJudgementRounds, RANGES.maxJudgementRounds, DEFAULT_TEAM_POLICY.maxJudgementRounds),
    maxGateRounds: bounded(t.maxGateRounds, RANGES.maxGateRounds, DEFAULT_TEAM_POLICY.maxGateRounds)
  };
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
      mail: loadMailPolicy(raw.mail),
      team: loadTeamPolicy(raw.team)
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
  return join12(workDir(paths, id), "objections.json");
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
import { join as join15 } from "node:path";

// packages/engine/src/state.ts
import { join as join14 } from "node:path";

// packages/engine/src/lock.ts
import { mkdirSync as mkdirSync2, rmdirSync, statSync as statSync3 } from "node:fs";
import { join as join13 } from "node:path";
var LOCK_STALE_MS = 1e4;
var LOCK_WAIT_MS = 2000;
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

class LockBusy extends Error {
}
function withLock(dir, fn, options = {}) {
  mkdirSync2(dir, { recursive: true });
  const lock = join13(dir, ".lock");
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const started = Date.now();
  for (;; ) {
    try {
      mkdirSync2(lock);
      break;
    } catch (error) {
      if (error.code !== "EEXIST")
        throw error;
    }
    let age = null;
    try {
      age = Date.now() - statSync3(lock).mtimeMs;
    } catch {}
    if (age !== null && age > LOCK_STALE_MS) {
      try {
        rmdirSync(lock);
      } catch {}
      continue;
    }
    if (Date.now() - started >= waitMs)
      throw new LockBusy(`${options.what ?? "folder"} busy: ${lock} held for more than ${waitMs} ms`);
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

// packages/engine/src/state.ts
function statePath(paths) {
  return join14(paths.localDir, "state.json");
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
var STATE_LOCK_WAIT_MS = 500;
function updateState(paths, change) {
  const run = () => {
    const state = loadState(paths);
    const result = change(state);
    saveState(paths, state);
    return result;
  };
  try {
    return withLock(paths.localDir, run, { what: "session state", waitMs: STATE_LOCK_WAIT_MS });
  } catch (error) {
    if (!(error instanceof LockBusy))
      throw error;
    return run();
  }
}
function updateSession(paths, sessionId, change) {
  return updateState(paths, (state) => change(sessionState(state, sessionId)));
}
function ensureCrewDir(paths, policy) {
  const wanted = `local/
work/*/logs/
work/*/review/ui/
worktrees/
${policy.artifacts === "local" ? `work/
` : ""}`;
  const file = join14(paths.crewDir, ".gitignore");
  if (readText(file) !== wanted)
    writeProtectedText(paths, file, wanted);
}

// packages/engine/src/validation.ts
import { createHash as createHash2 } from "node:crypto";
function parseValidation(text) {
  const lines = text.split(`
`);
  const verdictLine = lines.slice(0, 4).find((l) => /^verdict:\s*(validated|returned)\s*$/.test(l.trim()));
  if (!verdictLine)
    return {
      refused: "no verdict line: the second line is `verdict: validated` or `verdict: returned`"
    };
  const verdict = verdictLine.trim().endsWith("validated") ? "validated" : "returned";
  const start = lines.findIndex((l) => l.trim() === "## Returns");
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const section = start === -1 ? [] : lines.slice(start + 1, end === -1 ? undefined : end);
  const returns = section.filter((l) => /^- R-\d+\s*·/.test(l.trim())).length;
  if (verdict === "validated" && returns > 0)
    return {
      refused: `validated with ${returns} open return${returns === 1 ? "" : "s"} under ## Returns: the lead returns the spec, or closes the return in its file; the engine records neither as validated`
    };
  if (verdict === "returned" && returns === 0)
    return {
      refused: "returned with no return under ## Returns: a return names what must change at a file and a line"
    };
  return { verdict, returns };
}
function validationHash(what, specText, planText, evidenceFingerprint) {
  if (what === "delivery")
    return evidenceFingerprint;
  const text = what === "spec" ? specText : planText;
  return `sha256:${createHash2("sha256").update(text ?? "").digest("hex")}`;
}
function leadSeats(work) {
  return (work.seats ?? []).filter((s) => s.kind === "lead");
}
function leadsMissing(work, ctx, what) {
  if (work.route === "fast")
    return [];
  const hash = validationHash(what, ctx.specText, null, ctx.evidence?.fingerprint ?? "");
  const missing = [];
  for (const seat of leadSeats(work)) {
    const mine = (work.validations ?? []).filter((v) => v.what === what && v.by === seat.role);
    const latest = mine[mine.length - 1];
    const file = `conclave/${seat.role}${what === "delivery" ? ".delivery" : ""}.md`;
    if (!latest) {
      missing.push(`validation of ${what} by ${seat.role} (crew validation <id> record --what ${what} --by ${seat.role} --file ${file})`);
    } else if (latest.hash !== hash) {
      missing.push(`validation of ${what} by ${seat.role}: stale (${what === "spec" ? "spec" : "the evidence"} changed); record the lead again`);
    } else if (latest.verdict === "returned") {
      missing.push(`validation of ${what} by ${seat.role}: returned ${latest.returns} return${latest.returns === 1 ? "" : "s"} (${latest.file}); revise the ${what === "spec" ? "spec" : "delivery"} and record the lead again`);
    }
  }
  return missing;
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
  return join15(workDir(paths, id), "work.json");
}
function newWorkId(paths, title) {
  const date = nowIso().slice(0, 10);
  let existing = 0;
  try {
    existing = readdirSync4(join15(paths.crewDir, "work")).filter((n) => n.startsWith(date)).length;
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
  writeText(join15(workDir(paths, work.id), "brief.md"), `# Brief

## Request

${input.trim()}
`);
  updateState(paths, (state) => {
    state.active = work.id;
  });
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
    ids = readdirSync4(join15(paths.crewDir, "work")).sort();
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
    const evidence = readProtectedJson(paths, join15(workDir(paths, id), "evidence.json"));
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
    missing.push(...leadsMissing(work, ctx, "spec"));
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
    missing.push(...leadsMissing(work, ctx, "delivery"));
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
  work.phaseAt = { ...work.phaseAt ?? {}, [next]: nowIso() };
  return { ok: true, phase: next };
}
function waitingText(work) {
  const phrase = waitingPhrase(work);
  return phrase ? `, ${phrase}` : "";
}
function waitingPhrase(work) {
  if (work.awaiting === "user")
    return "waiting for the user";
  if (work.awaiting === "role")
    return "waiting for the roles";
  if (work.awaiting === "mail")
    return `waiting for a reply to ${work.awaitingMessage ?? "a message"}`;
  return null;
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
  return join16(workDir(paths, id), "evidence.json");
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
  if (record?.merged)
    return `proven by ${record.merged.task} (child ${record.merged.child}, merged ${record.merged.commit.slice(0, 7)})`;
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
  if (work.seats?.length || work.rounds) {
    lines.push("", "## Team", "");
    if (work.primaryTeam)
      lines.push(`- Primary team: ${work.primaryTeam} (the session)`, "");
    if (work.seats?.length) {
      lines.push("| Seat | Team | Reason |", "| :- | :- | :- |");
      for (const s of work.seats)
        lines.push(`| ${s.role} | ${s.team ?? ""} | ${s.reason} |`);
      lines.push("");
    }
    const rounds = work.rounds ?? { judgement: 0, validation: 0 };
    lines.push(`- Rounds: judgement ${rounds.judgement} of ${policy.team.maxJudgementRounds}, validation ${rounds.validation} of ${policy.team.maxValidationRounds}`);
  }
  if (work.validations?.length) {
    lines.push("", "## Validations", "", "| What | By | Verdict | Returns | Round | File |", "| :- | :- | :- | -: | -: | :- |");
    for (const v of work.validations)
      lines.push(`| ${v.what} | ${v.by} | ${v.verdict} | ${v.returns} | ${v.round} | ${v.file} |`);
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
    lines.push("", "## Roles", "", "| Role | Personality | At | Tokens | Answer |", "| :- | :- | :- | -: | :- |");
    for (const r of evidence.roles)
      lines.push(`| ${r.agent} | ${r.personality ?? "-"} | ${r.at} | ${r.tokensFrom === "none" ? "not read" : r.tokens} | ${r.file ?? "not saved"} |`);
  }
  if (work.tasks?.length) {
    lines.push("", "## Tasks", "", "| Task | Criteria | Branch | Child | Verdict | Merged | Report |", "| :- | :- | :- | :- | :- | :- | :- |");
    for (const t of work.tasks)
      lines.push(`| ${t.task} | ${t.criteria.join(", ")} | ${t.branch} | ${t.child ?? ""} | ${t.verdict ?? "no reply yet"} | ${t.mergedAt ? `${t.mergeCommit?.slice(0, 7) ?? ""}${t.forcedBy ? " (forced by the user)" : ""}` : "no"} | ${t.child ? `.crew/work/${t.child}/report.md` : ""} |`);
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
import { accessSync, constants, mkdirSync as mkdirSync4, rmSync, writeFileSync as writeFileSync2 } from "node:fs";
import { basename as basename3, delimiter, join as join20 } from "node:path";

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
import { join as join17 } from "node:path";

// packages/engine/src/paths-kind.ts
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

// packages/engine/src/team.ts
var TEAMS = {
  researchers: {
    lead: "lead-researchers",
    members: ["researcher"],
    gates: [],
    mandatory: { kind: "always" },
    validates: false
  },
  qa: {
    lead: "lead-qa",
    members: ["review-test-quality", "review-ui-ux"],
    gates: ["test-quality", "ui-ux"],
    mandatory: { kind: "always" },
    validates: true
  },
  security: {
    lead: "lead-security",
    members: ["review-security"],
    gates: ["security"],
    mandatory: { kind: "always" },
    validates: true
  },
  architects: {
    lead: "lead-architects",
    members: ["review-architecture"],
    gates: ["architecture"],
    mandatory: { kind: "route", route: "full" },
    validates: true
  },
  etl: {
    lead: "lead-etl",
    members: ["review-data"],
    gates: ["data"],
    mandatory: { kind: "risk-area", area: "data-migration" },
    validates: true
  },
  devops: {
    lead: "lead-devops",
    members: ["review-infra"],
    gates: ["infra"],
    mandatory: { kind: "risk-area", area: "infra" },
    validates: true
  },
  backend: {
    lead: "lead-backend",
    members: ["review-code-quality"],
    gates: ["code-quality"],
    mandatory: { kind: "always" },
    validates: false
  },
  frontend: {
    lead: "lead-frontend",
    members: [],
    gates: [],
    mandatory: { kind: "paths" },
    validates: false
  },
  "agentic-os": {
    lead: "lead-agentic-os",
    members: [],
    gates: [],
    mandatory: { kind: "paths" },
    validates: false
  }
};
var PERSONALITIES = [
  "adventurous",
  "creative",
  "conservative",
  "sceptical",
  "professional"
];
var DEBATE_ROLES = ["researcher", "expert", "devils-advocate", "fault-finder"];
var REVIEW_ROLES = [
  "review-code-quality",
  "review-test-quality",
  "review-security",
  "review-ui-ux",
  "review-risk",
  "review-architecture",
  "review-data",
  "review-infra"
];
var LEAD_ROLES = Object.values(TEAMS).map((t) => t.lead);
var ROLE_NAMES = [
  "judge",
  "cto",
  "tech-lead",
  ...DEBATE_ROLES,
  ...REVIEW_ROLES,
  ...LEAD_ROLES
];
function rolePattern() {
  const names = ROLE_NAMES.map((n) => n === "expert" ? "expert-\\d+" : n.replace(/-/g, "\\-"));
  return new RegExp(`^(${names.join("|")})$`);
}
function primaryTeam(changed) {
  return changed.some(isInterfacePath) ? "frontend" : "backend";
}
function seated(team, def, route, riskAreas, policy) {
  if (policy.team.always.includes(team))
    return "policy team.always";
  if (route === "fast")
    return null;
  const rule = def.mandatory;
  if (rule.kind === "always")
    return `${route} route`;
  if (rule.kind === "route")
    return route === rule.route ? `${route} route` : null;
  if (rule.kind === "risk-area")
    return route === "full" && riskAreas.includes(rule.area) ? `risk area ${rule.area}` : null;
  return null;
}
function plannedSeats(route, riskAreas, changed, policy) {
  const seats = [];
  const plan = (seat) => {
    if (!seats.some((s) => s.role === seat.role))
      seats.push(seat);
  };
  if (route !== "fast")
    plan({ role: "researcher", team: "researchers", kind: "debate", reason: `${route} route` });
  const gate = (name, team, reason) => plan({ role: `review-${name}`, team, kind: "gate", gate: name, reason });
  if (route !== "fast") {
    gate("code-quality", "backend", `${route} route`);
    gate("test-quality", "qa", `${route} route`);
  }
  if (route === "full")
    gate("security", "security", "full route");
  else if (route === "standard" && riskAreas.length)
    gate("security", "security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) {
    const shown = interfaces.slice(0, 3).join(", ");
    const more = interfaces.length > 3 ? `, +${interfaces.length - 3} more` : "";
    gate("ui-ux", "qa", `interface files: ${shown}${more}`);
  }
  if (route === "full") {
    gate("risk", "architects", "full route");
    gate("architecture", "architects", "full route");
  }
  for (const team of policy.team.always)
    for (const g of TEAMS[team].gates)
      gate(g, team, "policy team.always");
  for (const team of ["etl", "devops"]) {
    const reason = seated(team, TEAMS[team], route, riskAreas, policy);
    if (reason)
      for (const g of TEAMS[team].gates)
        gate(g, team, reason);
  }
  for (const g of policy.judgementGates) {
    const team = Object.entries(TEAMS).find(([, t]) => t.gates.includes(g))?.[0] ?? null;
    plan({ role: `review-${g}`, team, kind: "gate", gate: g, reason: "policy" });
  }
  for (const [name, def] of Object.entries(TEAMS)) {
    if (!def.validates)
      continue;
    const reason = seated(name, def, route, riskAreas, policy);
    if (reason)
      plan({ role: def.lead, team: name, kind: "lead", reason });
  }
  if (seats.some((s) => s.kind === "gate"))
    plan({ role: "judge", team: null, kind: "debate", reason: "a gate is planned" });
  return seats;
}

// packages/engine/src/judgement.ts
function plannedJudgementGates(route, riskAreas, changed, policy) {
  return plannedSeats(route, riskAreas, changed, policy).filter((s) => s.kind === "gate" && s.gate !== undefined).map((s) => ({ gate: s.gate, reason: s.reason }));
}
function reviewDir(paths, id) {
  return join17(workDir(paths, id), "review");
}
function readReviewInputs(paths, id) {
  const raw = readJson(join17(reviewDir(paths, id), "inputs.json"));
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
        unlinkSync(join17(dir, name));
    }
  }
  const cut = reviewPatch(paths.root, work.baseCommit, changed);
  writeText(join17(dir, "diff.patch"), cut.patch);
  writeText(join17(dir, "files.txt"), changed.length ? `${changed.join(`
`)}
` : "");
  writeText(join17(dir, "inputs.json"), `${JSON.stringify({ fingerprint, at: nowIso() }, null, 2)}
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
function fillTokens(records, roles, since) {
  const thisRound = since ? roles.filter((r) => r.at >= since) : [];
  const latest = (agent) => [...thisRound].reverse().find((r) => r.agent === agent && r.tokensFrom === "transcript");
  const judge = latest("judge");
  const ruled = records.filter((r) => r.verdict !== "not-run");
  for (const record of ruled) {
    if ((record.tokens ?? 0) !== 0)
      continue;
    const reviewer = latest(`review-${record.gate}`);
    if (reviewer || judge)
      record.tokens = (reviewer?.tokens ?? 0) + Math.round((judge?.tokens ?? 0) / ruled.length);
  }
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
import { statSync as statSync4 } from "node:fs";
import { isAbsolute, join as join18, relative as relative4 } from "node:path";
var SOURCE_FILE = /^(?:\.{0,2}\/)?[\w@./-]+\.(?:ts|tsx|js|jsx|mjs|cjs|vue|svelte|astro|php|py|rb|go|rs|kt|java|cs|json|css|scss|html)$/;
function isFile(path) {
  try {
    return statSync4(path).isFile();
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
    const candidates = isAbsolute(token) ? [token] : dirs.map((dir) => join18(dir, token));
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
import { createWriteStream, mkdirSync as mkdirSync3 } from "node:fs";
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
  mkdirSync3(dirname3(options.logPath), { recursive: true });
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
import { join as join19 } from "node:path";
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
    buffer = readFileSync3(join19(root, path));
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
        accessSync(join20(dir, binary + extension), constants.X_OK);
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
  const dir = join20(root, target.path);
  if (target.stack === "python") {
    if (!onPath("pip-audit", env))
      return { reason: "pip-audit not on PATH" };
    const prefix = PYTHON_AUDIT[target.packageManager] ?? PYTHON_AUDIT.pip ?? "pip-audit";
    return { command: `${prefix} --format=json`, tool: "pip-audit", files: [] };
  }
  let tool;
  if (target.stack === "node") {
    tool = NODE_AUDIT[target.packageManager];
    if (tool && target.packageManager === "yarn" && exists(join20(dir, ".yarnrc.yml")))
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
  const present = tool.lockfiles.filter((name) => exists(join20(dir, name)));
  if (present.length === 0)
    return { reason: "no lockfile" };
  if (!onPath(tool.binary, env))
    return { reason: `${tool.binary} not on PATH` };
  return { command: tool.command, tool: tool.tool, files: [tool.manifest, ...present] };
}
async function baselineAdvisories(paths, work, target, audit, where) {
  if (!work.baseCommit || audit.files.length === 0)
    return { readable: false, advisories: [] };
  const scratch = join20(paths.crewDir, "local", "audit-base", work.id, where || "root");
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync4(scratch, { recursive: true });
  let lockfiles = 0;
  for (const [index, file] of audit.files.entries()) {
    const rel2 = target.path === "." ? file : `${target.path}/${file}`;
    const text = gitShowFile(paths.root, work.baseCommit, rel2);
    if (text === null)
      continue;
    writeFileSync2(join20(scratch, file), text);
    if (index > 0)
      lockfiles += 1;
  }
  if (lockfiles === 0)
    return { readable: true, advisories: [] };
  const log = join20(workDir(paths, work.id), "logs", `deps-base-${where}-${Date.now()}.txt`);
  const result = await runCommand(audit.command, {
    cwd: scratch,
    timeoutMs: gateTimeoutMs(target, "deps"),
    logPath: log
  });
  const report = parseAudit(audit.tool, readText(log) ?? result.tail);
  return { readable: report.readable && !result.timedOut, advisories: report.advisories };
}
async function judgeAudit(run, audit, paths, work, target, where) {
  const text = run.log && readText(join20(workDir(paths, work.id), run.log)) || run.tail;
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
  const covers = (t, path) => t.path === "." || path === t.path || path.startsWith(`${t.path}/`);
  const uncovered = profile.targets.length === 0 || changed.some((path) => !profile.targets.some((t) => covers(t, path)));
  if (uncovered && !planned.some((g) => g.gate === "test" && g.target === "."))
    planned.push({ gate: "test", target: "." });
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
    return {
      ...base,
      reason: gate === "test" ? 'no test command (crew profile set test "<cmd>")' : "target not in profile"
    };
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
    cwd: join20(paths.root, targetPath),
    timeoutMs: gateTimeoutMs(target, gate),
    logPath: join20(workDir(paths, work.id), log)
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
  const text = run.log && readText(join20(workDir(paths, work.id), run.log)) || run.tail;
  const named2 = namedFiles(text, [join20(paths.root, targetPath), paths.root], paths.root);
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
  work.seats = plannedSeats(work.route, work.riskAreas, changed, policy);
  work.primaryTeam = primaryTeam(changed);
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

// packages/engine/src/mail.ts
import { accessSync as accessSync2, constants as constants2, existsSync as existsSync4, statSync as statSync5 } from "node:fs";
import { basename as basename4, isAbsolute as isAbsolute2, join as join22, resolve as resolve2 } from "node:path";

// packages/engine/src/opened.ts
import { existsSync as existsSync3, rmSync as rmSync2 } from "node:fs";
import { join as join21 } from "node:path";
function openedMarkerFile(userDir, root) {
  return join21(userDir, "opened", `${sha256(canonical(root)).slice(0, 16)}.json`);
}
function openedMarkerPath(paths) {
  return openedMarkerFile(paths.userDir, paths.root);
}
function writeOpenedMarker(paths, marker) {
  writeJson(openedMarkerPath(paths), marker);
}
function dropOpenedMarker(userDir, root) {
  rmSync2(openedMarkerFile(userDir, root), { force: true });
}
function readOpenedMarker(paths) {
  const file = openedMarkerPath(paths);
  if (!existsSync3(file))
    return null;
  const parsed = readJson(file);
  if (!parsed || typeof parsed.mail !== "string" || !parsed.mail)
    return null;
  return {
    mail: parsed.mail,
    agent: typeof parsed.agent === "string" && parsed.agent ? parsed.agent : "session",
    hops: typeof parsed.hops === "number" && Number.isInteger(parsed.hops) && parsed.hops >= 0 ? parsed.hops : 0
  };
}
function modeOf(value) {
  return value === "read-only" || value === "branch" ? value : null;
}
function resolveOpener(paths, env) {
  const marker = readOpenedMarker(paths);
  const headless = env.CLAUDE_CODE_SESSION_ATTENDED === "0";
  const fromEnv = env.WIZARDINGCODE_CREW_MAIL_ID?.trim() || null;
  const fromMarker = headless && marker ? marker : null;
  const mail = fromEnv ?? fromMarker?.mail ?? null;
  const envHops = Number(env.WIZARDINGCODE_CREW_MAIL_HOPS ?? "0");
  const hops = Number.isInteger(envHops) && envHops >= 0 ? envHops : 0;
  return {
    mail,
    agent: env.WIZARDINGCODE_CREW_MAIL_AGENT?.trim() || (mail ? fromMarker?.agent : null) || "session",
    hops: mail ? Math.max(hops, fromMarker?.hops ?? 0) : hops,
    mode: modeOf(env.WIZARDINGCODE_CREW_MAIL_MODE) ?? (fromEnv || !fromMarker ? null : "branch"),
    branch: env.WIZARDINGCODE_CREW_MAIL_BRANCH?.trim() || null
  };
}

// packages/engine/src/mail.ts
var LIVE_MS = 10 * 60 * 1000;
var INLINE_BODY_LIMIT = 2048;
var PREVIEW_CHARS = 200;
var SUBJECT_CHARS = 80;
var ROLE_AGENT = rolePattern();
var TASK_AGENT = /^T-\d+$/;
var CRITICS = new Set(["devils-advocate", "fault-finder"]);
function worktreeMainRoot(root) {
  const gitFile = join22(root, ".git");
  try {
    if (!statSync5(gitFile).isFile())
      return null;
  } catch {
    return null;
  }
  const line = readText(gitFile)?.trim() ?? "";
  const match = /^gitdir:\s*(.+?)\/\.git\/worktrees\/[^/]+\/?$/.exec(line);
  return match?.[1] ? canonical(isAbsolute2(match[1]) ? match[1] : join22(root, match[1])) : null;
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
function subjectQuoted(subject) {
  return JSON.stringify(subject.replace(/\p{Cc}+/gu, " ").trim());
}
function mailSelf(paths, policy, env) {
  const opener = resolveOpener(paths, env);
  const { mail, main } = effectiveMailPolicy(paths.root, policy, env);
  return {
    workspace: mail.workspace,
    project: mail.name ?? basename4(main ?? paths.root),
    agent: opener.agent,
    hops: opener.hops,
    openedBy: opener.mail,
    openedMode: opener.mode,
    openedBranch: opener.branch
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
  const seen = entry.lastHook === undefined ? Number.NaN : Date.parse(entry.lastHook);
  return Number.isFinite(seen) && now - seen <= LIVE_MS;
}
function registerProject(ctx, sessionId, options = {}) {
  const registry = loadRegistry(ctx.paths.userDir);
  const existing = registry.projects.find((p) => p.root === ctx.paths.root);
  const recent = (at) => at !== undefined && options.minIntervalMs !== undefined && Date.now() - Date.parse(at) < options.minIntervalMs;
  if (existing && recent(existing.lastSeen) && existing.sessionId === sessionId && (!options.hook || recent(existing.lastHook)))
    return existing;
  const main = worktreeMainRoot(ctx.paths.root);
  const now = nowIso();
  const lastHook = options.hook ? now : existing?.lastHook;
  const entry = {
    root: ctx.paths.root,
    name: ctx.self.project,
    workspace: ctx.self.workspace,
    lastSeen: now,
    sessionId,
    ...lastHook ? { lastHook } : {},
    ...main ? { worktreeOf: main } : {},
    ...ctx.self.openedBy ? { mail: ctx.self.openedBy } : {}
  };
  registry.projects = [...registry.projects.filter((p) => p.root !== entry.root), entry];
  saveRegistry(ctx.paths.userDir, registry);
  return entry;
}
function pruneRegistry(userDir) {
  const registry = loadRegistry(userDir);
  const gone = registry.projects.filter((p) => !existsSync4(p.root)).map((p) => p.root);
  if (gone.length) {
    registry.projects = registry.projects.filter((p) => existsSync4(p.root));
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
  const alive = inWorkspace.filter((p) => existsSync4(p.root));
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
  return join22(dir, `${name}.json`);
}
function readBox(dir, which) {
  const file = boxFile(dir, which);
  if (existsSync4(file))
    accessSync2(file, constants2.R_OK);
  const read = readProtectedJsonAt(boxFile(dir, "integrity"), file);
  const box = read.data && Array.isArray(read.data.messages) ? read.data : { version: 1, messages: [] };
  return { box, tampered: read.tampered };
}
function writeBox(dir, which, box) {
  writeProtectedJsonAt(boxFile(dir, "integrity"), boxFile(dir, which), box);
}
function withMailLock(dir, fn, options = {}) {
  return withLock(dir, fn, { ...options, what: "mailbox" });
}
function newMessageId(outbox, project, at) {
  const day = at.slice(0, 10);
  const taken = outbox.messages.filter((m) => m.at.slice(0, 10) === day).map((m) => Number(/^M-\d{4}-\d{2}-\d{2}-(\d{3})-/.exec(m.id)?.[1])).filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  return `M-${day}-${String(next).padStart(3, "0")}-${project}`;
}
function itemMailPath(paths, id) {
  return join22(workDir(paths, id), "mail.json");
}
function loadItemMail(paths, id) {
  const read = readProtectedJson(paths, itemMailPath(paths, id));
  return { box: read.data ?? { version: 1, messages: [] }, tampered: read.tampered };
}
function recordInItem(paths, id, message) {
  if (!existsSync4(join22(workDir(paths, id), "work.json")))
    return;
  const { box, tampered } = loadItemMail(paths, id);
  if (tampered)
    return;
  box.messages = [...box.messages.filter((m) => m.id !== message.id), message].sort((a, b) => a.at.localeCompare(b.at));
  writeProtectedJson(paths, itemMailPath(paths, id), box);
}
function itemHome(ctx, registry, party, item, here) {
  const root = projectEntry(registry, party.workspace, party.project)?.root;
  const registered = root ? resolvePaths(root, ctx.env) : null;
  for (const paths of [registered, here]) {
    if (paths && existsSync4(join22(workDir(paths, item), "work.json")))
      return paths;
  }
  return null;
}
function recordForParties(ctx, registry, m, here = ctx.paths) {
  const copies = [
    [m.from.item, m.from],
    [m.to.item, m.to]
  ];
  for (const [item, party] of copies) {
    if (!item)
      continue;
    const home = itemHome(ctx, registry, party, item, here);
    if (home)
      recordInItem(home, item, m);
  }
}
function subjectOf(request) {
  const given = request.subject?.replace(/\s+/g, " ").trim();
  if (given)
    return given.slice(0, SUBJECT_CHARS);
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
  const file = join22(dir, `${id}.md`);
  writeText(file, text);
  return { body: `${text.slice(0, PREVIEW_CHARS)}...`, bodyFile: file };
}
function party(self, item) {
  return { workspace: self.workspace ?? "_alone", project: self.project, item, agent: self.agent };
}
function attachFile(root, text, filePath) {
  if (!filePath)
    return { text };
  const abs = isAbsolute2(filePath) ? filePath : resolve2(root, filePath);
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
        if (!proposals || !given || given !== canonical(join22(ctx.paths.root, proposals)) || request.text.trim())
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
  const skipped = [];
  updateEverywhere(ctx, message.id, (m) => ({ ...m, status: "refused", reason }), (w) => skipped.push(w));
  return {
    refused: skipped.length ? `${reason}; a copy was not marked: ${skipped.join(", ")}` : reason
  };
}
function recordOpened(ctx, id, opened, skipped) {
  const result = updateEverywhere(ctx, id, (m) => ({ ...m, opened }), skipped);
  const own = readBox(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir, "outbox");
  const copy = own.box.messages.find((m) => m.id === id);
  return result && !own.tampered && copy?.opened?.pid === opened.pid ? result : null;
}
function updateEverywhere(ctx, id, change, skipped) {
  let result = null;
  const registry = loadRegistry(ctx.paths.userDir);
  const boxes = new Set;
  for (const p of registry.projects) {
    if (!p.worktreeOf)
      boxes.add(mailbox(ctx.paths.userDir, p.workspace, p.name).dir);
  }
  boxes.add(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir);
  const holding = [];
  for (const dir of boxes) {
    for (const which of ["inbox", "outbox"]) {
      if (!existsSync4(boxFile(dir, which)))
        continue;
      try {
        if (readBox(dir, which).box.messages.some((m) => m.id === id))
          holding.push([dir, which]);
      } catch (error) {
        skipped(`${boxFile(dir, which)} (${error.message.split(`
`)[0]})`);
      }
    }
  }
  for (const [dir, which] of holding) {
    withMailLock(dir, () => {
      let read;
      try {
        read = readBox(dir, which);
      } catch (error) {
        skipped(`${boxFile(dir, which)} (${error.message.split(`
`)[0]})`);
        return;
      }
      const { box, tampered } = read;
      if (tampered) {
        skipped(`${boxFile(dir, which)} (changed outside the engine)`);
        return;
      }
      const index = box.messages.findIndex((m) => m.id === id);
      if (index === -1)
        return;
      const changed = change(box.messages[index]);
      box.messages[index] = changed;
      writeBox(dir, which, box);
      result = result ?? changed;
    });
  }
  if (result)
    recordForParties(ctx, registry, result);
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
function skippedLine(id) {
  return (what) => `a copy of ${id} was not changed: ${what}`;
}
function markRead(ctx, id, notes) {
  const own = ownMessage(ctx, id);
  if ("refused" in own)
    return own;
  if (own.found.status !== "sent")
    return own.found;
  return updateEverywhere(ctx, id, (m) => ({ ...m, status: "read", readAt: nowIso() }), (w) => notes.push(skippedLine(id)(w))) ?? notUpdated(id);
}
function refuseMail(ctx, id, reason, notes) {
  const own = ownMessage(ctx, id);
  if ("refused" in own)
    return own;
  if (own.found.status !== "sent" && own.found.status !== "read")
    return { refused: `${id} is ${own.found.status}; nothing to refuse` };
  if (!reason.trim())
    return { refused: 'a refusal needs --reason "<why>"' };
  return updateEverywhere(ctx, id, (m) => ({ ...m, status: "refused", reason: reason.trim() }), (w) => notes.push(skippedLine(id)(w))) ?? notUpdated(id);
}
function reply(ctx, id, text, options, notes) {
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
  }), (w) => notes.push(skippedLine(id)(w)));
  if (!answered)
    return {
      refused: `${replyMessage.id} was delivered, but ${id} could not be marked answered: its mailbox changed while it was being written`
    };
  withMailLock(ownDir, () => {
    recordForParties(ctx, loadRegistry(ctx.paths.userDir), replyMessage);
  });
  return { reply: replyMessage, original: answered };
}
function syncMail(ctx, paths) {
  const own = mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const registry = loadRegistry(ctx.paths.userDir);
  return withMailLock(own.dir, () => {
    let updated = 0;
    const { box: outbox, tampered } = readBox(own.dir, "outbox");
    if (!tampered) {
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
          recordForParties(ctx, registry, sent, paths);
        }
      }
      if (updated)
        writeBox(own.dir, "outbox", outbox);
    }
    const inbox = ownInbox(ctx);
    if (inbox.tampered)
      return { newMail: [], newReplies: [], updated, tampered: true };
    const marker = join22(own.dir, `synced-${ctx.self.agent}.json`);
    const seen = new Set(readJson(marker) ?? []);
    const newMail = [];
    for (const m of inbox.messages) {
      recordForParties(ctx, registry, m, paths);
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
  });
}
function markNoticed(ctx, id, notes) {
  updateEverywhere(ctx, id, (m) => ({ ...m, noticedAt: nowIso() }), (w) => notes.push(skippedLine(id)(w)));
}
function updateStatusEverywhere(ctx, id, status, reason, notes) {
  updateEverywhere(ctx, id, (m) => ({
    ...m,
    status,
    ...reason !== undefined ? { reason } : {}
  }), (w) => notes.push(skippedLine(id)(w)));
}
function emptyInboxSummary() {
  return {
    messages: [],
    unread: 0,
    answered: 0,
    waiting: 0,
    blockers: [],
    tampered: false,
    line: null
  };
}
function inboxSummary(ctx) {
  const { messages, tampered } = ownInbox(ctx);
  if (tampered)
    return { ...emptyInboxSummary(), tampered, line: tamperedBox(ctx.self.project, "inbox") };
  const unread = messages.filter((m) => m.status === "sent" && !m.replyTo);
  const answered = messages.filter((m) => m.replyTo && m.status === "sent");
  const waiting = messages.filter((m) => m.status === "waiting-for-person");
  const blockers = unread.filter((m) => m.type === "blocker");
  if (!messages.length)
    return emptyInboxSummary();
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
    messages,
    unread: unread.length,
    answered: answered.length,
    waiting: waiting.length,
    blockers,
    tampered,
    line: parts.length ? `Mail (${where}): ${parts.join(", ")}` : null
  };
}
function readOpenSessions(ctx) {
  const { box, tampered } = readBox(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir, "outbox");
  const open = box.messages.filter((m) => m.opened && !m.opened.endedAt);
  return tampered ? { messages: [], tampered: tamperedBox(ctx.self.project, "outbox"), untrusted: open } : { messages: open, tampered: null, untrusted: [] };
}

// packages/engine/src/open.ts
import { execFileSync as execFileSync4, spawn as spawn2 } from "node:child_process";
import { closeSync, mkdirSync as mkdirSync5, openSync } from "node:fs";
import { dirname as dirname4, join as join24 } from "node:path";

// packages/engine/src/profile.ts
import { join as join23 } from "node:path";
function profilePath(paths) {
  return join23(paths.crewDir, "profile.json");
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

// packages/engine/src/worktree.ts
import { execFileSync as execFileSync3 } from "node:child_process";
import { basename as basename5, resolve as resolve3 } from "node:path";
function gitRun(cwd, ...args) {
  return execFileSync3("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C" },
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}
function gitError(error) {
  const failed = error;
  const stderr = failed.stderr?.toString().trim().split(`
`)[0];
  return stderr || (failed.message.split(`
`)[0] ?? "");
}
function worktreePath(root, worktrees, name) {
  return resolve3(root, worktrees, `${basename5(root)}-${name}`);
}
function addWorktree(root, branch, path) {
  try {
    gitRun(root, "worktree", "add", "-q", "-b", branch, path, "HEAD");
    return null;
  } catch (error) {
    return { failed: `git worktree add failed in ${root}: ${gitError(error)}` };
  }
}
function dropBranch(root, branch) {
  try {
    gitRun(root, "branch", "-D", branch);
  } catch {}
}
var ENGINE_DIR = ".crew/";
function dirtyPaths(path) {
  return gitRun(path, "status", "--porcelain", "--untracked-files=all").split(`
`).map((line) => /^\s*[MADRCU?!]{0,2}\s+(.+)$/.exec(line)?.[1] ?? "").filter((p) => p.length > 0).flatMap((p) => p.split(" -> "));
}
function removeWorktree(root, path) {
  try {
    gitRun(root, "worktree", "remove", path);
    return null;
  } catch (error) {
    let onlyEngine;
    try {
      const dirty = dirtyPaths(path);
      onlyEngine = dirty.length > 0 && dirty.every((p) => p.startsWith(ENGINE_DIR));
    } catch {
      onlyEngine = false;
    }
    if (!onlyEngine)
      return { kept: gitError(error) };
    try {
      gitRun(root, "worktree", "remove", "--force", path);
      return null;
    } catch (forced) {
      return { kept: gitError(forced) };
    }
  }
}

// packages/engine/src/open.ts
var OPENER_STRIPS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_CHILD_SESSION",
  "CLAUDE_CODE_SESSION_ID",
  "CLAUDE_CODE_SESSION_ATTENDED",
  "CLAUDE_CODE_MESSAGING_SOCKET",
  "CLAUDE_CODE_MESSAGING_TOKEN"
];
var READ_ONLY_FLAGS = [
  "--allowedTools",
  "Read",
  "Glob",
  "Grep",
  "Bash(crew *)",
  "--disallowedTools",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit"
];
var BRANCH_FLAGS = [
  "--allowedTools",
  "Read",
  "Glob",
  "Grep",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
  "Skill",
  "Agent",
  "Bash(crew *)",
  "Bash(git *)"
];
function commandGrants(profile) {
  const words = [];
  for (const target of profile?.targets ?? [])
    for (const gate of Object.values(target.gates)) {
      const word = gate?.command.trim().split(/\s+/).find((w) => !w.includes("="));
      if (word && !words.includes(word))
        words.push(word);
    }
  return words.map((w) => `Bash(${w} *)`);
}
function claudeBinary(env) {
  return env.WIZARDINGCODE_CREW_CLAUDE?.trim() || "claude";
}
function pluginDirOf(env) {
  return env.WIZARDINGCODE_CREW_PLUGIN_DIR?.trim() || null;
}
function openerArgs(request, options) {
  const args = [
    "--name",
    `crew-${request.message.id}`,
    "-p",
    request.prompt,
    "--permission-mode",
    "dontAsk",
    "--max-turns",
    String(request.maxTurns),
    "--output-format",
    "json"
  ];
  if (options.pluginDir)
    args.push("--plugin-dir", options.pluginDir);
  if (request.mode === "read-only")
    args.push(...READ_ONLY_FLAGS);
  else
    args.push(...BRANCH_FLAGS, ...commandGrants(options.profile));
  return args;
}
function sessionLog(ctx, id) {
  return join24(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir, "opened", `${id}.log`);
}
function openSession(ctx, request, notes = []) {
  const env = { ...ctx.env };
  for (const key of OPENER_STRIPS)
    delete env[key];
  env.WIZARDINGCODE_CREW_MAIL_ID = request.message.id;
  env.WIZARDINGCODE_CREW_MAIL_AGENT = request.agent;
  env.WIZARDINGCODE_CREW_MAIL_HOPS = String(request.hops);
  env.WIZARDINGCODE_CREW_MAIL_MODE = request.mode;
  if (request.branch)
    env.WIZARDINGCODE_CREW_MAIL_BRANCH = request.branch;
  else
    delete env.WIZARDINGCODE_CREW_MAIL_BRANCH;
  const paths = request.mode === "branch" ? resolvePaths(request.cwd, ctx.env) : null;
  if (request.mode === "branch") {
    if (!paths)
      return { failed: `${request.cwd} is not a checkout the engine can read` };
    try {
      writeOpenedMarker(paths, {
        mail: request.message.id,
        agent: request.agent,
        hops: request.hops
      });
    } catch (error) {
      return {
        failed: `could not record the opener of ${request.cwd}: ${error.message}`
      };
    }
  }
  const undone = (failed, stopped) => {
    if (paths)
      dropOpenedMarker(paths.userDir, paths.root);
    return stopped ? { failed, stopped } : { failed };
  };
  let fd;
  try {
    mkdirSync5(dirname4(request.log), { recursive: true });
    fd = openSync(request.log, "a");
  } catch (error) {
    return undone(`could not open the log ${request.log}: ${error.message}`);
  }
  let child;
  try {
    const projectPaths = resolvePaths(worktreeMainRoot(request.cwd) ?? request.cwd, ctx.env);
    const args = openerArgs(request, {
      pluginDir: pluginDirOf(ctx.env),
      profile: projectPaths ? loadProfile(projectPaths).profile : null
    });
    child = spawn2(claudeBinary(ctx.env), args, {
      cwd: request.cwd,
      env,
      detached: true,
      stdio: ["ignore", fd, fd]
    });
    child.on("error", () => {});
    child.unref();
  } catch (error) {
    closeSync(fd);
    return undone(`could not start ${claudeBinary(ctx.env)}: ${error.message}`);
  }
  closeSync(fd);
  if (child.pid === undefined)
    return undone("the session did not start (no pid)");
  const opened = {
    mode: request.mode,
    cwd: request.cwd,
    branch: request.branch,
    pid: child.pid,
    name: `crew-${request.message.id}`,
    processStart: processStart(child.pid),
    maxTurns: request.maxTurns,
    maxMinutes: request.maxMinutes,
    startedAt: nowIso(),
    log: request.log
  };
  let cause = null;
  try {
    if (!recordOpened(ctx, request.message.id, opened, (what) => notes.push(`a copy of ${request.message.id} was not changed: ${what}`)))
      cause = "a mailbox changed outside the engine";
  } catch (error) {
    cause = error.message;
  }
  if (cause) {
    killGroup(child.pid);
    const at = nowIso();
    try {
      updateEverywhere(ctx, request.message.id, (m) => ({
        ...m,
        reason: UNRECORDED,
        opened: ended(opened, "stopped", at)
      }), () => {});
    } catch {}
    return undone(`the session started but the outbox could not record it (${cause}), so it was stopped`, true);
  }
  return opened;
}
function ended(opened, outcome, at) {
  return { ...opened, endedAt: at, outcome };
}
var UNRECORDED = "a session was started and stopped: the opener's outbox could not record it";
var RULES2 = "Rules of a session opened by mail: you never merge, push to another branch, release or deploy; you never approve a full-route spec (crew await <id> user instead); you may send mail with crew mail send only within the hop limit; you end with the reply, nothing after it.";
function questionPrompt(message, projectName) {
  return [
    `You are answering mail ${message.id} from ${message.from.project} in project ${projectName}, as its engineer, through the WizardingCode Developer Crew plugin.`,
    `Read the message first: crew mail read ${message.id}. Read the code; change nothing. Answer the question from what the code and the documentation of this repository say, with file paths and lines where they help, and say plainly what you could not find.`,
    `Then reply with crew mail reply ${message.id} "<your answer>" (or --file <path> for a long answer). ${RULES2}`
  ].join(`

`);
}
function changePrompt(message, projectName, branch) {
  return [
    `You are building mail ${message.id} from ${message.from.project} in project ${projectName}, on branch ${branch}, through the WizardingCode Developer Crew plugin and its crew skill.`,
    `Read the message first: crew mail read ${message.id}. Then run the method: answer the nine typed questions and start a work item with crew start "<the request>" --answers '<json>' --origin ${message.id}; follow the route the engine gives (criteria, red, green, gates, the judgement gates); commit on this branch.`,
    `End with crew mail reply ${message.id} --branch ${branch} --item <the work item id> "<what is proven and what is not>". ${RULES2}`
  ].join(`

`);
}
function taskPrompt(parent, task, message, briefText, branch) {
  return [
    `You are the implementer of task ${task.task} of work item ${parent.id} ("${parent.title}"), in a worktree on branch ${branch}, through the WizardingCode Developer Crew plugin and its crew skill. The lead opened this task as mail ${message.id}.`,
    `The task: ${task.text}`,
    `Its criteria, from the lead's item: ${task.criteria.join(", ")}. The lead's brief follows between the lines.
---
${briefText?.trim() ?? "(no brief)"}
---`,
    `Start with crew start "${task.task} of ${parent.id}: ${task.text.split(`
`)[0]}" --answers '<json>' --origin ${message.id} and one --criterion per criterion the task covers, in the lead's words; follow the route the engine gives; commit on this branch; touch only the files the task names.`,
    `A question to the lead: crew mail send --to . --agent session --type question "<question>" then crew await <id> mail <message id>. A question to another task: --agent T-n. A question only the user can answer: crew await <id> user.`,
    `End with crew mail reply ${message.id} --branch ${branch} --item <your work item id> "<what is proven and what is not>". ${RULES2}`
  ].join(`

`);
}
function isAlive(pid) {
  if (!pid)
    return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
function psColumn(pid, column) {
  try {
    return execFileSync4("ps", ["-o", column, "-p", String(pid)], {
      encoding: "utf8",
      env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return "";
  }
}
function processStart(pid) {
  return psColumn(pid, "lstart=");
}
function pidState(opened) {
  if (opened.pid === null || processGone(opened.pid))
    return "gone";
  const start = processStart(opened.pid);
  return !start || !opened.processStart || start === opened.processStart ? "session" : "another";
}
function isSession(opened) {
  return pidState(opened) === "session";
}
function processGone(pid) {
  return !isAlive(pid) || psColumn(pid, "stat=").startsWith("Z");
}
function readOutcome(log) {
  const text = readText(log);
  if (!text)
    return { ended: false };
  for (const line of text.trim().split(`
`).reverse()) {
    try {
      const parsed = JSON.parse(line);
      if (!("result" in parsed) && !("session_id" in parsed))
        continue;
      const failed = parsed.is_error === true || typeof parsed.subtype === "string" && parsed.subtype !== "success";
      const reason = typeof parsed.subtype === "string" && parsed.subtype !== "success" ? parsed.subtype : typeof parsed.result === "string" && parsed.result.trim() ? parsed.result.trim().split(`
`)[0] : "an error result";
      return {
        ended: true,
        ...typeof parsed.num_turns === "number" ? { turns: parsed.num_turns } : {},
        ...typeof parsed.total_cost_usd === "number" ? { costUsd: parsed.total_cost_usd } : {},
        ...failed ? { error: reason } : {}
      };
    } catch {}
  }
  return { ended: false };
}
var KILL_WAIT_MS = 1000;
var KILL_STEP_MS = 50;
function killGroup(pid) {
  const signal = (name) => {
    try {
      process.kill(-pid, name);
    } catch {}
  };
  signal("SIGTERM");
  const until = Date.now() + KILL_WAIT_MS;
  while (!processGone(pid) && Date.now() < until)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, KILL_STEP_MS);
  signal("SIGKILL");
}
function minutesRun(opened, now = Date.now()) {
  return (now - Date.parse(opened.startedAt)) / 60000;
}
function minutesText(minutes) {
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
function unanswered(status) {
  return status === "sent" || status === "read";
}
function sweepOne(ctx, m, now, result) {
  const opened = m.opened;
  const at = new Date(now).toISOString();
  const settle = (kind, end, reason, line) => {
    const recorded = updateEverywhere(ctx, m.id, (x) => ({
      ...x,
      ...reason && unanswered(x.status) ? { status: "expired", reason } : {},
      opened: { ...ended(opened, end.outcome, at), ...end }
    }), (what) => result.lines.push(`the record of ${m.id} skipped a box it could not read: ${what}`));
    if (recorded === null) {
      result.lines.push(`the sweep could not record ${m.id}: no copy of the message was written`);
      return;
    }
    if (opened.mode === "branch")
      dropOpenedMarker(ctx.paths.userDir, opened.cwd);
    result[kind].push(m.id);
    result.lines.push(line);
  };
  const state = pidState(opened);
  if (state === "session") {
    if (minutesRun(opened, now) > opened.maxMinutes) {
      killGroup(opened.pid);
      const limit = minutesText(opened.maxMinutes);
      settle("expired", { outcome: "expired" }, `the session ran past ${limit} (mail.maxMinutes) and was stopped`, `${m.id} ran past ${limit} and was stopped (expired)`);
    }
    return;
  }
  const outcome = readOutcome(opened.log);
  const measured = {
    ...outcome.turns !== undefined ? { turns: outcome.turns } : {},
    ...outcome.costUsd !== undefined ? { costUsd: outcome.costUsd } : {}
  };
  if (outcome.ended && outcome.error) {
    settle("expired", { ...measured, outcome: "failed" }, `the session ended with ${outcome.error}`, `${m.id} ended with ${outcome.error} (expired)`);
    return;
  }
  if (outcome.ended) {
    const replied = !unanswered(m.status);
    settle("ended", { ...measured, outcome: "ended" }, replied ? null : "the session ended without a reply", replied ? `${m.id} ended (${outcome.turns ?? "?"} turns, ${outcome.costUsd ?? "?"} USD)` : `${m.id} ended without a reply (expired)`);
    return;
  }
  const remains = state === "another" ? "its pid is now another process's, and nothing of the session remains in its group" : `a member of its process group may remain (ps -g ${opened.pid})`;
  settle("expired", { outcome: "failed" }, "the session ended without a reply", `${m.id} is gone without a reply (expired); ${remains}`);
}
function sweepOpened(ctx, now = Date.now()) {
  const result = { ended: [], expired: [], lines: [] };
  if (ctx.self.openedBy)
    return result;
  const { messages, tampered } = readOpenSessions(ctx);
  if (tampered)
    result.lines.push(tampered);
  for (const m of messages) {
    try {
      sweepOne(ctx, m, now, result);
    } catch (error) {
      result.lines.push(`the sweep of ${m.id} failed: ${error.message.split(`
`)[0]}`);
    }
  }
  return result;
}
function sweepSafely(ctx, now = Date.now()) {
  try {
    return sweepOpened(ctx, now);
  } catch (error) {
    return {
      ended: [],
      expired: [],
      lines: [`the sweep failed: ${error.message.split(`
`)[0]}`]
    };
  }
}
function stopSession(ctx, id, notes) {
  if (ctx.self.openedBy)
    return { refused: `a session opened by mail (${ctx.self.openedBy}) stops no sessions` };
  const { messages, tampered } = readOpenSessions(ctx);
  if (tampered)
    return { refused: tampered };
  const m = messages.find((x) => x.id === id);
  if (!m?.opened)
    return { refused: `${id} has no session running` };
  if (!isSession(m.opened)) {
    const swept = { ended: [], expired: [], lines: [] };
    sweepOne(ctx, m, Date.now(), swept);
    return {
      refused: `${id} has no session running: it ${readOutcome(m.opened.log).ended ? "ended" : "is gone"}${swept.lines.length ? ` (${swept.lines.join("; ")})` : ""}`
    };
  }
  killGroup(m.opened.pid);
  if (m.opened.mode === "branch")
    dropOpenedMarker(ctx.paths.userDir, m.opened.cwd);
  const at = nowIso();
  return updateEverywhere(ctx, id, (x) => ({
    ...x,
    ...unanswered(x.status) ? { status: "stopped", reason: "stopped by crew mail stop" } : {},
    opened: ended(x.opened, "stopped", at)
  }), (what) => notes.push(`a copy of ${id} was not changed: ${what}`)) ?? {
    refused: `${id} was stopped but could not be updated: its mailbox changed while it was being written`
  };
}
function openForMail(ctx, fallback, message, delivery) {
  const dest = delivery.entry;
  const limits = (destinationPolicy(dest, ctx.env)?.policy ?? fallback).mail;
  let cwd = dest.root;
  let branch = null;
  let prompt = questionPrompt(message, dest.name);
  if (delivery.mode === "branch") {
    branch = `crew/mail/${message.id}`;
    cwd = worktreePath(dest.root, limits.worktrees, `mail-${message.id}`);
    const made = addWorktree(dest.root, branch, cwd);
    if (made) {
      dropBranch(dest.root, branch);
      return `could not open a session: ${made.failed}; queued`;
    }
    prompt = changePrompt(message, dest.name, branch);
  }
  const notes = [];
  const opened = openSession(ctx, {
    message,
    mode: delivery.mode,
    cwd,
    branch,
    prompt,
    maxTurns: limits.maxTurns,
    maxMinutes: limits.maxMinutes,
    hops: ctx.self.hops + 1,
    agent: "session",
    log: sessionLog(ctx, message.id)
  }, notes);
  const skipped = notes.length ? `; ${notes.join("; ")}` : "";
  if ("failed" in opened) {
    if (branch) {
      const kept = removeWorktree(dest.root, cwd);
      if (kept)
        return `could not open a session: ${opened.failed}; queued; the worktree ${cwd} is kept, with its branch ${branch}: ${kept.kept.replace(/,?\s*use --force[^.]*\.?$/, "")}${skipped}`;
      dropBranch(dest.root, branch);
    }
    return `could not open a session: ${opened.failed}; queued${skipped}`;
  }
  const bounds = `${opened.maxTurns} turns, ${minutesText(opened.maxMinutes)}`;
  return delivery.mode === "read-only" ? `read-only session opened (${opened.name}, pid ${opened.pid}, ${bounds})${skipped}` : `session opened on branch ${branch} (${opened.name}, pid ${opened.pid}, ${bounds})${skipped}`;
}

// packages/engine/src/hooks/context.ts
function refreshMail(ctx) {
  try {
    registerProject(ctx.mail, ctx.sessionId, { minIntervalMs: 2 * 60 * 1000, hook: true });
    return { newMail: syncMail(ctx.mail, ctx.paths).newMail, failed: null };
  } catch (error) {
    return { newMail: [], failed: error.message };
  }
}
function mailQuietly(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}
function sweepLines(ctx) {
  return sweepSafely(ctx.mail).lines;
}
function buildContext(payload, env = process.env) {
  const paths = resolvePaths(payload.cwd ?? process.cwd(), env);
  if (!paths)
    return null;
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  const mail = mailContext(paths, policy.policy, env);
  return {
    paths,
    sessionId: payload.session_id ?? "default",
    profile: profile.profile,
    policy: policy.policy,
    tampered: profile.tampered || policy.tampered,
    headless: env.CLAUDE_CODE_SESSION_ATTENDED === "0",
    mail,
    openedBy: mail.self.openedBy,
    openedBranch: mail.self.openedBranch,
    openedMode: mail.self.openedMode
  };
}

// packages/engine/src/hooks/notices.ts
function leaveNotice(ctx, text) {
  try {
    updateSession(ctx.paths, ctx.sessionId, (session) => {
      session.notices = [...session.notices ?? [], text];
    });
  } catch {}
}
function takeNotices(session) {
  const notices = session.notices ?? [];
  session.notices = [];
  return notices;
}

// packages/engine/src/hooks/post-tool-use.ts
function onPostToolUse(ctx, payload = {}) {
  if (payload.agent_id)
    return {};
  if (!sessionState(loadState(ctx.paths), ctx.sessionId).notices?.length)
    return {};
  const notices = updateSession(ctx.paths, ctx.sessionId, takeNotices);
  if (!notices.length)
    return {};
  return {
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notices.join(" ") }
  };
}

// packages/engine/src/hooks/pre-tool-use.ts
import { isAbsolute as isAbsolute3, join as join25, relative as relative5 } from "node:path";

// packages/engine/src/hooks/shell.ts
var SUBSTITUTED = "${…}";
var DESCRIPTOR = String.raw`\d+|\{\w+\}`;
var OPERATOR_PREFIX = `(?:${DESCRIPTOR}|&)?`;
var DOUBLE_QUOTE_ESCAPES = '$`"\\';
var OPERATOR_OWN = new RegExp(`^${OPERATOR_PREFIX}[<>]*$`);
var HEREDOC_OPERATOR = new RegExp(`^(?:${DESCRIPTOR})?<<(-?)(?!<)`);
var LEADING_KEYWORDS = ["if", "then", "else", "elif", "do", "while", "until", "!"];
var KEYWORDS_BEFORE = new Set([...LEADING_KEYWORDS, "{"]);
var COMMAND_LEADS = new Set([...KEYWORDS_BEFORE, "time", "coproc"]);
var MAX_DEPTH2 = 32;
var ANSI_ESCAPES = {
  a: "\x07",
  b: "\b",
  e: "\x1B",
  E: "\x1B",
  f: "\f",
  n: `
`,
  r: "\r",
  t: "\t",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "?": "?"
};
function ansiEscape(text, at) {
  const rest = text.slice(at);
  const fixed = ANSI_ESCAPES[rest.charAt(0)];
  if (fixed !== undefined)
    return { value: fixed, length: 1 };
  const code = /^x([0-9A-Fa-f]{1,2})|^u([0-9A-Fa-f]{1,4})|^U([0-9A-Fa-f]{1,8})|^([0-7]{1,3})/.exec(rest);
  if (code) {
    const digits = code[1] ?? code[2] ?? code[3] ?? code[4] ?? "0";
    const point = Number.parseInt(digits, code[4] !== undefined ? 8 : 16);
    if (point <= 1114111)
      return { value: String.fromCodePoint(point), length: code[0].length };
  }
  const control = /^c(.)/s.exec(rest);
  if (control)
    return {
      value: String.fromCharCode((control[1] ?? "@").toUpperCase().charCodeAt(0) ^ 64),
      length: 2
    };
  return { value: `\\${rest.charAt(0)}`, length: 1 };
}
function bracketEnd(text, open, close) {
  const opener = text.charAt(open);
  let depth = 1;
  let quote = null;
  for (let i = open + 1;i < text.length; i++) {
    const ch = text.charAt(i);
    if (quote !== null) {
      if (ch === "\\" && quote === '"')
        i++;
      else if (ch === quote)
        quote = null;
    } else if (ch === "\\")
      i++;
    else if (ch === "'" || ch === '"')
      quote = ch;
    else if (ch === opener)
      depth++;
    else if (ch === close && --depth === 0)
      return i + 1;
  }
  return -1;
}
function arithmeticEnd(text, open) {
  let depth = 0;
  for (let i = open;i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\\")
      i++;
    else if (ch === "'" || ch === '"')
      return -1;
    else if (ch === "(")
      depth++;
    else if (ch === ")" && --depth === 1)
      return text.charAt(i + 1) === ")" ? i + 2 : -1;
  }
  return -1;
}
function read(text, start, closer, depth) {
  const pieces = [];
  let unclosed = null;
  let tokens = [];
  let inner = [];
  let word = "";
  let from = 0;
  let started = false;
  let expands = false;
  let quote = null;
  let arm = "none";
  let armStart = 0;
  let subshells = 0;
  let cases = 0;
  let commandAt = 0;
  let piped = false;
  const heredocs = [];
  const begin = (i) => {
    if (started)
      return;
    started = true;
    from = i;
    word = "";
    expands = false;
  };
  const endWord = (i) => {
    if (!started)
      return;
    started = false;
    const raw = text.slice(from, i);
    tokens.push({ word, raw, from, to: i, expands });
    const lead = tokens.slice(commandAt, -1).every((t) => COMMAND_LEADS.has(t.raw));
    if (raw === "case" && lead)
      cases++;
    else if (raw === "esac" && cases > 0 && (lead && !piped || arm === "pattern" && tokens.length - 1 === armStart))
      cases--;
    const operator = HEREDOC_OPERATOR.exec(raw);
    const pending = heredocs[heredocs.length - 1];
    if (operator) {
      const delimiter2 = word.slice(operator[0].length);
      heredocs.push({
        delimiter: delimiter2 || null,
        strip: operator[1] === "-",
        expand: raw.slice(operator[0].length) === delimiter2,
        owner: tokens
      });
    } else if (pending && pending.delimiter === null) {
      pending.delimiter = word;
      pending.expand = raw === word;
    }
    const third = tokens[tokens.length - 3];
    if (raw === "in" && third?.raw === "case" && tokens.slice(0, -3).every((t) => KEYWORDS_BEFORE.has(t.raw))) {
      arm = "pattern";
      armStart = tokens.length;
    } else if (raw === "esac" && arm === "pattern")
      arm = "none";
  };
  const endPiece = (i) => {
    endWord(i);
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    if (first && last)
      pieces.push({ text: text.slice(first.from, last.to), tokens, inner, heredocs: [] });
    tokens = [];
    inner = [];
    armStart = 0;
    commandAt = 0;
    piped = false;
  };
  const readInside = (at, inside, into) => {
    if (depth >= MAX_DEPTH2) {
      unclosed ??= "a substitution";
      return text.length;
    }
    const frame = read(text, at, inside, depth + 1);
    into.push(...frame.pieces);
    unclosed ??= frame.unclosed;
    return frame.end;
  };
  const scanSubstitutions = (from2, to, into, nested = depth) => {
    for (let k = from2;k < to; k++) {
      const ch = text.charAt(k);
      const next = text.charAt(k + 1);
      if (ch === "\\")
        k++;
      else if (ch === "$" && next === "(") {
        const end = arithmeticAt(k + 1);
        if (end === -1)
          k = readInside(k + 2, ")", into) - 1;
        else if (nested >= MAX_DEPTH2) {
          unclosed ??= "a substitution";
          return;
        } else {
          scanSubstitutions(k + 3, end - 2, into, nested + 1);
          k = end - 1;
        }
      } else if ((ch === "<" || ch === ">") && next === "(")
        k = readInside(k + 2, ")", into) - 1;
      else if (ch === "`")
        k = readInside(k + 1, "`", into) - 1;
    }
  };
  const arithmeticAt = (open) => text.charAt(open) === "(" && text.charAt(open + 1) === "(" ? arithmeticEnd(text, open) : -1;
  const bodies = (at) => {
    let j = at;
    for (const { delimiter: delimiter2, strip, expand, owner } of heredocs.splice(0)) {
      const bodyFrom = j;
      let bodyTo = j;
      let body = "";
      while (j < text.length) {
        const lineEnd = text.indexOf(`
`, j);
        const line = text.slice(j, lineEnd === -1 ? text.length : lineEnd);
        const lineStart = j;
        j = lineEnd === -1 ? text.length : lineEnd + 1;
        if ((strip ? line.replace(/^\t+/, "") : line) === (delimiter2 ?? ""))
          break;
        body += `${line}
`;
        bodyTo = lineStart + line.length;
      }
      const piece = pieces.find((p) => p.tokens === owner);
      if (!piece)
        continue;
      piece.heredocs.push(body);
      if (expand)
        scanSubstitutions(bodyFrom, bodyTo, piece.inner);
    }
    return j;
  };
  const close = (i) => {
    endPiece(i);
    if (cases > 0)
      unclosed ??= "a case";
    return { pieces, end: i + 1, unclosed };
  };
  const openWord = (i) => started ? text.slice(from, i) : "";
  const endOperand = (i) => {
    if (started && !OPERATOR_OWN.test(openWord(i)))
      endWord(i);
  };
  const continuesOperator = (i) => {
    const open = openWord(i);
    return /[<>]$/.test(open) && OPERATOR_OWN.test(open);
  };
  const substitution = (i, opener, inside) => {
    begin(i);
    word += SUBSTITUTED;
    expands = true;
    return readInside(i + opener, inside, inner) - 1;
  };
  const expansion = (i, close2) => {
    begin(i);
    expands = true;
    const end = bracketEnd(text, i + 1, close2);
    if (end === -1) {
      unclosed ??= "an expansion";
      word += text.slice(i);
      return text.length - 1;
    }
    word += text.slice(i, end);
    scanSubstitutions(i + 2, end - 1, inner);
    return end - 1;
  };
  const arithmetic = (i, open, end) => {
    begin(i);
    expands = true;
    word += text.slice(i, end);
    scanSubstitutions(open + 2, end - 2, inner);
    return end - 1;
  };
  const expansionAt = (i) => {
    const next = text.charAt(i + 1);
    if (text.charAt(i) === "`")
      return substitution(i, 1, "`");
    if (next === "(") {
      const end = arithmeticAt(i + 1);
      return end !== -1 ? arithmetic(i, i + 1, end) : substitution(i, 2, ")");
    }
    if (next === "{")
      return expansion(i, "}");
    if (next === "[")
      return expansion(i, "]");
    return -1;
  };
  for (let i = start;i < text.length; i++) {
    const ch = text.charAt(i);
    const next = text.charAt(i + 1);
    if (closer === "`") {
      if (ch === "\\" && next === "`") {
        begin(i);
        word += "`";
        i++;
        continue;
      }
      if (ch === "`") {
        if (quote !== null)
          unclosed ??= "a quote";
        return close(i);
      }
    }
    if (quote === "$'") {
      if (ch === "'")
        quote = null;
      else if (ch === "\\" && i + 1 < text.length) {
        const decoded = ansiEscape(text, i + 1);
        word += decoded.value;
        i += decoded.length;
      } else
        word += ch;
    } else if (quote === "'") {
      if (ch === "'")
        quote = null;
      else
        word += ch;
    } else if (quote === '"') {
      if (ch === '"')
        quote = null;
      else if (ch === "\\" && next === `
`)
        i++;
      else if (ch === "\\" && i + 1 < text.length && DOUBLE_QUOTE_ESCAPES.includes(next))
        word += text.charAt(++i);
      else if (ch === "$" || ch === "`") {
        const opened = expansionAt(i);
        if (opened !== -1)
          i = opened;
        else {
          expands = true;
          word += ch;
        }
      } else
        word += ch;
    } else if (ch === "\\" && next === `
`) {
      i++;
    } else if (ch === "\\" && i + 1 < text.length) {
      begin(i);
      word += next;
      i++;
    } else if (ch === "'" || ch === '"') {
      begin(i);
      quote = ch;
    } else if (ch === "$" && next === "'") {
      begin(i);
      quote = "$'";
      i++;
    } else if (ch === "$" || ch === "`") {
      const opened = expansionAt(i);
      if (opened !== -1)
        i = opened;
      else {
        begin(i);
        expands = true;
        word += ch;
      }
    } else if ((ch === "<" || ch === ">") && next === "(") {
      endOperand(i);
      i = substitution(i, 2, ")");
    } else if (ch === "#" && !started) {
      while (i + 1 < text.length && text.charAt(i + 1) !== `
`)
        i++;
    } else if (ch === `
`) {
      endPiece(i);
      if (heredocs.length)
        i = bodies(i + 1) - 1;
    } else if (/\s/.test(ch)) {
      endWord(i);
    } else if (ch === ";") {
      endPiece(i);
      if (next === ";" || next === "&" || next === "|") {
        i++;
        arm = "pattern";
      } else
        arm = "none";
    } else if (ch === "|" || ch === "&") {
      if (ch === "&" && next === ">") {
        endWord(i);
        begin(i);
        word += ch;
      } else if (continuesOperator(i))
        word += ch;
      else if (arm === "pattern" && ch === "|")
        endWord(i);
      else {
        endPiece(i);
        piped = true;
      }
    } else if (ch === "(" && next === ")") {
      if (started)
        started = false;
      else
        tokens.pop();
      i++;
    } else if (ch === "(" && !started && arm !== "pattern" && arithmeticAt(i) !== -1) {
      const end = arithmeticAt(i);
      i = arithmetic(i, i, end);
      endWord(end);
    } else if (ch === "(") {
      if (!(arm === "pattern" && !started && tokens.length === armStart)) {
        endPiece(i);
        subshells++;
      }
    } else if (ch === ")") {
      endWord(i);
      if (arm === "pattern") {
        tokens.length = armStart;
        commandAt = armStart;
        arm = "none";
      } else if (subshells > 0) {
        subshells--;
        endPiece(i);
      } else if (closer === ")")
        return close(i);
      else
        endPiece(i);
    } else if (ch === "<" || ch === ">") {
      endOperand(i);
      begin(i);
      word += ch;
    } else {
      begin(i);
      word += ch;
    }
  }
  if (quote !== null)
    unclosed ??= "a quote";
  if (closer !== null)
    unclosed ??= "a substitution";
  endPiece(text.length);
  if (cases > 0)
    unclosed ??= "a case";
  if (heredocs.length)
    bodies(text.length);
  return { pieces, end: text.length, unclosed };
}
function readCommand(command) {
  const { pieces, unclosed } = read(command, 0, null, 0);
  return { pieces, unclosed };
}
function simpleCommands(command) {
  return readCommand(command).pieces.flatMap((p) => [
    p.text,
    ...p.heredocs.flatMap((body) => body.split(`
`).filter((line) => line !== ""))
  ]);
}

// packages/engine/src/hooks/pre-tool-use.ts
var WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var SHELL_NAMES = ["sh", "bash", "zsh", "dash", "ksh", "fish"];
var SHELLS = `(?:${SHELL_NAMES.join("|")})`;
var ENGINE_FILES = /\.crew\/(?:profile\.json|policy\.json|decisions\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|objections\.json|mail\.json|report\.md|logs\b))|\.wizardingcode\/crew\b/;
var WRITE_SHAPE = /(?:^|[\s;&|("'])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\|?\s*["']?\S*(?:\.crew\/|\.wizardingcode\/crew\b)/;
var OPAQUE_REDIRECT = />{1,2}\|?\s*["']?[$`]/;
var PROMPTLESS_MODES = new Set(["bypassPermissions", "dontAsk"]);
var CREW_COMMAND = /^(?:\S*\/)?crew(?:\.mjs)?$/;
var CREW_BUNDLE = /^(?:\S*\/)?crew\.mjs$/;
var JS_RUNNER = /^(?:\S*\/)?(?:node|bun)$/;
var READ_ONLY_VERBS = new Set(["status", "help"]);
var READ_ONLY_MAIL = new Set(["read", "inbox", "reply", "status"]);
var OPENER_VAR = /WIZARDINGCODE_\w+|CLAUDE_CODE_SESSION_ATTENDED/;
var UNSET = /(?:^|[\s;&|({])unset(?:\s+-\S+)*((?:\s+[^\s;&|]+)*)/;
var PLUS_X = /(?:^|[\s;&|({])(?:declare|typeset|export|readonly|local)\s+(?:[-+]\S+\s+)*\+\S*x\b((?:\s+[^\s;&|]+)*)/;
var SETTER = /(?:^|[\s;&|({])(?:(?:export|declare|typeset|readonly|local)(?:\s+-\S+)*|read(?:\s+-\S+)*|printf\s+-v)((?:\s+[^\s;&|]+)*)/;
var UNREADABLE_ASSIGNMENT = /(?:^|[\s;&|({])[^\s=;&|$\x60{*?[]*[$\x60{*?[][^\s=;&|]*=/;
var UNREADABLE_NAME = /^$|[$\x60{(*?[\]]/;
var CLEARED_ENVIRONMENT = /(?:^|[\s;&|({])(?:env(?:\s+-\S+)*\s+(?:-[A-Za-z]*[iS][A-Za-z]*|--ignore-environment|--split-string(?:=\S*)?|-)(?=\s|$)|exec\s+(?:-\S+\s+)*-[A-Za-z]*c\b)/;
function unreadablePath(word) {
  const lead = /^(?:~|\$\w+|\$\{[^}]*\})(?=\/|$)/.exec(word)?.[0] ?? (word.startsWith("/") ? "/" : "");
  if (!lead && !/(?:^|\/)\.\.(?:\/|$)/.test(word))
    return false;
  return /[*?[{$\x60]/.test(word.slice(lead.length));
}
function unreadableNames(words, allowEmpty = false) {
  const names = words.trim().split(/\s+/).filter(Boolean).map((n) => n.split("=")[0] ?? "");
  return !allowEmpty && !names.length || names.some((n) => UNREADABLE_NAME.test(n));
}
function variableDenial(cleaned) {
  if (CLEARED_ENVIRONMENT.test(cleaned))
    return "a cleared environment";
  const unset = UNSET.exec(cleaned);
  if (unset && unreadableNames(unset[1] ?? ""))
    return "unset";
  const plusX = PLUS_X.exec(cleaned);
  if (plusX && unreadableNames(plusX[1] ?? ""))
    return "declare +x";
  const setter = SETTER.exec(cleaned);
  if (setter && unreadableNames(setter[1] ?? "", true)) {
    const word = setter[0].trim().split(/\s+/)[0] ?? "";
    return word === "read" ? "read" : word === "printf" ? "printf -v" : "export";
  }
  if (UNREADABLE_ASSIGNMENT.test(cleaned))
    return "an assignment";
  return null;
}
var KEYWORDS = [...LEADING_KEYWORDS, "fi", "done", "in", "esac"];
var WRAPPERS = [
  { name: "function", valued: "", longValued: [], positionals: 1 },
  { name: "case", valued: "", longValued: [], positionals: 1 },
  { name: "nice", valued: "n", longValued: ["--adjustment"], positionals: 0 },
  {
    name: "timeout",
    valued: "sk",
    longValued: ["--signal", "--kill-after"],
    positionals: 1
  },
  { name: "stdbuf", valued: "ioe", longValued: ["--input", "--output", "--error"], positionals: 0 },
  {
    name: "flock",
    valued: "w",
    longValued: ["--wait", "--timeout", "--conflict-exit-code"],
    positionals: 1,
    scriptOptions: ["-c", "--command"]
  },
  {
    name: "script",
    valued: "FtEBIOomT",
    longValued: [
      "--echo",
      "--log-in",
      "--log-out",
      "--log-io",
      "--log-timing",
      "--logging-format",
      "--output-limit"
    ],
    positionals: 1,
    scriptOptions: ["-c", "--command"]
  },
  {
    name: "su",
    valued: "gGsw",
    longValued: ["--group", "--supp-group", "--shell", "--whitelist-environment"],
    positionals: 1,
    scriptOptions: ["-c", "--command", "--session-command"]
  },
  {
    name: "sudo",
    valued: "ugpChDTrt",
    longValued: [
      "--user",
      "--group",
      "--prompt",
      "--close-from",
      "--host",
      "--chdir",
      "--command-timeout",
      "--role",
      "--type",
      "--other-user"
    ],
    positionals: 0
  },
  { name: "doas", valued: "uC", longValued: [], positionals: 0 },
  {
    name: "env",
    valued: "uCPLU",
    longValued: ["--unset", "--chdir", "--block-signal", "--default-signal", "--ignore-signal"],
    positionals: 0,
    assignments: true,
    scriptOptions: ["-S", "--split-string"],
    unsetOptions: ["-u", "--unset"]
  },
  { name: "exec", valued: "a", longValued: [], positionals: 0 },
  {
    name: "xargs",
    valued: "nILPdEsa",
    longValued: [
      "--max-args",
      "--replace",
      "--max-lines",
      "--max-procs",
      "--delimiter",
      "--eof",
      "--max-chars",
      "--arg-file",
      "--process-slot-var"
    ],
    positionals: 0
  },
  { name: "nohup", valued: "", longValued: [], positionals: 0 },
  { name: "time", valued: "fo", longValued: ["--format", "--output"], positionals: 0 },
  { name: "command", valued: "", longValued: [], positionals: 0 },
  { name: "builtin", valued: "", longValued: [], positionals: 0 },
  { name: "caffeinate", valued: "tw", longValued: [], positionals: 0 },
  {
    name: "ionice",
    valued: "cnp",
    longValued: ["--class", "--classdata", "--pid"],
    positionals: 0
  },
  { name: "noglob", valued: "", longValued: [], positionals: 0 },
  { name: "nocorrect", valued: "", longValued: [], positionals: 0 },
  { name: "coproc", valued: "", longValued: [], positionals: 0, namedBlock: true }
];
var WRAPPER_BY_NAME = new Map(WRAPPERS.map((w) => [w.name, w]));
var JS_RUNNER_VALUED = new Set([
  "-r",
  "--require",
  "--import",
  "--loader",
  "--experimental-loader",
  "-e",
  "--eval",
  "-p",
  "--print",
  "--env-file",
  "--conditions",
  "-C",
  "--input-type",
  "--max-old-space-size",
  "--title",
  "--inspect-port",
  "--cwd",
  "--preload",
  "--define",
  "-d",
  "--port",
  "--config",
  "-c"
]);
var ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
var BRACKETS = ["{", "}"];
function takesNext(wrapper, option) {
  if (option.includes("="))
    return false;
  if (option.startsWith("--"))
    return wrapper.longValued.includes(option);
  for (let i = 1;i < option.length; i++)
    if (wrapper.valued.includes(option.charAt(i)))
      return i === option.length - 1;
  return false;
}
function optionValue(wrapper, names, option, next) {
  if (!names.length || option === "-" || option === "--")
    return null;
  if (option.startsWith("--")) {
    const [name, attached] = option.split(/=(.*)/s, 2);
    return names.includes(name ?? "") ? attached ?? next ?? "" : null;
  }
  for (let i = 1;i < option.length; i++) {
    const letter = option.charAt(i);
    if (names.includes(`-${letter}`))
      return option.slice(i + 1) || next || "";
    if (wrapper.valued.includes(letter))
      return null;
  }
  return null;
}
function withoutLead(words) {
  let i = 0;
  let viaXargs = false;
  let firstWrapper;
  const unsets = [];
  while (i < words.length) {
    const w = words[i] ?? "";
    const wrapper = WRAPPER_BY_NAME.get(w.replace(/^.*\//, ""));
    if (ASSIGNMENT.test(w) || KEYWORDS.includes(w) || BRACKETS.includes(w))
      i++;
    else if (wrapper) {
      viaXargs ||= wrapper.name === "xargs";
      firstWrapper ??= wrapper.name;
      i++;
      let positionals = wrapper.positionals;
      for (;; ) {
        const word = words[i] ?? "";
        if (i < words.length && word.startsWith("-")) {
          const script = optionValue(wrapper, wrapper.scriptOptions ?? [], word, words[i + 1]);
          if (script !== null)
            return { words: [], viaXargs, unsets, firstWrapper, script };
          const unset = optionValue(wrapper, wrapper.unsetOptions ?? [], word, words[i + 1]);
          if (unset !== null)
            unsets.push(unset);
          i++;
          if (takesNext(wrapper, word))
            i++;
        } else if (i < words.length && wrapper.assignments && ASSIGNMENT.test(word))
          i++;
        else if (i < words.length && positionals > 0) {
          positionals--;
          i++;
        } else
          break;
      }
      if (wrapper.namedBlock && /^\w+$/.test(words[i] ?? "") && (words[i + 1] ?? "").startsWith("{"))
        i++;
    } else
      break;
  }
  const rest = words.slice(i);
  if (rest.length) {
    const last = rest.length - 1;
    rest[last] = (rest[last] ?? "").replace(/}+$/, "") || (rest[last] ?? "");
  }
  return { words: rest, viaXargs, unsets, firstWrapper };
}
var REDIRECT_OPERATOR = new RegExp(`^${OPERATOR_PREFIX}[<>]{1,2}(?![<>])[&|]?`);
var HERE_STRING_OPERATOR = new RegExp(`^${OPERATOR_PREFIX}<<<`);
var PROCESS_SUBSTITUTION = /^[<>]\(/;
function redirectOperator(raw) {
  if (PROCESS_SUBSTITUTION.test(raw))
    return;
  return (HERE_STRING_OPERATOR.exec(raw) ?? REDIRECT_OPERATOR.exec(raw))?.[0];
}
function withoutRedirects(tokens) {
  const kept = [];
  for (let i = 0;i < tokens.length; i++) {
    const { word, raw } = tokens[i] ?? { word: "", raw: "" };
    if (raw.startsWith("(("))
      continue;
    const operator = redirectOperator(raw);
    if (operator === undefined)
      kept.push(word);
    else if (raw.length <= operator.length)
      i++;
  }
  return kept;
}
var NPX_RUNNER = /^(?:\S*\/)?(?:npx|bunx)$/;
var NPX_CALL = ["-c", "--call"];
var NPX_VALUED = new Set(["-p", "--package", ...NPX_CALL, "--shell", "--loglevel"]);
var RUNNER_VALUED = { js: JS_RUNNER_VALUED, npx: NPX_VALUED };
function runnerOptions(words, kind) {
  const valued = RUNNER_VALUED[kind];
  let call = null;
  let i = 1;
  for (;i < words.length && (words[i] ?? "").startsWith("-"); i++) {
    const option = words[i] ?? "";
    const [name, attached] = option.split(/=(.*)/s, 2);
    if (kind === "npx" && NPX_CALL.includes(name ?? ""))
      call ??= attached ?? words[i + 1] ?? "";
    if (attached === undefined && valued.has(option))
      i++;
  }
  return { end: i, call };
}
function crewArgs(words) {
  const [first] = words;
  if (first === undefined)
    return null;
  if (CREW_COMMAND.test(first))
    return words.slice(1);
  const kind = JS_RUNNER.test(first) ? "js" : NPX_RUNNER.test(first) ? "npx" : null;
  if (kind) {
    const { end } = runnerOptions(words, kind);
    const target = words[end] ?? "";
    if (kind === "js" ? CREW_BUNDLE.test(target) : target === "crew")
      return words.slice(end + 1);
  }
  return null;
}
function commandOf({ text, tokens, inner, heredocs }) {
  const lead = withoutLead(withoutRedirects(tokens));
  const args = crewArgs(lead.words);
  return {
    ...lead,
    piece: text,
    tokens,
    inner,
    heredocs,
    program: (lead.words[0] ?? "").replace(/^.*\//, ""),
    args: args ? args.flatMap(splitFlagValue) : null
  };
}
var SHELL_VALUED = new Set(["-o", "+o", "-O", "+O", "--rcfile", "--init-file"]);
function shellScript(program, words) {
  if (!SHELL_NAMES.includes(program) || !words.some((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w)))
    return null;
  for (let i = 1;i < words.length; i++) {
    const w = words[i] ?? "";
    if (w === "--")
      return words[i + 1] ?? "";
    if (!/^[-+]/.test(w))
      return w;
    if (SHELL_VALUED.has(w))
      i++;
  }
  return "";
}
var WATCH_VALUED = new Set(["-n", "--interval"]);
function handedOn({ program, words, script, tokens, heredocs }) {
  if (script !== undefined)
    return script;
  const shell = shellScript(program, words);
  if (shell !== null)
    return shell;
  if (SHELL_NAMES.includes(program)) {
    const here = tokens.findIndex((t) => HERE_STRING_OPERATOR.test(t.raw));
    const operator = HERE_STRING_OPERATOR.exec(tokens[here]?.raw ?? "")?.[0];
    if (operator !== undefined)
      return tokens.slice(here).map((t) => t.word).join(" ").slice(operator.length).trim();
    if (heredocs.length)
      return heredocs.join(`
`);
  }
  if (program === "eval")
    return words.slice(1).join(" ");
  if (program === "trap")
    return words.slice(1).find((w) => !w.startsWith("-")) ?? "";
  const exec = words.findIndex((w) => /^-(?:exec|execdir|ok|okdir)$/.test(w));
  if (program === "find" && exec !== -1)
    return words.slice(exec + 1).filter((w) => w !== ";" && w !== "+").join(" ");
  if (NPX_RUNNER.test(program))
    return runnerOptions(words, "npx").call;
  if (program === "watch") {
    let i = 1;
    for (;i < words.length && (words[i] ?? "").startsWith("-"); i++)
      if (WATCH_VALUED.has(words[i] ?? ""))
        i++;
    return words.slice(i).join(" ");
  }
  return null;
}
function walk(command) {
  const found = [];
  let unreadable = null;
  const pieces = (text) => {
    const reading = readCommand(text);
    unreadable ??= reading.unclosed;
    return reading.pieces;
  };
  const visit = (read2, inherited) => {
    for (const piece of read2) {
      const command2 = commandOf(piece);
      const viaXargs = inherited || command2.viaXargs;
      const handed = handedOn(command2);
      found.push({ ...command2, viaXargs, handed });
      visit(piece.inner, viaXargs);
      if (handed !== null)
        visit(pieces(handed), viaXargs);
    }
  };
  visit(pieces(command), false);
  return { found, unreadable };
}
function crewCommandsOf(found) {
  return found.flatMap((c) => c.args ? [{ args: c.args, viaXargs: c.viaXargs }] : []);
}
function splitFlagValue(word) {
  const match = /^(--[\w-]+)=(.*)$/.exec(word);
  return match ? [match[1] ?? "", match[2] ?? ""] : [word];
}
var UNREADABLE_VERB = /[$\x60*?[{]/;
function userOnlyCommand(args) {
  const parsed = parse(args);
  if (parsed.flags.help === true || parsed.positional.includes("-h"))
    return null;
  const [verb, second] = parsed.positional;
  const unreadable = (word) => word !== undefined && UNREADABLE_VERB.test(word);
  const userOnly = unreadable(verb) || (verb === "profile" || verb === "policy") && unreadable(second) || verb === "skip" || verb === "approve" || verb === "accept" || verb === "decide" || verb === "continue" || verb === "objection" && parsed.positional.includes("waive") || verb === "profile" && (second === "confirm" || second === "set") || verb === "policy" && (second === "accept" || second === "set") || verb === "task" && parsed.positional.includes("merge") && parsed.flags.force === true;
  if (!userOnly)
    return null;
  return {
    parsed,
    policyCommand: verb === "policy" || verb === "accept" && second === "policy"
  };
}
var QUOTES = /["'\\]/g;
var BIN = String.raw`^(?:\S*/)?`;
var verbEntry = (re, what) => ({
  re: new RegExp(`${BIN}${re}`),
  what
});
var EXPANSION_CHARS = String.raw`$\x60`;
var PATTERN_CHARS = String.raw`{[(*?`;
var UNREADABLE_WORD = String.raw`\S*[${EXPANSION_CHARS}${PATTERN_CHARS}]`;
var GIT_CMD = String.raw`${BIN}git\s+`;
var GIT_OPTS = String.raw`(?:-\S+(?:\s+\S+)?\s+)`;
var GIT = `${GIT_CMD}${GIT_OPTS}*`;
var SETTING = String.raw`(?:alias\.|push\.followTags|remote\.[^\s=]+\.(?:push|mirror)|url\.[^\s=]+\.(?:push)?insteadOf)`;
var GIT_CONFIG_ENV = /(?:^|\s)GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)=/;
var OPENED_VERBS = [
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?-C\\s`), what: "git -C" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--git-dir(?:=|\\s)`), what: "git --git-dir" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--work-tree(?:=|\\s)`), what: "git --work-tree" },
  { re: new RegExp(`${GIT}merge(?![\\w-])`), what: "git merge" },
  { re: new RegExp(`${GIT}pull\\b`), what: "git pull" },
  { re: new RegExp(`${GIT}clean\\b`), what: "git clean" },
  {
    re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?${UNREADABLE_WORD}`),
    what: "git with an expansion or a pattern as its verb"
  },
  verbEntry(String.raw`(?:gh|npm|docker|netlify|fly|kubectl|terraform|aws|gcloud|serverless|sam|cap|crew(?:\.mjs)?)\s+(?:-\S+\s+)*${UNREADABLE_WORD}`, "a verb that is an expansion or a pattern"),
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?-c\\s*${SETTING}`, "i"), what: "git -c" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--config-env\\b`), what: "git --config-env" },
  { re: new RegExp(`${GIT}config\\b.*\\b${SETTING}`, "i"), what: "git config" },
  { re: new RegExp(`${GIT}subtree\\s+push\\b`), what: "git subtree push" },
  { re: new RegExp(`${GIT}send-pack\\b`), what: "git send-pack" },
  { re: new RegExp(`${GIT}http-push\\b`), what: "git http-push" },
  { re: new RegExp(`${GIT}svn\\s+dcommit\\b`), what: "git svn dcommit" },
  { re: new RegExp(`${GIT}p4\\s+submit\\b`), what: "git p4 submit" },
  verbEntry(String.raw`gh\s+release\b`, "gh release"),
  verbEntry(String.raw`gh\s+pr\s+merge\b`, "gh pr merge"),
  verbEntry(String.raw`gh\s+repo\s+sync\b`, "gh repo sync"),
  verbEntry(String.raw`gh\s+alias\s+(?:set|import|delete)\b`, "gh alias"),
  verbEntry(String.raw`gh\s+api\s(?:.*\s)?(?:(?:-X\s*|--method(?:=|\s+))(?!GET\b)\S|-[fF]|--(?:field|raw-field|input)(?:=|\s))`, "gh api write"),
  verbEntry(String.raw`gh\s+workflow\s+run\b`, "gh workflow run"),
  verbEntry(String.raw`npm\s+publish\b`, "npm publish"),
  verbEntry(String.raw`docker\s+push\b`, "docker push"),
  verbEntry(String.raw`vercel\b`, "vercel"),
  verbEntry(String.raw`netlify\s+deploy\b`, "netlify deploy"),
  verbEntry(String.raw`fly\s+deploy\b`, "fly deploy"),
  verbEntry(String.raw`kubectl\s+(?:apply|rollout)\b`, "kubectl"),
  verbEntry(String.raw`terraform\s+apply\b`, "terraform apply"),
  verbEntry(String.raw`aws\s+deploy\b`, "aws deploy"),
  verbEntry(String.raw`gcloud\s+.*\bdeploy\b`, "gcloud deploy"),
  verbEntry(String.raw`heroku\b`, "heroku"),
  verbEntry(String.raw`ansible-playbook\b`, "ansible-playbook"),
  verbEntry(String.raw`cap\s+\S+\s+deploy\b`, "cap deploy"),
  verbEntry(String.raw`serverless\s+deploy\b`, "serverless deploy"),
  verbEntry(String.raw`sam\s+deploy\b`, "sam deploy")
];
var PUSH = new RegExp(`${GIT}push\\b(.*)$`);
var PUSH_WIDE = [
  "--all",
  "--mirror",
  "--delete",
  "--prune",
  "--branches",
  "--tags",
  "--follow-tags",
  "--recurse-submodules"
];
function widensPush(word) {
  if (!word.startsWith("--"))
    return /^-[A-Za-z]*d/.test(word);
  const [name, value] = word.split("=", 2);
  if (!name || name.length <= 2 || !PUSH_WIDE.some((o) => o.startsWith(name)))
    return false;
  return !("--recurse-submodules".startsWith(name) && value === "no");
}
var INTERPRETER_STDIN = new RegExp(String.raw`^(?:\S*/)?${SHELLS}(?:\s+-{1,2}[A-Za-z]*)*$`);
var UNREADABLE = "the guard cannot read";
var VAR_ROOT_PATH = new RegExp(String.raw`^(?:\$\{[^}]*\}|\$\w+)(?:/[^\s${EXPANSION_CHARS}${PATTERN_CHARS}}\])]+)+$`);
var EXPANSION = new RegExp(`[${EXPANSION_CHARS}]`);
var PATTERN = new RegExp(`[${PATTERN_CHARS}]`);
function commandWordDenial(head) {
  const word = /^\S*/.exec(head)?.[0] ?? "";
  if (!word || VAR_ROOT_PATH.test(word) || /^\[\[?$/.test(word))
    return null;
  if (EXPANSION.test(word))
    return "an expansion in the command position";
  if (PATTERN.test(word))
    return "a pattern in the command position";
  return null;
}
var REMOTE_PATH = new RegExp(String.raw`[:/@${EXPANSION_CHARS}${PATTERN_CHARS}}\]]|^\.\.?$`);
function normalizeTool(command) {
  return command.replace(/^\S+/, (word) => word.toLowerCase()).replace(/^(\S*\/)?git-(?=[a-z])/, "$1git ");
}
function readOnlyShapeDenial({ inner, tokens }, withExpansions = true) {
  if (inner.length)
    return "a substitution";
  if (tokens.some((t) => HERE_STRING_OPERATOR.test(t.raw)))
    return "a here-string";
  if (tokens.some((t) => redirectOperator(t.raw) !== undefined))
    return "a redirect";
  if (withExpansions && tokens.some((t) => t.expands))
    return "an expansion";
  return null;
}
function judgeCommand(command, branch) {
  for (const { re, what } of OPENED_VERBS)
    if (re.test(command))
      return what;
  const push = PUSH.exec(command);
  if (!push)
    return null;
  if (!branch)
    return "git push";
  const words = (push[1] ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.some(widensPush))
    return "git push";
  const [remote, ...refspecs] = words.filter((w) => !w.startsWith("-"));
  if (!remote || REMOTE_PATH.test(remote))
    return "git push";
  const own = new Set([branch, `HEAD:${branch}`, `${branch}:${branch}`]);
  if (refspecs.length === 0 || refspecs.some((r) => !own.has(r)))
    return "git push";
  return null;
}
function openedSessionDenial(command, branch, walked = walk(command)) {
  if (walked.unreadable)
    return `${walked.unreadable} ${UNREADABLE}`;
  if (GIT_CONFIG_ENV.test(command.replace(QUOTES, "")))
    return "GIT_CONFIG_* in the environment";
  const pieces = walked.found.map(({ words, handed }) => ({
    text: normalizeTool(words.join(" ")),
    handed
  }));
  for (const { text, handed } of pieces) {
    if (!text)
      continue;
    if (handed === null && INTERPRETER_STDIN.test(text))
      return "an interpreter reading its script from its input";
    const denied = judgeCommand(text, branch);
    if (denied)
      return denied;
  }
  for (const { text } of pieces) {
    const unreadableWord = text ? commandWordDenial(text) : null;
    if (unreadableWord)
      return unreadableWord;
  }
  return null;
}
function unwatched(headless, permissionMode) {
  const mode = permissionMode ?? "default";
  if (headless)
    return `a headless session in ${mode} mode`;
  return PROMPTLESS_MODES.has(mode) ? `${mode} mode` : null;
}
function userOnlyDecision(command, permissionMode, headless, policy) {
  const { parsed, policyCommand } = command;
  const flagged = typeof parsed.flags.mode === "string" ? parsed.flags.mode : undefined;
  const mode = permissionMode ?? "default";
  const where = unwatched(headless, permissionMode);
  if (where) {
    if (flagged === mode)
      return null;
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
  if (typeof parsed.flags.validator === "string")
    return null;
  if (policy.attendedDecisions === "relay" && !policyCommand)
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
    const abs = canonical(isAbsolute3(filePath) ? filePath : join25(ctx.paths.root, filePath));
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
    const walked = walk(command);
    const { found } = walked;
    const crewCommands = crewCommandsOf(found);
    if (ctx.openedBy) {
      const cleanedCommand = command.replace(QUOTES, "");
      const opened = `Crew: this session was opened by mail (${ctx.openedBy})`;
      const never = `${opened} and never merges, pushes to another branch, releases or deploys`;
      const ending = `it ends with crew mail reply ${ctx.openedBy} --branch ${ctx.openedBranch ?? "<branch>"} --item <child id>`;
      const variables = `${opened} and the opener's variables are not its to change`;
      const named2 = OPENER_VAR.exec(cleanedCommand)?.[0];
      if (named2)
        return answer("deny", `${variables}: ${named2} is denied`);
      for (const { piece, unsets } of found) {
        const what = variableDenial(piece.replace(QUOTES, "")) ?? (unsets.length && unreadableNames(unsets.join(" ")) ? "env -u" : null);
        if (what)
          return answer("deny", `${variables}: ${what} is denied`);
      }
      const denied = openedSessionDenial(command, ctx.openedBranch, walked);
      if (denied)
        return answer("deny", `${never}: ${denied} is denied; ${ending}`);
      const stays = `${opened} and stays in its checkout`;
      for (const { program, words, handed, tokens } of found) {
        if (program === "cd" || program === "pushd") {
          const target = words.slice(1).find((w) => !w.startsWith("-")) ?? "";
          if (!target || /^[/~$`-]|^\.\.(?:\/|$)|\.\.\//.test(target) || /[*?[{(]/.test(target))
            return answer("deny", `${stays}: ${[program, ...words.slice(1)].join(" ")} is denied`);
        }
        if (tokens.some((t) => /^CDPATH\+?=/.test(t.word)))
          return answer("deny", `${stays}: CDPATH is denied`);
        const named3 = tokens.filter((t) => handed === null || t.word !== handed && !HERE_STRING_OPERATOR.test(t.raw)).map((t) => t.word).flatMap((w) => ASSIGNMENT.test(w) ? [w, w.slice(w.indexOf("=") + 1)] : [w]);
        for (const w of named3) {
          if (w.includes(ctx.paths.userDir) || /(?:^|\/)\.wizardingcode(?:\/|$)/.test(w))
            return answer("deny", `${stays}: the engine's folder ${w} is denied`);
          if (unreadablePath(w))
            return answer("deny", `${stays}: ${w} cannot be read and may reach the engine's folder; it is denied`);
        }
      }
      for (const { args } of crewCommands) {
        const { positional } = parse(args);
        const verb = positional[0];
        if (verb === "task" && positional.includes("merge"))
          return answer("deny", `${never}: crew task merge is denied; ${ending}`);
        if (verb === "task" && positional.includes("open"))
          return answer("deny", `${opened} and opens no tasks of its own: crew task open is denied`);
        if (verb === "mail" && positional[1] === "stop")
          return answer("deny", `${opened} and stops no sessions: crew mail stop is denied`);
        if (verb === "approve") {
          const id = positional[1];
          if (id && loadWork(ctx.paths, id).work?.route === "full")
            return answer("deny", `${opened} and a full-route spec waits for a person: crew approve ${id} is denied; run crew await ${id} user and end the turn`);
        }
      }
      if (ctx.openedMode === "read-only") {
        const readOnly = `Crew: this read-only session was opened by mail (${ctx.openedBy})`;
        const reads = `it reads with the Read, Grep and Glob tools and ends with crew mail reply ${ctx.openedBy} "<text>"`;
        const runsNo = `${readOnly} and runs no shell command but crew`;
        for (const current of found) {
          const { program, args, firstWrapper } = current;
          if (!args) {
            const lead = program || firstWrapper;
            const bare = lead ? null : readOnlyShapeDenial(current, false);
            if (bare)
              return answer("deny", `${runsNo}: ${bare} is denied; ${reads}`);
            if (!lead)
              continue;
            return answer("deny", `${runsNo}: ${lead} is denied; ${reads}`);
          }
          const shape = readOnlyShapeDenial(current);
          if (shape)
            return answer("deny", `${runsNo}: ${shape} is denied; ${reads}`);
          const [verb, second] = parse(args).positional;
          const allowed = !verb || READ_ONLY_VERBS.has(verb) || verb === "mail" && (!second || READ_ONLY_MAIL.has(second));
          if (!allowed)
            return answer("deny", `${readOnly} and may only read and reply: crew ${verb}${verb === "mail" && second ? ` ${second}` : ""} is denied; it ends with crew mail reply ${ctx.openedBy} "<text>"`);
        }
      }
    }
    let asked = null;
    for (const { args, viaXargs } of crewCommands) {
      if (viaXargs)
        return answer("deny", "Crew: a crew command whose words come from xargs' input cannot be read; write the command out");
      const userOnly = userOnlyCommand(args);
      if (!userOnly)
        continue;
      const decided = userOnlyDecision(userOnly, payload.permission_mode, ctx.headless, ctx.policy);
      if (decided?.[0] === "deny")
        return answer(...decided);
      asked ??= decided;
    }
    for (const piece of simpleCommands(command)) {
      if (ENGINE_FILES.test(piece) && WRITE_SHAPE.test(piece) || OPAQUE_REDIRECT.test(piece) && ENGINE_FILES.test(command)) {
        return answer("deny", "Crew: files under .crew/ and ~/.wizardingcode/crew that the engine owns are written only by the crew command");
      }
    }
    if (walked.unreadable) {
      const what = `${walked.unreadable} ${UNREADABLE}: the shell refuses such a line or runs what the hook could not see`;
      const where = unwatched(ctx.headless, payload.permission_mode);
      if (where)
        return answer("deny", `Crew: ${what}, and no person is watching this session (${where}); write the command so that the hook can read it`);
      return answer("ask", `Crew: ${what}, so a person decides`);
    }
    if (asked)
      return answer(...asked);
  }
  return {};
}

// packages/engine/src/tasks.ts
import { cpSync, existsSync as existsSync5 } from "node:fs";
import { join as join26 } from "node:path";
function shortId(workId) {
  return workId.slice(0, 14);
}
function taskNames(workId, repoRoot, task, worktrees) {
  const short = shortId(workId);
  return {
    branch: `crew/${short}/${task}`,
    worktree: worktreePath(repoRoot, worktrees, `${short}-${task}`)
  };
}
function taskText(planText, task) {
  if (!planText)
    return null;
  const n = task.slice(2);
  const lines = planText.split(`
`);
  for (let i = 0;i < lines.length; i++) {
    const line = lines[i] ?? "";
    const numbered = new RegExp(`^${n}\\.\\s+(.*)$`).exec(line);
    if (numbered) {
      const parts = [numbered[1] ?? ""];
      for (let j = i + 1;j < lines.length && /^\s+\S/.test(lines[j] ?? ""); j++)
        parts.push((lines[j] ?? "").trim());
      return parts.join(`
`).trim();
    }
    if (new RegExp(`^#{1,6}\\s*(?:T-${n}|Task ${n})\\b`).test(line)) {
      const parts = [];
      for (let j = i + 1;j < lines.length && !/^#{1,6}\s/.test(lines[j] ?? ""); j++)
        parts.push(lines[j] ?? "");
      return parts.join(`
`).trim() || null;
    }
  }
  return null;
}
function dirtyWatched(root, profile) {
  return (gitChangedPaths(root) ?? []).filter((p) => isWatched(p, profile));
}
function openTask(ctx, env, work, task, criteria, text) {
  if (ctx.self.openedBy)
    return { refused: `a session opened by mail (${ctx.self.openedBy}) opens no tasks of its own` };
  if (!isGitRepo(env.paths.root) || gitHead(env.paths.root) === "none")
    return { refused: "a task needs a git repository with a commit to branch from" };
  if (!/^T-\d+$/.test(task))
    return { refused: `a task is named T-n, not ${task}` };
  const unknown = criteria.find((c) => !work.criteria.some((k) => k.id === c));
  if (unknown)
    return { refused: `unknown criterion: ${unknown}` };
  const existing = (work.tasks ?? []).find((t) => t.task === task);
  if (existing)
    return {
      refused: `${task} is already open (message ${existing.message}, branch ${existing.branch})`
    };
  const open = openIn(ctx.paths.userDir, ctx.self.workspace, ctx.self.project);
  const max = env.policy.mail.maxConcurrent;
  if (open >= max)
    return {
      refused: `${open} session${open === 1 ? "" : "s"} open in ${ctx.self.project} (mail.maxConcurrent ${max}); wait for ${open === 1 ? "it" : "one"} to end, or stop ${open === 1 ? "it" : "one"} with crew mail stop`
    };
  const dirty = dirtyWatched(env.paths.root, env.profile);
  if (dirty.length)
    return {
      refused: `uncommitted changes in ${dirty.join(", ")}; commit what the implementer must see, then open the task`
    };
  const body = text?.trim() || taskText(readText(join26(workDir(env.paths, work.id), "plan.md")), task);
  if (!body)
    return { refused: `plan.md names no task ${task}; give its text with --text "<task>"` };
  const names = taskNames(work.id, env.paths.root, task, env.policy.mail.worktrees);
  if (existsSync5(names.worktree))
    return { refused: `${names.worktree} exists; remove it or pick another task number` };
  let branches;
  try {
    branches = gitRun(env.paths.root, "branch", "--list", names.branch);
  } catch (error) {
    return { refused: `the branches of ${env.paths.root} cannot be read: ${gitError(error)}` };
  }
  if (branches)
    return { refused: `branch ${names.branch} exists; delete it or pick another task number` };
  const record = {
    task,
    message: "",
    criteria,
    text: body,
    branch: names.branch,
    worktree: names.worktree,
    openedAt: nowIso()
  };
  work.tasks = [...work.tasks ?? [], record];
  const sent = send(ctx, {
    to: ".",
    agent: task,
    type: "change-request",
    subject: `${task} of ${work.id}`,
    text: `${body}

Criteria: ${criteria.map((c) => `${c} ${work.criteria.find((k) => k.id === c)?.text ?? ""}`).join("; ")}`
  }, work);
  if ("refused" in sent) {
    work.tasks = work.tasks.filter((t) => t !== record);
    return { refused: sent.refused };
  }
  record.message = sent.message.id;
  const made = addWorktree(env.paths.root, names.branch, names.worktree);
  if (made) {
    work.tasks = work.tasks.filter((t) => t !== record);
    const notes2 = [];
    updateStatusEverywhere(ctx, sent.message.id, "refused", made.failed, notes2);
    dropBranch(env.paths.root, names.branch);
    return { refused: notes2.length ? `${made.failed}; ${notes2.join("; ")}` : made.failed };
  }
  saveWork(env.paths, work);
  const brief = readText(join26(workDir(env.paths, work.id), "brief.md"));
  const notes = [];
  const opened = openSession(ctx, {
    message: sent.message,
    mode: "branch",
    cwd: names.worktree,
    branch: names.branch,
    prompt: taskPrompt(work, record, sent.message, brief, names.branch),
    maxTurns: env.policy.mail.maxTurns,
    maxMinutes: env.policy.mail.maxMinutes,
    hops: ctx.self.hops + 1,
    agent: task,
    log: sessionLog(ctx, sent.message.id)
  }, notes);
  return { record, message: sent.message, opened, notes };
}
function listTasks(ctx, work) {
  const inbox = readBox(mailbox(ctx.paths.userDir, ctx.self.workspace, ctx.self.project).dir, "inbox").box.messages;
  return (work.tasks ?? []).map((t) => {
    const m = inbox.find((x) => x.id === t.message);
    const implementer = t.child ? null : !m?.opened ? "no implementer" : m.opened.endedAt ? `implementer ${m.opened.outcome ?? "ended"}${m.reason ? `: ${m.reason}` : ""}` : null;
    return {
      task: t,
      status: m?.status ?? "sent",
      verdict: t.verdict ?? m?.verdict ?? "no reply yet",
      implementer
    };
  });
}
function takeReplies(ctx, paths, active) {
  const work = active.work;
  if (work && !active.tampered && absorbReplies(ctx, work))
    saveWork(paths, work);
}
function absorbReplies(ctx, work) {
  const inbox = ownInbox(ctx).messages;
  let changed = false;
  for (const t of work.tasks ?? []) {
    if (t.child)
      continue;
    const r = inbox.find((m) => m.replyTo === t.message);
    if (!r?.item)
      continue;
    t.child = r.item;
    t.verdict = r.verdict ?? "unproven";
    t.repliedAt = r.at;
    changed = true;
  }
  return changed;
}
var CHILD_RECORD_FILES = [
  "work.json",
  "evidence.json",
  "report.md",
  "objections.json",
  "mail.json"
];
function mergeTask(ctx, env, work, task, options = {}) {
  if (ctx.self.openedBy)
    return { refused: `a session opened by mail (${ctx.self.openedBy}) never merges` };
  const record = (work.tasks ?? []).find((t) => t.task === task);
  if (!record)
    return { refused: `${task} is not a task of ${work.id}` };
  if (record.mergedAt)
    return { refused: `${task} is already merged` };
  absorbReplies(ctx, work);
  const child = record.child;
  if (!child)
    return {
      refused: `${task} has no reply yet (message ${record.message}); the implementer ends with crew mail reply`
    };
  const childPaths = existsSync5(record.worktree) ? resolvePaths(record.worktree, ctx.env) : null;
  if (!childPaths)
    return {
      refused: `${task}'s worktree ${record.worktree} is gone; restore it with git worktree add ${record.worktree} ${record.branch}, then merge`
    };
  const checked = childRecordVerdict(record, child, childPaths);
  if ("refused" in checked)
    return checked;
  record.verdict = checked.verdict;
  if (record.verdict !== "proven" && !options.forcedBy)
    return {
      refused: `${task}'s child ${child} is not proven; the user may merge it anyway with crew task ${work.id} merge ${task} --force`
    };
  const dirty = dirtyWatched(env.paths.root, env.profile);
  if (dirty.length)
    return {
      refused: `uncommitted changes in ${dirty.join(", ")}; commit or stash them, then merge`
    };
  const swept = sweepSafely(ctx);
  const withSwept = (refused) => {
    const lines = swept.lines.filter((l) => l !== refused);
    return { refused: lines.length ? `${refused} (${lines.join("; ")})` : refused };
  };
  const sessions = readOpenSessions(ctx);
  if (sessions.tampered)
    return withSwept(sessions.tampered);
  const running = sessions.messages.find((m) => m.id === record.message);
  if (running)
    return withSwept(`${task}'s implementer is still running (pid ${running.opened?.pid}); wait for it to end, or stop it with crew mail stop ${record.message}`);
  const branch = branchContentRefusal(record, child, env.paths.root);
  if (branch)
    return withSwept(branch.refused);
  const subject = `Merge ${task} of ${work.id} (${record.branch}): ${child}, ${record.verdict ?? "unproven"}${options.forcedBy ? ", forced by the user" : ""}`;
  try {
    gitRun(env.paths.root, "merge", "--no-ff", "-m", subject, record.branch);
  } catch (error) {
    return withSwept(`git merge failed: ${gitError(error)}; resolve it by hand (or git merge --abort) and run the merge again`);
  }
  const commit = gitHead(env.paths.root);
  record.mergedAt = nowIso();
  record.mergeCommit = commit;
  if (options.forcedBy)
    record.forcedBy = options.forcedBy;
  saveWork(env.paths, work);
  const credit = creditChild(env.paths, work, record, options.forcedBy !== undefined);
  const childDir = workDir(env.paths, child);
  if (existsSync5(workDir(childPaths, child)))
    cpSync(workDir(childPaths, child), childDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    });
  for (const name of CHILD_RECORD_FILES)
    recordIntegrity(env.paths, join26(childDir, name));
  const kept = removeWorktree(env.paths.root, record.worktree);
  if (!kept)
    dropOpenedMarker(ctx.paths.userDir, childPaths.root);
  return {
    record,
    commit,
    swept: swept.lines,
    ...kept ? { worktreeKept: kept.kept } : {},
    ...credit
  };
}
function creditChild(paths, work, record, forced) {
  if (forced)
    return { credited: [], uncredited: "a forced merge of an unproven child credits nothing" };
  const loaded = loadEvidence(paths, work.id);
  if (loaded.tampered)
    return {
      credited: [],
      uncredited: `evidence.json of ${work.id} changed outside the engine (crew accept ${work.id}); nothing credited`
    };
  const merged = {
    task: record.task,
    child: record.child ?? "",
    commit: record.mergeCommit ?? "",
    at: record.mergedAt ?? nowIso()
  };
  const tdd = loaded.evidence.tdd.map((t) => record.criteria.includes(t.criterion) ? { ...t, merged } : t);
  for (const criterion of record.criteria)
    if (!tdd.some((t) => t.criterion === criterion))
      tdd.push({ criterion, merged });
  saveEvidence(paths, work.id, { ...loaded.evidence, tdd });
  return { credited: [...record.criteria], uncredited: null };
}
function childRecordVerdict(record, child, childPaths) {
  const item = loadWork(childPaths, child);
  if (item.work?.origin?.mail !== record.message)
    return {
      refused: `${record.task}'s reply names ${child} as its child, but that item did not start from message ${record.message}`
    };
  const evidence = loadEvidence(childPaths, child);
  const changedFile = item.tampered ? "work.json" : evidence.tampered ? "evidence.json" : null;
  if (changedFile)
    return {
      refused: `${record.task}'s child ${child} changed outside the engine in ${record.worktree} (${changedFile}); crew accept ${child} there, then merge`
    };
  return { verdict: evidence.evidence.verdict };
}
function branchContentRefusal(record, child, root) {
  const unreadable = (error) => ({
    refused: `the branch ${record.branch} cannot be compared with HEAD: ${gitError(error)}; restore the branch, then merge`
  });
  const own = `.crew/work/${child}/`;
  let changed;
  try {
    changed = gitRun(root, "diff", "--no-renames", "--name-only", `HEAD...${record.branch}`).split(`
`).filter(Boolean);
  } catch (error) {
    return unreadable(error);
  }
  const foreign = changed.find((p) => p.startsWith(".crew/") && !p.startsWith(own));
  if (foreign)
    return {
      refused: `the branch ${record.branch} changes ${foreign}, which is not the record of ${record.task}'s child; not merged`
    };
  let differs;
  try {
    differs = gitRun(record.worktree, "diff", "--no-renames", "--name-only", record.branch, "--", own).split(`
`).filter(Boolean)[0];
  } catch (error) {
    return unreadable(error);
  }
  if (differs)
    return {
      refused: `${record.task}'s child ${child} differs between the branch ${record.branch} and its worktree ${record.worktree} (${differs.slice(own.length)}); commit the record in the worktree, then merge`
    };
  return null;
}

// packages/engine/src/hooks/prompt.ts
function statusLine(ctx, work, tampered = false) {
  const result = assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || tampered);
  const state = result.verdict === "proven" ? "proven" : `not proven (${result.unproven[0] ?? "gates have not run"})`;
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${waitingText(work)}.`;
}
function onPrompt(ctx) {
  const notices = updateSession(ctx.paths, ctx.sessionId, (session) => {
    session.stopBlocks = 0;
    return takeNotices(session);
  });
  const mail = refreshMail(ctx);
  const active = activeWork(ctx.paths);
  if (active?.work && !mail.failed)
    mailQuietly(() => takeReplies(ctx.mail, ctx.paths, active), undefined);
  const lines = [];
  if (active?.work)
    lines.push(statusLine(ctx, active.work, active.tampered));
  lines.push(...notices);
  if (mail.failed)
    lines.push(`Mail is off for this prompt: ${mail.failed}.`);
  else if (mail.newMail.length)
    lines.push(`Mail: ${mail.newMail.length} new: ${mail.newMail.map((m) => `${m.id} ${m.type} from ${m.from.project} ${subjectQuoted(m.subject)}`).join("; ")} (crew mail inbox).`);
  if (!lines.length)
    return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: lines.join(" ")
    }
  };
}

// packages/engine/src/hooks/session-start.ts
function onSessionStart(ctx, payload = {}) {
  ensureCrewDir(ctx.paths, ctx.policy);
  const mail = refreshMail(ctx);
  const swept = mail.failed ? [] : sweepLines(ctx);
  const former = isFormerWatchDefault(ctx.profile);
  const moved = former && !ctx.tampered;
  if (moved) {
    ctx.profile.watch.exclude = [...DEFAULT_WATCH_EXCLUDE];
    saveProfile(ctx.paths, ctx.profile);
  }
  const refreshed = refreshProfile(ctx.paths, ctx.profile, ctx.tampered);
  ctx.profile = refreshed.profile;
  const active = activeWork(ctx.paths);
  const continues = (payload.source === "resume" || payload.source === "compact") && loadState(ctx.paths).sessions[ctx.sessionId] !== undefined;
  if (!continues) {
    const work = active?.work ?? null;
    const base = work;
    const inherited = work !== null && changedWatchedPaths(ctx.paths.root, ctx.profile, base).length > 0 && assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered).verdict !== "proven";
    const baseline = inherited ? null : computeFingerprint(ctx.paths.root, ctx.profile, base);
    updateSession(ctx.paths, ctx.sessionId, (session) => {
      session.baseline = baseline;
      session.stopBlocks = 0;
    });
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
  const summary = mail.failed ? emptyInboxSummary() : mailQuietly(() => inboxSummary(ctx.mail), emptyInboxSummary());
  const blockers = summary.blockers.map((b) => `Blocker ${b.id} from ${b.from.project}: ${subjectQuoted(b.subject)} (crew mail read ${b.id}).`);
  if (mail.failed)
    lines.push(`Mail is off for this session start: ${mail.failed}.`);
  else if (summary.tampered && summary.line)
    lines.push(`${summary.line}.`);
  else if (summary.line)
    lines.push(`${summary.line}. crew mail inbox lists it; a question is answered from the code with crew mail reply, a change request waits for the user's yes and starts an item with --origin <id>, a notice is said.`);
  if (ctx.openedBy) {
    const opener = summary.messages.find((m) => m.id === ctx.openedBy);
    const branch = ctx.openedBranch ? ` (branch ${ctx.openedBranch})` : " (the opener pinned no branch: every push is denied)";
    lines.push(`This session was opened by mail ${ctx.openedBy}${opener ? ` from ${opener.from.project} (${opener.type})` : ""}: read it with crew mail read ${ctx.openedBy}. A question: answer from the code and crew mail reply ${ctx.openedBy} "<text>". A change request: run the method on this branch as a work item started with --origin ${ctx.openedBy}${branch}, commit on it, and end with crew mail reply ${ctx.openedBy} --branch <branch> --item <child id>. Never merge, push to another branch or deploy; a full-route spec waits for a person (crew await <id> user).`);
  }
  if (swept.length)
    lines.push(`Swept: ${swept.join("; ")}.`);
  lines.unshift(...blockers);
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
  const session = sessionState(loadState(ctx.paths), ctx.sessionId);
  const done = (response, withNotices = false) => updateSession(ctx.paths, ctx.sessionId, (fresh) => {
    fresh.stopBlocks = session.stopBlocks;
    if (!withNotices)
      return response;
    const notices = takeNotices(fresh).map((n) => ` ${n}`).join("");
    return { ...response, reason: `${response.reason}${notices}` };
  });
  if (asksUserToTypeCrew(payload.last_assistant_message) && session.stopBlocks < MAX_STOP_BLOCKS) {
    session.stopBlocks += 1;
    return done({
      decision: "block",
      reason: "Crew: the last message tells the user to type a crew command. The user never types one: you run every crew command, and the permission prompt is the user's signature, in auto mode too (a note saying otherwise predates 0.1.6). Run the command now, without --mode, and tell the user what it recorded."
    });
  }
  const mail = refreshMail(ctx);
  const notes = mail.failed ? [`mail is off for this turn: ${mail.failed}`] : sweepLines(ctx);
  const mailNote = () => notes.length ? ` (${notes.join("; ")})` : "";
  const active = activeWork(ctx.paths);
  const work = active?.work ?? null;
  if (active?.work && !mail.failed)
    mailQuietly(() => takeReplies(ctx.mail, ctx.paths, active), undefined);
  const clearWait = (pause) => {
    if (!work || work.awaiting === null || active?.tampered)
      return;
    const kind = work.awaiting;
    work.awaiting = null;
    delete work.awaitingMessage;
    if (pause !== undefined)
      work.pauses = [...work.pauses ?? [], { at: nowIso(), reason: pause, kind }];
    saveWork(ctx.paths, work);
  };
  const release = (response, pause) => {
    clearWait(pause);
    return done(response);
  };
  const hold = (reason) => {
    session.stopBlocks += 1;
    return done({ decision: "block", reason: `${reason}${mailNote()}` }, true);
  };
  if (!mail.failed && session.stopBlocks < MAX_STOP_BLOCKS) {
    const inbox = mailQuietly(() => inboxSummary(ctx.mail), emptyInboxSummary());
    if (work && work.awaiting === "mail" && work.awaitingMessage && !active?.tampered) {
      const landed = inbox.messages.find((m) => m.replyTo === work.awaitingMessage);
      if (landed) {
        clearWait();
        return hold(`Crew: the reply to ${landed.replyTo} has landed (${landed.id} from ${landed.from.project}): read it with crew mail read ${landed.id} and go on; the wait is over.`);
      }
    }
    const blocker = inbox.blockers.find((b) => !b.noticedAt);
    if (blocker) {
      mailQuietly(() => markNoticed(ctx.mail, blocker.id, notes), undefined);
      return hold(`Crew: blocker ${blocker.id} from ${blocker.from.project}: ${subjectQuoted(blocker.subject)}. Read it (crew mail read ${blocker.id}) and say it to the user before anything else.`);
    }
  }
  const current = computeFingerprint(ctx.paths.root, ctx.profile, work);
  const result = work ? assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered) : null;
  const proven = result?.verdict === "proven";
  const changed = session.baseline !== null && current !== UNAVAILABLE ? current !== session.baseline : work !== null && !proven;
  if (!changed || proven) {
    session.stopBlocks = 0;
    return release(notes.length ? { systemMessage: `Crew: ${notes.join("; ")}.` } : {});
  }
  const missing = result ? result.unproven : ['no work item: start one with crew start "<request>"'];
  const what = work ? waitingPhrase(work) : null;
  if (work && what) {
    session.stopBlocks = 0;
    const reason = missing[0] ?? "not proven";
    return release({
      systemMessage: `Crew: work ${work.id} ends this turn ${what} and is not proven (${reason}). The next turn is held to the Stop rule again.${mailNote()}`
    }, reason);
  }
  if (session.stopBlocks >= MAX_STOP_BLOCKS) {
    return done({
      systemMessage: `Crew: not proven after ${MAX_STOP_BLOCKS} attempts. ${missing.join("; ")}.${mailNote()}`
    });
  }
  session.stopBlocks += 1;
  const gate = work ? `crew gate run ${work.id}` : 'crew start "<request>"';
  const wait = work ? ` To end the turn with a question for the user, run crew await ${work.id} user first; while the roles answer, crew await ${work.id} role; while a reply is due, crew await ${work.id} mail <message id>.` : "";
  const judgement = work && missing.some((m) => m.startsWith("judgement gate")) ? ` A judgement gate is cleared by its roles, not by the gate run: run the planned reviewers and the judge, then crew judgement ${work.id} record --ruling .crew/work/${work.id}/review/ruling.json.` : "";
  return done({
    decision: "block",
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.${judgement}${wait}${mailNote()}`
  }, true);
}

// packages/engine/src/hooks/subagent-stop.ts
import { join as join27 } from "node:path";
var PLUGIN_PREFIX = "wizardingcode-developer-crew:";
var BARE_ROLE = new RegExp(`^(${ROLE_NAMES.join("|")})$`);
function roleOf(agentType) {
  if (!agentType?.startsWith(PLUGIN_PREFIX))
    return null;
  const name = agentType.slice(PLUGIN_PREFIX.length);
  return BARE_ROLE.test(name) ? name : null;
}
function personalityOf(answer2) {
  const line = answer2.split(`
`).slice(0, 3).find((l) => /^personality:\s*\S/.test(l.trim()));
  if (!line)
    return null;
  const name = line.trim().slice("personality:".length).trim().toLowerCase();
  return PERSONALITIES.includes(name) ? name : "unknown";
}
function leadAnswer(answer2) {
  const match = /^# (qa|security|architects|etl|devops) lead's validation of \S+: (spec|plan|delivery)\b/.exec(unfenced(answer2));
  if (!match)
    return null;
  return { team: match[1], what: match[2] };
}
function teamOf(agent) {
  for (const [name, def] of Object.entries(TEAMS))
    if (def.lead === agent || def.members.includes(agent))
      return name;
  return null;
}
function lines(transcriptPath) {
  const text = transcriptPath ? readText(transcriptPath) : null;
  if (text === null)
    return [];
  const out = [];
  for (const raw of text.split(`
`)) {
    if (!raw.trim())
      continue;
    try {
      out.push(JSON.parse(raw));
    } catch {}
  }
  return out;
}
function roleAnswer(transcriptPath, lastMessage) {
  let handback = null;
  for (const line of lines(transcriptPath)) {
    if (line.type !== "assistant" || !Array.isArray(line.message?.content))
      continue;
    for (const part of line.message.content) {
      if (part.type === "tool_use" && part.name === "SubagentHandback" && typeof part.input?.message === "string")
        handback = part.input.message;
    }
  }
  return (handback ?? lastMessage ?? "").trim();
}
var SPENT = ["input_tokens", "output_tokens", "cache_creation_input_tokens"];
function roleTokens(transcriptPath) {
  const perRequest = new Map;
  let unnamed = 0;
  for (const line of lines(transcriptPath)) {
    const usage = line.type === "assistant" ? line.message?.usage : undefined;
    if (!usage)
      continue;
    const key = typeof line.requestId === "string" ? line.requestId : `line-${unnamed++}`;
    if (perRequest.has(key))
      continue;
    let spent = 0;
    for (const field of SPENT)
      if (typeof usage[field] === "number")
        spent += usage[field];
    perRequest.set(key, spent);
  }
  if (!perRequest.size)
    return { tokens: 0, from: "none" };
  return { tokens: [...perRequest.values()].reduce((a, b) => a + b, 0), from: "transcript" };
}
function unfenced(text) {
  const fence = /^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/.exec(text.trim());
  return fence?.[1] ?? text.trim();
}
function closingBrace(text, open) {
  let depth = 0;
  let quoted = false;
  for (let i = open;i < text.length; i++) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === "\\")
        i++;
      else if (c === '"')
        quoted = false;
    } else if (c === '"')
      quoted = true;
    else if (c === "{")
      depth++;
    else if (c === "}" && --depth === 0)
      return i;
  }
  return -1;
}
function gatesRuling(answer2) {
  const body = unfenced(answer2);
  const candidates = [body];
  const at = body.indexOf('"rulings"');
  const open = at >= 0 ? body.lastIndexOf("{", at) : -1;
  const close = open >= 0 ? closingBrace(body, open) : -1;
  if (close > open)
    candidates.push(body.slice(open, close + 1));
  for (const text of candidates) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null && Array.isArray(parsed.rulings))
        return text;
    } catch {}
  }
  return null;
}
function answerFile(agent, answer2) {
  if (agent.startsWith("review-"))
    return `review/${agent.slice("review-".length)}.findings.md`;
  if (agent === "tech-lead") {
    const lead = leadAnswer(answer2);
    return lead ? `conclave/lead-${lead.team}${lead.what === "delivery" ? ".delivery" : ""}.md` : "conclave/tech-lead.md";
  }
  if (agent.startsWith("lead-"))
    return `conclave/${agent}.md`;
  if (agent === "cto")
    return "conclave/cto.md";
  if (agent === "judge") {
    if (gatesRuling(answer2))
      return "review/ruling.json";
    const validator = /^# Validator, ([a-z-]+)/.exec(unfenced(answer2));
    return validator ? `conclave/validator-${validator[1]}.md` : "conclave/judge.md";
  }
  return `conclave/${agent}.md`;
}
function agentName(role, roles) {
  if (role !== "expert")
    return role;
  const experts = new Set(roles.map((r) => r.agent).filter((a) => /^expert-\d+$/.test(a)));
  return `expert-${experts.size + 1}`;
}
function sendByHand(workId, mid, agent, file) {
  return `crew mail reply ${mid} "<text>" --as ${agent}${file ? ` --file .crew/work/${workId}/${file}` : ""}`;
}
function whereSaved(saved) {
  return saved.file ? `is saved at ${saved.file}` : "is in its transcript";
}
function savedAndUnsentPhrases(workId, saved, pending) {
  return {
    where: whereSaved(saved),
    unsent: pending ? `; the reply to ${pending} was not sent: send it with ${sendByHand(workId, pending, saved.agent, saved.file)}.` : "."
  };
}
function onSubagentStop(ctx, payload) {
  const role = roleOf(payload.agent_type);
  if (!role)
    return {};
  const tell = (text) => {
    leaveNotice(ctx, text);
    return { systemMessage: text };
  };
  const active = activeWork(ctx.paths);
  if (!active?.work)
    return tell(`Crew: ${role} stopped with no active work item: its answer was not recorded.`);
  const id = active.work.id;
  const transcriptNote = payload.agent_transcript_path ? ` (${payload.agent_transcript_path})` : "";
  const nothingSaved = (reason) => tell(`Crew: ${role} stopped but nothing was saved for ${id} (${reason}): save its answer from the transcript${transcriptNote} by hand, or run the role again.`);
  if (active.tampered)
    return nothingSaved(tamperedItem(id));
  const progress = { saved: null, recorded: false, pending: null, reply: null };
  try {
    let note = withLock(workDir(ctx.paths, id), () => recordStop(ctx, id, role, payload, transcriptNote, progress), { what: "work folder" });
    if (progress.pending && progress.reply && progress.saved) {
      const question = progress.pending;
      const { agent, file } = progress.saved;
      const relayed = relay(ctx, question, progress.reply, agent);
      progress.pending = null;
      if ("refused" in relayed)
        note = `Crew: ${agent}'s answer to ${question} ${whereSaved(progress.saved)} but the reply was not sent: ${relayed.refused}. Once that is cleared, send it with ${sendByHand(id, question, agent, file)}.`;
      else if (relayed.notes.length)
        note = `Crew: ${agent}'s answer to ${question} was sent, but ${relayed.notes.join("; ")}.`;
    }
    return note ? tell(note) : {};
  } catch (error) {
    const why = error.message;
    if (!progress.saved)
      return nothingSaved(why);
    const { agent } = progress.saved;
    const { where, unsent } = savedAndUnsentPhrases(id, progress.saved, progress.pending);
    if (!progress.recorded)
      return tell(`Crew: ${agent}'s answer ${where} but its end and tokens are not recorded (${why})${unsent}`);
    return tell(`Crew: ${agent}'s answer ${where} and its end is recorded, but the role wait was not cleared (${why}): crew resume ${id} clears it${unsent}`);
  }
}
function tamperedItem(id) {
  return `work.json changed outside the engine; crew accept ${id}`;
}
function recordStop(ctx, id, role, payload, transcriptNote, progress) {
  const dir = workDir(ctx.paths, id);
  const item = loadWork(ctx.paths, id);
  const work = item.work;
  if (!work)
    throw new Error(`work.json of ${id} could not be read`);
  if (item.tampered)
    throw new Error(tamperedItem(id));
  const read2 = loadEvidence(ctx.paths, id);
  const evidence = read2.evidence;
  const roles = evidence.roles ?? [];
  const answer2 = roleAnswer(payload.agent_transcript_path, payload.last_assistant_message);
  const { tokens, from } = roleTokens(payload.agent_transcript_path);
  const earlier = payload.agent_id ? roles.find((r) => r.agentId === payload.agent_id) : undefined;
  const agent = earlier?.agent ?? agentName(role, roles);
  let saved;
  let note = null;
  if (!answer2) {
    saved = { file: null, agent };
    note = `Crew: ${agent} stopped with no answer (no hand-back and an empty last message): its end is recorded with no file; an earlier file of this role, if any, is not this round's answer. Run the role again or save its answer from the transcript${transcriptNote}.`;
  } else if (earlier?.file) {
    saved = { file: joinEarlierFile(dir, agent, answer2), agent };
  } else {
    const file = answerFile(agent, answer2);
    writeText(join27(dir, file), file.endsWith(".json") ? `${gatesRuling(answer2) ?? unfenced(answer2)}
` : `${answer2}
`);
    saved = { file, agent };
  }
  progress.saved = saved;
  const pending = earlier && answer2 ? pendingQuestion(ctx, id, agent) : undefined;
  progress.pending = pending?.id ?? null;
  if (read2.tampered) {
    const tampered = `evidence.json of ${id} changed outside the engine (crew accept ${id})`;
    if (!answer2)
      return `Crew: ${agent} stopped with no answer (no hand-back and an empty last message) and its end is not recorded: ${tampered}. Run the role again or save its answer from the transcript${transcriptNote}.`;
    const { where, unsent } = savedAndUnsentPhrases(id, saved, pending?.id ?? null);
    return `Crew: ${agent}'s answer ${where} but its end and tokens are not recorded: ${tampered}${unsent}`;
  }
  const personality = personalityOf(answer2);
  const team = saved.agent === "tech-lead" ? leadAnswer(answer2)?.team ?? null : teamOf(saved.agent);
  evidence.roles = [
    ...roles,
    {
      agent: saved.agent,
      ...payload.agent_id ? { agentId: payload.agent_id } : {},
      at: nowIso(),
      tokens,
      tokensFrom: from,
      file: saved.file,
      ...personality ? { personality } : {},
      ...team ? { team } : {}
    }
  ];
  saveEvidence(ctx.paths, id, evidence);
  progress.recorded = true;
  if (role === "judge" && work.awaiting === "role") {
    work.awaiting = null;
    saveWork(ctx.paths, work);
  }
  if (pending)
    progress.reply = answer2;
  return note;
}
function pendingQuestion(ctx, workId, agent) {
  return loadItemMail(ctx.paths, workId).box.messages.find((m) => m.relayed && m.to.agent === agent && (m.status === "sent" || m.status === "read") && !m.replyTo);
}
function joinEarlierFile(dir, agent, answer2) {
  if (agent.startsWith("review-")) {
    const file2 = answerFile(agent, answer2);
    const current2 = (readText(join27(dir, file2)) ?? "").trimEnd();
    const heading = `
## Clarifications`;
    const body = current2.includes(heading) ? current2 : `${current2}
${heading}`;
    writeText(join27(dir, file2), `${body}
- ${answer2.replace(/\n/g, `
  `)}
`);
    return file2;
  }
  const file = `conclave/${agent}-reply.md`;
  const current = readText(join27(dir, file));
  writeText(join27(dir, file), current ? `${current.trimEnd()}

${answer2}
` : `${answer2}
`);
  return file;
}
function relay(ctx, questionId, answer2, agent) {
  const notes = [];
  try {
    const sent = reply(ctx.mail, questionId, answer2, { as: agent }, notes);
    return "refused" in sent ? { refused: sent.refused } : { notes };
  } catch (error) {
    return { refused: error.message };
  }
}

// packages/engine/src/hooks/index.ts
var EVENTS = new Set([
  "session-start",
  "prompt",
  "pre-tool-use",
  "post-tool-use",
  "stop",
  "subagent-stop"
]);
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
      case "post-tool-use":
        return onPostToolUse(ctx, payload);
      case "subagent-stop":
        return onSubagentStop(ctx, payload);
      default:
        return onStop(ctx, payload);
    }
  } catch {
    return {};
  }
}

// packages/engine/src/metrics.ts
import { readdirSync as readdirSync6 } from "node:fs";
import { join as join28 } from "node:path";
var count = (map, key, n = 1) => {
  map[key] = (map[key] ?? 0) + n;
};
function computeMetrics(projects) {
  const m = {
    projects: projects.map((p) => p.root),
    items: { total: 0, byRoute: {}, byType: {} },
    rounds: { judgement: 0, validation: 0, gate: 0 },
    tokens: { byRole: {}, byPersonality: {}, total: 0 },
    defects: { byReviewer: {} },
    tasks: { opened: 0, proven: 0, unproven: 0 },
    objections: { byStatus: {} },
    decisions: { total: 0, byUser: 0, byValidator: 0, byAgent: 0 },
    gates: { notRun: 0, skipped: 0 },
    phaseMinutes: {}
  };
  const phaseTotals = {};
  for (const paths of projects) {
    const policy = loadPolicy(paths).policy;
    let ids = [];
    try {
      ids = readdirSync6(join28(paths.crewDir, "work"));
    } catch {
      continue;
    }
    for (const id of ids) {
      const work = loadWork(paths, id).work;
      if (!work)
        continue;
      m.items.total += 1;
      count(m.items.byRoute, work.route);
      count(m.items.byType, work.type);
      m.rounds.judgement += work.rounds?.judgement ?? 0;
      m.rounds.validation += work.rounds?.validation ?? 0;
      for (const t of work.tasks ?? []) {
        m.tasks.opened += 1;
        if (t.verdict === "proven")
          m.tasks.proven += 1;
        else if (t.verdict === "unproven")
          m.tasks.unproven += 1;
        m.rounds.gate += t.gate?.round ?? 0;
      }
      for (const d of work.decisions ?? []) {
        if (d.answer === undefined)
          continue;
        m.decisions.total += 1;
        if (d.by === "user")
          m.decisions.byUser += 1;
        else if (d.by === "validator")
          m.decisions.byValidator += 1;
        else if (d.by === "agent")
          m.decisions.byAgent += 1;
      }
      const evidence = loadEvidence(paths, id).evidence;
      for (const r of evidence.roles ?? []) {
        count(m.tokens.byRole, r.agent.replace(/-\d+$/, ""), r.tokens);
        if (r.personality)
          count(m.tokens.byPersonality, r.personality, r.tokens);
        m.tokens.total += r.tokens;
      }
      for (const j of evidence.judgement ?? []) {
        if (j.verdict === "not-run")
          m.gates.notRun += 1;
        const defects = j.findings.filter((f) => f.severity === "defect" && !f.outside).length;
        if (defects)
          count(m.defects.byReviewer, j.reviewer ?? `review-${j.gate}`, defects);
      }
      m.gates.skipped += evidence.runs.filter((r) => r.status === "skipped").length;
      for (const o of loadLedger(paths, id).ledger.objections)
        count(m.objections.byStatus, objectionStatus(o, work, evidence, policy));
      const stamps = Object.entries(work.phaseAt ?? {});
      stamps.sort((a, b) => a[1].localeCompare(b[1]));
      for (let i = 0;i + 1 < stamps.length; i++) {
        const current = stamps[i];
        const following = stamps[i + 1];
        if (!current || !following)
          continue;
        const minutes = (Date.parse(following[1]) - Date.parse(current[1])) / 60000;
        phaseTotals[current[0]] = (phaseTotals[current[0]] ?? 0) + minutes;
      }
    }
  }
  for (const [phase, minutes] of Object.entries(phaseTotals))
    m.phaseMinutes[phase] = Math.round(minutes * 100) / 100;
  return m;
}
function metricsText(m) {
  const pairs = (map) => Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k} ${v}`).join(", ");
  return [
    `metrics of ${m.projects.length} project${m.projects.length === 1 ? "" : "s"}`,
    `  items: ${m.items.total}${m.items.total ? ` (${pairs(m.items.byRoute)})` : ""}`,
    `  rounds: judgement ${m.rounds.judgement}, validation ${m.rounds.validation}, gate ${m.rounds.gate}`,
    `  tokens: ${m.tokens.total}${m.tokens.total ? ` (${pairs(m.tokens.byRole)})` : ""}`,
    `  defects upheld: ${Object.values(m.defects.byReviewer).reduce((a, b) => a + b, 0)}${Object.keys(m.defects.byReviewer).length ? ` (${pairs(m.defects.byReviewer)})` : ""}`,
    `  tasks: ${m.tasks.opened} opened, ${m.tasks.proven} proven, ${m.tasks.unproven} unproven`,
    `  decisions: ${m.decisions.total} (user ${m.decisions.byUser}, validator ${m.decisions.byValidator}, agent ${m.decisions.byAgent})`,
    `  gates: ${m.gates.notRun} not run, ${m.gates.skipped} skipped`,
    `  minutes per phase: ${Object.keys(m.phaseMinutes).length ? pairs(m.phaseMinutes) : "none yet"}`
  ].join(`
`);
}

// packages/engine/src/tdd.ts
import { join as join29 } from "node:path";
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
    logPath: join29(workDir(paths, work.id), log)
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
var VERSION = "0.5.1";

// packages/engine/src/cli.ts
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
  task: ["criteria", "text", "force", "mode"],
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
function guarded(label, step) {
  try {
    step();
    return "";
  } catch (error) {
    return `${label}: ${error.message.split(`
`)[0]}`;
  }
}
function sweptText(swept) {
  if (swept.ended.length || swept.expired.length)
    return `swept: ${swept.ended.length} ended, ${swept.expired.length} expired (${swept.lines.join("; ")})`;
  return swept.lines.join(`
`);
}
var INACTIVE = "crew is inactive here: not a git repository and no .crew/ folder; run crew detect in the project root to activate it";
function tamperMessage({ file, accept }) {
  return `state changed outside the engine: ${file}; the user can accept it with crew accept ${accept}`;
}
function load2(paths, processEnv) {
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
  const read2 = loadWork(env.paths, id);
  if (!read2.work) {
    return read2.tampered ? refuse(tamperMessage({ file: `.crew/work/${id}/work.json`, accept: id })) : refuse(`unknown work item: ${id}`);
  }
  return { work: read2.work, tampered: read2.tampered };
}
function tamperRefusal(env, opened) {
  const found = [...env.tamperedFiles];
  if (registerTampered(env.paths))
    found.push({ file: ".crew/decisions.json", accept: "decisions" });
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
  if (target === "profile" || target === "policy" || target === "decisions") {
    if (!recordIntegrity(env.paths, join30(env.paths.crewDir, `${target}.json`)))
      return refuse(`no .crew/${target}.json to accept`);
    return ok(`${target} accepted: its current content is now the trusted version`, {
      accepted: target
    });
  }
  const dir = workDir(env.paths, target);
  if (!/^[\w.-]+$/.test(target) || target.includes("..") || !existsSync6(join30(dir, "work.json")))
    return refuse(`unknown work item: ${target}`);
  const files = PROTECTED_WORK_FILES.filter((name) => recordIntegrity(env.paths, join30(dir, name)));
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
function whoDecided(decision) {
  return decidedBy(decision).replace(/^by /, "");
}
function guardContext(env, work, tampered) {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join30(dir, "spec.md")),
    conclaveText: readText(join30(dir, "conclave.md")),
    ledger: loadLedger(env.paths, work.id).ledger,
    planExists: existsSync6(join30(dir, "plan.md")),
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
  writeProtectedText(env.paths, join30(workDir(env.paths, opened.work.id), "report.md"), reportOf(env, opened.work, evidence));
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
  const file = join30(env.paths.localDir, "decisions.jsonl");
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
  const lines2 = runs.map((r) => `  ${r.gate} (${r.target}${r.stack ? `, ${r.stack}` : ""}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`);
  lines2.push(verdict === "proven" ? `Proven: ${work.id}` : `Not proven: ${unproven.join("; ")}`);
  return lines2.join(`
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
    ensureDir(join30(resolve4(io.cwd), ".crew"));
    paths = resolvePaths(io.cwd, io.env);
  }
  if (!paths)
    return refuse(INACTIVE);
  const env = load2(paths, io.env);
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
          recordIntegrity(env.paths, join30(env.paths.crewDir, "policy.json"));
        }
      }
      const missing = missingTestCommands(profile);
      const lines2 = profile.targets.map((t) => `  ${t.path} (${t.stack}, ${t.packageManager}${t.workspaceOf ? `, workspace of ${t.workspaceOf}` : ""}): ${Object.entries(t.gates).map(([g, c]) => `${g}=${c.command}${c.source === "proposed" ? " [proposed]" : ""}`).join(", ") || "no commands"}`);
      if (missing.length)
        lines2.push(`No test command for: ${missing.map((m) => m.target).join(", ")}. Propose one: crew profile set test "<cmd>" [--target <path>]`);
      const entry = env.registered;
      lines2.push(`registered ${entry.name} (workspace ${entry.workspace ?? "none"})`);
      return ok(lines2.join(`
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
        return refuse("usage: crew accept <id|profile|policy|decisions>");
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
        return refuse(`no message ${originId} addressed to this session (crew mail inbox)`);
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
      if (work.route !== "fast") {
        work.seats = plannedSeats(work.route, work.riskAreas, [], env.policy);
        work.primaryTeam = "backend";
      }
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
      const originNotes = [];
      if (origin) {
        const read2 = markRead(env.mail, origin.id, originNotes);
        recordInItem(env.paths, work.id, "refused" in read2 ? origin : read2);
      }
      const lines2 = criteria.map((c) => `
  ${c.id} (${c.kind}): ${c.text}`).join("");
      const teamLine = work.seats?.length ? `
  team: ${work.seats.length} seats (crew team ${work.id})` : "";
      const registered = decisionsCount(env.paths);
      const registerLine = registered ? `
  decision register: ${registered} entr${registered === 1 ? "y" : "ies"} (crew decisions)` : "";
      return ok(`${warning}${sharedWarning}${inheritedWarning}${provenNote}started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})${lines2}${teamLine}${registerLine}${originNotes.length ? `
${originNotes.join(`
`)}` : ""}`, {
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
        appendDecision(env.paths, {
          at: nowIso(),
          item: opened.work.id,
          kind: "objection",
          id: result.id,
          text: result.text,
          answer: `resolved by ${result.criterion}`,
          by: "the engine"
        });
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
        appendDecision(env.paths, {
          at: nowIso(),
          item: opened.work.id,
          kind: "objection",
          id: result.id,
          text: result.text,
          answer: `waived: ${reason}`,
          by: whoDecided(waiver)
        });
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
      appendDecision(env.paths, {
        at: nowIso(),
        item: opened.work.id,
        kind: "decision",
        id: result.id,
        text: result.question,
        ...result.answer ? { answer: result.answer } : {},
        by: whoDecided(result)
      });
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
      const openedBy = env.mail.self.openedBy;
      if (openedBy && opened.work.route === "full") {
        opened.work.awaiting = "user";
        saveWork(env.paths, opened.work);
        const notes = [];
        if (ownInbox(env.mail).messages.some((m) => m.id === openedBy))
          updateStatusEverywhere(env.mail, openedBy, "waiting-for-person", undefined, notes);
        return refuse(`a full-route item opened by mail (${openedBy}) waits for a person at its spec; the item is marked waiting for the user and the message waiting-for-person${notes.length ? `; ${notes.join("; ")}` : ""}`);
      }
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
      appendDecision(env.paths, {
        at: nowIso(),
        item: opened.work.id,
        kind: "approval",
        text: "spec approved",
        by: whoDecided(decision)
      });
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
      const rounds = opened.work.rounds ?? { judgement: 0, validation: 0 };
      const newRound = rounds.judgementCode !== before.currentFingerprint;
      const grants = (opened.work.continued ?? []).filter((c) => c.what === "judgement" && decisionCounts(env.policy, c.by)).length;
      if (newRound && rounds.judgement >= env.policy.team.maxJudgementRounds + grants)
        return refuse(`judgement round ${rounds.judgement + 1} of ${opened.work.id}: the policy allows ${env.policy.team.maxJudgementRounds} (team.maxJudgementRounds); the user continues it once with crew continue ${opened.work.id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`);
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
        const rulingPath = resolve4(env.paths.root, parsed.flags.ruling);
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
      fillTokens(records, before.evidence.roles ?? [], readReviewInputs(env.paths, opened.work.id)?.at);
      for (const record of records)
        recordJudgement(before.evidence, record);
      const result = reassess(before, opened.work, env.policy);
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      saveEvidence(env.paths, opened.work.id, result.evidence);
      if (newRound)
        opened.work.rounds = {
          ...rounds,
          judgement: rounds.judgement + 1,
          judgementCode: before.currentFingerprint
        };
      saveWork(env.paths, opened.work);
      const rulingFile = typeof parsed.flags.ruling === "string" ? relative6(env.paths.root, resolve4(env.paths.root, parsed.flags.ruling)).replace(/\\/g, "/") : undefined;
      for (const record of records)
        for (const f of record.findings)
          if (record.verdict === "not-proven" && f.severity === "defect" && !f.outside)
            appendDecision(env.paths, {
              at: nowIso(),
              item: opened.work.id,
              kind: "ruling",
              text: `${record.gate} defect: ${f.file}${f.line ? `:${f.line}` : ""} ${f.text}`,
              by: "the judge",
              ...rulingFile ? { file: rulingFile } : {}
            });
      deliver2(env, opened, result.evidence);
      const lines2 = records.map((r) => {
        const outside = r.findings.filter((f) => f.outside).length;
        const detail = r.verdict === "not-run" ? `: ${r.reason}` : ` (${r.findings.length} finding${r.findings.length === 1 ? "" : "s"}${outside ? `, ${outside} outside the change` : ""})`;
        const word = r.verdict === "not-proven" ? "not proven" : r.verdict === "not-run" ? "not run" : "proven";
        return `  ${r.gate}: ${word}${detail}`;
      });
      lines2.push(result.verdict === "proven" ? `Proven: ${opened.work.id}` : `Not proven: ${result.unproven.join("; ")}`);
      return {
        code: result.verdict === "proven" ? 0 : 1,
        stdout: true,
        text: lines2.join(`
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
      writeProtectedText(env.paths, join30(workDir(env.paths, opened.work.id), "report.md"), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case "task": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const usage = 'usage: crew task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"] | list | merge T-n [--force]';
      const ctx = env.mail;
      if (args[1] === "open") {
        const task = args[2];
        const criteria = typeof parsed.flags.criteria === "string" ? parsed.flags.criteria.split(",").map((c) => c.trim()).filter(Boolean) : [];
        if (!task || !criteria.length)
          return refuse(usage);
        const out = openTask(ctx, env, opened.work, task, criteria, typeof parsed.flags.text === "string" ? parsed.flags.text : undefined);
        if ("refused" in out)
          return refuse(out.refused);
        const session = "failed" in out.opened ? `the implementer ${out.opened.stopped ? "was started and stopped" : "did not start"}: ${out.opened.failed}; the task keeps its record, the worktree ${out.record.worktree} and the branch ${out.record.branch}: open the implementer by hand there (a session opened by hand is watched by no sweep and no merge check), or drop them (git worktree remove ${out.record.worktree}; git branch -D ${out.record.branch})` : `implementer started (${out.opened.name}, pid ${out.opened.pid}, ${out.opened.maxTurns} turns, ${minutesText(out.opened.maxMinutes)})`;
        return ok(`${task} opened: message ${out.message.id}, worktree ${out.record.worktree}, branch ${out.record.branch}; ${session}${out.notes.length ? `
${out.notes.join(`
`)}` : ""}`, { task: out.record, message: out.message, opened: out.opened, notes: out.notes });
      }
      if (args[1] === "list") {
        const swept = sweptText(sweepSafely(ctx));
        const taken = guarded("the replies were not taken", () => takeReplies(ctx, env.paths, opened));
        let rows = [];
        const listedTasks = guarded("the tasks were not listed", () => {
          rows = listTasks(ctx, opened.work);
        });
        const lines2 = rows.map(({ task: t, status, verdict, implementer }) => `  ${t.task} · ${t.criteria.join(",")} · ${t.branch} · ${t.message} ${status} · ${t.child ?? "no child yet"} · ${verdict}${implementer ? ` · ${implementer}` : ""}${t.mergedAt ? ` · merged ${t.mergeCommit?.slice(0, 7)}` : ""}`);
        return ok(`${[swept, taken, listedTasks].filter(Boolean).join(`
`)}${swept || taken || listedTasks ? `
` : ""}Tasks of ${opened.work.id}:${listedTasks ? " not listed" : lines2.length ? `
${lines2.join(`
`)}` : " none"}`, {
          tasks: rows
        });
      }
      if (args[1] === "merge") {
        if (!args[2])
          return refuse(usage);
        const forcedBy = parsed.flags.force ? decisionFlag(parsed, env.policy) : undefined;
        if (isOutcome(forcedBy))
          return forcedBy;
        const out = mergeTask(ctx, env, opened.work, args[2], forcedBy ? { forcedBy } : {});
        if ("refused" in out)
          return refuse(out.refused);
        const forced = forcedBy ? ` forced ${decisionText(env.policy, forcedBy)}` : "";
        const kept = out.worktreeKept ? `; worktree ${out.record.worktree} kept: ${out.worktreeKept}` : "";
        const credited = out.credited.length ? `
test-first of ${out.credited.join(", ")} credited to ${args[2]} (child ${out.record.child})` : out.uncredited ? `
test-first not credited: ${out.uncredited}` : "";
        return ok(`${out.swept.length ? `${out.swept.join(`
`)}
` : ""}merged ${args[2]} of ${opened.work.id}: ${out.commit.slice(0, 7)} (${out.record.branch}, child ${out.record.child}, ${out.record.verdict})${forced}${kept}${credited}`, {
          task: out.record,
          commit: out.commit,
          swept: out.swept,
          credited: out.credited,
          uncredited: out.uncredited
        });
      }
      return refuse(usage);
    }
    case "decisions": {
      const tampered = tamperRefusal(env);
      if (tampered)
        return tampered;
      const grep = typeof parsed.flags.grep === "string" ? parsed.flags.grep : undefined;
      const entries = listDecisions(env.paths, grep);
      const text = entries.length ? entries.map(decisionLine).join(`
`) : grep ? `no entry matches ${grep}` : "the register is empty";
      return ok(text, { entries });
    }
    case "team": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const changed = changedWatchedPaths(env.paths.root, env.profile, opened.work);
      const seats = plannedSeats(opened.work.route, opened.work.riskAreas, changed, env.policy);
      const primary = primaryTeam(changed);
      opened.work.seats = seats;
      opened.work.primaryTeam = primary;
      saveWork(env.paths, opened.work);
      const text = seats.length ? `Team of ${opened.work.id} (primary ${primary}): ${seats.map((s) => `${s.role} (${s.reason})`).join("; ")}` : `Team of ${opened.work.id}: no seat (fast route)`;
      return ok(text, { seats, primaryTeam: primary });
    }
    case "validation": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const usage = "usage: crew validation <id> record --what spec|plan|delivery --by lead-<team> --file <path>";
      const what = parsed.flags.what;
      const by = parsed.flags.by;
      const file = parsed.flags.file;
      if (args[1] !== "record" || what !== "spec" && what !== "plan" && what !== "delivery" || typeof by !== "string" || typeof file !== "string")
        return refuse(usage);
      const work = opened.work;
      if (!(work.seats ?? []).some((s) => s.kind === "lead" && s.role === by))
        return refuse(`${by} is not a seat of ${work.id} (crew team ${work.id} prints the seats)`);
      const path = resolve4(env.paths.root, file);
      const text = readText(path);
      if (text === null)
        return refuse(`no validation file at ${path}`);
      const verdict = parseValidation(text);
      if ("refused" in verdict)
        return refuse(verdict.refused);
      const dir = workDir(env.paths, work.id);
      const evidence = loadEvidence(env.paths, work.id).evidence;
      const hash = validationHash(what, readText(join30(dir, "spec.md")), readText(join30(dir, "plan.md")), evidence.fingerprint ?? "");
      const same = (work.validations ?? []).filter((v) => v.what === what);
      const last = same[same.length - 1];
      const newRound = !last || last.hash !== hash;
      const rounds = work.rounds ?? { judgement: 0, validation: 0 };
      const grants = (work.continued ?? []).filter((c) => c.what === "validation" && decisionCounts(env.policy, c.by)).length;
      if (what === "spec" && newRound && rounds.validation >= env.policy.team.maxValidationRounds + grants)
        return refuse(`validation round ${rounds.validation + 1} of ${work.id}: the policy allows ${env.policy.team.maxValidationRounds} (team.maxValidationRounds); the user continues it once with crew continue ${work.id} validation, or decides`);
      const round = newRound ? (what === "spec" ? rounds.validation : last?.round ?? 0) + 1 : last?.round ?? 1;
      work.validations = [
        ...work.validations ?? [],
        {
          what,
          by,
          verdict: verdict.verdict,
          returns: verdict.returns,
          round,
          file: relative6(dir, path).replace(/\\/g, "/"),
          hash,
          at: nowIso()
        }
      ];
      if (what === "spec" && newRound)
        work.rounds = { ...rounds, validation: rounds.validation + 1 };
      saveWork(env.paths, work);
      const recorded = work.validations[work.validations.length - 1];
      if (verdict.verdict === "returned" && recorded)
        appendDecision(env.paths, {
          at: recorded.at,
          item: work.id,
          kind: "validation",
          text: `${what} returned by ${by}: ${verdict.returns} return${verdict.returns === 1 ? "" : "s"}`,
          by,
          file: recorded.file
        });
      const said = verdict.verdict === "validated" ? `validated (round ${round})` : `returned, ${verdict.returns} return${verdict.returns === 1 ? "" : "s"} (round ${round})`;
      return ok(`validation of ${what} by ${by}: ${said}`, {
        validation: work.validations[work.validations.length - 1],
        rounds: work.rounds ?? rounds
      });
    }
    case "metrics": {
      const ws = typeof parsed.flags.workspace === "string" ? parsed.flags.workspace : null;
      let roots = [env.paths.root];
      if (ws) {
        roots = loadRegistry(env.paths.userDir).projects.filter((p) => p.workspace === ws && !p.worktreeOf).map((p) => p.root);
        if (!roots.length)
          return refuse(`no project of workspace ${ws} is registered (crew detect in each project)`);
      }
      const metrics = computeMetrics(roots.map((root) => pathsFor(root, env.paths.userDir)));
      return ok(metricsText(metrics), { ...metrics });
    }
    case "cto": {
      const usage = "usage: crew cto record --workspace <ws> --file <plan.md>";
      const ws = parsed.flags.workspace;
      const file = parsed.flags.file;
      if (args[0] !== "record" || typeof ws !== "string" || typeof file !== "string")
        return refuse(usage);
      if (!MAIL_NAME.test(ws))
        return refuse(`a workspace is a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters, not ${ws}`);
      const path = resolve4(env.paths.root, file);
      const text = readText(path);
      if (text === null)
        return refuse(`no plan file at ${path}`);
      const dir = join30(env.paths.userDir, "cto", ws);
      ensureDir(dir);
      const target = join30(dir, `${nowIso().slice(0, 10)}-plan.md`);
      writeText(target, text);
      return ok(`CTO plan of ${ws} filed: ${target}`, { path: target });
    }
    case "continue": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const usage = "usage: crew continue <id> judgement | crew continue <id> validation | crew continue <id> gate T-n";
      const what = args[1];
      if (what !== "judgement" && what !== "validation" && what !== "gate")
        return refuse(usage);
      const task = what === "gate" ? args[2] : undefined;
      if (what === "gate" && !/^T-\d+$/.test(task ?? ""))
        return refuse(usage);
      const decision = decisionFlag(parsed, env.policy);
      if (isOutcome(decision))
        return decision;
      opened.work.continued = [
        ...opened.work.continued ?? [],
        { what, ...task ? { task } : {}, by: decision, at: nowIso() }
      ];
      saveWork(env.paths, opened.work);
      appendDecision(env.paths, {
        at: nowIso(),
        item: opened.work.id,
        kind: "continue",
        text: `${what} continued for one more round`,
        by: whoDecided(decision)
      });
      const subject = what === "gate" ? `gate of ${task} of ${opened.work.id}` : `${what} of ${opened.work.id}`;
      return ok(`${subject} continued for one more round ${decisionText(env.policy, decision)}`, {
        continued: opened.work.continued
      });
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
      const synced = guarded("the mail was not synced", () => syncMail(env.mail, env.paths));
      let inbox = emptyInboxSummary();
      const summarised = guarded("the inbox was not read", () => {
        inbox = inboxSummary(env.mail);
      });
      const taken = guarded("the replies were not taken", () => takeReplies(env.mail, env.paths, active));
      let tasks = [];
      const listed = guarded("the tasks were not listed", () => {
        tasks = listTasks(env.mail, work);
      });
      const notes = [synced, summarised, taken, listed].filter(Boolean);
      return ok(notes.length ? `${text}
${notes.join(`
`)}` : text, {
        active: work.id,
        title: work.title,
        type: work.type,
        phase: work.phase,
        route: work.route,
        awaiting: work.awaiting,
        awaitingMessage: work.awaitingMessage ?? null,
        mail: { unread: inbox.unread, answered: inbox.answered, waiting: inbox.waiting },
        tasks,
        team: work.seats ?? [],
        primaryTeam: work.primaryTeam ?? null,
        rounds: {
          judgement: work.rounds?.judgement ?? 0,
          validation: work.rounds?.validation ?? 0
        },
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
          next = openForMail(ctx, env.policy, message, delivery);
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
        const lines2 = shown.map((m) => `  ${m.id} · ${m.type} · from ${partyLabel(m.from)} · ${m.subject} · ${m.status}${m.reason ? `: ${m.reason}` : ""}`);
        return ok(`Mail (${ctx.self.workspace ?? "alone"}/${ctx.self.project}, as ${ctx.self.agent}): ${summary.unread} unread, ${summary.answered} answered${lines2.length ? `
${lines2.join(`
`)}` : ""}`, { ...summary, messages: shown });
      }
      if (verb === "read") {
        if (!args[1])
          return refuse(usage);
        syncMail(ctx, env.paths);
        const notes = [];
        const result = markRead(ctx, args[1], notes);
        if ("refused" in result)
          return refuse(result.refused);
        const body = result.bodyFile ? readText(result.bodyFile) ?? result.body : result.body;
        const head = [
          ...notes,
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
        const notes = [];
        const result = reply(ctx, args[1], text, {
          ...typeof parsed.flags.file === "string" ? { filePath: parsed.flags.file } : {},
          ...typeof parsed.flags.branch === "string" ? { branch: parsed.flags.branch } : {},
          ...typeof parsed.flags.item === "string" ? { item: parsed.flags.item } : {},
          ...typeof parsed.flags.as === "string" ? { as: parsed.flags.as } : {}
        }, notes);
        if ("refused" in result)
          return refuse(result.refused);
        return ok(`replied to ${args[1]}: ${result.reply.id} to ${result.reply.to.project}; ${args[1]} answered${notes.length ? `
${notes.join(`
`)}` : ""}`, { reply: result.reply, original: result.original, notes });
      }
      if (verb === "refuse") {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : "";
        if (!args[1] || !reason.trim())
          return refuse(usage);
        const notes = [];
        const result = refuseMail(ctx, args[1], reason, notes);
        if ("refused" in result)
          return refuse(result.refused);
        return ok(`${args[1]} refused: ${reason.trim()}${notes.length ? `
${notes.join(`
`)}` : ""}`, { message: result, notes });
      }
      if (verb === "status") {
        const pruned = pruneRegistry(env.paths.userDir);
        const swept = sweepSafely(ctx);
        const { messages: sessions, tampered, untrusted } = readOpenSessions(ctx);
        const sessionLine = (m) => {
          const opened = m.opened;
          return `  ${m.id} → ${m.to.project}: ${opened.mode} session ${opened.name} (pid ${opened.pid ?? "none"}), since ${opened.startedAt}, ${Math.floor(minutesRun(opened))} of ${opened.maxMinutes} minutes used, ${opened.maxTurns} turns allowed`;
        };
        const sweptLine = sweptText(swept);
        const untrustedLine = (m) => {
          const opened = m.opened;
          const state = pidState(opened);
          const marked = state === "session" ? "" : state === "gone" ? " (gone)" : " (pid now another process)";
          return `${sessionLine(m)}, log ${opened.log}${marked}`;
        };
        const named2 = tampered && !swept.lines.includes(tampered) ? `${tampered}
` : "";
        const listed = tampered ? `${named2}open sessions as the outbox records them (not trusted; stop one with kill -TERM -- -<pid>, then kill -KILL -- -<pid> after a second; read its log): ${untrusted.length ? `
${untrusted.map(untrustedLine).join(`
`)}` : "none"}` : `open sessions: ${sessions.length ? `
${sessions.map(sessionLine).join(`
`)}` : "none"}`;
        let summary = emptyInboxSummary();
        const summarised = guarded("the inbox was not read", () => {
          summary = inboxSummary(ctx);
        });
        return ok(`${summarised || (summary.line ?? `Mail (${ctx.self.workspace ?? "alone"}): inbox empty`)}${sweptLine ? `
${sweptLine}` : ""}
${listed}${pruned.length ? `
registry pruned: ${pruned.join(", ")}` : ""}`, { sessions, untrusted, swept, pruned, ...summary });
      }
      if (verb === "stop") {
        if (!args[1])
          return refuse(usage);
        const notes = [];
        const stopped = stopSession(ctx, args[1], notes);
        if ("refused" in stopped)
          return refuse(stopped.refused);
        return ok(`${stopped.id} stopped (session ${stopped.opened?.name}, pid ${stopped.opened?.pid})${notes.length ? `
${notes.join(`
`)}` : ""}`, { message: stopped, notes });
      }
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
  mail refuse <mid> --reason "<why>" | status | stop <mid>   this project's mail and the sessions it opened (status sweeps them; stop kills one)
  task <id> open T-n --criteria AC-1,AC-2 [--text "<task text>"]   hand a task of the plan to an implementer: a message, a worktree, a branch, a session
  task <id> list | merge T-n [--force]   the tasks and their children; merge a proven child's branch (--force merges an unproven one: asks the user)
  tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires; plans the judgement gates and writes their inputs to .crew/work/<id>/review/
  judgement <id> record --ruling <file>  record the rulings of a review file ({"rulings":[{gate,verdict,reviewer,judge,findings,tokens}]}); exit 0 once proven
  judgement <id> record <gate> --not-run --reason "<why>"   a judgement gate that could not run, never passed by default
  team <id>                   the seats the route plans for the item, with their reasons, recorded
  validation <id> record --what spec|plan|delivery --by lead-<team> --file <path>   a lead's verdict from its file; a contradiction is refused
  continue <id> judgement|validation|gate T-n   one more round past the policy's cap (the user's decision)
  decisions [--grep <text>]   the project's decision register, newest first; the engine appends at every decision
  metrics [--workspace <ws>]  the figures of this project, or of the workspace's registered projects, from the records
  cto record --workspace <ws> --file <plan.md>   file the CTO's plan under the user's crew directory
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
