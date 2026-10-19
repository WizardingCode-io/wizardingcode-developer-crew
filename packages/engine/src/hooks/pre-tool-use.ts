import { isAbsolute, join, relative } from "node:path";
import { type Parsed, parse } from "../argv.ts";
import { isWatched } from "../fingerprint.ts";
import { nowIso } from "../fs.ts";
import { canonical, isProtectedPath, REVIEW_OPEN_SEGMENT } from "../paths.ts";
import { recordWorking } from "../state.ts";
import type { Policy } from "../types.ts";
import { activeWork, isBeforeBuild, loadWork } from "../work.ts";
import { LEADING_KEYWORDS, OPERATOR_PREFIX, type Piece, readCommand, type Token } from "./shell.ts";
import { roleOf, teamOf } from "./subagent-stop.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// The Bash rules read one simple command at a time, as the one reader in shell.ts gives them
// (`walk`). A crew command is read from its words, as the CLI's parser reads them
// (`crewCommandsOf`): `crew` or a path ending in `/crew.mjs` (the bundle run through node) as the
// program, after the shell's keywords, the wrappers and the assignments. Quoting a word or calling
// the bundle by path changes nothing; the same words inside another program's argument (`grep 'crew
// accept'`) are text, not the command (finding 16 of the real-use phase).
// The shells are no wrappers: in an opened session a shell with its script on its input (`echo … |
// sh`, `bash -s < f`) is denied, so they stand as the program; a shell given its script with `-c`
// hands it on (`handedOn`), as `eval` and `trap` do (security review of SP2c task 3, round 13).
const SHELL_NAMES = ["sh", "bash", "zsh", "dash", "ksh", "fish"];
const SHELLS = `(?:${SHELL_NAMES.join("|")})`;
// The review folder is the engine's except the captures and the e2e folders (SP7b decision 16):
// `ui` or `e2e` as a whole segment right under `review/` or `review/T-n/`, with a tail of segments
// none of which is `..`; anything else under `review` is an engine file.
// Read as: `review`, unless what follows is `/<open segment>` (paths.ts names it) and then only
// segments none of which is `..`, up to a path's end (whitespace, a quote, a separator or the end).
const PATH_END = String.raw`[\s"'\x60;&|)]`;
const NOT_DOTDOT_SEGMENT = String.raw`(?!\.\.(?:\/|${PATH_END}|$))[^\s"'\x60;&|)/]*\/?`;
const REVIEW_OWNED = String.raw`review(?!\/${REVIEW_OPEN_SEGMENT}(?:\/(?:${NOT_DOTDOT_SEGMENT})*)?(?=${PATH_END}|$))`;
const ENGINE_FILES = new RegExp(
  String.raw`\.crew\/(?:profile\.json|policy\.json|decisions\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|objections\.json|mail\.json|report\.md|logs\b|${REVIEW_OWNED}))|\.wizardingcode\/crew\b`,
);
// A verb may follow a quote (`bash -c "rm ..."`). A redirect is a write only when its target is an
// engine file (the `2>` of `2>/dev/null` after a read is not).
const WRITE_SHAPE =
  /(?:^|[\s;&|("'])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\|?\s*["']?\S*(?:\.crew\/|\.wizardingcode\/crew\b)/;
// A redirect whose target cannot be read from the text (`$F`, `$(...)`, a backtick) may reach an
// engine file through a variable set in another simple command: a deny rule fails closed on it
// whenever the whole command names one.
const OPAQUE_REDIRECT = />{1,2}\|?\s*["']?[$`]/;

// Modes that show no prompt a person answers, even with a person present: `dontAsk` auto-denies
// anything that would prompt, and nothing documents that `bypassPermissions` shows a hook's "ask".
// Auto mode is not one of them: a hook's "ask" forces the prompt there and the classifier cannot
// approve the call in silence (finding 3 revisited, finding 19 of the real-use phase).
const PROMPTLESS_MODES = new Set(["bypassPermissions", "dontAsk"]);
// A crew command by name or by the bundle's path (behind node or bun, with their options), and the
// verbs a read-only session opened by mail may run: its mail read, inbox and reply, its status, the
// help. The rest writes, sends, or runs a shell (`tdd … -- <cmd>`), which the opener's allow-list
// cannot tell apart (security review of SP2c task 4).
const CREW_COMMAND = /^(?:\S*\/)?crew(?:\.mjs)?$/;
const CREW_BUNDLE = /^(?:\S*\/)?crew\.mjs$/;
const JS_RUNNER = /^(?:\S*\/)?(?:node|bun)$/;
const READ_ONLY_VERBS = new Set(["status", "help"]);
const READ_ONLY_MAIL = new Set(["read", "inbox", "reply", "status"]);
// The opener's variables are the engine's record of what the session is, so no command of the
// session names, sets, unsets or clears them: the name anywhere in the command line; a set, an
// export, a read or an unset of a name the hook cannot read (an expansion, a substitution, a
// pattern, nothing); and a run with the environment cleared (`env -i`, `env -S`, `exec -c`)
// (security review of SP2c task 4, rounds 2 to 4). These shapes are matched on each piece's text
// with its quotes removed, wherever they stand in it; the names `env -u`/`--unset` take come from
// the word reader, as the wrapper table spells env's options (`Command.unsets`).
const OPENER_VAR = /WIZARDINGCODE_\w+|CLAUDE_CODE_SESSION_ATTENDED/;
const UNSET = /(?:^|[\s;&|({])unset(?:\s+-\S+)*((?:\s+[^\s;&|]+)*)/;
const PLUS_X =
  /(?:^|[\s;&|({])(?:declare|typeset|export|readonly|local)\s+(?:[-+]\S+\s+)*\+\S*x\b((?:\s+[^\s;&|]+)*)/;
const SETTER =
  /(?:^|[\s;&|({])(?:(?:export|declare|typeset|readonly|local)(?:\s+-\S+)*|read(?:\s+-\S+)*|printf\s+-v)((?:\s+[^\s;&|]+)*)/;
const UNREADABLE_ASSIGNMENT = /(?:^|[\s;&|({])[^\s=;&|$\x60{*?[]*[$\x60{*?[][^\s=;&|]*=/;
const UNREADABLE_NAME = /^$|[$\x60{(*?[\]]/;
const CLEARED_ENVIRONMENT =
  /(?:^|[\s;&|({])(?:env(?:\s+-\S+)*\s+(?:-[A-Za-z]*[iS][A-Za-z]*|--ignore-environment|--split-string(?:=\S*)?|-)(?=\s|$)|exec\s+(?:-\S+\s+)*-[A-Za-z]*c\b)/;
// A word the hook cannot read as a path: a pattern or an expansion after a lead that may stand for
// the home or anywhere (`/…`, `~`, `$HOME`, `${HOME}`, `$X`), or in a word through a parent
// (`../…`). A plain word under the home or the root is read as it stands.
function unreadablePath(word: string): boolean {
  const lead =
    /^(?:~|\$\w+|\$\{[^}]*\})(?=\/|$)/.exec(word)?.[0] ?? (word.startsWith("/") ? "/" : "");
  if (!lead && !/(?:^|\/)\.\.(?:\/|$)/.test(word)) return false;
  return /[*?[{$\x60]/.test(word.slice(lead.length));
}
/** Whether a word that names variables cannot be read (empty, an expansion, a substitution, a pattern); `NAME=value` is read by its name. */
function unreadableNames(words: string, allowEmpty = false): boolean {
  const names = words
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((n) => n.split("=")[0] ?? "");
  return (!allowEmpty && !names.length) || names.some((n) => UNREADABLE_NAME.test(n));
}
/** What a piece's text does to the opener's variables beyond naming one (the caller reads a name anywhere in the whole line first), or null. */
function variableDenial(cleaned: string): string | null {
  if (CLEARED_ENVIRONMENT.test(cleaned)) return "a cleared environment";
  const unset = UNSET.exec(cleaned);
  if (unset && unreadableNames(unset[1] ?? "")) return "unset";
  const plusX = PLUS_X.exec(cleaned);
  if (plusX && unreadableNames(plusX[1] ?? "")) return "declare +x";
  const setter = SETTER.exec(cleaned);
  if (setter && unreadableNames(setter[1] ?? "", true)) {
    const word = setter[0].trim().split(/\s+/)[0] ?? "";
    return word === "read" ? "read" : word === "printf" ? "printf -v" : "export";
  }
  if (UNREADABLE_ASSIGNMENT.test(cleaned)) return "an assignment";
  return null;
}
// What stands before a program in a simple command and is not it: an assignment, the shell's
// keywords, a wrapper that runs the rest. One table names the wrappers and their options, and one
// reader, `withoutLead`, drops them from the words of a piece the shell reader gave, its redirects
// gone first (an operator that stood outside quotes; a quoted or escaped literal shaped like one is
// a word); every rule that reads a command's program, verb, words or shape reads that one walk of
// the line (`walk`: the crew commands, the opened session's verbs, its cd and folder rules, the
// read-only rule). What still reads a piece's text with its quotes removed is what is matched
// wherever it stands, not at the command position: the opener's variables (`variableDenial`, after
// the name anywhere in the line) and `GIT_CONFIG_*` on the whole line; the folder rule reads a
// piece's every token, the lead's assignments and the redirects' targets included, since a word
// that names the engine's folder is denied wherever it stands; the engine-file write rule alone
// still reads the pieces' raw text, as it did before this item (code-quality review of SP2c task 4,
// rounds 4 to 13). A wrapper's option that takes a value takes the next word, short (`nice -n 5`,
// `sudo -u me`, `env -u VAR`, `env -vu VAR`) or long (`env --unset VAR`, `timeout --signal KILL`);
// some take a positional of their own, before or after the options (`timeout 5`, `flock f`,
// `script out.txt`, `su root`); `env` takes assignments too; `coproc` takes a name before its
// block; `function` takes the function's name before its body.
interface Wrapper {
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
  /** Options whose value is the name of a variable the wrapper unsets (`env -u NAME`). */
  unsetOptions?: string[];
  /** Takes a name before a `{` block (`coproc NAME {`). */
  namedBlock?: true;
}
// The shell's keywords before a command and the ones that close a compound command, which stand
// alone in a piece (`fi`, `done`, `esac`) and run nothing.
const KEYWORDS = [...LEADING_KEYWORDS, "fi", "done", "in", "esac"];
const WRAPPERS: Wrapper[] = [
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
  {
    // GNU env's options and BSD env's (`-P altpath`, `-L`/`-U user`), since both are met.
    name: "env",
    valued: "uCPLU",
    longValued: ["--unset", "--chdir", "--block-signal", "--default-signal", "--ignore-signal"],
    positionals: 0,
    assignments: true,
    scriptOptions: ["-S", "--split-string"],
    unsetOptions: ["-u", "--unset"],
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
      "--process-slot-var",
    ],
    positionals: 0,
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
    positionals: 0,
  },
  { name: "noglob", valued: "", longValued: [], positionals: 0 },
  { name: "nocorrect", valued: "", longValued: [], positionals: 0 },
  { name: "coproc", valued: "", longValued: [], positionals: 0, namedBlock: true },
];
const WRAPPER_BY_NAME = new Map(WRAPPERS.map((w) => [w.name, w]));
// What node and bun take a value for, before the script they run (`node -r ./a.js …/crew.mjs`).
const JS_RUNNER_VALUED = new Set([
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
  "-c",
]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*\+?=/;
// A group's braces stand alone as words (the shell reader separates at parentheses, so none reaches
// a word); a `{` glued to a word is a brace expansion, read with the word.
const BRACKETS = ["{", "}"];
/**
 * Whether an option word takes the next word as its value, by the wrapper's table: a long option
 * listed there without `=`, or a cluster of short options whose last letter takes a value (`-n 5`,
 * `-vu VAR`; `-n5` carries its own).
 */
function takesNext(wrapper: Wrapper, option: string): boolean {
  if (option.includes("=")) return false;
  if (option.startsWith("--")) return wrapper.longValued.includes(option);
  for (let i = 1; i < option.length; i++)
    if (wrapper.valued.includes(option.charAt(i))) return i === option.length - 1;
  return false;
}
/**
 * The value one of the named options of a wrapper carries, or null: a long option with its value
 * attached or next (`--split-string="a b"`, `--command "a b"`, `--unset NAME`), a short option on
 * its own or in a cluster with the value attached or next (`-S "a b"`, `-S"a b"`, `-vS "a b"`, `-vu
 * NAME`, `-uNAME`); a letter that takes a value ends the cluster first (`-uS` unsets S).
 */
function optionValue(
  wrapper: Wrapper,
  names: string[],
  option: string,
  next: string | undefined,
): string | null {
  if (!names.length || option === "-" || option === "--") return null;
  if (option.startsWith("--")) {
    const [name, attached] = option.split(/=(.*)/s, 2);
    return names.includes(name ?? "") ? (attached ?? next ?? "") : null;
  }
  for (let i = 1; i < option.length; i++) {
    const letter = option.charAt(i);
    if (names.includes(`-${letter}`)) return option.slice(i + 1) || next || "";
    if (wrapper.valued.includes(letter)) return null;
  }
  return null;
}
/** What `withoutLead` reads out of a command's words. */
interface Lead {
  /** The words behind the lead. */
  words: string[];
  /** Whether `xargs` stood in the lead: the command's words then come from its input, which cannot be read. */
  viaXargs: boolean;
  /** The names env's `-u`/`--unset` take in the lead. */
  unsets: string[];
  /** The first wrapper in the lead, by name: what a rule names when nothing stands behind the lead. */
  firstWrapper?: string;
  /** The command line a wrapper was given as one string (`env -S`, `flock -c`). */
  script?: string;
}
/**
 * The words of a command behind its lead: assignments, keywords, a group's brace, and each wrapper
 * with its options, their values, its own positionals (before or after its options) and, for
 * `coproc`, the name before its block.
 */
function withoutLead(words: string[]): Lead {
  let i = 0;
  let viaXargs = false;
  let firstWrapper: string | undefined;
  const unsets: string[] = [];
  while (i < words.length) {
    const w = words[i] ?? "";
    const wrapper = WRAPPER_BY_NAME.get(w.replace(/^.*\//, ""));
    if (ASSIGNMENT.test(w) || KEYWORDS.includes(w) || BRACKETS.includes(w)) i++;
    else if (wrapper) {
      viaXargs ||= wrapper.name === "xargs";
      firstWrapper ??= wrapper.name;
      i++;
      let positionals = wrapper.positionals;
      for (;;) {
        const word = words[i] ?? "";
        if (i < words.length && word.startsWith("-")) {
          const script = optionValue(wrapper, wrapper.scriptOptions ?? [], word, words[i + 1]);
          if (script !== null) return { words: [], viaXargs, unsets, firstWrapper, script };
          const unset = optionValue(wrapper, wrapper.unsetOptions ?? [], word, words[i + 1]);
          if (unset !== null) unsets.push(unset);
          i++;
          if (takesNext(wrapper, word)) i++;
        } else if (i < words.length && wrapper.assignments && ASSIGNMENT.test(word)) i++;
        else if (i < words.length && positionals > 0) {
          positionals--;
          i++;
        } else break;
      }
      if (
        wrapper.namedBlock &&
        /^\w+$/.test(words[i] ?? "") &&
        (words[i + 1] ?? "").startsWith("{")
      )
        i++;
    } else break;
  }
  const rest = words.slice(i);
  if (rest.length) {
    const last = rest.length - 1;
    rest[last] = (rest[last] ?? "").replace(/}+$/, "") || (rest[last] ?? "");
  }
  return { words: rest, viaXargs, unsets, firstWrapper };
}
// A redirect's operator at the head of a token as written (`>/dev/null`, `2>&1`, `&>>log`, `>|file`,
// `<file`, `{fd}>file`, `2>&-`; the reader ends a word before an unquoted operator, so `main>x` is
// two tokens): a quote or a backslash before it makes the token a literal the shell hands to the
// program, not a redirect (security review of SP2c task 4, round 10). A bare operator takes the
// next token as its target (`> /dev/null`). A here-string (`<<<word`, `<<< word`, `0<<<word`) is a
// redirect too, dropped the same way, except that `handedOn` reads the one a shell is given; a
// process substitution (`<(…)`) is a word the reader read apart, not a redirect. The shell takes a
// redirect from anywhere in a simple command, so the tokens are dropped before the lead is read and
// a redirect in front of a wrapper, an assignment or a verb hides nothing (code-quality review,
// round 9; test-quality review, round 12).
const REDIRECT_OPERATOR = new RegExp(`^${OPERATOR_PREFIX}[<>]{1,2}(?![<>])[&|]?`);
const HERE_STRING_OPERATOR = new RegExp(`^${OPERATOR_PREFIX}<<<`);
const PROCESS_SUBSTITUTION = /^[<>]\(/;
function redirectOperator(raw: string): string | undefined {
  if (PROCESS_SUBSTITUTION.test(raw)) return undefined;
  return (HERE_STRING_OPERATOR.exec(raw) ?? REDIRECT_OPERATOR.exec(raw))?.[0];
}
function withoutRedirects(tokens: Token[]): string[] {
  const kept: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const { word, raw } = tokens[i] ?? { word: "", raw: "" };
    // An arithmetic compound (`((…))` as written, one word to the reader) runs no program of its
    // own and names nothing the rules read; its substitutions are pieces of the walk already.
    if (raw.startsWith("((")) continue;
    const operator = redirectOperator(raw);
    if (operator === undefined) kept.push(word);
    else if (raw.length <= operator.length) i++;
  }
  return kept;
}
// What npx and bunx take before the package they run (`npx -y crew …`, `bunx --bun crew …`); the
// value of `-c`/`--call` is a command line of its own, read as a wrapper's string option is.
const NPX_RUNNER = /^(?:\S*\/)?(?:npx|bunx)$/;
const NPX_CALL = ["-c", "--call"];
const NPX_VALUED = new Set(["-p", "--package", ...NPX_CALL, "--shell", "--loglevel"]);
// The two kinds of runner that take options before what they run: node and bun before the bundle,
// npx and bunx before the package.
type RunnerKind = "js" | "npx";
const RUNNER_VALUED: Record<RunnerKind, Set<string>> = { js: JS_RUNNER_VALUED, npx: NPX_VALUED };
/**
 * Where a runner's options end (the index of the first word after them) and, for npx and bunx, the
 * command line `-c`/`--call` carries (`--call=…` too). A `--name=value` carries its own value.
 */
function runnerOptions(words: string[], kind: RunnerKind): { end: number; call: string | null } {
  const valued = RUNNER_VALUED[kind];
  let call: string | null = null;
  let i = 1;
  for (; i < words.length && (words[i] ?? "").startsWith("-"); i++) {
    const option = words[i] ?? "";
    const [name, attached] = option.split(/=(.*)/s, 2);
    if (kind === "npx" && NPX_CALL.includes(name ?? "")) call ??= attached ?? words[i + 1] ?? "";
    if (attached === undefined && valued.has(option)) i++;
  }
  return { end: i, call };
}
/** The arguments of a crew command, when the words are one (`crew …`, `/x/crew.mjs …`, `node [options] …/crew.mjs …`, `npx [options] crew …`); null otherwise. */
function crewArgs(words: string[]): string[] | null {
  const [first] = words;
  if (first === undefined) return null;
  if (CREW_COMMAND.test(first)) return words.slice(1);
  const kind: RunnerKind | null = JS_RUNNER.test(first)
    ? "js"
    : NPX_RUNNER.test(first)
      ? "npx"
      : null;
  if (kind) {
    const { end } = runnerOptions(words, kind);
    const target = words[end] ?? "";
    if (kind === "js" ? CREW_BUNDLE.test(target) : target === "crew") return words.slice(end + 1);
  }
  return null;
}
/** One simple command as the hook reads it: its text and tokens as the shell reader gave them (every rule that reads a piece's words reads these), the pieces of its substitutions, the bodies of its here-documents, its program (by name), what `withoutLead` read (the words behind the lead, its redirects gone, whether `xargs` stood in it, env's unset names, a wrapper's string option) and its crew arguments when it is one. */
interface Command extends Lead {
  piece: string;
  tokens: Token[];
  inner: Piece[];
  heredocs: string[];
  program: string;
  args: string[] | null;
}
// A here-document is data only when a known reader takes it (SP7b decision 21, finding 67): a
// program whose stdin can name no path to write, with every piece downstream in its pipe chain on
// the same list and no process substitution anywhere in the chain. Everything else, an interpreter,
// a wrapper with nothing behind it, a group, `xargs`, a program the reader cannot name and any
// piece inside a substitution, keeps its body read as command lines, as before. The list grows by a
// decision, never by inference.
const DATA_READERS = new Set([
  "cat",
  "tee",
  "head",
  "tail",
  "wc",
  "sort",
  "uniq",
  "grep",
  "tr",
  "cut",
  "fold",
  "fmt",
  "diff",
  "cmp",
  "md5sum",
  "shasum",
  "sha256sum",
  "base64",
  "jq",
  "yq",
]);
// git and gh read text on stdin only for these subcommands (a patch or an index listing names the
// files it rewrites; an alias or a config option runs what it names).
const GIT_TEXT = new Set([
  "commit",
  "tag",
  "notes",
  "check-attr",
  "check-ignore",
  "stripspace",
  "interpret-trailers",
]);
const GH_TEXT = new Set(["pr", "issue", "release", "gist"]);
const PROCESS_SUBSTITUTION_ANYWHERE = /[<>]\(/;

/** Whether a piece only reads what it is given: its program, behind its lead, is a listed reader. */
function readsOnly(piece: Piece): boolean {
  if (PROCESS_SUBSTITUTION_ANYWHERE.test(piece.text)) return false;
  const { program, words } = commandOf(piece);
  if (program === "git") return GIT_TEXT.has(words[1] ?? "");
  if (program === "gh") return GH_TEXT.has(words[1] ?? "");
  return DATA_READERS.has(program);
}

/** The texts the write rules judge: every piece's text, its here-document bodies unless a known reader takes them, and the same inside its substitutions, whose bodies are always judged. */
function judgedTexts(pieces: Piece[], inner = false): string[] {
  const texts: string[] = [];
  pieces.forEach((piece, i) => {
    texts.push(piece.text);
    let data = !inner && readsOnly(piece);
    for (let j = i + 1; data && j < pieces.length && pieces[j]?.piped; j++)
      data = readsOnly(pieces[j] as Piece);
    if (!data)
      texts.push(...piece.heredocs.flatMap((body) => body.split("\n").filter((l) => l !== "")));
    texts.push(...judgedTexts(piece.inner, true));
  });
  return texts;
}

function commandOf({ text, tokens, inner, heredocs }: Piece): Command {
  const lead = withoutLead(withoutRedirects(tokens));
  const args = crewArgs(lead.words);
  return {
    ...lead,
    piece: text,
    tokens,
    inner,
    heredocs,
    program: (lead.words[0] ?? "").replace(/^.*\//, ""),
    args: args ? args.flatMap(splitFlagValue) : null,
  };
}
/** A crew command found in a command line: its arguments, and whether its words come from `xargs`' input. */
interface CrewCommand {
  args: string[];
  viaXargs: boolean;
}
// What a shell takes a value for before its `-c` script (`bash -o pipefail -c "…"`); `--` ends its options.
const SHELL_VALUED = new Set(["-o", "+o", "-O", "+O", "--rcfile", "--init-file"]);
/** The script a shell is given with `-c` (in an option cluster too), or null: the first word after its options. */
function shellScript(program: string, words: string[]): string | null {
  if (!SHELL_NAMES.includes(program) || !words.some((w) => /^-[A-Za-z]*c[A-Za-z]*$/.test(w)))
    return null;
  for (let i = 1; i < words.length; i++) {
    const w = words[i] ?? "";
    if (w === "--") return words[i + 1] ?? "";
    if (!/^[-+]/.test(w)) return w;
    if (SHELL_VALUED.has(w)) i++;
  }
  return "";
}
// What `watch` takes a value for before the command it runs, which it joins and gives to a shell.
const WATCH_VALUED = new Set(["-n", "--interval"]);
/**
 * The command line a simple command hands on to be run, or null: a wrapper's string option (`env -S
 * "…"`, `flock f -c "…"`, `script -c "…"`, `su -c "…"`), a shell's `-c` script, a here-string or a
 * here-document a shell reads, `eval`'s words, `trap`'s first word (run when the signal comes), the
 * words after `find -exec` up to `;` or `+`, npx's `-c`, `watch`'s words.
 */
function handedOn({ program, words, script, tokens, heredocs }: Command): string | null {
  if (script !== undefined) return script;
  const shell = shellScript(program, words);
  if (shell !== null) return shell;
  // A here-string or a here-document is a command line only when a shell reads it (`bash <<< "…"`,
  // `bash <<EOF`); to any other program (`cat <<< "…"`) it is text. The here-string stands among the
  // tokens, dropped from the words as the redirect it is; its text is what follows the operator, in
  // its own token or the next. The here-document's body is the piece's, as the reader gave it.
  if (SHELL_NAMES.includes(program)) {
    const here = tokens.findIndex((t) => HERE_STRING_OPERATOR.test(t.raw));
    const operator = HERE_STRING_OPERATOR.exec(tokens[here]?.raw ?? "")?.[0];
    if (operator !== undefined)
      return tokens
        .slice(here)
        .map((t) => t.word)
        .join(" ")
        .slice(operator.length)
        .trim();
    if (heredocs.length) return heredocs.join("\n");
  }
  if (program === "eval") return words.slice(1).join(" ");
  if (program === "trap") return words.slice(1).find((w) => !w.startsWith("-")) ?? "";
  const exec = words.findIndex((w) => /^-(?:exec|execdir|ok|okdir)$/.test(w));
  if (program === "find" && exec !== -1)
    return words
      .slice(exec + 1)
      .filter((w) => w !== ";" && w !== "+")
      .join(" ");
  if (NPX_RUNNER.test(program)) return runnerOptions(words, "npx").call;
  if (program === "watch") {
    let i = 1;
    for (; i < words.length && (words[i] ?? "").startsWith("-"); i++)
      if (WATCH_VALUED.has(words[i] ?? "")) i++;
    return words.slice(i).join(" ");
  }
  return null;
}
/** A simple command found in a command line, with the command line it hands on, if any. */
interface Found extends Command {
  handed: string | null;
}
/** What the walk of a command line found, and what the shell reader could not close (a quote, a substitution), which the shell would refuse to run. */
interface Walk {
  found: Found[];
  unreadable: string | null;
}
/**
 * The one walk of a command line every rule of the hook reads: every simple command in it, at any
 * depth, each before those inside it (in each simple command, inside its substitutions as the shell
 * reader read them apart, inside what a wrapper, a shell, `eval`, `trap`, `find -exec`, npx or
 * `watch` is given to run). Each knows whether `xargs` stood in a lead above it (its words then
 * come from xargs' input, which cannot be read). The hook's rules read these, so a flag that takes a
 * value never passes as the verb and a script never hides a command (security review, rounds 3, 4,
 * 7, 12 and 13).
 */
function walk(command: string): Walk {
  const found: Found[] = [];
  let unreadable: string | null = null;
  const pieces = (text: string): Piece[] => {
    const reading = readCommand(text);
    unreadable ??= reading.unclosed;
    return reading.pieces;
  };
  const visit = (read: Piece[], inherited: boolean): void => {
    for (const piece of read) {
      const command = commandOf(piece);
      const viaXargs = inherited || command.viaXargs;
      const handed = handedOn(command);
      found.push({ ...command, viaXargs, handed });
      visit(piece.inner, viaXargs);
      if (handed !== null) visit(pieces(handed), viaXargs);
    }
  };
  visit(pieces(command), false);
  return { found, unreadable };
}
/**
 * The crew commands among the simple commands found, as the CLI will parse them. `--key=value` is
 * read as `--key value`: the CLI refuses the first, and the hook errs on the side of reading it.
 */
function crewCommandsOf(found: Found[]): CrewCommand[] {
  return found.flatMap((c) => (c.args ? [{ args: c.args, viaXargs: c.viaXargs }] : []));
}
function splitFlagValue(word: string): string[] {
  const match = /^(--[\w-]+)=(.*)$/.exec(word);
  return match ? [match[1] ?? "", match[2] ?? ""] : [word];
}
// A verb the hook cannot read: an expansion or a pattern (security review of SP2c task 4, round 7).
const UNREADABLE_VERB = /[$\x60*?[{]/;
/**
 * The user-only command among crew's, read from its parsed words (SP2a review, finding C1: the id
 * and the flags in any order): skip, approve, accept, decide, an objection's waive, profile confirm
 * or set, policy accept or set, a task's merge with --force. A help lookup records nothing, so it
 * is none (finding 22). `policyCommand` names the two that change or accept the policy, asked even
 * where the policy relays the rest, since the policy that governs signatures is itself signed by a
 * prompt (ADR 0005). A verb the hook cannot read may be any of these, so it is one.
 */
function userOnlyCommand(
  args: string[],
): { parsed: Parsed; policyCommand: boolean; presence: boolean } | null {
  const parsed = parse(args);
  if (parsed.flags.help === true || parsed.positional.includes("-h")) return null;
  const [verb, second, third] = parsed.positional;
  // A doubt's record says whether a person was there to answer (SP3 Task 4): never asked, but
  // where nobody watches the command must say so with --mode, as a decision must.
  const presence = verb === "question" && third === "add";
  const unreadable = (word: string | undefined) => word !== undefined && UNREADABLE_VERB.test(word);
  const userOnly =
    unreadable(verb) ||
    ((verb === "profile" || verb === "policy") && unreadable(second)) ||
    verb === "skip" ||
    verb === "approve" ||
    verb === "accept" ||
    verb === "decide" ||
    // One more round past a cap is the user's to grant (SP7 §6.1).
    verb === "continue" ||
    // A verb the hook cannot read after the id (finding 86) takes the deciding form: asked, or
    // --mode demanded, never let through on the words around it.
    (verb === "objection" && (parsed.positional.includes("waive") || unreadable(third))) ||
    (verb === "profile" && (second === "confirm" || second === "set" || second === "unset")) ||
    (verb === "policy" && (second === "accept" || second === "set")) ||
    // The business priorities are signed by the user once (SP7 §10.2).
    (verb === "workspace" &&
      (unreadable(second) ||
        (second === "priorities" &&
          (parsed.positional.includes("accept") || unreadable(third))))) ||
    // A doubt is answered by a person (SP7 §10.3, rule 7).
    (verb === "question" && (third === "answer" || unreadable(third))) ||
    // Where Jev is reached is the user's to set (SP3 Task 6); reading it is free.
    (verb === "config" &&
      typeof second === "string" &&
      second.startsWith("jev.") &&
      third !== undefined) ||
    (verb === "task" &&
      ((parsed.positional.includes("merge") && parsed.flags.force === true) || unreadable(third)));
  if (!userOnly && !presence) return null;
  return {
    presence,
    parsed,
    policyCommand: verb === "policy" || (verb === "accept" && second === "policy"),
  };
}
/**
 * `crew resume <id>` is the user's while a jev dispute is held on the item (finding 94), and when
 * the id or the record cannot be read: the conservative form, as for an unreadable verb.
 */
function resumeDecision(
  ctx: HookContext,
  args: string[],
): { parsed: Parsed; policyCommand: boolean; presence: boolean } | null {
  const parsed = parse(args);
  const [verb, id] = parsed.positional;
  if (verb !== "resume") return null;
  const readable = id !== undefined && !UNREADABLE_VERB.test(id);
  const work = readable ? loadWork(ctx.paths, id).work : null;
  if (work && !work.validatorDispute) return null;
  return { parsed, policyCommand: false, presence: false };
}
/**
 * `crew approve <id> audit`, or an unreadable word where `audit` would be, has no unattended form
 * (SP7 §7.5, SP8 decision 9): where nobody watches it is denied whatever the flags, a matching
 * `--mode` included; with a person present the attended policy decides as for any decision
 * (ADR 0005), `--validator` exempting nothing. Null for every other command.
 */
function auditApproval(
  parsed: Parsed,
  permissionMode: string | undefined,
  headless: boolean,
  policy: Policy,
): Decision | null {
  const [verb, , what] = parsed.positional;
  if (verb !== "approve" || what === undefined) return null;
  if (what !== "audit" && !UNREADABLE_VERB.test(what)) return null;
  const where = unwatched(headless, permissionMode);
  if (where)
    return [
      "deny",
      `Crew: an audit's report is signed by a person and no person is watching this session (${where}): run crew await <id> user and end the turn`,
    ];
  if (typeof parsed.flags.mode === "string")
    return [
      "deny",
      `Crew: a person is present (${permissionMode ?? "default"} mode); run the command without --mode so they are asked`,
    ];
  if (policy.attendedDecisions === "relay") return null;
  return [
    "ask",
    "Crew: an audit's report is signed by a person: this command records their signature",
  ];
}

/** The quotes and the backslashes of a command, removed for the rules that read a cleaned text. */
const QUOTES = /["'\\]/g;

// What a session opened by mail may never run (vision §10, SP2c §10): a merge, a push to any branch
// but its own, a release, a deploy. A fixed list the hook can read, not a rule a prompt asks for
// (plan decision 8). Each pattern is matched on the words behind the lead, as `walk` reads them,
// the tool by name or by path (`/opt/homebrew/bin/gh`).
const BIN = String.raw`^(?:\S*/)?`;
const verbEntry = (re: string, what: string): { re: RegExp; what: string } => ({
  re: new RegExp(`${BIN}${re}`),
  what,
});
// What the guard cannot read in a word: an expansion (`$`, a backtick) or a pattern the shell
// expands (a brace, a bracket, a paren, `*`, `?`). One set for the command word, the verbs and a
// push's remote (security review, rounds 13 and 14).
const EXPANSION_CHARS = String.raw`$\x60`;
const PATTERN_CHARS = String.raw`{[(*?`;
const UNREADABLE_WORD = String.raw`\S*[${EXPANSION_CHARS}${PATTERN_CHARS}]`;
// `git` by name or by path, then its `-c k=v` style options before the verb.
const GIT_CMD = String.raw`${BIN}git\s+`;
const GIT_OPTS = String.raw`(?:-\S+(?:\s+\S+)?\s+)`;
const GIT = `${GIT_CMD}${GIT_OPTS}*`;
// Settings that change what a later verb does: an alias names any verb, push.followTags adds the
// tags to a push, remote.<name>.push maps the own branch onto another and remote.<name>.mirror
// pushes everything (a remote's name may carry dots: the key is what follows the last one). None
// is set in an opened session, on the command line (`-c`, `git config`, or `--config-env`, which
// takes any key from a variable and is denied outright) or in the environment (`GIT_CONFIG_COUNT`/
// `_KEY_n`/`_VALUE_n`, `GIT_CONFIG_PARAMETERS`); git's keys are case-insensitive, so the patterns
// are too (security review of SP2c task 3).
const SETTING = String.raw`(?:alias\.|push\.followTags|remote\.[^\s=]+\.(?:push|mirror)|url\.[^\s=]+\.(?:push)?insteadOf)`;
const GIT_CONFIG_ENV = /(?:^|\s)GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)=/;
const OPENED_VERBS: { re: RegExp; what: string }[] = [
  // Another repository by path, before any verb: the session works in its own checkout and nowhere else.
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?-C\\s`), what: "git -C" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--git-dir(?:=|\\s)`), what: "git --git-dir" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--work-tree(?:=|\\s)`), what: "git --work-tree" },
  // `merge` the verb, not `merge-base` or `merge-file`, which read; `pull` is a fetch and a merge;
  // `clean` removes what git does not track, the engine's local records among it.
  { re: new RegExp(`${GIT}merge(?![\\w-])`), what: "git merge" },
  { re: new RegExp(`${GIT}pull\\b`), what: "git pull" },
  { re: new RegExp(`${GIT}clean\\b`), what: "git clean" },
  // A verb that is an expansion or a pattern (`$V`, `{merge,}`, `mer[g]e`): what it expands to
  // cannot be read here. The same for the other tools named below, whose verbs the list reads.
  {
    re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?${UNREADABLE_WORD}`),
    what: "git with an expansion or a pattern as its verb",
  },
  verbEntry(
    String.raw`(?:gh|npm|docker|netlify|fly|kubectl|terraform|aws|gcloud|serverless|sam|cap|crew(?:\.mjs)?)\s+(?:-\S+\s+)*${UNREADABLE_WORD}`,
    "a verb that is an expansion or a pattern",
  ),
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?-c\\s*${SETTING}`, "i"), what: "git -c" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--config-env\\b`), what: "git --config-env" },
  { re: new RegExp(`${GIT}config\\b.*\\b${SETTING}`, "i"), what: "git config" },
  // Git's other verbs that update a remote ref (security review, rounds 2 and 3).
  { re: new RegExp(`${GIT}subtree\\s+push\\b`), what: "git subtree push" },
  { re: new RegExp(`${GIT}send-pack\\b`), what: "git send-pack" },
  { re: new RegExp(`${GIT}http-push\\b`), what: "git http-push" },
  { re: new RegExp(`${GIT}svn\\s+dcommit\\b`), what: "git svn dcommit" },
  { re: new RegExp(`${GIT}p4\\s+submit\\b`), what: "git p4 submit" },
  verbEntry(String.raw`gh\s+release\b`, "gh release"),
  // The remote merge, by the verb; a fork synced to another branch; an alias, which could name any
  // verb; and any write through the API: a method other than GET, or a body (`-f`, `-F`, `--field`,
  // `--raw-field`, `--input` make the request a POST; pflag takes the value attached to a short
  // flag), which can merge, move a ref, cut a release or dispatch a workflow. A read passes.
  verbEntry(String.raw`gh\s+pr\s+merge\b`, "gh pr merge"),
  verbEntry(String.raw`gh\s+repo\s+sync\b`, "gh repo sync"),
  verbEntry(String.raw`gh\s+alias\s+(?:set|import|delete)\b`, "gh alias"),
  verbEntry(
    String.raw`gh\s+api\s(?:.*\s)?(?:(?:-X\s*|--method(?:=|\s+))(?!GET\b)\S|-[fF]|--(?:field|raw-field|input)(?:=|\s))`,
    "gh api write",
  ),
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
  verbEntry(String.raw`sam\s+deploy\b`, "sam deploy"),
];
const PUSH = new RegExp(`${GIT}push\\b(.*)$`);
// Push options that reach more than the branch named: every branch, the mirror, a deletion, a
// prune, the tags, the submodules' remotes. Git takes any unique prefix of a long option (`--tag`,
// `--follow`, `--del`), so a prefix of one of these widens the push too, as does `-d` bundled with
// other short flags (`-fd`).
const PUSH_WIDE = [
  "--all",
  "--mirror",
  "--delete",
  "--prune",
  "--branches",
  "--tags",
  "--follow-tags",
  "--recurse-submodules",
];
function widensPush(word: string): boolean {
  if (!word.startsWith("--")) return /^-[A-Za-z]*d/.test(word);
  // The option's name, as a unique prefix or whole, with its `=value` set aside.
  const [name, value] = word.split("=", 2);
  if (!name || name.length <= 2 || !PUSH_WIDE.some((o) => o.startsWith(name))) return false;
  // `--recurse-submodules=no`, under any prefix of the name, is the one value that does not widen.
  return !("--recurse-submodules".startsWith(name) && value === "no");
}
// The shape of a shell with its script on its input: alone, or with options only (`sh`, `bash -s`,
// `zsh -`), the words behind the lead.
const INTERPRETER_STDIN = new RegExp(String.raw`^(?:\S*/)?${SHELLS}(?:\s+-{1,2}[A-Za-z]*)*$`);
// What the shell reader could not close (a quote, a substitution) the shell would refuse to run;
// the hook denies it as such, since what the line would do cannot be read (security review, rounds
// 12 and 13).
const UNREADABLE = "the guard cannot read";
// The command word must be readable: a tool's name or path. One holding an expansion (`${X}git`,
// `gi$X`, the `${…}` the reader leaves where a substitution stood) or a pattern the shell expands
// (`{git,merge}`, `gi[t]`, `gi?`) is denied as such, since what runs cannot be read here; a path
// whose root is a variable or a substitution (`$HOME/.bun/bin/bun`, `${…}/git-push`) is read by the
// name at its end. `[` and `[[` are the test builtins (security review, rounds 8 and 13).
const VAR_ROOT_PATH = new RegExp(
  String.raw`^(?:\$\{[^}]*\}|\$\w+)(?:/[^\s${EXPANSION_CHARS}${PATTERN_CHARS}}\])]+)+$`,
);
const EXPANSION = new RegExp(`[${EXPANSION_CHARS}]`);
const PATTERN = new RegExp(`[${PATTERN_CHARS}]`);
function commandWordDenial(head: string): string | null {
  const word = /^\S*/.exec(head)?.[0] ?? "";
  if (!word || VAR_ROOT_PATH.test(word) || /^\[\[?$/.test(word)) return null;
  if (EXPANSION.test(word)) return "an expansion in the command position";
  if (PATTERN.test(word)) return "a pattern in the command position";
  return null;
}
// A remote that is not a plain name: a URL, a user@host, a folder, an expansion or a pattern.
const REMOTE_PATH = new RegExp(String.raw`[:/@${EXPANSION_CHARS}${PATTERN_CHARS}}\]]|^\.\.?$`);

/**
 * The tool's name as the patterns spell it: in lower case, since the platform's file system ignores
 * case, and git's dashed form by path (`…/git-core/git-merge`) as `git merge`.
 */
function normalizeTool(command: string): string {
  return command
    .replace(/^\S+/, (word) => word.toLowerCase())
    .replace(/^(\S*\/)?git-(?=[a-z])/, "$1git ");
}

// What a read-only session's piece holds that is not a plain crew command: a substitution (read
// apart by the shell reader into pieces of the walk, `${…}` standing in the word), a here-string, a
// redirect (a token whose text as written starts with an unquoted operator) and, when asked, an
// expansion (an unquoted `$` in a word: its text cannot be read, so it does not run). A piece with
// no command of its own is asked about the first three only: an assignment holding an expansion
// runs nothing, a redirect alone still writes.
function readOnlyShapeDenial({ inner, tokens }: Found, withExpansions = true): string | null {
  if (inner.length) return "a substitution";
  if (tokens.some((t) => HERE_STRING_OPERATOR.test(t.raw))) return "a here-string";
  if (tokens.some((t) => redirectOperator(t.raw) !== undefined)) return "a redirect";
  if (withExpansions && tokens.some((t) => t.expands)) return "an expansion";
  return null;
}

/** The opened-session policy on one command with no shell syntax left in front of it. */
function judgeCommand(command: string, branch: string | null): string | null {
  for (const { re, what } of OPENED_VERBS) if (re.test(command)) return what;
  const push = PUSH.exec(command);
  if (!push) return null;
  if (!branch) return "git push";
  const words = (push[1] ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.some(widensPush)) return "git push";
  const [remote, ...refspecs] = words.filter((w) => !w.startsWith("-"));
  if (!remote || REMOTE_PATH.test(remote)) return "git push";
  const own = new Set([branch, `HEAD:${branch}`, `${branch}:${branch}`]);
  if (refspecs.length === 0 || refspecs.some((r) => !own.has(r))) return "git push";
  return null;
}

/**
 * The verb a session opened by mail may not run, or null. `branch` is the session's own, the one
 * branch it may push: `git push <remote> <own>` (or `HEAD:<own>`), the remote by name (a URL or a
 * path is a repository the opener did not choose), every refspec named being its own, with no
 * option that widens the push. The command line is read as written, through the one walk every
 * rule of the hook reads (`walk`, over the pieces the shell reader gives, the case arms' heads
 * dropped by the reader): each simple command at any depth, behind its lead and without its
 * redirects, with a command or process substitution, a script a runner carries in its quotes
 * (`bash -c "a; b"`), in a here-string (`bash <<< "a"`) or in a here-document a shell reads, a
 * wrapper's string option and `eval`'s, `trap`'s, `find -exec`'s and `watch`'s
 * words judged as commands of their own (security review of SP2c task 3; code-quality review of
 * SP2c task 4, rounds 8 and 9). What cannot be read is denied as such: a quote or a substitution
 * the reader could not close, a command word or a verb that is an expansion or a pattern, a shell
 * with its script on its input. Git's configuration in the environment is read on the whole line's
 * text with its quotes removed, since it belongs to no one piece.
 */
export function openedSessionDenial(
  command: string,
  branch: string | null,
  walked: Walk = walk(command),
): string | null {
  if (walked.unreadable) return `${walked.unreadable} ${UNREADABLE}`;
  if (GIT_CONFIG_ENV.test(command.replace(QUOTES, ""))) return "GIT_CONFIG_* in the environment";
  const pieces = walked.found.map(({ words, handed }) => ({
    text: normalizeTool(words.join(" ")),
    handed,
  }));
  // The verbs first, in every piece (a substitution's inside names the verb that runs: `out=$(git
  // push …)`), then the command words: one that is an expansion or a pattern cannot be read.
  for (const { text, handed } of pieces) {
    if (!text) continue;
    // A shell with its script on its input (`echo … | sh`, `A=x env | sh`, `bash -s < f`): the
    // script cannot be read. One given its script (a here-string, `-c`) hands it on, and the
    // script's own commands are judged as pieces of the walk.
    if (handed === null && INTERPRETER_STDIN.test(text))
      return "an interpreter reading its script from its input";
    const denied = judgeCommand(text, branch);
    if (denied) return denied;
  }
  for (const { text } of pieces) {
    const unreadableWord = text ? commandWordDenial(text) : null;
    if (unreadableWord) return unreadableWord;
  }
  return null;
}

type Decision = ["deny" | "ask", string];

/**
 * Where no person watches the session, named for a reason (`a headless session in default mode`,
 * `bypassPermissions mode`), or null where a person is there to answer a prompt: the one rule the
 * user-only decision and the unreadable line read.
 */
function unwatched(headless: boolean, permissionMode: string | undefined): string | null {
  const mode = permissionMode ?? "default";
  if (headless) return `a headless session in ${mode} mode`;
  return PROMPTLESS_MODES.has(mode) ? `${mode} mode` : null;
}
/**
 * A user-only command in a session with no person watching (a headless session in any mode, or a
 * mode that shows no prompt) must say so with `--mode <mode>`, so the engine records the agent's
 * decision as the agent's. The flag is read from the same crew command as the verb, never from
 * another. Null means the command may go on to the write rule and, with a person present, to the
 * prompt, which is the user's signature; or, under the policy's `attendedDecisions: relay`, to run
 * with no prompt, the agent relaying the user's yes (ADR 0005). A decision the validator takes
 * under a rule (`--validator`) is checked by the engine, so with a person present there is nothing
 * for them to sign (0.3.0).
 */
function userOnlyDecision(
  command: { parsed: Parsed; policyCommand: boolean; presence: boolean },
  permissionMode: string | undefined,
  headless: boolean,
  policy: Policy,
): Decision | null {
  const { parsed, policyCommand, presence } = command;
  const flagged = typeof parsed.flags.mode === "string" ? parsed.flags.mode : undefined;
  const mode = permissionMode ?? "default";
  const where = unwatched(headless, permissionMode);
  if (where) {
    if (flagged === mode) return null;
    if (flagged === undefined) {
      return [
        "deny",
        presence
          ? `Crew: no person is watching this session (${where}) and this command records whether a person can answer. Run it again with --mode ${mode}, so the record says nobody was present.`
          : `Crew: no person is watching this session (${where}) and this command records a decision that only the user can take. Run it again with --mode ${mode}, so the record says the agent decided and in which mode.`,
      ];
    }
    return [
      "deny",
      `Crew: this session is ${where}, not ${flagged}; run the command with --mode ${mode}`,
    ];
  }
  if (flagged !== undefined) {
    return [
      "deny",
      `Crew: a person is present (${mode} mode); run the command without --mode so they are asked`,
    ];
  }
  // A presence command decides nothing: with a person there it runs, and the record says so.
  if (presence) return null;
  if (typeof parsed.flags.validator === "string") return null;
  if (policy.attendedDecisions === "relay" && !policyCommand) return null;
  return ["ask", "Crew: this command records a decision that only the user can take"];
}

function answer(permissionDecision: "deny" | "ask", reason: string): HookResponse {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason: reason,
    },
  };
}

function pathFromInput(input: Record<string, unknown>): string | null {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = input[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function onPreToolUse(ctx: HookContext, payload: HookPayload): HookResponse {
  const tool = payload.tool_name ?? "";
  const input = payload.tool_input ?? {};
  if (tool === "Agent") {
    // A role of this plugin launched: recorded as working until its SubagentStop (SP7 §14). Nothing
    // is ever denied here; a record that fails leaves the hook open like every other.
    const role = roleOf(typeof input.subagent_type === "string" ? input.subagent_type : undefined);
    if (!role) return {};
    const description = typeof input.description === "string" ? input.description : undefined;
    recordWorking(ctx.paths, {
      agent: role,
      team: teamOf(role),
      since: nowIso(),
      sessionId: ctx.sessionId,
      ...(description === undefined ? {} : { description }),
    });
    return {};
  }
  if (WRITE_TOOLS.has(tool)) {
    const filePath = pathFromInput(input);
    if (!filePath) return {};
    const abs = canonical(isAbsolute(filePath) ? filePath : join(ctx.paths.root, filePath));
    if (isProtectedPath(ctx.paths, abs)) {
      return answer(
        "deny",
        `Crew: ${filePath} is maintained by the engine and is changed through the crew command`,
      );
    }
    const rel = relative(ctx.paths.root, abs).replace(/\\/g, "/");
    if (rel === "" || rel.startsWith("..") || !isWatched(rel, ctx.profile)) return {};
    const active = activeWork(ctx.paths);
    const work = active?.work;
    if (work && work.route !== "fast" && isBeforeBuild(work)) {
      return answer(
        "deny",
        `Crew: work ${work.id} is in phase ${work.phase} on the ${work.route} route; source files change in the build phase (crew phase ${work.id} next)`,
      );
    }
    return {};
  }
  if (tool === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    // A session opened by mail never merges or deploys (SP2c §10): the rule holds from the first
    // command, before any item exists, since the opener sets the variables. The branch it may
    // push is the one the opener pinned, never whatever HEAD says now (a checkout would choose
    // it); with none pinned, no push passes (security review, round 2). The command line goes
    // whole, its substitutions read before its cut (security review, round 12).
    // One walk of the line serves every rule below.
    const walked = walk(command);
    const { found } = walked;
    const crewCommands = crewCommandsOf(found);
    if (ctx.openedBy) {
      const cleanedCommand = command.replace(QUOTES, "");
      const opened = `Crew: this session was opened by mail (${ctx.openedBy})`;
      const never = `${opened} and never merges, pushes to another branch, releases or deploys`;
      const ending = `it ends with crew mail reply ${ctx.openedBy} --branch ${ctx.openedBranch ?? "<branch>"} --item <child id>`;
      const variables = `${opened} and the opener's variables are not its to change`;
      // The opener's variables first: the rules below read them from the hook's environment. A
      // name anywhere in the line; then each piece the walk found, its text with the quotes gone,
      // and the names env unsets in its lead as the word reader took them.
      const named = OPENER_VAR.exec(cleanedCommand)?.[0];
      if (named) return answer("deny", `${variables}: ${named} is denied`);
      for (const { piece, unsets } of found) {
        const what =
          variableDenial(piece.replace(QUOTES, "")) ??
          (unsets.length && unreadableNames(unsets.join(" ")) ? "env -u" : null);
        if (what) return answer("deny", `${variables}: ${what} is denied`);
      }
      const denied = openedSessionDenial(command, ctx.openedBranch, walked);
      if (denied) return answer("deny", `${never}: ${denied} is denied; ${ending}`);
      // The session stays in its checkout: a change of directory that leaves it (an absolute path,
      // the home, a parent, a target the hook cannot read, no target at all; through `eval`, a
      // shell's script or a `CDPATH` too) and any word that names the engine's folder (the user's
      // crew folder, `~/.wizardingcode`, by its name, an assignment's value included) are denied,
      // since the engine's records there are not its to reach; so is a word the hook cannot read
      // as a path (a pattern or an expansion under an absolute path, the home, a parent or an
      // expansion), which may reach that folder. The words are read as the shell hands them, quotes
      // and escapes gone, in every simple command at any depth; a command line handed on (a shell's
      // script, a here-string a shell reads) is read as its own simple commands, not as one word.
      const stays = `${opened} and stays in its checkout`;
      for (const { program, words, handed, tokens } of found) {
        if (program === "cd" || program === "pushd") {
          const target = words.slice(1).find((w) => !w.startsWith("-")) ?? "";
          if (!target || /^[/~$`-]|^\.\.(?:\/|$)|\.\.\//.test(target) || /[*?[{(]/.test(target))
            return answer("deny", `${stays}: ${[program, ...words.slice(1)].join(" ")} is denied`);
        }
        if (tokens.some((t) => /^CDPATH\+?=/.test(t.word)))
          return answer("deny", `${stays}: CDPATH is denied`);
        const named = tokens
          .filter(
            (t) => handed === null || (t.word !== handed && !HERE_STRING_OPERATOR.test(t.raw)),
          )
          .map((t) => t.word)
          .flatMap((w) => (ASSIGNMENT.test(w) ? [w, w.slice(w.indexOf("=") + 1)] : [w]));
        for (const w of named) {
          if (w.includes(ctx.paths.userDir) || /(?:^|\/)\.wizardingcode(?:\/|$)/.test(w))
            return answer("deny", `${stays}: the engine's folder ${w} is denied`);
          if (unreadablePath(w))
            return answer(
              "deny",
              `${stays}: ${w} cannot be read and may reach the engine's folder; it is denied`,
            );
        }
      }
      // Crew's verbs no opened session runs, read as the CLI parses them (a flag that takes a value
      // takes the next word), in every crew command the line holds: a merge of a task, a task of
      // its own, a stop of the project's sessions, the approval of a full-route spec, which waits
      // for a person (AC-5).
      for (const { args } of crewCommands) {
        const { positional } = parse(args);
        const verb = positional[0];
        if (verb === "task" && positional.includes("merge"))
          return answer("deny", `${never}: crew task merge is denied; ${ending}`);
        if (verb === "task" && positional.includes("open"))
          return answer(
            "deny",
            `${opened} and opens no tasks of its own: crew task open is denied`,
          );
        if (verb === "mail" && positional[1] === "stop")
          return answer("deny", `${opened} and stops no sessions: crew mail stop is denied`);
        if (verb === "approve") {
          const id = positional[1];
          if (id && loadWork(ctx.paths, id).work?.route === "full")
            return answer(
              "deny",
              `${opened} and a full-route spec waits for a person: crew approve ${id} is denied; run crew await ${id} user and end the turn`,
            );
        }
      }
      // A read-only session reads with its tools and replies, nothing else (SP2c §10): the opener's
      // allow-list keeps every Bash command but crew out, and the hook holds the same line, since
      // the destination's settings may allow more. Each simple command is a plain crew command
      // (no shell given a script, no substitution, no redirect, no expansion) with a reading verb.
      if (ctx.openedMode === "read-only") {
        const readOnly = `Crew: this read-only session was opened by mail (${ctx.openedBy})`;
        const reads = `it reads with the Read, Grep and Glob tools and ends with crew mail reply ${ctx.openedBy} "<text>"`;
        const runsNo = `${readOnly} and runs no shell command but crew`;
        for (const current of found) {
          const { program, args, firstWrapper } = current;
          if (!args) {
            // A program that is not crew; a lead with nothing behind it (`env`, `timeout 5`) or a
            // wrapper given its command as a string (`flock f -c "…"`), named by the lead's first
            // wrapper; a piece of assignments, keywords or brackets alone runs nothing, unless it
            // carries a redirect, a here-string or a substitution, which write or run on their own.
            const lead = program || firstWrapper;
            const bare = lead ? null : readOnlyShapeDenial(current, false);
            if (bare) return answer("deny", `${runsNo}: ${bare} is denied; ${reads}`);
            if (!lead) continue;
            return answer("deny", `${runsNo}: ${lead} is denied; ${reads}`);
          }
          // The shape of the crew command, read from the same piece the walk judged: a substitution
          // it read apart, a here-string, a redirect, an expansion.
          const shape = readOnlyShapeDenial(current);
          if (shape) return answer("deny", `${runsNo}: ${shape} is denied; ${reads}`);
          const [verb, second] = parse(args).positional;
          const allowed =
            !verb ||
            READ_ONLY_VERBS.has(verb) ||
            (verb === "mail" && (!second || READ_ONLY_MAIL.has(second)));
          if (!allowed)
            return answer(
              "deny",
              `${readOnly} and may only read and reply: crew ${verb}${verb === "mail" && second ? ` ${second}` : ""} is denied; it ends with crew mail reply ${ctx.openedBy} "<text>"`,
            );
        }
      }
    }
    // A user-only crew command, wherever it stands in the line (behind a wrapper, in a shell's
    // script, in a substitution), is judged from its own words. Crew with its words on xargs'
    // input cannot be read, in any session. A deny anywhere wins over an ask.
    let asked: Decision | null = null;
    for (const { args, viaXargs } of crewCommands) {
      if (viaXargs)
        return answer(
          "deny",
          "Crew: a crew command whose words come from xargs' input cannot be read; write the command out",
        );
      const userOnly = userOnlyCommand(args) ?? resumeDecision(ctx, args);
      if (!userOnly) continue;
      const decided =
        auditApproval(userOnly.parsed, payload.permission_mode, ctx.headless, ctx.policy) ??
        userOnlyDecision(userOnly, payload.permission_mode, ctx.headless, ctx.policy);
      if (decided?.[0] === "deny") return answer(...decided);
      asked ??= decided;
    }
    // Each simple command is judged on its own: an engine file named in one and a write verb in
    // another are not a write (finding 2 of the real-use phase).
    for (const piece of judgedTexts(readCommand(command).pieces)) {
      // No exemption for crew command lines: `crew x; echo > .crew/...` is two simple commands, and no crew command names a protected path.
      if (
        (ENGINE_FILES.test(piece) && WRITE_SHAPE.test(piece)) ||
        (OPAQUE_REDIRECT.test(piece) && ENGINE_FILES.test(command))
      ) {
        return answer(
          "deny",
          "Crew: files under .crew/ and ~/.wizardingcode/crew that the engine owns are written only by the crew command",
        );
      }
    }
    // A line the reader could not close (a quote, a substitution, an expansion, or one nested past
    // what it reads) is a person's to allow in any session, whatever its text says: the shell
    // refuses such a line or runs what the hook could not see, and the user-only rule above only
    // reads what was. Where no person watches (a headless session, a promptless mode) it is denied,
    // as a user-only decision is; a deny above still wins (risk and security reviews, rounds 15 and
    // 16).
    if (walked.unreadable) {
      const what = `${walked.unreadable} ${UNREADABLE}: the shell refuses such a line or runs what the hook could not see`;
      const where = unwatched(ctx.headless, payload.permission_mode);
      if (where)
        return answer(
          "deny",
          `Crew: ${what}, and no person is watching this session (${where}); write the command so that the hook can read it`,
        );
      return answer("ask", `Crew: ${what}, so a person decides`);
    }
    if (asked) return answer(...asked);
  }
  return {};
}
