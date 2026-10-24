/**
 * The PowerShell line as the hook reads it (SP6 Task 4, judgement rounds 2 to 29). Copilot's
 * `powershell` tool gives the Bash rule a line the POSIX reader in shell.ts was not written for.
 * This module holds what the rule needs and nothing of the rule: the hook verb read from the text
 * (`POWERSHELL_HOOK`), the line rewritten so the one walker can read it (`powershellAsPosix`), and
 * the reading that says whether the line is one the hook cannot read (`unreadablePowershell`). The
 * reader recognises a small set of literal forms, inside any string as at the top level (so a
 * string handed to a shell is read as the top level is), and asks about everything else: a mark
 * that hides the line's text (a backtick escape, a block comment, the stop-parsing token, an
 * encoded command, a typographic quote or dash, a here-string, an unusual space, a control
 * character, an alias or a command lookup, and cmd's caret and `%NAME%` expansion where cmd stands
 * as a program); a comma outside quotes in a word of a crew command the walker read (PowerShell's
 * argument separator, which the walker does not split); an evaluator given anything but one literal
 * string; a hand-on program still standing in any piece after the rewrite; and the crew word
 * itself, wherever it stands in a piece the walker neither read as a crew command nor handed on (at
 * a command position in a block or behind a hand-on, inside a string, as a word, a path ending in
 * crew, a program the rewrite did not fold), so every literal line that could run a crew command is
 * asked whatever its grammar, and only a folder with its slash, `.crew`, a file of another name and
 * a word that contains crew are read as text. The reader folds literals and decodes nothing beyond
 * a quoted part's doubled quote, the literal it is: what it cannot see is asked, never guessed. The
 * walker stays the one source for what a crew command is; the text only says what it missed. What
 * neither reader follows is a crew command built without the word on the line (a variable holding
 * the program or a word, a script file, a string piped from elsewhere, a word built by an
 * expression): the class the Copilot row's guarantee names.
 * ADR 0011's decision on translation points here for the reading's grammar; its last consequence
 * records the subset read and the pwsh 7 run that checked it.
 */

import {
  JS_RUNNERS,
  NPX_RUNNERS,
  RUNNER_SUFFIXES,
  runnerSuffix,
  WRAPPERS,
} from "../shell-words.ts";
import { LEADING_KEYWORDS, SUBSTITUTED } from "./shell.ts";

// A crew program: by name or by a path with either separator, the bundle included.
const CREW_WORD = String.raw`(?:[^\s"']*[/\\])?crew(?:\.mjs)?`;
// The crew program read from the text wherever it stands: after a separator, the call operator, a
// quote, a brace or an equals sign, quoted or not, in any case, since PowerShell reads all of these.
const CREW_PROGRAM = String.raw`(?:^|[\s;|&(\x60"'={])${CREW_WORD}["']?`;
/** The hook verb in a PowerShell line, denied from a command as it is from a POSIX one. */
export const POWERSHELL_HOOK = new RegExp(String.raw`${CREW_PROGRAM}\s+hook\b`, "i");
// A word that is not the crew program in any quoting, for the bounded loops below: a quoted crew
// word among a wrapper's or a runner's words is the program, so no shell after it is folded.
const OTHER_WORD = String.raw`(?!["']?${CREW_WORD}["']?(?=\s|$))\S+`;
// What may stand between a command position and the program, as the walker reads it: the shell's
// leading keywords, a wrapper with its options and words (`env FOO=1`, `timeout 5`), an assignment
// word; the lists are the walker's own (shell.ts, shell-words.ts), and the loops are bounded so a
// long line costs little.
const BEFORE_PROGRAM = String.raw`(?:(?:${[...LEADING_KEYWORDS.filter((k) => k !== "!"), ...WRAPPERS.map((w) => w.name)].join("|")})(?:\s+${OTHER_WORD}){0,8}?\s+|!\s+|\w+=\S*\s+){0,4}`;
// A JavaScript runner before the bundle, with its options and their values, by its POSIX name or
// Windows' (`node.exe`, `npx.cmd`).
const RUNNER = String.raw`(?:(?:${[...JS_RUNNERS, ...NPX_RUNNERS].join("|")})${runnerSuffix([...new Set([...RUNNER_SUFFIXES.js, ...RUNNER_SUFFIXES.npx])])}(?:\s+${OTHER_WORD}){0,8}?\s+)?`;
// A crew program at a command position of a piece's text: its start, a separator, a brace, a
// backtick or a newline before it, the right side of an assignment of any shape (`=` or `+=`, not
// inside a `-flag=` token), `return` or `throw`; then what the walker lets stand before a program,
// and a runner before the bundle. Since the crew-word rule (round 13) asks on every such piece,
// this pattern picks the reason (a block or a hand-on) and the order of the decision alone.
const CREW_AT_COMMAND = new RegExp(
  String.raw`(?:^|[;|&({\x60\n]\s*|(?<!-[^\s=]*)\+?=\s*|\b(?:return|throw)\s+)${BEFORE_PROGRAM}${RUNNER}${CREW_WORD}(?=\s|$)`,
  "i",
);
// A crew word followed, after any flags or words, by a subexpression or a splat (`crew ('approve')
// …`, `crew --json @a`): PowerShell makes words of them that the walker cannot read, as it cannot
// read `crew $(…)`.
const CREW_WITH_EXPRESSION = new RegExp(
  String.raw`${CREW_PROGRAM}(?:\s+[^\s;|&(){}@"'\x60]+)*\s+[(@{]`,
  "i",
);
const QUOTED_STRING = /"[^"]*"|'[^']*'/g;
// A substitution's inside is a piece of its own to the walker, read apart from the piece it stands in.
const SUBSTITUTION = /\$\([^()]*\)/g;
// The programs the reader hands on or follows: a shell, cmd, the process starters, the evaluators.
const SHELLS = String.raw`(?:pwsh|powershell)(?:\.exe)?`;
const HAND_ONS =
  "(?:Start-Process|saps|Invoke-Command|icm|Start-Job|sajb|Start-ThreadJob|Invoke-Item|ii|Invoke-Expression|iex)";
// A quoted program followed by words is a command (`& "crew" approve`, `node "C:/p/crew.mjs"
// approve`, `& 'C:/Program Files/PowerShell/7/pwsh.exe' -enc …`); every other string is text.
const QUOTED_PROGRAM = new RegExp(
  String.raw`["']((?:[^"']*[/\\])?(?:crew(?:\.mjs)?|${SHELLS}|cmd(?:\.exe)?|${HAND_ONS}))["'](?=\s+[^\s;|&)}])`,
  "gi",
);
/** The text with its substitutions and its strings blanked and a quoted program kept. */
const bareText = (text: string): string =>
  text.replace(SUBSTITUTION, " ").replace(QUOTED_PROGRAM, "$1").replace(QUOTED_STRING, " ");
const NAMES_CREW = /crew/i;

const UNREADABLE_CREW =
  "a crew command the hook cannot read (a script block, or a hand-on the reader does not follow)";
const PLAINLY = "write it plainly, one crew command per line";

/** One piece of the walker's reading: its text, its tokens as written and as read, its words when it was read as a crew command, the hand-on it opened. */
interface ReadPiece {
  piece: string;
  tokens: { raw: string; word: string }[];
  args: string[] | null;
  handed: string | null;
}

/**
 * Whether the line holds a crew program the walker did not read. Nothing is taken out of the line
 * by text: every piece the walker did not read as a crew command, at every level (the top-level
 * pieces, a handed-on string's and a substitution's are all in `read`), is read for a crew
 * program at a command position of its own text, and one found is a crew command the hook cannot
 * read; a piece the walker read as crew is the user-only rule's, whatever its text. A crew word
 * followed by a subexpression or a splat anywhere on the line is unreadable too. A line that names
 * no crew is read at no cost.
 */
function unreadCrew(command: string, read: ReadPiece[]): boolean {
  if (!NAMES_CREW.test(command)) return false;
  if (CREW_WITH_EXPRESSION.test(bareText(command))) return true;
  // A piece that hands a script on is read through the script's own pieces and, for its other
  // words, by the crew-word rules; its text would name the script's crew program a second time.
  return read.some(
    ({ piece, args, handed }) =>
      args === null &&
      handed === null &&
      NAMES_CREW.test(piece) &&
      CREW_AT_COMMAND.test(bareText(piece)),
  );
}

// The marks that hide a line's text from the reader, on the line as written: PowerShell's escape
// character (a line continuation included), a block comment, its stop-parsing token (what follows
// it is cmd's, `%NAME%` expanded), an encoded command by any prefix of -EncodedCommand on a shell
// named by name or by path, the typographic quotes and dashes its tokenizer takes as quotes and
// dashes, a here-string, an unusual space, a control character (the fold's own marks are such
// characters, so no written line holds one), an alias or a command lookup that can rename the
// program.
// The C0 controls but tab, line feed and carriage return, from their codes (a control character
// spelt in a regex is a lint error, which is the point of the fold's marks among them).
const code = String.fromCharCode;
const CONTROLS = new RegExp(`[${code(0)}-${code(8)}${code(11, 12)}${code(14)}-${code(31)}]`);
const HIDDEN_MARKS: [RegExp, string][] = [
  [/`/, "a backtick escape"],
  [/<#/, "a block comment"],
  [/(^|\s)--%(?=\s|$)/, "the stop-parsing token --%"],
  [
    new RegExp(String.raw`(?:^|[\s;|(&"'/\\])${SHELLS}["']?\b[^;|&]*?\s-e(?:c|n[a-z]*)?\b`, "i"),
    "an encoded command",
  ],
  [/[\u201c\u201d\u201e\u2018\u2019\u201a\u201b]/, "a typographic quote"],
  [/[\u2013\u2014\u2015]/, "a typographic dash"],
  [/@["']/, "a here-string"],
  [/[\u00a0\u2000-\u200b\u3000\ufeff]/, "an unusual space"],
  [CONTROLS, "a control character"],
  [
    /(?:^|[\s;|&({])(?:Set-Alias|New-Alias|sal|nal|Get-Command|gcm)\b/i,
    "an alias or a command lookup",
  ],
];
// cmd's own marks, read on a line where cmd stands as a program (by name or by path, quoted or
// not, before a switch, a separator or the end) alone: its escape character and its `%NAME%`
// expansion mean nothing to PowerShell elsewhere (a regex anchor, a parent revision, a format
// string, a `cmd/` folder); a line that carries the stop-parsing token is a hidden line above.
const CMD_LINE = /(?:^|[\s;|&({"'/\\])cmd(?:\.exe)?["']?(?=\s+\/|\s*(?:$|[|;&)]))/i;
const CMD_MARKS: [RegExp, string][] = [
  [/\^/, "a caret escape"],
  [/%[A-Za-z_][\w()]*%/, "a %NAME% expansion"],
];
// The crew word in a text (bounded: a word of its own or the end of a path, the bundle included;
// never a part of a word, a folder with its slash or a file of another name): in a piece the
// walker did not read as crew and did not hand on, the reader does not know what the program does
// with it, inside a string or as a word.
const CREW_IN_TEXT =
  /(?<![\w.-])crew(?:\.(?:mjs|cmd|ps1|exe|bat))?(?:\.+(?=[\s"']|$)|(?![\w./\\-]))/i;
const CREW_WORD_REASON = "a crew word in a command the reader did not read as crew";
const CREW_WAY_OUT =
  "write a crew command plainly, or keep the word out of the line (a text from a file: git commit -F <file>; a folder with its trailing slash: crew/; a file by its folder or a glob: bin/cre[w])";
// PowerShell passes an unquoted comma list to a native program as separate arguments; the walker
// reads one word, so a crew command carrying one is asked wherever it stands, nothing folded by text.
const COMMA_REASON =
  "a comma inside a crew command's word (PowerShell's argument separator the walker did not split)";
const WORDS_APART = 'quote the list as one word (--criteria "AC-1,AC-2"), or write the words apart';
// An evaluator the literal rewrites below did not fold: given anything but one literal string.
const EVALUATOR_LEFT =
  /(?:^|[\s;|&({])(?:iex|Invoke-Expression)\b|\[(?:System\.Management\.Automation\.)?scriptblock\]::Create\s*\(|\.(?:InvokeScript|NewScriptBlock|Invoke)\s*\(/i;
// A hand-on program still standing after the rewrite: the reader did not follow it.
const HAND_ON_LEFT = new RegExp(
  String.raw`(?:^|[\s;|&({/\\])(?:(${SHELLS})(?=\s|$)|(cmd(?:\.exe)?)(?=\s+/)|(${HAND_ONS})\b)`,
  "i",
);
/** The mark that hides the written line's text, if any; cmd's marks on a cmd line alone. */
const markOn = (written: string): string | null =>
  HIDDEN_MARKS.find(([re]) => re.test(written))?.[1] ??
  (CMD_LINE.test(written) ? (CMD_MARKS.find(([re]) => re.test(written))?.[1] ?? null) : null);
/** A token's text without its enclosing quotes. */
const inside = (raw: string): string => raw.replace(/^(["'])([\s\S]*)\1$/, "$2");
/** A script's text with its substitutions and the walker's markers for them blanked, so the handed script and its token match whichever form each carries. */
const plain = (text: string): string =>
  text.replace(SUBSTITUTION, " ").split(SUBSTITUTED).join(" ").replace(/\s+/g, " ").trim();
/** The texts the crew-word rules read: each piece the walker did not read as a crew command, its substitutions blanked since the walker reads them apart, and, for a piece that hands a script on, its tokens as written but the handed script's own (the script's pieces are in the reading). */
const unreadPieces = (read: ReadPiece[]): string[] =>
  read.flatMap(({ piece, tokens, args, handed }) => {
    if (args !== null) return [];
    // The handed script's token, by its word as the shell hands it or by its text as written,
    // their substitutions blanked (the walker marks a substitution in a word and keeps its text
    // in the script).
    // The script as the walker holds it, and as its words read (the walker quotes the words it
    // appends from a program's argv, `env -S "a b" c`, `find -exec a b`).
    const script = handed === null ? null : plain(handed);
    const words = script === null ? [] : script.split(" ").map(inside);
    const unquoted = words.join(" ");
    const forms = (t: { raw: string; word: string }) => [plain(t.word), plain(inside(t.raw))];
    // The script's own token: the one equal to the script, or, when the walker appended words to
    // it, the one the script starts with.
    const exact =
      script === null
        ? -1
        : tokens.findIndex((t) => forms(t).some((f) => f === script || f === unquoted));
    const at =
      script === null || exact >= 0
        ? exact
        : tokens.findIndex((t) => forms(t).some((f) => f !== "" && unquoted.startsWith(`${f} `)));
    // A script the walker joined from several words (`eval a b`, the words after `env -S "…"`)
    // has no token of its own: each token that is one of its words is the script's.
    const own = new Set(words);
    const text =
      script === null
        ? piece
        : tokens
            .filter((t, i) => i !== at && !(at >= 0 && i > at && own.has(plain(t.word))))
            .map((t) => t.raw)
            .join(" ");
    return [text.replace(SUBSTITUTION, " ")];
  });
/** Whether a piece the walker read as a crew command has a word with a comma outside its quotes. */
const commaCrew = (read: ReadPiece[]) =>
  read.some(
    ({ tokens, args }) =>
      args !== null && tokens.some((t) => t.raw.replace(QUOTED_STRING, "").includes(",")),
  );
/** Whether an unread piece holds a crew word inside one of its strings, each bounded by its own quotes. */
const stringCrew = (read: ReadPiece[]) =>
  unreadPieces(read).some((text) =>
    [...text.matchAll(QUOTED_STRING)].some(([quoted]) => CREW_IN_TEXT.test(quoted)),
  );
/** Whether an unread piece names crew outside its strings: a word, a path ending in crew, a program the rewrite did not fold, a word after a handed script. */
const wordCrew = (read: ReadPiece[]) =>
  unreadPieces(read).some((text) => CREW_IN_TEXT.test(text.replace(QUOTED_STRING, " ")));
/** The hand-on left standing on a bare rewritten text, if any. */
const handOnLeft = (bare: string): string | null => {
  const handOn = HAND_ON_LEFT.exec(bare);
  if (!handOn) return null;
  const name = (handOn[1] ?? handOn[2] ?? handOn[3] ?? "").replace(/\.exe$/i, "");
  return `a hand-on the reader did not follow (${name})`;
};
const hiddenLine = (hidden: string, wayOut = "write the line plainly, without it"): Unreadable => {
  const reason = `a PowerShell line whose text the hook cannot read (${hidden})`;
  return { reason, asked: `Crew: ${reason}, so a person decides: ${wayOut}`, wayOut, hidden: true };
};

/**
 * What the rule says about a line it cannot read: the reason, the ask's whole text, the way out the
 * denies name, and whether the text is hidden (denied where nobody watches before the commands the
 * walker could read are trusted, since its words may be anything; a crew word the reader could not
 * place, inside a string or as a word, is hidden too, since the walker's reading of that piece may
 * not be what PowerShell runs) or a crew program the walker did not read at a command position
 * (decided after every deny the read commands earn).
 */
export interface Unreadable {
  reason: string;
  asked: string;
  wayOut: string;
  hidden: boolean;
}
// The marks the fold writes into a line, control characters so CONTROLS covers them and no written
// line holds one unseen (`HIDDEN_MARKS` asks about one): the mark of a hand-on folded and not yet
// read, the mark of one whose rest was joined, which a later pass leaves alone, and the mark the
// comment drop leaves in place of a `#` it cannot place, which `unreadablePowershell` asks about
// from any level.
export const FOLD_MARKS = { handed: code(0), joined: code(1), ambiguous: code(2) } as const;

/**
 * The PowerShell line the hook cannot read, or null, in this order: a mark that hides the written
 * text (PowerShell's own syntax, which changes everything the reader would read after it); a crew
 * program at a command position the walker did not read; a comma outside quotes in a word of a crew
 * command the walker read (PowerShell's argument separator, which the walker does not split); an
 * evaluator the rewrite did not fold, on the line or in any piece of it; a crew word inside a
 * string of a piece the walker neither read as crew nor handed on; a hand-on the rewrite did not
 * fold, on the line or in any piece (a handed-on string's pieces included, so a shell inside a
 * shell is read); last, the crew word anywhere else in such a piece (a word, a path ending in crew,
 * a program the rewrite did not fold), so every literal line that could run a crew command is asked
 * whatever its grammar, the way out naming the file form and the folder's slash. A hidden line is
 * asked whether or not it names crew, as `eval $x` is. The rule asks in every policy, denies where
 * nobody watches and in an opened session.
 */
export function unreadablePowershell(
  written: string,
  command: string,
  read: ReadPiece[],
): Unreadable | null {
  const mark = markOn(written);
  if (mark) return hiddenLine(mark);
  if (command.includes(FOLD_MARKS.ambiguous)) return hiddenLine(AMBIGUOUS_COMMENT, SPACE_BEFORE);
  if (unreadCrew(command, read))
    return {
      reason: UNREADABLE_CREW,
      asked: `Crew: ${UNREADABLE_CREW} may record a decision only the user can take: ${PLAINLY}`,
      wayOut: PLAINLY,
      hidden: false,
    };
  if (commaCrew(read)) return hiddenLine(COMMA_REASON, WORDS_APART);
  const bares = [bareText(command), ...read.map(({ piece }) => bareText(piece))];
  if (bares.some((bare) => EVALUATOR_LEFT.test(bare)))
    return hiddenLine("an evaluator given anything but one literal string");
  if (stringCrew(read))
    return hiddenLine("a crew word inside a string the reader did not open", CREW_WAY_OUT);
  for (const bare of bares) {
    const handOn = handOnLeft(bare);
    if (handOn) return hiddenLine(handOn);
  }
  return wordCrew(read) ? hiddenLine(CREW_WORD_REASON, CREW_WAY_OUT) : null;
}

// Start-Process's parameters by the prefix PowerShell accepts: the ones that take a value, the
// switches; `-FilePath` names the program and `-Arg*` the list.
const START_PROCESS_VALUED = [
  "credential",
  "workingdirectory",
  "verb",
  "windowstyle",
  "redirectstandarderror",
  "redirectstandardinput",
  "redirectstandardoutput",
  "environment",
  // The common parameters that take a value, by name and by alias.
  "erroraction",
  "warningaction",
  "informationaction",
  "progressaction",
  "errorvariable",
  "warningvariable",
  "informationvariable",
  "outvariable",
  "outbuffer",
  "pipelinevariable",
  "ea",
  "wa",
  "ia",
  "proga",
  "ev",
  "wv",
  "iv",
  "ov",
  "ob",
  "pv",
];
const START_PROCESS_SWITCHES = [
  "wait",
  "nonewwindow",
  "passthru",
  "usenewenvironment",
  "loaduserprofile",
  "confirm",
  "whatif",
  "verbose",
  "debug",
  "vb",
  "db",
];
/** What a Start-Process parameter is, by its exact name or alias first and by a prefix only when one name fits across both lists (PowerShell refuses an ambiguous one); null when the reader cannot tell. */
const kindOf = (name: string): "switch" | "valued" | null => {
  if (START_PROCESS_SWITCHES.includes(name)) return "switch";
  if (START_PROCESS_VALUED.includes(name)) return "valued";
  const switches = START_PROCESS_SWITCHES.filter((n) => n.startsWith(name)).length;
  const valued = START_PROCESS_VALUED.filter((n) => n.startsWith(name)).length;
  if (switches + valued !== 1) return null;
  return switches ? "switch" : "valued";
};
const START_PROCESS_LIST =
  /\s+-Arg\w*\s+((?:"[^"]*"|'[^']*'|[^\s,"'][^\s,"']*)(?:\s*,\s*(?:"[^"]*"|'[^']*'|[^\s,"'][^\s,"']*))*)/i;
const START_PROCESS_ITEMS = /"([^"]*)"|'([^']*)'|([^\s,"']+)/g;
/** The words of a Start-Process argument list: the items split on commas, each on whitespace, as PowerShell splits a string it is given. */
const listWords = (list: string): string[] =>
  [...list.matchAll(START_PROCESS_ITEMS)]
    .flatMap((m) => (m[1] ?? m[2] ?? m[3] ?? "").split(/\s+/))
    .filter(Boolean);
/**
 * `Start-Process [-FilePath] <program> [<list>] … -ArgumentList a,"b c"` as the program with its
 * words, the parameters in any order, by prefix and in the `-Name:value` form: the list from
 * `-Arg*` or from every positional after the program (cmd's `start` gives them one by one;
 * PowerShell would refuse a third, so reading them all asks more, never less); a switch skipped; a
 * valued parameter with its value. Null when no program can be read, and the line stays as written.
 */
function startProcessAsCommand(parameters: string): string | null {
  // `-Name:value`: a switch drops its value (`-Wait:$true`), every other parameter keeps it apart.
  const spaced = parameters
    .replace(/(^|\s)(-[A-Za-z]+):\$?\w+(?=\s|$)/g, (whole, pre: string, name: string) =>
      kindOf(name.slice(1).toLowerCase()) === "switch" ? `${pre}${name}` : whole,
    )
    .replace(/(^|\s)(-[A-Za-z]+):(?=\S)/g, "$1$2 ");
  const list = START_PROCESS_LIST.exec(spaced);
  let args = list ? listWords(list[1] ?? "") : [];
  const rest = list ? spaced.replace(list[0], " ") : spaced;
  const tokens = rest.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  const positionals: string[] = [];
  let program: string | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? "";
    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }
    const name = token.slice(1).toLowerCase();
    if (!name) continue;
    if ("filepath".startsWith(name)) {
      program = tokens[++i] ?? null;
      continue;
    }
    const kind = kindOf(name);
    if (kind === "switch") continue;
    if (kind === "valued") {
      i++;
      continue;
    }
    // A parameter the reader does not know, or an ambiguous prefix: the line stays as written,
    // and the hand-on is asked.
    return null;
  }
  program ??= positionals.shift() ?? null;
  if (program === null) return null;
  if (!args.length) args = positionals.flatMap(listWords);
  return [program, ...args].join(" ");
}
/** A Start-Process line, or `start` at a command position, as the program with its words it runs; the line as written when none can be read. */
const startProcessRewrite = (whole: string, pre: string, before: string, rest: string): string => {
  const rewritten = startProcessAsCommand(rest);
  return rewritten === null ? whole : `${pre}${before}${rewritten}`;
};
// cmd's builtins before the program it runs: `call`, and `start` with its optional quoted title and
// its switches (`/d`, `/affinity`, `/node` and `/machine` take a value).
const CMD_BUILTIN =
  /^(?:call\s+|start\s+(?:"[^"]*"\s+)?(?:\/(?:d|affinity|node|machine)\s+(?:"[^"]*"|\S+)\s+|\/\w+\s+)*)/i;
/** The words cmd runs from the text behind `cmd /c`: its builtin gone. */
const cmdRest = (rest: string): string => rest.replace(CMD_BUILTIN, "");
const MARKS = new RegExp(`[${FOLD_MARKS.handed}${FOLD_MARKS.joined}]`, "g");
const HANDED = `${FOLD_MARKS.handed}sh -c`;
const HANDED_PREFIX = new RegExp(`${HANDED}[ \\t]*`, "g");
const HANDED_DEPTH = 8;
const DQ = `"(?:[^"]|"")*"`;
const SQ = `'(?:[^']|'')*'`;
// A balanced group inside the rest (a subexpression, a block) is the rest's; a closer that ends an
// enclosing statement stops it.
const GROUP = String.raw`\((?:[^()\r\n]|\([^()\r\n]*\))*\)|\{(?:[^{}\r\n]|\{[^{}\r\n]*\})*\}`;
// The rest of a line handed to a shell the rewrite folded (`HANDED`, a mark no line can hold, so a
// literal `sh -c` among a command's words is left to the POSIX reader), up to an unquoted
// separator, a line end, a closing parenthesis or brace (where PowerShell ends a statement too),
// read as pwsh reads its arguments after `-Command`: split into PowerShell words (a quoted part
// glued to a bare one is one word, a doubled quote inside a quoted part the quote it is), their
// delimiting quotes gone, joined into the one script the walker reads, and a rest inside that
// script joined the same way to `HANDED_DEPTH`, the hand-ons beyond it flattened to the command
// they run (an unquoted chain reads as that command; a quoted rest there is asked as a crew word
// inside a string).
// A mark behind a quote is `HANDED_IN_STRING`'s.
const HANDED_REST = new RegExp(
  String.raw`(?<!["']\s*)(${HANDED})[ \t]*((?:${DQ}|${SQ}|${GROUP}|[^\s;|&"')}])(?:${GROUP}|[^;|&"'\r\n)}]|${DQ}|${SQ})*)`,
  "g",
);
// A hand-on folded behind an opening quote: its rest is that string's, up to the quote's close (a
// doubled quote inside is the string's), so a quoted word after the string is never taken for the
// rest's (`'pwsh -c a' --force 'b'`).
const HANDED_IN_STRING = new RegExp(
  String.raw`(["'])(\s*${HANDED})[ \t]*((?:(?!\1)[^\r\n]|\1\1)*)`,
  "g",
);
// A PowerShell word as written: bare text with quoted parts glued to it, whole; and the quoted part
// it begins with, whole.
const GLUED_WORD = new RegExp(String.raw`(?:${DQ}|${SQ}|[^\s"'])+`, "g");
const QUOTED_START = new RegExp(`^(?:${DQ}|${SQ})`);
/**
 * A word as PowerShell splits it (`"a"b` is two arguments): a quoted part that begins it and does
 * not end it is a word of its own. The one place the rule lives, applied to the written line and to
 * every handed level.
 */
const splitGlued = (word: string): string => {
  const start = QUOTED_START.exec(word)?.[0];
  return start !== undefined && start.length < word.length
    ? `${start} ${splitGlued(word.slice(start.length))}`
    : word;
};
/**
 * A PowerShell word as PowerShell hands it: each quoted part's delimiters gone, a doubled quote
 * inside it the quote it is, its content kept (a quote inside stays, for the shell inside).
 */
const unquoteWord = (word: string): string =>
  word.replace(
    /"((?:[^"]|"")*)"|'((?:[^']|'')*)'/g,
    (_, dq: string | undefined, sq: string | undefined) =>
      dq !== undefined ? dq.replace(/""/g, '"') : (sq ?? "").replace(/''/g, "'"),
  );
/**
 * Past the depth: the folded hand-ons stripped one after another, each folding the shell behind it,
 * until none is left, so an unquoted chain reads as the command it runs (each pass removes one, so
 * the loop ends on the line's length).
 */
const flattened = (words: string): string => {
  let left = words;
  for (;;) {
    const next = foldShells(left.replace(HANDED_PREFIX, ""));
    if (next === left) return left;
    left = next;
  }
};
/** A quote and a backslash escaped for the POSIX reader's double-quoted word. */
const escaped = (text: string): string => text.replace(/["\\]/g, "\\$&");
/**
 * PowerShell's quoting read one character at a time into `open`, the stack of what stands open: a
 * `"` or `'` string, or the `(` of a subexpression inside a double-quoted string, where the quotes
 * nest again (`"$('"')"` is one string); a doubled quote closes and reopens the same string. Only
 * a string's subexpression is followed: a parenthesis at the top level is text to this reading.
 * Shared by the comment drop and the opening-quote reading, so both read the line alike.
 */
const quoteStep = (open: string[], text: string, k: number): void => {
  const c = text.charAt(k);
  const top = open[open.length - 1];
  if (top === "'") {
    if (c === "'") open.pop();
  } else if (top === '"') {
    if (c === '"') open.pop();
    else if (c === "(" && text.charAt(k - 1) === "$") open.push("(");
  } else if (c === '"' || c === "'") open.push(c);
  else if (top === "(" && c === "(") open.push("(");
  else if (top === "(" && c === ")") open.pop();
};
/** A string open at the top of the stack: a `#` inside is text, a quote inside is the string's. */
const inString = (open: string[]): boolean => /["']/.test(open[open.length - 1] ?? "");
// What ends a token before a `#` in both of PowerShell's modes, so the `#` starts a line comment:
// whitespace, a separator, an opening parenthesis or brace (and, read apart below, a quoted part
// that began its word); a `#` glued to a word is the word's (`a#b`). The hidden marks read the
// written line before the drop, so a block comment (`<# … #>`) reaches its mark whole.
const BEFORE_COMMENT = /[\s;|&({]/;
// What ends a token before a `#` in expression mode alone (`[int]#`, `$x=#`) and not in argument
// mode, where `--format=#%h`, `a]#b` and a quoted part glued after word text (`a"b"#c`) are one
// word each, and a closing parenthesis or brace, which closes a group (`(1)#x` takes a comment) as
// often as an expansion glued in a word (`a$(1)#x` is one word): the reader cannot tell them
// apart, so such a `#` is asked about, never dropped. A quoted part inside a subexpression is
// asked about too: the word-start rule reads the top level alone.
const AMBIGUOUS_BEFORE_COMMENT = /[)}=[\],<>"']/;
const AMBIGUOUS_COMMENT =
  "a # the reader cannot place (after =, a bracket, a comma, a redirection, a closing parenthesis or brace, or a quoted part glued to a word or inside a subexpression)";
const SPACE_BEFORE = "write a space before the #, or quote it";
/**
 * The text without PowerShell's line comments: a `#` that starts a token outside a string, to the
 * line end (the walker drops a POSIX comment the same way), so a quote inside one never changes
 * how the quotes after it are read. Applied to the written line and to each handed level's words.
 */
const withoutComments = (text: string): string => {
  let out = "";
  const open: string[] = [];
  // Whether the last string opened at the top level began its word (`"a"#c` is a string and a
  // comment; `a"b"#c` is one word), read at the top level alone: inside a subexpression a `#`
  // after a quote is asked about.
  let quoteBeganWord = false;
  for (let k = 0; k < text.length; k++) {
    const c = text.charAt(k);
    const before = text.charAt(k - 1);
    if (!inString(open) && c === "#") {
      const afterQuote = /["']/.test(before);
      if (
        k === 0 ||
        BEFORE_COMMENT.test(before) ||
        (afterQuote && !open.length && quoteBeganWord)
      ) {
        const end = text.indexOf("\n", k);
        if (end === -1) break;
        k = end - 1;
        continue;
      }
      if (AMBIGUOUS_BEFORE_COMMENT.test(before)) {
        out += FOLD_MARKS.ambiguous;
        continue;
      }
    }
    if (!open.length && /["']/.test(c)) quoteBeganWord = k === 0 || BEFORE_COMMENT.test(before);
    quoteStep(open, text, k);
    out += c;
  }
  return out;
};
/**
 * Whether the quote at `i` opens a string: no string is open in the text before it (a quote inside
 * a subexpression opens one of its own).
 */
const opensString = (text: string, i: number): boolean => {
  const open: string[] = [];
  for (let k = 0; k < i; k++) quoteStep(open, text, k);
  return !inString(open);
};
/**
 * A shell at a command position folded with the mark; behind a quote only when that quote opens a
 * string, since a pwsh after a closing quote is one of the command's words, left standing for the
 * hand-on rule to ask about.
 */
const foldShells = (text: string): string =>
  text.replace(SHELL_HAND_ON, (whole: string, pre: string, before: string, offset: number) =>
    /^["']/.test(pre) && !opensString(text, offset) ? whole : `${pre}${before}${HANDED}`,
  );
/**
 * The handed words as one double-quoted script, a rest inside it joined the same way to
 * `HANDED_DEPTH` (each rest is shorter than the words it came from; beyond it the remaining
 * hand-ons are flattened), escaped once per level.
 */
const joinHanded = (rest: string, depth: number): string => {
  // The split on each word as written (the written line's split is one pass per word, and a rewrite
  // before the fold can expose a glue it did not see, as the evaluator's does), then on the words
  // inside the quoted parts, since the inner pwsh splits its own script the same way.
  // Then the level's own comments dropped and its cmd and Start-Process lines rewritten, as the
  // written line's are before its fold.
  const words = processStartsRewritten(
    withoutComments(
      (rest.match(GLUED_WORD) ?? [])
        .map((w) => unquoteWord(splitGlued(w)))
        .join(" ")
        .replace(GLUED_WORD, splitGlued),
    ),
  );
  // Every command position of the unquoted words, the start of the rest included, folds a shell as
  // the top level does (`flattened` folds first).
  const inner = depth >= HANDED_DEPTH ? flattened(words) : foldHandOns(words, depth + 1);
  return `"${escaped(inner)}"`;
};
/**
 * A shell's hand-on at a command position folded with the mark and its rest joined; a mark still
 * behind an opening quote after that (one in a quoted word of the line, not in a handed rest, whose
 * own level reads it) has its rest bounded by the string's close and escaped inside a
 * double-quoted one, so the word stays the one pwsh hands. Applied to the written line and to each
 * handed level, each after its cmd and Start-Process rewrites, so a shell they expose is folded
 * where it stands and no pass folds inside a script already joined (a rest once joined is marked
 * `FOLD_MARKS.joined`, so the same pass reads it no more).
 */
const foldHandOns = (text: string, depth = 0): string =>
  foldShells(text)
    .replace(
      HANDED_REST,
      (_, pre: string, rest: string) =>
        `${pre.replace(FOLD_MARKS.handed, FOLD_MARKS.joined)} ${joinHanded(rest, depth)}`,
    )
    .replace(HANDED_IN_STRING, (_, quote: string, pre: string, rest: string) => {
      const joined = joinHanded(rest, depth);
      return `${quote}${pre.replace(FOLD_MARKS.handed, FOLD_MARKS.joined)} ${quote === '"' ? escaped(joined) : joined}`;
    });

// Two literal strings joined by `+`, as PowerShell joins them: one string, a few levels deep.
const JOINED_STRINGS = /(["'])([^"']*)\1\s*\+\s*(["'])([^"']*)\3/;
const joinStrings = (text: string): string => {
  let joined = text;
  for (let i = 0; i < 8 && JOINED_STRINGS.test(joined); i++)
    joined = joined.replace(JOINED_STRINGS, '"$2$4"');
  return joined;
};
// The evaluators given one literal string, as PowerShell spells them: a script block compiled from
// it, a script invoked from it, Invoke-Expression and iex with it in parentheses, behind a
// `-Command` of any prefix, piped in, or right after.
const SCRIPT_FROM_LITERAL =
  /(?:\[(?:System\.Management\.Automation\.)?scriptblock\]::Create|\$ExecutionContext(?:\.SessionState)?\.InvokeCommand\.(?:NewScriptBlock|InvokeScript))\s*\(\s*(?:"([^"]*)"|'([^']*)')\s*\)/gi;
const IEX = "(?:Invoke-Expression|iex)";
// A shell by name or by path, quoted or not (`pwsh`, `C:/pwsh7/pwsh.exe`, `'C:/Program
// Files/PowerShell/7/pwsh.exe'`), with its valueless or valued options, then its command: `-c`
// or any prefix of `-Command` before a quoted or unquoted rest, or a positional command string.
const SHELL_HAND_ON = new RegExp(
  String.raw`(^|[;|(&{\n"']\s*)(${BEFORE_PROGRAM})(?:["'][^"']*[/\\]${SHELLS}["']|(?:[^\s;|&"']*[/\\])?${SHELLS})(?:\s+-\w+(?:\s+(?!-)[^\s;|&"']+)?)*?(?:\s+-(?:c|command)\b|(?=\s+["']))`,
  "gi",
);
// The rest of a Start-Process line: up to a separator or a lone quote, so a line inside any string
// keeps the string's closing quote (a quoted word of its own is read whole).
const START_REST = `((?:"[^"]*"|'[^']*'|[^;|&"'])*)`;
const START_PROCESS = new RegExp(
  String.raw`(^|[\s;|(&"'])(${BEFORE_PROGRAM})(?:Start-Process|saps)\b${START_REST}`,
  "gi",
);
// `start`, PowerShell's alias of Start-Process, at a command position (the start of any string
// included), behind what the walker lets stand before a program; never the word elsewhere (`npm
// start`).
const START_ALIAS = new RegExp(
  String.raw`(^|[;|(&{\n"']\s*)(${BEFORE_PROGRAM})start(?=\s|$)${START_REST}`,
  "gi",
);

/**
 * The cmd and Start-Process lines of a text as the command they run (`cmd /c "…"` and
 * `cmd /c …` with cmd's `call` and `start` gone, `Start-Process` and `start` as the program with
 * its words), applied to the written line and to each handed level's words before its fold, so a
 * shell they expose is folded where it stands.
 */
const processStartsRewritten = (text: string): string =>
  text
    .replace(
      /(^|[\s;|(&"'])cmd(?:\.exe)?\s+\/[ck]\s+(?:"([^"]*)"|'([^']*)')(?=\s*(?:[;|&"']|$))/gi,
      (_, pre: string, dq: string | undefined, sq: string | undefined) =>
        `${pre}${cmdRest(dq ?? sq ?? "")}`,
    )
    .replace(
      /(^|[\s;|(&"'])cmd(?:\.exe)?\s+\/[ck]\s+([^;|&]*)/gi,
      (_, pre: string, rest: string) => `${pre}${cmdRest(rest)}`,
    )
    .replace(START_PROCESS, startProcessRewrite)
    .replace(START_ALIAS, startProcessRewrite);
/**
 * A PowerShell line as the POSIX reader can walk it: a backslash separates a path there and
 * escapes nothing, so it becomes a slash; literal strings joined by `+` are one string; what
 * PowerShell hands a command line on to takes the POSIX name the walker follows (`pwsh -Command
 * "…"`, `powershell.exe -c '…'`, a shell named by path, and a positional command string, as `sh
 * -c`, their options gone and an unquoted rest of the line quoted; `Invoke-Expression` and `iex`
 * given one literal string, in parentheses, behind `-Command` of any prefix, piped in or right
 * after, as `eval`; a script block compiled or invoked from one literal string as the command it
 * holds; a parenthesised program name as the program; `cmd /c` as the words behind it, a quoted
 * rest unquoted as cmd does and its builtins `call` and `start` with the title and the switches
 * gone; `Start-Process`, `saps` and `start` at a command position, behind what the walker lets
 * stand before a program, as the program with its words; the rest of a line handed to a shell at
 * a command position, up to a line end or the closer of an enclosing statement, read as pwsh
 * reads its arguments after `-Command` and joined into one script, a rest inside it the same
 * way); each form read inside any string as at the top level (the walker itself gives `env -S`'s
 * string the words after it, on every tool), so a shell inside a shell hands the same words on;
 * and the call operator before a program (`& "crew" approve`, `. crew skip`) goes first, `&&` kept
 * as the list it is. Nothing is decoded beyond a quoted part's doubled quote and no comma is
 * folded: a mark that hides the text, a hand-on left standing and a crew command whose word
 * carries a comma are `unreadablePowershell`'s to name. The user-only and the opened-session rules
 * then read the same words a POSIX shell would hand them.
 */
export function powershellAsPosix(command: string): string {
  // A lone CR ends a PowerShell statement as a newline does; the POSIX reader ends a piece at a
  // newline alone. A word that begins with a quoted part ends at its close (`"a"b` is `a` and
  // `b` to PowerShell), so a space goes after the part when more follows it, word by word so a
  // quoted part inside a word is never taken for one that begins it.
  const posix = joinStrings(
    withoutComments(command.replace(/\r\n?/g, "\n"))
      .replace(/\\/g, "/")
      .replace(GLUED_WORD, splitGlued),
  )
    .replace(/(^|[;|("']\s*|&&\s*)[&.]\s+(?=\S)/g, "$1")
    .replace(SCRIPT_FROM_LITERAL, "$1$2")
    .replace(new RegExp(String.raw`${IEX}\s*\(\s*(["'])(.*?)\1\s*\)`, "gi"), "eval $1$2$1")
    .replace(new RegExp(String.raw`${IEX}\s+-C\w*:?\s*(?=["'])`, "gi"), "eval ")
    .replace(new RegExp(String.raw`(["'])([^"']*)\1\s*\|\s*${IEX}\b`, "gi"), "eval $1$2$1")
    .replace(new RegExp(String.raw`(^|[\s;|(&"'])${IEX}\s+(?=["'])`, "gi"), "$1eval ")
    .replace(new RegExp(String.raw`\(\s*(["']?)(${CREW_WORD})\1\s*\)`, "gi"), "$2");
  // The cmd and Start-Process lines rewritten, then the hand-ons folded, the marks gone last.
  return foldHandOns(processStartsRewritten(posix)).replace(MARKS, "");
}
