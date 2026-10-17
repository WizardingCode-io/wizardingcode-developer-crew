import { expect, test } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadEvidence } from "../src/evidence.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import {
  agentName,
  answerFile,
  onSubagentStop,
  roleAnswer,
  roleOf,
  roleTokens,
} from "../src/hooks/subagent-stop.ts";
import { loadItemMail, mailbox, ROLE_AGENT, send } from "../src/mail.ts";
import type { RoleRecord } from "../src/types.ts";
import { addCriterion, createWork, loadWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, tempDir, testEnv, write } from "./helpers.ts";

const PLUGIN = "wizardingcode-developer-crew";

/**
 * A subagent transcript as Claude Code writes it: assistant lines with usage, the last one a
 * SubagentHandback. Each usage is `[input, output, cache_creation, cache_read]`; a `requestId`
 * is given when named, so two lines of one request count once.
 */
function transcript(
  dir: string,
  answer: string,
  usages: number[][],
  requestIds?: string[],
): string {
  const file = join(dir, "agent-abc.jsonl");
  const lines = usages.map(([i, o, cc, cr], n) =>
    JSON.stringify({
      type: "assistant",
      ...(requestIds?.[n] ? { requestId: requestIds[n] } : {}),
      message: {
        role: "assistant",
        content:
          n === usages.length - 1
            ? [{ type: "tool_use", name: "SubagentHandback", input: { message: answer } }]
            : [{ type: "text", text: `step ${n}` }],
        usage: {
          input_tokens: i,
          output_tokens: o,
          cache_creation_input_tokens: cc,
          cache_read_input_tokens: cr,
        },
      },
    }),
  );
  lines.unshift(JSON.stringify({ type: "user", message: { role: "user", content: "the prompt" } }));
  writeFileSync(file, `${lines.join("\n")}\n`);
  return file;
}

function session() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  const work = createWork(ctx.paths, "Delete accounts");
  addCriterion(work, "x");
  saveWork(ctx.paths, work);
  return { root, env, ctx, work };
}

test("SP2c AC-3: the role of an agent type, the answer from the hand-back, the tokens from the transcript", () => {
  expect(roleOf(`${PLUGIN}:review-code-quality`)).toBe("review-code-quality");
  expect(roleOf(`${PLUGIN}:judge`)).toBe("judge");
  // The matcher in hooks.json is anchored on the plugin's prefix (spike A4): a bare name is not ours.
  expect(roleOf("judge")).toBeNull();
  expect(roleOf("general-purpose")).toBeNull();
  expect(roleOf("other-plugin:judge")).toBeNull();
  expect(roleOf(undefined)).toBeNull();
  const dir = tempDir("crew-transcript-");
  const file = transcript(dir, "# code-quality findings\n- F-1 …", [
    [1000, 50, 20000, 0],
    [1200, 300, 0, 17000],
  ]);
  expect(roleAnswer(file, "Done; see the report.")).toBe("# code-quality findings\n- F-1 …");
  expect(roleAnswer(join(dir, "missing.jsonl"), "the whole text")).toBe("the whole text");
  // Finding #27's measure: input + output + cache creation, once per request; cache reads are not spent tokens.
  expect(roleTokens(file)).toEqual({ tokens: 22550, from: "transcript" });
  // Two lines of one request (one usage object per content block) count once.
  const twoBlocks = transcript(
    tempDir("crew-transcript-"),
    "x",
    [
      [100, 10, 500, 0],
      [100, 10, 500, 0],
      [200, 20, 0, 600],
    ],
    ["req-1", "req-1", "req-2"],
  );
  expect(roleTokens(twoBlocks)).toEqual({ tokens: 830, from: "transcript" });
  expect(roleTokens(join(dir, "missing.jsonl"))).toEqual({ tokens: 0, from: "none" });
  // The name a record carries: the role, or the next expert number; the file, by the agent and the answer's shape.
  const none: RoleRecord[] = [];
  expect(agentName("review-security", none)).toBe("review-security");
  expect(agentName("judge", none)).toBe("judge");
  expect(agentName("expert", none)).toBe("expert-1");
  const one: RoleRecord[] = [
    { agent: "expert-1", at: "", tokens: 0, tokensFrom: "none", file: "conclave/expert-1.md" },
    {
      agent: "expert-1",
      at: "",
      tokens: 0,
      tokensFrom: "none",
      file: "conclave/expert-1-reply.md",
    },
  ];
  expect(agentName("expert", one)).toBe("expert-2");
  expect(answerFile("review-security", "…")).toBe("review/security.findings.md");
  expect(answerFile("judge", '```json\n{"rulings":[]}\n```')).toBe("review/ruling.json");
  expect(answerFile("judge", "# Ruling, w1\n## Which proposal\nP-1")).toBe("conclave/judge.md");
  expect(answerFile("judge", "# Validator, complete-gap-round, w1\nverdict: holds")).toBe(
    "conclave/validator-complete-gap-round.md",
  );
  expect(answerFile("researcher", "…")).toBe("conclave/researcher.md");
  expect(answerFile("expert-2", "…")).toBe("conclave/expert-2.md");
  expect(answerFile("devils-advocate", "…")).toBe("conclave/devils-advocate.md");
});

test("SP2c AC-3: the SubagentStop matcher in hooks.json, roleOf and the plugin's agents name the same ten roles", () => {
  const plugin = join(import.meta.dir, "..", "..", "..", "plugins", "core");
  const hooks = JSON.parse(readFileSync(join(plugin, "hooks", "hooks.json"), "utf8")) as {
    hooks: {
      SubagentStop: { matcher: string; hooks: { command: string; args: string[] }[] }[];
    };
  };
  const entry = hooks.hooks.SubagentStop[0];
  const matcher = new RegExp(entry?.matcher ?? "(?!)");
  // The entry runs this event through the bundled command: a mistyped event name would record nothing.
  expect(entry?.hooks).toHaveLength(1);
  const [wiring] = entry?.hooks ?? [];
  expect(wiring).toMatchObject({ type: "command", command: "node", timeout: 10 });
  expect(wiring?.args[0]).toMatch(/^\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/crew\.mjs$/);
  expect(wiring?.args.slice(1)).toEqual(["hook", "subagent-stop"]);
  // The agents the plugin ships are the roles; the matcher and roleOf must both accept each, by its prefixed type.
  const agents = readdirSync(join(plugin, "agents"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -".md".length))
    .sort();
  expect(agents).toEqual([
    "devils-advocate",
    "expert",
    "fault-finder",
    "judge",
    "researcher",
    "review-code-quality",
    "review-risk",
    "review-security",
    "review-test-quality",
    "review-ui-ux",
  ]);
  for (const role of agents) {
    expect(matcher.test(`${PLUGIN}:${role}`)).toBe(true);
    expect(roleOf(`${PLUGIN}:${role}`)).toBe(role);
    // The mail knows the same roles as agents a message can name (an expert by its number).
    expect(ROLE_AGENT.test(role === "expert" ? "expert-1" : role)).toBe(true);
  }
  expect(ROLE_AGENT.test("expert")).toBe(false);
  expect(ROLE_AGENT.test("crew")).toBe(false);
  // Neither accepts a bare name, another plugin's agent, a near miss or the skill's own name.
  for (const other of [
    "judge",
    "other-plugin:judge",
    "general-purpose",
    `${PLUGIN}:crew`,
    `${PLUGIN}:expert-1`,
    `${PLUGIN}:review-codequality`,
    `${PLUGIN}:judges`,
    `${PLUGIN}:`,
  ]) {
    expect(matcher.test(other)).toBe(false);
    expect(roleOf(other)).toBeNull();
  }
});

test("SP2c AC-3: SubagentStop saves the answer, records the role and its tokens, and the judge clears the role wait", () => {
  const { root, ctx, work } = session();
  const dir = tempDir("crew-transcript-");
  const findings = transcript(dir, "# code-quality findings for w\n## Findings\n- none\n", [
    [100, 10, 0, 0],
  ]);
  // The lead waits for the roles from the start; a reviewer's stop does not end that wait.
  const waiting = loadWork(ctx.paths, work.id).work;
  if (!waiting) throw new Error("no work");
  waiting.awaiting = "role";
  saveWork(ctx.paths, waiting);
  expect(
    onSubagentStop(ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-code-quality`,
      agent_transcript_path: findings,
      last_assistant_message: "Done.",
    }),
  ).toEqual({});
  expect(
    readFileSync(
      join(root, ".crew", "work", work.id, "review", "code-quality.findings.md"),
      "utf8",
    ),
  ).toBe("# code-quality findings for w\n## Findings\n- none\n");
  expect(loadWork(ctx.paths, work.id).work?.awaiting).toBe("role");
  const ruling = transcript(
    dir,
    '{"rulings":[{"gate":"code-quality","verdict":"proven","findings":[],"tokens":0}]}',
    [
      [500, 40, 0, 0],
      [600, 60, 0, 0],
    ],
  );
  onSubagentStop(ctx, {
    agent_id: "j1",
    agent_type: `${PLUGIN}:judge`,
    agent_transcript_path: ruling,
    last_assistant_message: "Ruled.",
  });
  expect(
    JSON.parse(readFileSync(join(root, ".crew", "work", work.id, "review", "ruling.json"), "utf8")),
  ).toEqual({ rulings: [{ gate: "code-quality", verdict: "proven", findings: [], tokens: 0 }] });
  expect(loadWork(ctx.paths, work.id).work?.awaiting).toBeNull();
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles;
  expect(roles).toEqual([
    {
      agent: "review-code-quality",
      agentId: "r1",
      at: expect.any(String),
      tokens: 110,
      tokensFrom: "transcript",
      file: "review/code-quality.findings.md",
    },
    {
      agent: "judge",
      agentId: "j1",
      at: expect.any(String),
      tokens: 1200,
      tokensFrom: "transcript",
      file: "review/ruling.json",
    },
  ]);
  // Another plugin's agent, and a role with no transcript: ignored, and recorded with tokens unread.
  expect(
    onSubagentStop(ctx, {
      agent_id: "x",
      agent_type: "general-purpose",
      last_assistant_message: "hi",
    }),
  ).toEqual({});
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "# Proposal for w, D-1\n## Proposal\nAnswer: deactivate",
  });
  expect(loadEvidence(ctx.paths, work.id).evidence.roles).toHaveLength(3);
  expect(loadEvidence(ctx.paths, work.id).evidence.roles?.[2]).toMatchObject({
    agent: "expert-1",
    agentId: "e1",
    tokens: 0,
    tokensFrom: "none",
    file: "conclave/expert-1.md",
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "conclave", "expert-1.md"), "utf8"),
  ).toContain("Answer: deactivate");
  // Through the dispatcher, with a payload a hook receives.
  expect(
    handleHook(
      "subagent-stop",
      {
        cwd: root,
        session_id: "s",
        agent_id: "f1",
        agent_type: `${PLUGIN}:fault-finder`,
        last_assistant_message: "- O: …",
      },
      ctx.mail.env,
    ),
  ).toEqual({});
  expect(existsSync(join(root, ".crew", "work", work.id, "conclave", "fault-finder.md"))).toBe(
    true,
  );
});

test("SP2c AC-3: a stop that meets a held work-folder lock saves nothing and says so; the next stop records once", () => {
  const { root, ctx, work } = session();
  // Another stop holds the lock: this one waits its turn and, when the lock outlives the wait, saves
  // nothing rather than racing, and says so (risk review of SP2c task 3: a drop nobody would see).
  const lock = join(root, ".crew", "work", work.id, ".lock");
  mkdirSync(lock);
  const held = onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    agent_transcript_path: "/tmp/agent-e1.jsonl",
    last_assistant_message: "# Proposal for w, D-1\n## Proposal\nAnswer: deactivate",
  });
  expect(held).toEqual({ systemMessage: expect.any(String) });
  expect(held.systemMessage).toContain(
    `Crew: expert stopped but nothing was saved for ${work.id} (work folder busy: ${lock} held for more than 2000 ms): save its answer from the transcript (/tmp/agent-e1.jsonl) by hand, or run the role again.`,
  );
  expect(loadEvidence(ctx.paths, work.id).evidence.roles ?? []).toHaveLength(0);
  expect(existsSync(join(root, ".crew", "work", work.id, "conclave", "expert-1.md"))).toBe(false);
  rmdirSync(lock);
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "# Proposal for w, D-1\n## Proposal\nAnswer: deactivate",
  });
  const read = loadEvidence(ctx.paths, work.id);
  expect(read.tampered).toBe(false);
  expect(read.evidence.roles).toHaveLength(1);
  expect(existsSync(lock)).toBe(false);
});

test("SP2c AC-3: a role's stop that cannot be recorded says what was saved and what was not", () => {
  const { root, ctx, work } = session();
  // The item's evidence changed outside the engine: the answer is saved, the record is not, and the hook says so.
  appendFileSync(join(root, ".crew", "work", work.id, "evidence.json"), " ");
  const stopped = onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-risk`,
    last_assistant_message: "# risk findings\n## Findings\n- none\n",
  });
  expect(stopped).toEqual({
    systemMessage: `Crew: review-risk's answer is saved at review/risk.findings.md but its end and tokens are not recorded: evidence.json of ${work.id} changed outside the engine (crew accept ${work.id}).`,
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "review", "risk.findings.md"), "utf8"),
  ).toBe("# risk findings\n## Findings\n- none\n");
  // Tampered and no answer: the session still hears that no answer came.
  expect(
    onSubagentStop(ctx, {
      agent_id: "r2",
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: "",
    }),
  ).toEqual({
    systemMessage: `Crew: review-risk stopped with no answer (no hand-back and an empty last message) and its end is not recorded: evidence.json of ${work.id} changed outside the engine (crew accept ${work.id}). Run the role again or save its answer from the transcript.`,
  });
  // Tampered while a relayed question waits: the reply is not sent, and the note says how to send it.
  const third = session();
  onSubagentStop(third.ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-risk`,
    last_assistant_message: "# risk findings\n## Findings\n- none\n",
  });
  const asked = send(
    third.ctx.mail,
    { to: ".", agent: "review-risk", type: "question", text: "Which line?" },
    third.work,
  );
  if ("refused" in asked) throw new Error(asked.refused);
  appendFileSync(join(third.root, ".crew", "work", third.work.id, "evidence.json"), " ");
  expect(
    onSubagentStop(third.ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: "Line 12.",
    }),
  ).toEqual({
    systemMessage: `Crew: review-risk's answer is saved at review/risk.findings.md but its end and tokens are not recorded: evidence.json of ${third.work.id} changed outside the engine (crew accept ${third.work.id}); the reply to ${asked.message.id} was not sent: send it with crew mail reply ${asked.message.id} "<text>" --as review-risk --file .crew/work/${third.work.id}/review/risk.findings.md.`,
  });
  expect(
    loadItemMail(third.ctx.paths, third.work.id).box.messages.find((m) => m.id === asked.message.id)
      ?.status,
  ).toBe("sent");
  // The item itself changed outside the engine: nothing is saved.
  const other = session();
  appendFileSync(join(other.root, ".crew", "work", other.work.id, "work.json"), " ");
  expect(
    onSubagentStop(other.ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: "# risk findings\n## Findings\n- none\n",
    }),
  ).toEqual({
    systemMessage: `Crew: review-risk stopped but nothing was saved for ${other.work.id} (work.json changed outside the engine; crew accept ${other.work.id}): save its answer from the transcript by hand, or run the role again.`,
  });
  expect(
    existsSync(join(other.root, ".crew", "work", other.work.id, "review", "risk.findings.md")),
  ).toBe(false);
  // No active item: a role of ours stopped outside the method, which is said once.
  const bare = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const bareCtx = hookContext({ session_id: "s", cwd: bare }, testEnv());
  onSessionStart(bareCtx);
  expect(
    onSubagentStop(bareCtx, {
      agent_id: "j1",
      agent_type: `${PLUGIN}:judge`,
      last_assistant_message: "{}",
    }),
  ).toEqual({
    systemMessage: "Crew: judge stopped with no active work item: its answer was not recorded.",
  });
  // Another plugin's agent is still nobody's business.
  expect(
    onSubagentStop(bareCtx, {
      agent_id: "x",
      agent_type: "general-purpose",
      last_assistant_message: "hi",
    }),
  ).toEqual({});
});

test("SP2c AC-3: a role that stops with no answer is recorded with no file, the hook says an earlier file is not this answer, and the role resumed after it answers the question relayed meanwhile", () => {
  const { root, ctx, work } = session();
  // An earlier round's file sits where this round's answer would go: it must not pass for the answer.
  write(root, `.crew/work/${work.id}/review/risk.findings.md`, "# risk findings, round 1\n");
  const stopped = onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-risk`,
    agent_transcript_path: "/tmp/agent-r1.jsonl",
    last_assistant_message: "",
  });
  expect(stopped).toEqual({
    systemMessage:
      "Crew: review-risk stopped with no answer (no hand-back and an empty last message): its end is recorded with no file; an earlier file of this role, if any, is not this round's answer. Run the role again or save its answer from the transcript (/tmp/agent-r1.jsonl).",
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "review", "risk.findings.md"), "utf8"),
  ).toBe("# risk findings, round 1\n");
  expect(loadEvidence(ctx.paths, work.id).evidence.roles).toEqual([
    {
      agent: "review-risk",
      agentId: "r1",
      at: expect.any(String),
      tokens: 0,
      tokensFrom: "none",
      file: null,
    },
  ]);
  // Resumed after that empty stop, the role gives its first answer: saved whole, where its type says,
  // and sent as the reply to the question the lead relayed meanwhile (code-quality review, round 11).
  const asked = send(
    ctx.mail,
    { to: ".", agent: "review-risk", type: "question", text: "Anything at all?" },
    work,
  );
  if ("refused" in asked) throw new Error(asked.refused);
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-risk`,
    last_assistant_message: "# risk findings, round 2\n## Findings\n- none\n",
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "review", "risk.findings.md"), "utf8"),
  ).toBe("# risk findings, round 2\n## Findings\n- none\n");
  expect((loadEvidence(ctx.paths, work.id).evidence.roles ?? []).map((r) => r.file)).toEqual([
    null,
    "review/risk.findings.md",
  ]);
  expect(
    loadItemMail(ctx.paths, work.id).box.messages.find((m) => m.id === asked.message.id)?.status,
  ).toBe("answered");
  // An expert keeps its number through an empty stop, and the next expert takes the next one.
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "",
  });
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "# Proposal for w, D-1\n## Proposal\nAnswer: deactivate",
  });
  onSubagentStop(ctx, {
    agent_id: "e2",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "# Proposal for w, D-2\n## Proposal\nAnswer: erase",
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "conclave", "expert-1.md"), "utf8"),
  ).toBe("# Proposal for w, D-1\n## Proposal\nAnswer: deactivate\n");
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "conclave", "expert-2.md"), "utf8"),
  ).toBe("# Proposal for w, D-2\n## Proposal\nAnswer: erase\n");
  expect(
    (loadEvidence(ctx.paths, work.id).evidence.roles ?? []).slice(2).map((r) => [r.agent, r.file]),
  ).toEqual([
    ["expert-1", null],
    ["expert-1", "conclave/expert-1.md"],
    ["expert-2", "conclave/expert-2.md"],
  ]);
});

// The integrity map lives under the user's crew directory: made read-only, the answer file is
// written and the record is not, and the hook says that, not "nothing was saved". Root ignores
// file modes, so the check runs as an ordinary user only.
test.skipIf(process.getuid?.() === 0)(
  "SP2c AC-3: a stop cut short after the answer was saved says what was saved and what failed",
  () => {
    // A write of evidence.json whose integrity entry failed leaves the item tampered from then on,
    // so each case runs in its own session.
    const cutShort = (
      ctx: ReturnType<typeof session>["ctx"],
      payload: Parameters<typeof onSubagentStop>[1],
    ) => {
      const integrity = join(ctx.paths.userDir, "integrity");
      mkdirSync(integrity, { recursive: true });
      chmodSync(integrity, 0o555);
      try {
        return onSubagentStop(ctx, payload);
      } finally {
        chmodSync(integrity, 0o755);
      }
    };
    const findings = "# risk findings\n## Findings\n- none\n";
    const first = session();
    const stopped = cutShort(first.ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: findings,
    });
    expect(stopped.systemMessage).toStartWith(
      "Crew: review-risk's answer is saved at review/risk.findings.md but its end and tokens are not recorded (EACCES",
    );
    expect(
      readFileSync(
        join(first.root, ".crew", "work", first.work.id, "review", "risk.findings.md"),
        "utf8",
      ),
    ).toBe(findings);
    // Recorded for real, then asked a question and cut short on the resume: the record comes before
    // the reply, so the reply is not sent, and the hook says both.
    const { ctx, work } = session();
    onSubagentStop(ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: findings,
    });
    const asked = send(
      ctx.mail,
      { to: ".", agent: "review-risk", type: "question", text: "Which line?" },
      work,
    );
    if ("refused" in asked) throw new Error(asked.refused);
    const resumed = cutShort(ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: "Line 12.",
    });
    expect(resumed.systemMessage).toStartWith(
      "Crew: review-risk's answer is saved at review/risk.findings.md but its end and tokens are not recorded (EACCES",
    );
    expect(resumed.systemMessage).toEndWith(
      `); the reply to ${asked.message.id} was not sent: send it with crew mail reply ${asked.message.id} "<text>" --as review-risk --file .crew/work/${work.id}/review/risk.findings.md.`,
    );
    expect(
      loadItemMail(ctx.paths, work.id).box.messages.find((m) => m.id === asked.message.id)?.status,
    ).toBe("sent");
  },
);

test("SP2c AC-3: a resumed role with no question pending joins its earlier file instead of overwriting it", () => {
  const { root, ctx, work } = session();
  const findings = join(root, ".crew", "work", work.id, "review", "security.findings.md");
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-security`,
    last_assistant_message: "# security findings\n## Findings\n- F-1 · defect · a.ts:12 · …\n",
  });
  // The lead resumed the reviewer to ask something without relaying the question through the mail.
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-security`,
    last_assistant_message: "F-1 is a.ts:12, the second branch.",
  });
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-security`,
    last_assistant_message: "And F-1 holds on the current code.",
  });
  const text = readFileSync(findings, "utf8");
  expect(text).toBe(
    "# security findings\n## Findings\n- F-1 · defect · a.ts:12 · …\n\n## Clarifications\n- F-1 is a.ts:12, the second branch.\n- And F-1 holds on the current code.\n",
  );
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(roles.map((r) => r.file)).toEqual([
    "review/security.findings.md",
    "review/security.findings.md",
    "review/security.findings.md",
  ]);
  // Another role's follow-ups go beside its answer, never over it.
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "# Proposal for w, D-1\n## Proposal\nAnswer: deactivate",
  });
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "Deactivation keeps the audit trail.",
  });
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "And erasure stays available on request.",
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "conclave", "expert-1.md"), "utf8"),
  ).toBe("# Proposal for w, D-1\n## Proposal\nAnswer: deactivate\n");
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "conclave", "expert-1-reply.md"), "utf8"),
  ).toBe("Deactivation keeps the audit trail.\n\nAnd erasure stays available on request.\n");
  expect((loadEvidence(ctx.paths, work.id).evidence.roles ?? []).slice(3)).toMatchObject([
    { agent: "expert-1", file: "conclave/expert-1.md" },
    { agent: "expert-1", file: "conclave/expert-1-reply.md" },
    { agent: "expert-1", file: "conclave/expert-1-reply.md" },
  ]);
  // No mail was involved: nothing in the item's mail.
  expect(loadItemMail(ctx.paths, work.id).box.messages).toHaveLength(0);
});

test("SP2c AC-3: a resumed role whose question is pending has its answer saved as the reply and the reply recorded as relayed", () => {
  const { root, ctx, work } = session();
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message: "# Proposal for w, D-1\n## Proposal\nAnswer: deactivate",
  });
  write(root, `.crew/work/${work.id}/conclave/proposals.md`, "## P-1 (D-1)\nAnswer: deactivate\n");
  const asked = send(
    ctx.mail,
    {
      to: ".",
      agent: "expert-1",
      type: "question",
      text: "The devil's advocate says erasure is what the law asks. Answer the objection.",
      filePath: `.crew/work/${work.id}/conclave/proposals.md`,
    },
    work,
  );
  if ("refused" in asked) throw new Error(asked.refused);
  onSubagentStop(ctx, {
    agent_id: "e1",
    agent_type: `${PLUGIN}:expert`,
    last_assistant_message:
      "The law asks for erasure on request; deactivation stays the default. The proposal stands.",
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "conclave", "expert-1-reply.md"), "utf8"),
  ).toContain("The proposal stands.");
  const mail = loadItemMail(ctx.paths, work.id).box.messages;
  expect(mail.find((m) => m.id === asked.message.id)?.status).toBe("answered");
  const replyMessage = mail.find((m) => m.replyTo === asked.message.id);
  expect(replyMessage).toMatchObject({
    from: { agent: "expert-1" },
    to: { agent: "session" },
    relayed: true,
  });
  expect(loadEvidence(ctx.paths, work.id).evidence.roles).toHaveLength(2);
  expect(loadEvidence(ctx.paths, work.id).evidence.roles?.[1]).toMatchObject({
    agent: "expert-1",
    file: "conclave/expert-1-reply.md",
  });
  // The judge's one question to a reviewer: appended to the findings file under Clarifications.
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-test-quality`,
    last_assistant_message:
      "# test-quality findings\n## Findings\n- F-1 · advisory · a.test.ts:1059 · …\n",
  });
  const q = send(
    ctx.mail,
    {
      to: ".",
      agent: "review-test-quality",
      type: "question",
      text: "F-1 names diff line 1059; which file line?",
    },
    work,
  );
  if ("refused" in q) throw new Error(q.refused);
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-test-quality`,
    last_assistant_message: "F-1 is plugins/core/tests/crew-mod.test.ts:220.",
  });
  const file = readFileSync(
    join(root, ".crew", "work", work.id, "review", "test-quality.findings.md"),
    "utf8",
  );
  expect(file).toContain("- F-1 · advisory · a.test.ts:1059 · …\n");
  expect(file).toContain(
    "\n## Clarifications\n- F-1 is plugins/core/tests/crew-mod.test.ts:220.\n",
  );
  // A reply the mailbox cannot take is still saved in the item, and the hook says it was not sent,
  // instead of recording a relay that never happened: first with the mailbox's lock held past the
  // wait, then with the own inbox changed outside the engine.
  const second = send(
    ctx.mail,
    {
      to: ".",
      agent: "review-test-quality",
      type: "question",
      text: "And F-2?",
    },
    work,
  );
  if ("refused" in second) throw new Error(second.refused);
  // The mailbox's lock held past the wait: the answer is saved, the reply is not sent, and the hook
  // says that rather than "nothing was saved" (risk review, round 3).
  const own = mailbox(ctx.paths.userDir, ctx.mail.self.workspace, ctx.mail.self.project).dir;
  const mailLock = join(own, ".lock");
  mkdirSync(mailLock);
  const busy = onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-test-quality`,
    last_assistant_message: "F-2 is the same file, line 240.",
  });
  rmdirSync(mailLock);
  expect(busy).toEqual({
    systemMessage: `Crew: review-test-quality's answer to ${second.message.id} is saved at review/test-quality.findings.md but the reply was not sent: mailbox busy: ${mailLock} held for more than 2000 ms. Once that is cleared, send it with crew mail reply ${second.message.id} "<text>" --as review-test-quality --file .crew/work/${work.id}/review/test-quality.findings.md.`,
  });
  // The own inbox changed outside the engine: the same, with the refusal.
  appendFileSync(join(own, "inbox.json"), " ");
  const unsent = onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-test-quality`,
    last_assistant_message: "F-2 is line 240, confirmed.",
  });
  expect(unsent).toEqual({
    systemMessage: `Crew: review-test-quality's answer to ${second.message.id} is saved at review/test-quality.findings.md but the reply was not sent: ${ctx.mail.self.project}'s inbox changed outside the engine; files under the user's crew directory are written only by the crew command. Once that is cleared, send it with crew mail reply ${second.message.id} "<text>" --as review-test-quality --file .crew/work/${work.id}/review/test-quality.findings.md.`,
  });
  // Every clarification joins the one Clarifications section.
  const clarified = readFileSync(
    join(root, ".crew", "work", work.id, "review", "test-quality.findings.md"),
    "utf8",
  );
  expect(clarified.split("## Clarifications")).toHaveLength(2);
  expect(clarified).toContain(
    "\n## Clarifications\n- F-1 is plugins/core/tests/crew-mod.test.ts:220.\n- F-2 is the same file, line 240.\n- F-2 is line 240, confirmed.\n",
  );
  expect(
    loadItemMail(ctx.paths, work.id).box.messages.find((m) => m.id === second.message.id)?.status,
  ).toBe("sent");
  const records = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(records.at(-1)).toMatchObject({
    agent: "review-test-quality",
    file: "review/test-quality.findings.md",
  });
});

test.skipIf(process.getuid?.() === 0)(
  "SP2c AC-3: a relayed answer names a copy of the question the answered pass could not change",
  () => {
    const env = testEnv();
    const root = makeRepo({
      "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
      "src/a.ts": "x",
    });
    const other = makeRepo({ "README.md": "# crm\n" });
    write(root, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "lead" } }));
    write(
      other,
      ".crew/policy.json",
      JSON.stringify({ mail: { workspace: "w", name: "crm", accept: ["notice"] } }),
    );
    onSessionStart(hookContext({ session_id: "sc", cwd: other }, env));
    const ctx = hookContext({ session_id: "s", cwd: root }, env);
    onSessionStart(ctx);
    const work = createWork(ctx.paths, "Delete accounts");
    addCriterion(work, "x");
    saveWork(ctx.paths, work);
    // A notice gives crm an inbox file; the registry lists crm beside the lead.
    const notice = send(ctx.mail, { to: "crm", type: "notice", text: "A copy to skip" }, null);
    if ("refused" in notice) throw new Error(notice.refused);
    onSubagentStop(ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: "# risk findings\n## Findings\n- none\n",
    });
    const asked = send(
      ctx.mail,
      { to: ".", agent: "review-risk", type: "question", text: "Which line?" },
      work,
    );
    if ("refused" in asked) throw new Error(asked.refused);
    // crm's inbox cannot be read while the role answers: the answered pass skips it, the reply is
    // sent all the same, and the hook's line says which copy was not changed.
    const crmInbox = join(mailbox(ctx.paths.userDir, "w", "crm").dir, "inbox.json");
    chmodSync(crmInbox, 0o000);
    try {
      const stop = onSubagentStop(ctx, {
        agent_id: "r1",
        agent_type: `${PLUGIN}:review-risk`,
        last_assistant_message: "Line 12.",
      }) as { systemMessage?: string };
      expect(stop.systemMessage).toContain(
        `a copy of ${asked.message.id} was not changed: ${crmInbox} (`,
      );
      expect(
        loadItemMail(ctx.paths, work.id).box.messages.find((m) => m.id === asked.message.id)
          ?.status,
      ).toBe("answered");
    } finally {
      chmodSync(crmInbox, 0o644);
    }
  },
);
