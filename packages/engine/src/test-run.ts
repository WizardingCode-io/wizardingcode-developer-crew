/**
 * Whether a `crew tdd` command is a test run by its structure (finding 153: `sh -c 'exit 1'` was
 * recorded as a red, a run that failed for no test's reason). The command is read with the hook's
 * shell reader: before the test only `cd`, `export`, `set` or assignments; the test is a runner in
 * its test form or an interpreter on a file of the repository that looks like a test; after it only
 * `| tee` or `| cat`. The rule guards a mistake, not an agent that writes a failing file on purpose:
 * a file with a test's name that holds `exit 1` still passes.
 */
import { realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { type Piece, readCommand } from "./hooks/shell.ts";
import { shellTakesNext } from "./shell-words.ts";

/** The runners whose every form is a test run, by the executable's last path segment. */
const RUNNERS = new Set(["vitest", "jest", "mocha", "ava", "pytest", "phpunit", "pest", "rspec"]);
/** The tools whose first operand names the test form. */
const SUBCOMMAND_TEST = new Set(["deno", "go", "cargo", "dotnet", "swift", "composer"]);
/** The package managers: `test`, or `run <script naming test>`. */
const PACKAGE_MANAGERS = new Set(["npm", "pnpm", "yarn", "bun"]);
/** A package manager's options that take the next word. */
const MANAGER_VALUED = new Set([
  "--filter",
  "-F",
  "-C",
  "--prefix",
  "--dir",
  "--cwd",
  "--workspace",
]);
const INTERPRETERS = new Set(["sh", "bash", "node", "bun", "php", "ruby"]);
const PYTHON = /^python(?:\d+(?:\.\d+)?)?$/;
const SETUP = new Set(["cd", "export", "set"]);
const AFTER = new Set(["tee", "cat"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/** A redirect written as its own word: the operator alone takes the next word as its target. */
const REDIRECT = /^(?:\d+|&)?(?:[<>]+&?)(\S*)$/;
const TEST_FOLDERS = new Set(["test", "tests", "spec", "specs", "__tests__"]);
// `test_x.py` is pytest's own name for a test file, beside the criterion's list.
const TEST_NAME = /\.test\.|\.spec\.|_test\.|-test\.|Test\.php$|Tests\.cs$|^test_.*\.py$/;

const operandsOf = (args: readonly string[]): string[] => args.filter((a) => !a.startsWith("-"));

/** The words a program receives, without the redirects and their targets. */
function programWords(piece: Piece): { words: string[]; expands: boolean[] } {
  const words: string[] = [];
  const expands: boolean[] = [];
  for (let i = 0; i < piece.tokens.length; i++) {
    const token = piece.tokens[i];
    if (!token) continue;
    const redirect = REDIRECT.exec(token.raw);
    if (redirect) {
      if (!redirect[1]) i++;
      continue;
    }
    words.push(token.word);
    expands.push(token.expands);
  }
  return { words, expands };
}

/** Why the file an interpreter is given is no test file of the repository, or null. */
function fileRefusal(operand: string, cwd: string, root: string): string | null {
  let real: string;
  try {
    real = realpathSync(resolve(cwd, operand));
  } catch {
    return `${operand} is no file`;
  }
  if (!statSync(real).isFile()) return `${operand} is no regular file`;
  const rel = relative(realpathSync(root), real);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    return `${operand} is outside the repository`;
  const segments = rel.split(sep);
  const name = segments.pop() ?? "";
  if (segments.some((s) => TEST_FOLDERS.has(s)) || TEST_NAME.test(name) || RUNNERS.has(name))
    return null;
  return `${operand} does not look like a test file`;
}

/** Why one simple command is no test, or null; `nested` once a shell's `-c` string was read. */
function testRefusal(words: string[], cwd: string, root: string, nested: boolean): string | null {
  const name = basename(words[0] ?? "");
  const args = words.slice(1);
  const operands = operandsOf(args);
  if (RUNNERS.has(name)) return null;
  if (SUBCOMMAND_TEST.has(name) && operands[0] === "test") return null;
  if (name === "make" && operands.includes("test")) return null;
  if (name === "mvn" && operands.some((a) => a === "test" || a === "verify")) return null;
  if (
    (name === "gradle" || name === "gradlew") &&
    operands.some((a) => /(?:^|:)(?:test|check)$/.test(a))
  )
    return null;
  if (name === "bundle" && operands[0] === "exec") {
    const [tool, task] = operands.slice(1);
    if (tool === "rspec" || (tool === "rake" && task === "test")) return null;
  }
  if (name === "npx" || name === "bunx") {
    const tool = basename(operands[0] ?? "");
    return RUNNERS.has(tool) ? null : `${name} ${operands[0] ?? ""} runs no test runner`.trim();
  }
  if (PACKAGE_MANAGERS.has(name)) {
    let i = 0;
    while (i < args.length && (args[i] ?? "").startsWith("-"))
      i += MANAGER_VALUED.has(args[i] ?? "") ? 2 : 1;
    const [verb, script] = [args[i], args[i + 1]];
    if (verb === "test") return null;
    if ((verb === "run" || verb === "run-script") && script?.includes("test")) return null;
    if (name !== "bun") return `${name} ${verb ?? ""} is not the test script`.trim();
  }
  if (name === "node" && args.includes("--test")) return null;
  if (PYTHON.test(name) && args[0] === "-m" && (args[1] === "pytest" || args[1] === "unittest"))
    return null;
  if (name === "php" && operands[0] === "artisan" && operands[1] === "test") return null;
  // A Claude Code plugin's own tests (the mod's, `claude plugin test <dir>`).
  if (name === "claude" && operands[0] === "plugin" && operands[1] === "test") return null;
  if (!INTERPRETERS.has(name) && !PYTHON.test(name))
    return `${name || "the command"} is no test runner`;
  // An interpreter: its options, then its first operand, the file it runs.
  let j = 0;
  let commandString = false;
  while (j < args.length && /^[-+]/.test(args[j] ?? "")) {
    const option = args[j] ?? "";
    if ((name === "sh" || name === "bash") && /^-[A-Za-z]*c[A-Za-z]*$/.test(option))
      commandString = true;
    j += (name === "sh" || name === "bash") && shellTakesNext(option) ? 2 : 1;
  }
  if (commandString) {
    if (nested) return "a shell's string runs another shell's string";
    if (args.length > j + 1) return `words follow ${name}'s string`;
    const reading = readCommand(args[j] ?? "");
    if (reading.unclosed) return `${name}'s string leaves ${reading.unclosed} open`;
    return linesRefusal(reading.pieces, cwd, root, true);
  }
  const operand = args[j];
  if (operand === undefined) return `${name} is given no file`;
  return fileRefusal(operand, cwd, root);
}

/** Why a command line read into simple commands is no test run, or null. */
function linesRefusal(
  pieces: Piece[],
  start: string,
  root: string,
  nested: boolean,
): string | null {
  if (pieces.some((p) => p.inner.length || p.heredocs.length))
    return "a substitution or a here-document runs or feeds a command of its own";
  let cwd = start;
  let i = 0;
  for (; i < pieces.length; i++) {
    const piece = pieces[i] as Piece;
    const { words, expands } = programWords(piece);
    const first = words.findIndex((w) => !ASSIGNMENT.test(w));
    if (first !== -1 && !SETUP.has(words[first] ?? "")) break;
    if (piece.piped) return "a setup command reads another command's output";
    if (words[first] === "cd") {
      const target = words[first + 1];
      if (target === undefined || target === "-" || expands[first + 1] || words.length > first + 2)
        return "cd is given no plain folder";
      cwd = resolve(cwd, target);
    }
  }
  const test = pieces[i];
  if (!test) return "no command runs a test";
  if (test.piped) return "the test reads another command's output";
  const { words, expands } = programWords(test);
  let at = 0;
  while (at < words.length && ASSIGNMENT.test(words[at] ?? "")) at++;
  if (basename(words[at] ?? "") === "env") {
    at++;
    while (at < words.length && ASSIGNMENT.test(words[at] ?? "")) at++;
    if ((words[at] ?? "").startsWith("-")) return "env is given options";
  }
  if (expands[at]) return "the command's name is an expansion";
  const why = testRefusal(words.slice(at), cwd, root, nested);
  if (why) return why;
  for (const after of pieces.slice(i + 1)) {
    const name = basename(programWords(after).words[0] ?? "");
    if (!after.piped || !AFTER.has(name)) return `${name || "a command"} runs after the test`;
  }
  return null;
}

/**
 * Why `command` is no test run, or null. The profile's own test command (and that command with
 * more words as its arguments) is the project's test run whatever its form; an unparsable command
 * is left to the shell's own refusal (finding 144).
 */
export function testRunRefusal(
  command: string,
  root: string,
  profileCommand: string | null,
): string | null {
  const reading = readCommand(command);
  if (reading.unclosed) return null;
  // The profile's command with more words of its own: the same simple commands, none added after
  // it with `;`, `&&`, `||` or `|`, which are read like any other (the security review's F-1).
  const own = profileCommand?.trim();
  if (own && (command === own || command.startsWith(`${own} `))) {
    const mine = readCommand(own).pieces.length;
    if (reading.pieces.length === mine && !reading.pieces.some((p) => p.inner.length)) return null;
  }
  return linesRefusal(reading.pieces, root, root, false);
}
