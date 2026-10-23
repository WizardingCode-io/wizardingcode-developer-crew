import { expect, spyOn, test } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { loadEvidence } from "../src/evidence.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import {
  agentName,
  answerFile,
  archiveExisting,
  freeArchiveIndex,
  onSubagentStop,
  personalityOf,
  roleAnswer,
  roleOf,
  roleTokens,
  teamOf,
} from "../src/hooks/subagent-stop.ts";
import { loadItemMail, mailbox, ROLE_AGENT, send } from "../src/mail.ts";
import { clearWorking, recordWorking, workingRoles } from "../src/state.ts";
import * as store from "../src/store.ts";
import { ROLE_NAMES } from "../src/team.ts";
import type { Mailbox, RoleRecord, WorkItem } from "../src/types.ts";
import { replyFile } from "../src/validation.ts";
import {
  activeWork,
  addCriterion,
  applyClassification,
  createWork,
  loadWork,
  saveWork,
} from "../src/work.ts";
import { hookContext, makeRepo, spyMailReads, tempDir, testEnv, write } from "./helpers.ts";

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
  // A judge that explains before or after its JSON still hands in the gates' ruling (finding #44).
  expect(
    answerFile(
      "judge",
      'Both reviewers reported no findings, and I have checked each.\n\n{"rulings":[{"gate":"code-quality","verdict":"proven","findings":[],"tokens":0}]}\n\nDropped: nothing.',
    ),
  ).toBe("review/ruling.json");
  expect(answerFile("judge", "# Ruling, w1\n## Which proposal\nP-1")).toBe("conclave/judge.md");
  expect(answerFile("judge", "# Validator, complete-gap-round, w1\nverdict: holds")).toBe(
    "conclave/validator-complete-gap-round.md",
  );
  expect(answerFile("researcher", "…")).toBe("conclave/researcher.md");
  expect(answerFile("expert-2", "…")).toBe("conclave/expert-2.md");
  expect(answerFile("devils-advocate", "…")).toBe("conclave/devils-advocate.md");
});

test("SP2c AC-3, SP7a: the SubagentStop matcher in hooks.json, roleOf, the mail and the plugin's agents name the roles the registry names", () => {
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
    "cto",
    "devils-advocate",
    "expert",
    "fault-finder",
    "judge",
    "researcher",
    "review-architecture",
    "review-code-quality",
    "review-data",
    "review-infra",
    "review-risk",
    "review-security",
    "review-test-quality",
    "review-ui-ux",
    "tech-lead",
  ]);
  for (const role of agents) {
    expect(matcher.test(`${PLUGIN}:${role}`)).toBe(true);
    expect(roleOf(`${PLUGIN}:${role}`)).toBe(role);
    // The mail knows the same roles as agents a message can name (an expert by its number).
    expect(ROLE_AGENT.test(role === "expert" ? "expert-1" : role)).toBe(true);
  }
  // SP7a: the registry is the one source; every role it names is accepted by the matcher, by roleOf
  // and by the mail, the ones with no agent file yet (the leads, the CTO, the three reviewers) too.
  expect(ROLE_NAMES).toContain("lead-devops");
  expect(ROLE_NAMES).toContain("cto");
  for (const role of ROLE_NAMES) {
    expect(matcher.test(`${PLUGIN}:${role}`)).toBe(true);
    expect(roleOf(`${PLUGIN}:${role}`)).toBe(role);
    expect(ROLE_AGENT.test(role === "expert" ? "expert-1" : role)).toBe(true);
  }
  expect(roleOf(`${PLUGIN}:lead-devops`)).toBe("lead-devops");
  expect(roleOf(`${PLUGIN}:cto`)).toBe("cto");
  expect(answerFile("lead-qa", "# qa lead's validation")).toBe("conclave/lead-qa.md");
  expect(answerFile("cto", "# CTO plan")).toBe("conclave/cto.md");
  // The tech lead is one agent for five teams: the file follows the team its first line names.
  expect(ROLE_NAMES).toContain("tech-lead");
  expect(answerFile("tech-lead", "# qa lead's validation of w: spec\nverdict: validated\n")).toBe(
    "conclave/lead-qa.md",
  );
  expect(
    answerFile("tech-lead", "# etl lead's validation of w: delivery\nverdict: returned\n"),
  ).toBe("conclave/lead-etl.delivery.md");
  expect(answerFile("tech-lead", "hello")).toBe("conclave/tech-lead.md");
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

test("SP7a AC-5 (Task 4): a tech lead's stop is filed under the team its first line names, with that team on the record; an answer with no team goes to a numbered file of its own (finding 143)", () => {
  const { root, ctx, work } = session();
  work.route = "full";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:tech-lead`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  stop(
    "l1",
    `# etl lead's validation of ${work.id}: delivery\nverdict: validated\n## Returns\n- none\n## Notes\n- holds\n`,
  );
  stop("l2", "A validation with no header the hook can read.\n");
  const folder = join(root, ".crew", "work", work.id, "conclave");
  expect(readFileSync(join(folder, "lead-etl.delivery.md"), "utf8")).toContain(
    "verdict: validated",
  );
  expect(readFileSync(join(folder, "tech-lead-1.md"), "utf8")).toContain("no header");
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  const filed = roles.filter((r) => r.agent === "tech-lead");
  expect(filed.map((r) => [r.file, r.team])).toEqual([
    ["conclave/lead-etl.delivery.md", "etl"],
    ["conclave/tech-lead-1.md", undefined],
  ]);
});

test("SP7a AC-3 (Task 3): the hook records the personality a debate role declares, its team from the registry, and unknown for a name the registry lacks", () => {
  const { ctx, work } = session();
  work.route = "standard";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, role: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:${role}`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  stop("e1", "expert", "# Proposal for w, D-1\npersonality: creative\n## Proposal\nAnswer: yes\n");
  stop("e2", "expert", "# Proposal for w, D-2\npersonality: cheerful\n## Proposal\nAnswer: no\n");
  stop("r1", "review-test-quality", "# test-quality findings for w\n## Findings\n- none\n");
  stop("j1", "judge", "# Ruling, w\npersonality: professional\n## Which proposal\nP-1\n");
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(roles.find((r) => r.agent === "expert-1")).toMatchObject({ personality: "creative" });
  expect(roles.find((r) => r.agent === "expert-1")?.team).toBeUndefined();
  expect(roles.find((r) => r.agent === "expert-2")).toMatchObject({ personality: "unknown" });
  const reviewer = roles.find((r) => r.agent === "review-test-quality");
  expect(reviewer).toMatchObject({ team: "qa" });
  expect(reviewer?.personality).toBeUndefined();
  expect(roles.find((r) => r.agent === "judge")).toMatchObject({ personality: "professional" });
  expect(personalityOf("# Proposal\npersonality: Conservative\n")).toBe("conservative");
  // The header is read in the first three lines (a blank line after the title is allowed), not below.
  expect(personalityOf("# Proposal\n\npersonality: creative\n")).toBe("creative");
  expect(personalityOf("# Proposal\n\n## Proposal\npersonality: creative\n")).toBeNull();
  expect(teamOf("review-security")).toBe("security");
  expect(teamOf("lead-etl")).toBe("etl");
  expect(teamOf("cto")).toBeNull();
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
  // The judge explained first and dropped a finding after: the file holds the JSON alone (finding #44).
  const ruling = transcript(
    dir,
    'Both reviewers reported no findings, and I have checked each against the diff.\n\n{"rulings":[{"gate":"code-quality","verdict":"proven","findings":[],"tokens":0}]}\n\nDropped: F-1, the claim does not hold against the diff.',
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
      // SP7a: the registry's team of the reviewer travels with the record.
      team: "backend",
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
}, 30_000);

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
    systemMessage: `Crew: review-risk stopped with no answer (no hand-back in its last turn) and its end is not recorded: evidence.json of ${work.id} changed outside the engine (crew accept ${work.id}). Run the role again or save its answer from the transcript.`,
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
      "Crew: review-risk stopped with no answer (no hand-back in its last turn): its end is recorded with no file; an earlier file of this role, if any, is not this round's answer. Run the role again or save its answer from the transcript (/tmp/agent-r1.jsonl).",
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
  ).toBe("done");
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
  // The plain reply file holds the latest reply alone; the earlier one is archived under the
  // answer's ordinal, and its record follows it there (SP6 Task 1 AC-2, findings 104 and 106).
  const conclave = join(root, ".crew", "work", work.id, "conclave");
  expect(readFileSync(join(conclave, "expert-1-reply.md"), "utf8")).toBe(
    "And erasure stays available on request.\n",
  );
  expect(readFileSync(join(conclave, "expert-1-reply.round2.md"), "utf8")).toBe(
    "Deactivation keeps the audit trail.\n",
  );
  expect((loadEvidence(ctx.paths, work.id).evidence.roles ?? []).slice(3)).toMatchObject([
    { agent: "expert-1", file: "conclave/expert-1.md" },
    { agent: "expert-1", file: "conclave/expert-1-reply.round2.md" },
    { agent: "expert-1", file: "conclave/expert-1-reply.md" },
  ]);
  // No mail was involved: nothing in the item's mail.
  expect(loadItemMail(ctx.paths, work.id).box.messages).toHaveLength(0);
});

test("SP6-T1 AC-2: each later reply archives the earlier one under the lowest free index, a gap is filled, a lead's delivery reply has its own name, and a directory at the archive path fails the archive loudly and leaves the plain file", () => {
  const { root, ctx, work } = session();
  const conclave = join(root, ".crew", "work", work.id, "conclave");
  const stop = (agent_id: string, agent_type: string, last_assistant_message: string) =>
    onSubagentStop(ctx, { agent_id, agent_type, last_assistant_message }) as {
      systemMessage?: string;
    };
  const expert = (text: string) => stop("e1", `${PLUGIN}:expert`, text);
  const file = (name: string) => readFileSync(join(conclave, name), "utf8");
  expert("# Proposal for w, D-1\n## Proposal\nAnswer: one");
  expect(expert("two")).toEqual({});
  // The third answer: the second is archived as round2 and the note names both paths.
  const third = expert("three");
  expect(third.systemMessage).toBe(
    "Crew: expert-1's answer is saved at conclave/expert-1-reply.md (the earlier reply kept as conclave/expert-1-reply.round2.md).",
  );
  expect(file("expert-1-reply.md")).toBe("three\n");
  expect(file("expert-1-reply.round2.md")).toBe("two\n");
  // The fourth: the third goes to round3.
  expert("four");
  expect(file("expert-1-reply.md")).toBe("four\n");
  expect(file("expert-1-reply.round3.md")).toBe("three\n");
  expect(file("expert-1-reply.round2.md")).toBe("two\n");
  // A gap in the numbering is filled, never an existing archive overwritten.
  rmSync(join(conclave, "expert-1-reply.round2.md"));
  expert("five");
  expect(file("expert-1-reply.md")).toBe("five\n");
  expect(file("expert-1-reply.round2.md")).toBe("four\n");
  expect(file("expert-1-reply.round3.md")).toBe("three\n");
  expect(file("expert-1.md")).toBe("# Proposal for w, D-1\n## Proposal\nAnswer: one\n");
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(roles.map((r) => r.file)).toEqual([
    "conclave/expert-1.md",
    "conclave/expert-1-reply.round2.md",
    "conclave/expert-1-reply.round3.md",
    "conclave/expert-1-reply.round2.md",
    "conclave/expert-1-reply.md",
  ]);
  // A directory standing at the lowest free archive path is not an archive: the archive write
  // fails on it, the plain file is left as it was, nothing is recorded, and the note says why.
  mkdirSync(join(conclave, "expert-1-reply.round4.md"));
  const failed = expert("six");
  expect(failed.systemMessage).toContain(
    "Crew: expert-1's earlier reply could not be archived at conclave/expert-1-reply.round4.md (",
  );
  expect(failed.systemMessage).toContain("EISDIR");
  expect(failed.systemMessage).toContain(
    "): the plain reply file was left as it was; save this answer from the transcript",
  );
  expect(file("expert-1-reply.md")).toBe("five\n");
  expect(loadEvidence(ctx.paths, work.id).evidence.roles ?? []).toHaveLength(5);
  // A tech lead's delivery reply is archived under its own name, never one the leads share.
  const lead = (text: string) =>
    stop("l1", `${PLUGIN}:tech-lead`, `# qa lead's validation of ${work.id}: delivery\n${text}`);
  lead("verdict: returned\n## Returns\n- R-1 · a.ts:1 · x\n## Notes\n- none");
  lead("verdict: validated\n## Returns\n- none\n## Notes\n- fixed");
  lead("verdict: validated\n## Returns\n- none\n## Notes\n- still fixed");
  expect(file("lead-qa.delivery.md")).toContain("verdict: returned");
  expect(file("lead-qa.delivery-reply.md")).toContain("still fixed");
  expect(file("lead-qa.delivery-reply.round2.md")).toContain("- fixed");
  // A reviewer's later answer still joins its findings file under Clarifications.
  stop("r1", `${PLUGIN}:review-security`, "# security findings\n## Findings\n- none\n");
  stop("r1", `${PLUGIN}:review-security`, "F-1 holds.");
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "review", "security.findings.md"), "utf8"),
  ).toBe("# security findings\n## Findings\n- none\n\n## Clarifications\n- F-1 holds.\n");
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
  expect(mail.find((m) => m.id === asked.message.id)?.status).toBe("done");
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
}, 30_000);

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
      ).toBe("done");
    } finally {
      chmodSync(crmInbox, 0o644);
    }
  },
);

test("SP7a AC-7 (Task 7): a role's stop clears the oldest working entry of its name, whatever became of its answer", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const ctx = hookContext({ session_id: "s", cwd: root }, testEnv());
  // The entries are seconds old: the TTL (an hour) keeps them, whatever the clock says.
  const at = (s: number) => new Date(Date.now() - 10_000 + s * 1000).toISOString();
  recordWorking(ctx.paths, {
    agent: "review-security",
    team: "security",
    since: at(0),
    sessionId: "s",
    description: "first",
  });
  recordWorking(ctx.paths, { agent: "judge", team: null, since: at(1), sessionId: "s" });
  recordWorking(ctx.paths, {
    agent: "review-security",
    team: "security",
    since: at(2),
    sessionId: "s",
    description: "second",
  });
  // No active item and no transcript: the stop has nothing to record, and still clears the entry.
  onSubagentStop(ctx, { agent_type: `${PLUGIN}:review-security`, agent_id: "a1" });
  expect(workingRoles(ctx.paths).map((w) => [w.agent, w.description])).toEqual([
    ["judge", undefined],
    ["review-security", "second"],
  ]);
  clearWorking(ctx.paths, "judge");
  clearWorking(ctx.paths, "judge");
  expect(workingRoles(ctx.paths).map((w) => w.agent)).toEqual(["review-security"]);
});

test("SP3-T1 AC-4 (finding 78): a resumed tech lead's second answer joins its own team's reply file, the first answer untouched; two leads never share a file", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:tech-lead`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  const head = (team: string, what = "spec") =>
    `# ${team} lead's validation of ${work.id}: ${what}\n`;
  stop(
    "q",
    `${head("qa")}verdict: returned\n## Returns\n- R-1 · spec.md:3 · x\n## Notes\n- none\n`,
  );
  stop(
    "s",
    `${head("security")}verdict: returned\n## Returns\n- R-1 · spec.md:4 · y\n## Notes\n- none\n`,
  );
  stop("q", `${head("qa")}verdict: validated\n## Returns\n- none\n## Notes\n- round 2 of qa\n`);
  stop(
    "s",
    `${head("security")}verdict: validated\n## Returns\n- none\n## Notes\n- round 2 of security\n`,
  );
  stop(
    "q",
    `${head("qa", "delivery")}verdict: validated\n## Returns\n- none\n## Notes\n- the delivery\n`,
  );
  const folder = join(root, ".crew", "work", work.id, "conclave");
  expect(readFileSync(join(folder, "lead-qa.md"), "utf8")).toContain("verdict: returned");
  expect(readFileSync(join(folder, "lead-qa.md"), "utf8")).not.toContain("round 2");
  expect(readFileSync(join(folder, "lead-qa-reply.md"), "utf8")).toContain("round 2 of qa");
  expect(readFileSync(join(folder, "lead-security-reply.md"), "utf8")).toContain(
    "round 2 of security",
  );
  expect(readFileSync(join(folder, "lead-qa.delivery-reply.md"), "utf8")).toContain("the delivery");
  expect(existsSync(join(folder, "tech-lead-reply.md"))).toBe(false);
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(roles.filter((r) => r.agent === "tech-lead").map((r) => [r.file, r.team])).toEqual([
    ["conclave/lead-qa.md", "qa"],
    ["conclave/lead-security.md", "security"],
    ["conclave/lead-qa-reply.md", "qa"],
    ["conclave/lead-security-reply.md", "security"],
    ["conclave/lead-qa.delivery-reply.md", "qa"],
  ]);
});

test("AC-3 (finding 125): a lead launched anew never overwrites its earlier answer: the file is archived as .round<n>.md, the note names both, and the role's and the validation's records follow it", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:tech-lead`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  const head = `# qa lead's validation of ${work.id}: spec\n`;
  const folder = join(root, ".crew", "work", work.id, "conclave");
  const file = (name: string) => readFileSync(join(folder, name), "utf8");
  stop("q1", `${head}verdict: returned\n## Returns\n- R-1 · spec.md:3 · x\n## Notes\n- round 1\n`);
  // The session records round 1 from the plain file, then launches the lead again (a new agent
  // id, not a resume): the user's sessions in the client projects do this every round.
  const recorded = loadWork(ctx.paths, work.id).work;
  if (!recorded) throw new Error("no work");
  recorded.validations = [
    {
      what: "spec",
      by: "lead-qa",
      verdict: "returned",
      returns: 1,
      round: 1,
      file: "conclave/lead-qa.md",
      hash: "sha256:spec1",
      at: "2026-10-21T10:00:00.000Z",
    },
  ];
  saveWork(ctx.paths, recorded);
  const second = stop("q2", `${head}verdict: validated\n## Returns\n- none\n## Notes\n- round 2\n`);
  expect(file("lead-qa.round2.md")).toContain("- round 1");
  expect(file("lead-qa.md")).toContain("- round 2");
  expect(file("lead-qa.md")).not.toContain("round 1");
  expect(second.systemMessage).toContain("is saved at conclave/lead-qa.md");
  expect(second.systemMessage).toContain("(the earlier answer kept as conclave/lead-qa.round2.md)");
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(roles.filter((r) => r.agent === "tech-lead").map((r) => r.file)).toEqual([
    "conclave/lead-qa.round2.md",
    "conclave/lead-qa.md",
  ]);
  expect(loadWork(ctx.paths, work.id).work?.validations?.[0]?.file).toBe(
    "conclave/lead-qa.round2.md",
  );
  // A third launch takes the next free index and never writes over an archive.
  stop("q3", `${head}verdict: validated\n## Returns\n- none\n## Notes\n- round 3\n`);
  expect(file("lead-qa.round3.md")).toContain("- round 2");
  expect(file("lead-qa.round2.md")).toContain("- round 1");
  expect(file("lead-qa.md")).toContain("- round 3");
});

test("AC-9 (finding 125): a first answer whose archive cannot be written leaves the earlier file untouched, writes nothing, records nothing, and the note says where the archive failed and why", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:tech-lead`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  const head = `# security lead's validation of ${work.id}: spec\n`;
  const folder = join(root, ".crew", "work", work.id, "conclave");
  stop("s1", `${head}verdict: returned\n## Returns\n- R-1 · spec.md:3 · x\n## Notes\n- round 1\n`);
  // A directory at the lowest free archive path is not an archive: the copy fails on it.
  mkdirSync(join(folder, "lead-security.round2.md"));
  const failed = stop("s2", `${head}verdict: validated\n## Returns\n- none\n## Notes\n- round 2\n`);
  expect(failed.systemMessage).toContain(
    "Crew: tech-lead's earlier answer could not be archived at conclave/lead-security.round2.md (",
  );
  expect(failed.systemMessage).toContain("EISDIR");
  expect(failed.systemMessage).toContain(
    "): the plain file was left as it was; save this answer from the transcript",
  );
  expect(readFileSync(join(folder, "lead-security.md"), "utf8")).toContain("- round 1");
  expect(readFileSync(join(folder, "lead-security.md"), "utf8")).not.toContain("round 2");
  expect(existsSync(join(folder, "lead-security.round3.md"))).toBe(false);
  expect(loadEvidence(ctx.paths, work.id).evidence.roles ?? []).toHaveLength(1);
});

test("AC-3 (finding 125): a review file is not archived: a reviewer launched anew writes over its findings file, which the gate run resets and the judgement record keeps per round", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "gate";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:review-security`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  stop("r1", "# security findings\n## Findings\n- F-1 · defect · a.ts:1 · x\n");
  const second = stop("r2", "# security findings\n## Findings\n- none\n");
  const review = join(root, ".crew", "work", work.id, "review");
  expect(readFileSync(join(review, "security.findings.md"), "utf8")).toContain("- none");
  expect(readdirSync(review).filter((f) => f.includes(".round"))).toEqual([]);
  expect(String(second.systemMessage)).not.toContain("kept as");
});

test("CON8-AC-3 (finding 127): a judge launched twice leaves the second ruling in review/ruling.json with no archived round file and no kept-as note, and both rulings recorded", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "gate";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:judge`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Ruled.",
    });
  stop("j1", '{"rulings":[{"gate":"security","verdict":"defect","findings":["F-1"],"tokens":0}]}');
  const second = stop(
    "j2",
    '{"rulings":[{"gate":"security","verdict":"proven","findings":[],"tokens":0}]}',
  );
  const review = join(root, ".crew", "work", work.id, "review");
  expect(JSON.parse(readFileSync(join(review, "ruling.json"), "utf8"))).toEqual({
    rulings: [{ gate: "security", verdict: "proven", findings: [], tokens: 0 }],
  });
  expect(readdirSync(review).filter((f) => f.includes(".round"))).toEqual([]);
  expect(String(second.systemMessage)).not.toContain("kept as");
  // The overwrite never hides that an earlier ruling existed: both answers are recorded (R-3).
  const judges = (loadEvidence(ctx.paths, work.id).evidence.roles ?? []).filter(
    (r) => r.agent === "judge",
  );
  expect(judges.map((r) => [r.agentId, r.file])).toEqual([
    ["j1", "review/ruling.json"],
    ["j2", "review/ruling.json"],
  ]);
});

test("SP8-T4 AC-3: on an audit item the hook files a reviewer's answer as audit/<gate>.findings.md and the researcher's as audit/dependencies.findings.md; on any other kind the files stay where they were", () => {
  expect(answerFile("review-security", "…", "audit")).toBe("audit/security.findings.md");
  expect(answerFile("researcher", "# Dependencies for w1", "audit")).toBe(
    "audit/dependencies.findings.md",
  );
  expect(answerFile("review-security", "…", "feature")).toBe("review/security.findings.md");
  expect(answerFile("researcher", "# Research for w1", "feature")).toBe("conclave/researcher.md");
  expect(answerFile("researcher", "# Research for w1")).toBe("conclave/researcher.md");
  const { root, ctx, work } = session();
  applyClassification(
    work,
    "audit",
    { route: "full", reasons: [], riskAreas: [] },
    { kind: "audit", from: "work_type audit" },
  );
  work.phase = "audit";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-security`,
    agent_transcript_path: transcript(
      dir,
      `# security findings for ${work.id}\nreviewer: review-security\n## Findings\n- none\n`,
      [[100, 10, 0, 0]],
    ),
    last_assistant_message: "Done.",
  });
  expect(
    readFileSync(join(root, ".crew", "work", work.id, "audit", "security.findings.md"), "utf8"),
  ).toContain("# security findings for");
  const roles = loadEvidence(ctx.paths, work.id).evidence.roles ?? [];
  expect(roles.find((r) => r.agent === "review-security")?.file).toBe("audit/security.findings.md");
});

test("AC-4 (item C2a): the tampered-evidence note names the archive an earlier answer went to, so the move is not lost with the record", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:tech-lead`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  const head = `# qa lead's validation of ${work.id}: spec\n`;
  stop("q1", `${head}verdict: returned\n## Returns\n- R-1 · spec.md:3 · x\n## Notes\n- round 1\n`);
  // The evidence edited by hand: the next answer is archived and written, its record is not.
  const evidencePath = join(root, ".crew", "work", work.id, "evidence.json");
  writeFileSync(evidencePath, `${readFileSync(evidencePath, "utf8")}\n`);
  const second = stop("q2", `${head}verdict: validated\n## Returns\n- none\n## Notes\n- round 2\n`);
  expect(String(second.systemMessage)).toContain(
    "is saved at conclave/lead-qa.md (the earlier answer kept as conclave/lead-qa.round2.md) but its end and tokens are not recorded",
  );
  const conclave = join(root, ".crew", "work", work.id, "conclave");
  expect(readFileSync(join(conclave, "lead-qa.round2.md"), "utf8")).toContain("- round 1");
  expect(readFileSync(join(conclave, "lead-qa.md"), "utf8")).toContain("- round 2");
});

// Item D (finding 132): the lines of a transcript by shape, so a row can lay out a role's turns.
const prompt = (text: string) => ({ type: "user", message: { role: "user", content: text } });
const handback = (message: string) => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", name: "SubagentHandback", input: { message } }] },
});
const toolUse = () => ({
  type: "assistant",
  message: { content: [{ type: "tool_use", name: "Read", input: { file_path: "spec.md" } }] },
});
const toolResult = () => ({
  type: "user",
  message: { content: [{ type: "tool_result", tool_use_id: "t", content: "x" }] },
});
/** A transcript of the given lines, one JSON object a line. */
function turns(dir: string, lines: object[]): string {
  const file = join(dir, "agent-turns.jsonl");
  writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`);
  return file;
}

test("AC-8 (item D, finding 132): roleAnswer reads the hand-back of the role's last turn alone, waits a bounded time for one not yet written, and never gives an earlier turn's", async () => {
  const dir = tempDir("crew-turns-");
  const read = roleAnswer as (
    path: string | undefined,
    last: string | undefined,
    wait?: { ms: number; sleep?: (ms: number) => void },
  ) => string;
  // A tool result is a user line too: it never starts a turn, so a hand-back before one counts.
  const first = turns(dir, [prompt("go"), toolUse(), toolResult(), handback("A1"), toolResult()]);
  expect(read(first, "Done.", { ms: 0 })).toBe("A1");
  // A resumed turn with tool calls and no hand-back: never the earlier turn's, even after the wait.
  const resumed = [
    prompt("go"),
    handback("A1"),
    toolResult(),
    prompt("round 2"),
    toolUse(),
    toolResult(),
  ];
  const file = turns(dir, resumed);
  expect(read(file, "Done.", { ms: 0 })).toBe("");
  // The turn's hand-back written during the wait is the answer.
  let slept = 0;
  const late = (ms: number) => {
    slept += ms;
    appendFileSync(file, `${JSON.stringify(handback("A2"))}\n`);
  };
  expect(read(file, "Done.", { ms: 1000, sleep: late })).toBe("A2");
  expect(slept).toBe(100);
  // Not written within the wait: no answer, the sleeps bounded by the wait.
  turns(dir, resumed);
  slept = 0;
  const count = (ms: number) => {
    slept += ms;
  };
  expect(read(file, "Done.", { ms: 450, sleep: count })).toBe("");
  expect(slept).toBeGreaterThanOrEqual(400);
  expect(slept).toBeLessThanOrEqual(500);
  // A prompt whose content is an array of text parts opens a turn too.
  const parts = {
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "round 2" }] },
  };
  turns(dir, [prompt("go"), handback("A1"), toolResult(), parts, toolUse(), toolResult()]);
  expect(read(file, "Done.", { ms: 0 })).toBe("");
  // A role that never handed back keeps the payload's last message once the wait passes.
  const text = turns(dir, [prompt("go"), toolUse(), toolResult()]);
  expect(read(text, "the whole text", { ms: 0 })).toBe("the whole text");
  slept = 0;
  expect(read(text, "the whole text", { ms: 200, sleep: count })).toBe("the whole text");
  expect(slept).toBe(200);
  // A missing transcript is not waited for: nothing will be written to it.
  slept = 0;
  expect(read(join(dir, "missing.jsonl"), "the whole text", { ms: 1000, sleep: count })).toBe(
    "the whole text",
  );
  expect(slept).toBe(0);
  // The hook's wait: a finite, non-negative number of milliseconds, capped; 3000 otherwise.
  const mod = (await import("../src/hooks/subagent-stop.ts")) as Record<string, unknown>;
  const waitOf = mod.handbackWaitMs as ((env: NodeJS.ProcessEnv) => number) | undefined;
  expect(typeof waitOf).toBe("function");
  const of = (value?: string) =>
    waitOf?.(value === undefined ? {} : { WIZARDINGCODE_CREW_HANDBACK_WAIT_MS: value });
  expect(of()).toBe(3000);
  expect(of("250")).toBe(250);
  expect(of("0")).toBe(0);
  for (const bad of ["-1", "abc", "", "Infinity", "NaN"]) expect(of(bad), bad).toBe(3000);
  expect(of("999999")).toBe(10000);
});

test("AC-2 (item D, finding 132): a resumed lead whose last turn holds no hand-back after the wait files no reply, its stop recorded with no file and the session told", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  ctx.env.WIZARDINGCODE_CREW_HANDBACK_WAIT_MS = "0";
  const dir = tempDir("crew-turns-");
  const spec = `# qa lead's validation of ${work.id}: spec\nverdict: validated\n## Returns\n- none\n## Notes\n- round 1\n`;
  const stop = (lines: object[]) =>
    onSubagentStop(ctx, {
      agent_id: "q",
      agent_type: `${PLUGIN}:tech-lead`,
      agent_transcript_path: turns(dir, lines),
      last_assistant_message: "Done.",
    });
  stop([prompt("go"), handback(spec), toolResult()]);
  const out = stop([
    prompt("go"),
    handback(spec),
    toolResult(),
    prompt("the delivery"),
    toolUse(),
    toolResult(),
  ]);
  const folder = join(root, ".crew", "work", work.id, "conclave");
  expect(readdirSync(folder).sort()).toEqual(["lead-qa.md"]);
  expect(out.systemMessage).toContain("Crew: tech-lead stopped with no answer");
  const roles = (loadEvidence(ctx.paths, work.id).evidence.roles ?? []).filter(
    (r) => r.agent === "tech-lead",
  );
  expect(roles.map((r) => r.file)).toEqual(["conclave/lead-qa.md", null]);
});

test("CON3-AC-5: a lead's validation of a plan is filed as conclave/lead-<team>.plan.md, a resumed one as conclave/lead-<team>.plan-reply.md, never over the spec's files (finding 53)", () => {
  expect(answerFile("tech-lead", "# qa lead's validation of w: plan\nverdict: validated\n")).toBe(
    "conclave/lead-qa.plan.md",
  );
  expect(replyFile("lead-qa", "plan")).toBe("conclave/lead-qa.plan-reply.md");
  // The spec's names and the delivery's are unchanged.
  expect(answerFile("tech-lead", "# qa lead's validation of w: spec\nverdict: validated\n")).toBe(
    "conclave/lead-qa.md",
  );
  expect(replyFile("lead-qa", "spec")).toBe("conclave/lead-qa-reply.md");
  expect(
    answerFile("tech-lead", "# qa lead's validation of w: delivery\nverdict: validated\n"),
  ).toBe("conclave/lead-qa.delivery.md");
  expect(replyFile("lead-qa", "delivery")).toBe("conclave/lead-qa.delivery-reply.md");
  expect(replyFile("judge", "")).toBe("conclave/judge-reply.md");
});

/**
 * The relay of a reviewer's answer to the lead's question, with the boxes as `mark` leaves them
 * once the reply is in them: a box holding the reply reads as changed outside the engine.
 */
function relayWithBoxesChanged(boxes: RegExp, throwOnItemMail = false) {
  const { root, ctx, work } = session();
  onSubagentStop(ctx, {
    agent_id: "r1",
    agent_type: `${PLUGIN}:review-test-quality`,
    last_assistant_message:
      "# test-quality findings\n## Findings\n- F-1 · advisory · a.test.ts:9 · …\n",
  });
  const q = send(
    ctx.mail,
    { to: ".", agent: "review-test-quality", type: "question", text: "Which file line?" },
    work,
  );
  if ("refused" in q) throw new Error(q.refused);
  const qid = q.message.id;
  const realWrite = store.writeProtectedJson;
  let changed = false;
  const read = spyMailReads((file, out) => {
    if (boxes.test(file) && out.data?.messages?.some((m) => m.replyTo === qid)) {
      changed = true;
      return { ...out, tampered: true };
    }
    return out;
  });
  const failingWrite = spyOn(store, "writeProtectedJson").mockImplementation(((
    ...args: Parameters<typeof store.writeProtectedJson>
  ) => {
    if (throwOnItemMail && changed && String(args[1]).endsWith("mail.json"))
      throw new Error("disk full");
    return realWrite(...args);
  }) as typeof store.writeProtectedJson);
  let stop: { systemMessage?: string };
  try {
    stop = onSubagentStop(ctx, {
      agent_id: "r1",
      agent_type: `${PLUGIN}:review-test-quality`,
      last_assistant_message: "F-1 is line 12.",
    }) as { systemMessage?: string };
  } finally {
    read.mockRestore();
    failingWrite.mockRestore();
  }
  const own = mailbox(ctx.paths.userDir, ctx.mail.self.workspace, ctx.mail.self.project).dir;
  const outbox = JSON.parse(readFileSync(join(own, "outbox.json"), "utf8")) as Mailbox;
  const sent = outbox.messages.find((m) => m.replyTo === qid);
  return { root, ctx, work, qid, sent, text: stop.systemMessage ?? "" };
}

test("CON3-AC-6: a relayed reply delivered while the original could not be marked answered is reported as sent with that note, never as not sent with a send-by-hand line; a refusal keeps the relay's notes (finding 30)", () => {
  // Every copy of the original changed between the delivery and the marking: nothing is marked.
  const delivered = relayWithBoxesChanged(/(inbox|outbox)\.json$/);
  expect(delivered.sent).toBeDefined();
  const replyId = delivered.sent?.id ?? "";
  expect(delivered.text).toContain(
    `${replyId} was sent, but ${delivered.qid} could not be marked answered: `,
  );
  expect(delivered.text).not.toContain("was not sent");
  expect(delivered.text).not.toContain("crew mail reply");
  // The copies the marking skipped are named with it.
  expect(delivered.text).toContain(`a copy of ${delivered.qid} was not changed: `);
  // A plain refusal (here the item's record failing after a copy was skipped) keeps the notes.
  const refused = relayWithBoxesChanged(/inbox\.json$/, true);
  expect(refused.text).toContain("disk full");
  expect(refused.text).toContain(`a copy of ${refused.qid} was not changed: `);
});

/**
 * Two open items of one checkout, the second active, and a role's stop with its answer in a
 * transcript: the setup the rows of finding 136 share (triage 3g).
 */
function twoItems() {
  const { root, env, ctx, work: first } = session();
  const second = createWork(ctx.paths, "Export invoices");
  addCriterion(second, "y");
  saveWork(ctx.paths, second);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, role: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:${role}`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    }) as { systemMessage?: string };
  const folder = (id: string) => join(root, ".crew", "work", id);
  return { root, env, ctx, first, second, stop, folder };
}

test("CON3-AC-10: the SubagentStop hook files a role's answer under the open item its heading names, else the one item waiting for the roles when the active one is not, else the active item; the notice names the item when it is not the active one (finding 136)", () => {
  const { ctx, first, second, stop, folder } = twoItems();
  const notActive = `for ${first.id}, not the active ${second.id}`;
  // A reviewer's answer headed for the first item: filed there, and the notice names it.
  const reviewed = stop(
    "r1",
    "review-code-quality",
    `# code-quality findings for ${first.id}\n## Findings\n- none\n`,
  );
  expect(existsSync(join(folder(first.id), "review", "code-quality.findings.md"))).toBe(true);
  expect(existsSync(join(folder(second.id), "review", "code-quality.findings.md"))).toBe(false);
  expect(reviewed.systemMessage ?? "").toContain(notActive);
  expect((loadEvidence(ctx.paths, first.id).evidence.roles ?? []).map((r) => r.agent)).toContain(
    "review-code-quality",
  );
  // A judge's JSON (no heading): the first waits for the roles and the active one does not.
  const waiting = loadWork(ctx.paths, first.id).work;
  if (!waiting) throw new Error("no work");
  waiting.awaiting = "role";
  saveWork(ctx.paths, waiting);
  const ruling =
    '{"rulings":[{"gate":"code-quality","verdict":"proven","findings":[],"tokens":0}]}';
  const ruled = stop("j1", "judge", ruling);
  expect(existsSync(join(folder(first.id), "review", "ruling.json"))).toBe(true);
  expect(existsSync(join(folder(second.id), "review", "ruling.json"))).toBe(false);
  expect(ruled.systemMessage ?? "").toContain(notActive);
  // With neither waiting: the active item's, as today.
  const cleared = loadWork(ctx.paths, first.id).work;
  if (!cleared) throw new Error("no work");
  cleared.awaiting = null;
  saveWork(ctx.paths, cleared);
  stop("j2", "judge", ruling);
  expect(existsSync(join(folder(second.id), "review", "ruling.json"))).toBe(true);
  // A heading naming a learned item, and one naming an id no store of this project holds: the active item.
  const learned = loadWork(ctx.paths, first.id).work;
  if (!learned) throw new Error("no work");
  learned.learned = { at: "t", entries: [], confirmed: [] };
  saveWork(ctx.paths, learned);
  stop("r2", "review-security", `# security findings for ${first.id}\n## Findings\n- none\n`);
  expect(existsSync(join(folder(second.id), "review", "security.findings.md"))).toBe(true);
  expect(existsSync(join(folder(first.id), "review", "security.findings.md"))).toBe(false);
  stop("r3", "review-risk", "# risk findings for 2026-10-22-999-nowhere\n## Findings\n- none\n");
  expect(existsSync(join(folder(second.id), "review", "risk.findings.md"))).toBe(true);
});

test("CON3-AC-11: a tampered item never takes a role's answer by its heading or its wait; the answer falls to the next rule and the tampered folder is left untouched", () => {
  const { ctx, first, second, stop, folder } = twoItems();
  // The first item waits for the roles, then its work.json is edited by hand.
  const waiting = loadWork(ctx.paths, first.id).work;
  if (!waiting) throw new Error("no work");
  waiting.awaiting = "role";
  saveWork(ctx.paths, waiting);
  const file = join(folder(first.id), "work.json");
  writeFileSync(
    file,
    readFileSync(file, "utf8").replace('"title"', '"title" ').replace(/\n$/, " \n"),
  );
  expect(loadWork(ctx.paths, first.id).tampered).toBe(true);
  const before = readdirSync(folder(first.id)).sort();
  // By its heading: the answer falls to the active item.
  stop(
    "r1",
    "review-code-quality",
    `# code-quality findings for ${first.id}\n## Findings\n- none\n`,
  );
  expect(existsSync(join(folder(first.id), "review", "code-quality.findings.md"))).toBe(false);
  expect(existsSync(join(folder(second.id), "review", "code-quality.findings.md"))).toBe(true);
  // By its wait: a judge's JSON falls to the active item too.
  stop(
    "j1",
    "judge",
    '{"rulings":[{"gate":"code-quality","verdict":"proven","findings":[],"tokens":0}]}',
  );
  expect(existsSync(join(folder(first.id), "review", "ruling.json"))).toBe(false);
  expect(existsSync(join(folder(second.id), "review", "ruling.json"))).toBe(true);
  expect(readdirSync(folder(first.id)).sort()).toEqual(before);
});

test("DEBT2-AC-2-3i: an abandoned item named by the heading, two items waiting, another project's item and a store folder that is no item's id each leave the answer with the active item; an active item waiting and changed outside the engine takes nothing, and no other item takes its answer (triage 3i, finding 136)", () => {
  const { env, ctx, first, second, stop, folder } = twoItems();
  const ruling =
    '{"rulings":[{"gate":"code-quality","verdict":"proven","findings":[],"tokens":0}]}';
  const set = (id: string, change: (w: WorkItem) => void) => {
    const work = loadWork(ctx.paths, id).work;
    if (!work) throw new Error("no work");
    change(work);
    saveWork(ctx.paths, work);
  };
  const holding = (ids: string[], file: string) =>
    ids.filter((id) => existsSync(join(folder(id), "review", file)));
  // A heading naming an abandoned item: the active item's.
  set(first.id, (w) => {
    w.abandoned = {
      at: "2026-10-23T09:00:00.000Z",
      reason: "dropped",
      by: { by: "user", relayed: true },
    };
  });
  stop(
    "r1",
    "review-code-quality",
    `# code-quality findings for ${first.id}\n## Findings\n- none\n`,
  );
  expect(holding([first.id, second.id], "code-quality.findings.md")).toEqual([second.id]);
  set(first.id, (w) => {
    delete w.abandoned;
  });
  // Two items waiting for the roles, the active one not: no single one waits, so the active item's.
  const third = createWork(ctx.paths, "Archive orders");
  addCriterion(third, "z");
  saveWork(ctx.paths, third);
  expect(activeWork(ctx.paths)?.work?.id).toBe(third.id);
  for (const id of [first.id, second.id])
    set(id, (w) => {
      w.awaiting = "role";
    });
  const all = [first.id, second.id, third.id];
  stop("j1", "judge", ruling);
  expect(holding(all, "ruling.json")).toEqual([third.id]);
  // Another project's item by its real id, the others no longer waiting: the active item's, and
  // the other project's folder is never written.
  for (const id of [first.id, second.id])
    set(id, (w) => {
      w.awaiting = null;
    });
  const other = makeRepo({ "package.json": "{}" });
  const otherPaths = hookContext({ session_id: "o", cwd: other }, env).paths;
  const foreign = createWork(otherPaths, "Foreign item");
  saveWork(otherPaths, foreign);
  const otherFolder = join(other, ".crew", "work", foreign.id);
  const otherBefore = readdirSync(otherFolder).sort();
  stop("r2", "review-security", `# security findings for ${foreign.id}\n## Findings\n- none\n`);
  expect(readdirSync(otherFolder).sort()).toEqual(otherBefore);
  expect(holding(all, "security.findings.md")).toEqual([third.id]);
  // A folder of this store whose name is no item's id, holding the engine's own record of a wait.
  const copy = loadWork(ctx.paths, first.id).work;
  if (!copy) throw new Error("no work");
  saveWork(ctx.paths, { ...copy, id: "backup", awaiting: "role" });
  expect(loadWork(ctx.paths, "backup").tampered).toBe(false);
  stop("r3", "review-risk", "# risk findings\n## Findings\n- none\n");
  expect(existsSync(join(ctx.paths.crewDir, "work", "backup", "review", "risk.findings.md"))).toBe(
    false,
  );
  expect(holding(all, "risk.findings.md")).toEqual([third.id]);
  rmSync(join(ctx.paths.crewDir, "work", "backup"), { recursive: true });
  // The active item waiting, then changed outside the engine, beside one other waiting: the
  // answer is not filed, and never under the other item.
  set(third.id, (w) => {
    w.awaiting = "role";
  });
  set(first.id, (w) => {
    w.awaiting = "role";
  });
  const file = join(folder(third.id), "work.json");
  writeFileSync(file, readFileSync(file, "utf8").replace(/\n$/, " \n"));
  const refused = stop("r4", "review-data", "# data findings\n## Findings\n- none\n");
  expect(refused.systemMessage ?? "").toContain(`nothing was saved for ${third.id}`);
  expect(holding(all, "data.findings.md")).toEqual([]);
});

test("DEBT-AC-10-archive-name: freeArchiveIndex returns a free index for a file not ending in .md, and the archive takes .round<k> before its extension (finding 142)", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "ruling.json"), "{}");
  expect(freeArchiveIndex(dir, "ruling.json")).toBe(2);
  writeFileSync(join(dir, "ruling.round2.json"), "{}");
  expect(freeArchiveIndex(dir, "ruling.json")).toBe(3);
  // A name with no extension at all takes the suffix at its end.
  writeFileSync(join(dir, "notes"), "n");
  expect(freeArchiveIndex(dir, "notes")).toBe(2);
  expect(archiveExisting(dir, "ruling.json")).toEqual({ archived: "ruling.round3.json" });
  expect(readFileSync(join(dir, "ruling.round3.json"), "utf8")).toBe("{}");
  expect(archiveExisting(dir, "notes")).toEqual({ archived: "notes.round2" });
  // The .md names keep their form.
  writeFileSync(join(dir, "lead-qa.md"), "a");
  expect(archiveExisting(dir, "lead-qa.md")).toEqual({ archived: "lead-qa.round2.md" });
});

test("AC-13 (finding 145): a resumed judge's gates ruling goes to review/ruling.json, the earlier archived as ruling.round<k>.json; its other answer keeps the reply file and leaves the ruling alone", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "gate";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (answer: string) =>
    onSubagentStop(ctx, {
      agent_id: "j",
      agent_type: `${PLUGIN}:judge`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Ruled.",
    });
  const first = { rulings: [{ gate: "security", verdict: "not-proven", findings: ["F-1"] }] };
  const second = { rulings: [{ gate: "security", verdict: "proven", findings: [] }] };
  const third = { rulings: [{ gate: "code-quality", verdict: "proven", findings: [] }] };
  stop(JSON.stringify(first));
  // Resumed for round 2: the ruling, explained around, as a judge on a clean diff writes it.
  const resumed = stop(`Round 2.\n\n\`\`\`json\n${JSON.stringify(second)}\n\`\`\``);
  const folder = join(root, ".crew", "work", work.id);
  const read = (f: string) => JSON.parse(readFileSync(join(folder, f), "utf8"));
  expect(read("review/ruling.json")).toEqual(second);
  expect(read("review/ruling.round2.json")).toEqual(first);
  expect(existsSync(join(folder, "conclave", "judge-reply.md"))).toBe(false);
  expect(String(resumed.systemMessage)).toContain("review/ruling.round2.json");
  stop(JSON.stringify(third));
  expect(read("review/ruling.json")).toEqual(third);
  expect(read("review/ruling.round3.json")).toEqual(second);
  // A resumed judge's answer with no ruling (its questions) keeps the reply file.
  stop("Questions:\n- Q-1: which spec line holds?\n");
  expect(readFileSync(join(folder, "conclave", "judge-reply.md"), "utf8")).toContain("Q-1");
  expect(read("review/ruling.json")).toEqual(third);
  const judges = (loadEvidence(ctx.paths, work.id).evidence.roles ?? []).filter(
    (r) => r.agent === "judge",
  );
  expect(judges.map((r) => r.file)).toEqual([
    "review/ruling.round2.json",
    "review/ruling.round3.json",
    "review/ruling.json",
    "conclave/judge-reply.md",
  ]);
});

test("AC-12 (finding 143): a tech lead's answer with no heading is filed as tech-lead-<n>.md with no team, its resumed reply as tech-lead-<n>-reply.md, and the note asks for the heading", () => {
  const { root, ctx, work } = session();
  work.route = "standard";
  work.phase = "conclave";
  saveWork(ctx.paths, work);
  const dir = tempDir("crew-transcript-");
  const stop = (id: string, answer: string) =>
    onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:tech-lead`,
      agent_transcript_path: transcript(dir, answer, [[100, 10, 0, 0]]),
      last_assistant_message: "Done.",
    });
  const a = stop("a", "verdict: validated\nThe QA lead, team qa, finds nothing.\n");
  const b = stop("b", "verdict: returned\nThe security lead, team security: R-1.\n");
  const folder = join(root, ".crew", "work", work.id, "conclave");
  expect(readFileSync(join(folder, "tech-lead-1.md"), "utf8")).toContain("team qa");
  expect(readFileSync(join(folder, "tech-lead-2.md"), "utf8")).toContain("team security");
  for (const team of ["qa", "security"])
    expect(existsSync(join(folder, `lead-${team}.md`))).toBe(false);
  expect(existsSync(join(folder, "tech-lead.md"))).toBe(false);
  const heading = `# <team> lead's validation of ${work.id}: <spec|plan|delivery>`;
  expect(String(a.systemMessage)).toContain(
    `tech-lead's answer has no lead heading: saved at conclave/tech-lead-1.md as no team's validation; resume the lead for an answer whose first line is ${heading}`,
  );
  expect(String(b.systemMessage)).toContain(
    "saved at conclave/tech-lead-2.md as no team's validation",
  );
  // Each resumed, still with no heading: each reply under its own name, never shared.
  stop("a", "verdict: validated\nround 2 of a\n");
  stop("b", "verdict: validated\nround 2 of b\n");
  expect(readFileSync(join(folder, "tech-lead-1-reply.md"), "utf8")).toContain("round 2 of a");
  expect(readFileSync(join(folder, "tech-lead-2-reply.md"), "utf8")).toContain("round 2 of b");
  expect(existsSync(join(folder, "tech-lead-reply.md"))).toBe(false);
  // A third round of a: its earlier reply archived beside its own reply file.
  stop("a", "verdict: validated\nround 3 of a\n");
  expect(readFileSync(join(folder, "tech-lead-1-reply.md"), "utf8")).toContain("round 3 of a");
  expect(readFileSync(join(folder, "tech-lead-1-reply.round2.md"), "utf8")).toContain(
    "round 2 of a",
  );
  // A file already standing at a number is skipped, never written over.
  writeFileSync(join(folder, "tech-lead-3.md"), "a hand-made file\n");
  stop("c", "no heading again\n");
  expect(readFileSync(join(folder, "tech-lead-3.md"), "utf8")).toBe("a hand-made file\n");
  expect(readFileSync(join(folder, "tech-lead-4.md"), "utf8")).toContain("no heading again");
  // Resumed with the heading, the lead's answer is its team's again.
  stop("a", `# qa lead's validation of ${work.id}: spec\nverdict: validated\n## Returns\n- none\n`);
  expect(readFileSync(join(folder, "lead-qa-reply.md"), "utf8")).toContain("verdict: validated");
  const roles = (loadEvidence(ctx.paths, work.id).evidence.roles ?? []).filter(
    (r) => r.agent === "tech-lead",
  );
  expect(roles.map((r) => [r.file, r.team])).toEqual([
    ["conclave/tech-lead-1.md", undefined],
    ["conclave/tech-lead-2.md", undefined],
    ["conclave/tech-lead-1-reply.round2.md", undefined],
    ["conclave/tech-lead-2-reply.md", undefined],
    ["conclave/tech-lead-1-reply.md", undefined],
    ["conclave/tech-lead-4.md", undefined],
    ["conclave/lead-qa-reply.md", "qa"],
  ]);
});
