/**
 * The one reader of a Bash command line for the hook's rules. Everything that depends on where a
 * quote begins or ends is decided here, in one pass over the text as the shell reads it: the words
 * and their quoting, the separators between simple commands, the command and process substitutions
 * (whose inside is read by the same reader, as command lines of their own, wherever the shell would
 * run them: in a word, in a `${…}` operand, in an unquoted here-document body, in an arithmetic
 * compound), the heads of `case` arms, the here-documents, the comments, the newlines and the
 * redirect operators. No rule reads the raw text before this reader has (security review of SP2c
 * task 4, rounds 12 to 17).
 */

/** One word of a simple command. */
export interface Token {
  /** As the shell hands it to the program: quotes removed, escapes read, a substitution standing as `${…}`. */
  word: string;
  /** As written. */
  raw: string;
  from: number;
  to: number;
  /** Whether an unquoted `$` or a substitution stood in the word, so its text is not what runs. */
  expands: boolean;
}
/** One simple command: its text as written, its tokens, the command lines of the substitutions it holds (read into pieces of their own) and the bodies of its here-documents (data to the program, as written). */
export interface Piece {
  text: string;
  tokens: Token[];
  inner: Piece[];
  heredocs: string[];
}
/** A command line read: its simple commands, and what was still open at its end (`a quote`, `a substitution`, `an expansion`), which the shell would refuse to run. */
export interface Reading {
  pieces: Piece[];
  unclosed: string | null;
}
/** What stands in a word where a substitution stood: the rules read it as an expansion, never as the text it would produce. */
export const SUBSTITUTED = "${…}";
/** A descriptor before a redirect operator: a number or a name in braces (`2>`, `{fd}>`). */
const DESCRIPTOR = String.raw`\d+|\{\w+\}`;
/** What may stand before a redirect operator as its own: a descriptor, or the `&` of `&>`. The hook's operator patterns are built from it. */
export const OPERATOR_PREFIX = `(?:${DESCRIPTOR}|&)?`;

// What a backslash escapes inside double quotes; before any other character it stays in the word.
const DOUBLE_QUOTE_ESCAPES = '$`"\\';
// The word before an unquoted redirect operator that is the operator's own, as written: the
// operator's prefix followed by any operator characters already read (`2>>`, `&>>`, `{fd}>>`,
// `2<>`, `<<<`). A quoted or escaped word is a word of its own, whatever it decodes to.
const OPERATOR_OWN = new RegExp(`^${OPERATOR_PREFIX}[<>]*$`);
// A here-document's operator at the head of a word as written (`<<EOF`, `<<-EOF`, `<<'EOF'`,
// `3<<EOF`; a here-string `<<<` is none): the delimiter follows in the same word or the next.
const HEREDOC_OPERATOR = new RegExp(`^(?:${DESCRIPTOR})?<<(-?)(?!<)`);
/** The shell's keywords that stand before a command in the same simple command and run nothing of their own; the hook's lead reader skips them, and a `case` is a case only when nothing but these (or a group's brace) stands before it. */
export const LEADING_KEYWORDS = ["if", "then", "else", "elif", "do", "while", "until", "!"];
const KEYWORDS_BEFORE = new Set([...LEADING_KEYWORDS, "{"]);
// The words that may stand before a `case` at a command position: the keywords and the wrappers
// the shell runs a command through (`time case …`), for the backstop that counts the cases open.
const COMMAND_LEADS = new Set([...KEYWORDS_BEFORE, "time", "coproc"]);
// How deep substitutions may nest before the reader gives up and reports the outer one unclosed
// (a crafted line, never a written one; the hook then fails closed instead of throwing).
const MAX_DEPTH = 32;
// The escapes of the shell's `$'…'` quoting, decoded as the shell decodes them; one the shell does
// not know stays as written, backslash and all.
const ANSI_ESCAPES: Record<string, string> = {
  a: "\x07",
  b: "\b",
  e: "\x1b",
  E: "\x1b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "?": "?",
};
function ansiEscape(text: string, at: number): { value: string; length: number } {
  const rest = text.slice(at);
  const fixed = ANSI_ESCAPES[rest.charAt(0)];
  if (fixed !== undefined) return { value: fixed, length: 1 };
  const code = /^x([0-9A-Fa-f]{1,2})|^u([0-9A-Fa-f]{1,4})|^U([0-9A-Fa-f]{1,8})|^([0-7]{1,3})/.exec(
    rest,
  );
  if (code) {
    const digits = code[1] ?? code[2] ?? code[3] ?? code[4] ?? "0";
    const point = Number.parseInt(digits, code[4] !== undefined ? 8 : 16);
    if (point <= 0x10ffff) return { value: String.fromCodePoint(point), length: code[0].length };
  }
  const control = /^c(.)/s.exec(rest);
  if (control)
    return {
      value: String.fromCharCode((control[1] ?? "@").toUpperCase().charCodeAt(0) ^ 0x40),
      length: 2,
    };
  return { value: `\\${rest.charAt(0)}`, length: 1 };
}

/**
 * The index after the bracket that closes the expansion whose opening bracket stands at `open`
 * (the `{` of `${…}`, the `[` of `$[…]`), or -1 when none closes it: quotes inside are read as
 * quotes, a backslash protects the next character, and nested brackets count.
 */
function bracketEnd(text: string, open: number, close: "}" | "]"): number {
  const opener = text.charAt(open);
  let depth = 1;
  let quote: '"' | "'" | null = null;
  for (let i = open + 1; i < text.length; i++) {
    const ch = text.charAt(i);
    if (quote !== null) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === "\\") i++;
    else if (ch === "'" || ch === '"') quote = ch;
    else if (ch === opener) depth++;
    else if (ch === close && --depth === 0) return i + 1;
  }
  return -1;
}
/**
 * The index after the `))` that closes the arithmetic opened at `open` (its first `(`, the second
 * standing right after it: the callers check that), or -1 when the text is not arithmetic: the
 * shell takes the `)` that closes the inner `(` (the first one back to depth 1, parentheses inside
 * counted) and reads arithmetic only when the next character is the `)` that closes the outer one;
 * otherwise the text is a subshell or a command substitution. A quote inside the candidate makes
 * it no arithmetic either: zsh refuses such a line and bash reads it as commands, so reading it as
 * commands here errs closed. A backslash protects the next character.
 */
function arithmeticEnd(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === "\\") i++;
    else if (ch === "'" || ch === '"') return -1;
    else if (ch === "(") depth++;
    else if (ch === ")" && --depth === 1) return text.charAt(i + 1) === ")" ? i + 2 : -1;
  }
  return -1;
}

type Quote = '"' | "'" | "$'" | null;
/** What closes the text being read: nothing at the top, `)` inside `$(`, `<(` or `>(`, a backtick inside backticks. */
type Closer = ")" | "`" | null;
interface Frame {
  pieces: Piece[];
  /** The index after the closer, or the text's end. */
  end: number;
  unclosed: string | null;
}
/** A here-document announced on the line being read: its delimiter (null until the word after a bare operator is read), whether leading tabs are stripped, whether the shell expands its body (the delimiter unquoted), and the piece it belongs to. */
interface Heredoc {
  delimiter: string | null;
  strip: boolean;
  expand: boolean;
  owner: Token[];
}

/**
 * Reads `text` from `start` until its end or until `closer`, as the shell does. A quote stays open
 * across a newline; a newline outside quotes separates simple commands, and a backslash before it
 * joins the lines. An unquoted `#` that starts a word opens a comment to the end of the line. `$(`,
 * `<(`, `>(` and a backtick open a substitution (inside double quotes too, never inside single or
 * `$'…'` quotes): its inside is read by this reader, through its own closer, and becomes pieces of
 * the enclosing piece, while `${…}` stands in the word. A backtick ends a backtick substitution
 * wherever it stands, as the shell scans for it, unless a backslash escapes it. `${…}` and `$[…]`
 * run to their matching bracket as part of the word, quotes inside them read as quotes, and the
 * substitutions inside them read apart. `((…))` and `$((…))` are arithmetic, one word to their
 * matching `))`, only when the parentheses close as a pair and no quote stands inside (otherwise a
 * subshell or a command substitution, read as commands); their substitutions are read apart and no
 * redirect operator is read inside them. A here-document's operator names a delimiter, and once the
 * line ends its body, up to the line that is the delimiter (leading tabs dropped for `<<-`), is data
 * of the piece, not commands; with the delimiter unquoted the shell expands the body, so its
 * substitutions are read apart; with no delimiter line the body runs to the end. After `case <word>
 * in` at the command position (only the shell's keywords before it) and after `;;`, `;&` or `;|`,
 * the words up to an unquoted `)` are an arm's head, dropped, and `esac` closes the case; `()`
 * after a word is a function's head, the name dropped and the body read; `(` and `)` elsewhere
 * separate (a subshell). An unquoted `<` or `>` ends the word before it unless that word, as
 * written, is the operator's own; the `&` of `&>` always ends it, since `&>` takes no descriptor;
 * an `&` or `|` continues an operator only after a word that is the operator's own and ends in `<`
 * or `>`.
 */
function read(text: string, start: number, closer: Closer, depth: number): Frame {
  const pieces: Piece[] = [];
  let unclosed: string | null = null;
  let tokens: Token[] = [];
  let inner: Piece[] = [];
  let word = "";
  let from = 0;
  let started = false;
  let expands = false;
  let quote: Quote = null;
  // A case's arm: after `case x in` or `;;`, the tokens from `armStart` on are the arm's pattern.
  let arm: "none" | "pattern" = "none";
  let armStart = 0;
  // The subshells open in this frame: their `)` close them, not the frame.
  let subshells = 0;
  // The `case` words read at a command position in this frame and not closed by `esac` yet: an arm
  // of a case the reader did not take for one (a nested case at the head of an arm, a newline before
  // `in`, a wrapper before `case`) would otherwise close the frame with its `)`, so a frame that
  // closes with a case open is reported as what the guard cannot read.
  let cases = 0;
  // Where a command may start in the piece: its first token, or the first after a dropped arm head.
  let commandAt = 0;
  // Whether the piece began behind a `|` or an `&`: a word there is a command, never a keyword.
  let piped = false;
  const heredocs: Heredoc[] = [];
  const begin = (i: number): void => {
    if (started) return;
    started = true;
    from = i;
    word = "";
    expands = false;
  };
  const endWord = (i: number): void => {
    if (!started) return;
    started = false;
    const raw = text.slice(from, i);
    tokens.push({ word, raw, from, to: i, expands });
    // An `esac` closes a count only where the shell reads it as the keyword: at a command position,
    // or as the first word of a recognised arm (an empty case); a subject or a pattern spelled
    // `esac` is a word of the case, not its end.
    const lead = tokens.slice(commandAt, -1).every((t) => COMMAND_LEADS.has(t.raw));
    if (raw === "case" && lead) cases++;
    else if (
      raw === "esac" &&
      cases > 0 &&
      ((lead && !piped) || (arm === "pattern" && tokens.length - 1 === armStart))
    )
      cases--;
    const operator = HEREDOC_OPERATOR.exec(raw);
    const pending = heredocs[heredocs.length - 1];
    if (operator) {
      const delimiter = word.slice(operator[0].length);
      heredocs.push({
        delimiter: delimiter || null,
        strip: operator[1] === "-",
        expand: raw.slice(operator[0].length) === delimiter,
        owner: tokens,
      });
    } else if (pending && pending.delimiter === null) {
      pending.delimiter = word;
      pending.expand = raw === word;
    }
    const third = tokens[tokens.length - 3];
    if (
      raw === "in" &&
      third?.raw === "case" &&
      tokens.slice(0, -3).every((t) => KEYWORDS_BEFORE.has(t.raw))
    ) {
      arm = "pattern";
      armStart = tokens.length;
    } else if (raw === "esac" && arm === "pattern") arm = "none";
  };
  const endPiece = (i: number): void => {
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
  // The inside of a substitution opened at `at`, read through its closer into `into`; the index
  // after the closer. Past the depth the reader allows, the rest is left unread and reported.
  const readInside = (at: number, inside: Closer, into: Piece[]): number => {
    if (depth >= MAX_DEPTH) {
      unclosed ??= "a substitution";
      return text.length;
    }
    const frame = read(text, at, inside, depth + 1);
    into.push(...frame.pieces);
    unclosed ??= frame.unclosed;
    return frame.end;
  };
  // The substitutions that open in a span the shell expands (a `${…}` operand, an arithmetic
  // compound, an unquoted here-document body), each read apart into `into` through its own closer
  // (`to` bounds where one may open, not where it ends); an arithmetic expansion inside the span is
  // scanned in turn; a backslash protects the next character. Quotes inside the span are not read:
  // the shell would run some of what they hold and not the rest, and the hook errs on the side of
  // reading it all.
  const scanSubstitutions = (from: number, to: number, into: Piece[], nested = depth): void => {
    for (let k = from; k < to; k++) {
      const ch = text.charAt(k);
      const next = text.charAt(k + 1);
      if (ch === "\\") k++;
      else if (ch === "$" && next === "(") {
        const end = arithmeticAt(k + 1);
        if (end === -1) k = readInside(k + 2, ")", into) - 1;
        else if (nested >= MAX_DEPTH) {
          unclosed ??= "a substitution";
          return;
        } else {
          scanSubstitutions(k + 3, end - 2, into, nested + 1);
          k = end - 1;
        }
      } else if ((ch === "<" || ch === ">") && next === "(") k = readInside(k + 2, ")", into) - 1;
      else if (ch === "`") k = readInside(k + 1, "`", into) - 1;
    }
  };
  // The index after an arithmetic `((…))` whose first `(` stands at `open`, or -1 where the text
  // there is no such pair: the one decision `expansionAt`, the compound and the scanner share.
  const arithmeticAt = (open: number): number =>
    text.charAt(open) === "(" && text.charAt(open + 1) === "(" ? arithmeticEnd(text, open) : -1;
  // The bodies of the here-documents the line announced, consumed from `at` (the start of the
  // next line) and given to their pieces; the index where the reading goes on.
  const bodies = (at: number): number => {
    let j = at;
    for (const { delimiter, strip, expand, owner } of heredocs.splice(0)) {
      const bodyFrom = j;
      let bodyTo = j;
      let body = "";
      while (j < text.length) {
        const lineEnd = text.indexOf("\n", j);
        const line = text.slice(j, lineEnd === -1 ? text.length : lineEnd);
        const lineStart = j;
        j = lineEnd === -1 ? text.length : lineEnd + 1;
        if ((strip ? line.replace(/^\t+/, "") : line) === (delimiter ?? "")) break;
        body += `${line}\n`;
        bodyTo = lineStart + line.length;
      }
      const piece = pieces.find((p) => p.tokens === owner);
      if (!piece) continue;
      piece.heredocs.push(body);
      if (expand) scanSubstitutions(bodyFrom, bodyTo, piece.inner);
    }
    return j;
  };
  const close = (i: number): Frame => {
    endPiece(i);
    if (cases > 0) unclosed ??= "a case";
    return { pieces, end: i + 1, unclosed };
  };
  const openWord = (i: number): string => (started ? text.slice(from, i) : "");
  const endOperand = (i: number): void => {
    if (started && !OPERATOR_OWN.test(openWord(i))) endWord(i);
  };
  const continuesOperator = (i: number): boolean => {
    const open = openWord(i);
    return /[<>]$/.test(open) && OPERATOR_OWN.test(open);
  };
  const substitution = (i: number, opener: number, inside: Closer): number => {
    begin(i);
    word += SUBSTITUTED;
    expands = true;
    return readInside(i + opener, inside, inner) - 1;
  };
  const expansion = (i: number, close: "}" | "]"): number => {
    begin(i);
    expands = true;
    const end = bracketEnd(text, i + 1, close);
    if (end === -1) {
      unclosed ??= "an expansion";
      word += text.slice(i);
      return text.length - 1;
    }
    word += text.slice(i, end);
    scanSubstitutions(i + 2, end - 1, inner);
    return end - 1;
  };
  // The arithmetic opened at `open` and closed at `end` (as `arithmeticEnd` found it), read into
  // the word from `i`: the expansion `$((…))` is part of its word; the compound `((…))` is a word
  // of its own, so the caller ends it.
  const arithmetic = (i: number, open: number, end: number): number => {
    begin(i);
    expands = true;
    word += text.slice(i, end);
    scanSubstitutions(open + 2, end - 2, inner);
    return end - 1;
  };
  // What the `$` or the backtick at `i` opens, unquoted or inside double quotes: an arithmetic
  // expansion, a command substitution, a brace or bracket expansion, a backtick substitution; the
  // index to go on from, or -1 when the `$` is only a character of the word.
  const expansionAt = (i: number): number => {
    const next = text.charAt(i + 1);
    if (text.charAt(i) === "`") return substitution(i, 1, "`");
    if (next === "(") {
      const end = arithmeticAt(i + 1);
      return end !== -1 ? arithmetic(i, i + 1, end) : substitution(i, 2, ")");
    }
    if (next === "{") return expansion(i, "}");
    if (next === "[") return expansion(i, "]");
    return -1;
  };
  for (let i = start; i < text.length; i++) {
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
        if (quote !== null) unclosed ??= "a quote";
        return close(i);
      }
    }
    if (quote === "$'") {
      if (ch === "'") quote = null;
      else if (ch === "\\" && i + 1 < text.length) {
        const decoded = ansiEscape(text, i + 1);
        word += decoded.value;
        i += decoded.length;
      } else word += ch;
    } else if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else if (ch === "\\" && next === "\n") i++;
      else if (ch === "\\" && i + 1 < text.length && DOUBLE_QUOTE_ESCAPES.includes(next))
        word += text.charAt(++i);
      else if (ch === "$" || ch === "`") {
        const opened = expansionAt(i);
        if (opened !== -1) i = opened;
        else {
          expands = true;
          word += ch;
        }
      } else word += ch;
    } else if (ch === "\\" && next === "\n") {
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
      if (opened !== -1) i = opened;
      else {
        begin(i);
        expands = true;
        word += ch;
      }
    } else if ((ch === "<" || ch === ">") && next === "(") {
      endOperand(i);
      i = substitution(i, 2, ")");
    } else if (ch === "#" && !started) {
      while (i + 1 < text.length && text.charAt(i + 1) !== "\n") i++;
    } else if (ch === "\n") {
      endPiece(i);
      if (heredocs.length) i = bodies(i + 1) - 1;
    } else if (/\s/.test(ch)) {
      endWord(i);
    } else if (ch === ";") {
      endPiece(i);
      if (next === ";" || next === "&" || next === "|") {
        i++;
        arm = "pattern";
      } else arm = "none";
    } else if (ch === "|" || ch === "&") {
      if (ch === "&" && next === ">") {
        // `&>` takes no descriptor: the word before it is the command's, the operator its own.
        endWord(i);
        begin(i);
        word += ch;
      } else if (continuesOperator(i)) word += ch;
      else if (arm === "pattern" && ch === "|") endWord(i);
      else {
        endPiece(i);
        piped = true;
      }
    } else if (ch === "(" && next === ")") {
      // A function's head (`f()`, `f ()`): the name before it is no command, and its body follows.
      if (started) started = false;
      else tokens.pop();
      i++;
    } else if (ch === "(" && !started && arm !== "pattern" && arithmeticAt(i) !== -1) {
      const end = arithmeticAt(i);
      i = arithmetic(i, i, end);
      endWord(end);
    } else if (ch === "(") {
      // A subshell's `(` separates and is counted, so the `)` that closes it never closes the
      // substitution this frame reads; an arm's `(` opens its pattern.
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
      } else if (closer === ")") return close(i);
      else endPiece(i);
    } else if (ch === "<" || ch === ">") {
      endOperand(i);
      begin(i);
      word += ch;
    } else {
      begin(i);
      word += ch;
    }
  }
  if (quote !== null) unclosed ??= "a quote";
  if (closer !== null) unclosed ??= "a substitution";
  endPiece(text.length);
  if (cases > 0) unclosed ??= "a case";
  if (heredocs.length) bodies(text.length);
  return { pieces, end: text.length, unclosed };
}

/** The simple commands of a command line, read as the shell reads them, each with its tokens, the pieces of its substitutions and the bodies of its here-documents. */
export function readCommand(command: string): Reading {
  const { pieces, unclosed } = read(command, 0, null, 0);
  return { pieces, unclosed };
}

/** The texts of a command line's simple commands, as written, each here-document body's lines after the command that reads it, for the rules that still read a piece's text. */
export function simpleCommands(command: string): string[] {
  return readCommand(command).pieces.flatMap((p) => [
    p.text,
    ...p.heredocs.flatMap((body) => body.split("\n").filter((line) => line !== "")),
  ]);
}
