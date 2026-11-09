import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { noteUpdated, uncommittedAdapters } from "../src/adapters-uncommitted.ts";
import { startsItem } from "../src/hooks/pre-tool-use.ts";
import { readCommand } from "../src/hooks/shell.ts";
import { canonical } from "../src/paths.ts";
import { shellWord } from "../src/run.ts";
import { installRuntime, pluginRoot, RUNTIMES } from "../src/runtimes.ts";
import { quoteWord, singleQuoted, WRAPPERS } from "../src/shell-words.ts";
import { git, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

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
  // The backtick's contents are read as a command of their own inside the arithmetic word.
  expect(backtick.pieces[0]?.inner.map((p) => p.tokens.map((t) => t.word))).toEqual([["echo"]]);
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
  // The reader itself: the words after su's and script's script are not joined to it, while
  // env -S and flock -c join them, so only those read `crew start` as one command.
  for (const line of ["su -c crew start x", "script -c crew start x"])
    expect(startsItem(line), line).toBe(false);
  for (const line of ["env -S crew start x", "flock /tmp/l -c crew start x"])
    expect(startsItem(line), line).toBe(true);
});

// Item 2026-11-09-003, Task 1: the engine's one single-quote escape (AC-23, AC-34).

test("2026-11-09-003 AC-23: singleQuoted carries a quote through a shell, and the commit command keeps its bytes", () => {
  expect(singleQuoted("a'b c")).toBe("'a'\\''b c'");
  expect(
    execFileSync("sh", ["-c", `printf %s ${singleQuoted("a'b c")}`], { encoding: "utf8" }),
  ).toBe("a'b c");
  expect(quoteWord("a'b")).toBe(singleQuoted("a'b"));
  expect(quoteWord("a.b")).toBe("a.b");
  // The mark's commit command quotes every pathspec with it, as before.
  const root = makeRepo({ "README.md": "# test\n", ".crew/.gitignore": "local/\n" });
  git(root, "config", "user.email", "crew@test.invalid");
  git(root, "config", "user.name", "Crew Test");
  const env = testEnv();
  const done = installRuntime(
    RUNTIMES.copilot,
    "project",
    { project: root, home: env.HOME ?? "" },
    canonical(pluginRoot()),
  );
  if ("refused" in done) throw new Error(done.refused);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "adapters");
  const paths = repoPaths(root, env);
  noteUpdated(paths, "/r/a", {
    version: "1.2.3",
    at: "2026-11-09T00:00:00.000Z",
    head: git(root, "rev-parse", "HEAD"),
    runtimes: [{ name: "copilot", config: false }],
    register: false,
  });
  write(root, ".agents/skills/crew-method/SKILL.md", "# edited\n");
  const agent = git(root, "ls-files", ".github/agents").split("\n")[0] as string;
  write(root, agent, "edited\n");
  expect(uncommittedAdapters(paths, { clear: false })?.command).toBe(
    "git add -A -- '.agents/skills/crew-method' '.github/agents/crew-*' && git commit -m 'adapters refreshed by crew 1.2.3'",
  );
});

test("2026-11-09-003 AC-34: the escape is written once, and its other callers return the bytes they returned", () => {
  // The call that writes the escape, as it stands in source; a doc comment's escaped quote is not this call.
  const call = ".replace(/'/g, \"'\\\\''\")";
  const repo = fileURLToPath(new URL("../../../", import.meta.url));
  const holders: string[] = [];
  for (const folder of ["packages/engine/src", "scripts"])
    for (const name of readdirSync(join(repo, folder), { recursive: true }) as string[])
      if (name.endsWith(".ts") && readFileSync(join(repo, folder, name), "utf8").includes(call))
        holders.push(`${folder}/${name}`);
  expect(holders).toEqual(["packages/engine/src/shell-words.ts"]);
  expect(shellWord("a b")).toBe("'a b'");
  expect(shellWord("-x")).toBe("./-x");
  expect(shellWord("it's")).toBe("'it'\\''s'");
});
