import { expect, test } from "bun:test";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { openedMarkerPath, writeOpenedMarker } from "../src/opened.ts";
import { createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, testEnv } from "./helpers.ts";

const MID = "M-2026-10-16-001-storefront";

/**
 * A session opened by mail is bounded by the hook, which reads the opener's variables from its own
 * environment, the one the session cannot change from a Bash command: the opener's variables are
 * not the session's to set, a full-route spec waits for a person, the session opens no tasks and
 * stops no sessions; a read-only session reads and replies, nothing else (the opener's allow-list
 * keeps every Bash command but `crew` out, and the hook holds the same line, since settings of the
 * destination may allow more than the opener did). The hook reads crew's verbs as the CLI's parser
 * does (a flag that is not boolean takes the next word), inside a shell's quoted script and inside
 * a substitution too (security review of SP2c task 4, rounds 1 to 3).
 */
function session(mode: "read-only" | "branch") {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env: NodeJS.ProcessEnv = {
    ...testEnv(),
    WIZARDINGCODE_CREW_MAIL_ID: MID,
    WIZARDINGCODE_CREW_MAIL_MODE: mode,
    CLAUDE_CODE_SESSION_ATTENDED: "0",
    ...(mode === "branch" ? { WIZARDINGCODE_CREW_MAIL_BRANCH: `crew/mail/${MID}` } : {}),
  };
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode: "dontAsk" });
  const decision = (response: Record<string, unknown>) =>
    (response as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput
      ?.permissionDecision;
  const reason = (response: Record<string, unknown>) =>
    (response as { hookSpecificOutput?: { permissionDecisionReason?: string } }).hookSpecificOutput
      ?.permissionDecisionReason;
  return { root, ctx, bash, decision, reason };
}

test("SP2c AC-1: in a read-only session opened by mail, crew reads and replies and no other command runs", () => {
  const { bash, decision, reason } = session("read-only");
  // The verb is read as the CLI reads it: a flag that takes a value takes the next word.
  const deniedVerbs: [string, string][] = [
    ["crew tdd red w1 AC-1 -- rm -rf x", "tdd"],
    ['crew start "x" --answers {}', "start"],
    ["crew gate run w1", "gate"],
    ["crew detect --refresh", "detect"],
    ["crew approve w1 spec", "approve"],
    ["crew --mode dontAsk approve w1 spec", "approve"],
    ["crew --reason mail tdd red w1 AC-1 -- ls", "tdd"],
    ["crew task w1 list", "task"],
    ['crew mail send --to . --agent session --type question "which?"', "mail send"],
    ["crew mail refuse M-1 --reason x", "mail refuse"],
    ["node /x/dist/crew.mjs --json tdd red w1 AC-1 -- ls", "tdd"],
    ["crew mail inbox && crew evidence w1", "evidence"],
  ];
  for (const [cmd, verb] of deniedVerbs) {
    expect(decision(bash(cmd))).toBe("deny");
    expect(reason(bash(cmd))).toBe(
      `Crew: this read-only session was opened by mail (${MID}) and may only read and reply: crew ${verb} is denied; it ends with crew mail reply ${MID} "<text>"`,
    );
  }
  // The shell runs crew and nothing else, as the opener's allow-list says: the settings of the
  // destination may allow more, so the hook holds the same line. A shell with a script, a
  // substitution, an expansion, a redirect or a here-string is not a crew command either.
  const deniedCommands: [string, string][] = [
    ["npm test", "npm"],
    ["rm -rf x", "rm"],
    ["git log -1", "git"],
    ["ls -la", "ls"],
    ["echo hi > f", "echo"],
    ["sed -n 1,3p src/a.ts", "sed"],
    ["touch f", "touch"],
    ["bun test", "bun"],
    ["node x.js", "node"],
    ["/usr/bin/grep -rn crew src", "grep"],
    ["cd src && crew mail inbox", "cd"],
    ["crew mail inbox | tee out.txt", "tee"],
    ["FOO=1 npm run build", "npm"],
    ["if true; then cat x; fi", "true"],
    ['bash -c "crew skip w1 gate:lint --reason x"', "bash"],
    ['bash -c "crew status; rm -rf x"', "bash"],
    ['sh <<< "crew status"', "sh"],
    ['eval "crew status"', "eval"],
    // A wrapper given its command as a string (`env -S` is denied before this, as a cleared
    // environment), and a lead of wrappers with no command behind it.
    ["flock /tmp/l -c 'crew status'", "flock"],
    ["flock /tmp/l --command='crew status'", "flock"],
    ["env", "env"],
    ["env FOO=1", "env"],
    ["command -v x", "x"],
    ["timeout 5", "timeout"],
    [">/dev/null timeout 5", "timeout"],
    ["crew status $(cat x)", "a substitution"],
    ["crew mail reply M-1 `cat x`", "a substitution"],
    ['crew mail reply M-1 "$ANSWER"', "an expansion"],
    ["crew help > ~/.zshrc", "a redirect"],
    ["crew status 2>/dev/null", "a redirect"],
    ["crew status --json>x", "a redirect"],
    ["crew help x>x", "a redirect"],
    ["crew status<x", "a redirect"],
    ["crew status <<< x", "a here-string"],
    // The shape is read on the same walk as the verb: a case arm's head hides neither.
    ["case x in a) crew status > /tmp/x;; esac", "a redirect"],
    ["case x in a) crew status $(x);; esac", "a substitution"],
    // A piece with no command of its own still writes through its redirect: a bracket's or a
    // keyword's, or a redirect alone (the shell runs its null command into the file).
    ["crew status; > /tmp/x", "a redirect"],
    ["{ crew status; } > ~/.zshrc", "a redirect"],
    ["if crew status; then crew help; fi > f", "a redirect"],
    // A quoted or escaped word glued to an operator is a word and a redirect, as the shell reads it.
    ["crew status '2'>x", "a redirect"],
    ["crew status \\2>x", "a redirect"],
    ['crew status "">x', "a redirect"],
    // The reader decides where a quote ends before anything else is read: a quote stays open across
    // a newline, a double-quote escape closes nothing, an opener inside quotes is text; a case's
    // subject is a word the walk reads (a substitution there is one in the crew command's line); a
    // here-string may carry a descriptor.
    ['crew mail reply M-1 "a\\"b"; rm -rf x', "rm"],
    ["case $(x) in a) crew status;; esac", "a substitution"],
    ["crew status 0<<< x", "a here-string"],
    ["crew mail reply M-1 $ANSWER", "an expansion"],
    // `&>` takes no descriptor: the word before it is an argument, the operator a redirect.
    ["crew status 2&>x", "a redirect"],
  ];
  for (const [cmd, what] of deniedCommands) {
    expect(decision(bash(cmd))).toBe("deny");
    expect(reason(bash(cmd))).toBe(
      `Crew: this read-only session was opened by mail (${MID}) and runs no shell command but crew: ${what} is denied; it reads with the Read, Grep and Glob tools and ends with crew mail reply ${MID} "<text>"`,
    );
  }
  for (const cmd of [
    `crew mail read ${MID}`,
    `crew mail reply ${MID} "the answer"`,
    `crew mail reply ${MID} "we stop here: the field is read in src/a.ts"`,
    "crew mail inbox",
    "crew mail inbox --all",
    "crew mail status",
    "crew status",
    "crew --json status",
    "crew help",
    "crew --version",
    "node /x/dist/crew.mjs status",
    `crew mail read ${MID} && crew status`,
    // A piece of assignments or keywords alone runs nothing, so it passes.
    "FOO=1; crew status",
    "FOO=$X; crew status",
    "{ crew status; }",
    "if crew status; then crew help; fi",
    // A comment runs to the end of its line; a quoted word carries no expansion, no separator and
    // no substitution; a case's second arm is read as an arm.
    "crew status # x; rm -rf x",
    `crew mail reply ${MID} 'costs $5'`,
    `crew mail reply ${MID} 'a\n; rm -rf x'`,
    `crew mail reply ${MID} '$(x)'`,
    "case x in a) crew status;; b) crew help;; esac",
  ])
    expect(bash(cmd)).toEqual({});
});

test("SP2c AC-5: in any session opened by mail the opener's variables, the tasks, the stop and a full-route approve are denied by the hook", () => {
  for (const mode of ["read-only", "branch"] as const) {
    const { ctx, bash, decision, reason } = session(mode);
    const opened = `Crew: this session was opened by mail (${MID})`;
    // The opener's variables are read from the hook's own environment; a command that names one,
    // or that unsets or clears variables, is denied.
    const variables: [string, string][] = [
      [
        "WIZARDINGCODE_CREW_MAIL_ID= crew approve w1 spec --mode dontAsk",
        "WIZARDINGCODE_CREW_MAIL_ID",
      ],
      [
        "WIZARDINGCODE_CREW_MAIL_HOPS=0 crew mail send --to crm --type question x",
        "WIZARDINGCODE_CREW_MAIL_HOPS",
      ],
      ["env -u WIZARDINGCODE_CREW_MAIL_ID crew start x --answers {}", "WIZARDINGCODE_CREW_MAIL_ID"],
      ["env -uWIZARDINGCODE_CREW_MAIL_ID crew status", "WIZARDINGCODE_CREW_MAIL_ID"],
      ["env --unset=WIZARDINGCODE_CREW_MAIL_ID crew status", "WIZARDINGCODE_CREW_MAIL_ID"],
      ["export WIZARDINGCODE_HOME=/tmp/elsewhere", "WIZARDINGCODE_HOME"],
      [
        "unset WIZARDINGCODE_CREW_MAIL_BRANCH; git push origin main",
        "WIZARDINGCODE_CREW_MAIL_BRANCH",
      ],
      ["WIZARDINGCODE_CREW_CLAUDE=/bin/true crew mail status", "WIZARDINGCODE_CREW_CLAUDE"],
      ["declare +x WIZARDINGCODE_CREW_MAIL_ID; crew status", "WIZARDINGCODE_CREW_MAIL_ID"],
      ["grep -rn WIZARDINGCODE_HOME src", "WIZARDINGCODE_HOME"],
      ["V=WIZARDINGCODE_CREW_MAIL_ID; env -u $V crew status", "WIZARDINGCODE_CREW_MAIL_ID"],
      ["env -u $V crew status", "env -u"],
      ["env --unset $V crew status", "env -u"],
      ["env -vu $V crew status", "env -u"],
      ["env -u$V crew status", "env -u"],
      ["env --unset=$V crew status", "env -u"],
      ["env -u= crew status", "env -u"],
      ["unset $V; crew status", "unset"],
      ["unset; crew status", "unset"],
      ["unset -m W*; crew status", "unset"],
      ["typeset +x $V; crew status", "declare +x"],
      ["typeset +x -m W*; crew status", "declare +x"],
      // A variable set, exported or read into under a name the hook cannot read.
      ["export $V=1; crew status", "export"],
      ["declare -x $V=1; crew status", "export"],
      ["${p}E_CREW_MAIL_ID= crew status", "an assignment"],
      ["read $N; crew status", "read"],
      ["printf -v $N x; crew status", "printf -v"],
      ["env -i crew status", "a cleared environment"],
      ["exec -c crew status", "a cleared environment"],
    ];
    for (const [cmd, what] of variables) {
      expect(decision(bash(cmd))).toBe("deny");
      expect(reason(bash(cmd))).toBe(
        `${opened} and the opener's variables are not its to change: ${what} is denied`,
      );
    }
    // No tasks of its own, no stopping of the project's sessions: the verb read as the CLI reads
    // it, with flags in any position, inside a shell's script or a substitution too.
    for (const cmd of [
      "crew task w1 open T-1 --criteria AC-1",
      "crew task --text x w1 open T-1 --criteria AC-1",
      "crew --json task w1 open T-1 --criteria AC-1",
      'bash -c "crew task w1 open T-1 --criteria AC-1"',
      'bash -ce "crew task w1 open T-1 --criteria AC-1"',
      'bash -c -- "crew task w1 open T-1 --criteria AC-1"',
      'fish -c "crew task w1 open T-1 --criteria AC-1"',
      'eval "crew task w1 open T-1 --criteria AC-1"',
      'bash <<< "crew task w1 open T-1 --criteria AC-1"',
      "echo $(crew task w1 open T-1 --criteria AC-1)",
      "nice -n 5 crew task w1 open T-1 --criteria AC-1",
      "timeout 60 crew task w1 open T-1 --criteria AC-1",
      "env -u FOO crew task w1 open T-1 --criteria AC-1",
      "node --no-warnings /x/dist/crew.mjs task w1 open T-1 --criteria AC-1",
    ])
      expect(reason(bash(cmd))).toBe(
        `${opened} and opens no tasks of its own: crew task open is denied`,
      );
    for (const cmd of [
      "crew mail stop M-2026-10-16-002-storefront",
      "crew --json mail stop M-2026-10-16-002-storefront",
      'crew mail --reason "a b" stop M-2026-10-16-002-storefront',
      'sh -c "crew mail stop M-2026-10-16-002-storefront"',
      'eval "crew mail stop M-2026-10-16-002-storefront"',
    ])
      expect(reason(bash(cmd))).toBe(`${opened} and stops no sessions: crew mail stop is denied`);
    // A merge of a task, with the id after a flag that takes a value, or behind a wrapper.
    for (const cmd of [
      "crew task --criteria x w1 merge T-1",
      "env -u FOO crew task w1 merge T-1",
      "crew task w1 merge T-1 --json",
    ])
      expect(reason(bash(cmd))).toContain("crew task merge is denied");
    // Crew with its verb on its input cannot be read (in a read-only session the echo in front of
    // it is denied first), and a clean of the checkout is a write the engine's records would not survive.
    expect(decision(bash("echo approve w1 spec | xargs crew"))).toBe("deny");
    if (mode === "branch")
      expect(reason(bash("echo approve w1 spec | xargs crew"))).toBe(
        "Crew: a crew command whose words come from xargs' input cannot be read; write the command out",
      );
    expect(reason(bash("git clean -fdx"))).toContain("git clean is denied");
    // A full-route spec waits for a person; a standard one is the session's to approve (as the validator).
    const full = createWork(ctx.paths, "Raise the session timeout");
    full.route = "full";
    saveWork(ctx.paths, full);
    const standard = createWork(ctx.paths, "Rename a field");
    saveWork(ctx.paths, standard);
    const waits = `${opened} and a full-route spec waits for a person: crew approve ${full.id} is denied; run crew await ${full.id} user and end the turn`;
    for (const cmd of [
      `crew approve ${full.id} spec --mode dontAsk`,
      `crew --mode dontAsk approve ${full.id} spec`,
      `crew --json approve --mode dontAsk ${full.id} spec`,
      `echo $(crew approve ${full.id} spec --mode dontAsk)`,
      `bash -c "crew approve ${full.id} spec --mode dontAsk"`,
      `bash <<< "crew approve ${full.id} spec --mode dontAsk"`,
      `nice -n 5 crew approve ${full.id} spec --mode dontAsk`,
    ])
      expect(reason(bash(cmd))).toBe(waits);
    if (mode === "branch") {
      expect(
        bash(`crew approve ${standard.id} spec --mode dontAsk --validator complete-gap-round`),
      ).toEqual({});
      expect(
        bash(`crew --mode dontAsk approve ${standard.id} spec --validator complete-gap-round`),
      ).toEqual({});
      expect(bash('crew start "x" --answers {}')).toEqual({});
      expect(bash("crew tdd red w1 AC-1 -- bun test")).toEqual({});
      expect(bash("crew gate run w1")).toEqual({});
      expect(bash('crew mail reply M-1 "we stop here"')).toEqual({});
      expect(bash("crew task w1 list")).toEqual({});
      // A variable of its own, named in full, is the session's to set and unset.
      expect(bash("unset FOO; crew status")).toEqual({});
      expect(bash("env -u FOO crew status")).toEqual({});
      expect(bash("env -vu FOO crew status")).toEqual({});
      expect(bash("env -uFOO crew status")).toEqual({});
      expect(bash("env --unset=FOO crew status")).toEqual({});
      expect(bash("typeset +x FOO; crew status")).toEqual({});
      expect(bash("export FOO=1; crew status")).toEqual({});
      expect(bash("read -r line < x; crew status")).toEqual({});
      expect(decision(bash("git merge main"))).toBe("deny");
    }
  }
});

test("SP2c AC-5: the opener's record only narrows what the variables say: it names the opener of a headless session whose variables are gone, never widens a branch or a depth, and leaves a person's own session alone", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const paths = repoPaths(root, env);
  writeOpenedMarker(paths, { mail: MID, agent: "T-2", hops: 1 });
  const reason = (response: Record<string, unknown>) =>
    (response as { hookSpecificOutput?: { permissionDecisionReason?: string } }).hookSpecificOutput
      ?.permissionDecisionReason;
  // A headless session whose variables are gone: the record names the opener, the agent and the
  // depth; the branch it may push is the variables' alone, so none is pinned here.
  const headless = hookContext(
    { session_id: "s", cwd: root },
    { ...env, CLAUDE_CODE_SESSION_ATTENDED: "0" },
  );
  expect(headless.openedBy).toBe(MID);
  expect(headless.openedMode).toBe("branch");
  expect(headless.openedBranch).toBeNull();
  expect(headless.mail.self).toMatchObject({ openedBy: MID, agent: "T-2", hops: 1 });
  const bash = (ctx: typeof headless, command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode: "dontAsk" });
  expect(reason(bash(headless, "git merge main"))).toContain(`opened by mail (${MID})`);
  expect(reason(bash(headless, "git push origin crew/2026-10-16-001/T-2"))).toContain(
    "git push is denied",
  );
  // The variables present: they say what the session is; the record adds nothing they lack, and
  // the depth is the deeper of the two.
  const withVariables = hookContext(
    { session_id: "s", cwd: root },
    {
      ...env,
      CLAUDE_CODE_SESSION_ATTENDED: "0",
      WIZARDINGCODE_CREW_MAIL_ID: "M-2026-10-16-002-storefront",
      WIZARDINGCODE_CREW_MAIL_MODE: "read-only",
      WIZARDINGCODE_CREW_MAIL_BRANCH: "crew/mail/M-2026-10-16-002-storefront",
      WIZARDINGCODE_CREW_MAIL_AGENT: "session",
      WIZARDINGCODE_CREW_MAIL_HOPS: "0",
    },
  );
  expect(withVariables.openedBy).toBe("M-2026-10-16-002-storefront");
  expect(withVariables.openedMode).toBe("read-only");
  expect(withVariables.openedBranch).toBe("crew/mail/M-2026-10-16-002-storefront");
  expect(withVariables.mail.self).toMatchObject({
    openedBy: "M-2026-10-16-002-storefront",
    agent: "session",
    hops: 1,
  });
  // A person's own session in the same checkout (attended, no variable of the opener's): not opened.
  const person = hookContext({ session_id: "s", cwd: root }, env);
  expect(person.openedBy).toBeNull();
  expect(person.mail.self.openedBy).toBeNull();
  expect(bash(person, "git merge main")).toEqual({});
  // The record is the engine's: the hook denies a write to it, and an opened session stays in its
  // checkout, so it reaches neither the engine's folder nor any other.
  expect(
    reason(
      onPreToolUse(headless, {
        tool_name: "Write",
        tool_input: { file_path: openedMarkerPath(paths), content: "{}" },
        permission_mode: "dontAsk",
      }),
    ),
  ).toContain("maintained by the engine");
  const stays = `Crew: this session was opened by mail (${MID}) and stays in its checkout: `;
  expect(reason(bash(headless, "cd ~/.wizardingcode/crew/opened"))).toBe(
    `${stays}cd ~/.wizardingcode/crew/opened is denied`,
  );
  expect(reason(bash(headless, "cd /tmp && ls"))).toBe(`${stays}cd /tmp is denied`);
  expect(reason(bash(headless, "cd .. && ls"))).toBe(`${stays}cd .. is denied`);
  expect(reason(bash(headless, "cd"))).toBe(`${stays}cd is denied`);
  expect(reason(bash(headless, "cd $HOME"))).toBe(`${stays}cd $HOME is denied`);
  expect(reason(bash(headless, "pushd ~"))).toBe(`${stays}pushd ~ is denied`);
  expect(reason(bash(headless, `ls ${paths.userDir}`))).toBe(
    `${stays}the engine's folder ${paths.userDir} is denied`,
  );
  // The folder named with quotes, an escape or a pattern is the folder still: the check reads the
  // words as the shell hands them, and a word under the home it cannot read is denied as such.
  const folders: [string, string][] = [
    ["cat ~/.wizardingcode/crew/projects.json", "~/.wizardingcode/crew/projects.json"],
    ['cp f ~/".wizardingcode"/crew/integrity/x.json', "~/.wizardingcode/crew/integrity/x.json"],
    ["ls ~/\\.wizardingcode/crew", "~/.wizardingcode/crew"],
    ["ls $HOME/.wizardingcode", "$HOME/.wizardingcode"],
    [`ls ${paths.userDir}/opened/*.json`, `${paths.userDir}/opened/*.json`],
    // An assignment's value is a word too, and the words inside the command line a shell or eval
    // is given are read as their own simple commands.
    ["D=.wizardingcode; cat ~/$D/crew/x", ".wizardingcode"],
    ["bash -c 'cat ~/.wizardingcode/crew/x'", "~/.wizardingcode/crew/x"],
    ["eval 'cd .; cat $HOME/.wizardingcode/crew/x'", "$HOME/.wizardingcode/crew/x"],
  ];
  for (const [cmd, word] of folders)
    expect(reason(bash(headless, cmd))).toBe(`${stays}the engine's folder ${word} is denied`);
  // A pattern or an expansion in a word under an absolute path, under the home, through a parent or
  // behind an expansion: the hook cannot read where it points, so it is denied as such.
  const unreadable = [
    "~/.wizard*/crew",
    "$HOME/.w?zardingcode",
    "/Users/u/.wizardingco?e/crew/x",
    "../../.wizardingco[d]e/crew/x",
    "~/$D/crew/x",
    "/tmp/*/x",
    "${HOME:-/x}/.wizardingco?e/crew/x",
    "$X/.wizardingco[d]e/crew/x",
  ];
  for (const word of unreadable)
    expect(reason(bash(headless, `cat ${word}`))).toBe(
      `${stays}${word} cannot be read and may reach the engine's folder; it is denied`,
    );
  // A change of directory through eval, or through CDPATH, is one all the same.
  expect(reason(bash(headless, "eval cd /tmp"))).toBe(`${stays}cd /tmp is denied`);
  expect(reason(bash(headless, "eval 'cd; ls'"))).toBe(`${stays}cd is denied`);
  expect(reason(bash(headless, "case 1 in 1) cd ~;; esac"))).toBe(`${stays}cd ~ is denied`);
  expect(bash(headless, "case 1 in 1) cd src;; esac")).toEqual({});
  expect(reason(bash(headless, "bash -c 'cd && ls'"))).toBe(`${stays}cd is denied`);
  expect(reason(bash(headless, "CDPATH=/x cd name"))).toBe(`${stays}CDPATH is denied`);
  expect(reason(bash(headless, "export CDPATH=/x; cd name"))).toBe(`${stays}CDPATH is denied`);
  expect(bash(headless, "cd src && ls")).toEqual({});
  expect(bash(headless, "cd ./src/a && ls")).toEqual({});
  expect(bash(headless, "ls ~/projects/x")).toEqual({});
  expect(bash(headless, "ls src/*.ts")).toEqual({});
  expect(bash(headless, "cat ../README.md")).toEqual({});
  expect(bash(headless, "echo $PATH $HOME/projects")).toEqual({});
  // The attendance variable is the opener's too.
  expect(reason(bash(headless, "CLAUDE_CODE_SESSION_ATTENDED=1 crew approve w1 spec"))).toBe(
    `Crew: this session was opened by mail (${MID}) and the opener's variables are not its to change: CLAUDE_CODE_SESSION_ATTENDED is denied`,
  );
});
