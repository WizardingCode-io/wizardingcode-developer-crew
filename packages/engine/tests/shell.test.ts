import { expect, test } from "bun:test";
import { readCommand } from "../src/hooks/shell.ts";
import { WRAPPERS } from "../src/shell-words.ts";

const words = (command: string) =>
  readCommand(command).pieces.map((p) => p.tokens.map((t) => t.word));

test("SP2c AC-5: the shell reader keeps a word whole around an arithmetic expansion and reads parentheses that do not close as a pair as commands", () => {
  // `$((…))` is part of its word, before and after it, unquoted or inside double quotes.
  expect(words("x$((1))y")).toEqual([["x$((1))y"]]);
  expect(words('echo "a$((1))b"')).toEqual([["echo", "a$((1))b"]]);
  // `((…))` at the command position is one word, no program of its own, and `<<` inside it opens
  // no here-document.
  const arithmetic = readCommand("(( x = 1<<2 ))\necho y");
  expect(arithmetic.pieces.map((p) => p.tokens.map((t) => t.word))).toEqual([
    ["(( x = 1<<2 ))"],
    ["echo", "y"],
  ]);
  // Parentheses that do not close as `))` are a subshell or a command substitution: the shell runs
  // what stands inside, so the reader yields it as commands; the pair is the first `)` back to
  // depth one and the one right after it, whatever groups follow. A subshell inside a substitution
  // is counted, so only the substitution's own `)` closes it, and everything up to it is inside.
  expect(words("((echo a); echo b)")).toEqual([
    ["echo", "a"],
    ["echo", "b"],
  ]);
  expect(words("((echo a); (echo b))")).toEqual([
    ["echo", "a"],
    ["echo", "b"],
  ]);
  for (const line of ["echo $((echo a); (echo b))", "echo $((echo a); echo b)"]) {
    const substituted = readCommand(line);
    expect(substituted.pieces.map((p) => p.tokens.map((t) => t.word))).toEqual([["echo", "${…}"]]);
    expect(substituted.pieces[0]?.inner.map((p) => p.tokens.map((t) => t.word))).toEqual([
      ["echo", "a"],
      ["echo", "b"],
    ]);
  }
  // An arithmetic expansion inside an operand is arithmetic, with no command inside it; nesting
  // past the reader's depth there is reported as it is in a word.
  expect(readCommand("echo ${x:-$((1+2))}").pieces[0]?.inner).toEqual([]);
  expect(readCommand(`echo \${x:-${"$((".repeat(33)}1${"))".repeat(33)}}`).unclosed).toBe(
    "a substitution",
  );
  // A quote inside the candidate makes it no arithmetic: the text is read as commands.
  expect(words("((echo '))' ; echo ran; echo '' ) )")).toEqual([
    ["echo", "))"],
    ["echo", "ran"],
    ["echo", ""],
  ]);
});

test("SP2c AC-5: the shell reader takes here-document bodies in order and `&>` without a descriptor", () => {
  const two = readCommand("cat <<A <<B\nx\nA\ny\nB\necho z");
  expect(two.pieces[0]?.heredocs).toEqual(["x\n", "y\n"]);
  expect(two.pieces.map((p) => p.tokens.map((t) => t.word))).toEqual([
    ["cat", "<<A", "<<B"],
    ["echo", "z"],
  ]);
  expect(readCommand("echo 2&>x").pieces[0]?.tokens.map((t) => t.raw)).toEqual([
    "echo",
    "2",
    "&>x",
  ]);
});

test("SP2c AC-5: a `case` the reader does not take for one cannot close a substitution early", () => {
  // The reader reads an arm's head only after `case <word> in` at a command position: a nested
  // case at the head of an arm, a newline before `in` or a wrapper before `case` are not read as
  // one, and their arm's `)` would close the substitution early. A frame that closes while a `case`
  // read in it has no `esac` is reported as what the guard cannot read, so the hook fails closed.
  for (const line of [
    'echo "$(case x in x) case y in y) echo a;; esac;; esac)"',
    'echo "$(case x\nin x) echo a;; esac)"',
    'echo "$(time case x in x) echo a;; esac)"',
    "echo ${x:-$(case x\nin x) echo a;; esac)}",
    "cat <<EOF\n$(time case x in x) echo a;; esac)\nEOF",
    // An `esac` that is a word of the case (its subject, a pattern) closes no count: only one at a
    // command position does, so the frame still closes with the case open.
    'echo "$(time case esac in b) echo a;; esac)"',
    'echo "$(case esac\nin b) echo a;; esac)"',
    "echo ${x:-$(time case x in b|esac) echo a;; esac)}",
    "cat <<EOF\n$(case esac\nin b) echo a;; esac)\nEOF",
  ])
    expect(readCommand(line).unclosed).toBe("a case");
  // The first word of a recognised arm may be `esac` (an empty case), read as its end.
  expect(readCommand('echo "$(case x in esac)"').unclosed).toBeNull();
  // The recognised forms read to their `esac`, with the arm's commands inside the substitution.
  for (const line of [
    'echo "$(case x in x) echo a;; esac)"',
    'echo "$(case x in (x) echo a;; esac)"',
  ]) {
    const read = readCommand(line);
    expect(read.unclosed).toBeNull();
    expect(read.pieces[0]?.inner.map((p) => p.tokens.map((t) => t.word))).toEqual([
      ["case", "x", "in", "echo", "a"],
      ["esac"],
    ]);
  }
  // At the top level the arm's `)` only separates, and a `case` with its `esac` is no finding.
  expect(readCommand("case x in x) echo a;; esac").unclosed).toBeNull();
  expect(words("grep case src/a.ts")).toEqual([["grep", "case", "src/a.ts"]]);
});

test("SP7b-T5 AC-3: a piece knows whether it is piped into, and the reading of here-document bodies is unchanged", () => {
  expect(readCommand("a | b; c && d | e").pieces.map((p) => p.piped)).toEqual([
    false,
    true,
    false,
    false,
    true,
  ]);
  expect(readCommand("cat <<'EOF' | sh\nrm x\nEOF").pieces[0]?.heredocs).toEqual(["rm x\n"]);
});

test("CON2-AC-6 (finding 30): an arithmetic body is read past a backtick's parentheses, and a $( inside it is read as commands", () => {
  const backtick = readCommand("(( n = `echo ))` ))");
  expect(backtick.unclosed).toBeNull();
  expect(words("(( n = `echo ))` ))")).toEqual([["(( n = `echo ))` ))"]]);
  const all = (pieces: ReturnType<typeof readCommand>["pieces"]): string[][] =>
    pieces.flatMap((p) => [p.tokens.map((t) => t.word), ...all(p.inner)]);
  expect(all(readCommand("(( $(crew approve w1) ))").pieces)).toContainEqual([
    "crew",
    "approve",
    "w1",
  ]);
});

test("DEBT-AC-4-stands-alone: a wrapper with a script option appends its following words unless it is listed as standing alone, and only su and script are", () => {
  const withScript = WRAPPERS.filter((w) => w.scriptOptions?.length);
  const alone = withScript
    .filter((w) => (w as { scriptStandsAlone?: true }).scriptStandsAlone)
    .map((w) => w.name)
    .sort();
  expect(alone).toEqual(["script", "su"]);
  // The opt-in field is gone: a wrapper added later appends by default.
  expect(WRAPPERS.filter((w) => "scriptAppends" in w).map((w) => w.name)).toEqual([]);
});
