/**
 * The simple commands of a Bash command line, as far as its text can tell. The hook judges each
 * one on its own, so an engine file named in one (a heredoc line, an echo argument) and a write
 * verb in another do not add up to a write, and a `--mode` belongs to the crew command it sits on.
 *
 * The cut is textual, not a parse, and errs on the safe side. A backslash before a newline joins
 * two lines; every other newline ends a simple command and any open quote, so a heredoc body is
 * judged line by line and a quoted string that spans lines is cut at the line. Within a line,
 * `;`, `&` and `|` outside quotes separate (`&&`, `||` and `|&` leave empty pieces, dropped);
 * the `&` of `2>&1`, `>&2` or `&>file` and the `|` of `>|file` belong to a redirect. Parentheses,
 * braces, `$(` and backticks stay in the text: the rules that read it tolerate them.
 */
export function simpleCommands(command: string): string[] {
  const pieces: string[] = [];
  for (const line of command.replace(/\\\r?\n/g, " ").split(/\r?\n/)) {
    let piece = "";
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line.charAt(i);
      if (quote !== null) {
        piece += ch;
        if (ch === "\\" && quote === '"' && i + 1 < line.length) piece += line.charAt(++i);
        else if (ch === quote) quote = null;
      } else if (ch === "\\" && i + 1 < line.length) {
        piece += ch + line.charAt(++i);
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        piece += ch;
      } else if (ch === ";" || ((ch === "|" || ch === "&") && !isRedirectPart(line, i))) {
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

/** The `&` of `2>&1`, `>&2`, `<&0` or `&>file` and the `|` of `>|file` belong to a redirect. */
function isRedirectPart(line: string, i: number): boolean {
  const before = line.charAt(i - 1);
  return before === ">" || before === "<" || (line.charAt(i) === "&" && line.charAt(i + 1) === ">");
}
