/**
 * The words a command's lead is read by, shared by `run.ts` (the words a test-first command may
 * record, finding 91) and the PreToolUse hook (the lead of every Bash command): one table, so the
 * two readers never drift (finding 98: `env -P /x sh -c a b` passed one reader and not the other),
 * and the one quoting rule both write a word with (`quoteWord`).
 */

/** The shells whose `-c` takes a command string. */
export const SHELL_NAMES: readonly string[] = ["sh", "bash", "zsh", "dash", "ksh", "fish"];

/**
 * A shell's own options that take the next word: `-o`/`+o` (set) and `-O`/`+O` (shopt), as a word
 * or as a cluster's last letter (`-eo pipefail`), and the long ones (`--rcfile x`; `--rcfile=x`
 * carries its value).
 */
const SHELL_VALUED: { short: string; long: readonly string[] } = {
  short: "oO",
  long: ["--rcfile", "--init-file"],
};

/** Whether a shell's option word (`-eo`, `+O`, `--rcfile`) takes the next word. */
export function shellTakesNext(option: string): boolean {
  if (option.startsWith("--")) return SHELL_VALUED.long.includes(option);
  return option.length > 1 && SHELL_VALUED.short.includes(option.charAt(option.length - 1));
}

// A wrapper's option that takes a value takes the next word, short (`nice -n 5`, `sudo -u me`,
// `env -u VAR`, `env -vu VAR`) or long (`env --unset VAR`, `timeout --signal KILL`); some take a
// positional of their own, before or after the options (`timeout 5`, `flock f`, `script out.txt`,
// `su root`); `env` takes assignments too; `coproc` takes a name before its block; `function` takes
// the function's name before its body.
export interface CommandWrapper {
  name: string;
  /** The short options that take a value, as letters. */
  valued: string;
  /** The long options that take a value (`--name value` or `--name=value`). */
  longValued: string[];
  /** Words of its own before the command (`timeout 5`, `flock /tmp/l`). */
  positionals: number;
  /** Takes `NAME=value` words before the command (`env FOO=1 cmd`). */
  assignments?: true;
  /** Options whose value is a command line of its own (`env -S "a b"`, `flock f -c "a b"`). */
  scriptOptions?: string[];
  /** Joins the words after the script option's value to the script (`env -S "a b" c` runs `a b c`); `flock` is kept with it, since its words after `-c` are not known to be ignored, and an over-read fails closed. */
  scriptAppends?: true;
  /** Options whose value is the name of a variable the wrapper unsets (`env -u NAME`). */
  unsetOptions?: string[];
  /** Takes a name before a `{` block (`coproc NAME {`). */
  namedBlock?: true;
}

/** The JavaScript runners a crew bundle may stand behind, and the npx-style ones that name a package, with the Windows suffixes each reader accepts: written once for the POSIX and PowerShell readers. */
export const JS_RUNNERS = ["node", "bun"] as const;
export const NPX_RUNNERS = ["npx", "bunx"] as const;
export const RUNNER_SUFFIXES = { js: [".exe"], npx: [".cmd", ".exe"] } as const;
/** The suffixes as an optional group of a regular expression. */
export function runnerSuffix(suffixes: readonly string[]): string {
  return `(?:${suffixes.map((s) => s.replace(".", "\\.")).join("|")})?`;
}
/** The wrappers a shell may stand behind in a recorded command: read by both readers, written once. */
export const COMMAND_WRAPPERS: readonly CommandWrapper[] = [
  {
    // GNU env's options and BSD env's (`-P altpath`, `-L`/`-U user`), since both are met.
    name: "env",
    valued: "uCPLU",
    longValued: ["--unset", "--chdir", "--block-signal", "--default-signal", "--ignore-signal"],
    positionals: 0,
    assignments: true,
    scriptOptions: ["-S", "--split-string"],
    scriptAppends: true,
    unsetOptions: ["-u", "--unset"],
  },
  { name: "command", valued: "", longValued: [], positionals: 0 },
];

/** Whether a wrapper's option word takes the next word as its value: a long name in the list, or a cluster whose last letter is valued. */
export function takesNext(wrapper: CommandWrapper, option: string): boolean {
  if (option.includes("=")) return false;
  if (option.startsWith("--")) return wrapper.longValued.includes(option);
  for (let i = 1; i < option.length; i++)
    if (wrapper.valued.includes(option.charAt(i))) return i === option.length - 1;
  return false;
}

const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;
/** One word, quoted for a POSIX shell's reading: a word of safe characters stays as it is, the rest goes in single quotes. The engine's one rule, for the words after `crew tdd --`, the words `env -S "a b" c` appends to its string and `find -exec`'s, so a comma list stays a bare word and a `#` or a `;` stays the word it is. */
export function quoteWord(word: string): string {
  return SAFE_WORD.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

/**
 * The wrappers a shell may stand behind in a command, as both readers read them (the hook's walker and
 * the PowerShell reader's command positions): `COMMAND_WRAPPERS` and the shell's own words that take
 * one of their own before the command. What a wrapper's options take is said at `CommandWrapper`.
 */
export const WRAPPERS: readonly CommandWrapper[] = [
  // The shell's own words that take one of their own before the command: a function's name, a case's subject.
  { name: "function", valued: "", longValued: [], positionals: 1 },
  { name: "case", valued: "", longValued: [], positionals: 1 },
  { name: "nice", valued: "n", longValued: ["--adjustment"], positionals: 0 },
  {
    name: "timeout",
    valued: "sk",
    longValued: ["--signal", "--kill-after"],
    positionals: 1,
  },
  { name: "stdbuf", valued: "ioe", longValued: ["--input", "--output", "--error"], positionals: 0 },
  {
    name: "flock",
    valued: "w",
    longValued: ["--wait", "--timeout", "--conflict-exit-code"],
    positionals: 1,
    scriptOptions: ["-c", "--command"],
    scriptAppends: true,
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
      "--output-limit",
    ],
    positionals: 1,
    scriptOptions: ["-c", "--command"],
  },
  {
    name: "su",
    valued: "gGsw",
    longValued: ["--group", "--supp-group", "--shell", "--whitelist-environment"],
    positionals: 1,
    scriptOptions: ["-c", "--command", "--session-command"],
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
      "--other-user",
    ],
    positionals: 0,
  },
  { name: "doas", valued: "uC", longValued: [], positionals: 0 },
  // `env` and `command`, the wrappers a recorded test-first command may stand behind, come from the
  // table `run.ts` reads too (finding 98: two copies had drifted).
  ...COMMAND_WRAPPERS,
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
      "--process-slot-var",
    ],
    positionals: 0,
  },
  { name: "nohup", valued: "", longValued: [], positionals: 0 },
  { name: "time", valued: "fo", longValued: ["--format", "--output"], positionals: 0 },
  { name: "builtin", valued: "", longValued: [], positionals: 0 },
  { name: "caffeinate", valued: "tw", longValued: [], positionals: 0 },
  {
    name: "ionice",
    valued: "cnp",
    longValued: ["--class", "--classdata", "--pid"],
    positionals: 0,
  },
  { name: "noglob", valued: "", longValued: [], positionals: 0 },
  { name: "nocorrect", valued: "", longValued: [], positionals: 0 },
  { name: "coproc", valued: "", longValued: [], positionals: 0, namedBlock: true },
];
